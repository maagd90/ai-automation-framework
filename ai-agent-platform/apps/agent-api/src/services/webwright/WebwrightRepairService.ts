import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { webwrightConfig } from './WebwrightConfig';
import { WebwrightTaskBuilder } from './WebwrightTaskBuilder';
import { WebwrightResultParser, type ParsedWebwrightResult } from './WebwrightResultParser';
import { WebwrightFailureClassifier, type WebwrightFailureCategory } from './WebwrightFailureClassifier';

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
}

const THIS_DIR = __dirname;
const SIDECAR_RUNNER = path.resolve(THIS_DIR, '../../../../../../webwright-sidecar/runner.py');

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

function collectGeneratedFiles(finalDir: string): Array<{ path: string; content: string }> {
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

export class WebwrightRepairService {
  private readonly classifier = new WebwrightFailureClassifier();
  private readonly taskBuilder = new WebwrightTaskBuilder();
  private readonly parser = new WebwrightResultParser();

  shouldRepair(stdout: string, stderr: string): { category: WebwrightFailureCategory; allowed: boolean } {
    const category = this.classifier.classify(`${stdout}\n${stderr}`);
    return { category, allowed: this.classifier.shouldRepair(category) };
  }

  async repair(request: WebwrightRepairRequest): Promise<WebwrightRepairResult> {
    if (webwrightConfig.ENABLE_WEBWRIGHT !== true) {
      return this.skippedResult('Webwright is disabled', request, 'unknown');
    }
    if (webwrightConfig.WEBWRIGHT_DOCKER_ONLY && !isInsideDocker()) {
      return this.skippedResult('Webwright requires Docker', request, 'unknown');
    }

    const classifier = this.shouldRepair(request.stdout, request.stderr);
    if (!classifier.allowed) {
      return this.skippedResult(`Failure category ${classifier.category} is not eligible for repair`, request, classifier.category);
    }

    const jobOutputDir = path.join(webwrightConfig.WEBWRIGHT_OUTPUT_DIR, request.jobId);
    fs.mkdirSync(jobOutputDir, { recursive: true });

    const generatedFiles = collectGeneratedFiles(request.finalDir);
    const pageObjects = generatedFiles
      .filter((file) => file.path.includes(`${path.sep}pages${path.sep}`))
      .map((file) => path.basename(file.path, '.ts'));

    const input = {
      task: this.taskBuilder.buildRepairTask({
        targetUrl: request.targetUrl,
        failedSpecPath: request.failedSpecPath,
        failureCategory: classifier.category,
        summary: `Generated test failed with ${classifier.category} issues`,
        stdout: sanitize(request.stdout),
        stderr: sanitize(request.stderr),
        generatedFiles: generatedFiles.map((file) => file.path),
        pageObjects,
      }),
      targetUrl: request.targetUrl,
      failedSpecPath: request.failedSpecPath,
      failureCategory: classifier.category,
      generatedFiles,
      stdout: sanitize(request.stdout),
      stderr: sanitize(request.stderr),
      timeoutSeconds: webwrightConfig.WEBWRIGHT_TIMEOUT_SECONDS,
      allowedDomains: webwrightConfig.WEBWRIGHT_ALLOWED_DOMAINS
        ? webwrightConfig.WEBWRIGHT_ALLOWED_DOMAINS.split(',').map((domain) => domain.trim()).filter(Boolean)
        : [],
    };

    const inputFile = path.join(jobOutputDir, 'input.json');
    fs.writeFileSync(inputFile, JSON.stringify(input, null, 2), 'utf8');

    const raw = await this.spawnSidecar(inputFile, jobOutputDir);
    const parsed = this.parser.parse(raw);

    return {
      ...parsed,
      enabled: true,
      mode: 'repair',
      attempts: 1,
      repairApplied: parsed.suggestedLocators.length > 0 || parsed.suggestedAssertions.length > 0,
      recommendationsUsed: parsed.suggestedLocators.length + parsed.suggestedAssertions.length,
      generatedFiles: generatedFiles.map((file) => file.path),
    };
  }

  private skippedResult(
    summary: string,
    request: WebwrightRepairRequest,
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
    };
  }

  private spawnSidecar(inputFile: string, outputDir: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeoutMs = webwrightConfig.WEBWRIGHT_TIMEOUT_SECONDS * 1000;
      const child = spawn('python3', [SIDECAR_RUNNER, '--input', inputFile, '--output-dir', outputDir], {
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Webwright sidecar timed out after ${webwrightConfig.WEBWRIGHT_TIMEOUT_SECONDS}s`));
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(stderr.slice(-1000) || `Sidecar exited with code ${code ?? 'null'}`));
          return;
        }
        const outputFile = path.join(outputDir, 'result.json');
        if (fs.existsSync(outputFile)) {
          resolve(fs.readFileSync(outputFile, 'utf8'));
          return;
        }
        resolve(stdout);
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}
