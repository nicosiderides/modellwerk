import { IDECOR_WFS, blockAt, blocksInBBox, mainRoadsIn, outerRing, type Feature, type ParcelProps } from "../../galpones/geo/idecor.ts";
import { analyzeParcel, pointInRing, toXY, type LonLat, type ParcelAnalysis, type XY } from "../../galpones/geo/parcel.ts";
import { buildingType } from "../buildingTypes.ts";
import { computeEnvelope, type Envelope } from "../envelope/envelope.ts";
import { landZoneFromCordoba, MAPAS_CORDOBA_URL, type Ord8133Full, type Ord8256Full } from "../zoning/cordoba.ts";
import type { BlockCenter, BuildingTypeId, Heritage, LandRules, LandZone, RuleKey, UseGroup } from "../types.ts";

/**
 * Estudio de un lote real: catastro + normativa + caja máxima.
 * Las consultas van directo a los servicios abiertos de IDECOR (Mapas Córdoba)
 * desde el navegador; `composeStudy` es pura (sin red) y es la que se prueba.
 */

export type ZoneStatus = "loading" | "ok" | "none" | "error";

export type CentroManzanaProps = { centro_manzana?: string | null; caracteristica?: string | null; ordenanza?: string | null; nomenclatura?: string | null };
export type CatalogadoProps = { identifica?: string | null; tipo?: string | null; categoria?: string | null; ubicacion?: string | null };
export type AppProps = { nombre_app?: string | null };

/** Datos crudos traídos de IDECOR para un lote. */
export type LotContext = {
  block: LonLat[] | null;
  roads: LonLat[][];
  blocks: LonLat[][];
  z8256: Ord8256Full | null;
  z8133: Ord8133Full | null;
  centroManzana: CentroManzanaProps | null;
  catalogado: CatalogadoProps[];
  app: AppProps[];
};

export type LotStudy = {
  parcel: Feature<ParcelProps>;
  ring: LonLat[];
  analysis: ParcelAnalysis;
  context: LotContext | null;
  status: ZoneStatus;
  zone: LandZone | null;
  blockCenter: BlockCenter | null;
  heritage: Heritage;
};

/** Valores que el usuario cargó a mano (pisan los de la zona). */
export type RuleOverrides = Partial<Record<RuleKey, number | null>>;

/* ─────────────────────────── consultas ─────────────────────────── */

async function getJson<T>(url: string, signal?: AbortSignal, timeoutMs = 15000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function wfs(layer: string, filter: string, count = 5) {
  const params = new URLSearchParams({ service: "WFS", version: "2.0.0", request: "GetFeature", typeNames: layer, outputFormat: "application/json", srsName: "EPSG:4326", count: String(count), CQL_FILTER: filter });
  return `${IDECOR_WFS}?${params.toString()}`;
}

const point = ([lon, lat]: LonLat) => `SRID=4326;POINT(${lon.toFixed(7)} ${lat.toFixed(7)})`;
type FC<P> = { features: { properties: P; geometry: unknown }[] };

export const ringCenter = (ring: LonLat[]): LonLat => ring.reduce<LonLat>((acc, p) => [acc[0] + p[0] / ring.length, acc[1] + p[1] / ring.length], [0, 0]);
const bbox = (ring: LonLat[], pad: number): [number, number, number, number] => [Math.min(...ring.map((p) => p[0])) - pad, Math.min(...ring.map((p) => p[1])) - pad, Math.max(...ring.map((p) => p[0])) + pad, Math.max(...ring.map((p) => p[1])) + pad];

/** Trae manzana, calles, normativa completa, centro de manzana y protección patrimonial. */
export async function fetchLotContext(parcel: Feature<ParcelProps>, signal?: AbortSignal): Promise<LotContext> {
  const ring = outerRing(parcel.geometry);
  const c = ringCenter(ring);
  const first = <P>(fc: FC<P> | null) => fc?.features[0]?.properties ?? null;
  const [block, roads, blocks, z8256, z8133, cm, cat, app] = await Promise.all([
    blockAt(c, signal).catch(() => null),
    mainRoadsIn(bbox(ring, 0.0015), signal).catch(() => [] as LonLat[][]),
    blocksInBBox(bbox(ring, 0.0009), signal).catch(() => [] as LonLat[][]),
    getJson<FC<Ord8256Full>>(wfs("idecor:CBA_Ordenanza_8256", `INTERSECTS(geom, ${point(c)})`, 1), signal),
    getJson<FC<Ord8133Full>>(wfs("idecor:CBA_Ordenanza_8133", `INTERSECTS(geom, ${point(c)})`, 1), signal).catch(() => null),
    getJson<FC<CentroManzanaProps>>(wfs("idecor:CBA_Centro_de_Manzana_8256", `INTERSECTS(geom, ${point(c)})`, 1), signal).catch(() => null),
    getJson<FC<CatalogadoProps>>(wfs("idecor:cba_inmuebles_catalogados", `INTERSECTS(geom, ${point(c)})`, 5), signal).catch(() => null),
    getJson<FC<AppProps>>(wfs("idecor:cba_area_de_proteccion_patrimonial", `INTERSECTS(geom, ${point(c)})`, 5), signal).catch(() => null),
  ]);
  return {
    block,
    roads,
    blocks,
    z8256: first(z8256),
    z8133: first(z8133),
    centroManzana: first(cm),
    catalogado: cat?.features.map((f) => f.properties) ?? [],
    app: app?.features.map((f) => f.properties) ?? [],
  };
}

/* ─────────────────────────── armado (puro) ─────────────────────────── */

export function blockCenterFrom(props: CentroManzanaProps | null): BlockCenter | null {
  if (!props) return null;
  const label = (props.centro_manzana ?? "").trim();
  const source = { kind: "interpretado" as const, text: `Centro de manzana (Ord. 8256, capa de Mapas Córdoba): «${label}»${props.ordenanza ? ` — ${props.ordenanza}` : ""}`, url: MAPAS_CORDOBA_URL };
  if (/NO exigible/i.test(label)) return { kind: "no-exigible", label, source };
  if (/T[íi]pica/i.test(label) && /2\/7/.test(props.caracteristica ?? "")) return { kind: "tipica", label, source };
  if (label) return { kind: "otra", label, source };
  return null;
}

export function heritageFrom(ctx: LotContext | null): Heritage {
  if (!ctx) return [];
  const out: Heritage = [];
  for (const c of ctx.catalogado) out.push({ label: `Inmueble catalogado${c.categoria ? ` (valor ${String(c.categoria).toLowerCase()})` : ""}`, detail: [c.identifica, c.tipo].filter(Boolean).join(" · ") });
  for (const a of ctx.app) out.push({ label: "Área de protección patrimonial", detail: String(a.nombre_app ?? "") });
  return out;
}

/** Ancho del frente elegido. */
export const frontWidthOf = (a: ParcelAnalysis) => a.sides.find((s) => s.edges.includes(a.frontEdge))?.length ?? a.edges[a.frontEdge]?.length ?? a.fit.width;

export function composeStudy(parcel: Feature<ParcelProps>, context: LotContext | null, status: ZoneStatus, preferredFront: number | null = null): LotStudy {
  const ring = outerRing(parcel.geometry);
  const analysis = analyzeParcel(ring, { block: context?.block ?? null, mainRoads: context?.roads ?? [], preferredFront });
  const zone = context && (context.z8256 || context.z8133) ? landZoneFromCordoba(context.z8256, context.z8133, { frontWidth: frontWidthOf(analysis), area: analysis.area, corner: analysis.corner !== "none" }) : null;
  return { parcel, ring, analysis, context, status, zone, blockCenter: blockCenterFrom(context?.centroManzana ?? null), heritage: heritageFrom(context) };
}

/* ─────────────────────────── reglas efectivas y caja ─────────────────────────── */

/** Reglas del grupo de uso con los valores que cargó el usuario. */
export function effectiveRules(zone: LandZone, group: UseGroup, overrides: RuleOverrides): LandRules {
  const base = zone.rules[group];
  const out: LandRules = { ...base };
  for (const [key, value] of Object.entries(overrides) as [RuleKey, number | null | undefined][]) {
    if (value === undefined) continue;
    const prev = base[key];
    out[key] = { ...prev, value, source: { kind: "cargado", text: "Valor que cargaste vos" } } as never;
    if (key === "maxHeight") (out.maxHeight as LandRules["maxHeight"]).unlimited = false;
  }
  return out;
}

export function studyEnvelope(study: LotStudy, typeId: BuildingTypeId, overrides: RuleOverrides = {}): { rules: LandRules; envelope: Envelope } | null {
  if (!study.zone) return null;
  const type = buildingType(typeId);
  const rules = effectiveRules(study.zone, type.group, overrides);
  const f = study.analysis.frame;
  const local = (r: LonLat[]): XY[] => r.map((p) => toXY(f, p));
  const block = study.context?.block ? local(study.context.block) : null;
  // Manzanas vecinas: todas menos la del lote (la que contiene su centro).
  const inside: XY = toXY(f, ringCenter(study.ring));
  const neighbors = (study.context?.blocks ?? []).map(local).filter((b) => !pointInRing(inside, b));
  const envelope = computeEnvelope({ analysis: study.analysis, rules, type, block, neighborBlocks: neighbors, blockCenter: study.blockCenter });
  return { rules, envelope };
}
