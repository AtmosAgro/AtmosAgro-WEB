import { apiFetch } from "@/lib/api-client";

export interface SceneSummary {
  date: string;
  cloudCover: number | null;
  productId: string | null;
}

export async function listAvailableScenes(
  propriedadeId: string,
  from: string,
  to: string,
): Promise<SceneSummary[]> {
  const qs = new URLSearchParams({ from, to });
  const res = await apiFetch<{ scenes: SceneSummary[] }>(
    `/propriedades/${propriedadeId}/scenes/available?${qs.toString()}`,
  );
  return res.scenes ?? [];
}
