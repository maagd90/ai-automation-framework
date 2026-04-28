import { Router } from 'express';
import os from 'os';
import { featureFlags } from '../config/feature.config';
import { runtimeConfig } from '../config/runtime.config';
import { runtimeResourceService } from '../services/RuntimeResourceService';

const router = Router();

/**
 * GET /api/config
 *
 * Returns the server-side feature flags, per-session limits, and runtime
 * resource info so the UI can conditionally show or hide sections without
 * hard-coding env vars.
 *
 * Only safe, non-sensitive values are exposed here.
 */
router.get('/', (_req, res) => {
  const detectedCpuCores = os.cpus().length;
  const detectedMemoryMb = runtimeResourceService.availableMemoryMB();

  // Compute a demo recommendation: 5 test cases, auto mode
  const demoScaling = runtimeResourceService.resolveEffectiveAgents(5, 'auto', 1);

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
    runtime: {
      autoOptimizeAgents: runtimeConfig.AUTO_OPTIMIZE_AGENTS,
      minAgents: runtimeConfig.MIN_AGENTS,
      maxGlobalAgents: runtimeConfig.MAX_GLOBAL_AGENTS,
      maxGlobalAgentsHardLimit: runtimeConfig.MAX_GLOBAL_AGENTS_HARD_LIMIT,
      maxParallelAgentsPerJob: runtimeConfig.MAX_PARALLEL_AGENTS_PER_JOB,
      maxParallelAgentsPerJobHardLimit: runtimeConfig.MAX_PARALLEL_AGENTS_PER_JOB_HARD_LIMIT,
      testCasesPerAgentTarget: runtimeConfig.TEST_CASES_PER_AGENT_TARGET,
      detectedCpuCores,
      detectedMemoryMb,
      recommendedAgentsForDemo: demoScaling.effectiveAgents,
    },
  });
});

export { router as configRouter };
