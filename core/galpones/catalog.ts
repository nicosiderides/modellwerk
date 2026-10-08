/**
 * Repositorio del catálogo de galpones.
 *
 * Hoy los JSON se empaquetan con la app (imports estáticos, validados al
 * iniciar). Para un catálogo remoto (CMS / API), implementar otro
 * `WarehouseCatalogRepository` con la misma interfaz: los componentes no cambian.
 */
import sharedJson from "../../data/galpones/shared.json";
import lightWarehouse from "../../data/galpones/industrial-light/warehouse.json";
import lightStructure from "../../data/galpones/industrial-light/structure.json";
import lightEnvelope from "../../data/galpones/industrial-light/envelope.json";
import lightOptions from "../../data/galpones/industrial-light/options.json";
import lightSpecs from "../../data/galpones/industrial-light/specs.json";
import lightPricing from "../../data/galpones/industrial-light/pricing.json";
import lightModel from "../../data/galpones/industrial-light/model.json";
import proWarehouse from "../../data/galpones/industrial-pro/warehouse.json";
import proStructure from "../../data/galpones/industrial-pro/structure.json";
import proEnvelope from "../../data/galpones/industrial-pro/envelope.json";
import proOptions from "../../data/galpones/industrial-pro/options.json";
import proSpecs from "../../data/galpones/industrial-pro/specs.json";
import proPricing from "../../data/galpones/industrial-pro/pricing.json";
import proModel from "../../data/galpones/industrial-pro/model.json";
import logisticsWarehouse from "../../data/galpones/logistics/warehouse.json";
import logisticsStructure from "../../data/galpones/logistics/structure.json";
import logisticsEnvelope from "../../data/galpones/logistics/envelope.json";
import logisticsOptions from "../../data/galpones/logistics/options.json";
import logisticsSpecs from "../../data/galpones/logistics/specs.json";
import logisticsPricing from "../../data/galpones/logistics/pricing.json";
import logisticsModel from "../../data/galpones/logistics/model.json";
import largeWarehouse from "../../data/galpones/large-span/warehouse.json";
import largeStructure from "../../data/galpones/large-span/structure.json";
import largeEnvelope from "../../data/galpones/large-span/envelope.json";
import largeOptions from "../../data/galpones/large-span/options.json";
import largeSpecs from "../../data/galpones/large-span/specs.json";
import largePricing from "../../data/galpones/large-span/pricing.json";
import largeModel from "../../data/galpones/large-span/model.json";
import { assembleDefinition, assembleShared } from "./definition";
import type { SharedContent, WarehouseDefinition } from "./types";

export interface WarehouseCatalogRepository {
  list(): WarehouseDefinition[];
  get(id: string): WarehouseDefinition | undefined;
  shared(): SharedContent;
}

const definitions: WarehouseDefinition[] = [
  assembleDefinition({ warehouse: lightWarehouse, structure: lightStructure, envelope: lightEnvelope, options: lightOptions, specs: lightSpecs, pricing: lightPricing, model: lightModel }),
  assembleDefinition({ warehouse: proWarehouse, structure: proStructure, envelope: proEnvelope, options: proOptions, specs: proSpecs, pricing: proPricing, model: proModel }),
  assembleDefinition({ warehouse: logisticsWarehouse, structure: logisticsStructure, envelope: logisticsEnvelope, options: logisticsOptions, specs: logisticsSpecs, pricing: logisticsPricing, model: logisticsModel }),
  assembleDefinition({ warehouse: largeWarehouse, structure: largeStructure, envelope: largeEnvelope, options: largeOptions, specs: largeSpecs, pricing: largePricing, model: largeModel }),
];

const shared = assembleShared(sharedJson);

export const staticCatalog: WarehouseCatalogRepository = {
  list: () => definitions,
  get: (id) => definitions.find((d) => d.id === id),
  shared: () => shared,
};
