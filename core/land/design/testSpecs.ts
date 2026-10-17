import { readFileSync } from "node:fs";
import { assembleDefinition, WAREHOUSE_FILE_NAMES, type WarehouseFiles } from "../../galpones/definition.ts";
import type { WarehouseDefinition } from "../../galpones/types.ts";
import type { Specs } from "./compute.ts";
import type { LandSpec, LandTypeId } from "./types.ts";

/** Carga los datos de los tipos desde disco (sólo para pruebas con Node). */
const read = (path: string) => JSON.parse(readFileSync(new URL(`../../../data/${path}`, import.meta.url), "utf8"));

export function loadSpecs(): Specs {
  const one = (id: LandTypeId): LandSpec => ({ building: read(`land/${id}/building.json`), structure: read(`land/${id}/structure.json`), envelope: read(`land/${id}/envelope.json`), options: read(`land/${id}/options.json`), pricing: read(`land/${id}/pricing.json`) });
  return { vivienda: one("vivienda"), departamentos: one("departamentos"), oficinas: one("oficinas") };
}

export function loadGalpones(): WarehouseDefinition[] {
  return ["industrial-light", "industrial-pro", "logistics", "large-span"].map((id) => assembleDefinition(Object.fromEntries(WAREHOUSE_FILE_NAMES.map((name) => [name, read(`galpones/${id}/${name}.json`)])) as WarehouseFiles));
}
