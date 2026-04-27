/** Phase 1 feature flags — all off by default for a safe public demo.
 *
 * Set the corresponding environment variable to 'true' to enable a feature.
 * These are read once at startup and remain constant for the process lifetime.
 */
export const featureFlags = {
  /** Allow non-`none` AI providers (OpenAI, Gemini, Azure, Local LLM). */
  ENABLE_AI_PROVIDERS: process.env.ENABLE_AI_PROVIDERS === 'true',

  /** Allow the `local` AI provider (Ollama / vLLM). Requires ENABLE_AI_PROVIDERS. */
  ENABLE_LOCAL_LLM: process.env.ENABLE_LOCAL_LLM === 'true',

  /** Allow trace and video capture on failure in job execution. */
  ENABLE_TRACE_VIDEO: process.env.ENABLE_TRACE_VIDEO === 'true',

  /** Allow batch uploads larger than MAX_TEST_CASES_PER_JOB. */
  ENABLE_BATCH_LARGE_UPLOAD: process.env.ENABLE_BATCH_LARGE_UPLOAD === 'true',

  /** Enable the admin panel routes (Phase 2 — not yet built). */
  ENABLE_ADMIN_PANEL: process.env.ENABLE_ADMIN_PANEL === 'true',
};
