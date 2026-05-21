import { apiFetch } from "@/lib/api-client";

export interface JobResponse {
  id: string;
  status: "pending" | "running" | "succeeded" | "failed";
  propriedadeId: string | null;
  erroMensagem: string | null;
  createdAt: string | null;
  iniciadoEm: string | null;
  finalizadoEm: string | null;
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
