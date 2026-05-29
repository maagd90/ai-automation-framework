import type {
  CreateJobResponse,
  JobStatusResponse,
  JobLogsResponse,
  JobReportResponse,
  AiProvider,
  ExecutionMode,
  AllocationMode,
} from '@ai-agent/shared-types';
import { apiClient } from './client';

export interface CreateJobParams {
  file: File;
  url: string;
  framework: string;
  executionMode: ExecutionMode;
  allocationMode: AllocationMode;
  headless: boolean;
  parallelAgents: number;
  retryCount: number;
  screenshotOnFailure: boolean;
  traceOnFailure: boolean;
  videoOnFailure: boolean;
  enableWebwright: boolean;
  provider: AiProvider;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  usedForParsing?: boolean;
  usedForNaming?: boolean;
  usedForFailureAnalysis?: boolean;
  maxTestCasesForJob?: number;
}

export async function createJob(params: CreateJobParams): Promise<CreateJobResponse> {
  await apiClient.get('/health', { timeout: 5000 });

  const formData = new FormData();
  formData.append('file', params.file);
  formData.append('url', params.url.trim());
  formData.append('framework', params.framework);
  formData.append('executionMode', params.executionMode);
  formData.append('allocationMode', params.allocationMode);
  formData.append('headless', String(params.headless));
  formData.append('parallelAgents', String(params.parallelAgents));
  formData.append('retryCount', String(params.retryCount));
  formData.append('screenshotOnFailure', String(params.screenshotOnFailure));
  formData.append('traceOnFailure', String(params.traceOnFailure));
  formData.append('videoOnFailure', String(params.videoOnFailure));
  formData.append('enableWebwright', String(params.enableWebwright));
  formData.append('provider', params.provider);
  if (params.apiKey) formData.append('apiKey', params.apiKey);
  if (params.model) formData.append('model', params.model);
  if (params.baseUrl) formData.append('baseUrl', params.baseUrl.trim());
  formData.append('usedForParsing', String(params.usedForParsing ?? false));
  formData.append('usedForNaming', String(params.usedForNaming ?? false));
  formData.append('usedForFailureAnalysis', String(params.usedForFailureAnalysis ?? false));
  if (params.maxTestCasesForJob !== undefined) {
    formData.append('maxTestCasesForJob', String(params.maxTestCasesForJob));
  }

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
