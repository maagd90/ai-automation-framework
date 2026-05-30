import fs from 'fs';
import path from 'path';
import { webwrightConfig } from './WebwrightConfig';
import { WebwrightTaskBuilder, type WebwrightTask } from './WebwrightTaskBuilder';
import { WebwrightResultParser, type ParsedWebwrightResult } from './WebwrightResultParser';
import { WebwrightFailureClassifier, type WebwrightFailureCategory } from './WebwrightFailureClassifier';
import {
  WebwrightGeneratedDataExtractor,
  type WebwrightGeneratedDataSnapshot,
} from './WebwrightGeneratedDataExtractor';
import {
  WebwrightFailureContextExtractor,
  type WebwrightFailureContext,
} from './WebwrightFailureContextExtractor';
import {
  WebwrightPageObjectMapper,
  type WebwrightPageObjectMetadata,
} from './WebwrightPageObjectMapper';
import {
  WebwrightStepReplayPlanBuilder,
  type GeneratedSpecSource,
  type WebwrightReplayPlan,
} from './WebwrightStepReplayPlanBuilder';

export interface WebwrightRepairRequest {
  jobId: string;
  targetUrl: string;
  finalDir: string;
  failedSpecPath: string;
  stdout: string;
  stderr: string;
}

export interface WebwrightRepairResult extends ParsedWebwrightResult {
  enabled: boolean;
  mode: 'repair';
  attempts: number;
  repairApplied: boolean;
  recommendationsUsed: number;
  generatedFiles: string[];
  generatedData: WebwrightGeneratedDataSnapshot;
  replayPlan: WebwrightReplayPlan;
  failureContext?: WebwrightFailureContext;
  pageObjects: WebwrightPageObjectMetadata[];
  task?: WebwrightTask;
}

function isInsideDocker(): boolean {
  return process.env.IN_DOCKER === 'true'
    || process.env.PLAYWRIGHT_BROWSERS_PATH === '/ms-playwright'
    || fs.existsSync('/.dockerenv');
}

function sanitize(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, '******')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED_API_KEY]')
    .replace(/AIza[A-Za-z0-9_-]+/g, '[REDACTED_API_KEY]')
    .slice(0, 4000);
}

function readPreview(filePath: string, maxChars = 20_000): string {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.allocUnsafe(maxChars * 4);
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    return buffer.toString('utf8', 0, bytesRead).slice(0, maxChars);
  } finally {
    fs.closeSync(fd);
  }
}

function collectGeneratedArtifacts(finalDir: string): Array<{ path: string; content: string }> {
  const root = path.join(finalDir, 'src');
  const searchDirs = ['pages', 'tests', 'test-data', 'locators'].map((sub) => path.join(root, sub));
  const files: Array<{ path: string; content: string }> = [];

  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (!/\.(ts|json)$/i.test(entry.name)) continue;
      files.push({
        path: entryPath,
        content: readPreview(entryPath),
      });
    }
  };

  for (const dir of searchDirs) {
    walk(dir);
  }

  return files;
}

function collectSpecSources(files: Array<{ path: string; content: string }>): GeneratedSpecSource[] {
  return files
    .filter((file) => file.path.endsWith('.spec.ts'))
    .map((file) => ({ filePath: file.path, source: file.content }));
}

function collectPageObjectFiles(finalDir: string): WebwrightPageObjectMetadata[] {
  return new WebwrightPageObjectMapper().collect(finalDir);
}

export class WebwrightRepairService {
  private readonly classifier = new WebwrightFailureClassifier();
  private readonly taskBuilder = new WebwrightTaskBuilder();
  private readonly parser = new WebwrightResultParser();
  private readonly generatedDataExtractor = new WebwrightGeneratedDataExtractor();
  private readonly failureContextExtractor = new WebwrightFailureContextExtractor();
  private readonly replayPlanBuilder = new WebwrightStepReplayPlanBuilder();

  shouldRepair(stdout: string, stderr: string): { category: WebwrightFailureCategory; allowed: boolean } {
    const category = this.classifier.classify(`${stdout}\n${stderr}`);
    return { category, allowed: this.classifier.shouldRepair(category) };
  }

  async repair(request: WebwrightRepairRequest): Promise<WebwrightRepairResult> {
    if (webwrightConfig.ENABLE_WEBWRIGHT !== true) {
      return this.skippedResult('Webwright is disabled', 'unknown');
    }
    if (webwrightConfig.WEBWRIGHT_DOCKER_ONLY && !isInsideDocker()) {
      return this.skippedResult('Webwright requires Docker', 'unknown');
    }

    const classifier = this.shouldRepair(request.stdout, request.stderr);
    if (!classifier.allowed) {
      return this.skippedResult(`Failure category ${classifier.category} is not eligible for repair`, classifier.category);
    }

    const jobOutputDir = path.join(webwrightConfig.WEBWRIGHT_OUTPUT_DIR, request.jobId);
    fs.mkdirSync(jobOutputDir, { recursive: true });

    const generatedFiles = collectGeneratedArtifacts(request.finalDir);
    const generatedData = this.generatedDataExtractor.extract(request.finalDir);
    const pageObjects = collectPageObjectFiles(request.finalDir);
    const specSources = collectSpecSources(generatedFiles);
    const failureContextResult = this.failureContextExtractor.extract({
      stdout: sanitize(request.stdout),
      stderr: sanitize(request.stderr),
      failedSpecPath: request.failedSpecPath,
      generatedSpecSources: specSources,
      pageObjects,
    });
    const replayPlan = this.replayPlanBuilder.buildFromSpecSources(
      specSources,
      generatedData,
      pageObjects,
      request.targetUrl,
    );
    const task = this.taskBuilder.buildRepairTask({
      targetUrl: request.targetUrl,
      failedSpecPath: request.failedSpecPath,
      failureCategory: classifier.category,
      summary: `Generated test failed with ${classifier.category} issues`,
      stdout: sanitize(request.stdout),
      stderr: sanitize(request.stderr),
      generatedFiles: generatedFiles.map((file) => file.path),
      pageObjects: pageObjects.map((pageObject) => pageObject.className),
      generatedData,
      replayPlan,
      failureContext: failureContextResult.failureContext,
      pageObjectsMetadata: pageObjects,
    });

    const input = {
      jobId: request.jobId,
      outputDir: jobOutputDir,
      task,
      targetUrl: request.targetUrl,
      failedSpecPath: request.failedSpecPath,
      failureCategory: classifier.category,
      generatedFiles,
      generatedData,
      replayPlan,
      failureContext: failureContextResult.failureContext,
      pageObjects,
      stdout: sanitize(request.stdout),
      stderr: sanitize(request.stderr),
      timeoutSeconds: webwrightConfig.WEBWRIGHT_TIMEOUT_SECONDS,
      allowedDomains: webwrightConfig.WEBWRIGHT_ALLOWED_DOMAINS
        ? webwrightConfig.WEBWRIGHT_ALLOWED_DOMAINS.split(',').map((domain) => domain.trim()).filter(Boolean)
        : [],
    };

    const inputFile = path.join(jobOutputDir, 'input.json');
    fs.writeFileSync(inputFile, JSON.stringify(input, null, 2), 'utf8');

    let parsed: ParsedWebwrightResult;
    try {
      const raw = await this.postToSidecar(input);
      parsed = this.parser.parse(raw);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ...this.skippedResult(`Webwright repair failed: ${message}`, classifier.category),
        enabled: true,
        status: 'failed',
        generatedData,
        replayPlan,
        failureContext: failureContextResult.failureContext,
        pageObjects,
        task,
      };
    }

    return {
      ...parsed,
      enabled: true,
      mode: 'repair',
      attempts: 1,
      repairApplied: parsed.suggestedLocators.length > 0 || parsed.suggestedAssertions.length > 0,
      recommendationsUsed: parsed.suggestedLocators.length + parsed.suggestedAssertions.length,
      generatedFiles: generatedFiles.map((file) => file.path),
      generatedData,
      replayPlan,
      failureContext: failureContextResult.failureContext,
      pageObjects,
      task,
    };
  }

  private skippedResult(
    summary: string,
    failureCategory: WebwrightFailureCategory,
  ): WebwrightRepairResult {
    return {
      status: 'failed',
      failureCategory,
      summary,
      suggestedLocators: [],
      suggestedAssertions: [],
      patchSuggestions: [],
      warnings: [summary],
      screenshots: [],
      recommendedLocators: [],
      recommendedAssertions: [],
      discoveredPages: [],
      repairSuggestions: [],
      enabled: false,
      mode: 'repair',
      attempts: 0,
      repairApplied: false,
      recommendationsUsed: 0,
      generatedFiles: [],
      generatedData: { credentials: { validUser: {}, invalidUser: {} }, inputs: {}, warnings: [], sourceFiles: [] },
      replayPlan: { steps: [], warnings: [] },
      pageObjects: [],
      task: undefined,
    };
  }

  private async postToSidecar(payload: unknown): Promise<string> {
    const controller = new AbortController();
    const timeoutMs = webwrightConfig.WEBWRIGHT_TIMEOUT_SECONDS * 1000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${webwrightConfig.WEBWRIGHT_SERVICE_URL}/repair`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const body = await response.text();
      if (!response.ok) {
        throw new Error(body || `Webwright sidecar returned HTTP ${response.status}`);
      }
      return body;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Webwright sidecar request failed: ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
