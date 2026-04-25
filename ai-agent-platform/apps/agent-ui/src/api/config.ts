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
  maxDailyJobsPerIp: number;
}

export interface ServerConfig {
  features: ServerFeatureFlags;
  limits: ServerLimits;
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
    maxTestCasesPerJob: 10,
    maxDailyJobsPerIp: 20,
  },
};

export async function fetchServerConfig(): Promise<ServerConfig> {
  const { data } = await apiClient.get<ServerConfig>('/config');
  return data;
}
