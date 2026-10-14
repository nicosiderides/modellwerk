import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { assembleDefinition, WAREHOUSE_FILE_NAMES, type WarehouseFiles } from "../definition.ts";
import { createDefaultConfig, normalizeConfig } from "../configuration.ts";
import { verifySite } from "../siteCheck.ts";
import { blockingIssues, fitToLot } from "../lotLimits.ts";
import type { WarehouseDefinition } from "../types.ts";
import { analyzeParcel, lotPointToLonLat, localFrame, toXY, pointInRing, type LonLat } from "./parcel.ts";
import { classifyUse, parseBack, parseMeters, zoneFromCordoba, type Ord8256Props } from "./cordobaZoning.ts";
import { outerRing, type Feature, type ParcelProps } from "./idecor.ts";
import { buildLotLocation, lotPatchFromLocation } from "./lotFromParcel.ts";

type Fx = { parcels: Feature<ParcelProps>[]; blocks: (Feature<object> | null)[]; zoneL: Ord8256Props };
const fx = JSON.parse(readFileSync(new URL("./fixtures/ferreyra.json", import.meta.url), "utf8")) as Fx;
const ring = (i: number) => outerRing(fx.parcels[i].geometry);
const block = (i: number) => (fx.blocks[i] ? outerRing(fx.blocks[i]!.geometry as Feature<object>["geometry"]) : null);

const load = (id: string): WarehouseDefinition =>
  assembleDefinition(Object.fromEntries(WAREHOUSE_FILE_NAMES.map((name) => [name, JSON.parse(readFileSync(new URL(`../../../data/galpones/${id}/${name}.json`, import.meta.url), "utf8"))])) as WarehouseFiles);

test("lote angosto y largo: frente sobre la calle y rectángulo útil casi igual al lote", () => {
  const a = analyzeParcel(ring(0), { block: block(0) });
  assert.ok(Math.abs(a.edges[a.frontEdge].length - 18) < 0.5, `frente ${a.edges[a.frontEdge].length}`);
  assert.ok(Math.abs(a.fit.width - 17.6) < 0.6 && Math.abs(a.fit.depth - 198.5) < 1.5, `${a.fit.width} × ${a.fit.depth}`);
  assert.ok(a.fit.coverage > 0.95);
  assert.equal(a.corner, "none");
});

test("lote irregular: el rectángulo útil queda siempre dentro del lote real", () => {
  const a = analyzeParcel(ring(1), { block: block(1) });
  assert.ok(a.fit.coverage < 0.8, "es irregular");
  const local = a.ring;
  for (const [x, z] of [[0, 0], [a.fit.width, 0], [a.fit.width, a.fit.depth], [0, a.fit.depth], [a.fit.width / 2, a.fit.depth / 2]]) {
    const p = toXY(a.frame, lotPointToLonLat(a, x, z));
    assert.ok(pointInRing(p, local), `punto (${x}, ${z}) fuera del lote`);
  }
});

test("lote en esquina: se detecta de qué lado está la calle lateral", () => {
  const a = analyzeParcel(ring(2), { block: block(2) });
  assert.notEqual(a.corner, "none");
  assert.ok(a.sides.length >= 2);
});

test("elegir otro frente cambia la orientación del lote", () => {
  const a = analyzeParcel(ring(2), { block: block(2) });
  const other = a.sides.find((s) => !s.edges.includes(a.frontEdge))!;
  const b = analyzeParcel(ring(2), { block: block(2), preferredFront: other.edges[0] });
  assert.equal(b.frontEdge, other.edges[0]);
  assert.ok(Math.abs(a.fit.width * a.fit.depth - b.fit.width * b.fit.depth) < 0.06 * a.fit.width * a.fit.depth, "rectángulo parecido, otro frente");
});

test("Ord. 8256: lectura de retiros escritos como texto", () => {
  assert.equal(parseMeters("10 m"), 10);
  assert.equal(parseMeters("Retiro a 6 m de la Línea Edificación"), 6);
  assert.equal(parseMeters("USO INDUSTRIAL: 20,00 mts - VIVIENDA USO RURAL: 6,00 mts"), 20);
  assert.equal(parseMeters("S/ Línea Municipal Vigente"), 0);
  assert.equal(parseMeters("Art.9 Ord. 8256"), null);
  assert.equal(parseBack("LATERALES: ... FONDO: 10 m"), 10);
  assert.equal(classifyUse("IVb").uso, "industrial");
  assert.equal(classifyUse("IIIa").uso, "condicionado");
  assert.equal(classifyUse("EV").uso, "no");
});

test("zona L: FOS y retiros laterales según el ancho del frente", () => {
  const narrow = zoneFromCordoba(fx.zoneL, { patron: "IVb" }, 18)!;
  assert.equal(narrow.rules.fos, 0.8);
  assert.equal(narrow.rules.sideCount, 0);
  assert.equal(narrow.rules.setbackFront, 10);
  assert.equal(narrow.rules.setbackBack, 10);
  assert.equal(narrow.rules.maxHeight, null);
  assert.equal(narrow.zone.uso, "industrial");
  const mid = zoneFromCordoba(fx.zoneL, null, 40)!;
  assert.equal(mid.rules.fos, 0.6);
  assert.deepEqual([mid.rules.setbackSide, mid.rules.sideCount], [6, 1]);
  const wide = zoneFromCordoba(fx.zoneL, null, 80)!;
  assert.deepEqual([wide.rules.setbackSide, wide.rules.sideCount], [6, 2]);
});

test("usar un lote real: medidas, normativa de la zona y el galpón cumple", () => {
  const def = load("industrial-light");
  const a = analyzeParcel(ring(2), { block: block(2) });
  const zone = zoneFromCordoba(fx.zoneL, { patron: "IVb" }, a.fit.width);
  const location = buildLotLocation(fx.parcels[2], a, zone, new Date("2026-10-13T12:00:00Z"));
  const base = createDefaultConfig(def);
  const placed = normalizeConfig(def, { ...base, lot: { ...base.lot, ...lotPatchFromLocation(location, a.corner, zone) } });
  // El galpón inicial no entra en el fondo de este lote (52,6 m con 10 + 10 m de retiros): se ajusta.
  assert.ok(blockingIssues(placed, def).some((x) => x.id === "sb-back" || x.id === "sb-front"));
  const c = fitToLot(def, placed);
  assert.ok(c.dimensions.length < placed.dimensions.length);
  assert.equal(c.lot.mode, "manual");
  assert.equal(c.lot.preset, "cordoba-zona");
  assert.ok(c.lot.location && c.lot.location.ring.length >= 4);
  assert.ok(c.lot.width <= a.fit.width && c.lot.width > a.fit.width - 0.2);
  assert.equal(c.lot.rules.setbackFront, 10);
  const v = verifySite(c, def);
  assert.equal(v.checks.find((x) => x.id === "fot")?.source?.verified, true);
  assert.match(v.checks.find((x) => x.id === "fos")?.source?.text ?? "", /zona L/);
  assert.deepEqual(blockingIssues(c, def).map((x) => x.id), []);
  // la esquina del rectángulo útil en el mapa es la esquina frente-oeste del lote del configurador
  const origin = lotPointToLonLat(a, 0, 0) as LonLat;
  const f = localFrame(location.center);
  const d = Math.hypot(...(toXY(f, origin).map((v, i) => v - toXY(f, location.fit.origin)[i]) as [number, number]));
  assert.ok(d < 0.05);
});

test("mapa: Web Mercator y coordenadas del lote van y vuelven", async () => {
  const { worldPx, worldPxToLonLat, lotTransform, mapLevel, metersPerPx } = await import("./tiles.ts");
  const p: [number, number] = [-64.1133, -31.4516];
  const back = worldPxToLonLat(worldPx(p, 19), 19);
  assert.ok(Math.abs(back[0] - p[0]) < 1e-9 && Math.abs(back[1] - p[1]) < 1e-9);
  const fit = { origin: p, s: [Math.cos(0.3), Math.sin(0.3)] as [number, number], t: [-Math.sin(0.3), Math.cos(0.3)] as [number, number] };
  const T = lotTransform(fit);
  const q = T.toLocal(T.toLonLat([42.5, 61.2]));
  assert.ok(Math.abs(q[0] - 42.5) < 1e-6 && Math.abs(q[1] - 61.2) < 1e-6);
  // ±480 m a zoom 17 (≈ 1 m/px): 4 o 5 mosaicos por lado.
  const level = mapLevel(p, 480, 17);
  assert.ok(Math.abs((level.px[2] - level.px[0]) * metersPerPx(p[1], 17) - 960) < 1);
  assert.ok(level.tiles.length >= 16 && level.tiles.length <= 25);
});
