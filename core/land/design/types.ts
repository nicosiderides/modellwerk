import type { Range, WarehouseConfig } from "../../galpones/types.ts";

/**
 * Datos de los tipos de edificio de MW Land (data/land/<tipo>/*.json) y la
 * configuración que arma el usuario. Misma organización que los galpones:
 * edificio, estructura, envolvente, opciones y precios.
 */

export type LandTypeId = "vivienda" | "departamentos" | "oficinas";

export type BuildingData = {
  id: LandTypeId;
  code: string;
  name: string;
  tagline: string;
  description: string;
  dimensions: { width: Range; depth: Range; floors: { min: number; max: number } };
  grid: { module: number };
  floorHeight: number;
  groundHeight: number;
  slab: number;
  column: number;
  /** m² cubiertos por unidad (departamento, oficina); null = una sola unidad. */
  unitArea: number | null;
  /** Superficie vendible / cubierta. */
  efficiency: number;
  /** Tamaños de unidad para elegir (departamentos, oficinas). area null = planta libre (una unidad por piso). */
  unitSizes?: UnitSize[];
  defaults: { width: number; depth: number; floors: number; align: Align; front: number; unitSize?: string };
};

export type UnitSize = { id: string; name: string; area: number | null; memoryText: string };

export type Choice = { id: string; name: string; memoryText: string; costFactor?: number };
export type StructureData = { default: string; systems: (Choice & { column: number })[] };
export type ColorChoice = { id: string; name: string; hex: string };
export type FacadeChoice = Choice & { look: { pattern: "smooth" | "precast"; roughness: number; color?: string } };
export type EnvelopeData = {
  facades: FacadeChoice[];
  roofs: Choice[];
  colors: ColorChoice[];
  frames: ColorChoice[];
  glazing: (Choice & { ratio: number })[];
  defaults: { facade: string; roof: string; facadeColor: string; accentColor: string; frameColor: string; glazing: string };
};
/** fixed: total · fixed-per-floor: por piso alto · m2: por m² cubierto · footprint: por m² de planta baja (subsuelo). */
export type OptionCost = { kind: "fixed" | "fixed-per-floor" | "m2" | "footprint"; value: number };
export type OptionData = { id: string; name: string; memoryText: string; cost: OptionCost; defaultOn?: boolean; requires?: { roof?: string } };
export type OptionsData = { options: OptionData[] };
export type PriceValue = { value: number; status: "demo" | "real"; note: string };
export type PricingData = { costPerM2: PriceValue; salePerM2: PriceValue; rentPerM2Month: PriceValue; buildMonths: number };

export type LandSpec = { building: BuildingData; structure: StructureData; envelope: EnvelopeData; options: OptionsData; pricing: PricingData };

export type Align = "left" | "center" | "right";

/** Configuración de un edificio de los tipos nuevos. */
export type LandConfig = {
  type: LandTypeId;
  width: number;
  depth: number;
  floors: number;
  align: Align;
  /** Corrimiento hacia el fondo desde el frente edificable (m). */
  front: number;
  structure: string;
  facade: string;
  roof: string;
  facadeColor: string;
  accentColor: string;
  frameColor: string;
  glazing: string;
  /** Ventanas por módulo de fachada (1 o 2). */
  windowsPerBay?: 1 | 2;
  /** Tamaño de unidad elegido (id de building.unitSizes). */
  unitSize?: string;
  options: Record<string, boolean>;
};

/** El galpón usa la configuración de MW Warehouse tal cual, más su ubicación en el lote. */
export type GalponDesign = { warehouseId: string; config: WarehouseConfig; align: Align; front: number };
