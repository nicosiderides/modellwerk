import { localFrame, toLonLat, toXY, type LonLat, type XY } from "./parcel.ts";

/**
 * Cuentas de mapa (sin dibujo): mosaicos Web Mercator y el paso entre
 * lon/lat y las coordenadas del lote del configurador.
 */

export const TILE = 256;

/** Lon/lat → píxel "mundial" de Web Mercator al zoom z. */
export function worldPx([lon, lat]: LonLat, z: number): XY {
  const size = TILE * 2 ** z;
  const phi = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180;
  return [((lon + 180) / 360) * size, ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * size];
}

/** Píxel mundial → lon/lat. */
export function worldPxToLonLat([x, y]: XY, z: number): LonLat {
  const size = TILE * 2 ** z;
  const lon = (x / size) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / size;
  return [lon, (180 / Math.PI) * Math.atan(Math.sinh(n))];
}

/** Metros por píxel al zoom z, en esa latitud. */
export const metersPerPx = (lat: number, z: number) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;

/**
 * Coordenadas del lote del configurador: x desde el lindero oeste del
 * rectángulo útil (hacia el este, "s"), z desde la línea municipal (hacia el
 * fondo, "t"). Son las mismas del entorno 3D, corridas al rincón del lote.
 */
export type LotTransform = { toLocal: (p: LonLat) => XY; toLonLat: (p: XY) => LonLat };

export function lotTransform(fit: { origin: LonLat; s: XY; t: XY }): LotTransform {
  const frame = localFrame(fit.origin);
  const { s, t } = fit;
  return {
    toLocal: (p) => {
      const [e, n] = toXY(frame, p);
      return [e * s[0] + n * s[1], e * t[0] + n * t[1]];
    },
    toLonLat: ([x, z]) => toLonLat(frame, [s[0] * x + t[0] * z, s[1] * x + t[1] * z]),
  };
}

/** Un nivel del mapa: un recorte cuadrado (norte arriba) a un zoom dado. */
export type MapLevel = {
  z: number;
  /** Recorte en píxeles mundiales [x0, y0, x1, y1]. */
  px: [number, number, number, number];
  /** Mosaicos que lo cubren. */
  tiles: { x: number; y: number }[];
};

/** Recorte de ±half metros alrededor de un punto, al zoom z. */
export function mapLevel(center: LonLat, half: number, z: number): MapLevel {
  const [cx, cy] = worldPx(center, z);
  const r = half / metersPerPx(center[1], z);
  const px: MapLevel["px"] = [cx - r, cy - r, cx + r, cy + r];
  const tiles: MapLevel["tiles"] = [];
  for (let y = Math.floor(px[1] / TILE); y <= Math.floor((px[3] - 1e-6) / TILE); y += 1)
    for (let x = Math.floor(px[0] / TILE); x <= Math.floor((px[2] - 1e-6) / TILE); x += 1) tiles.push({ x, y });
  // Primero los del centro: se ve el lote antes que los bordes.
  const mid = [(px[0] + px[2]) / 2 / TILE - 0.5, (px[1] + px[3]) / 2 / TILE - 0.5];
  tiles.sort((a, b) => Math.hypot(a.x - mid[0], a.y - mid[1]) - Math.hypot(b.x - mid[0], b.y - mid[1]));
  return { z, px, tiles };
}

/** Lon/lat de un punto del recorte, con u, v en [0, 1] (v = 0 arriba = norte). */
export const levelLonLat = (level: MapLevel, u: number, v: number): LonLat =>
  worldPxToLonLat([level.px[0] + (level.px[2] - level.px[0]) * u, level.px[1] + (level.px[3] - level.px[1]) * v], level.z);
