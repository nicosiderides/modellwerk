import type {
  ConfigIssue,
  DimensionKey,
  Dimensions,
  ModelVariant,
  Openings,
  Range,
  StructureSystemId,
  WarehouseConfig,
  WarehouseDefinition,
} from "./types.ts";

/**
 * Reglas de configuración (independientes de React y de Three).
 * Toda modificación pasa por `normalizeConfig`, que garantiza una
 * configuración coherente con los rangos y reglas de la tipología.
 */

const round = (value: number, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function snapToRange(value: number, range: Range) {
  const stepped = Math.round((value - range.min) / range.step) * range.step + range.min;
  return round(clamp(stepped, range.min, range.max), 3);
}

export function ridgeHeight(dimensions: Pick<Dimensions, "width" | "eaveHeight" | "roofSlope">) {
  return round(dimensions.eaveHeight + (dimensions.width / 2) * (dimensions.roofSlope / 100), 2);
}

export function slopeDegrees(roofSlopePercent: number) {
  return round((Math.atan(roofSlopePercent / 100) * 180) / Math.PI, 1);
}

export function isDiscrete(definition: WarehouseDefinition) {
  return definition.model.strategy === "discreteVariant";
}

export function getVariant(definition: WarehouseDefinition, variantId?: string): ModelVariant | null {
  if (definition.model.strategy !== "discreteVariant") return null;
  return (
    definition.model.variants.find((variant) => variant.id === variantId) ??
    definition.model.variants.find((variant) => variant.id === (definition.model.strategy === "discreteVariant" ? definition.model.defaultVariant : "")) ??
    definition.model.variants[0] ??
    null
  );
}

/** Ajusta longitud/separación/módulos para que siempre sean consistentes. */
function reconcileBays(definition: WarehouseDefinition, dims: Dimensions, priority: "length" | "bayCount" | "baySpacing"): Dimensions {
  const ranges = definition.dimensions;
  const spacing = snapToRange(dims.baySpacing, ranges.baySpacing);
  let bayCount = Math.round(dims.bayCount);
  if (priority === "length") {
    const targetLength = clamp(dims.length, ranges.length.min, ranges.length.max);
    bayCount = Math.max(1, Math.round(targetLength / spacing));
  }
  bayCount = clamp(bayCount, ranges.bayCount.min, ranges.bayCount.max);
  // Mantener la longitud dentro de su rango, ajustando módulos si hace falta.
  while (bayCount * spacing > ranges.length.max && bayCount > ranges.bayCount.min) bayCount -= 1;
  while (bayCount * spacing < ranges.length.min && bayCount < ranges.bayCount.max) bayCount += 1;
  return { ...dims, baySpacing: spacing, bayCount, length: round(bayCount * spacing, 2) };
}

/* ─────────────────────────── aberturas ─────────────────────────── */

export type OpeningLimits = Record<keyof Openings, number>;

/** Máximos de aberturas según dimensiones (snap points disponibles). */
export function openingLimits(definition: WarehouseDefinition, dims: Dimensions): OpeningLimits {
  const door = definition.options.openings.sectionalDoor;
  const gableSlots = Math.max(0, Math.floor((dims.width - 2) / (door.width + 1.5)));
  const innerBays = Math.max(0, dims.bayCount - 2);
  const fitsDoorHeight = dims.eaveHeight - 0.6 >= Math.min(door.height, 3.2);
  return {
    doorsFront: fitsDoorHeight ? Math.min(4, gableSlots) : 0,
    doorsBack: fitsDoorHeight ? Math.min(4, gableSlots) : 0,
    doorsSide: fitsDoorHeight ? Math.min(6, innerBays) : 0,
    personDoors: Math.min(4, Math.max(1, innerBays)),
    windowsPerSide: Math.max(0, Math.min(12, dims.bayCount - 2)),
  };
}

function clampOpenings(openings: Openings, limits: OpeningLimits): Openings {
  return {
    doorsFront: clamp(Math.round(openings.doorsFront), 0, limits.doorsFront),
    doorsBack: clamp(Math.round(openings.doorsBack), 0, limits.doorsBack),
    doorsSide: clamp(Math.round(openings.doorsSide), 0, limits.doorsSide),
    personDoors: clamp(Math.round(openings.personDoors), 0, limits.personDoors),
    windowsPerSide: clamp(Math.round(openings.windowsPerSide), 0, limits.windowsPerSide),
  };
}

/* ─────────────────────────── creación y normalización ─────────────────────────── */

export function createDefaultConfig(definition: WarehouseDefinition): WarehouseConfig {
  const d = definition.defaults;
  const base: WarehouseConfig = {
    warehouse: definition.id,
    dimensions: {
      width: d.width,
      length: d.length ?? d.bayCount * d.baySpacing,
      eaveHeight: d.eaveHeight,
      roofSlope: d.roofSlope,
      baySpacing: d.baySpacing,
      bayCount: d.bayCount,
    },
    structure: definition.structure.default,
    structureFinish: definition.structure.defaultFinish,
    envelope: { ...definition.envelope.defaults },
    openings: { ...definition.options.openings.defaults },
    options: Object.fromEntries(definition.options.options.filter((o) => o.status === "available").map((o) => [o.id, false])),
  };
  const variant = getVariant(definition);
  if (variant) base.variant = variant.id;
  return normalizeConfig(definition, base);
}

/**
 * Devuelve una configuración válida: rangos, consistencia de módulos,
 * compatibilidades de envolvente, disponibilidad de opciones y variantes BIM.
 */
export function normalizeConfig(definition: WarehouseDefinition, config: WarehouseConfig, priority: "length" | "bayCount" | "baySpacing" = "bayCount"): WarehouseConfig {
  const next: WarehouseConfig = structuredClone(config);
  next.warehouse = definition.id;
  const variant = getVariant(definition, next.variant);

  if (variant) {
    // Modelo BIM discreto: las dimensiones, el sistema y lo modelado vienen del GLB.
    next.variant = variant.id;
    next.dimensions = { ...variant.dimensions };
    next.structure = variant.structure;
    next.openings = { ...variant.includes.openings };
    next.options = { ...variant.includes.options };
  } else {
    delete next.variant;
    const r = definition.dimensions;
    let dims: Dimensions = {
      ...next.dimensions,
      width: snapToRange(next.dimensions.width, r.width),
      eaveHeight: snapToRange(next.dimensions.eaveHeight, r.eaveHeight),
      roofSlope: snapToRange(next.dimensions.roofSlope, r.roofSlope),
    };
    dims = reconcileBays(definition, dims, priority);
    next.dimensions = dims;
    if (!definition.structure.systems.some((s) => s.id === next.structure)) next.structure = definition.structure.default;
    next.openings = clampOpenings(next.openings, openingLimits(definition, dims));
    const options: Record<string, boolean> = {};
    for (const option of definition.options.options) {
      if (option.status !== "available") continue;
      const requested = Boolean(next.options?.[option.id]);
      const heightOk = option.minEaveHeight === undefined || dims.eaveHeight >= option.minEaveHeight;
      options[option.id] = requested && heightOk;
    }
    next.options = options;
  }

  if (!definition.structure.finishes.some((f) => f.id === next.structureFinish)) next.structureFinish = definition.structure.defaultFinish;

  const env = definition.envelope;
  const roof = env.roof.find((o) => o.id === next.envelope.roof) ?? env.roof.find((o) => o.id === env.defaults.roof) ?? env.roof[0];
  const walls = env.walls.find((o) => o.id === next.envelope.walls) ?? env.walls.find((o) => o.id === env.defaults.walls) ?? env.walls[0];
  const allowed = roof.insulation;
  const insulation = allowed.includes(next.envelope.insulation) ? next.envelope.insulation : allowed.includes(env.defaults.insulation) ? env.defaults.insulation : allowed[0];
  const colorIds = env.colors.map((c) => c.id);
  next.envelope = {
    roof: roof.id,
    walls: walls.id,
    insulation,
    roofColor: colorIds.includes(next.envelope.roofColor) ? next.envelope.roofColor : env.defaults.roofColor,
    wallColor: colorIds.includes(next.envelope.wallColor) ? next.envelope.wallColor : env.defaults.wallColor,
  };
  return next;
}

/** Cambia una dimensión respetando las relaciones entre variables. */
export function setDimension(definition: WarehouseDefinition, config: WarehouseConfig, key: DimensionKey, value: number): WarehouseConfig {
  if (isDiscrete(definition)) return config;
  const dims = { ...config.dimensions };
  let priority: "length" | "bayCount" | "baySpacing" = "bayCount";
  switch (key) {
    case "length":
      dims.length = value;
      priority = "length";
      break;
    case "bayCount":
      dims.bayCount = value;
      break;
    case "baySpacing":
      // Mantener la longitud aproximada: recalcular módulos con la nueva separación.
      dims.baySpacing = value;
      dims.length = config.dimensions.length;
      priority = "length";
      break;
    case "ridgeHeight": {
      const rise = value - dims.eaveHeight;
      dims.roofSlope = (rise / (dims.width / 2)) * 100;
      break;
    }
    default:
      dims[key] = value;
  }
  return normalizeConfig(definition, { ...config, dimensions: dims }, priority);
}

export function selectVariant(definition: WarehouseDefinition, config: WarehouseConfig, variantId: string) {
  return normalizeConfig(definition, { ...config, variant: variantId });
}

/** Avisos y recomendaciones declarados en warehouse.json + reglas generales. */
export function evaluateRules(definition: WarehouseDefinition, config: WarehouseConfig): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const d = config.dimensions;
  for (const rule of definition.rules ?? []) {
    const w = rule.when;
    if (w.widthAbove !== undefined && !(d.width > w.widthAbove)) continue;
    if (w.widthBelow !== undefined && !(d.width < w.widthBelow)) continue;
    if (w.eaveHeightBelow !== undefined && !(d.eaveHeight < w.eaveHeightBelow)) continue;
    if (w.eaveHeightAbove !== undefined && !(d.eaveHeight > w.eaveHeightAbove)) continue;
    if (w.structureIn && !w.structureIn.includes(config.structure)) continue;
    if (w.optionOn && !config.options[w.optionOn]) continue;
    if (w.roofIn && !w.roofIn.includes(config.envelope.roof)) continue;
    issues.push({ id: rule.id, level: rule.level, message: rule.message, suggest: rule.suggest });
  }
  for (const option of definition.options.options) {
    if (option.status === "available" && option.minEaveHeight !== undefined && d.eaveHeight < option.minEaveHeight && !isDiscrete(definition)) {
      issues.push({ id: `min-height-${option.id}`, level: "info", message: `${option.name} requiere al menos ${option.minEaveHeight} m de altura de alero.` });
    }
  }
  const system = definition.structure.systems.find((s) => s.id === config.structure);
  if (system?.availability === "onRequest") {
    issues.push({ id: "custom-structure", level: "info", message: `${system.name}: se resuelve con ingeniería a medida. El 3D muestra una representación referencial.` });
  }
  return issues;
}

export function structureLabel(definition: WarehouseDefinition, id: StructureSystemId) {
  return definition.structure.systems.find((s) => s.id === id)?.name ?? id;
}
