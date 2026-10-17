import { ridgeHeight, setDimension, isDiscrete, selectVariant } from "../../galpones/configuration.ts";
import type { WarehouseConfig, WarehouseDefinition } from "../../galpones/types.ts";
import type { Envelope } from "../envelope/envelope.ts";
import type { LandRules } from "../types.ts";
import type { Align, GalponDesign, LandConfig, LandSpec } from "./types.ts";
import { intersect, rectArea, rectD, rectW, type Rect, type UsableTier } from "./usable.ts";

/**
 * Planta y volumen de un edificio dentro de la caja máxima, con la
 * verificación de la normativa (igual que Galpones: lo obligatorio frena, lo
 * recomendable avisa). Todo en coordenadas del lote.
 */

export type CheckStatus = "ok" | "warn" | "fail";
export type PlanCheck = { id: string; label: string; status: CheckStatus; detail: string };
export type FloorPlan = { index: number; base: number; height: number; rect: Rect; area: number };

export type BuildingPlan = {
  rect: Rect | null;
  floors: FloorPlan[];
  /** Pisos pedidos que no entran en la caja. */
  droppedFloors: number;
  footprint: number;
  built: number;
  sellable: number;
  units: number;
  unitsLabel: string;
  /** Altura del último piso (sin parapeto ni sala de máquinas). */
  height: number;
  checks: PlanCheck[];
  ok: boolean;
};

export type PlanContext = { tiers: UsableTier[]; env: Envelope; rules: LandRules };

const EPS = 0.5;

function place(U: Rect, width: number, depth: number, align: Align, front: number): Rect {
  const w = Math.min(width, rectW(U));
  const d = Math.min(depth, rectD(U));
  const f = Math.max(0, Math.min(front, rectD(U) - d));
  const x0 = align === "left" ? U.x0 : align === "right" ? U.x1 - w : U.x0 + (rectW(U) - w) / 2;
  return { x0, x1: x0 + w, z0: U.z0 + f, z1: U.z0 + f + d };
}

function normativeChecks(ctx: PlanContext, footprint: number, built: number, height: number, floors: number, units: number | null): PlanCheck[] {
  const { env, rules } = ctx;
  const out: PlanCheck[] = [];
  const m2 = (v: number) => `${Math.round(v).toLocaleString("es-AR")} m²`;
  out.push({ id: "retiros", label: "Retiros y centro de manzana", status: "ok", detail: "El edificio queda dentro de la caja máxima." });
  if (env.fosArea !== null) out.push({ id: "fos", label: "FOS", status: footprint <= env.fosArea + EPS ? "ok" : "fail", detail: `Ocupa ${m2(footprint)} de ${m2(env.fosArea)} permitidos.` });
  if (env.fotArea !== null) out.push({ id: "fot", label: "FOT", status: built <= env.fotArea + EPS ? "ok" : "fail", detail: `Construye ${m2(built)} de ${m2(env.fotArea)} permitidos.` });
  if (rules.maxHeight.value !== null) out.push({ id: "altura", label: "Altura", status: height <= rules.maxHeight.value + 0.05 ? "ok" : "fail", detail: `${height.toFixed(1)} m de ${rules.maxHeight.value.toFixed(1)} m permitidos.` });
  if (rules.maxFloors.value !== null) out.push({ id: "pisos", label: "Plantas", status: floors <= rules.maxFloors.value ? "ok" : "fail", detail: `${floors} de ${rules.maxFloors.value} permitidas.` });
  if (units !== null && env.units !== null) out.push({ id: "densidad", label: "Densidad", status: units <= env.units ? "ok" : "fail", detail: `${units} unidades de ${env.units} permitidas por la superficie del lote.` });
  return out;
}

/* ─────────────────────────── tipos nuevos ─────────────────────────── */

export function planLand(spec: LandSpec, cfg: LandConfig, ctx: PlanContext): BuildingPlan {
  const b = spec.building;
  const U = ctx.tiers[0]?.rect ?? null;
  const empty: BuildingPlan = { rect: null, floors: [], droppedFloors: cfg.floors, footprint: 0, built: 0, sellable: 0, units: 0, unitsLabel: "", height: 0, checks: [{ id: "lugar", label: "Lugar para construir", status: "fail", detail: "Con estos retiros no queda superficie útil en el lote." }], ok: false };
  if (!U) return empty;
  const rect = place(U, cfg.width, cfg.depth, cfg.align, cfg.front);
  const floors: FloorPlan[] = [];
  for (let f = 0; f < cfg.floors; f += 1) {
    const base = f === 0 ? 0 : b.groundHeight + (f - 1) * b.floorHeight;
    const height = f === 0 ? b.groundHeight : b.floorHeight;
    if (base + height > ctx.env.height + 0.01) break;
    const tier = ctx.tiers.find((t) => base >= t.from - 0.01 && base < t.to - 0.01) ?? null;
    const r = tier?.rect ? intersect(rect, tier.rect) : null;
    if (!r) break;
    floors.push({ index: f, base, height, rect: r, area: rectArea(r) });
  }
  const footprint = floors[0]?.area ?? 0;
  const built = floors.reduce((s, f) => s + f.area, 0);
  const sellable = built * b.efficiency;
  let units = 1;
  let unitsLabel = "vivienda";
  if (b.unitArea) {
    const parking = cfg.type === "departamentos" && cfg.options.cocheras;
    const upper = floors.filter((f) => f.index > 0 || !parking);
    units = Math.max(1, upper.reduce((s, f) => s + Math.max(1, Math.floor((f.area * b.efficiency) / b.unitArea!)), 0));
    unitsLabel = cfg.type === "departamentos" ? "departamentos" : "oficinas";
  }
  const top = floors.length ? floors[floors.length - 1].base + floors[floors.length - 1].height : 0;
  const checks = normativeChecks(ctx, footprint, built, top, floors.length, cfg.type === "oficinas" ? null : units);
  if (floors.length < cfg.floors) checks.push({ id: "caja", label: "Pisos que entran", status: "warn", detail: `Entran ${floors.length} de los ${cfg.floors} pisos pedidos.` });
  if (rect.x1 - rect.x0 < cfg.width - 0.05 || rect.z1 - rect.z0 < cfg.depth - 0.05) checks.push({ id: "medidas", label: "Medidas", status: "warn", detail: "El edificio se ajustó al lugar disponible." });
  return { rect, floors, droppedFloors: cfg.floors - floors.length, footprint, built, sellable, units, unitsLabel, height: top, checks, ok: !checks.some((c) => c.status === "fail") };
}

/** Ajusta la configuración para que cumpla lo obligatorio: primero baja pisos, después fondo y ancho. */
export function fitLand(spec: LandSpec, cfg: LandConfig, ctx: PlanContext): LandConfig {
  const b = spec.building;
  const U = ctx.tiers[0]?.rect;
  let next: LandConfig = { ...cfg };
  if (!U) return next;
  next.width = clampStep(Math.min(next.width, rectW(U)), b.dimensions.width.min, b.dimensions.width.max, b.dimensions.width.step);
  next.depth = clampStep(Math.min(next.depth, rectD(U)), b.dimensions.depth.min, b.dimensions.depth.max, b.dimensions.depth.step);
  next.floors = Math.max(b.dimensions.floors.min, Math.min(next.floors, b.dimensions.floors.max));
  let plan = planLand(spec, next, ctx);
  if (plan.floors.length < next.floors) next.floors = Math.max(1, plan.floors.length);
  for (let i = 0; i < 600; i += 1) {
    plan = planLand(spec, next, ctx);
    const fail = new Set(plan.checks.filter((c) => c.status === "fail").map((c) => c.id));
    if (!fail.size) break;
    // FOT: conviene bajar un piso o acortar el fondo; se elige lo que deja más superficie.
    if (fail.has("fot") && ctx.env.fotArea !== null && plan.built > 0 && !fail.has("densidad") && !fail.has("pisos") && !fail.has("altura")) {
      const depth = clampStep((next.depth * ctx.env.fotArea) / plan.built, b.dimensions.depth.min, b.dimensions.depth.max, b.dimensions.depth.step);
      const shorter = { ...next, depth };
      const fewer = { ...next, floors: Math.max(b.dimensions.floors.min, next.floors - 1) };
      const a = planLand(spec, shorter, ctx);
      const c = planLand(spec, fewer, ctx);
      const okA = a.ok && depth < next.depth;
      if (okA && (!c.ok || a.built >= c.built)) {
        next = shorter;
        continue;
      }
    }
    if ((fail.has("fot") || fail.has("densidad") || fail.has("pisos") || fail.has("altura")) && next.floors > b.dimensions.floors.min) next.floors -= 1;
    else if (next.depth - b.dimensions.depth.step >= b.dimensions.depth.min) next.depth = round(next.depth - b.dimensions.depth.step);
    else if (next.width - b.dimensions.width.step >= b.dimensions.width.min) next.width = round(next.width - b.dimensions.width.step);
    else break;
  }
  return next;
}

const round = (v: number) => Math.round(v * 100) / 100;
const clampStep = (v: number, min: number, max: number, step: number) => round(Math.max(min, Math.min(max, Math.floor((v + 1e-6) / step) * step)));

/* ─────────────────────────── galpón ─────────────────────────── */

export function galponRect(def: WarehouseDefinition, gd: GalponDesign, U: Rect): Rect {
  return place(U, gd.config.dimensions.width, gd.config.dimensions.length, gd.align, gd.front);
}

export function planGalpon(def: WarehouseDefinition, gd: GalponDesign, ctx: PlanContext): BuildingPlan {
  const U = ctx.tiers[0]?.rect ?? null;
  if (!U) return { rect: null, floors: [], droppedFloors: 1, footprint: 0, built: 0, sellable: 0, units: 1, unitsLabel: "nave", height: 0, checks: [{ id: "lugar", label: "Lugar para construir", status: "fail", detail: "Con estos retiros no queda superficie útil en el lote." }], ok: false };
  const W = gd.config.dimensions.width;
  const L = gd.config.dimensions.length;
  const rect = galponRect(def, gd, U);
  const h = ridgeHeight(gd.config.dimensions);
  const fits = W <= rectW(U) + 0.01 && L <= rectD(U) + 0.01;
  const footprint = W * L;
  const checks = normativeChecks(ctx, footprint, footprint, h, 1, null);
  checks.unshift({ id: "entra", label: "Entra en la caja", status: fits ? "ok" : "fail", detail: fits ? `Nave de ${W} × ${L} m dentro del lugar disponible (${rectW(U).toFixed(1)} × ${rectD(U).toFixed(1)} m).` : `La nave de ${W} × ${L} m no entra en ${rectW(U).toFixed(1)} × ${rectD(U).toFixed(1)} m.` });
  const tier = ctx.tiers[ctx.tiers.length - 1];
  if (ctx.tiers.length > 1 && tier.rect && h > tier.from && (rect.z0 < tier.rect.z0 - 0.01 || rect.x0 < tier.rect.x0 - 0.01 || rect.x1 > tier.rect.x1 + 0.01)) checks.push({ id: "retiro-altura", label: "Retiro en altura", status: "fail", detail: `Arriba de ${tier.from} m la zona pide retirarse: bajá la altura o corré la nave hacia el fondo.` });
  return { rect, floors: [{ index: 0, base: 0, height: h, rect, area: footprint }], droppedFloors: 0, footprint, built: footprint, sellable: footprint, units: 1, unitsLabel: "nave", height: h, checks, ok: !checks.some((c) => c.status === "fail") };
}

/** Achica la nave (ancho, largo, altura) hasta que cumpla. */
export function fitGalpon(def: WarehouseDefinition, gd: GalponDesign, ctx: PlanContext): GalponDesign {
  let config: WarehouseConfig = gd.config;
  const next = () => ({ ...gd, config });
  if (isDiscrete(def)) {
    const variants = def.model.strategy === "discreteVariant" ? def.model.variants : [];
    const ok = variants.filter((v) => planGalpon(def, { ...gd, config: selectVariant(def, config, v.id) }, ctx).ok);
    if (ok.length) config = selectVariant(def, config, ok.sort((a, b) => b.dimensions.width * b.dimensions.length - a.dimensions.width * a.dimensions.length)[0].id);
    return next();
  }
  for (let i = 0; i < 400; i += 1) {
    const plan = planGalpon(def, next(), ctx);
    const fail = new Set(plan.checks.filter((c) => c.status === "fail").map((c) => c.id));
    if (!fail.size) break;
    const d = config.dimensions;
    const r = def.dimensions;
    const U = ctx.tiers[0]?.rect;
    if ((fail.has("altura") || fail.has("retiro-altura")) && d.eaveHeight - r.eaveHeight.step >= r.eaveHeight.min) config = setDimension(def, config, "eaveHeight", d.eaveHeight - r.eaveHeight.step);
    else if (U && d.width > rectW(U) && d.width - r.width.step >= r.width.min) config = setDimension(def, config, "width", Math.max(r.width.min, Math.floor(rectW(U) / r.width.step) * r.width.step));
    else if (U && d.length > rectD(U) && d.length - r.length.step >= r.length.min) config = setDimension(def, config, "length", Math.max(r.length.min, Math.floor(rectD(U) / r.length.step) * r.length.step));
    else if (d.length - r.length.step >= r.length.min) config = setDimension(def, config, "length", d.length - Math.max(r.length.step, d.baySpacing));
    else if (d.width - r.width.step >= r.width.min) config = setDimension(def, config, "width", d.width - r.width.step);
    else break;
  }
  return next();
}
