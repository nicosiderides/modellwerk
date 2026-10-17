import { toLonLat, type LonLat, type XY } from "@/core/galpones/geo/parcel";
import type { Envelope } from "@/core/land/envelope/envelope";
import type { LotStudy } from "@/core/land/geo/study";

/**
 * Dibujos de MW Land sobre el mapa (GeoJSON en lon/lat): contorno del lote,
 * máscara que oscurece el resto, lados a la calle, planta edificable,
 * centro de manzana y la caja máxima en 3D (bloques extruidos por altura).
 */

type Poly = { type: "Feature"; properties: Record<string, unknown>; geometry: { type: "Polygon"; coordinates: LonLat[][] } };
type Line = { type: "Feature"; properties: Record<string, unknown>; geometry: { type: "LineString"; coordinates: LonLat[] } };
export const EMPTY = { type: "FeatureCollection" as const, features: [] };
const fc = <T>(features: T[]) => ({ type: "FeatureCollection" as const, features });
const poly = (ring: LonLat[], properties: Record<string, unknown> = {}): Poly => ({ type: "Feature", properties, geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] } });

export function lotOverlays(study: LotStudy) {
  const a = study.analysis;
  const ring = a.ringLonLat;
  const world: LonLat[] = [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
  ];
  const mask = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...world, world[0]], [...ring, ring[0]].reverse()] } };
  const frontSide = a.sides.find((s) => s.edges.includes(a.frontEdge));
  const frontEdges = frontSide?.edges ?? [a.frontEdge];
  const lines: Line[] = a.streetEdges.map((i) => ({
    type: "Feature",
    properties: { front: frontEdges.includes(i) },
    geometry: { type: "LineString", coordinates: [ring[i], ring[(i + 1) % ring.length]] },
  }));
  return { mask, lines: fc(lines), lot: fc([poly(ring)]) };
}

/** Caja máxima, planta edificable y centro de manzana, listos para el mapa. */
export function envelopeOverlays(study: LotStudy, env: Envelope) {
  const f = study.analysis.frame;
  const ll = (piece: XY[]) => piece.map((p) => toLonLat(f, p));
  const ground = fc(env.ground.map((p) => poly(ll(p), { kind: "ground" })));
  const center = fc(env.blockCenter.map((p) => poly(ll(p), { kind: "center" })));
  const boxes: Poly[] = [];
  env.tiers.forEach((tier, i) => {
    for (const piece of tier.pieces) boxes.push(poly(ll(piece), { base: tier.from, h: tier.to, tier: i, upper: i > 0 }));
  });
  return { ground, center, boxes: fc(boxes) };
}
