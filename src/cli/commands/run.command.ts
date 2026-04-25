import { TestExecutionService } from '../../core/executor/TestExecutionService.js';
import { ExecutionReportService } from '../../core/reporting/ExecutionReportService.js';
import { Logger } from '../../utils/Logger.js';

export class RunCommand {
  private readonly logger = new Logger('RunCommand');

  async execute(specFile: string, outputDir: string): Promise<void> {
    this.logger.info('Starting run command', { specFile });
    const executor = new TestExecutionService();
    const reporter = new ExecutionReportService();
    const result = await executor.run(specFile, outputDir);
    reporter.print(result);
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'passed') {
      process.exit(1);
    }
  }
}
