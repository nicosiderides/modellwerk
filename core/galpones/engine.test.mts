import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Mesh } from "three";
import { assembleDefinition, WAREHOUSE_FILE_NAMES, type WarehouseFiles } from "./definition.ts";
import { createDefaultConfig, normalizeConfig, openingLimits, ridgeHeight, selectVariant, setDimension, evaluateRules } from "./configuration.ts";
import { calculateMetrics } from "./metrics.ts";
import { generateTechnicalDescription } from "./description.ts";
import { createWarehouseModel, distributeInBays } from "./geometry.ts";
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
