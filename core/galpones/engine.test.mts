import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Mesh, Vector3, type Object3D } from "three";
import { assembleDefinition, WAREHOUSE_FILE_NAMES, type WarehouseFiles } from "./definition.ts";
import { createDefaultConfig, normalizeConfig, openingLimits, ridgeHeight, selectVariant, setDimension, evaluateRules } from "./configuration.ts";
import { calculateMetrics } from "./metrics.ts";
import { generateTechnicalDescription } from "./description.ts";
import { createWarehouseModel, distributeInBays } from "./geometry.ts";
import { buildSite } from "./site.ts";
import { configFromShareCode, configToShareCode, deserializeConfig, serializeConfig, readSaved, saveConfig } from "./storage.ts";
import { buildQuoteRequest, localDraftTransport, submitWarehouseQuote, validateContact } from "./quote.ts";
import { buildMetadataIndex, buildModelTree, resolveCategory } from "../product-engine/metadata.ts";
import { buildNodeName, parseNodeName } from "../product-engine/naming.ts";
import type { WarehouseDefinition } from "./types.ts";

const IDS = ["industrial-light", "industrial-pro", "logistics", "large-span"];
const load = (id: string): WarehouseDefinition => {
  const files = Object.fromEntries(
    WAREHOUSE_FILE_NAMES.map((name) => [name, JSON.parse(readFileSync(new URL(`../../data/galpones/${id}/${name}.json`, import.meta.url), "utf8"))])
  ) as WarehouseFiles;
  return assembleDefinition(files);
};
const shared = JSON.parse(readFileSync(new URL("../../data/galpones/shared.json", import.meta.url), "utf8"));

test("todas las tipologías del catálogo son válidas", () => {
  for (const id of IDS) assert.equal(load(id).id, id);
});

test("configuración por defecto coherente (longitud = módulos × separación)", () => {
  for (const id of IDS) {
    const def = load(id);
    const c = createDefaultConfig(def);
    assert.ok(Math.abs(c.dimensions.length - c.dimensions.bayCount * c.dimensions.baySpacing) < 1e-6, id);
  }
});

test("Industrial Pro 24 × 60 m: métricas geométricas", () => {
  const def = load("industrial-pro");
  const c = createDefaultConfig(def);
  assert.equal(c.dimensions.width, 24);
  assert.equal(c.dimensions.length, 60);
  const m = calculateMetrics(c, def);
  assert.equal(m.floorArea, 1440);
  assert.equal(m.numberOfFrames, 11);
  assert.equal(m.buildingHeight, ridgeHeight(c.dimensions));
  assert.equal(ridgeHeight({ width: 24, eaveHeight: 8, roofSlope: 10 }), 9.2);
  // volumen = 24·60·8 + 24·1.2·60/2
  assert.equal(m.internalVolume, 11520 + 864);
  assert.equal(m.estimatedCost.status, "pending");
  assert.equal(m.kgSteelPerM2.status, "demo");
});

test("dimensiones: longitud ajusta módulos y la cumbrera ajusta la pendiente", () => {
  const def = load("industrial-pro");
  let c = createDefaultConfig(def);
  c = setDimension(def, c, "length", 73);
  assert.equal(c.dimensions.bayCount, 12);
  assert.equal(c.dimensions.length, 72);
  c = setDimension(def, c, "bayCount", 5);
  assert.equal(c.dimensions.length, 30);
  c = setDimension(def, c, "ridgeHeight", 9.8);
  assert.equal(c.dimensions.roofSlope, 15);
  c = setDimension(def, c, "width", 99);
  assert.equal(c.dimensions.width, 36);
});

test("reglas: recomendación de reticulado para luces grandes en pórtico", () => {
  const def = load("industrial-pro");
  const c = setDimension(def, createDefaultConfig(def), "width", 34);
  assert.ok(evaluateRules(def, c).some((i) => i.id === "pro-wide-portal" && i.suggest?.structure === "truss"));
});

test("aberturas: límites por snap points y opciones según altura", () => {
  const def = load("industrial-light");
  const c = createDefaultConfig(def);
  const limits = openingLimits(def, c.dimensions);
  const forced = normalizeConfig(def, { ...c, openings: { ...c.openings, doorsFront: 99 }, options: { crane: true } });
  assert.equal(forced.openings.doorsFront, limits.doorsFront);
  const low = normalizeConfig(def, { ...c, dimensions: { ...c.dimensions, eaveHeight: 5 }, options: { crane: true } });
  assert.equal(low.options.crane, false);
  assert.deepEqual(distributeInBays(2, 6), [2, 4]);
});

test("aislación incompatible con la cubierta se corrige", () => {
  const def = load("industrial-pro");
  const c = normalizeConfig(def, { ...createDefaultConfig(def), envelope: { ...createDefaultConfig(def).envelope, roof: "sandwichPanel", insulation: "none" } });
  assert.notEqual(c.envelope.insulation, "none");
});

test("variante BIM discreta: dimensiones bloqueadas por el modelo", () => {
  const def = load("logistics");
  let c = createDefaultConfig(def);
  assert.equal(c.variant, "LG-30x72");
  const same = setDimension(def, c, "width", 40);
  assert.equal(same.dimensions.width, 30);
  c = selectVariant(def, c, "LG-45x120");
  assert.equal(c.dimensions.width, 45);
  assert.equal(c.dimensions.length, 120);
  assert.equal(c.structure, "truss");
});

test("memoria descriptiva data-driven", () => {
  const def = load("industrial-pro");
  const text = generateTechnicalDescription(createDefaultConfig(def), def).join("\n");
  assert.match(text, /24 m de luz libre y 60 m de longitud/);
  assert.match(text, /1\.440 m²/);
  assert.match(text, /pórticos metálicos de alma llena/);
  assert.doesNotMatch(text, /\{\w+\}/);
});

test("generador: IDs únicos y cada mesh mapeado a metadata", () => {
  for (const id of ["industrial-light", "industrial-pro", "large-span"]) {
    const def = load(id);
    for (const structure of def.structure.systems.map((s) => s.id)) {
      const config = normalizeConfig(def, { ...createDefaultConfig(def), structure, options: { skylights: true, canopy: true, crane: true } });
      const { root, metadata, stats } = createWarehouseModel(config, def);
      const ids = metadata.elements.map((e) => e.elementId);
      assert.equal(new Set(ids).size, ids.length, `${id}/${structure}: IDs repetidos`);
      const meshes: Mesh[] = [];
      root.traverse((o) => { if ((o as Mesh).isMesh) meshes.push(o as Mesh); });
      assert.equal(meshes.length, stats.meshes);
      const index = buildMetadataIndex(meshes, metadata);
      assert.equal(index.unmatchedNodes, 0);
      assert.equal(index.elements.size, metadata.elements.length);
      for (const category of ["columns", "rafters", "purlins", "roof", "walls", "foundations"] as const) {
        assert.ok((index.elementsByCategory.get(category)?.length ?? 0) > 0, `${id}/${structure}: falta ${category}`);
      }
      for (const mesh of meshes) {
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox!;
        assert.ok(Number.isFinite(box.min.x) && Number.isFinite(box.max.y), `${mesh.name}: geometría inválida`);
      }
    }
  }
});

test("generador: estilo revit con IDs numéricos", () => {
  const def = load("logistics");
  const { metadata } = createWarehouseModel(createDefaultConfig(def), def, { idStyle: "revit", source: "demo" });
  assert.ok(metadata.elements.every((e) => /^\d+$/.test(e.elementId)));
  assert.equal(metadata.model.source, "demo");
});

test("metadata: categorías por Revit/IFC y por convención de nombres", () => {
  assert.equal(resolveCategory({ bimCategory: "Structural Columns" }, undefined), "columns");
  assert.equal(resolveCategory({ bimCategory: "IfcRoof" }, undefined), "roof");
  assert.equal(resolveCategory(undefined, "WH01_STRUCTURE_COLUMNS"), "columns");
  assert.equal(resolveCategory(undefined, "WH01_PURLINS"), "purlins");
  assert.equal(parseNodeName(buildNodeName("GP02", "doors", "DR-F1"))?.qualifier, "DR-F1");
  const index = buildMetadataIndex(
    [
      { uuid: "a", name: "WH01_ROOF", userData: {} },
      { uuid: "b", name: "x", userData: { elementId: 123456 } },
    ],
    { schema: "mw.product-metadata/1", model: { id: "t", source: "revit", units: "m" }, elements: [{ elementId: "123456", bimCategory: "Structural Columns", type: "HEB 300" }] }
  );
  assert.equal(index.elements.get("123456")?.category, "columns");
  assert.equal(index.unmatchedNodes, 1);
  const tree = buildModelTree("Galpón", index, shared.groups, {});
  assert.equal(tree.count, 2);
});

test("guardar / cargar / compartir", () => {
  const def = load("industrial-pro");
  const c = createDefaultConfig(def);
  assert.deepEqual(deserializeConfig(JSON.parse(JSON.stringify(serializeConfig(c)))), c);
  assert.deepEqual(configFromShareCode(configToShareCode(c)), c);
  assert.equal(configFromShareCode("basura"), null);
  const memory = new Map<string, string>();
  const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) };
  saveConfig(storage, "Opción A", c);
  assert.equal(readSaved(storage)[0].name, "Opción A");
});

test("solicitud de presupuesto adjunta la configuración completa", async () => {
  const def = load("industrial-pro");
  const c = createDefaultConfig(def);
  const contact = { name: "Ana", company: "Demo SA", email: "ana@example.com", phone: "+54 11 5555-5555", city: "Rosario", projectLocation: "Parque industrial", comments: "" };
  assert.deepEqual(validateContact(contact), {});
  assert.ok(validateContact({ ...contact, email: "x" }).email);
  const request = buildQuoteRequest(contact, c, def);
  assert.equal(request.warehouseConfiguration.data.dimensions.width, 24);
  const memory = new Map<string, string>();
  const { result } = await submitWarehouseQuote(contact, c, def, localDraftTransport({ getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v) }));
  assert.ok(result.ok && result.mode === "local-draft");
});

test("lámina de planos: todas las tipologías, sin valores inválidos", async () => {
  const { buildDrawingSheet } = await import("./drawings.ts");
  for (const id of IDS) {
    const def = load(id);
    for (const structure of def.structure.systems.map((s) => s.id)) {
      for (const options of [{ skylights: true, canopy: true, crane: true }, { skylights: false, canopy: false, crane: false }]) {
        const config = normalizeConfig(def, { ...createDefaultConfig(def), structure, options, openings: { doorsFront: 2, doorsBack: 1, doorsSide: 2, personDoors: 2, windowsPerSide: 3 } });
        const { svg, scale } = buildDrawingSheet(config, def, { date: "01/01/2026" });
        assert.ok(scale >= 100 && scale <= 2000, `${id}/${structure}: escala ${scale}`);
        assert.ok(!/NaN|Infinity|undefined/.test(svg), `${id}/${structure}: valores inválidos en el SVG`);
        for (const name of ["PLANTA", "VISTA FRENTE", "VISTA LATERAL OESTE", "VISTA LATERAL ESTE", "CORTE X-X", "CORTE Y-Y"]) assert.ok(svg.includes(name), `${id}: falta ${name}`);
        assert.equal(svg.includes("VISTA CONTRAFRENTE"), config.openings.doorsBack > 0, `${id}: contrafrente sólo si tiene portones`);
      }
    }
  }
});

test("entorno: veredas, estacionamiento y vehículos sin geometría inválida", async () => {
  const { buildSite, disposeSite } = await import("./site.ts");
  const sites = [
    { sidewalk: 1.5, parking: 16, parkingSide: "west", truckYard: true, landscape: true },
    { sidewalk: 0, parking: 0, parkingSide: "west", truckYard: false, landscape: false },
    { sidewalk: 3, parking: 80, parkingSide: "back", truckYard: true, landscape: true },
  ] as const;
  for (const id of IDS) {
    const def = load(id);
    for (const site of sites) {
      const config = normalizeConfig(def, { ...createDefaultConfig(def), site: { ...site }, openings: { doorsFront: 2, doorsBack: 1, doorsSide: 1, personDoors: 2, windowsPerSide: 2 } });
      const { root, box } = buildSite(config, def, { vehicles: true });
      assert.ok(Number.isFinite(box.min.x) && Number.isFinite(box.max.z), `${id}: caja del entorno inválida`);
      root.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.computeBoundingBox();
        const b = mesh.geometry.boundingBox!;
        assert.ok(Number.isFinite(b.min.x) && Number.isFinite(b.max.y), `${id}: ${mesh.name} inválido`);
      });
      disposeSite(root);
    }
  }
});

test("implantación: el lote mínimo cumple y un lote chico se detecta", async () => {
  const { verifySite } = await import("./siteCheck.ts");
  for (const id of IDS) {
    const def = load(id);
    const auto = verifySite(createDefaultConfig(def), def);
    assert.equal(auto.summary.fail, 0, `${id}: el lote mínimo no debería tener incumplimientos (${auto.checks.filter((c) => c.status === "fail").map((c) => c.label).join(", ")})`);
    assert.ok(auto.lot && auto.lot.area >= 2500, `${id}: lote mínimo del parque`);
    const tight = createDefaultConfig(def);
    tight.lot = { ...tight.lot, mode: "manual", width: 30, depth: 40, front: 2, left: 1 };
    const bad = verifySite(normalizeConfig(def, tight), def);
    assert.ok(bad.summary.fail > 0, `${id}: un lote chico debería fallar`);
  }
});

test("implantación: configuraciones viejas sin lote se completan", () => {
  const def = load("industrial-pro");
  const legacy = structuredClone(createDefaultConfig(def)) as Partial<WarehouseConfigShape>;
  delete legacy.lot;
  delete legacy.site;
  const fixed = normalizeConfig(def, legacy as never);
  assert.equal(fixed.lot.preset, "ecoparque");
  assert.equal(fixed.site.sidewalk, 1.5);
});
type WarehouseConfigShape = ReturnType<typeof createDefaultConfig>;

test("fundaciones: tres tipos, por defecto bases aisladas, y configuraciones viejas se completan", () => {
  for (const id of IDS) {
    const def = load(id);
    assert.deepEqual(def.structure.foundations.map((f) => f.id).sort(), ["padFootings", "piles", "stripFooting"], id);
    assert.equal(createDefaultConfig(def).foundation, "padFootings", id);
  }
  const def = load("industrial-light");
  const old = createDefaultConfig(def) as Partial<ReturnType<typeof createDefaultConfig>>;
  delete old.foundation;
  assert.equal(normalizeConfig(def, old as ReturnType<typeof createDefaultConfig>).foundation, "padFootings");
});

test("fundaciones: el 3D y la memoria cambian según el tipo", () => {
  const def = load("industrial-pro");
  const keysFor = (foundation: "padFootings" | "stripFooting" | "piles") => {
    const config = normalizeConfig(def, { ...createDefaultConfig(def), foundation });
    const { root, metadata } = createWarehouseModel(config, def);
    const ids = metadata.elements.map((e) => e.elementId);
    assert.equal(new Set(ids).size, ids.length, `${foundation}: IDs repetidos`);
    const meshes: Mesh[] = [];
    root.traverse((o) => { if ((o as Mesh).isMesh) meshes.push(o as Mesh); });
    assert.equal(buildMetadataIndex(meshes, metadata).unmatchedNodes, 0, `${foundation}: piezas sin metadata`);
    const keys = metadata.elements.filter((e) => e.category === "foundations").map((e) => e.elementId);
    const text = generateTechnicalDescription(config, def).join(" ");
    return { keys, text };
  };
  const pads = keysFor("padFootings");
  const strip = keysFor("stripFooting");
  const piles = keysFor("piles");
  assert.ok(pads.keys.some((k) => /FD-/.test(k)) && !pads.keys.some((k) => /ZC-|PI-/.test(k)));
  assert.equal(strip.keys.filter((k) => /ZC-/.test(k)).length, 4);
  assert.ok(piles.keys.some((k) => /PI-/.test(k)) && piles.keys.filter((k) => /VE-/.test(k)).length === 4);
  assert.match(pads.text, /bases aisladas/);
  assert.match(strip.text, /zapata corrida/);
  assert.match(piles.text, /pilotes/);
});

test("piso: H20 por defecto, alisado opcional, y queda en la memoria", () => {
  for (const id of IDS) {
    const def = load(id);
    assert.deepEqual(def.structure.floors.map((f) => f.id).sort(), ["h20", "troweled"], id);
    assert.equal(createDefaultConfig(def).floor, "h20", id);
  }
  const def = load("industrial-light");
  const old = createDefaultConfig(def) as Partial<ReturnType<typeof createDefaultConfig>>;
  delete old.floor;
  assert.equal(normalizeConfig(def, old as ReturnType<typeof createDefaultConfig>).floor, "h20");
  const troweled = normalizeConfig(def, { ...createDefaultConfig(def), floor: "troweled" });
  assert.match(generateTechnicalDescription(troweled, def).join(" "), /hormigón alisado/);
  assert.match(generateTechnicalDescription(createDefaultConfig(def), def).join(" "), /hormigón H20/);
});

/* Caras superpuestas: dos superficies en el mismo plano con distinto material "titilan" en pantalla. */
function coincidentFaces(roots: Object3D[]) {
  type F = { owner: string; mat: string; axis: number; sign: number; d: number; u0: number; u1: number; v0: number; v1: number; offset: number };
  const faces: F[] = [];
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3(), e = new Vector3();
  for (const root of roots) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh || (m as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) return;
      const material = (Array.isArray(m.material) ? m.material[0] : m.material) as { name?: string; transparent?: boolean; polygonOffset?: boolean; polygonOffsetFactor?: number };
      if (material.transparent) return;
      const pos = m.geometry.getAttribute("position");
      const idx = m.geometry.index;
      const count = idx ? idx.count : pos.count;
      for (let i = 0; i < count; i += 3) {
        const at = (k: number) => (idx ? idx.getX(i + k) : i + k);
        a.fromBufferAttribute(pos, at(0)).applyMatrix4(m.matrixWorld);
        b.fromBufferAttribute(pos, at(1)).applyMatrix4(m.matrixWorld);
        c.fromBufferAttribute(pos, at(2)).applyMatrix4(m.matrixWorld);
        n.subVectors(b, a).cross(e.subVectors(c, a));
        if (n.length() < 2e-4) continue;
        n.normalize();
        const axis = Math.abs(n.y) > 0.999 ? 1 : Math.abs(n.x) > 0.999 ? 0 : Math.abs(n.z) > 0.999 ? 2 : -1;
        if (axis < 0) continue;
        const sign = Math.sign(n.getComponent(axis));
        const d = a.getComponent(axis);
        // Caras de abajo apoyadas en el piso o enterradas: no se ven.
        if (axis === 1 && (sign < 0 ? d <= 0.001 : d < -0.025)) continue;
        const [ua, va] = [0, 1, 2].filter((q) => q !== axis);
        const us = [a, b, c].map((p) => p.getComponent(ua));
        const vs = [a, b, c].map((p) => p.getComponent(va));
        faces.push({ owner: m.name || "?", mat: (m.userData?.materialKey as string) ?? material.name ?? "", axis, sign, d, u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs), offset: material.polygonOffset ? (material.polygonOffsetFactor ?? 0) : 0 });
      }
    });
  }
  const found = new Set<string>();
  for (const axis of [0, 1, 2]) {
    const list = faces.filter((f) => f.axis === axis).sort((p, q) => p.d - q.d);
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length && list[j].d - list[i].d < 0.0025; j++) {
        const p = list[i], q = list[j];
        if (p.sign !== q.sign || p.owner === q.owner || p.mat === q.mat || p.offset !== q.offset) continue;
        if (Math.min(p.u1, q.u1) - Math.max(p.u0, q.u0) < 0.02 || Math.min(p.v1, q.v1) - Math.max(p.v0, q.v0) < 0.02) continue;
        found.add(`${p.owner} × ${q.owner} (${"xyz"[axis]} = ${p.d.toFixed(3)})`);
      }
  }
  return [...found];
}

test("sin caras superpuestas entre materiales distintos (modelo + entorno, todas las fundaciones)", () => {
  for (const id of ["industrial-light", "industrial-pro", "large-span"]) {
    const def = load(id);
    for (const foundation of ["padFootings", "stripFooting", "piles"] as const) {
      const base = createDefaultConfig(def);
      const config = normalizeConfig(def, { ...base, foundation, options: { skylights: true, canopy: true, crane: true }, site: { ...base.site, parking: 20, truckYard: true, landscape: true }, lot: { ...base.lot, enabled: true } });
      const overlaps = coincidentFaces([createWarehouseModel(config, def).root, buildSite(config, def, { vehicles: false }).root]);
      assert.deepEqual(overlaps, [], `${id}/${foundation}`);
    }
  }
});
