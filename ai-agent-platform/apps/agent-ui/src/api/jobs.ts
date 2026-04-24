import type {
  CreateJobResponse,
  JobStatusResponse,
  JobLogsResponse,
  JobReportResponse,
} from '@ai-agent/shared-types';
import { apiClient } from './client';

export async function createJob(formData: FormData): Promise<CreateJobResponse> {
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
