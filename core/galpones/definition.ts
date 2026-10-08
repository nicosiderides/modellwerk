import type {
  EnvelopeData,
  ModelData,
  OptionsData,
  PricingData,
  SharedContent,
  SpecsData,
  StructureData,
  WarehouseDefinition,
  WarehouseInfo,
} from "./types.ts";

/** Los siete archivos que describen una tipología (data/galpones/<id>/). */
export type WarehouseFiles = {
  warehouse: unknown;
  structure: unknown;
  envelope: unknown;
  options: unknown;
  specs: unknown;
  pricing: unknown;
  model: unknown;
};

export const WAREHOUSE_FILE_NAMES = ["warehouse", "structure", "envelope", "options", "specs", "pricing", "model"] as const;

/**
 * Ensambla y valida una definición. Los errores se reportan con el archivo
 * y el campo, para que agregar una tipología nueva sea fácil de depurar.
 */
export function assembleDefinition(files: WarehouseFiles): WarehouseDefinition {
  const info = files.warehouse as WarehouseInfo;
  const definition: WarehouseDefinition = {
    ...info,
    structure: files.structure as StructureData,
    envelope: files.envelope as EnvelopeData,
    options: files.options as OptionsData,
    specs: files.specs as SpecsData,
    pricing: files.pricing as PricingData,
    model: files.model as ModelData,
  };
  const errors = validateDefinition(definition);
  if (errors.length) throw new Error(`Tipología "${info?.id ?? "?"}" inválida:\n- ${errors.join("\n- ")}`);
  return definition;
}

export function validateDefinition(d: WarehouseDefinition): string[] {
  const errors: string[] = [];
  const need = (cond: unknown, message: string) => {
    if (!cond) errors.push(message);
  };
  need(d.id && /^[a-z0-9-]+$/.test(d.id), "warehouse.json: id en minúsculas y guiones");
  need(d.code && /^[A-Z0-9]+$/.test(d.code), "warehouse.json: code en mayúsculas sin espacios (se usa en nombres de nodos)");
  need(d.name, "warehouse.json: name");
  const r = d.dimensions;
  for (const key of ["width", "length", "eaveHeight", "roofSlope", "baySpacing"] as const) {
    need(r?.[key] && r[key].min <= r[key].max && r[key].step > 0, `warehouse.json: dimensions.${key} {min, max, step}`);
  }
  need(r?.bayCount && r.bayCount.min >= 1 && r.bayCount.min <= r.bayCount.max, "warehouse.json: dimensions.bayCount {min, max}");
  need(d.defaults && d.defaults.bayCount * d.defaults.baySpacing >= r.length.min - 1e-6 && d.defaults.bayCount * d.defaults.baySpacing <= r.length.max + 1e-6, "warehouse.json: defaults.bayCount × baySpacing fuera del rango de longitud");
  need(d.structure?.systems?.some((s) => s.id === d.structure.default), "structure.json: default debe existir en systems");
  need(d.structure?.finishes?.some((f) => f.id === d.structure.defaultFinish), "structure.json: defaultFinish debe existir en finishes");
  const env = d.envelope;
  need(env?.roof?.some((o) => o.id === env.defaults.roof), "envelope.json: defaults.roof");
  need(env?.walls?.some((o) => o.id === env.defaults.walls), "envelope.json: defaults.walls");
  need(env?.colors?.some((c) => c.id === env.defaults.roofColor), "envelope.json: defaults.roofColor");
  need(env?.colors?.some((c) => c.id === env.defaults.wallColor), "envelope.json: defaults.wallColor");
  for (const roof of env?.roof ?? []) {
    for (const ins of roof.insulation) need(env.insulation.some((i) => i.id === ins), `envelope.json: roof ${roof.id} → aislación ${ins} inexistente`);
  }
  need(Array.isArray(d.options?.options), "options.json: options[]");
  need(d.options?.openings?.sectionalDoor && d.options.openings.defaults, "options.json: openings");
  need(Array.isArray(d.specs?.description), "specs.json: description[]");
  need(d.pricing?.status === "demo" || d.pricing?.status === "real", "pricing.json: status demo | real");
  if (d.model?.strategy === "discreteVariant") {
    need(d.model.variants?.length > 0, "model.json: variants[] para discreteVariant");
    const defaultVariant = d.model.defaultVariant;
    need(d.model.variants?.some((v) => v.id === defaultVariant), "model.json: defaultVariant debe existir");
    for (const v of d.model.variants ?? []) {
      need(v.model?.type === "glb" && v.model.src, `model.json: variante ${v.id} sin src GLB`);
      need(Math.abs(v.dimensions.bayCount * v.dimensions.baySpacing - v.dimensions.length) < 0.01, `model.json: variante ${v.id}: length ≠ bayCount × baySpacing`);
    }
  } else {
    need(d.model?.strategy === "dynamicGeometry", "model.json: strategy dynamicGeometry | discreteVariant");
  }
  return errors;
}

export function assembleShared(value: unknown): SharedContent {
  return value as SharedContent;
}
