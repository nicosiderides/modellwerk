import type { SiteConfig } from "./types.ts";

/** Valores iniciales y límites del entorno (veredas, estacionamiento, playón). */
export const SITE_DEFAULTS: SiteConfig = { sidewalk: 1.5, parking: 16, parkingSide: "west", truckYard: true, landscape: true };

export const SITE_LIMITS = {
  sidewalk: { min: 0, max: 4, step: 0.5 },
  parking: { min: 0, max: 120, step: 2 },
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function normalizeSite(site?: Partial<SiteConfig> | null): SiteConfig {
  const s = { ...SITE_DEFAULTS, ...(site ?? {}) };
  const sw = Number.isFinite(s.sidewalk) ? s.sidewalk : SITE_DEFAULTS.sidewalk;
  const pk = Number.isFinite(s.parking) ? s.parking : SITE_DEFAULTS.parking;
  return {
    sidewalk: Math.round(clamp(sw, SITE_LIMITS.sidewalk.min, SITE_LIMITS.sidewalk.max) * 10) / 10,
    parking: Math.round(clamp(pk, SITE_LIMITS.parking.min, SITE_LIMITS.parking.max)),
    parkingSide: s.parkingSide === "back" ? "back" : "west",
    truckYard: Boolean(s.truckYard),
    landscape: Boolean(s.landscape),
  };
}
