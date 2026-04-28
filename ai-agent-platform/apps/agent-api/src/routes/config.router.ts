import { Router } from 'express';
import { featureFlags } from '../config/feature.config';
import { runtimeConfig } from '../config/runtime.config';

const router = Router();

/**
 * GET /api/config
 *
 * Returns the server-side feature flags and per-session limits so the UI can
 * conditionally show or hide sections without hard-coding env vars.
 *
 * Only safe, non-sensitive values are exposed here.
 */
router.get('/', (_req, res) => {
  res.json({
    features: {
      aiProviders: featureFlags.ENABLE_AI_PROVIDERS,
      localLlm: featureFlags.ENABLE_LOCAL_LLM,
      traceVideo: featureFlags.ENABLE_TRACE_VIDEO,
      batchLargeUpload: featureFlags.ENABLE_BATCH_LARGE_UPLOAD,
      adminPanel: featureFlags.ENABLE_ADMIN_PANEL,
    },
    limits: {
      maxTestCasesPerJob: runtimeConfig.MAX_TEST_CASES_PER_JOB,
      maxTestCasesHardLimit: runtimeConfig.MAX_TEST_CASES_HARD_LIMIT,
      maxDailyJobsPerIp: runtimeConfig.MAX_DAILY_JOBS_PER_IP,
    },
  });
});

export { router as configRouter };
