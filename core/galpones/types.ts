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
  /** Entorno del galpón: veredas, estacionamiento, playón y parquizado. */
  site: SiteConfig;
  /** Lote, normativa y vehículo de diseño (implantación). */
  lot: LotConfig;
};

/** Parámetros normativos del lote. null = sin dato / no se exige. */
export type LotRules = {
  /** Superficie mínima del lote (m²). */
  minArea: number | null;
  /** Frente mínimo del lote (m). */
  minFront: number | null;
  /** Factor de ocupación del suelo (0–1). */
  fos: number | null;
  /** Factor de ocupación total. */
  fot: number | null;
  /** Altura máxima de edificación (m). */
  maxHeight: number | null;
  setbackFront: number | null;
  setbackSide: number | null;
  /** En cuántos laterales rige el retiro lateral (null = en los dos). */
  sideCount: 0 | 1 | 2 | null;
  setbackBack: number | null;
  /** Parte de la superficie libre no edificable que debe forestarse (0–1). */
  forestOfFree: number | null;
  /** Superficie de lote a partir de la cual rige la forestación (m²). */
  forestThreshold: number | null;
  /** Distancia mínima del ingreso vehicular a la esquina (m). */
  accessFromCorner: number | null;
};

export type DesignVehicleId = "semi" | "rigid";

export type LotConfig = {
  /** Verificar la implantación en un lote. */
  enabled: boolean;
  /** Normativa de partida (preset). */
  preset: string;
  /** auto = lote mínimo que cumple; manual = medidas propias. */
  mode: "auto" | "manual";
  /** Frente del lote (m, a lo ancho del galpón). */
  width: number;
  /** Fondo del lote (m). */
  depth: number;
  /** Distancia de la fachada de portones a la línea municipal (m). */
  front: number;
  /** Distancia del galpón al lindero oeste (m). */
  left: number;
  /**
   * Ubicación del galpón dentro del lote propio.
   * auto = la app lo acomoda (retiros, playón, estacionamiento);
   * manual = respeta front/left, pero siempre dentro del lote y fuera de los retiros.
   */
  placement: "auto" | "manual";
  /** Lote en esquina: calle lateral al este u oeste. */
  corner: "none" | "east" | "west";
  /** Copia editable de la normativa del preset. */
  rules: LotRules;
  vehicle: DesignVehicleId;
  /** Lote real ubicado en el mapa (catastro). null = medidas cargadas a mano. */
  location: LotLocation | null;
};

/** Zona normativa del lote real (Córdoba capital: Ord. 8256 y 8133). */
export type LotZone = {
  /** Perfil o zona de la Ord. 8256 (ej. "L"). */
  perfil: string;
  /** Texto corto para mostrar (ej. "Zona L · Zona industrial"). */
  label: string;
  /** Patrón de uso del suelo de la Ord. 8133 (ej. "IVb"). */
  patron: string | null;
  /** Qué tan compatible es la zona con un galpón industrial. */
  uso: "industrial" | "condicionado" | "no" | "desconocido";
  usoTexto: string;
  /** Aclaraciones a confirmar (reglas que vienen como texto). */
  notes: string[];
  /** Valores que trajo la zona (para saber si el usuario los cambió). */
  rules: Partial<LotRules>;
  /** Fuente de cada parámetro cargado desde la zona. */
  sources: Partial<Record<keyof LotRules, { text: string; url?: string; verified: boolean }>>;
};

/** Lote real elegido en el mapa (datos de catastro de IDECOR / Mapas Córdoba). */
export type LotLocation = {
  source: "idecor";
  /** Fecha de la consulta (ISO). */
  fetchedAt: string;
  /** Centro del lote [lon, lat]. */
  center: [number, number];
  /** Contorno real del lote [lon, lat] (sin repetir el primer punto). */
  ring: [number, number][];
  /** Lado del contorno que se toma como frente (índice del vértice inicial). */
  frontEdge: number;
  /** Lados que dan a la calle. */
  streetEdges: number[];
  nomenclatura: string;
  cuenta: string | null;
  designacion: string;
  /** Superficie según catastro (m²). */
  superficie: number;
  estado: string;
  localidad: string;
  /**
   * Rectángulo útil (el lote del configurador) dentro del lote real.
   * origin = esquina frente-oeste [lon, lat]; s y t = direcciones (este, norte)
   * de sus lados: s a lo largo del frente hacia el este, t hacia el fondo.
   */
  fit: { width: number; depth: number; coverage: number; origin: [number, number]; s: [number, number]; t: [number, number] };
  zone: LotZone | null;
};

export type ParkingSide = "west" | "back";

export type SiteConfig = {
  /** Ancho de la vereda perimetral en metros (0 = sin vereda). */
  sidewalk: number;
  /** Cantidad de cocheras (0 = sin estacionamiento). */
  parking: number;
  /** Dónde va el estacionamiento: lateral oeste (puertas peatonales) o contrafrente. */
  parkingSide: ParkingSide;
  /** Playón de maniobras de hormigón frente a los portones. */
  truckYard: boolean;
  /** Césped, arbolado, luminarias y calle de acceso. */
  landscape: boolean;
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
