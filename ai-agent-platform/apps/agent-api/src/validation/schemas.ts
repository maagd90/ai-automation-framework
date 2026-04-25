import { z } from 'zod';

export const ExecutionConfigSchema = z.object({
  framework: z.string().min(1).default('playwright-ts'),
  executionMode: z
    .enum(['generate-only', 'generate-and-execute'])
    .default('generate-only'),
  headless: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'string' ? v === 'true' : v))
    .default(true),
  parallelAgents: z
    .union([z.number(), z.string()])
    .transform((v) => Number(v))
    .pipe(z.number().int().min(1).max(10))
    .default(2),
  retryCount: z
    .union([z.number(), z.string()])
    .transform((v) => Number(v))
    .pipe(z.number().int().min(0).max(2))
    .default(0),
  screenshotOnFailure: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'string' ? v === 'true' : v))
    .default(true),
  traceOnFailure: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'string' ? v === 'true' : v))
    .default(false),
  videoOnFailure: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'string' ? v === 'true' : v))
    .default(false),
});

export const AiConfigSchema = z.object({
  provider: z.enum(['openai', 'gemini', 'azure', 'local', 'none']).default('none'),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  baseUrl: z.string().url().optional().or(z.literal('')).transform((v) => v || undefined),
  usedForParsing: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'string' ? v === 'true' : v))
    .default(false),
  usedForNaming: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'string' ? v === 'true' : v))
    .default(false),
  usedForFailureAnalysis: z
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
