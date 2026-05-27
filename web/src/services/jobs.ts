import { apiFetch } from "@/lib/api-client";

export interface JobResponse {
  id: string;
  status: "pending" | "running" | "succeeded" | "failed";
  propriedadeId: string | null;
  erroMensagem: string | null;
  createdAt: string | null;
  iniciadoEm: string | null;
  finalizadoEm: string | null;
  parametros?: {
    dateRange?: { start?: string; end?: string };
    indices?: string[];
    cloudCoverMax?: number;
    batch?: boolean;
  } | null;
}

export type CloudBucket = "low" | "partial" | "cloudy";

export interface CreateBatchJobsDto {
  from: string;
  to: string;
  cloudBuckets: CloudBucket[];
  indices?: string[];
}

export interface CreateBatchJobsResponse {
  created: number;
  skippedExisting: number;
  skippedRunning: number;
  skippedMonthsNotFetched: string[];
  jobIds: string[];
}

export async function createJob(
  propriedadeId: string,
  dateRange: { start: string; end: string },
  indices: string[] = ["ndvi", "ndwi"],
  cloudCoverMax = 30
): Promise<JobResponse> {
  return apiFetch<JobResponse>("/jobs", {
    method: "POST",
    body: JSON.stringify({ propriedadeId, dateRange, indices, cloudCoverMax }),
  });
}

export async function getJob(jobId: string): Promise<JobResponse> {
  return apiFetch<JobResponse>(`/jobs/${jobId}`);
}

export async function listJobs(propriedadeId?: string): Promise<JobResponse[]> {
  const qs = propriedadeId ? `?propriedadeId=${encodeURIComponent(propriedadeId)}` : "";
  return apiFetch<JobResponse[]>(`/jobs${qs}`);
}

export async function createBatchJobs(
  propriedadeId: string,
  dto: CreateBatchJobsDto,
): Promise<CreateBatchJobsResponse> {
  return apiFetch<CreateBatchJobsResponse>(`/propriedades/${propriedadeId}/jobs/batch`, {
    method: "POST",
    body: JSON.stringify(dto),
  });
}
