import { normalizeConfig } from "@/core/galpones/configuration";
import { zoneFromCordoba, type ZoneResult } from "@/core/galpones/geo/cordobaZoning";
import { blockAt, mainRoadsIn, outerRing, zoningAt, type Feature, type ParcelProps } from "@/core/galpones/geo/idecor";
import { buildLotLocation, lotPatchFromLocation } from "@/core/galpones/geo/lotFromParcel";
import { analyzeParcel, fitPointToLonLat, type LonLat, type ParcelAnalysis } from "@/core/galpones/geo/parcel";
import { blockingIssues, fitToLot } from "@/core/galpones/lotLimits";
import { planSite } from "@/core/galpones/sitePlan";
import type { LotLocation, WarehouseConfig, WarehouseDefinition } from "@/core/galpones/types";

/**
 * Lógica del lote elegido en el mapa (sin dibujo): consulta catastro y
 * normativa, analiza la forma y arma la vista previa del galpón en el lote.
 */

export type ZoneStatus = "loading" | "ok" | "none" | "error";

export type LotSelection = {
  parcel: Feature<ParcelProps>;
  ring: LonLat[];
  analysis: ParcelAnalysis;
  /** Manzana y vías principales (para recalcular si el usuario elige otro frente). */
  block: LonLat[] | null;
  roads: LonLat[][];
  zone: ZoneResult | null;
  zoneRaw: Awaited<ReturnType<typeof zoningAt>> | null;
  zoneStatus: ZoneStatus;
  location: LotLocation;
};

const ringBBox = (ring: LonLat[], padDeg = 0.0015): [number, number, number, number] => [
  Math.min(...ring.map((p) => p[0])) - padDeg,
  Math.min(...ring.map((p) => p[1])) - padDeg,
  Math.max(...ring.map((p) => p[0])) + padDeg,
  Math.max(...ring.map((p) => p[1])) + padDeg,
];

/** Ancho real del frente elegido (algunas zonas cambian sus reglas según ese ancho). */
export const frontLength = (a: ParcelAnalysis) => a.sides.find((s) => s.edges.includes(a.frontEdge))?.length ?? a.edges[a.frontEdge]?.length ?? a.fit.width;

function compose(parcel: Feature<ParcelProps>, ring: LonLat[], block: LonLat[] | null, roads: LonLat[][], zoneRaw: LotSelection["zoneRaw"], zoneStatus: ZoneStatus, preferredFront: number | null): LotSelection {
  const analysis = analyzeParcel(ring, { block, mainRoads: roads, preferredFront });
  const zone = zoneRaw && (zoneRaw.z8256 || zoneRaw.z8133) ? zoneFromCordoba(zoneRaw.z8256, zoneRaw.z8133, frontLength(analysis)) : null;
  return { parcel, ring, analysis, block, roads, zone, zoneRaw, zoneStatus, location: buildLotLocation(parcel, analysis, zone) };
}

/** Primer análisis inmediato (sin consultas): sirve para dibujar el lote enseguida. */
export function quickSelection(parcel: Feature<ParcelProps>): LotSelection {
  return compose(parcel, outerRing(parcel.geometry), null, [], null, "loading", null);
}

/** Análisis completo: manzana (lados a la calle), vías principales y normativa de la zona. */
export async function fullSelection(parcel: Feature<ParcelProps>, signal?: AbortSignal): Promise<LotSelection> {
  const ring = outerRing(parcel.geometry);
  const center = ring.reduce<LonLat>((acc, p) => [acc[0] + p[0] / ring.length, acc[1] + p[1] / ring.length], [0, 0]);
  const [block, roads, zoning] = await Promise.all([
    blockAt(center, signal).catch(() => null),
    mainRoadsIn(ringBBox(ring), signal).catch(() => [] as LonLat[][]),
    zoningAt(center, signal).then(
      (z) => ({ z, status: (z.z8256 || z.z8133 ? "ok" : "none") as ZoneStatus }),
      () => ({ z: null, status: "error" as ZoneStatus })
    ),
  ]);
  if (signal?.aborted) throw new DOMException("Cancelado", "AbortError");
  return compose(parcel, ring, block, roads, zoning.z, zoning.status, null);
}

/** Recalcula con otro lado como frente. */
export const withFront = (sel: LotSelection, edge: number) => compose(sel.parcel, sel.ring, sel.block, sel.roads, sel.zoneRaw, sel.zoneStatus, edge);

export type LotPreview = {
  config: WarehouseConfig;
  /** El galpón actual entra tal cual. */
  fitsAsIs: boolean;
  /** Entra después de ajustarlo (cambian sus medidas). */
  resized: boolean;
  /** Ni achicándolo entra. */
  impossible: boolean;
};

/** Cómo queda el galpón de la configuración actual en este lote. */
export function previewFor(definition: WarehouseDefinition, config: WarehouseConfig, sel: LotSelection): LotPreview {
  const placed = normalizeConfig(definition, { ...config, lot: { ...config.lot, ...lotPatchFromLocation(sel.location, sel.analysis.corner, sel.zone) } });
  const fitsAsIs = blockingIssues(placed, definition).length === 0;
  const fitted = fitsAsIs ? placed : fitToLot(definition, placed);
  const impossible = blockingIssues(fitted, definition).length > 0;
  const resized = !fitsAsIs && (fitted.dimensions.width !== config.dimensions.width || fitted.dimensions.length !== config.dimensions.length || fitted.variant !== config.variant);
  return { config: fitted, fitsAsIs, resized, impossible };
}

type Poly = { type: "Feature"; properties: Record<string, unknown>; geometry: { type: "Polygon"; coordinates: LonLat[][] } };
type Line = { type: "Feature"; properties: Record<string, unknown>; geometry: { type: "LineString"; coordinates: LonLat[] } };
const poly = (ring: LonLat[], properties: Record<string, unknown> = {}): Poly => ({ type: "Feature", properties, geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] } });
const fc = <T>(features: T[]) => ({ type: "FeatureCollection" as const, features });

/** Capas del dibujo del lote: contorno, máscara (oscurece el resto) y lados a la calle. */
export function lotOverlays(sel: LotSelection) {
  const { analysis } = sel;
  const ring = analysis.ringLonLat;
  const world: LonLat[] = [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
  ];
  const mask = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...world, world[0]], [...ring, ring[0]].reverse()] } };
  const frontSide = analysis.sides.find((s) => s.edges.includes(analysis.frontEdge));
  const frontEdges = frontSide?.edges ?? [analysis.frontEdge];
  const lines: Line[] = analysis.streetEdges.map((i) => ({
    type: "Feature",
    properties: { front: frontEdges.includes(i) },
    geometry: { type: "LineString", coordinates: [ring[i], ring[(i + 1) % ring.length]] },
  }));
  return { mask, lines: fc(lines), lot: fc([poly(ring)]) };
}

/** Huella del galpón, rectángulo útil y línea de retiros del plan del galpón, en lon/lat. */
export function warehouseOverlays(definition: WarehouseDefinition, sel: LotSelection, preview: LotPreview) {
  const plan = planSite(preview.config, definition);
  const fit = sel.location.fit;
  const L = plan.lotRect;
  if (!L) return { guides: fc<Poly>([]), ghost: fc<Poly>([]) };
  const P = (x: number, z: number) => fitPointToLonLat(fit, x - L.x0, z - L.z0);
  const box = (r: { x0: number; x1: number; z0: number; z1: number }) => [P(r.x0, r.z0), P(r.x1, r.z0), P(r.x1, r.z1), P(r.x0, r.z1)];
  const guides: Poly[] = [poly(box(L), { kind: "usable" })];
  if (plan.buildable) guides.push(poly(box(plan.buildable), { kind: "buildable" }));
  const ghost: Poly[] = [poly(box(plan.footprint), { h: plan.lay.ridge, base: 0, kind: "body" })];
  if (plan.canopy) ghost.push(poly(box(plan.canopy), { h: Math.max(3, plan.lay.canopy?.height ?? 5), base: Math.max(2.4, (plan.lay.canopy?.height ?? 5) - 0.4), kind: "canopy" }));
  return { guides: fc(guides), ghost: fc(ghost) };
}
