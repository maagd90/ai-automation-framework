import { execSync } from 'child_process';
import type { ExecutionResult } from '../domain/ExecutionResult.js';
import { JsonArtifactStore } from '../storage/JsonArtifactStore.js';
import { Logger } from '../../utils/Logger.js';

export class TestExecutionService {
  private readonly store = new JsonArtifactStore();
  private readonly logger = new Logger('TestExecutionService');

  async run(specFile: string, reportDir: string): Promise<ExecutionResult> {
    const startedAt = new Date().toISOString();
    const start = Date.now();
    this.logger.info(`Running spec: ${specFile}`);

    let stdout = '';
    let stderr = '';
    let status: ExecutionResult['status'] = 'passed';

    try {
      const output = execSync(
        `npx playwright test ${specFile} --reporter=line`,
        { encoding: 'utf-8', timeout: 60000 },
      );
      stdout = output;
    } catch (err: unknown) {
      status = 'failed';
      if (err && typeof err === 'object' && 'stdout' in err) {
        stdout = String((err as { stdout?: unknown }).stdout ?? '');
        stderr = String((err as { stderr?: unknown }).stderr ?? '');
      }
    }

    const endedAt = new Date().toISOString();
    const durationMs = Date.now() - start;

    const result: ExecutionResult = {
      specFile,
      status,
      startedAt,
      endedAt,
      durationMs,
      stdout,
      stderr,
    };

    const reportPath = `${reportDir}/reports/execution-report.json`;
    this.store.save(reportPath, result);
    this.logger.info(`Execution report saved: ${reportPath}`);

    return result;
  }
}
