import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { composeStudy, type LotContext } from "./geo/study.ts";
import { computeDesign, initialDesign } from "./design/compute.ts";
import { fitLand, planLand } from "./design/plan.ts";
import { loadGalpones, loadSpecs } from "./design/testSpecs.ts";
import { costPerM2 } from "./design/costs.ts";
import { createLandBuilding, gridLines } from "./kit/building.ts";
import { defaultInputs, irrAnnual, sensitivity, simulate } from "./finance/finance.ts";
import type { Feature, ParcelProps } from "../galpones/geo/idecor.ts";

/** Pruebas de las fases 2 a 6: diseño dentro de la caja, piezas del kit y simulación de inversión. */

type Fx = { lots: Record<string, { parcel: Feature<ParcelProps>; context: LotContext }> };
const fx = JSON.parse(readFileSync(new URL("./fixtures/cordoba-lotes.json", import.meta.url), "utf8")) as Fx;
const study = (k: string) => composeStudy(fx.lots[k].parcel, fx.lots[k].context, "ok");
const specs = loadSpecs();
const galpones = loadGalpones();
const LAND = ["vivienda", "departamentos", "oficinas"] as const;

test("diseño inicial: en todos los lotes de prueba, cada tipo arranca cumpliendo lo obligatorio", () => {
  for (const k of ["generalpaz", "z_A", "cerro", "z_C2", "z_C3", "z_H1"]) {
    const st = study(k);
    const d = initialDesign(st, {}, specs, galpones);
    for (const t of LAND) {
      const c = computeDesign(st, t, {}, d, specs, galpones)!;
      const fails = c.plan.checks.filter((x) => x.status === "fail").map((x) => x.id);
      assert.deepEqual(fails, [], `${k} · ${t}: ${fails.join(", ")}`);
      assert.ok(c.plan.built > 0, `${k} · ${t} sin superficie`);
      assert.ok(c.plan.footprint <= c.envelope.footprintMax + 0.5, `${k} · ${t} supera el FOS`);
      assert.ok(c.plan.height <= c.envelope.height + 0.01, `${k} · ${t} supera la altura`);
    }
  }
});

test("frena como Galpones: pedir más pisos o más ancho de lo que entra se ajusta a la caja", () => {
  const st = study("z_A");
  const d = initialDesign(st, {}, specs, galpones);
  const c = computeDesign(st, "departamentos", {}, d, specs, galpones)!;
  const big = { ...d.land.departamentos!, floors: 12, width: 40, depth: 40 };
  const fitted = fitLand(specs.departamentos, big, c.ctx);
  const plan = planLand(specs.departamentos, fitted, c.ctx);
  assert.ok(plan.ok, plan.checks.filter((x) => x.status === "fail").map((x) => x.detail).join(" | "));
  assert.ok(fitted.floors <= 8, "zona A: hasta PB + 7");
});

test("kit: grilla regular y piezas repetibles en los tres tipos", () => {
  assert.deepEqual(gridLines(0, 12, 6), [0, 6, 12]);
  const lines = gridLines(0, 14, 6);
  assert.equal(lines[0], 0);
  assert.equal(lines.at(-1), 14);
  // Vanos todos iguales y cerca del módulo (se reparte el largo en módulos enteros).
  const gaps = lines.slice(1).map((v, i) => v - lines[i]);
  for (const g of gaps) assert.ok(Math.abs(g - gaps[0]) < 1e-9 && g >= 6 * 0.75 && g <= 6 * 1.5);
  const st = study("z_A");
  const d = initialDesign(st, {}, specs, galpones);
  for (const t of LAND) {
    const c = computeDesign(st, t, {}, d, specs, galpones)!;
    const g = createLandBuilding(specs[t], d.land[t]!, c.plan, { usable: c.usable!, party: c.party });
    assert.ok(g.stats.elements > 10, `${t}: pocas piezas`);
  }
});

test("costos: la customización mueve el costo por m² (valores demo)", () => {
  const spec = specs.departamentos;
  const st = study("z_A");
  const d = initialDesign(st, {}, specs, galpones);
  const cfg = d.land.departamentos!;
  const base = costPerM2(spec, cfg);
  assert.ok(base > 0);
  const other = spec.envelope.facades.find((f) => f.id !== cfg.facade);
  if (other) assert.notEqual(costPerM2(spec, { ...cfg, facade: other.id }), base);
});

test("inversión: TIR, punto de equilibrio y escenarios", () => {
  // 100 hoy, 110 en 12 meses → ~10 % anual.
  const flows = new Array(13).fill(0);
  flows[0] = -100;
  flows[12] = 110;
  assert.ok(Math.abs(irrAnnual(flows)! - 0.1) < 1e-4);

  const area = { built: 1000, sellable: 850, lotArea: 300 };
  const inputs = defaultInputs({ costPerM2: 1000, salePerM2: 2000, rentPerM2Month: 10, buildMonths: 24, land: 200000, extras: 0, note: "demo" });
  const r = simulate(inputs, area);
  assert.equal(r.hardCost, 1000000);
  assert.ok(Math.abs(r.investment - (200000 + 1000000 * 1.19)) < 1e-6);
  assert.ok(r.demo.length > 0, "los valores demo se avisan");
  // Vendiendo justo al precio de equilibrio la ganancia es cero.
  const be = simulate({ ...inputs, salePerM2: { ...inputs.salePerM2, value: r.breakEvenPerM2 } }, area);
  assert.ok(Math.abs(be.profit) < 1e-6);
  // Sin precio de terreno, queda pendiente (no se inventa).
  const pend = simulate(defaultInputs({ costPerM2: 1000, salePerM2: 2000, rentPerM2Month: 10, buildMonths: 24, land: null, extras: 0, note: "demo" }), area);
  assert.ok(pend.pending.includes("Terreno"));
  // Más precio → más ganancia; obra más cara → menos.
  const s = sensitivity(inputs, area);
  const up = s.find((x) => x.label === "Precio de venta" && x.delta === 0.1)!;
  const cost = s.find((x) => x.label === "Costo de obra" && x.delta === 0.1)!;
  assert.ok(up.profit > r.profit);
  assert.ok(cost.profit < r.profit);
  // Alquiler: rinde la renta neta sobre la inversión.
  const rent = simulate({ ...inputs, mode: "alquiler" }, area);
  assert.equal(rent.paybackUnit, "años");
  assert.ok(rent.noi! > 0 && rent.yield! > 0);
});

/* ── Fase 7 ── */

test("galpón: usa el entorno de Galpones y avisa (sin frenar) si el camión no entra", async () => {
  const { galponSitePlan } = await import("./design/galponSite.ts");
  const st = study("altacba");
  const d = initialDesign(st, {}, specs, galpones);
  const c = computeDesign(st, "galpon", {}, d, specs, galpones)!;
  const def = galpones.find((g) => g.id === d.galpon!.warehouseId)!;
  const plan = galponSitePlan(st, def, d.galpon!.config, c.plan.rect!);
  assert.ok(plan.lotRect, "arma el lote");
  assert.ok(plan.sidewalks.length > 0 || plan.site.sidewalk === 0);
  const truck = c.plan.checks.filter((x) => x.id.startsWith("log-"));
  assert.ok(truck.length > 0, "trae la verificación logística");
  assert.ok(truck.every((x) => x.status !== "fail"), "lo logístico sólo avisa");
  // Corriendo la nave hacia el fondo, el camión entra en el predio.
  const moved = computeDesign(st, "galpon", {}, { ...d, galpon: { ...d.galpon!, front: 45 } }, specs, galpones)!;
  assert.ok(moved.plan.checks.filter((x) => x.id.startsWith("log-") && x.status === "warn").length < truck.filter((x) => x.status === "warn").length);
});

test("galpón: la medida exterior (muros) y la marquesina entran en la caja", async () => {
  const { galponOuter } = await import("./design/plan.ts");
  const st = study("colon");
  const d = initialDesign(st, {}, specs, galpones);
  const c = computeDesign(st, "galpon", {}, d, specs, galpones)!;
  const def = galpones.find((g) => g.id === d.galpon!.warehouseId)!;
  const o = galponOuter(def, d.galpon!.config);
  assert.ok(o.w > d.galpon!.config.dimensions.width, "por fuera es más ancho que entre ejes");
  assert.ok(c.plan.ok, c.plan.checks.filter((x) => x.status === "fail").map((x) => x.detail).join(" | "));
});

test("tamaño de unidades y planta libre cambian la cantidad de unidades", () => {
  const st = study("z_A");
  const d = initialDesign(st, {}, specs, galpones);
  const base = d.land.departamentos!;
  const c = computeDesign(st, "departamentos", {}, d, specs, galpones)!;
  const mono = planLand(specs.departamentos, { ...base, unitSize: "mono" }, c.ctx);
  const big = planLand(specs.departamentos, { ...base, unitSize: "3d" }, c.ctx);
  assert.ok(mono.units > big.units);
  const o = computeDesign(st, "oficinas", {}, d, specs, galpones)!;
  const libre = planLand(specs.oficinas, { ...d.land.oficinas!, unitSize: "libre" }, o.ctx);
  assert.equal(libre.units, libre.floors.filter((f) => f.index > 0).length);
  assert.equal(libre.unitsLabel, "plantas libres");
});

test("kit: dos ventanas por módulo, tabiques, parquizado y subsuelo suman piezas", () => {
  const st = study("cerro");
  const d = initialDesign(st, {}, specs, galpones);
  const c = computeDesign(st, "departamentos", {}, d, specs, galpones)!;
  const cfg = { ...d.land.departamentos!, windowsPerBay: 2 as const, unitSize: "mono", options: { ...d.land.departamentos!.options, parquizado: true, subsuelo: true } };
  const plan = planLand(specs.departamentos, cfg, c.ctx);
  const g = createLandBuilding(specs.departamentos, cfg, plan, { usable: c.usable!, party: c.party });
  const keys = g.metadata.elements.map((e) => e.elementId ?? "").join(" ");
  assert.match(keys, /TABIQUES/);
  assert.match(keys, /SUBSUELO/);
  assert.match(keys, /PARQUIZADO/);
});

test("inversión por unidad: mismo resultado que por m² si el precio es equivalente", () => {
  const area = { built: 1000, sellable: 800, lotArea: 300, units: 10 };
  const inputs = defaultInputs({ costPerM2: 1000, salePerM2: 2000, rentPerM2Month: 10, buildMonths: 24, land: 200000, extras: 0, note: "demo", sellable: 800, units: 10 });
  const m2 = simulate(inputs, area);
  const unit = simulate({ ...inputs, basis: "unidad", salePerUnit: { ...inputs.salePerUnit, value: 160000 } }, area);
  assert.ok(Math.abs(m2.revenue - unit.revenue) < 1e-6);
  assert.ok(unit.breakEvenPerUnit! > 0);
  assert.ok(unit.demo.includes("Venta por unidad"));
});

test("normativa: las reglas por perfil salen del archivo de datos con fuente y fecha", async () => {
  const { CORDOBA_NORMS } = await import("./zoning/cordoba.ts");
  assert.match(CORDOBA_NORMS.actualizado, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(CORDOBA_NORMS.perfiles.J1.lateral);
  assert.equal(CORDOBA_NORMS.fraccionamiento.estado, "a verificar");
  assert.equal(CORDOBA_NORMS.fraccionamiento.frenteMinimo, null, "no se inventan medidas de fraccionamiento");
});
