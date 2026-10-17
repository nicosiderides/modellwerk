import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { composeStudy, studyEnvelope, type LotContext } from "./geo/study.ts";
import { parseAreaPerUnit, parseFloors, parseFront, parseUpperSetback, usesFor } from "./zoning/cordoba.ts";
import { clip, insideOfEdge, polygonArea, subtractBox } from "./envelope/poly.ts";
import { distToRing, pointInRing, type XY } from "../galpones/geo/parcel.ts";
import type { Feature, ParcelProps } from "../galpones/geo/idecor.ts";

type Fx = { lots: Record<string, { parcel: Feature<ParcelProps>; context: LotContext }> };
const fx = JSON.parse(readFileSync(new URL("./fixtures/cordoba-lotes.json", import.meta.url), "utf8")) as Fx;
const study = (k: string) => composeStudy(fx.lots[k].parcel, fx.lots[k].context, "ok");

/* ── lectura de textos de la Ord. 8256 ── */

test("textos de la Ord. 8256: pisos, densidad y retiros", () => {
  assert.equal(parseFloors("Planta Baja + 7 pisos"), 8);
  assert.equal(parseFloors("PB + 4 pisos (Ver Grafico 21 - Perfil XXVIII)"), 5);
  assert.equal(parseFloors("Planta Baja + 2 plantas"), 3);
  assert.equal(parseAreaPerUnit("Número de Unidades Funcionales: 1 cada 250m² de Superficie de Parcela."), 250);
  assert.equal(parseAreaPerUnit("UF: 1 c/100m2 de Superficie de Parcela."), 100);
  assert.deepEqual(parseUpperSetback("S/ Línea Municipal Vigente. Retiro a 12 m del Eje de Calle a partir de los 10,50 m"), { from: 10.5, dist: 12, ref: "eje" });
  assert.deepEqual(parseUpperSetback("S/ Línea Municipal Vigente. A partir de los 12 m de altura retiro de 3 m desde Línea de Edificación"), { from: 12, dist: 3, ref: "linea" });
  assert.deepEqual(parseUpperSetback("S/ Línea Municipal Vigente. Retiro LE a 3 m a partir de los 15 m"), { from: 15, dist: 3, ref: "linea" });
  assert.deepEqual(parseFront("S/ Línea Municipal Vigente", "residencial"), { value: 0, kind: "interpretado" });
  assert.deepEqual(parseFront("Retiro a 4 m", "residencial"), { value: 4, kind: "dato" });
  assert.deepEqual(parseFront("6 m", "residencial"), { value: 6, kind: "dato" });
  assert.deepEqual(parseFront("USO INDUSTRIAL: 20,00 mts - VIVIENDA USO RURAL: 6,00 mts", "residencial"), { value: 6, kind: "interpretado" });
  assert.equal(parseFront("Art.9 Ord. 8256", "residencial").value, null);
});

test("usos: zona industrial no prevé departamentos; zona de usos mixtos admite oficinas", () => {
  const l = usesFor({ perfil_o_zona: "L", caracter_urbanistico: "DESTINADA FUNDAMENTALMENTE AL ASENTAMIENTO DE ACTIVIDADES INDUSTRIALES Y USOS RURALES. EXCLUIDA LA LOCALIZACIÓN DE PLANES DE VIVIENDA" }, { patron: "IVb" });
  assert.equal(l.departamentos.status, "no");
  assert.equal(l.vivienda.status, "condicionado");
  assert.equal(l.galpon.status, "si");
  const c2 = study("z_C2").zone!;
  assert.equal(c2.uses.oficinas.status, "si");
  assert.equal(c2.uses.departamentos.status, "si");
  const f3 = study("cerro").zone!;
  assert.equal(f3.uses.vivienda.status, "si");
  assert.equal(f3.uses.departamentos.status, "condicionado");
});

/* ── geometría ── */

test("recorte por retiro: un cuadrado de 10 m con 3 m de frente queda de 10 × 7", () => {
  const sq: XY[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  const cut = clip(sq, insideOfEdge(sq[0], sq[1], 3));
  assert.ok(Math.abs(polygonArea(cut) - 70) < 1e-6);
  const holed = subtractBox([sq], { origin: [0, 0], s: [1, 0], t: [0, 1] }, { s0: 3, s1: 7, t0: 3, t1: 7 });
  const sum = holed.reduce((a, p) => a + polygonArea(p), 0);
  assert.ok(Math.abs(sum - 84) < 1e-6, `${sum}`);
});

/* ── lotes reales ── */

test("zona D (General Paz): FOS 70 %, FOT 2,5, 15 m, retiro de fondo y retiro de 3 m en altura", () => {
  const s = study("generalpaz");
  const r = studyEnvelope(s, "departamentos")!;
  assert.equal(s.zone!.perfil, "D");
  assert.equal(r.rules.fos.value, 0.7);
  assert.equal(r.rules.fot.value, 2.5);
  assert.equal(r.rules.setbackBack.value, 3);
  const e = r.envelope;
  assert.equal(e.tiers.length, 2);
  assert.equal(e.tiers[0].to, 12);
  assert.ok(e.tiers[1].area < e.tiers[0].area, "arriba de 12 m la planta se achica");
  assert.ok(e.groundArea < s.analysis.area, "el retiro de fondo saca superficie");
  assert.ok(Math.abs(e.builtMax - 2.5 * s.analysis.area) < 1, "la superficie la limita el FOT");
  assert.equal(e.builtLimit, "fot");
});

test("la caja siempre queda dentro del lote real", () => {
  for (const k of Object.keys(fx.lots)) {
    const s = study(k);
    const env = studyEnvelope(s, "departamentos");
    if (!env) continue;
    const ring = s.analysis.ring;
    for (const tier of env.envelope.tiers)
      for (const piece of tier.pieces)
        for (const p of piece) assert.ok(pointInRing(p, ring) || distToRing(p, ring) < 0.01, `${k}: punto fuera del lote`);
  }
});

test("retiro en altura medido desde el eje: usa el ancho de calle estimado con las manzanas", () => {
  const e = studyEnvelope(study("z_A"), "departamentos")!.envelope;
  assert.ok(e.streetWidth !== null && e.streetWidth > 8 && e.streetWidth < 30, `ancho ${e.streetWidth}`);
  assert.equal(e.tiers.length, 2);
  assert.ok(e.tiers[1].area < e.tiers[0].area);
});

test("Art. 9: el retiro de frente queda 'a verificar' y se puede cargar a mano", () => {
  const s = study("cerro");
  const auto = studyEnvelope(s, "vivienda")!;
  assert.equal(auto.rules.setbackFront.source.kind, "falta");
  const manual = studyEnvelope(s, "vivienda", { setbackFront: 4 })!;
  assert.equal(manual.rules.setbackFront.value, 4);
  assert.equal(manual.rules.setbackFront.source.kind, "cargado");
  assert.ok(manual.envelope.groundArea < auto.envelope.groundArea - 30);
});

test("zona con norma particular (RF): se marca y no inventa parámetros", () => {
  const s = study("altacba");
  assert.equal(s.zone!.special, true);
  const r = studyEnvelope(s, "departamentos")!;
  assert.equal(r.rules.fos.value, null);
  assert.equal(r.envelope.heightBasis, "referencia");
});

test("densidad: unidades máximas según m² de lote por unidad", () => {
  const e = studyEnvelope(study("z_H1"), "departamentos")!.envelope;
  assert.equal(e.units, Math.floor(study("z_H1").analysis.area / 100));
});

test("una vivienda tiene a lo sumo 2 plantas aunque la zona permita más", () => {
  const e = studyEnvelope(study("z_A"), "vivienda")!.envelope;
  assert.equal(e.floors, 2);
  assert.equal(e.builtLimit, "tipo");
});
