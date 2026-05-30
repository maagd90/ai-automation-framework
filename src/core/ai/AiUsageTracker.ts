export interface AiUsageSummary {
  provider: string;
  model?: string;
  calls: number;
  parsingCalls: number;
  namingCalls: number;
  failureAnalysisCalls: number;
}

type UsageKind = 'parsing' | 'naming' | 'failureAnalysis';

export class AiUsageTracker {
  private readonly summary: AiUsageSummary;

  constructor(provider: string, model?: string) {
    this.summary = {
      provider,
      model,
      calls: 0,
      parsingCalls: 0,
      namingCalls: 0,
      failureAnalysisCalls: 0,
    };
  }

  record(kind: UsageKind): void {
    this.summary.calls += 1;
    if (kind === 'parsing') this.summary.parsingCalls += 1;
    if (kind === 'naming') this.summary.namingCalls += 1;
    if (kind === 'failureAnalysis') this.summary.failureAnalysisCalls += 1;
  }

  snapshot(): AiUsageSummary {
    return { ...this.summary };
  }
}
