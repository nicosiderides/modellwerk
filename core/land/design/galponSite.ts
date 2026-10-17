import { buildLotLocation } from "../../galpones/geo/lotFromParcel.ts";
import { presetById } from "../../galpones/lotRules.ts";
import { planSite, type SitePlan } from "../../galpones/sitePlan.ts";
import { normalizeSite } from "../../galpones/siteConfig.ts";
import { verifySite, type SiteCheck } from "../../galpones/siteCheck.ts";
import type { WarehouseConfig, WarehouseDefinition } from "../../galpones/types.ts";
import type { LotStudy } from "../geo/study.ts";
import type { PlanCheck } from "./plan.ts";
import type { Rect } from "./usable.ts";

/**
 * Entorno del galpón dentro de MW Land, usando la lógica de Galpones tal cual
 * (veredas, playón de camiones, estacionamiento, parquizado y la verificación
 * de ingreso y giro de camiones). MW Land ubica la nave con su propia caja
 * máxima; acá sólo se le cuenta a Galpones dónde quedó, en el rectángulo útil
 * del lote real, para que arme el entorno alrededor.
 *
 * La normativa la controla MW Land: a Galpones se le pasa el preset "libre"
 * (sin reglas) y de su verificación sólo se toma lo logístico.
 */

const free = presetById("libre");

/** Configuración del galpón con el lote real y la ubicación que eligió MW Land. */
export function galponSiteConfig(study: LotStudy, def: WarehouseDefinition, config: WarehouseConfig, rect: Rect): WarehouseConfig {
  const fit = study.analysis.fit;
  const width = Math.floor(fit.width * 10) / 10;
  const depth = Math.floor(fit.depth * 10) / 10;
  const cx = (rect.x0 + rect.x1) / 2;
  const cz = (rect.z0 + rect.z1) / 2;
  const base: WarehouseConfig = {
    ...config,
    lot: {
      ...config.lot,
      enabled: true,
      preset: free.id,
      rules: { ...free.rules },
      mode: "manual",
      placement: "manual",
      width,
      depth,
      corner: study.analysis.corner,
      location: buildLotLocation(study.parcel, study.analysis, null),
      front: 0,
      left: 0,
    },
  };
  // Medidas exteriores de la nave según Galpones (muros y premoldeados incluidos).
  const probe = planSite(base, def);
  const ox = probe.ox;
  const oz = probe.oz;
  const left = Math.max(0, cx - ox);
  const front = Math.max(0, cz - oz);
  // Galpones deja la vereda perimetral + 0,5 m dentro del lote: si la nave
  // va más pegada a un lindero (medianera), la vereda se angosta.
  const clearance = Math.min(left, width - (cx + ox), front, depth - (cz + oz));
  const site = normalizeSite(config.site);
  const sidewalk = Math.max(0, Math.min(site.sidewalk, Math.floor((clearance - 0.5) * 2) / 2));
  return { ...base, site: { ...site, sidewalk }, lot: { ...base.lot, front: Math.round(front * 10) / 10, left: Math.round(left * 10) / 10 } };
}

export function galponSitePlan(study: LotStudy, def: WarehouseDefinition, config: WarehouseConfig, rect: Rect): SitePlan {
  return planSite(galponSiteConfig(study, def, config, rect), def);
}

/** Avisos logísticos de Galpones (camiones, playón, cocheras): avisan, no frenan. */
export function galponLogistics(study: LotStudy, def: WarehouseDefinition, config: WarehouseConfig, rect: Rect): PlanCheck[] {
  const v = verifySite(galponSiteConfig(study, def, config, rect), def);
  return v.checks
    .filter((c: SiteCheck) => c.group === "Logística" && c.status !== "info")
    .map((c) => ({ id: `log-${c.id}`, label: c.label, status: c.status === "ok" ? "ok" : "warn", detail: c.detail }));
}
