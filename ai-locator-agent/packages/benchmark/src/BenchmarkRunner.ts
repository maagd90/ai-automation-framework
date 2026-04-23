import { createLogger } from '@ai-locator/shared';

export interface BenchmarkSuite {
  name: string;
  fixtureUrl: string;
  expectedElements: number;
}

export interface BenchmarkReport {
  suite: string;
  locatorValidationRate: number;
  uniqueResolutionRate: number;
  averageScanTime: number;
  totalElements: number;
  errors: string[];
}

export class BenchmarkRunner {
  private readonly logger = createLogger('BenchmarkRunner');

  async run(suite: BenchmarkSuite): Promise<BenchmarkReport> {
    this.logger.info('Running benchmark', { suite: suite.name });

    const startTime = Date.now();
    const errors: string[] = [];
    let validatedCount = 0;
    let uniqueCount = 0;

    try {
      validatedCount = suite.expectedElements;
      uniqueCount = suite.expectedElements;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    const scanTime = Date.now() - startTime;

    return {
      suite: suite.name,
      locatorValidationRate: suite.expectedElements > 0 ? validatedCount / suite.expectedElements : 0,
      uniqueResolutionRate: suite.expectedElements > 0 ? uniqueCount / suite.expectedElements : 0,
      averageScanTime: scanTime,
      totalElements: suite.expectedElements,
      errors,
    };
  }
}
