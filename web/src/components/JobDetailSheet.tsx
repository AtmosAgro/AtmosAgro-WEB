"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Cloud,
  Layers,
  Loader2,
  MapPin,
  RefreshCw,
  Settings2,
  XCircle,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

import { createJob, type JobResponse } from "@/services/jobs";
import { describeJobError } from "@/lib/jobErrors";

const STATUS_LABEL: Record<JobResponse["status"], { label: string; color: string }> = {
  pending: { label: "Na fila", color: "text-amber-600 bg-amber-50 border-amber-100" },
  running: { label: "Processando", color: "text-sky-600 bg-sky-50 border-sky-100" },
  succeeded: { label: "Concluído", color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
  failed: { label: "Falhou", color: "text-red-600 bg-red-50 border-red-100" },
};

function StatusIcon({ status }: { status: JobResponse["status"] }) {
  if (status === "succeeded") return <CheckCircle2 className="h-3 w-3" />;
  if (status === "failed") return <XCircle className="h-3 w-3" />;
  return <Clock className="h-3 w-3" />;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
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

export type JobDetailSheetProps = {
  job: JobResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function JobDetailSheet({ job, open, onOpenChange }: JobDetailSheetProps) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isResubmitting, setIsResubmitting] = useState(false);

  if (!job) return null;

  const status = STATUS_LABEL[job.status];
  const params = job.parametros ?? {};
  const dateRange = params.dateRange ?? {};
  const indices = params.indices ?? [];
  const cloudCoverMax = params.cloudCoverMax;
  const isBatch = !!params.batch;
  const errorInfo = job.status === "failed" ? describeJobError(job.erroMensagem) : null;

  const canResubmit =
    (job.status === "succeeded" || job.status === "failed") &&
    !!job.propriedadeId &&
    !!dateRange.start &&
    !!dateRange.end;

  const handleResubmit = async () => {
    if (!canResubmit || !job.propriedadeId || !dateRange.start || !dateRange.end) return;
    setIsResubmitting(true);
    try {
      await createJob(
        job.propriedadeId,
        { start: dateRange.start, end: dateRange.end },
        indices.length > 0 ? indices : undefined,
        cloudCoverMax ?? 30,
      );
      toast({
        title: "Processamento enfileirado",
        description: "Novo job criado com os mesmos parâmetros.",
      });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao re-disparar.";
      toast({ variant: "destructive", title: "Erro", description: message });
    } finally {
      setIsResubmitting(false);
    }
  };

  const handleOpenOnMap = () => {
    if (!job.propriedadeId || !dateRange.start) return;
    router.push(
      `/mapa-interativo?propriedade=${job.propriedadeId}&data=${dateRange.start}`,
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>Detalhes do processamento</span>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${status.color}`}
            >
              <StatusIcon status={job.status} />
              {status.label}
            </span>
            {isBatch && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                lote
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">{job.id}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {errorInfo && (
            <div className="rounded-lg border border-red-100 bg-red-50 p-3">
              <p className="text-sm font-semibold text-red-700">{errorInfo.title}</p>
              <p className="mt-1 text-xs text-red-600">{errorInfo.suggestion}</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DetailRow icon={MapPin} label="Propriedade" value={job.propriedadeNome ?? "—"} />
            <DetailRow
              icon={Calendar}
              label="Período"
              value={
                dateRange.start && dateRange.end
                  ? dateRange.start === dateRange.end
                    ? dateRange.start
                    : `${dateRange.start} → ${dateRange.end}`
                  : "—"
              }
            />
            <DetailRow
              icon={Cloud}
              label="Cloud cover máx."
              value={cloudCoverMax !== undefined ? `${cloudCoverMax}%` : "—"}
            />
            <DetailRow
              icon={Layers}
              label="Índices"
              value={indices.length > 0 ? indices.join(", ").toUpperCase() : "todos"}
            />
            <DetailRow icon={Clock} label="Criado em" value={formatDateTime(job.createdAt)} />
            <DetailRow
              icon={Settings2}
              label="Duração"
              value={formatDuration(job.iniciadoEm, job.finalizadoEm)}
            />
          </div>

          {job.status === "failed" && job.erroMensagem && (
            <details className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <summary className="cursor-pointer text-xs font-medium text-slate-600">
                Erro técnico (mensagem completa do Core)
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-all text-[11px] text-slate-700">
                {job.erroMensagem}
              </pre>
            </details>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {job.status === "succeeded" && job.propriedadeId && dateRange.start && (
            <Button variant="outline" onClick={handleOpenOnMap}>
              <MapPin className="mr-2 h-4 w-4" />
              Abrir no mapa
            </Button>
          )}
          {canResubmit && (
            <Button
              onClick={handleResubmit}
              disabled={isResubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isResubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enfileirando...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Re-disparar
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-500">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}
