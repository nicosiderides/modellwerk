import type { FoundationId } from "./types.ts";

/**
 * Medidas REFERENCIALES de cada tipo de fundación (para el 3D, la lámina y la
 * ficha). No son cálculo: el tamaño final lo define el estudio de suelos.
 * Crecen un poco con la luz del galpón para que la escala se vea razonable.
 */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Cara inferior de la platea (la parte de arriba de las fundaciones). */
export const SLAB_BOTTOM = -0.2;

export function foundationSizes(width: number) {
  const pad = r2(clamp(1.3 + width * 0.015, 1.4, 2.2));
  return {
    /** Bases aisladas: lado de la zapata (columnas de pórtico / de testero), espesor, fondo y fuste. */
    pad: { side: pad, sideGable: r2(Math.max(1.1, pad * 0.7)), thickness: 0.5, bottom: -1.5, stem: 0.45 },
    /** Zapata corrida: ancho, espesor, fondo; viga de fundación encima. */
    strip: { width: r2(clamp(0.8 + width * 0.006, 0.8, 1.2)), thickness: 0.4, bottom: -1.2, stemWidth: 0.3 },
    /** Pilotes: largo, diámetros, cabezal y vigas de encadenado. */
    piles: { length: r2(clamp(7 + width * 0.05, 8, 12)), diameter: 0.4, diameterGable: 0.35, capHeight: 0.6, capMain: [1.6, 0.8] as const, capGable: [0.8, 0.8] as const, spacing: 1, beam: [0.25, 0.4] as const },
  };
}

export type FoundationSizes = ReturnType<typeof foundationSizes>;

export const isFoundation = (id: string): id is FoundationId => id === "padFootings" || id === "stripFooting" || id === "piles";
