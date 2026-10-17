import { toLot, type ParcelAnalysis, type XY } from "../../galpones/geo/parcel.ts";
import type { Envelope } from "../envelope/envelope.ts";

/**
 * Coordenadas "del lote" (las de MW Land en 3D):
 *   x = a lo largo del frente, desde la esquina frente-oeste del rectángulo útil.
 *   z = hacia el fondo, desde la línea municipal.
 * Son las mismas que usa el piso de foto aérea de Galpones, así todo calza.
 */

export type Rect = { x0: number; x1: number; z0: number; z1: number };

export const rectW = (r: Rect) => r.x1 - r.x0;
export const rectD = (r: Rect) => r.z1 - r.z0;
export const rectArea = (r: Rect) => Math.max(0, rectW(r)) * Math.max(0, rectD(r));
export const intersect = (a: Rect, b: Rect): Rect | null => {
  const r = { x0: Math.max(a.x0, b.x0), x1: Math.min(a.x1, b.x1), z0: Math.max(a.z0, b.z0), z1: Math.min(a.z1, b.z1) };
  return r.x1 - r.x0 > 0.3 && r.z1 - r.z0 > 0.3 ? r : null;
};

/** Pasa polígonos del marco local (este, norte) a coordenadas del lote. */
export const toLotCoords = (analysis: ParcelAnalysis, pieces: XY[][]): XY[][] => pieces.map((p) => p.map((q) => toLot(analysis.fit.axes, q)));

/** Rectángulo más grande alineado con el frente dentro de un polígono (escaneo por filas + histograma). */
export function largestRect(poly: XY[], cells = 360): Rect | null {
  if (poly.length < 3) return null;
  const xs = poly.map((p) => p[0]);
  const zs = poly.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minZ = Math.min(...zs);
  const spanX = Math.max(...xs) - minX;
  const spanZ = Math.max(...zs) - minZ;
  const step = Math.max(0.1, Math.max(spanX, spanZ) / cells);
  const cols = Math.max(1, Math.ceil(spanX / step));
  const rows = Math.max(1, Math.ceil(spanZ / step));
  const heights = new Array(cols).fill(0);
  let best = { area: 0, c0: 0, c1: 0, r0: 0, r1: 0 };
  for (let r = 0; r < rows; r += 1) {
    const z = minZ + (r + 0.5) * step;
    const cuts: number[] = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
      const [xi, zi] = poly[i];
      const [xj, zj] = poly[j];
      if (zi > z !== zj > z) cuts.push(((xj - xi) * (z - zi)) / (zj - zi) + xi);
    }
    cuts.sort((a, b) => a - b);
    for (let c = 0; c < cols; c += 1) {
      const xa = minX + c * step;
      const xb = xa + step;
      let inside = false;
      for (let k = 0; k + 1 < cuts.length; k += 2) if (xa >= cuts[k] - 1e-6 && xb <= cuts[k + 1] + 1e-6) inside = true;
      heights[c] = inside ? heights[c] + 1 : 0;
    }
    // histograma: rectángulo más grande que termina en esta fila
    const stack: number[] = [];
    for (let c = 0; c <= cols; c += 1) {
      const h = c < cols ? heights[c] : 0;
      while (stack.length && heights[stack[stack.length - 1]] >= h) {
        const top = stack.pop()!;
        const height = heights[top];
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        const area = height * (c - left);
        if (height > 0 && area > best.area) best = { area, c0: left, c1: c, r0: r - height + 1, r1: r + 1 };
      }
      stack.push(c);
    }
  }
  if (best.area === 0) return null;
  return { x0: minX + best.c0 * step, x1: minX + best.c1 * step, z0: minZ + best.r0 * step, z1: minZ + best.r1 * step };
}

/** El mayor rectángulo entre varias piezas. */
export function largestRectOf(polys: XY[][]): Rect | null {
  let best: Rect | null = null;
  for (const p of polys) {
    const r = largestRect(p);
    if (r && (!best || rectArea(r) > rectArea(best))) best = r;
  }
  return best;
}

export type UsableTier = { from: number; to: number; rect: Rect | null };

/** Rectángulo útil de cada tramo de altura de la caja (en coordenadas del lote). */
export function usableTiers(analysis: ParcelAnalysis, env: Envelope): UsableTier[] {
  return env.tiers.map((t) => ({ from: t.from, to: t.to, rect: largestRectOf(toLotCoords(analysis, t.pieces)) }));
}
