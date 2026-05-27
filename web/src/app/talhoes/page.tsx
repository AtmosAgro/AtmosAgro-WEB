"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Layout } from "@/components/Layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Ruler, Sprout, Calendar } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { listPropriedades, type Propriedade } from "@/services/propriedades";
import { listTalhoes, type Talhao } from "@/services/talhoes";
import { dataCache } from "@/services/dataCache";

type TalhaoComPropriedade = Talhao & { propriedadeNome: string };

export default function TalhoesPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Propriedade[]>([]);
  const [allTalhoes, setAllTalhoes] = useState<TalhaoComPropriedade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("all");

  useEffect(() => {
    async function load() {
      try {
        let props = dataCache.getProperties();
        if (!props) {
          props = await listPropriedades();
          if (props.length > 0) dataCache.setProperties(props);
        }
        setProperties(props);

        const results = await Promise.all(
          props.map(async (prop) => {
            try {
              let talhoes = dataCache.getTalhoes(prop.id);
              if (!talhoes) {
                talhoes = await listTalhoes(prop.id);
                dataCache.setTalhoes(prop.id, talhoes);
              }
              return talhoes.map((t) => ({ ...t, propriedadeNome: prop.nome }));
            } catch {
              return [];
            }
          })
        );

        setAllTalhoes(results.flat());
      } catch (err) {
        console.error("Erro ao carregar talhões:", err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const filteredTalhoes =
    selectedPropertyId === "all"
      ? allTalhoes
      : allTalhoes.filter((t) => t.propriedadeId === selectedPropertyId);

  return (
    <Layout
      title="Talhões"
      description="Listagem de todos os talhões cadastrados, agrupados por propriedade."
    >
      <div className="mx-auto max-w-[1600px] space-y-6">
        {/* Filter + List */}
        <div className="rounded-[16px] bg-white border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 px-6 py-4">
            <h2 className="font-semibold text-gray-900">
              Todos os Talhões
              {!isLoading && (
                <span className="ml-2 text-sm font-normal text-gray-400">
                  ({filteredTalhoes.length})
                </span>
              )}
            </h2>
            <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
              <SelectTrigger className="w-full sm:w-64 bg-gray-50 border-gray-200">
                <SelectValue placeholder="Filtrar por propriedade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as propriedades</SelectItem>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="divide-y divide-gray-50">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-32 ml-auto" />
                </div>
              ))}
            </div>
          ) : filteredTalhoes.length === 0 ? (
            <EmptyState
              icon={Sprout}
              title="Nenhum talhão encontrado"
              description={
                properties.length === 0
                  ? "Cadastre uma propriedade primeiro para depois adicionar talhões."
                  : "Cadastre um talhão dentro de uma das suas propriedades."
              }
              cta={
                properties.length > 0
                  ? {
                      label: "Cadastrar Talhão",
                      onClick: () => router.push(`/propriedades/${properties[0].id}/talhoes/novo`),
                    }
                  : {
                      label: "Cadastrar Propriedade",
                      onClick: () => router.push("/propriedades/novo"),
                    }
              }
            />
          ) : (
            <div className="divide-y divide-gray-50">
              {filteredTalhoes.map((talhao) => (
                <div
                  key={talhao.id}
                  className="group flex items-center gap-4 px-6 py-4 transition-colors hover:bg-gray-50"
                >
                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900 truncate">
                        {talhao.nome || talhao.codigo}
                      </span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                        {talhao.codigo}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-400 truncate">{talhao.propriedadeNome}</p>
                  </div>

                  {/* Meta */}
                  <div className="hidden sm:flex items-center gap-6 text-sm text-gray-500 shrink-0">
                    <span className="flex items-center gap-1">
                      <Sprout className="h-4 w-4 text-emerald-500" />
                      {talhao.cultura}
                    </span>
                    <span className="flex items-center gap-1">
                      <Ruler className="h-4 w-4 text-gray-400" />
                      {talhao.areaHectares} ha
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      {talhao.safra}
                    </span>
                  </div>

                  {/* Detail link */}
                  <button
                    type="button"
                    onClick={() => router.push(`/propriedades/${talhao.propriedadeId}/talhoes/${talhao.id}`)}
                    className="ml-2 shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
                  >
                    Detalhes
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
