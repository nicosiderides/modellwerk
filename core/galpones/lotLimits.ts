import { isDiscrete, ridgeHeight, selectVariant, setDimension } from "./configuration.ts";
import { verifySite, type SiteCheck } from "./siteCheck.ts";
import type { DimensionKey, WarehouseConfig, WarehouseDefinition } from "./types.ts";

/**
 * Límites que el lote y la normativa le ponen al galpón.
 *
 * El lote se elige primero; después, cada medida del galpón tiene un tope:
 *  - Reglas que FRENAN (normativa que depende del tamaño del galpón):
 *    entrar en el lote, retiros, FOS, FOT y altura máxima.
 *  - Lo logístico (maniobras, cocheras) no frena: sólo se avisa en la
 *    verificación, porque son criterios de diseño y no normativa.
 *
 * Con el lote en modo "mínimo" (auto) el lote crece con el galpón, así que
 * sólo puede frenar la altura máxima.
 */

/** Verificaciones de siteCheck.ts que frenan el crecimiento del galpón. */
export const BLOCKING_CHECKS = new Set(["fits", "sb-front", "sb-west", "sb-east", "sb-side", "sb-back", "fos", "fot", "height"]);

/** Medidas que el freno controla (en el orden en que se achican al ajustar). */
export const LIMITED_KEYS = ["length", "width", "eaveHeight", "roofSlope"] as const;
export type LimitedKey = DimensionKey;

export type DimensionLimit = {
  /** Valor máximo permitido por el lote (null = el lote no limita esta medida). */
  max: number | null;
  /** Regla que pone el tope. */
  reason: SiteCheck | null;
};

const EPS = 1e-6;

/** Reglas de normativa que el galpón no cumple (las que frenan). */
export function blockingIssues(config: WarehouseConfig, definition: WarehouseDefinition): SiteCheck[] {
  if (!config.lot.enabled) return [];
  return verifySite(config, definition).checks.filter((c) => c.status === "fail" && BLOCKING_CHECKS.has(c.id));
}

/** El lote en sí no cumple la normativa (superficie o frente mínimos): no depende del galpón. */
export function lotIssues(config: WarehouseConfig, definition: WarehouseDefinition): SiteCheck[] {
  if (!config.lot.enabled) return [];
  return verifySite(config, definition).checks.filter((c) => c.status === "fail" && (c.id === "lot-area" || c.id === "lot-front"));
}

export function dimensionValue(config: WarehouseConfig, key: DimensionKey) {
  return key === "ridgeHeight" ? ridgeHeight(config.dimensions) : config.dimensions[key];
}

export function dimensionStep(definition: WarehouseDefinition, config: WarehouseConfig, key: DimensionKey) {
  const r = definition.dimensions;
  switch (key) {
    case "width":
      return r.width.step;
    case "length":
      return config.dimensions.baySpacing;
    case "eaveHeight":
      return r.eaveHeight.step;
    case "roofSlope":
      return r.roofSlope.step;
    case "baySpacing":
      return r.baySpacing.step;
    case "bayCount":
      return 1;
    case "ridgeHeight":
      return 0.1;
  }
}

function dimensionRange(definition: WarehouseDefinition, config: WarehouseConfig, key: DimensionKey): [number, number] {
  const r = definition.dimensions;
  const d = config.dimensions;
  switch (key) {
    case "ridgeHeight":
      return [d.eaveHeight + (d.width / 2) * (r.roofSlope.min / 100), d.eaveHeight + (d.width / 2) * (r.roofSlope.max / 100)];
    case "bayCount":
      return [r.bayCount.min, r.bayCount.max];
    default:
      return [r[key].min, r[key].max];
  }
}

const ids = (list: SiteCheck[]) => new Set(list.map((c) => c.id));
/** La regla más explicativa: un retiro dice más que "no entra en el lote". */
// El galpón crece hacia el este (ancho) y hacia el fondo (largo): esos retiros primero.
const PRIORITY = ["sb-east", "sb-side", "sb-back", "sb-west", "sb-front", "fos", "fot", "height", "fits"];
const primary = (list: SiteCheck[]) => [...list].sort((a, b) => PRIORITY.indexOf(a.id) - PRIORITY.indexOf(b.id))[0] ?? null;

/**
 * Tope de una medida: hasta dónde puede crecer sin salir de la normativa,
 * con el resto de las medidas y la posición en el lote como están.
 */
export function dimensionLimit(definition: WarehouseDefinition, config: WarehouseConfig, key: DimensionKey): DimensionLimit {
  if (!config.lot.enabled || isDiscrete(definition)) return { max: null, reason: null };
  // Si ya está fuera de norma no se calcula un tope: manda el cartel de ajuste.
  if (blockingIssues(config, definition).length) return { max: null, reason: null };
  const step = dimensionStep(definition, config, key);
  const [, hi] = dimensionRange(definition, config, key);
  const current = dimensionValue(config, key);
  // Valores posibles por encima del actual (ya redondeados como los deja la app).
  const candidates: { value: number; config: WarehouseConfig }[] = [];
  let last = current;
  for (let v = current + step; v <= hi + EPS; v += step) {
    const next = setDimension(definition, config, key, v);
    const value = dimensionValue(next, key);
    if (value <= last + EPS) continue;
    candidates.push({ value, config: next });
    last = value;
  }
  if (!candidates.length) return { max: null, reason: null };
  // Crecer nunca arregla una regla incumplida (retiros, FOS, altura): búsqueda binaria.
  const failsAt = (i: number) => blockingIssues(candidates[i].config, definition);
  if (!failsAt(candidates.length - 1).length) return { max: null, reason: null };
  let lo = 0;
  let hiIdx = candidates.length - 1;
  while (lo < hiIdx) {
    const mid = (lo + hiIdx) >> 1;
    if (failsAt(mid).length) hiIdx = mid;
    else lo = mid + 1;
  }
  return { max: lo === 0 ? current : candidates[lo - 1].value, reason: primary(failsAt(lo)) };
}

export type ClampResult = { config: WarehouseConfig; limitedBy: SiteCheck | null };

/**
 * Aplica un cambio de medida respetando la normativa: si el valor pedido la
 * rompe, se queda en el último valor que cumple (en la dirección del cambio)
 * y devuelve la regla que frenó.
 */
export function clampDimension(definition: WarehouseDefinition, config: WarehouseConfig, key: DimensionKey, value: number): ClampResult {
  const next = setDimension(definition, config, key, value);
  if (!config.lot.enabled || isDiscrete(definition)) return { config: next, limitedBy: null };
  const before = blockingIssues(config, definition);
  const after = blockingIssues(next, definition);
  if (!after.length) return { config: next, limitedBy: null };
  const current = dimensionValue(config, key);
  const dir = Math.sign(value - current);
  // Ya estaba fuera de norma: se puede achicar (acerca a cumplir), pero nunca agrandar.
  const had = ids(before);
  const added = after.filter((c) => !had.has(c.id));
  if (before.length && dir > 0) return { config, limitedBy: primary(before) };
  if (before.length && !added.length) return { config: next, limitedBy: null };

  if (dir === 0) return { config, limitedBy: null };
  const step = dimensionStep(definition, config, key);
  let ok = config;
  let last = current;
  for (let v = current + dir * step; dir > 0 ? v < value + EPS : v > value - EPS; v += dir * step) {
    const candidate = setDimension(definition, config, key, v);
    const cv = dimensionValue(candidate, key);
    if (Math.abs(cv - last) < EPS) continue;
    const issues = blockingIssues(candidate, definition);
    const fresh = issues.filter((c) => !had.has(c.id));
    if (fresh.length) return { config: ok, limitedBy: primary(fresh) };
    ok = candidate;
    last = cv;
  }
  return { config: ok, limitedBy: primary(added.length ? added : after) };
}

/** Variantes BIM (modelos fijos) que entran en el lote. */
export function variantFits(definition: WarehouseDefinition, config: WarehouseConfig, variantId: string): SiteCheck | null {
  if (!config.lot.enabled) return null;
  return primary(blockingIssues(selectVariant(definition, config, variantId), definition));
}

/**
 * "Ajustar el galpón al lote": corre el galpón fuera de los retiros si hace
 * falta y achica largo, ancho, alero y pendiente (en ese orden) hasta cumplir.
 * Devuelve la configuración más grande que cumple, o la que menos incumple.
 */
export function fitToLot(definition: WarehouseDefinition, config: WarehouseConfig): WarehouseConfig {
  let c = structuredClone(config);
  if (!c.lot.enabled) return c;
  const rules = c.lot.rules;
  const failing = () => blockingIssues(c, definition);

  // 1 · Posición: fuera de los retiros de frente y lateral oeste.
  if (c.lot.mode === "manual") {
    const ids0 = ids(failing());
    if (ids0.has("sb-front") && rules.setbackFront !== null && c.lot.front < rules.setbackFront) c.lot.front = rules.setbackFront;
    if (ids0.has("sb-west") && rules.setbackSide !== null && c.lot.left < rules.setbackSide) c.lot.left = rules.setbackSide;
  }

  // 2 · Modelos BIM fijos: la variante más grande que entra.
  if (isDiscrete(definition) && definition.model.strategy === "discreteVariant") {
    if (!failing().length) return c;
    const fitting = definition.model.variants
      .filter((v) => !variantFits(definition, c, v.id))
      .sort((a, b) => b.dimensions.width * b.dimensions.length - a.dimensions.width * a.dimensions.length);
    return fitting.length ? selectVariant(definition, c, fitting[0].id) : c;
  }
  if (isDiscrete(definition)) return c;

  // 3 · Achicar medidas.
  for (let pass = 0; pass < 6; pass += 1) {
    const count = failing().length;
    if (!count) break;
    let best: { config: WarehouseConfig; count: number } | null = null;
    for (const key of LIMITED_KEYS) {
      const step = dimensionStep(definition, c, key);
      const [lo] = dimensionRange(definition, c, key);
      let last = dimensionValue(c, key);
      for (let v = last - step; v >= lo - EPS; v -= step) {
        const candidate = setDimension(definition, c, key, v);
        const cv = dimensionValue(candidate, key);
        if (Math.abs(cv - last) < EPS) continue;
        last = cv;
        const n = blockingIssues(candidate, definition).length;
        if (n < (best?.count ?? count)) best = { config: candidate, count: n };
        if (n === 0) break;
      }
      if (best?.count === 0) break;
    }
    if (!best) break;
    c = best.config;
  }
  return c;
}

export type KeepInLotResult = {
  config: WarehouseConfig;
  /** El galpón se achicó (o cambió de variante) para seguir cumpliendo. */
  adjusted: boolean;
  /** Ni achicándolo al mínimo cumple (el lote o la normativa no dan para esta tipología). */
  impossible: boolean;
};

const sameSize = (a: WarehouseConfig, b: WarehouseConfig) => JSON.stringify(a.dimensions) === JSON.stringify(b.dimensions) && a.variant === b.variant;

/**
 * El galpón nunca queda más grande de lo que permiten el lote y la normativa:
 * después de cambiar el lote, la normativa o algo que ocupa lugar
 * (estacionamiento, marquesina…), si ya no cumple se achica hasta cumplir.
 */
export function keepInLot(definition: WarehouseDefinition, config: WarehouseConfig): KeepInLotResult {
  if (!config.lot.enabled || !blockingIssues(config, definition).length) return { config, adjusted: false, impossible: false };
  const fitted = fitToLot(definition, config);
  return { config: fitted, adjusted: !sameSize(fitted, config), impossible: blockingIssues(fitted, definition).length > 0 };
}

/**
 * Achicar una medida del lote propio: si con el valor pedido ni el galpón más
 * chico entra o cumple, se queda en el lote más chico que sí da (búsqueda
 * entre el valor pedido y el actual, de a 0,5 m).
 */
export function shrinkLotSide(definition: WarehouseDefinition, config: WarehouseConfig, side: "width" | "depth", value: number, apply: (c: WarehouseConfig, v: number) => WarehouseConfig): { config: WarehouseConfig; value: number; limited: boolean } {
  const tryAt = (v: number) => keepInLot(definition, apply(config, v));
  const asked = tryAt(value);
  if (!asked.impossible) return { config: asked.config, value, limited: false };
  const current = config.lot[side];
  // Pasos de 0,5 m entre el valor pedido y el actual.
  let lo = Math.ceil(value * 2) / 2;
  let hi = current;
  if (tryAt(hi).impossible) return { config: asked.config, value, limited: false }; // el actual tampoco da: no se frena
  while (hi - lo > 0.5 + EPS) {
    const mid = Math.round(((lo + hi) / 2) * 2) / 2;
    if (tryAt(mid).impossible) lo = mid;
    else hi = mid;
  }
  return { config: tryAt(hi).config, value: hi, limited: true };
}

/** Lo que permite el lote, para mostrar antes de diseñar. */
export type LotCapacity = {
  lot: { width: number; depth: number; area: number };
  /** Rectángulo edificable (lote menos retiros). */
  buildable: { width: number; depth: number } | null;
  /** Superficie cubierta máxima (FOS / FOT). */
  maxCovered: number | null;
  maxHeight: number | null;
  /** Ocupación actual del galpón (incluye marquesina). */
  covered: number;
  /** Topes de ancho y largo con el galpón en su posición actual. */
  width: DimensionLimit;
  length: DimensionLimit;
};

export function lotCapacity(definition: WarehouseDefinition, config: WarehouseConfig): LotCapacity | null {
  if (!config.lot.enabled) return null;
  const v = verifySite(config, definition);
  if (!v.lot || !v.metrics) return null;
  const r = config.lot.rules;
  const { width, depth, area } = v.lot;
  const sides = v.plan.sideSetback;
  const buildable = r.setbackFront !== null || r.setbackSide !== null || r.setbackBack !== null ? { width: width - sides.west - sides.east, depth: depth - (r.setbackFront ?? 0) - (r.setbackBack ?? 0) } : null;
  const caps = [r.fos, r.fot].filter((x): x is number => x !== null).map((x) => x * area);
  return {
    lot: { width, depth, area },
    buildable,
    maxCovered: caps.length ? Math.min(...caps) : null,
    maxHeight: r.maxHeight,
    covered: v.metrics.covered,
    width: dimensionLimit(definition, config, "width"),
    length: dimensionLimit(definition, config, "length"),
  };
}

/** Qué exige la regla, en pocas palabras ("mínimo 3,0 m", "máximo 60 %"). */
export function ruleRequirement(check: SiteCheck) {
  const parts = check.detail.split(" · ");
  return parts.length > 1 ? parts.slice(1).join(" · ") : "";
}

/** Frase para el cartel de freno: "Más no cumple el retiro de fondo (mínimo 3,0 m)". */
export function limitSentence(check: SiteCheck | null) {
  if (!check) return "";
  if (check.id === "fits") return "Más grande, el galpón se sale del lote.";
  const need = ruleRequirement(check);
  return `Más no cumple: ${check.label.toLowerCase()}${need ? ` (${need})` : ""}.`;
}
