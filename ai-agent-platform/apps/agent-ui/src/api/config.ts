import { apiClient } from './client';

export interface ServerFeatureFlags {
  aiProviders: boolean;
  localLlm: boolean;
  traceVideo: boolean;
  batchLargeUpload: boolean;
  adminPanel: boolean;
}

export interface ServerLimits {
  maxTestCasesPerJob: number;
  maxTestCasesHardLimit: number;
  maxDailyJobsPerIp: number;
}

export interface ServerRuntimeConfig {
  autoOptimizeAgents: boolean;
  minAgents: number;
  maxGlobalAgents: number;
  maxGlobalAgentsHardLimit: number;
  maxParallelAgentsPerJob: number;
  maxParallelAgentsPerJobHardLimit: number;
  testCasesPerAgentTarget: number;
  detectedCpuCores: number;
  detectedMemoryMb: number;
  recommendedAgentsForDemo: number;
}

export interface ServerConfig {
  features: ServerFeatureFlags;
  limits: ServerLimits;
  runtime: ServerRuntimeConfig;
}

/** Phase 1 demo-safe defaults — used before the API responds or on error. */
export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  features: {
    aiProviders: false,
    localLlm: false,
    traceVideo: false,
    batchLargeUpload: false,
    adminPanel: false,
  },
  limits: {
    maxTestCasesPerJob: 5,
    maxTestCasesHardLimit: 20,
    maxDailyJobsPerIp: 20,
  },
  runtime: {
    autoOptimizeAgents: true,
    minAgents: 1,
    maxGlobalAgents: 1,
    maxGlobalAgentsHardLimit: 4,
    maxParallelAgentsPerJob: 1,
    maxParallelAgentsPerJobHardLimit: 4,
    testCasesPerAgentTarget: 5,
    detectedCpuCores: 1,
    detectedMemoryMb: 1024,
    recommendedAgentsForDemo: 1,
  },
};

export async function fetchServerConfig(): Promise<ServerConfig> {
  const { data } = await apiClient.get<ServerConfig>('/config');
  return data;
}
