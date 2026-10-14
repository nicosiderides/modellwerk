import { presetById } from "../lotRules.ts";
import type { LotConfig, LotLocation } from "../types.ts";
import type { ZoneResult } from "./cordobaZoning.ts";
import type { Feature, ParcelProps } from "./idecor.ts";
import { toLonLat, type ParcelAnalysis } from "./parcel.ts";

/** Arma la ubicación que se guarda en la configuración a partir de la parcela analizada. */
export function buildLotLocation(parcel: Feature<ParcelProps>, analysis: ParcelAnalysis, zone: ZoneResult | null, now = new Date()): LotLocation {
  const p = parcel.properties;
  const official = (p.Superficie_Tierra_Urbana ?? 0) + (p.Superficie_Tierra_Rural ?? 0);
  return {
    source: "idecor",
    fetchedAt: now.toISOString(),
    center: analysis.ringLonLat.reduce<[number, number]>((acc, q) => [acc[0] + q[0] / analysis.ringLonLat.length, acc[1] + q[1] / analysis.ringLonLat.length], [0, 0]),
    ring: analysis.ringLonLat.map(([lon, lat]) => [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7]),
    frontEdge: analysis.frontEdge,
    streetEdges: analysis.streetEdges,
    nomenclatura: p.Nomenclatura ?? "",
    cuenta: p.Nro_Cuenta ? String(p.Nro_Cuenta) : null,
    designacion: (p.desig_oficial ?? "").trim(),
    superficie: Math.round(official > 0 ? official : analysis.area),
    estado: p.Estado ?? "",
    localidad: p.localidad ?? "",
    fit: {
      width: analysis.fit.width,
      depth: analysis.fit.depth,
      coverage: analysis.fit.coverage,
      origin: toLonLat(analysis.frame, analysis.fit.axes.origin),
      s: analysis.fit.axes.s,
      t: analysis.fit.axes.t,
    },
    zone: zone?.zone ?? null,
  };
}

/**
 * Cambios del lote al elegir una parcela real: medidas del rectángulo útil,
 * esquina, ubicación automática del galpón y, si hay datos, la normativa de la zona.
 */
export function lotPatchFromLocation(location: LotLocation, corner: LotConfig["corner"], zone: ZoneResult | null): Partial<LotConfig> {
  const floor1 = (v: number) => Math.floor(v * 10) / 10;
  const patch: Partial<LotConfig> = {
    enabled: true,
    mode: "manual",
    width: floor1(location.fit.width),
    depth: floor1(location.fit.depth),
    corner,
    placement: "auto",
    location,
  };
  if (zone) {
    patch.preset = "cordoba-zona";
    patch.rules = { ...presetById("cordoba-zona").rules, ...zone.rules };
  }
  return patch;
}
