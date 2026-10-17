import type { BuildingTypeId, UseGroup } from "./types.ts";

/**
 * Tipos de edificio de MW Land (primera etapa). Las alturas de piso son
 * criterio de diseño aprobado en la Fase 0 (no valores de norma): sirven para
 * contar cuántas plantas entran en la caja máxima.
 */
export type BuildingType = {
  id: BuildingTypeId;
  name: string;
  short: string;
  group: UseGroup;
  /** Altura de piso típica (m). */
  floorHeight: number;
  /** Altura de la planta baja (m). */
  groundHeight: number;
  /** Plantas máximas razonables para el tipo (una casa no tiene 8 pisos). */
  maxFloors: number | null;
  description: string;
};

export const BUILDING_TYPES: BuildingType[] = [
  { id: "vivienda", name: "Vivienda unifamiliar", short: "Vivienda", group: "residencial", floorHeight: 2.9, groundHeight: 2.9, maxFloors: 2, description: "Casa de una o dos plantas, con cochera, galería y patio." },
  { id: "departamentos", name: "Edificio de departamentos", short: "Departamentos", group: "residencial", floorHeight: 2.9, groundHeight: 2.9, maxFloors: null, description: "Planta baja y pisos tipo con núcleo de escalera y ascensor." },
  { id: "oficinas", name: "Oficinas / locales", short: "Oficinas", group: "residencial", floorHeight: 3.6, groundHeight: 4.5, maxFloors: null, description: "Locales comerciales en planta baja y oficinas de planta libre arriba." },
  { id: "galpon", name: "Galpón", short: "Galpón", group: "industrial", floorHeight: 10, groundHeight: 10, maxFloors: 1, description: "Nave industrial o logística, con la geometría de MW Warehouse." },
];

export const buildingType = (id: BuildingTypeId) => BUILDING_TYPES.find((t) => t.id === id) ?? BUILDING_TYPES[0];
