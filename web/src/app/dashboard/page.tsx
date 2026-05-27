"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  Layers,
  MapPin,
  Ruler,
  Satellite,
  Sprout,
  XCircle,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import MetricCard from "@/components/dashboard/MetricCard";
import { getAuthSession } from "@/lib/auth-session";
import { listPropriedades, type Propriedade } from "@/services/propriedades";
import { listTalhoes } from "@/services/talhoes";
import { listJobs, type JobResponse } from "@/services/jobs";

type DashboardSnapshot = {
  propriedades: Propriedade[];
  talhoesCount: number;
  totalAreaHa: number;
  jobs: JobResponse[];
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function isWithinLast30Days(iso: string | null): boolean {
  if (!iso) return false;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return false;
  return Date.now() - ms <= THIRTY_DAYS_MS;
}

function formatHa(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function jobStatusBadge(status: JobResponse["status"]) {
  const map = {
    succeeded: { label: "Concluído", icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
    failed: { label: "Falhou", icon: XCircle, color: "text-red-600 bg-red-50 border-red-100" },
    pending: { label: "Na fila", icon: Clock, color: "text-amber-600 bg-amber-50 border-amber-100" },
    running: { label: "Processando", icon: Clock, color: "text-sky-600 bg-sky-50 border-sky-100" },
  } as const;
  const item = map[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${item.color}`}>
      <item.icon className="h-3 w-3" />
      {item.label}
    </span>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("Usuário");

  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Lê sessão só no cliente — evita hydration mismatch (localStorage não existe no SSR).
  useEffect(() => {
    const user = getAuthSession();
    if (user?.nome) {
      setFirstName(user.nome.split(" ")[0]);
    }
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const propriedades = await listPropriedades();

        if (propriedades.length === 0) {
          setSnapshot({ propriedades: [], talhoesCount: 0, totalAreaHa: 0, jobs: [] });
          return;
        }

        const [talhoesByProp, jobs] = await Promise.all([
          Promise.all(propriedades.map(async (p) => {
            try {
              return await listTalhoes(p.id);
            } catch {
              return [];
            }
          })),
          listJobs().catch(() => [] as JobResponse[]),
        ]);

        const talhoesCount = talhoesByProp.reduce((sum, list) => sum + list.length, 0);
        const totalAreaHa = propriedades.reduce(
          (sum, p) => sum + (Number(p.areaHectares) || 0),
          0,
        );

        setSnapshot({ propriedades, talhoesCount, totalAreaHa, jobs });
      } catch (err) {
        console.error("Erro ao carregar dashboard:", err);
        setSnapshot({ propriedades: [], talhoesCount: 0, totalAreaHa: 0, jobs: [] });
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const jobsLast30d = useMemo(() => {
    if (!snapshot) return 0;
    return snapshot.jobs.filter((j) => isWithinLast30Days(j.createdAt)).length;
  }, [snapshot]);

  const recentJobs = useMemo(() => {
    if (!snapshot) return [];
    return [...snapshot.jobs]
      .sort((a, b) => Date.parse(b.createdAt ?? "0") - Date.parse(a.createdAt ?? "0"))
      .slice(0, 5);
  }, [snapshot]);

  return (
    <Layout
      title={`Olá, ${firstName}!`}
      description="Visão geral das suas propriedades e processamentos."
    >
      <div className="mx-auto max-w-[1600px] space-y-6">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-[240px] w-full rounded-[20px]" />
            ))}
          </div>
        ) : snapshot && snapshot.propriedades.length === 0 ? (
          <EmptyState
            icon={Satellite}
            title="Bem-vindo ao AtmosAgro"
            description="Cadastre sua primeira propriedade para começar a monitorar com imagens de satélite."
            cta={{
              label: "Cadastrar Primeira Propriedade",
              onClick: () => router.push("/propriedades/novo"),
            }}
          />
        ) : snapshot ? (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
              <MetricCard
                label="Propriedades"
                value={String(snapshot.propriedades.length)}
                subtext={snapshot.propriedades.length === 1 ? "1 fazenda cadastrada" : `${snapshot.propriedades.length} fazendas cadastradas`}
                icon={MapPin}
              />
              <MetricCard
                label="Talhões"
                value={String(snapshot.talhoesCount)}
                subtext={snapshot.talhoesCount === 1 ? "1 talhão ativo" : `${snapshot.talhoesCount} talhões ativos`}
                icon={Sprout}
              />
              <MetricCard
                label="Área Total"
                value={`${formatHa(snapshot.totalAreaHa)} ha`}
                subtext="Soma das áreas cadastradas"
                icon={Ruler}
              />
              <MetricCard
                label="Jobs (30 dias)"
                value={String(jobsLast30d)}
                subtext={jobsLast30d === 1 ? "1 processamento recente" : `${jobsLast30d} processamentos recentes`}
                icon={Layers}
              />
            </div>

            <div className="rounded-[20px] bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Processamentos recentes</h3>
                {recentJobs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => router.push("/mapa-interativo")}
                    className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
                  >
                    Ir para o mapa
                  </button>
                )}
              </div>
              {recentJobs.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">
                  Nenhum processamento disparado ainda. Use o Mapa Interativo para começar.
                </p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {recentJobs.map((job) => {
                    const prop = snapshot.propriedades.find((p) => p.id === job.propriedadeId);
                    return (
                      <div key={job.id} className="flex items-center justify-between gap-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">
                            {prop?.nome ?? "Propriedade removida"}
                          </p>
                          <p className="text-xs text-gray-400">
                            {job.createdAt ? new Date(job.createdAt).toLocaleString("pt-BR") : "—"}
                          </p>
                        </div>
                        {jobStatusBadge(job.status)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </Layout>
  );
}
