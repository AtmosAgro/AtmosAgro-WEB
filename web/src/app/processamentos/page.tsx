"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  History,
  Loader2,
  XCircle,
} from "lucide-react";

import { Layout } from "@/components/Layout";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

import { JobDetailSheet } from "@/components/JobDetailSheet";
import { listJobs, type JobResponse, type JobStatus } from "@/services/jobs";
import { listPropriedades } from "@/services/propriedades";

const STATUS_OPTIONS: { key: JobStatus; label: string; color: string }[] = [
  { key: "succeeded", label: "Concluído", color: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  { key: "running", label: "Processando", color: "border-sky-300 bg-sky-50 text-sky-700" },
  { key: "pending", label: "Na fila", color: "border-amber-300 bg-amber-50 text-amber-700" },
  { key: "failed", label: "Falhou", color: "border-red-300 bg-red-50 text-red-700" },
];

const STATUS_BADGE: Record<JobStatus, { label: string; classes: string; Icon: typeof Clock }> = {
  succeeded: { label: "Concluído", classes: "border-emerald-100 bg-emerald-50 text-emerald-700", Icon: CheckCircle2 },
  running: { label: "Processando", classes: "border-sky-100 bg-sky-50 text-sky-700", Icon: Clock },
  pending: { label: "Na fila", classes: "border-amber-100 bg-amber-50 text-amber-700", Icon: Clock },
  failed: { label: "Falhou", classes: "border-red-100 bg-red-50 text-red-700", Icon: XCircle },
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return "—";
  const ms = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}min ${s}s` : `${s}s`;
}

export default function ProcessamentosPage() {
  const [statusFilter, setStatusFilter] = useState<JobStatus[]>([]);
  const [propriedadeId, setPropriedadeId] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [selectedJob, setSelectedJob] = useState<JobResponse | null>(null);

  const propriedadesQuery = useQuery({
    queryKey: ["propriedades"],
    queryFn: () => listPropriedades(),
    staleTime: 5 * 60 * 1000,
  });

  const jobsQuery = useQuery({
    queryKey: ["jobs", { statusFilter, propriedadeId, from, to }],
    queryFn: () =>
      listJobs({
        status: statusFilter.length > 0 ? statusFilter : undefined,
        propriedadeId: propriedadeId !== "all" ? propriedadeId : undefined,
        from: from || undefined,
        to: to || undefined,
      }),
    staleTime: 10 * 1000,
    refetchInterval: (q) => {
      const data = q.state.data as JobResponse[] | undefined;
      const hasActive = (data ?? []).some((j) => j.status === "pending" || j.status === "running");
      return hasActive ? 5000 : false;
    },
  });

  const toggleStatus = (s: JobStatus) => {
    setStatusFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const clearFilters = () => {
    setStatusFilter([]);
    setPropriedadeId("all");
    setFrom("");
    setTo("");
  };

  const hasFilters =
    statusFilter.length > 0 || propriedadeId !== "all" || from !== "" || to !== "";

  const jobs = jobsQuery.data ?? [];
  const totalCount = jobs.length;

  const counters = useMemo(() => {
    return {
      succeeded: jobs.filter((j) => j.status === "succeeded").length,
      failed: jobs.filter((j) => j.status === "failed").length,
      running: jobs.filter((j) => j.status === "running").length,
      pending: jobs.filter((j) => j.status === "pending").length,
    };
  }, [jobs]);

  return (
    <Layout
      title="Processamentos"
      description="Histórico de jobs do Core: status, parâmetros e ação de re-disparo."
    >
      <div className="mx-auto max-w-[1400px] space-y-4">
        {/* Counters */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <CounterCard label="Concluídos" value={counters.succeeded} color="text-emerald-600" />
          <CounterCard label="Processando" value={counters.running} color="text-sky-600" />
          <CounterCard label="Na fila" value={counters.pending} color="text-amber-600" />
          <CounterCard label="Falhas" value={counters.failed} color="text-red-600" />
        </div>

        {/* Filters */}
        <div className="rounded-[16px] bg-white border border-gray-200 shadow-sm p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Status:
            </span>
            {STATUS_OPTIONS.map((opt) => {
              const active = statusFilter.includes(opt.key);
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => toggleStatus(opt.key)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    active ? opt.color : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Propriedade</Label>
              <Select value={propriedadeId} onValueChange={setPropriedadeId}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as propriedades</SelectItem>
                  {(propriedadesQuery.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500" htmlFor="filter-from">
                De
              </Label>
              <Input id="filter-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500" htmlFor="filter-to">
                Até
              </Label>
              <Input id="filter-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from || undefined} />
            </div>
          </div>

          {hasFilters && (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs text-slate-500 hover:text-slate-900">
                Limpar filtros
              </Button>
            </div>
          )}
        </div>

        {/* List */}
        <div className="rounded-[16px] bg-white border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-3">
            <h2 className="font-semibold text-gray-900">
              {jobsQuery.isLoading
                ? "Carregando..."
                : `${totalCount} ${totalCount === 1 ? "processamento" : "processamentos"}`}
            </h2>
            {jobsQuery.isFetching && !jobsQuery.isLoading && (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            )}
          </div>

          {jobsQuery.isLoading ? (
            <div className="divide-y divide-gray-50">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-5 w-32 ml-auto" />
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
          ) : totalCount === 0 ? (
            <EmptyState
              icon={History}
              title={
                hasFilters
                  ? "Nenhum processamento com esses filtros"
                  : "Nenhum processamento ainda"
              }
              description={
                hasFilters
                  ? "Tente limpar os filtros ou ajustar o período."
                  : "Cenas processadas via mapa interativo ou batch aparecem aqui."
              }
              cta={
                hasFilters
                  ? { label: "Limpar filtros", onClick: clearFilters }
                  : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-slate-50/50">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="px-6 py-3 font-semibold">Data</th>
                    <th className="px-6 py-3 font-semibold">Propriedade</th>
                    <th className="px-6 py-3 font-semibold">Status</th>
                    <th className="px-6 py-3 font-semibold">Período da cena</th>
                    <th className="px-6 py-3 font-semibold">Índices</th>
                    <th className="px-6 py-3 font-semibold text-right">Duração</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {jobs.map((job) => {
                    const badge = STATUS_BADGE[job.status];
                    const params = job.parametros ?? {};
                    const range = params.dateRange ?? {};
                    const indices = params.indices ?? [];
                    const periodo =
                      range.start && range.end
                        ? range.start === range.end
                          ? range.start
                          : `${range.start} → ${range.end}`
                        : "—";
                    return (
                      <tr
                        key={job.id}
                        onClick={() => setSelectedJob(job)}
                        className="cursor-pointer transition hover:bg-slate-50"
                      >
                        <td className="px-6 py-3 text-slate-700">{formatDate(job.createdAt)}</td>
                        <td className="px-6 py-3 text-slate-900 font-medium">
                          {job.propriedadeNome ?? "—"}
                          {params.batch && (
                            <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                              lote
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${badge.classes}`}
                          >
                            <badge.Icon className="h-3 w-3" />
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-slate-600 font-mono text-xs">{periodo}</td>
                        <td className="px-6 py-3 text-slate-500 text-xs uppercase">
                          {indices.length > 0 ? indices.join(", ") : "—"}
                        </td>
                        <td className="px-6 py-3 text-slate-600 text-right">
                          {formatDuration(job.iniciadoEm, job.finalizadoEm)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <JobDetailSheet
        job={selectedJob}
        open={selectedJob !== null}
        onOpenChange={(o) => !o && setSelectedJob(null)}
      />
    </Layout>
  );
}

function CounterCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-[14px] bg-white border border-gray-200 shadow-sm px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
