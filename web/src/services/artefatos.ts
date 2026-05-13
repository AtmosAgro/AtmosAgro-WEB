import { apiFetch } from "@/lib/api-client";

export interface Artefato {
  id: string;
  identificador?: string;
  indice?: string;
  tipo: "geotiff" | "html" | "csv" | "png" | "json";
  dataReferencia?: string;
  geradoEm?: string;
  talhao?: { nome: string; codigo: string };
  propriedade?: { nome: string };
  url: string;
}

export interface ArtefatoSignedUrl {
  signedUrl: string;
  expiresAt: string;
}

/**
 * Faz o parse do identificador semântico.
 * Formato esperado: {8chars}-{YYYYMMDD}-{INDICE}
 * Exemplo: "8cc63dfa-20251229-NDVI"
 */
export function parseIdentificador(
  identificador: string
): { shortId: string; data: string; indice: string } | null {
  const match = identificador.match(/^([0-9a-f]{8})-(\d{8})-(.+)$/i);
  if (!match) return null;
  const [, shortId, dateStr, indice] = match;
  const data = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  return { shortId, data, indice };
}

/**
 * Retorna um label legível para exibição no mapa.
 * Exemplo: "NDVI — 29/12/2025"
 */
export function formatArtefatoLabel(artefato: Artefato): string {
  // Tenta via identificador semântico primeiro
  if (artefato.identificador) {
    const parsed = parseIdentificador(artefato.identificador);
    if (parsed) {
      const [year, month, day] = parsed.data.split("-");
      return `${parsed.indice} — ${day}/${month}/${year}`;
    }
  }
  // Fallback via campos do banco
  if (artefato.indice && artefato.dataReferencia) {
    const date = new Date(artefato.dataReferencia).toLocaleDateString("pt-BR");
    return `${artefato.indice} — ${date}`;
  }
  return artefato.indice || artefato.id;
}

/**
 * Extrai o índice do artefato (ex: "NDVI", "NDWI").
 */
export function getIndice(artefato: Artefato): string {
  if (artefato.indice) return artefato.indice;
  if (artefato.identificador) {
    const parsed = parseIdentificador(artefato.identificador);
    if (parsed) return parsed.indice;
  }
  return "—";
}

/**
 * Lista todos os artefatos GeoTIFF de uma propriedade (incluindo os de seus talhões).
 */
export async function listArtefatosByPropriedade(
  propriedadeId: string
): Promise<Artefato[]> {
  const all = await apiFetch<Artefato[]>(
    `/artefatos/propriedade/${propriedadeId}`
  );
  return all.filter((a) => a.tipo === "geotiff");
}

/**
 * Obtém uma Signed URL temporária (15 min) para carregar o GeoTIFF diretamente do GCS.
 */
export async function getArtefatoSignedUrl(
  artefatoId: string
): Promise<ArtefatoSignedUrl> {
  return apiFetch<ArtefatoSignedUrl>(`/artefatos/${artefatoId}/signed-url`);
}
