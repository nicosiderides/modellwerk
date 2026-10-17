import type { FloorPlan } from "./plan.ts";
import type { LandConfig, LandSpec, UnitSize } from "./types.ts";

/**
 * Unidades (departamentos u oficinas): tamaño elegido y cuántas entran por piso.
 * Es una estimación por superficie, no un proyecto de plantas.
 */

export function unitSizeOf(spec: LandSpec, cfg: LandConfig): UnitSize | null {
  const sizes = spec.building.unitSizes;
  if (!sizes?.length) return null;
  return sizes.find((u) => u.id === cfg.unitSize) ?? sizes.find((u) => u.id === spec.building.defaults.unitSize) ?? sizes[0];
}

/** Superficie por unidad (null = planta libre: una unidad por piso; undefined = el tipo no tiene unidades). */
export function unitAreaOf(spec: LandSpec, cfg: LandConfig): number | null | undefined {
  const size = unitSizeOf(spec, cfg);
  if (size) return size.area;
  return spec.building.unitArea ?? undefined;
}

/** ¿Este piso tiene unidades? (la planta baja puede ser cocheras o locales). */
export function floorHasUnits(cfg: LandConfig, f: FloorPlan) {
  if (f.index > 0) return true;
  if (cfg.type === "departamentos") return !cfg.options.cocheras && !cfg.options.local;
  if (cfg.type === "oficinas") return !cfg.options.locales && !cfg.options.cocheras;
  return true;
}

export function unitsOnFloor(spec: LandSpec, cfg: LandConfig, f: FloorPlan) {
  const area = unitAreaOf(spec, cfg);
  if (area === undefined || !floorHasUnits(cfg, f)) return 0;
  if (area === null) return 1;
  return Math.max(1, Math.floor((f.area * spec.building.efficiency) / area));
}
