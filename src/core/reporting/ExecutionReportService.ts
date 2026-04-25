import type { ExecutionResult } from '../domain/ExecutionResult.js';
import { Logger } from '../../utils/Logger.js';

export class ExecutionReportService {
  private readonly logger = new Logger('ExecutionReportService');

  print(result: ExecutionResult): void {
    this.logger.info('=== Execution Report ===');
    this.logger.info(`Spec: ${result.specFile}`);
    this.logger.info(`Status: ${result.status}`);
    this.logger.info(`Duration: ${result.durationMs}ms`);
    if (result.stderr) {
      this.logger.info(`Stderr: ${result.stderr.slice(0, 500)}`);
    }
  }
}
