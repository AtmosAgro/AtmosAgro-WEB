"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

import {
  createBatchJobs,
  type CloudBucket,
  type CreateBatchJobsResponse,
} from "@/services/jobs";
import { listAvailableScenes, type SceneSummary } from "@/services/scenes";

const DEFAULT_INDICES = ["ndvi", "ndwi", "evi", "ndre", "ndmi", "gndvi"];
const MINUTES_PER_SCENE = 5;
const MB_PER_SCENE = 300;
const BULLMQ_CONCURRENCY = 2;

type BucketKey = CloudBucket;

const BUCKET_OPTIONS: { key: BucketKey; label: string; hint: string; range: [number, number] }[] = [
  { key: "low", label: "Utilizável (≤ 30%)", hint: "Cenas limpas", range: [0, 30] },
  { key: "partial", label: "Parcial (30-70%)", hint: "Pedaços nublados", range: [30, 70] },
  { key: "cloudy", label: "Nublada (> 70%)", hint: "Maior parte nublada", range: [70, 100] },
];

function sceneMatchesBucket(cloudCover: number | null, bucket: BucketKey): boolean {
  if (cloudCover === null || cloudCover === undefined) return bucket === "cloudy";
  if (bucket === "low") return cloudCover <= 30;
  if (bucket === "cloudy") return cloudCover > 70;
  return cloudCover > 30 && cloudCover <= 70;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function formatStorage(mb: number): string {
  if (mb < 1024) return `${Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

export type BatchProcessModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propriedadeId: string;
  onBatchCreated?: (result: CreateBatchJobsResponse) => void;
};

export function BatchProcessModal({
  open,
  onOpenChange,
  propriedadeId,
  onBatchCreated,
}: BatchProcessModalProps) {
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [from, setFrom] = useState(oneMonthAgo);
  const [to, setTo] = useState(today);
  const [selectedBuckets, setSelectedBuckets] = useState<BucketKey[]>(["low"]);
  const [scenes, setScenes] = useState<SceneSummary[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Carrega cenas disponíveis quando o range muda
  useEffect(() => {
    if (!open || !propriedadeId || !from || !to || from > to) {
      setScenes([]);
      setFetchError(null);
      return;
    }
    let active = true;
    setIsFetching(true);
    setFetchError(null);
    listAvailableScenes(propriedadeId, from, to)
      .then((data) => {
        if (active) setScenes(data);
      })
      .catch((err) => {
        if (active) {
          setScenes([]);
          setFetchError(err instanceof Error ? err.message : "Erro ao carregar cenas.");
        }
      })
      .finally(() => {
        if (active) setIsFetching(false);
      });
    return () => {
      active = false;
    };
  }, [open, propriedadeId, from, to]);

  const matchingScenes = useMemo(() => {
    return scenes.filter((s) => selectedBuckets.some((b) => sceneMatchesBucket(s.cloudCover, b)));
  }, [scenes, selectedBuckets]);

  const estimate = useMemo(() => {
    const count = matchingScenes.length;
    const totalMinutes = (count * MINUTES_PER_SCENE) / BULLMQ_CONCURRENCY;
    const totalMb = count * MB_PER_SCENE;
    return { count, totalMinutes, totalMb };
  }, [matchingScenes]);

  const toggleBucket = (b: BucketKey) => {
    setSelectedBuckets((prev) =>
      prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b],
    );
  };

  const handleSubmit = async () => {
    if (selectedBuckets.length === 0) {
      toast({
        variant: "destructive",
        title: "Selecione ao menos um bucket de nuvem.",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await createBatchJobs(propriedadeId, {
        from,
        to,
        cloudBuckets: selectedBuckets,
        indices: DEFAULT_INDICES,
      });
      toast({
        title: "Lote criado",
        description: `${result.created} processamento(s) enfileirados. ${result.skippedExisting} já processadas, ${result.skippedRunning} em fila.`,
      });
      onBatchCreated?.(result);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao criar lote.";
      toast({ variant: "destructive", title: "Erro", description: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Processar imagens em lote</DialogTitle>
          <DialogDescription>
            Selecione período e qualidade das cenas. Datas já processadas ou em fila são puladas
            automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="batch-from">De</Label>
              <Input
                id="batch-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                max={today}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="batch-to">Até</Label>
              <Input
                id="batch-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                max={today}
                min={from}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Buckets de cobertura de nuvem</Label>
            <div className="space-y-2">
              {BUCKET_OPTIONS.map((opt) => (
                <label
                  key={opt.key}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50"
                >
                  <Checkbox
                    checked={selectedBuckets.includes(opt.key)}
                    onCheckedChange={() => toggleBucket(opt.key)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{opt.label}</p>
                    <p className="text-xs text-slate-500">{opt.hint}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-sm">
            {isFetching ? (
              <div className="flex items-center gap-2 text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Consultando catálogo Copernicus...</span>
              </div>
            ) : fetchError ? (
              <div className="flex items-start gap-2 text-red-700">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Erro ao carregar cenas: {fetchError}</span>
              </div>
            ) : estimate.count === 0 ? (
              <div className="flex items-start gap-2 text-amber-700">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Nenhuma cena no período + buckets selecionados. Ajuste o range ou inclua mais
                  buckets. Se a janela contém meses ainda não consultados, abra cada mês no
                  calendário primeiro.
                </span>
              </div>
            ) : (
              <div className="space-y-1 text-slate-700">
                <p className="font-semibold text-emerald-700">
                  {estimate.count} cena(s) serão processadas
                </p>
                <p className="text-xs">
                  Tempo estimado: <span className="font-medium">{formatDuration(estimate.totalMinutes)}</span>
                  {" · "}
                  Armazenamento: <span className="font-medium">{formatStorage(estimate.totalMb)}</span>
                </p>
                <p className="text-[11px] text-slate-500">
                  Cálculo: {MINUTES_PER_SCENE}min/cena ÷ {BULLMQ_CONCURRENCY} workers paralelos;{" "}
                  {MB_PER_SCENE} MB/cena.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || isFetching || estimate.count === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enfileirando...
              </>
            ) : (
              `Processar ${estimate.count} cena(s)`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
