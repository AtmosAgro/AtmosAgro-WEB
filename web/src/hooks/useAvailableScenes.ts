import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth } from "date-fns";

import { listAvailableScenes, type SceneSummary } from "@/services/scenes";

const ISO = "yyyy-MM-dd";

export type CloudBucket = "low" | "partial" | "cloudy" | "unknown";

export function bucketCloudCover(cloud: number | null | undefined): CloudBucket {
  if (cloud === null || cloud === undefined) return "unknown";
  if (cloud <= 30) return "low";
  if (cloud <= 70) return "partial";
  return "cloudy";
}

export function useAvailableScenes(propriedadeId: string | null, visibleMonth: Date) {
  const range = useMemo(() => {
    const from = format(startOfMonth(visibleMonth), ISO);
    const to = format(endOfMonth(visibleMonth), ISO);
    return { from, to };
  }, [visibleMonth]);

  const query = useQuery({
    queryKey: ["scenes", propriedadeId, range.from, range.to],
    queryFn: () => listAvailableScenes(propriedadeId as string, range.from, range.to),
    enabled: !!propriedadeId,
    staleTime: 5 * 60 * 1000,
  });

  const buckets = useMemo(() => {
    const low = new Set<string>();
    const partial = new Set<string>();
    const cloudy = new Set<string>();
    const unknown = new Set<string>();
    for (const s of query.data ?? []) {
      if (!s.date) continue;
      switch (bucketCloudCover(s.cloudCover)) {
        case "low":
          low.add(s.date);
          break;
        case "partial":
          partial.add(s.date);
          break;
        case "cloudy":
          cloudy.add(s.date);
          break;
        default:
          unknown.add(s.date);
      }
    }
    return { low, partial, cloudy, unknown };
  }, [query.data]);

  return {
    downloadableLow: buckets.low,
    downloadablePartial: buckets.partial,
    downloadableCloudy: buckets.cloudy,
    downloadableUnknown: buckets.unknown,
    scenes: (query.data ?? []) as SceneSummary[],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
