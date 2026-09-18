import assert from "node:assert/strict";
import test from "node:test";
import { evaluateConfiguration } from "./engine.ts";
import type { ConfigurationCatalog, ConfigurationSelection } from "./types.ts";

// El fixture prueba el motor sin depender de React, Three.js ni del catalogo visual.

const catalog: ConfigurationCatalog = {
  schemaVersion: 1,
  catalogVersion: "catalog-test-1",
  priceBookVersion: "prices-test-1",
  currency: "USD",
  products: [
    { id: "MW50", name: "MW50", available: true, basePrice: 42000 },
    { id: "CUSTOM", name: "Custom", available: true, basePrice: null, priceOnRequest: true },
  ],
  optionGroups: [
    {
      key: "use",
      label: "Uso",
      required: true,
      choices: [
        { id: "office", label: "Oficina", price: 1200 },
        { id: "health", label: "Salud", price: 5200 },
      ],
    },
    {
      key: "envelope",
      label: "Paredes",
      required: true,
      choices: [
        { id: "pir-50", label: "PIR 50", price: 0 },
        { id: "pir-80", label: "PIR 80", price: 2400 },
      ],
    },
  ],
  materialGroups: [
    {
      key: "EXT_REV",
      label: "Revestimiento",
      required: true,
      choices: [{ id: "graphite", label: "Grafito", price: 680 }],
    },
  ],
  rules: [
    {
      id: "HEALTH_REQUIRES_PIR80",
      when: [
        { source: "option", key: "use", operator: "equals", value: "health" },
        { source: "option", key: "envelope", operator: "not-equals", value: "pir-80" },
      ],
      severity: "error",
      path: "options.envelope",
      message: "Salud requiere PIR 80.",
    },
  ],
};

function selection(overrides: Partial<ConfigurationSelection> = {}): ConfigurationSelection {
  return {
    schemaVersion: 1,
    productId: "MW50",
    quantity: 1,
    options: { use: "office", envelope: "pir-80" },
    materials: { EXT_REV: "graphite" },
    ...overrides,
  };
}

test("cotiza producto, opciones y materiales con cantidad", () => {
  const result = evaluateConfiguration(catalog, selection({ quantity: 2 }));

  assert.equal(result.valid, true);
  assert.equal(result.quote.status, "estimated");
  assert.equal(result.quote.unitSubtotal, 46280);
  assert.equal(result.quote.total, 92560);
  assert.equal(result.quote.lines.length, 4);
});

test("rechaza una seleccion obligatoria faltante", () => {
  const result = evaluateConfiguration(
    catalog,
    selection({ options: { use: "office" } })
  );

  assert.equal(result.valid, false);
  assert.equal(result.quote.status, "invalid");
  assert.ok(result.issues.some((issue) => issue.code === "REQUIRED_SELECTION_MISSING"));
});

test("rechaza opciones que no existen en el catalogo", () => {
  const result = evaluateConfiguration(
    catalog,
    selection({ options: { use: "office", envelope: "inventada" } })
  );

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "UNKNOWN_CHOICE"));
});

test("marca como a cotizar un producto sin precio publicado", () => {
  const result = evaluateConfiguration(catalog, selection({ productId: "CUSTOM" }));

  assert.equal(result.valid, true);
  assert.equal(result.quote.status, "on-request");
  assert.equal(result.quote.total, null);
});

test("aplica reglas de compatibilidad declarativas", () => {
  const result = evaluateConfiguration(
    catalog,
    selection({ options: { use: "health", envelope: "pir-50" } })
  );

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "RULE_HEALTH_REQUIRES_PIR80"));
});
