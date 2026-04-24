import type {
  CreateJobResponse,
  JobStatusResponse,
  JobLogsResponse,
  JobReportResponse,
  AiProvider,
} from '@ai-agent/shared-types';
import { apiClient } from './client';

export interface CreateJobParams {
  file: File;
  url: string;
  framework: string;
  headless: boolean;
  parallelAgents: number;
  retryCount: number;
  captureEvidence: boolean;
  provider: AiProvider;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  usedForLocator?: boolean;
  usedForSummary?: boolean;
}

export async function createJob(params: CreateJobParams): Promise<CreateJobResponse> {
  const formData = new FormData();
  formData.append('file', params.file);
  formData.append('url', params.url);
  formData.append('framework', params.framework);
  formData.append('headless', String(params.headless));
  formData.append('parallelAgents', String(params.parallelAgents));
  formData.append('retryCount', String(params.retryCount));
  formData.append('captureEvidence', String(params.captureEvidence));
  formData.append('provider', params.provider);
  if (params.apiKey) formData.append('apiKey', params.apiKey);
  if (params.model) formData.append('model', params.model);
  if (params.baseUrl) formData.append('baseUrl', params.baseUrl);
  formData.append('usedForLocator', String(params.usedForLocator ?? false));
  formData.append('usedForSummary', String(params.usedForSummary ?? false));

  const { data } = await apiClient.post<CreateJobResponse>('/jobs', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  const { data } = await apiClient.get<JobStatusResponse>(`/jobs/${jobId}/status`);
  return data;
}

export async function getJobLogs(jobId: string): Promise<JobLogsResponse> {
  const { data } = await apiClient.get<JobLogsResponse>(`/jobs/${jobId}/logs`);
  return data;
}

export async function getJobReport(jobId: string): Promise<JobReportResponse> {
  const { data } = await apiClient.get<JobReportResponse>(`/jobs/${jobId}/report`);
  return data;
}

export function getDownloadUrl(jobId: string): string {
  return `/api/jobs/${jobId}/download`;
}
