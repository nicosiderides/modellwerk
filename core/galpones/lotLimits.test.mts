import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { assembleDefinition, WAREHOUSE_FILE_NAMES, type WarehouseFiles } from "./definition.ts";
import { createDefaultConfig, normalizeConfig } from "./configuration.ts";
import { verifySite } from "./siteCheck.ts";
import { blockingIssues, clampDimension, dimensionLimit, fitToLot, keepInLot, lotCapacity, shrinkLotSide, variantFits } from "./lotLimits.ts";
import type { LotConfig, WarehouseConfig, WarehouseDefinition } from "./types.ts";

const load = (id: string): WarehouseDefinition =>
  assembleDefinition(Object.fromEntries(WAREHOUSE_FILE_NAMES.map((name) => [name, JSON.parse(readFileSync(new URL(`../../data/galpones/${id}/${name}.json`, import.meta.url), "utf8"))])) as WarehouseFiles);

const onLot = (def: WarehouseDefinition, lot: Partial<LotConfig>, base?: WarehouseConfig) => {
  const c = base ?? createDefaultConfig(def);
  return normalizeConfig(def, { ...c, lot: { ...c.lot, mode: "manual", ...lot } });
};

test("lote mínimo (auto): no frena el ancho ni el largo", () => {
  const def = load("industrial-pro");
  const c = createDefaultConfig(def);
  assert.equal(c.lot.mode, "auto");
  assert.equal(dimensionLimit(def, c, "width").max, null);
  assert.equal(dimensionLimit(def, c, "length").max, null);
});

test("lote propio: el retiro lateral pone tope al ancho y el freno se detiene ahí", () => {
  const def = load("industrial-pro");
  const c = onLot(def, { width: 36, depth: 120, front: 25, left: 3, placement: "manual" });
  assert.equal(blockingIssues(c, def).length, 0);
  const lim = dimensionLimit(def, c, "width");
  assert.ok(lim.max !== null && lim.max < 36, `tope ${lim.max}`);
  assert.equal(lim.reason?.id, "sb-east");
  const r = clampDimension(def, c, "width", 36);
  assert.equal(r.config.dimensions.width, lim.max);
  assert.equal(r.limitedBy?.id, "sb-east");
  assert.equal(blockingIssues(r.config, def).length, 0);
  // Achicar nunca se frena
  const down = clampDimension(def, r.config, "width", 22);
  assert.equal(down.config.dimensions.width, 22);
  assert.equal(down.limitedBy, null);
});

test("lote propio: el retiro de fondo pone tope al largo (en módulos)", () => {
  const def = load("industrial-pro");
  const c = onLot(def, { width: 60, depth: 90, front: 25, left: 6, placement: "manual" });
  const lim = dimensionLimit(def, c, "length");
  assert.ok(lim.max !== null);
  assert.equal(lim.reason?.id, "sb-back");
  const r = clampDimension(def, c, "length", 120);
  assert.equal(r.config.dimensions.length, lim.max);
  assert.ok(Math.abs(r.config.dimensions.length / r.config.dimensions.baySpacing - Math.round(r.config.dimensions.length / r.config.dimensions.baySpacing)) < 1e-6);
});

test("altura máxima de la normativa frena el alero", () => {
  const def = load("large-span");
  const base = createDefaultConfig(def);
  const c = normalizeConfig(def, { ...base, lot: { ...base.lot, rules: { ...base.lot.rules, maxHeight: 12 } } });
  assert.equal(blockingIssues(c, def).length, 0);
  const r = clampDimension(def, c, "eaveHeight", 14);
  assert.equal(r.limitedBy?.id, "height");
  assert.ok(r.config.dimensions.eaveHeight < 14);
  assert.equal(blockingIssues(r.config, def).length, 0);
});

test("ajustar al lote: después de achicar el lote, el galpón vuelve a cumplir", () => {
  const def = load("industrial-pro");
  const c = onLot(def, { width: 30, depth: 50, front: 1, left: 1 });
  assert.ok(blockingIssues(c, def).length > 0);
  const fixed = fitToLot(def, c);
  assert.deepEqual(blockingIssues(fixed, def).map((x) => x.id), []);
  assert.ok(fixed.lot.front >= 10 && fixed.lot.left >= 3);
});

test("modelos BIM: se marcan las variantes que no entran y el ajuste elige una que sí", () => {
  const def = load("logistics");
  const c = onLot(def, { width: 60, depth: 115, front: 12, left: 4 });
  assert.equal(variantFits(def, c, "LG-30x72"), null);
  assert.ok(variantFits(def, c, "LG-45x120"));
  const big = normalizeConfig(def, { ...c, variant: "LG-45x120" });
  const fixed = fitToLot(def, big);
  assert.equal(blockingIssues(fixed, def).length, 0);
});

test("capacidad del lote: edificable y superficie cubierta máxima", () => {
  const def = load("industrial-light");
  const c = onLot(def, { width: 40, depth: 100, front: 12, left: 4 });
  const cap = lotCapacity(def, c)!;
  assert.equal(cap.lot.area, 4000);
  assert.deepEqual(cap.buildable, { width: 34, depth: 87 });
  assert.equal(cap.maxCovered, 2400);
});

test("ubicación automática: el galpón se acomoda dentro del lote aunque venga de otro lote", () => {
  const def = load("industrial-light");
  // Caso real: venía de un lote ancho (25 m al lindero oeste) y se cargó uno de 26 × 80 m.
  const c = onLot(def, { width: 26, depth: 80, front: 40, left: 25 });
  assert.equal(c.lot.placement, "auto");
  const v = verifySite(c, def);
  assert.ok(v.lot!.left >= 3 && v.lot!.width - v.lot!.left - (v.plan.footprint.x1 - v.plan.footprint.x0) >= 3, JSON.stringify(v.lot));
  assert.deepEqual(blockingIssues(c, def).map((x) => x.id), []);
  // Y puede crecer hasta llenar el ancho edificable (26 − 2 × 3 m de retiro).
  const lim = dimensionLimit(def, c, "width");
  assert.ok(lim.max === null || lim.max >= 19, String(lim.max));
});

test("ubicación elegida: nunca sale del lote ni pisa el retiro", () => {
  const def = load("industrial-light");
  const c = onLot(def, { width: 26, depth: 80, front: 2, left: 25, placement: "manual" });
  const v = verifySite(c, def);
  const range = v.plan.placementRange!;
  assert.equal(v.lot!.left, range.left[1]);
  assert.equal(v.lot!.front, range.front[0]);
  assert.ok(v.lot!.front >= 10);
  assert.deepEqual(blockingIssues(c, def).map((x) => x.id), []);
});

test("fuera de norma: se puede achicar, pero nunca agrandar", () => {
  const def = load("industrial-pro");
  // Lote chico para el galpón por defecto: queda fuera de norma.
  const c = onLot(def, { width: 30, depth: 60, front: 10, left: 3, placement: "manual" });
  assert.ok(blockingIssues(c, def).length > 0);
  const up = clampDimension(def, c, "width", c.dimensions.width + 6);
  assert.equal(up.config.dimensions.width, c.dimensions.width, "no crece");
  assert.ok(up.limitedBy);
  const down = clampDimension(def, c, "width", c.dimensions.width - 4);
  assert.ok(down.config.dimensions.width < c.dimensions.width, "sí achica");
});

test("lote propio más chico o normativa más exigente: el galpón se achica y vuelve a cumplir", () => {
  const def = load("industrial-pro");
  const ok = fitToLot(def, onLot(def, { width: 60, depth: 120, placement: "auto" }));
  assert.equal(blockingIssues(ok, def).length, 0);
  // Lote más angosto
  const narrower = keepInLot(def, normalizeConfig(def, { ...ok, lot: { ...ok.lot, width: 28 } }));
  assert.equal(narrower.impossible, false);
  assert.equal(narrower.adjusted, true);
  assert.equal(blockingIssues(narrower.config, def).length, 0);
  assert.ok(narrower.config.dimensions.width <= ok.dimensions.width);
  // FOS más exigente
  const fos = keepInLot(def, normalizeConfig(def, { ...ok, lot: { ...ok.lot, rules: { ...ok.lot.rules, fos: 0.2 } } }));
  assert.equal(blockingIssues(fos.config, def).length, 0);
  // Sin cambios que rompan: no toca nada
  const same = keepInLot(def, ok);
  assert.equal(same.adjusted, false);
  assert.equal(same.config, ok);
});

test("achicar el lote propio: nunca por debajo de lo que necesita el galpón más chico", () => {
  const def = load("industrial-pro");
  const ok = fitToLot(def, onLot(def, { width: 60, depth: 120, placement: "auto" }));
  const apply = (c: WarehouseConfig, v: number) => normalizeConfig(def, { ...c, lot: { ...c.lot, width: v } });
  const r = shrinkLotSide(def, ok, "width", 5, apply);
  assert.equal(r.limited, true);
  assert.ok(r.value > 5 && r.value < 60, `tope ${r.value}`);
  assert.equal(blockingIssues(r.config, def).length, 0, "en el tope, el galpón cumple");
  // medio metro menos ya no da
  assert.equal(keepInLot(def, apply(ok, r.value - 0.5)).impossible, true);
});
