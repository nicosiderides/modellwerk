import type { DesignVehicleId, LotConfig, LotLocation, LotRules } from "./types.ts";

/**
 * Normativa de lotes industriales (presets) y vehículos de diseño.
 *
 * Cada valor lleva su fuente. Los que no pudimos confirmar en un documento
 * oficial están marcados como SUPUESTO: la app los usa para verificar, pero
 * los muestra como "a confirmar" hasta cargar el reglamento real.
 */

export type RuleKey = keyof LotRules;
export type RuleSource = { text: string; url?: string; verified: boolean; kind?: "criterio" };

export type LotPreset = {
  id: string;
  name: string;
  place: string;
  summary: string;
  rules: LotRules;
  sources: Partial<Record<RuleKey, RuleSource>>;
  /** Datos del parque (no del lote) para mostrar como referencia. */
  notes: RuleSource[];
};

const SRC = {
  ecoparque: { text: "EcoParque Córdoba — parámetros publicados del loteo", url: "https://ecoparquecordoba.com.ar/", verified: true },
  ley7255: { text: "Ley provincial 7255 de Parques Industriales, art. 8 (FOS ≤ 70 %)", url: "https://agrimensorescordoba.org.ar/wp-content/uploads/2022/07/ley-no-7255-parques-industriales.pdf", verified: true },
  ord8133: { text: "Ord. 8133/85 (Uso del Suelo, Córdoba), art. 32: forestar ≥ 70 % de la superficie libre no edificable en parcelas ≥ 1 ha", url: "https://static.cordoba.gov.ar/docs/usodelsuelo/ORDENANZA8133.pdf", verified: true },
  assumed: { text: "Supuesto de diseño — confirmar con el reglamento del parque / Ord. 12.720 (Agrupamientos Industriales)", verified: false },
  assumedCorner: { text: "Supuesto — el Código de Edificación prohíbe ingresos vehiculares en la ochava (art. 2.1.4); la distancia a confirmar", url: "https://documentos.cordoba.gob.ar/MUNCBA/AreasGob/Desurb/CodigodeEdificacion.pdf", verified: false },
} satisfies Record<string, RuleSource>;

export const LOT_PRESETS: LotPreset[] = [
  {
    id: "ecoparque",
    name: "EcoParque Córdoba",
    place: "Córdoba capital · sector este (Abasto)",
    summary: "Lotes desde 2.500 m², FOS 60 %, FOT 1,5, sin límite de altura.",
    rules: {
      minArea: 2500,
      minFront: null,
      fos: 0.6,
      fot: 1.5,
      maxHeight: null,
      setbackFront: 10,
      setbackSide: 3,
      sideCount: 2,
      setbackBack: 3,
      forestOfFree: 0.7,
      forestThreshold: 10000,
      accessFromCorner: 10,
    },
    sources: {
      minArea: SRC.ecoparque,
      fos: SRC.ecoparque,
      fot: SRC.ecoparque,
      maxHeight: SRC.ecoparque,
      setbackFront: SRC.assumed,
      setbackSide: SRC.assumed,
      setbackBack: SRC.assumed,
      forestOfFree: SRC.ord8133,
      forestThreshold: SRC.ord8133,
      accessFromCorner: SRC.assumedCorner,
    },
    notes: [
      { text: "Frente medio de lotes: 35 m (dato del loteo, no es un mínimo).", url: SRC.ecoparque.url, verified: true },
      { text: "Cinturón verde perimetral del parque ≥ 20 m (Ley 7255, art. 7 i): es del parque, no del lote.", url: SRC.ley7255.url, verified: true },
      { text: "Ord. 12.720 (Agrupamientos Industriales): 10 % del predio del parque para espacios verdes y 5 % para usos comunitarios.", verified: true },
    ],
  },
  {
    id: "ley7255",
    name: "Parque industrial (Ley 7255)",
    place: "Provincia de Córdoba · requisitos generales",
    summary: "Tope provincial de FOS 70 %. Retiros a definir por cada parque.",
    rules: {
      minArea: null,
      minFront: null,
      fos: 0.7,
      fot: null,
      maxHeight: null,
      setbackFront: 10,
      setbackSide: 3,
      sideCount: 2,
      setbackBack: 3,
      forestOfFree: 0.7,
      forestThreshold: 10000,
      accessFromCorner: 10,
    },
    sources: {
      fos: SRC.ley7255,
      setbackFront: SRC.assumed,
      setbackSide: SRC.assumed,
      setbackBack: SRC.assumed,
      forestOfFree: SRC.ord8133,
      forestThreshold: SRC.ord8133,
      accessFromCorner: SRC.assumedCorner,
    },
    notes: [{ text: "Cinturón verde perimetral del parque ≥ 20 m (art. 7 i).", url: SRC.ley7255.url, verified: true }],
  },
  {
    id: "cordoba-zona",
    name: "Córdoba capital · según la zona",
    place: "Ord. 8256 y 8133 · datos de Mapas Córdoba (IDECOR)",
    summary: "Se completa sola al ubicar el lote en el mapa.",
    rules: {
      minArea: null,
      minFront: null,
      fos: null,
      fot: null,
      maxHeight: null,
      setbackFront: null,
      setbackSide: null,
      sideCount: null,
      setbackBack: null,
      forestOfFree: 0.7,
      forestThreshold: 10000,
      accessFromCorner: 10,
    },
    sources: {
      forestOfFree: SRC.ord8133,
      forestThreshold: SRC.ord8133,
      accessFromCorner: SRC.assumedCorner,
    },
    notes: [],
  },
  {
    id: "custom",
    name: "Personalizado",
    place: "Cargá los valores del reglamento de tu lote",
    summary: "Todos los parámetros editables.",
    rules: {
      minArea: null,
      minFront: null,
      fos: null,
      fot: null,
      maxHeight: null,
      setbackFront: null,
      setbackSide: null,
      sideCount: null,
      setbackBack: null,
      forestOfFree: null,
      forestThreshold: null,
      accessFromCorner: null,
    },
    sources: {},
    notes: [],
  },
];

export const presetById = (id: string) => LOT_PRESETS.find((p) => p.id === id) ?? LOT_PRESETS[0];

export type DesignVehicle = { id: DesignVehicleId; name: string; length: number; source: RuleSource };

const DEC689: RuleSource = {
  text: "Decreto 689/2026 (reemplaza el Anexo R del Dec. 779/95): ancho 2,60 m, alto 4,30 m",
  url: "https://www.infobae.com/movant/2026/07/31/actualizan-las-reglas-para-camiones-y-bitrenes-y-amplian-las-configuraciones-permitidas/",
  verified: true,
};

export const DESIGN_VEHICLES: DesignVehicle[] = [
  { id: "semi", name: "Tractor con semirremolque · 19,30 m", length: 19.3, source: DEC689 },
  { id: "rigid", name: "Camión rígido · 13,20 m", length: 13.2, source: DEC689 },
];

export const vehicleById = (id: DesignVehicleId) => DESIGN_VEHICLES.find((v) => v.id === id) ?? DESIGN_VEHICLES[0];

/** Profundidad libre para entrar marcha atrás a 90° en una maniobra (criterio práctico, no normativo). */
export const MANEUVER_FACTOR = 2;

export const LOT_DEFAULTS: LotConfig = {
  enabled: true,
  preset: "ecoparque",
  mode: "auto",
  width: 80,
  depth: 140,
  front: 40,
  left: 25,
  placement: "auto",
  corner: "none",
  rules: { ...LOT_PRESETS[0].rules },
  vehicle: "semi",
  location: null,
};

const num = (v: unknown, fallback: number, min = 0, max = 2000) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
const opt = (v: unknown, min = 0, max = 100000): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null);

export function normalizeLot(lot?: Partial<LotConfig> | null): LotConfig {
  const l = { ...LOT_DEFAULTS, ...(lot ?? {}) };
  const preset = presetById(l.preset);
  const r = { ...preset.rules, ...(l.rules ?? {}) };
  return {
    enabled: Boolean(l.enabled),
    preset: preset.id,
    mode: l.mode === "manual" ? "manual" : "auto",
    width: Math.round(num(l.width, LOT_DEFAULTS.width, 10, 1000) * 10) / 10,
    depth: Math.round(num(l.depth, LOT_DEFAULTS.depth, 10, 1000) * 10) / 10,
    front: Math.round(num(l.front, LOT_DEFAULTS.front, 0, 500) * 10) / 10,
    left: Math.round(num(l.left, LOT_DEFAULTS.left, 0, 500) * 10) / 10,
    placement: l.placement === "manual" ? "manual" : "auto",
    corner: l.corner === "east" || l.corner === "west" ? l.corner : "none",
    rules: {
      minArea: opt(r.minArea, 0, 10_000_000),
      minFront: opt(r.minFront, 0, 1000),
      fos: opt(r.fos, 0, 1),
      fot: opt(r.fot, 0, 20),
      maxHeight: opt(r.maxHeight, 0, 200),
      setbackFront: opt(r.setbackFront, 0, 200),
      setbackSide: opt(r.setbackSide, 0, 200),
      sideCount: r.sideCount === 0 || r.sideCount === 1 || r.sideCount === 2 ? r.sideCount : null,
      setbackBack: opt(r.setbackBack, 0, 200),
      forestOfFree: opt(r.forestOfFree, 0, 1),
      forestThreshold: opt(r.forestThreshold, 0, 10_000_000),
      accessFromCorner: opt(r.accessFromCorner, 0, 200),
    },
    vehicle: l.vehicle === "rigid" ? "rigid" : "semi",
    location: normalizeLocation(l.location),
  };
}

const isLonLat = (p: unknown): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === "number" && Number.isFinite(v));

/** Valida la ubicación guardada (puede venir de una URL compartida o de localStorage). */
export function normalizeLocation(location: unknown): LotLocation | null {
  if (!location || typeof location !== "object") return null;
  const l = location as LotLocation;
  if (!isLonLat(l.center) || !Array.isArray(l.ring) || l.ring.length < 3 || !l.ring.every(isLonLat)) return null;
  if (!l.fit || ![l.fit.width, l.fit.depth].every((v) => typeof v === "number" && v > 0) || !isLonLat(l.fit.origin) || !isLonLat(l.fit.s) || !isLonLat(l.fit.t)) return null;
  return {
    source: "idecor",
    fetchedAt: String(l.fetchedAt ?? ""),
    center: l.center,
    ring: l.ring,
    frontEdge: Number.isInteger(l.frontEdge) && l.frontEdge >= 0 && l.frontEdge < l.ring.length ? l.frontEdge : 0,
    streetEdges: Array.isArray(l.streetEdges) ? l.streetEdges.filter((i) => Number.isInteger(i) && i >= 0 && i < l.ring.length) : [],
    nomenclatura: String(l.nomenclatura ?? ""),
    cuenta: l.cuenta ? String(l.cuenta) : null,
    designacion: String(l.designacion ?? ""),
    superficie: Number(l.superficie) || 0,
    estado: String(l.estado ?? ""),
    localidad: String(l.localidad ?? ""),
    fit: { width: l.fit.width, depth: l.fit.depth, coverage: Number(l.fit.coverage) || 0, origin: l.fit.origin, s: l.fit.s, t: l.fit.t },
    zone: l.zone && typeof l.zone === "object" && typeof l.zone.perfil === "string" ? l.zone : null,
  };
}

/**
 * Retiro lateral exigido a cada lado. Con retiro en un solo lateral, se pone
 * del lado que de todos modos necesita más espacio (estacionamiento o camiones).
 */
export function sideSetbacks(rules: LotRules, westNeed = 0, eastNeed = 0): { west: number; east: number; count: 0 | 1 | 2 } {
  const s = rules.setbackSide ?? 0;
  const count = rules.setbackSide === null ? 0 : rules.sideCount ?? 2;
  if (count === 0 || s === 0) return { west: 0, east: 0, count: 0 };
  if (count === 2) return { west: s, east: s, count };
  return westNeed >= eastNeed ? { west: s, east: 0, count } : { west: 0, east: s, count };
}
