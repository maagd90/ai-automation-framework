import fs from 'fs';
import path from 'path';
import type { RepairAttempt, TestCaseResult } from '@ai-agent/shared-types';
import type { AiConfig } from '@ai-agent/shared-types';
import { MergeValidationService } from './MergeValidationService';
import { analyzeFailureWithAi } from '../AiFailureAnalysisService';

export interface RepairPatch {
  file: string;
  methodName: string;
  change: 'locator' | 'wait' | 'assertion';
  before: string;
  after: string;
  confidence: number;
}

export interface RepairCycleResult {
  patches: RepairPatch[];
  attempts: RepairAttempt[];
  exitCode: number;
  executionResults: TestCaseResult[];
}

const MIN_PATCH_CONFIDENCE = 0.65;

export class PlaywrightRepairSidecar {
  private readonly validator = new MergeValidationService();

  classifyFailure(errorMessage: string): string {
    const msg = errorMessage.toLowerCase();
    if (msg.includes('timeout') || msg.includes('waiting for locator') || msg.includes('strict mode')) {
      return 'locator';
    }
    if (msg.includes('expect') || msg.includes('tobevisible') || msg.includes('tohavetext')) {
      return 'assertion';
    }
    if (msg.includes('goto') || msg.includes('navigation')) {
      return 'navigation';
    }
    if (msg.includes('networkidle') || msg.includes('timed out')) {
      return 'timing';
    }
    return 'unknown';
  }

  proposeLocatorPatch(finalDir: string, errorMessage: string): RepairPatch | undefined {
    const pagesDir = path.join(finalDir, 'pages');
    if (!fs.existsSync(pagesDir)) return undefined;

    const labelMatch = errorMessage.match(/getByLabel\(['"]([^'"]+)['"]\)/);
    const roleMatch = errorMessage.match(/getByRole\(['"]([^'"]+)['"]/);
    const targetHint = labelMatch?.[1] ?? roleMatch?.[1];

    for (const file of fs.readdirSync(pagesDir).filter((f) => f.endsWith('.ts') && f !== 'BasePage.ts')) {
      const filePath = path.join(pagesDir, file);
      const content = fs.readFileSync(filePath, 'utf8');

      if (targetHint && content.includes(`getByLabel(${JSON.stringify(targetHint)})`)) {
        const before = `getByLabel(${JSON.stringify(targetHint)})`;
        const after = `getByLabel(${JSON.stringify(targetHint)}).or(this.page.getByPlaceholder(${JSON.stringify(targetHint)}))`;
        if (content.includes(after)) continue;
        return {
          file: path.relative(finalDir, filePath),
          methodName: 'locator',
          change: 'locator',
          before,
          after,
          confidence: 0.7,
        };
      }

      if (content.includes("waitForLoadState('networkidle')")) {
        const before = "waitForLoadState('networkidle')";
        const after = "waitForLoadState('domcontentloaded')";
        return {
          file: path.relative(finalDir, filePath),
          methodName: 'goto',
          change: 'wait',
          before,
          after,
          confidence: 0.68,
        };
      }
    }

    return undefined;
  }

  applyPatch(finalDir: string, patch: RepairPatch): boolean {
    const filePath = path.join(finalDir, patch.file);
    if (!fs.existsSync(filePath)) return false;
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes(patch.before)) return false;
    fs.writeFileSync(filePath, content.replace(patch.before, patch.after), 'utf8');
    return true;
  }

  async repairFailedTests(params: {
    finalDir: string;
    failedResults: TestCaseResult[];
    aiConfig?: AiConfig;
    runTests: (specFilter?: string[]) => Promise<number>;
    parseReport: () => TestCaseResult[];
    log: (msg: string) => void;
    maxAttempts?: number;
  }): Promise<RepairCycleResult> {
    const maxAttempts = params.maxAttempts ?? 2;
    const allAttempts: RepairAttempt[] = [];
    const allPatches: RepairPatch[] = [];
    let exitCode = 1;
    let executionResults = params.failedResults;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const failed = executionResults.filter((r) => r.executionStatus === 'failed');
      if (failed.length === 0) {
        exitCode = 0;
        break;
      }

      params.log(`Repair sidecar attempt ${attempt}/${maxAttempts} for ${failed.length} failed case(s)…`);
      let patchedAny = false;

      for (const result of failed) {
        const errorMsg = result.error ?? '';
        const failureType = this.classifyFailure(errorMsg);

        const aiAnalysis = await analyzeFailureWithAi(params.aiConfig, {
          errorMessage: errorMsg,
          testCaseId: result.id,
        });

        const suggestion = aiAnalysis?.suggestion ?? `Classified as ${failureType} failure`;
        const patch = this.proposeLocatorPatch(params.finalDir, errorMsg);
        const confidence = patch?.confidence ?? aiAnalysis?.confidence ?? 0;

        const attemptRecord: RepairAttempt = {
          attempt,
          failureType: aiAnalysis?.failureType ?? failureType,
          suggestion,
          patched: false,
          filesChanged: [],
        };

        if (patch && confidence >= MIN_PATCH_CONFIDENCE) {
          const applied = this.applyPatch(params.finalDir, patch);
          if (applied) {
            patchedAny = true;
            allPatches.push(patch);
            attemptRecord.patched = true;
            attemptRecord.filesChanged = [patch.file];
            attemptRecord.diff = `${patch.before} → ${patch.after}`;
            params.log(`Applied patch to ${patch.file}`);
          }
        } else {
          params.log(`Suggestion for ${result.id}: ${suggestion}`);
        }

        allAttempts.push(attemptRecord);
        result.repairAttempts = [...(result.repairAttempts ?? []), attemptRecord];
      }

      if (!patchedAny) {
        params.log('No patches applied — stopping repair loop');
        break;
      }

      const validation = this.validator.validate(params.finalDir);
      if (!validation.valid) {
        params.log(`Post-patch validation failed: ${validation.errors.join('; ')}`);
        break;
      }

      const dryRun = this.validator.dryRunPlaywright(params.finalDir);
      if (!dryRun.valid) {
        params.log(`Post-patch Playwright list failed: ${dryRun.errors.join('; ')}`);
        break;
      }

      const failedIds = failed.map((r) => r.id.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
      exitCode = await params.runTests(failedIds);
      executionResults = params.parseReport();

      for (const prev of failed) {
        const updated = executionResults.find((r) => r.id === prev.id);
        if (updated) {
          updated.repairAttempts = prev.repairAttempts;
          updated.inputSteps = prev.inputSteps;
        }
      }

      if (exitCode === 0) {
        params.log('Repair rerun passed');
        break;
      }
    }

    return { patches: allPatches, attempts: allAttempts, exitCode, executionResults };
  }
}

export const playwrightRepairSidecar = new PlaywrightRepairSidecar();
