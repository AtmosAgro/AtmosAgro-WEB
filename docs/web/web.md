# Frontend Web (Next.js + React)

> **Atualizado em: Abril/2026**

O frontend é uma aplicação **Next.js 16 (App Router)** com React 19 e TypeScript. Consome a API Node.js (`AtmosAgro-API`) via proxy configurado no `next.config.ts`.

---

## Setup

```bash
cd AtmosAgro-WEB/web
npm install
npm run dev     # http://localhost:3000
npm run build   # build de produção
npm run lint    # ESLint
```

---

## Estrutura de Pastas

```
web/src/
├── app/                  → Rotas (App Router do Next.js)
│   ├── dashboard/
│   ├── propriedades/
│   ├── talhoes/
│   ├── mapa-interativo/  → Mapa Leaflet + GeoTIFF
│   ├── analises/         → Stub (aguarda backend)
│   └── relatorios/       → Stub (aguarda backend)
├── components/
│   ├── InteractiveMap.tsx → Mapa principal (Leaflet + georaster)
│   └── TiffInspector.tsx  → Inspeção de pixels no hover
├── services/             → Clientes da API
│   ├── auth.ts
│   ├── propriedades.ts
│   ├── talhoes.ts
│   ├── artefatos.ts      → Listagem e Signed URLs de GeoTIFFs
│   └── dataCache.ts
├── lib/
│   └── api-client.ts     → fetch wrapper com refresh token automático
├── providers/            → Context providers (Supabase auth, tema)
├── stores/               → Zustand stores
└── hooks/                → Custom hooks
```

---

## Serviços disponíveis (`src/services/`)

### `artefatos.ts`
Gerencia as imagens de satélite processadas (GeoTIFFs).

| Função | Descrição |
|---|---|
| `listArtefatosByPropriedade(propriedadeId)` | Lista GeoTIFFs disponíveis para uma propriedade |
| `getArtefatoSignedUrl(artefatoId)` | Obtém Signed URL temporária (15 min) para o GCS |
| `formatArtefatoLabel(artefato)` | Retorna label legível: `"NDVI — 29/12/2025"` |
| `parseIdentificador(identificador)` | Parse do slug `8cc63dfa-20251229-NDVI` |
| `getIndice(artefato)` | Extrai o índice (`"NDVI"`, `"NDWI"`, etc.) |

**Fluxo de carregamento de imagem:**
```
listArtefatosByPropriedade(propId)
  → usuário seleciona artefato
  → getArtefatoSignedUrl(artefatoId)
  → fetch(signedUrl) → arrayBuffer → parseGeoraster → GeoRasterLayer
```

---

## Mapa Interativo (`InteractiveMap.tsx`)

Componente principal de visualização. Funcionalidades:

- Seletor de propriedade → carrega talhões e artefatos disponíveis automaticamente
- Painel lateral: lista de talhões com dados cadastrais reais
- Painel de detalhe do talhão: lista de **imagens de satélite disponíveis** (clicáveis)
- Ao clicar em uma imagem: busca Signed URL → carrega GeoTIFF → renderiza colormap NDVI no mapa
- Colormap: vermelho (baixo vigor) → verde escuro (alto vigor)
- Inspeção de pixel: hover mostra o valor do índice no ponto
- Upload manual de `.tif` local mantido como opção secundária

**Dependências de renderização:**
- `georaster` + `georaster-layer-for-leaflet` — renderização raster no Leaflet
- `geoblaze` — consultas de pixel
- `proj4` — reprojeção de coordenadas
- `react-leaflet` — wrapper React do Leaflet

---

## Convenção: Identificador Semântico

Os artefatos retornados pela API possuem um identificador no formato:

```
{8chars do propriedadeId}-{YYYYMMDD}-{INDICE}
Exemplo: 8cc63dfa-20251229-NDVI
```

O `formatArtefatoLabel()` converte isso para `"NDVI — 29/12/2025"` para exibição ao usuário.

---

## Variáveis de Ambiente

| Variável | Obrigatório | Descrição |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Sim | URL base da API (ex: `https://api.atmosagro.com/api`) |

---

## Status de Implementação

| Módulo | Status |
|---|---|
| Landing page | ✅ 100% |
| Login / Cadastro | ✅ 95% |
| CRUD Propriedades + Talhões | ✅ 95% |
| Mapa Interativo + GeoTIFF via API | ✅ 90% |
| Dashboard (dados reais) | ⚠️ 50% — layout pronto, dados ainda mock |
| Análises / Relatórios | ❌ Stub |
| Recuperação de senha | ⚠️ 30% |
| Testes | ❌ 0% |
