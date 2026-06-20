import type { TestCaseBatch, TestStep } from '@ai-agent/shared-types';
import { StepNormalizer, type NormalizedIntent, type NormalizationConfidence } from './StepNormalizer';

export interface NormalizationWarning {
  field: string;
  message: string;
  confidence?: NormalizationConfidence;
}

export type AiStepInferFn = (description: string) => Promise<NormalizedIntent | undefined>;

type EnrichedStep = TestStep & {
  inferred?: boolean;
  confidence?: NormalizationConfidence;
};

export class BatchNormalizer {
  private readonly normalizer = new StepNormalizer();

  async normalizeBatch(
    batch: TestCaseBatch,
    options?: { aiInfer?: AiStepInferFn },
  ): Promise<{ batch: TestCaseBatch; warnings: NormalizationWarning[] }> {
    const warnings: NormalizationWarning[] = [];
    const testCases = [];

    for (let i = 0; i < batch.testCases.length; i++) {
      const tc = batch.testCases[i];
      const normalizedSteps: TestStep[] = [];

      for (let j = 0; j < tc.steps.length; j++) {
        let enriched: EnrichedStep = this.normalizer.normalizeStep(tc.steps[j]);

        if (
          options?.aiInfer &&
          enriched.inferred &&
          (enriched.confidence === 'low' || enriched.confidence === 'medium')
        ) {
          const source = enriched.description ?? String(enriched.action);
          const aiIntent = await options.aiInfer(source);
          if (aiIntent) {
            enriched = {
              ...enriched,
              action: aiIntent.action,
              target: aiIntent.target ?? enriched.target,
              value: aiIntent.value ?? enriched.value,
              confidence: aiIntent.confidence,
              inferred: true,
            };
          }
        }

        if (enriched.inferred) {
          warnings.push({
            field: `testCases[${i}].steps[${j}]`,
            message: `Inferred action "${enriched.action}" from: ${enriched.description ?? enriched.target ?? ''}`,
            confidence: enriched.confidence,
          });
        }

        normalizedSteps.push({
          order: enriched.order,
          action: enriched.action,
          target: enriched.target,
          value: enriched.value,
          expected: enriched.expected,
          description: enriched.description,
        });
      }

      testCases.push({ ...tc, steps: normalizedSteps });
    }

    return { batch: { ...batch, testCases }, warnings };
  }

  normalizeBatchSync(batch: TestCaseBatch): { batch: TestCaseBatch; warnings: NormalizationWarning[] } {
    const warnings: NormalizationWarning[] = [];
    const testCases = batch.testCases.map((tc, i) => ({
      ...tc,
      steps: tc.steps.map((step, j) => {
        const enriched: EnrichedStep = this.normalizer.normalizeStep(step);
        if (enriched.inferred) {
          warnings.push({
            field: `testCases[${i}].steps[${j}]`,
            message: `Inferred action "${enriched.action}" from: ${enriched.description ?? enriched.target ?? ''}`,
            confidence: enriched.confidence,
          });
        }
        return {
          order: enriched.order,
          action: enriched.action,
          target: enriched.target,
          value: enriched.value,
          expected: enriched.expected,
          description: enriched.description,
        };
      }),
    }));

    return { batch: { ...batch, testCases }, warnings };
  }
}

export const batchNormalizer = new BatchNormalizer();
