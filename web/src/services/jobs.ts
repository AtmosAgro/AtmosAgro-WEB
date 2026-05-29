import { apiFetch } from "@/lib/api-client";

export type JobStatus = "pending" | "running" | "succeeded" | "failed";

export interface JobResponse {
  id: string;
  status: JobStatus;
  propriedadeId: string | null;
  propriedadeNome?: string | null;
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

export interface ListJobsFilters {
  status?: JobStatus[];
  propriedadeId?: string;
  from?: string;
  to?: string;
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

export async function listJobs(filters: ListJobsFilters | string = {}): Promise<JobResponse[]> {
  // Backward-compat: callers antigos passavam só propriedadeId como string.
  const f: ListJobsFilters = typeof filters === "string" ? { propriedadeId: filters } : filters;
  const params = new URLSearchParams();
  if (f.propriedadeId) params.set("propriedadeId", f.propriedadeId);
  if (f.status && f.status.length > 0) params.set("status", f.status.join(","));
  if (f.from) params.set("from", f.from);
  if (f.to) params.set("to", f.to);
  const qs = params.toString();
  return apiFetch<JobResponse[]>(`/jobs${qs ? `?${qs}` : ""}`);
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
