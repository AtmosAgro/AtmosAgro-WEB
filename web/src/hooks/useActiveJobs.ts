import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { listJobs, type JobResponse } from "@/services/jobs";

const POLL_INTERVAL_MS = 5000;

function extractSingleDayDate(job: JobResponse): string | null {
  const start = job.parametros?.dateRange?.start;
  const end = job.parametros?.dateRange?.end;
  if (!start || !end || start !== end) return null;
  return start;
}

export function useActiveJobs(propriedadeId: string | null) {
  const query = useQuery({
    queryKey: ["active-jobs", propriedadeId],
    queryFn: () => listJobs(propriedadeId as string),
    enabled: !!propriedadeId,
    refetchInterval: (q) => {
      const data = q.state.data as JobResponse[] | undefined;
      const hasActive = (data ?? []).some(
        (j) => j.status === "pending" || j.status === "running",
      );
      return hasActive ? POLL_INTERVAL_MS : false;
    },
    refetchIntervalInBackground: false,
    staleTime: POLL_INTERVAL_MS / 2,
  });

  const processingDates = useMemo(() => {
    const set = new Set<string>();
    for (const job of query.data ?? []) {
      if (job.status !== "pending" && job.status !== "running") continue;
      const date = extractSingleDayDate(job);
      if (date) set.add(date);
    }
    return set;
  }, [query.data]);

  return {
    processingDates,
    activeJobs: (query.data ?? []).filter(
      (j) => j.status === "pending" || j.status === "running",
    ),
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
