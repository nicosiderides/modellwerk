import type { XY } from "../../galpones/geo/parcel.ts";

/**
 * Geometría plana mínima para la caja máxima: recortar polígonos con
 * semiplanos (un retiro es "quedarse del lado de adentro de una línea")
 * y medir superficies. Coordenadas locales en metros.
 */

/** Semiplano n·p + k ≥ 0 (lo que queda adentro). */
export type HalfPlane = { n: XY; k: number };

export const dot = (a: XY, b: XY) => a[0] * b[0] + a[1] * b[1];

export function polygonArea(poly: XY[]) {
  let s = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

export const totalArea = (pieces: XY[][]) => pieces.reduce((sum, p) => sum + polygonArea(p), 0);

/** Recorta un polígono con un semiplano (Sutherland–Hodgman). */
export function clip(poly: XY[], h: HalfPlane): XY[] {
  const out: XY[] = [];
  const f = (p: XY) => dot(h.n, p) + h.k;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const fa = f(a);
    const fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return dedupe(out);
}

function dedupe(poly: XY[]) {
  const out: XY[] = [];
  for (const p of poly) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6) out.push(p);
  }
  if (out.length > 1) {
    const a = out[0];
    const z = out[out.length - 1];
    if (Math.hypot(a[0] - z[0], a[1] - z[1]) < 1e-6) out.pop();
  }
  return out;
}

export const clipAll = (pieces: XY[][], h: HalfPlane, minArea = 0.25) => pieces.map((p) => clip(p, h)).filter((p) => p.length >= 3 && polygonArea(p) > minArea);

/**
 * Semiplano "a más de d metros del lado a→b, hacia adentro".
 * El polígono va en sentido antihorario: adentro queda a la izquierda.
 */
export function insideOfEdge(a: XY, b: XY, d: number): HalfPlane {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const n: XY = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  return { n, k: -dot(n, a) - d };
}

type Axes = { origin: XY; s: XY; t: XY };
type Box = { s0: number; s1: number; t0: number; t1: number };

/** Semiplanos sobre los ejes del lote: s ≥ v (sign 1) o s ≤ v (sign −1); igual con t. */
const axisPlane = (axis: XY, origin: XY, sign: 1 | -1, v: number): HalfPlane => ({ n: [axis[0] * sign, axis[1] * sign], k: -sign * (dot(axis, origin) + v) });

/** La parte de cada pieza que cae dentro de un rectángulo (en los ejes del lote). */
export function insideBox(pieces: XY[][], axes: Axes, box: Box, minArea = 0.25): XY[][] {
  let out = clipAll(pieces, axisPlane(axes.s, axes.origin, 1, box.s0), 0);
  out = clipAll(out, axisPlane(axes.s, axes.origin, -1, box.s1), 0);
  out = clipAll(out, axisPlane(axes.t, axes.origin, 1, box.t0), 0);
  return clipAll(out, axisPlane(axes.t, axes.origin, -1, box.t1), minArea);
}

/** Saca un rectángulo (en los ejes del lote) de cada pieza: devuelve lo que queda alrededor. */
export function subtractBox(pieces: XY[][], axes: Axes, box: Box, minArea = 0.25): XY[][] {
  const hs = (sign: 1 | -1, v: number) => axisPlane(axes.s, axes.origin, sign, v);
  const ht = (sign: 1 | -1, v: number) => axisPlane(axes.t, axes.origin, sign, v);
  const out: XY[][] = [];
  for (const p of pieces) {
    out.push(...clipAll([p], hs(-1, box.s0), minArea)); // s ≤ s0
    out.push(...clipAll([p], hs(1, box.s1), minArea)); // s ≥ s1
    const mid = clipAll(clipAll([p], hs(1, box.s0), 0), hs(-1, box.s1), 0);
    out.push(...clipAll(mid, ht(-1, box.t0), minArea)); // t ≤ t0
    out.push(...clipAll(mid, ht(1, box.t1), minArea)); // t ≥ t1
  }
  return out;
}

/** Distancia desde p, en la dirección dir, hasta el primer borde de algún polígono (o null). */
export function rayHit(p: XY, dir: XY, rings: XY[][], maxDist = 80): number | null {
  let best: number | null = null;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const e: XY = [b[0] - a[0], b[1] - a[1]];
      const den = dir[0] * e[1] - dir[1] * e[0];
      if (Math.abs(den) < 1e-9) continue;
      const w: XY = [a[0] - p[0], a[1] - p[1]];
      const t = (w[0] * e[1] - w[1] * e[0]) / den;
      const u = (w[0] * dir[1] - w[1] * dir[0]) / den;
      if (t > 0.3 && t <= maxDist && u >= 0 && u <= 1 && (best === null || t < best)) best = t;
    }
  }
  return best;
}
