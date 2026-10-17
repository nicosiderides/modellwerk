import { createDefaultConfig } from "../../galpones/configuration.ts";
import type { WarehouseDefinition } from "../../galpones/types.ts";
import type { Envelope } from "../envelope/envelope.ts";
import { studyEnvelope, type LotStudy, type RuleOverrides } from "../geo/study.ts";
import type { BuildingTypeId, LandRules } from "../types.ts";
import { fitGalpon, fitLand, planGalpon, planLand, type BuildingPlan, type PlanContext } from "./plan.ts";
import type { GalponDesign, LandConfig, LandSpec, LandTypeId } from "./types.ts";
import { usableTiers, type Rect, type UsableTier } from "./usable.ts";

/**
 * Une todo: lote + normativa + caja + edificio elegido → planta, volumen,
 * verificación y datos para dibujarlo. Puro (sin pantallas): se prueba solo.
 */

export type Specs = Record<LandTypeId, LandSpec>;

export type DesignState = {
  land: Partial<Record<LandTypeId, LandConfig>>;
  galpon: GalponDesign | null;
};

export function defaultLandConfig(spec: LandSpec): LandConfig {
  const b = spec.building;
  const e = spec.envelope.defaults;
  return {
    type: b.id,
    width: b.defaults.width,
    depth: b.defaults.depth,
    floors: b.defaults.floors,
    align: b.defaults.align,
    front: b.defaults.front,
    structure: spec.structure.default,
    facade: e.facade,
    roof: e.roof,
    facadeColor: e.facadeColor,
    accentColor: e.accentColor,
    frameColor: e.frameColor,
    glazing: e.glazing,
    options: Object.fromEntries(spec.options.options.map((o) => [o.id, Boolean(o.defaultOn)])),
  };
}

export function defaultGalpon(def: WarehouseDefinition): GalponDesign {
  return { warehouseId: def.id, config: createDefaultConfig(def), align: "center", front: 0 };
}

export type Computed = {
  typeId: BuildingTypeId;
  rules: LandRules;
  envelope: Envelope;
  tiers: UsableTier[];
  ctx: PlanContext;
  plan: BuildingPlan;
  /** Laterales sobre medianera. */
  party: { left: boolean; right: boolean };
  usable: Rect | null;
};

export function partySides(rules: LandRules) {
  const side = (rules.setbackSide.value ?? 0) > 0 ? rules.sideCount : 0;
  // Con un solo lateral obligatorio, la caja lo deja del lado izquierdo (mirando desde la calle).
  return { left: side === 0, right: side < 2 };
}

/** Contexto normativo y geométrico del tipo elegido. */
export function computeContext(study: LotStudy, typeId: BuildingTypeId, overrides: RuleOverrides) {
  const r = studyEnvelope(study, typeId, overrides);
  if (!r) return null;
  const tiers = usableTiers(study.analysis, r.envelope);
  return { rules: r.rules, envelope: r.envelope, tiers, ctx: { tiers, env: r.envelope, rules: r.rules } as PlanContext };
}

export function computeDesign(study: LotStudy, typeId: BuildingTypeId, overrides: RuleOverrides, design: DesignState, specs: Specs, galponDefs: WarehouseDefinition[]): Computed | null {
  const base = computeContext(study, typeId, overrides);
  if (!base) return null;
  let plan: BuildingPlan;
  if (typeId === "galpon") {
    const gd = design.galpon;
    const def = gd ? galponDefs.find((d) => d.id === gd.warehouseId) : null;
    if (!gd || !def) return null;
    plan = planGalpon(def, gd, base.ctx);
  } else {
    const cfg = design.land[typeId];
    if (!cfg) return null;
    plan = planLand(specs[typeId], cfg, base.ctx);
  }
  return { typeId, ...base, plan, party: partySides(base.rules), usable: base.tiers[0]?.rect ?? null };
}

/** Configuración inicial ajustada a la caja (la que se ve al entrar al paso "Edificio"). */
export function initialDesign(study: LotStudy, overrides: RuleOverrides, specs: Specs, galponDefs: WarehouseDefinition[], previous?: DesignState): DesignState {
  const land: DesignState["land"] = {};
  for (const id of ["vivienda", "departamentos", "oficinas"] as LandTypeId[]) {
    const base = computeContext(study, id, overrides);
    const cfg = previous?.land[id] ?? defaultLandConfig(specs[id]);
    land[id] = base ? fitLand(specs[id], cfg, base.ctx) : cfg;
  }
  let galpon = previous?.galpon ?? null;
  const ctx = computeContext(study, "galpon", overrides);
  const def = galponDefs.find((d) => d.id === (galpon?.warehouseId ?? "industrial-light")) ?? galponDefs[0];
  if (!galpon && def) galpon = defaultGalpon(def);
  if (galpon && def && ctx) galpon = fitGalpon(def, galpon, ctx.ctx);
  return { land, galpon };
}
