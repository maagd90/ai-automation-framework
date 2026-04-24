import { z } from 'zod';

export const ExecutionConfigSchema = z.object({
  framework: z.string().min(1),
  headless: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'string' ? v === 'true' : v)),
  parallelAgents: z
    .union([z.number(), z.string()])
    .transform((v) => Number(v))
    .pipe(z.number().int().min(1).max(20))
    .default(1),
  retryCount: z
    .union([z.number(), z.string()])
    .transform((v) => Number(v))
    .pipe(z.number().int().min(0).max(5))
    .default(0),
  captureEvidence: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'string' ? v === 'true' : v))
    .default(false),
});

export const AiConfigSchema = z.object({
  provider: z.enum(['openai', 'gemini', 'azure', 'local', 'none']).default('none'),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  baseUrl: z.string().url().optional().or(z.literal('')).transform((v) => v || undefined),
  usedForLocator: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'string' ? v === 'true' : v))
    .default(false),
  usedForSummary: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'string' ? v === 'true' : v))
    .default(false),
});

export const CreateJobSchema = z
  .object({
    url: z.string().url(),
  })
  .merge(ExecutionConfigSchema)
  .merge(AiConfigSchema);

export type CreateJobInput = z.infer<typeof CreateJobSchema>;
export type ExecutionConfigInput = z.infer<typeof ExecutionConfigSchema>;
export type AiConfigInput = z.infer<typeof AiConfigSchema>;
