"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import {
    Activity,
    ArrowUpRight,
    Droplets,
    Eye,
    ImageIcon,
    Layers,
    Maximize2,
    Sprout,
    Scan,
    Thermometer,
    X,
    Minus,
    Plus,
    Upload,
    Trash2,
    Loader2
} from "lucide-react";
import "leaflet/dist/leaflet.css";
import * as L from "leaflet";
import proj4 from "proj4";
import { listPropriedades, getPropriedade, Propriedade } from "@/services/propriedades";
import { Talhao, GeoJSONFeature, listTalhoes, getTalhao } from "@/services/talhoes";
import {
    Artefato,
    listArtefatosByPropriedade,
    getArtefatoSignedUrl,
    formatArtefatoLabel,
    getIndice,
} from "@/services/artefatos";
import { dataCache } from "@/services/dataCache";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
// @ts-expect-error georaster types missing
import parseGeoraster from "georaster";

import GeoRasterLayer from "georaster-layer-for-leaflet";

// Dynamic import for Leaflet components to avoid SSR issues with them as well
// Dynamic import for Leaflet components/hooks
import { MapContainer, TileLayer, Polygon, Tooltip } from "react-leaflet";
import { TiffInspector } from "./TiffInspector";

// Dynamic import for MapZoomListener is fine as it's a separate component file, 
// BUT importantly MapContainer etc should be static if InteractiveMap is dynamic.
// Actually, I'll keep TiffInspector dynamic just in case, or make it static too.
// Given InteractiveMap is ssr: false, static imports are safe.
// Let's import TiffInspector dynamically to keep behavior consistent OR standard if it uses window.
// TiffInspector uses 'georaster' which might use window.
// Safer to keep TiffInspector dynamic if unsure, but standard for react-leaflet components.


type RasterStats = {
    mins: number[];
    maxs: number[];
    ranges: number[];
    noDataValue: unknown;
    numberOfRasters: number;
};

interface Georaster {
    width: number;
    height: number;
    pixelWidth: number;
    pixelHeight: number;
    xmin: number;
    ymax: number;
    values: number[][][];
    projection: number;
    noDataValue: number | null;
    numberOfRasters: number;
    mins: number[];
    maxs: number[];
    ranges: number[];
    toCanvas: (options: unknown) => HTMLCanvasElement;
}

const ensureProj4 = () => {
    if (typeof globalThis === "undefined") return;
    const globalAny = globalThis as typeof globalThis & { proj4?: typeof proj4 };
    if (!globalAny.proj4) {
        globalAny.proj4 = proj4;
    }
};

const getRasterStats = (georaster: Georaster): RasterStats => {
    const mins = Array.isArray(georaster?.mins) ? georaster.mins : [];
    const maxs = Array.isArray(georaster?.maxs) ? georaster.maxs : [];
    const ranges = Array.isArray(georaster?.ranges) ? georaster.ranges : [];
    const numberOfRasters = typeof georaster?.numberOfRasters === "number"
        ? georaster.numberOfRasters
        : Array.isArray(georaster?.values)
            ? georaster.values.length
            : 1;

    return {
        mins,
        maxs,
        ranges,
        noDataValue: georaster?.noDataValue ?? null,
        numberOfRasters,
    };
};

const resolveNoDataValue = (noDataValue: unknown, bandIndex: number): number | null => {
    if (Array.isArray(noDataValue)) {
        const value = noDataValue[bandIndex];
        return Number.isFinite(value) ? value : null;
    }
    return Number.isFinite(noDataValue as number) ? (noDataValue as number) : null;
};

const resolveBandMinMax = (stats: RasterStats, bandIndex: number) => {
    const fallbackMin = Number.isFinite(stats.mins[0]) ? stats.mins[0] : 0;
    const fallbackMax = Number.isFinite(stats.maxs[0])
        ? stats.maxs[0]
        : Number.isFinite(stats.ranges[0])
            ? fallbackMin + stats.ranges[0]
            : fallbackMin + 1;

    const min = Number.isFinite(stats.mins[bandIndex]) ? stats.mins[bandIndex] : fallbackMin;
    let max = Number.isFinite(stats.maxs[bandIndex]) ? stats.maxs[bandIndex] : fallbackMax;
    if (!Number.isFinite(max)) {
        const rangeCandidate = stats.ranges[bandIndex];
        if (Number.isFinite(rangeCandidate)) {
            max = min + rangeCandidate;
        }
    }
    if (!Number.isFinite(max) || min === max) {
        max = min + 1;
    }

    return { min, max };
};

const normalizeValue = (value: number, min: number, max: number) => {
    if (!Number.isFinite(value)) return null;
    const range = max - min;
    if (!Number.isFinite(range) || range === 0) return 0;
    const normalized = (value - min) / range;
    return Math.min(1, Math.max(0, normalized));
};

// Helper to extract polygon positions from GeoJSON
const getPolygonPositions = (feature: GeoJSONFeature | undefined): [number, number][] => {
    if (!feature) {
        return [];
    }

    // Handle case where feature IS the geometry (no geometry property)
    const geometry = feature.geometry || feature;

    if (!geometry || !geometry.coordinates) {
        return [];
    }

    const { type, coordinates } = geometry as { type: string; coordinates: number[][][] | number[][][][] };

    try {
        if (type === "MultiPolygon") {
            const multiCoords = coordinates as unknown as number[][][][];
            if (multiCoords.length > 0 && multiCoords[0].length > 0) {
                const outerRing = multiCoords[0][0];
                return outerRing.map((p) => [p[1], p[0]] as [number, number]);
            }
        } else {
            const polygonCoords = coordinates as number[][][];
            if (polygonCoords.length > 0) {
                const outerRing = polygonCoords[0];
                return outerRing.map((p) => [p[1], p[0]] as [number, number]);
            }
        }
    } catch (e) {
        console.error("Error parsing GeoJSON", e);
        return [];
    }

    return [];
};

// Helper to mask georaster values outside the polygon
const maskGeoraster = (georaster: Georaster, polygonGeoJson: GeoJSONFeature) => {
    if (!polygonGeoJson || !georaster) return georaster;

    try {
        const { width, height, xmin, ymax, pixelWidth, pixelHeight } = georaster;

        // HEURISTIC: Check if projection is WGS84 (Lat/Lng) or similar.
        // If pixelWidth is large (e.g. > 0.01), it's likely Meters (UTM), not Degrees.
        // 1 degree ~ 111km. 10m ~ 0.00009 degrees.
        // If pixelWidth > 0.01, it implies > 1km per pixel (unlikely for drone/satellite?) OR it implies METERS (UTM).
        // Standard Lat/Lng rasters have specific small pixel sizes.

        // If it looks like meters, we cannot easily mask without reprojection (proj4 defs needed).
        // For now, SKIP masking to prevent disappearance.
        if (pixelWidth > 0.01) {
            console.warn("[InteractiveMap] Skipping mask: Raster appears to be in projected coordinates (Meters), not WGS84.", { pixelWidth, projection: georaster.projection });
            // DEBUG: See what projection we have
            console.log("[InteractiveMap] Projection Info:", georaster.projection);
            return georaster;
        }

        // 1. Create a canvas to draw the mask
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return georaster;

        // 2. Draw Polygon
        ctx.fillStyle = "white"; // Inside
        ctx.beginPath();

        const coords = getPolygonPositions(polygonGeoJson); // returns [lat, lng]
        if (coords.length === 0) return georaster;

        // Map [lat, lng] to [pixelX, pixelY]
        // pixelX = (lng - xmin) / pixelWidth
        // pixelY = (ymax - lat) / pixelHeight

        coords.forEach((pos, i) => {
            const lat = pos[0];
            const lng = pos[1];

            const x = (lng - xmin) / pixelWidth;
            const y = (ymax - lat) / pixelHeight;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });

        ctx.closePath();
        ctx.fill();

        // 3. Get Mask Data
        // If pixel is alpha/white -> keep. If transparent/black -> mask.
        // Since we didn't fill background, default is transparent (rgba(0,0,0,0)).
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data; // linear array rgba

        // 4. Modify Georaster Values
        // georaster.values is Array of Arrays (one per band).
        // We modify band 0 (usually NDVI).
        const band0 = georaster.values[0];

        // Assuming georaster is row-major
        for (let row = 0; row < height; row++) {
            for (let col = 0; col < width; col++) {
                const index = (row * width + col) * 4;
                const alpha = data[index + 3]; // Alpha channel

                // If alpha is 0 (outside polygon), set to NaN/NoData
                // We use a specific generic "null" value for float arrays, mostly NaN implies nodata in JS processing
                // But georaster might use a specific noDataValue.
                if (alpha === 0) {
                    // CAREFUL: accessing band0[row][col]
                    if (band0[row] && typeof band0[row][col] !== 'undefined') {
                        band0[row][col] = NaN;
                    }
                }
            }
        }

        console.log("[InteractiveMap] Applied polygon mask to GeoTIFF.");
        return georaster;

    } catch (e) {
        console.error("Error masking georaster:", e);
        return georaster;
    }
};

const layerOptions = ["NDVI", "EVI", "NDRE", "NDMI", "True Color"];

export default function InteractiveMap() {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [detailPanelOpen, setDetailPanelOpen] = useState(false);
    const [activeLayer, setActiveLayer] = useState(layerOptions[0]);
    const [layerMenuOpen, setLayerMenuOpen] = useState(false);
    const showPanels = !isFullscreen;

    // Real data state
    const [properties, setProperties] = useState<Propriedade[]>([]);
    const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
    const [selectedPropertyDetails, setSelectedPropertyDetails] = useState<Propriedade | null>(null);
    const [talhoes, setTalhoes] = useState<Talhao[]>([]);
    const [isLoadingTalhoes, setIsLoadingTalhoes] = useState(false);
    const [selectedTalhaoId, setSelectedTalhaoId] = useState<string | null>(null);
    // const [selectedTalhaoDetails, setSelectedTalhaoDetails] = useState<Talhao | null>(null);

    const [mapRef, setMapRef] = useState<L.Map | null>(null);

    // Artefatos (imagens de satélite da API)
    const [artefatos, setArtefatos] = useState<Artefato[]>([]);
    const [isLoadingArtefatos, setIsLoadingArtefatos] = useState(false);
    const [activeArtefatoId, setActiveArtefatoId] = useState<string | null>(null);

    // TIFF State
    const [tiffLayer, setTiffLayer] = useState<L.Layer & { options?: { georaster?: Georaster } } | null>(null);
    const [georasterData, setGeorasterData] = useState<Georaster | null>(null); // Store raw data for inspection
    const [isTiffLoading, setIsTiffLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Inspector State
    const [hoverValue, setHoverValue] = useState<number | null>(null);
    const [hoverPos, setHoverPos] = useState<{ x: number, y: number } | null>(null);


    // TIFF Helpers — lógica de colormap compartilhada entre upload local e carregamento via API
    const buildGeoRasterLayer = (georaster: Georaster) => {
        const rasterStats = getRasterStats(georaster);

        const isNoDataValue = (value: number, bandIndex: number) => {
            const noDataValue = resolveNoDataValue(rasterStats.noDataValue, bandIndex);
            return noDataValue !== null && value === noDataValue;
        };

        const scaleTo8Bit = (value: number, bandIndex: number) => {
            if (typeof value !== "number" || !Number.isFinite(value) || isNoDataValue(value, bandIndex)) {
                return null;
            }
            const { min, max } = resolveBandMinMax(rasterStats, bandIndex);
            const normalized = normalizeValue(value, min, max);
            if (normalized === null) return null;
            return Math.round(normalized * 255);
        };

        return new GeoRasterLayer({
            georaster,
            opacity: 0.7,
            resolution: 96,
            pixelValuesToColorFn: (values: number[]) => {
                if (!Array.isArray(values) || values.length === 0) return null;

                // RGB (true color)
                if (rasterStats.numberOfRasters >= 3 && values.length >= 3) {
                    const r = scaleTo8Bit(values[0], 0);
                    const g = scaleTo8Bit(values[1], 1);
                    const b = scaleTo8Bit(values[2], 2);
                    if (r === null || g === null || b === null) return null;
                    return `rgb(${r}, ${g}, ${b})`;
                }

                // Índice single-band (NDVI, NDWI, etc.)
                const value = values[0];
                if (typeof value !== "number" || !Number.isFinite(value) || isNoDataValue(value, 0)) return null;
                if (value === 0) return null;

                let { min, max } = resolveBandMinMax(rasterStats, 0);
                // Heurística: força escala 0–1 para índices float quando metadados são inconsistentes
                if (max > 1.5 && value >= -1.0 && value <= 1.0) { min = 0; max = 1; }

                const normalized = normalizeValue(value, min, max);
                if (normalized === null) return null;

                if (normalized < 0.2) return "#d7191c";
                if (normalized < 0.4) return "#fdae61";
                if (normalized < 0.6) return "#ffffbf";
                if (normalized < 0.8) return "#a6d96a";
                return "#1a9641";
            },
        });
    };

    const applyTiffLayer = (georaster: Georaster) => {
        if (!mapRef) return;
        if (tiffLayer) mapRef.removeLayer(tiffLayer);
        const layer = buildGeoRasterLayer(georaster);
        layer.addTo(mapRef);
        setTiffLayer(layer);
        setGeorasterData(georaster);
        mapRef.fitBounds(layer.getBounds());
    };

    // TIFF Handlers
    const handleTiffUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !mapRef) return;

        setIsTiffLoading(true);
        setActiveArtefatoId(null);
        ensureProj4();

        try {
            const arrayBuffer = await file.arrayBuffer();
            let georaster = await parseGeoraster(arrayBuffer);

            if (selectedPropertyDetails?.geojson) {
                georaster = maskGeoraster(georaster, selectedPropertyDetails.geojson);
            }

            applyTiffLayer(georaster);
        } catch (error) {
            console.error("Error loading GeoTIFF:", error);
            alert("Erro ao carregar o arquivo GeoTIFF. Verifique se o formato é válido.");
        } finally {
            setIsTiffLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    /**
     * Carrega um GeoTIFF de um Artefato via Signed URL do GCS.
     * Se o mesmo artefato já estiver ativo, desmarca e remove a camada.
     */
    const loadArtefatoTiff = async (artefato: Artefato) => {
        if (!mapRef) return;

        if (activeArtefatoId === artefato.id && tiffLayer) {
            clearTiff();
            return;
        }

        setIsTiffLoading(true);
        setActiveArtefatoId(artefato.id);
        ensureProj4();

        try {
            const { signedUrl } = await getArtefatoSignedUrl(artefato.id);

            const response = await fetch(signedUrl);
            if (!response.ok) throw new Error(`Erro ao baixar TIFF: ${response.status}`);
            const arrayBuffer = await response.arrayBuffer();

            let georaster = await parseGeoraster(arrayBuffer);

            if (selectedPropertyDetails?.geojson) {
                georaster = maskGeoraster(georaster, selectedPropertyDetails.geojson);
            }

            applyTiffLayer(georaster);
        } catch (error) {
            console.error("Error loading artefato TIFF:", error);
            alert("Erro ao carregar a imagem de satélite. Tente novamente.");
            setActiveArtefatoId(null);
        } finally {
            setIsTiffLoading(false);
        }
    };

    const clearTiff = () => {
        if (mapRef && tiffLayer) {
            mapRef.removeLayer(tiffLayer);
            setTiffLayer(null);
            setGeorasterData(null);
        }
        setActiveArtefatoId(null);
    };

    // Load properties on mount
    useEffect(() => {
        async function fetchProperties() {
            try {
                const cachedProps = dataCache.getProperties();
                if (cachedProps) {
                    // Use cache if available
                    setProperties(cachedProps);
                    if (cachedProps.length > 0) {
                        setSelectedPropertyId(cachedProps[0].id);
                    }
                } else {
                    const data = await listPropriedades();
                    // console.log("[InteractiveMap] Fetched Properties List:", JSON.stringify(data, null, 2));
                    if (data && data.length > 0) {
                        dataCache.setProperties(data); // Set cache
                        setProperties(data);
                        setSelectedPropertyId(data[0].id);
                    }
                }
            } catch (error) {
                console.error("Failed to load properties", error);
            }
        }
        fetchProperties();
    }, []);

    // Load property details and talhoes when property changes
    useEffect(() => {
        async function fetchData() {
            if (!selectedPropertyId) return;

            // 1. Fetch full property details (for GeoJSON)
            try {
                const cachedDetails = dataCache.getPropertyDetails(selectedPropertyId);
                if (cachedDetails) {
                    console.log("[InteractiveMap] Using cached property details for:", selectedPropertyId);
                    setSelectedPropertyDetails(cachedDetails);
                } else {
                    const details = await getPropriedade(selectedPropertyId);
                    console.log("[InteractiveMap] Fetched Property Details:", JSON.stringify(details, null, 2));
                    dataCache.setPropertyDetails(selectedPropertyId, details); // Set cache
                    setSelectedPropertyDetails(details);
                }
            } catch (error) {
                console.error("Failed to load property details", error);
                return; // Stop if prop details fail
            }

            // 2. Fetch talhoes
            try {
                // Check Cache First
                const cachedTalhoes = dataCache.getTalhoes(selectedPropertyId);
                const cacheHasGeoJson = cachedTalhoes && cachedTalhoes.length > 0 &&
                    (cachedTalhoes[0].geojson && cachedTalhoes[0].geojson.type) ||
                    (cachedTalhoes && cachedTalhoes.length === 0); // Empty list is valid cache

                if (cachedTalhoes && cacheHasGeoJson) {
                    console.log("[InteractiveMap] Using cached talhoes (verified GeoJSON) for:", selectedPropertyId);
                    setTalhoes(cachedTalhoes);
                    setIsLoadingTalhoes(false);
                } else {
                    if (cachedTalhoes && !cacheHasGeoJson) {
                        console.log("[InteractiveMap] Cache hit but missing GeoJSON. Refetching details...");
                    }
                    setIsLoadingTalhoes(true);
                    console.log("[InteractiveMap] Fetching talhoes for property:", selectedPropertyId);
                    // First get the list
                    const list = await listTalhoes(selectedPropertyId);

                    // Check if list already has valid geojson (optimization)
                    const hasGeoJson = list.length > 0 && list[0].geojson && list[0].geojson.type;

                    let finalTalhoes: Talhao[] = [];

                    if (hasGeoJson) {
                        console.log("[InteractiveMap] Using list data directly (GeoJSON present)");
                        finalTalhoes = list;
                    } else {
                        console.log("[InteractiveMap] Fetching details for each talhao (GeoJSON missing in list)");
                        // Fallback to N+1 if needed
                        const fullList = await Promise.all(
                            list.map(async (t) => {
                                try {
                                    return await getTalhao(t.id);
                                } catch (e) {
                                    console.error(`Failed to fetch details for talhao ${t.id}`, e);
                                    return t;
                                }
                            })
                        );
                        finalTalhoes = fullList || [];
                    }

                    // Save to Cache
                    dataCache.setTalhoes(selectedPropertyId, finalTalhoes);
                    setTalhoes(finalTalhoes);
                }

                setSelectedTalhaoId(null);
                setDetailPanelOpen(false);
            } catch (error) {
                console.error("Failed to load talhoes", error);
                setTalhoes([]);
            } finally {
                setIsLoadingTalhoes(false);
            }
        }
        fetchData();
    }, [selectedPropertyId]);

    // Load selected talhao details (for GeoJSON)
    /*
    useEffect(() => {
        async function fetchTalhaoDetails() {
            if (!selectedTalhaoId) {
                // setSelectedTalhaoDetails(null);
                return;
            }
            try {
                const cachedDetails = dataCache.getTalhaoDetails(selectedTalhaoId);
                if (cachedDetails) {
                    console.log("[InteractiveMap] Using cached talhao details for:", selectedTalhaoId);
                    // setSelectedTalhaoDetails(cachedDetails);
                } else {
                    const details = await getTalhao(selectedTalhaoId);
                    console.log("[InteractiveMap] Fetched Talhao Details:", JSON.stringify(details, null, 2));
                    dataCache.setTalhaoDetails(selectedTalhaoId, details); // Set cache
                    // setSelectedTalhaoDetails(details);
                }
            } catch (error) {
                console.error("Failed to load talhao details", error);
            }
        }
        fetchTalhaoDetails();
    }, [selectedTalhaoId]);
    */

    // Carrega artefatos disponíveis ao trocar de propriedade
    useEffect(() => {
        async function fetchArtefatos() {
            if (!selectedPropertyId) {
                setArtefatos([]);
                return;
            }
            setIsLoadingArtefatos(true);
            try {
                const data = await listArtefatosByPropriedade(selectedPropertyId);
                setArtefatos(data);
            } catch {
                setArtefatos([]);
            } finally {
                setIsLoadingArtefatos(false);
            }
        }
        fetchArtefatos();
        // Limpa TIFF ativo ao trocar de propriedade
        clearTiff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedPropertyId]);

    // Derived state
    const selectedTalhao = useMemo(() => talhoes.find(t => t.id === selectedTalhaoId), [talhoes, selectedTalhaoId]);

    // Helper to extract polygon positions from GeoJSON


    // Calculate center of property to fly to
    useEffect(() => {
        if (selectedPropertyDetails && mapRef) {
            if (selectedPropertyDetails.geojson) {
                const positions = getPolygonPositions(selectedPropertyDetails.geojson);
                if (positions.length > 0) {
                    const bounds = L.latLngBounds(positions);
                    mapRef.fitBounds(bounds, { padding: [50, 50] });
                }
            }
        }
    }, [selectedPropertyDetails, mapRef]);

    useEffect(() => {
        // Invalidate map size when fullscreen toggles to ensure it fills the container
        if (mapRef) {
            setTimeout(() => {
                mapRef.invalidateSize();
            }, 100);
        }
    }, [isFullscreen, mapRef]);



    const mapShellClasses = isFullscreen
        ? "fixed inset-0 z-50 h-full bg-slate-900/80 backdrop-blur-sm p-2"
        : "min-h-[calc(100vh-100px)] h-[calc(100vh-100px)]";

    return (
        <div className={`flex w-full overflow-hidden p-1 ${mapShellClasses}`}>
            {/* Sidebar */}
            {showPanels && (
                <Card className="flex w-[380px] flex-col overflow-hidden rounded-[15px] border-0 bg-[#F0F0F0] shadow-none mr-4">
                    {/* Sidebar Header / Tabs */}
                    {/* Sidebar Header */}
                    <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-5">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-slate-900">Monitoramento</h2>
                            <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                                {talhoes.length} Talhões
                            </Badge>
                        </div>

                        {/* Property Selector */}
                        <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                            <SelectTrigger className="w-full bg-white border-slate-300">
                                <SelectValue placeholder="Selecione a propriedade" />
                            </SelectTrigger>
                            <SelectContent>
                                {properties.map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Sidebar Content */}
                    <div className="flex-1 overflow-y-auto p-6">
                        <div className="space-y-6">
                            {/* Overall Health */}
                            <div>
                                <p className="text-sm font-medium text-slate-500">Imagens de satélite</p>
                                <div className="mt-2 flex items-center gap-3">
                                    {isLoadingArtefatos ? (
                                        <Skeleton className="h-6 w-32 rounded-full bg-slate-200" />
                                    ) : artefatos.length > 0 ? (
                                        <Badge className="bg-emerald-100 hover:bg-emerald-100 text-emerald-700 rounded-full px-3 py-1 text-xs font-normal">
                                            {artefatos.length} {artefatos.length === 1 ? "imagem disponível" : "imagens disponíveis"}
                                        </Badge>
                                    ) : (
                                        <Badge className="bg-slate-200 hover:bg-slate-200 text-slate-500 rounded-full px-3 py-1 text-xs font-normal">
                                            Sem imagens processadas
                                        </Badge>
                                    )}
                                </div>
                                <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                                    <Scan className="h-3.5 w-3.5" />
                                    {activeArtefatoId
                                        ? "Imagem carregada no mapa"
                                        : "Selecione um talhão para visualizar"}
                                </div>
                            </div>
                            {/* Fields List */}
                            <div className="space-y-3">
                                {isLoadingTalhoes ? (
                                    // Skeleton Loading State
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <div key={i} className="flex w-full flex-col gap-2 rounded-2xl border border-slate-100 bg-white p-4">
                                            <div className="flex items-start justify-between">
                                                <div className="space-y-2">
                                                    <Skeleton className="h-4 w-32 bg-slate-200" />
                                                    <Skeleton className="h-3 w-24 bg-slate-100" />
                                                </div>
                                                <Skeleton className="h-8 w-12 rounded-lg bg-slate-100" />
                                            </div>
                                            <div className="mt-2 flex gap-2">
                                                <Skeleton className="h-5 w-20 rounded-full bg-slate-100" />
                                                <Skeleton className="h-5 w-16 rounded-full bg-slate-100" />
                                            </div>
                                        </div>
                                    ))
                                ) : talhoes.length === 0 ? (
                                    <div className="text-center text-sm text-slate-500 py-4">Nenhum talhão cadastrado.</div>
                                ) : (
                                    talhoes.map((talhao) => (
                                        <button
                                            key={talhao.id}
                                            className={`group relative w-full overflow-hidden rounded-2xl border p-4 text-left transition-all ${talhao.id === selectedTalhaoId
                                                ? "border-emerald-500 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.04)]"
                                                : "border-transparent bg-white hover:bg-slate-50"
                                                }`}
                                            onClick={() => {
                                                setSelectedTalhaoId(talhao.id);
                                                setDetailPanelOpen(true);
                                                if (mapRef) {
                                                    const pos = getPolygonPositions(talhao.geojson);
                                                    if (pos.length > 0) {
                                                        const bounds = L.latLngBounds(pos);
                                                        mapRef.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
                                                    }
                                                }
                                            }}
                                        >
                                            {talhao.id === selectedTalhaoId && (
                                                <div className="absolute left-0 top-0 h-full w-1.5 bg-emerald-500" />
                                            )}
                                            <div className="flex items-center justify-between">
                                                <div className="pl-2 flex-1 min-w-0">
                                                    <p className="font-semibold text-slate-900 truncate">{talhao.nome || talhao.codigo}</p>
                                                    <p className="text-xs text-slate-400">{talhao.cultura}{talhao.variedade ? ` • ${talhao.variedade}` : ""}</p>
                                                    <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                                                        <span>Safra:</span>
                                                        <span className="font-medium text-slate-700">{talhao.safra}</span>
                                                    </div>
                                                    <div className="mt-1 flex items-center gap-2">
                                                        <span className="rounded-full border px-2 py-[2px] text-[10px] font-semibold bg-slate-100 text-slate-500 border-slate-200">
                                                            {talhao.areaHectares} ha • {talhao.codigo}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>

                    </div>
                </Card>
            )}

            {/* Main Content */}
            <div className="relative flex-1 overflow-hidden rounded-[15px] bg-slate-900">
                {/* Connector Line Removed */}
                <MapContainer
                    ref={setMapRef}
                    center={[-14.235, -51.925]} // Default Brazil center, will flyTo property
                    zoom={4}
                    className="h-full w-full"
                    style={{ background: "#0f172a", cursor: tiffLayer ? "crosshair" : "grab" }}
                    zoomControl={false}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    />

                    {/* 1. Property Boundary (Blue Dashed) */}
                    {selectedPropertyDetails && (() => {
                        const positions = getPolygonPositions(selectedPropertyDetails.geojson);
                        if (!positions || positions.length === 0) return null;
                        return (
                            <Polygon
                                positions={positions}
                                pathOptions={{
                                    color: "#2563eb", // Blue (matching registration)
                                    dashArray: "10, 10",
                                    fillColor: "#2563eb",
                                    fillOpacity: tiffLayer ? 0 : 0.3,
                                    weight: 2
                                }}
                            />
                        )
                    })()}

                    {/* 2. Talhoes Polygons (Green/Filled) */}
                    {talhoes.map((talhao) => {
                        const positions = getPolygonPositions(talhao.geojson);
                        if (!positions || positions.length === 0) return null;

                        return (
                            <Polygon
                                key={talhao.id}
                                positions={positions}
                                pathOptions={{
                                    color: talhao.id === selectedTalhaoId ? "#ffffff" : "#10b981",
                                    fillColor: "#10b981", // Emerald 500
                                    fillOpacity: talhao.id === selectedTalhaoId ? 0.3 : 0.5,
                                    weight: talhao.id === selectedTalhaoId ? 3 : 1,
                                }}
                                eventHandlers={{
                                    click: (e) => {
                                        // Prevent bubbling if needed, though usually fine
                                        setSelectedTalhaoId(talhao.id);
                                        setDetailPanelOpen(true);
                                        L.DomEvent.stopPropagation(e);
                                    },
                                }}
                            >
                                <Tooltip permanent direction="center" className="bg-transparent border-0 shadow-none font-bold text-white text-shadow-sm">
                                    {talhao.nome}
                                </Tooltip>

                            </Polygon>
                        )
                    })}

                    {/* 3. TIFF Inspection Layer */}
                    {tiffLayer && (
                        <TiffInspector
                            georaster={georasterData || tiffLayer.options?.georaster}
                            onHover={(val, pos) => {
                                setHoverValue(val);
                                setHoverPos(pos);
                            }}
                        />
                    )}
                </MapContainer>

                {/* Loading Overlay */}
                {isLoadingTalhoes && (
                    <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center bg-slate-900/50 backdrop-blur-sm transition-all duration-500">
                        <div className="relative flex flex-col items-center">
                            <div className="h-16 w-16 animate-spin rounded-full border-4 border-emerald-500/30 border-t-emerald-500 shadow-lg shadow-emerald-500/20" />
                            <div className="mt-4 flex flex-col items-center space-y-1">
                                <span className="text-sm font-semibold text-white tracking-wide">Carregando mapa...</span>
                                <span className="text-xs text-slate-300">Processando geometria dos talhões</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Floating Tooltip for Inspection */}
                {hoverValue !== null && hoverPos && (
                    <div
                        className="pointer-events-none fixed z-[500] flex flex-col items-center rounded-lg bg-slate-900/90 px-3 py-2 text-white shadow-xl backdrop-blur-md"
                        style={{
                            left: hoverPos.x + 20, // Offset to right
                            top: hoverPos.y - 20, // Offset to top
                        }}
                    >
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {activeArtefatoId
                                ? (artefatos.find(a => a.id === activeArtefatoId)
                                    ? getIndice(artefatos.find(a => a.id === activeArtefatoId)!)
                                    : "ÍNDICE")
                                : "ÍNDICE"}
                        </p>
                        <p className="text-lg font-bold text-emerald-400">
                            {hoverValue.toFixed(2)}
                        </p>
                    </div>
                )}

                {/* Top Controls Group */}
                <div className="absolute left-6 top-6 z-[400] flex flex-col gap-3 pointer-events-none">


                    {/* Custom Zoom Controls */}
                    <div className="flex flex-col gap-1 pointer-events-auto">
                        <button
                            onClick={() => mapRef?.zoomIn()}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900/70 text-white hover:bg-slate-900/90 backdrop-blur shadow-lg transition"
                            aria-label="Zoom In"
                        >
                            <Plus className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => mapRef?.zoomOut()}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900/70 text-white hover:bg-slate-900/90 backdrop-blur shadow-lg transition"
                            aria-label="Zoom Out"
                        >
                            <Minus className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Bottom Left Controls */}
                <div className="absolute bottom-6 left-6 z-[400] flex gap-3 pointer-events-none">
                    <button
                        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900/60 text-white backdrop-blur-md ring-1 ring-white/10 transition hover:bg-slate-900/80 pointer-events-auto"
                        onClick={() => setIsFullscreen((prev) => !prev)}
                        aria-label={isFullscreen ? "Sair do modo tela cheia" : "Ativar modo tela cheia"}
                    >
                        <Maximize2 className="h-5 w-5" />
                    </button>
                    <div className="relative pointer-events-auto">
                        <button
                            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900/60 text-white backdrop-blur-md ring-1 ring-white/10 transition hover:bg-slate-900/80"
                            onClick={() => setLayerMenuOpen((prev) => !prev)}
                            aria-label="Selecionar camada do mapa"
                        >
                            <Layers className="h-5 w-5" />
                        </button>
                        {layerMenuOpen && (
                            <div className="absolute bottom-14 left-0 w-40 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_16px_30px_rgba(0,0,0,0.18)]">
                                {layerOptions.map((layer) => (
                                    <button
                                        key={layer}
                                        className={`w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${activeLayer === layer ? "bg-slate-900 text-white" : "bg-white text-slate-800 hover:bg-slate-50"
                                            }`}
                                        onClick={() => {
                                            setActiveLayer(layer);
                                            setLayerMenuOpen(false);
                                        }}
                                    >
                                        {layer}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* TIFF Upload Control */}
                    <div className="relative pointer-events-auto">
                        <input
                            type="file"
                            accept=".tiff,.tif"
                            ref={fileInputRef}
                            onChange={handleTiffUpload}
                            className="hidden"
                        />
                        <button
                            className={`flex h-12 w-12 items-center justify-center rounded-2xl backdrop-blur-md ring-1 ring-white/10 transition pointer-events-auto ${tiffLayer
                                ? "bg-blue-600/80 text-white hover:bg-blue-700/80"
                                : "bg-slate-900/60 text-white hover:bg-slate-900/80"
                                }`}
                            onClick={() => {
                                if (tiffLayer) {
                                    clearTiff();
                                } else {
                                    fileInputRef.current?.click();
                                }
                            }}
                            disabled={isTiffLoading}
                            aria-label="Carregar GeoTIFF"
                            title={tiffLayer ? "Remover TIFF" : "Carregar GeoTIFF"}
                        >
                            {isTiffLoading ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                tiffLayer ? <Trash2 className="h-5 w-5" /> : <Upload className="h-5 w-5" />
                            )}
                        </button>
                    </div>
                </div>

                {/* Detail Panel (Floating) */}
                {detailPanelOpen && selectedTalhao && (
                    <div className="absolute right-6 top-6 z-[400] w-[360px] max-h-[calc(100%-48px)] overflow-y-auto rounded-[24px] bg-white/95 shadow-[0_24px_48px_rgba(0,0,0,0.2)] backdrop-blur-xl transition-all animate-in fade-in slide-in-from-right-4">
                        <div className="p-5">
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Talhao</p>
                                    <h3 className="mt-1 text-lg font-semibold text-slate-900">{selectedTalhao.nome || selectedTalhao.codigo}</h3>
                                    <div className="flex items-center gap-1 text-sm text-slate-500">
                                        {selectedTalhao.cultura} <ArrowUpRight className="h-3 w-3" />
                                    </div>
                                </div>
                                <button onClick={() => setDetailPanelOpen(false)} className="rounded-full p-1 hover:bg-slate-100">
                                    <X className="h-5 w-5 text-slate-400" />
                                </button>
                            </div>

                            <div className="mt-6 space-y-4">
                                {/* Dados cadastrais reais */}
                                <div className="rounded-xl bg-slate-50 p-3 space-y-2">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Dados Cadastrais</p>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                        <div>
                                            <p className="text-[10px] text-slate-400">Código</p>
                                            <p className="font-semibold text-slate-900">{selectedTalhao.codigo}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-slate-400">Área</p>
                                            <p className="font-semibold text-slate-900">{selectedTalhao.areaHectares} ha</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-slate-400">Safra</p>
                                            <p className="font-semibold text-slate-900">{selectedTalhao.safra}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-slate-400">Variedade</p>
                                            <p className="font-semibold text-slate-900">{selectedTalhao.variedade || "—"}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Imagens de satélite disponíveis */}
                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                            Imagens Disponíveis
                                        </p>
                                        {artefatos.length > 0 && (
                                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                                                {artefatos.length}
                                            </span>
                                        )}
                                    </div>

                                    {isLoadingArtefatos ? (
                                        <div className="space-y-2">
                                            {[1, 2].map((i) => (
                                                <Skeleton key={i} className="h-9 w-full rounded-lg bg-slate-100" />
                                            ))}
                                        </div>
                                    ) : artefatos.length === 0 ? (
                                        <div className="flex flex-col items-center gap-1 py-3 text-center">
                                            <Scan className="h-4 w-4 text-slate-300" />
                                            <p className="text-xs text-slate-400">Nenhuma imagem processada</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-1.5">
                                            {artefatos.map((art) => {
                                                const isActive = activeArtefatoId === art.id;
                                                const isThisLoading = isTiffLoading && activeArtefatoId === art.id;
                                                return (
                                                    <button
                                                        key={art.id}
                                                        onClick={() => loadArtefatoTiff(art)}
                                                        disabled={isTiffLoading && !isThisLoading}
                                                        className={`group w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-all ${
                                                            isActive
                                                                ? "bg-emerald-500 text-white shadow-sm"
                                                                : "bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className={`rounded px-1.5 py-0.5 font-bold text-[10px] ${
                                                                isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                                                            }`}>
                                                                {getIndice(art)}
                                                            </span>
                                                            <span className="truncate font-medium">
                                                                {formatArtefatoLabel(art)}
                                                            </span>
                                                        </div>
                                                        <span className="ml-2 flex-shrink-0">
                                                            {isThisLoading ? (
                                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                            ) : isActive ? (
                                                                <Eye className="h-3.5 w-3.5" />
                                                            ) : (
                                                                <ImageIcon className="h-3.5 w-3.5 opacity-30 group-hover:opacity-60" />
                                                            )}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Clima & Solo — aguardando dados */}
                                <div className="grid grid-cols-4 gap-2 text-sm">
                                    {[
                                        { label: "LST", icon: <Thermometer className="h-3 w-3 text-orange-400" /> },
                                        { label: "Chuva", icon: <Droplets className="h-3 w-3 text-sky-400" /> },
                                        { label: "Produt.", icon: <Activity className="h-3 w-3 text-emerald-400" /> },
                                        { label: "Umidade", icon: <Droplets className="h-3 w-3 text-blue-400" /> },
                                    ].map(({ label, icon }) => (
                                        <div key={label} className="rounded-xl bg-slate-50 p-2 space-y-1">
                                            <div className="flex items-center gap-1">
                                                {icon}
                                                <p className="text-slate-500 text-[10px]">{label}</p>
                                            </div>
                                            <p className="text-xs font-semibold text-slate-400">—</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Última imagem */}
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div className="rounded-xl bg-slate-50 p-3 space-y-1">
                                        <p className="text-[10px] text-slate-400">Última imagem</p>
                                        <p className="text-xs font-semibold text-slate-400">Sem dados de satélite</p>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 p-3 space-y-1">
                                        <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                            <Sprout className="h-3 w-3 text-emerald-400" />
                                            Colheita prevista
                                        </div>
                                        <p className="text-xs font-semibold text-slate-700">{selectedTalhao.safra}</p>
                                    </div>
                                </div>

                                {/* Alertas */}
                                <div className="space-y-2">
                                    <p className="text-xs uppercase tracking-wide text-slate-500">Alertas agronômicos</p>
                                    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-400">
                                        Nenhum alerta disponível.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div >
    );
}
