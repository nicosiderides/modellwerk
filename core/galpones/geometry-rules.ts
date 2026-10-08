/**
 * Proporciones VISUALES de la representación 3D.
 * No son predimensionado ni cálculo estructural: sólo buscan que el modelo
 * demostrativo se vea proporcionado. Un modelo BIM real las reemplaza.
 */

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Altura del reticulado en el apoyo (cordón superior → inferior). */
export function trussEndDepth(width: number) {
  return Math.round(clamp(width / 24, 0.9, 2.2) * 100) / 100;
}

/** Altura de alma de columna de alma llena. */
export function columnDepth(width: number, eaveHeight: number) {
  return clamp(0.22 + width / 90 + eaveHeight / 60, 0.3, 0.75);
}

/** Altura de viga en el centro de luz (pórtico). */
export function rafterDepth(width: number) {
  return clamp(0.2 + width / 75, 0.3, 0.75);
}

/** Separación nominal de correas sobre el faldón. */
export const PURLIN_SPACING = 1.5;
/** Separación nominal de largueros en cerramientos. */
export const GIRT_SPACING = 1.8;
/** Vuelo de cubierta en el alero. */
export const EAVE_OVERHANG = 0.35;
