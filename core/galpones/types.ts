import type { ModelCategory, ModelDefinition } from "../product-engine/types.ts";

/**
 * Contratos del dominio "galpones" (MW Warehouse Configurator).
 * Todo lo que describe una tipología vive en JSON externo (data/galpones/<id>/).
 */

export type Range = { min: number; max: number; step: number };

export type DimensionKey = "width" | "length" | "eaveHeight" | "ridgeHeight" | "roofSlope" | "baySpacing" | "bayCount";

export type Dimensions = {
  /** Luz libre entre ejes de columnas, m. */
  width: number;
  /** Longitud total, m (= bayCount × baySpacing). */
  length: number;
  /** Altura de alero, m. */
  eaveHeight: number;
  /** Pendiente de cubierta, %. */
  roofSlope: number;
  /** Separación entre pórticos, m. */
  baySpacing: number;
  /** Cantidad de módulos entre pórticos. */
  bayCount: number;
};

export type StructureSystemId = "portalFrame" | "truss" | "mixed" | "custom";

export type ModelStrategy = "dynamicGeometry" | "discreteVariant";

/* ───────────────────────────── warehouse.json ───────────────────────────── */

export type WarehouseInfo = {
  id: string;
  /** Código corto usado en nombres de nodos e IDs (ej. GP02). */
  code: string;
  name: string;
  tagline: string;
  description: string;
  use: string;
  structuralSystemLabel: string;
  thumbnail: string;
  insulationLevel: { label: string; score: 1 | 2 | 3 };
  /** Nivel relativo de precio 1–4 (se muestra como $, $$, …). */
  relativePrice: 1 | 2 | 3 | 4;
  highlights: string[];
  dimensions: {
    width: Range;
    length: Range;
    eaveHeight: Range;
    roofSlope: Range;
    baySpacing: Range;
    bayCount: { min: number; max: number };
  };
  defaults: Omit<Dimensions, "length"> & { length?: number };
  /** Reglas declarativas (avisos y recomendaciones). */
  rules?: WarehouseRule[];
};

export type WarehouseRule = {
  id: string;
  level: "info" | "warning";
  message: string;
  when: {
    widthAbove?: number;
    widthBelow?: number;
    eaveHeightBelow?: number;
    eaveHeightAbove?: number;
    structureIn?: StructureSystemId[];
    optionOn?: string;
    roofIn?: string[];
  };
  /** Sugerencia accionable opcional. */
  suggest?: { structure?: StructureSystemId };
};

/* ───────────────────────────── structure.json ───────────────────────────── */

export type StructureSystem = {
  id: StructureSystemId;
  name: string;
  summary: string;
  bullets: string[];
  /** Fragmento para la memoria descriptiva. */
  memoryText: string;
  availability: "available" | "onRequest";
};

export type FinishOption = { id: string; name: string; hex: string; memoryText: string };

export type StructureData = {
  default: StructureSystemId;
  systems: StructureSystem[];
  finishes: FinishOption[];
  defaultFinish: string;
  /** Datos visuales/descriptivos del perfil — no son cálculo estructural. */
  profileLabels: Record<"columns" | "rafters" | "purlins" | "girts" | "bracing", string>;
};

/* ───────────────────────────── envelope.json ───────────────────────────── */

export type SheetFinish = "trapezoidal" | "sandwich" | "standingSeam" | "precastSheet";

export type EnvelopeOption = {
  id: string;
  name: string;
  summary: string;
  memoryText: string;
  finish: SheetFinish;
  thicknessMm: number;
  /** IDs de aislación compatibles. */
  insulation: string[];
};

export type InsulationOption = {
  id: string;
  name: string;
  summary: string;
  memoryText: string;
  /** 0 = sin aislación … 3 = alta. */
  level: 0 | 1 | 2 | 3;
  thicknessMm: number;
};

export type ColorOption = { id: string; name: string; hex: string };

export type EnvelopeData = {
  roof: EnvelopeOption[];
  walls: EnvelopeOption[];
  insulation: InsulationOption[];
  colors: ColorOption[];
  defaults: { roof: string; walls: string; insulation: string; roofColor: string; wallColor: string };
  /** Altura del zócalo premoldeado cuando corresponde, m. */
  precastBaseHeight: number;
};

/* ───────────────────────────── options.json ───────────────────────────── */

export type ProductOption = {
  id: string;
  name: string;
  summary: string;
  status: "available" | "planned";
  /** Requisito mínimo de altura de alero (si aplica). */
  minEaveHeight?: number;
};

export type OpeningSpec = { width: number; height: number; name: string; memoryText: string };

export type OptionsData = {
  options: ProductOption[];
  openings: {
    sectionalDoor: OpeningSpec;
    personDoor: OpeningSpec;
    window: OpeningSpec;
    defaults: Openings;
  };
};

export type Openings = {
  /** Portones en el frente (testero de acceso). */
  doorsFront: number;
  /** Portones en el testero posterior. */
  doorsBack: number;
  /** Portones en el lateral este. */
  doorsSide: number;
  /** Puertas peatonales (lateral oeste). */
  personDoors: number;
  /** Ventanas por lateral. */
  windowsPerSide: number;
};

/* ───────────────────────────── specs / pricing / model ───────────────────────────── */

export type SpecsData = {
  /** Párrafos con tokens {token}. */
  description: string[];
  note: string;
  constructionNotes: string[];
};

export type PricingData = {
  status: "demo" | "real";
  currency: string;
  disclaimer: string;
  /** Rangos de referencia DEMO, no cálculo. null = no hay dato. */
  steelKgPerM2: [number, number] | null;
  costPerM2: [number, number] | null;
  constructionDays: { base: number; perThousandM2: number } | null;
};

export type ModelVariant = {
  id: string;
  label: string;
  model: ModelDefinition;
  dimensions: Dimensions;
  structure: StructureSystemId;
  /** Lo que ya está modelado en el GLB (no editable desde la web). */
  includes: { options: Record<string, boolean>; openings: Openings };
};

export type ModelData =
  | { strategy: "dynamicGeometry"; note?: string }
  | { strategy: "discreteVariant"; defaultVariant: string; variants: ModelVariant[]; note?: string };

/* ───────────────────────────── definición completa ───────────────────────────── */

export type WarehouseDefinition = WarehouseInfo & {
  structure: StructureData;
  envelope: EnvelopeData;
  options: OptionsData;
  specs: SpecsData;
  pricing: PricingData;
  model: ModelData;
};

/* ───────────────────────────── configuración del usuario ───────────────────────────── */

export type WarehouseConfig = {
  warehouse: string;
  /** Sólo para estrategia discreteVariant. */
  variant?: string;
  dimensions: Dimensions;
  structure: StructureSystemId;
  structureFinish: string;
  envelope: { roof: string; walls: string; insulation: string; roofColor: string; wallColor: string };
  openings: Openings;
  options: Record<string, boolean>;
};

export type ConfigIssue = {
  id: string;
  level: "info" | "warning";
  message: string;
  suggest?: { structure?: StructureSystemId };
};

/* ───────────────────────────── contenido compartido ───────────────────────────── */

export type CategoryContent = {
  label: string;
  plural: string;
  explanation: string;
};

export type SharedContent = {
  categories: Record<ModelCategory, CategoryContent>;
  groups: { id: string; label: string; categories: ModelCategory[] }[];
  explodeOffsets: Partial<Record<ModelCategory, { up: number; out: number }>>;
};
