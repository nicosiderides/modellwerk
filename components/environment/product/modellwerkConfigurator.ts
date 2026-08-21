import {
  evaluateConfiguration,
  type ConfigurationCatalog,
  type ConfigurationSelection,
} from "@/core/configurator";
import {
  MODULE_MATERIAL_CATEGORIES,
} from "../module/moduleOptions";
import type { ModuleMaterialSelection } from "../utils/sceneTypes";
import {
  getProductModule,
  getProductOption,
  PRODUCT_MODULES,
  PRODUCT_OPTION_GROUPS,
  type ProductConfiguration,
} from "./productOptions";

export const MODELLWERK_CATALOG_VERSION = "modellwerk-catalog-2026.08.21";
export const MODELLWERK_PRICE_BOOK_VERSION = "modellwerk-demo-usd-2026.08.21";

// Los materiales visuales todavia no tienen una lista de precios propia.
// Se conservan como incluidos para mantener la estimacion actual hasta migrar esos costos.
const MIGRATION_INCLUDED_MATERIAL_PRICE = 0;

export const MODELLWERK_CONFIGURATION_CATALOG: ConfigurationCatalog = {
  schemaVersion: 1,
  catalogVersion: MODELLWERK_CATALOG_VERSION,
  priceBookVersion: MODELLWERK_PRICE_BOOK_VERSION,
  currency: "USD",
  products: PRODUCT_MODULES.map((product) => ({
    id: product.id,
    name: product.name,
    available: product.available,
    basePrice: product.priceOnRequest ? null : product.basePrice,
    priceOnRequest: product.priceOnRequest,
  })),
  optionGroups: PRODUCT_OPTION_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    required: true,
    choices: group.options.map((option) => ({
      id: option.id,
      label: option.label,
      price: option.price,
    })),
  })),
  materialGroups: MODULE_MATERIAL_CATEGORIES.map((category) => ({
    key: category.key,
    label: category.label,
    required: true,
    choices: category.options.map((option) => ({
      id: option.id,
      label: option.name,
      price: MIGRATION_INCLUDED_MATERIAL_PRICE,
    })),
  })),
  rules: [],
};

export function createModellwerkSelection(
  configuration: ProductConfiguration,
  materialSelection: ModuleMaterialSelection,
  quantity = 1
): ConfigurationSelection {
  return {
    schemaVersion: 1,
    productId: configuration.moduleId,
    quantity,
    options: Object.fromEntries(
      PRODUCT_OPTION_GROUPS.map((group) => [group.key, configuration[group.key]])
    ),
    materials: Object.fromEntries(
      MODULE_MATERIAL_CATEGORIES.map((category) => {
        const selectedIndex = materialSelection[category.key];
        const selected = category.options[selectedIndex] ?? category.options[0];
        return [category.key, selected?.id ?? ""];
      })
    ),
  };
}

export function calculateProductQuote(
  configuration: ProductConfiguration,
  materialSelection: ModuleMaterialSelection,
  quantity = 1
) {
  const selection = createModellwerkSelection(configuration, materialSelection, quantity);
  const evaluation = evaluateConfiguration(MODELLWERK_CONFIGURATION_CATALOG, selection);
  const productModule = getProductModule(configuration);
  const optionRows = PRODUCT_OPTION_GROUPS.map((group) => {
    const option = getProductOption(group.key, configuration[group.key]);
    return {
      group,
      option,
      amount: option?.price ?? 0,
    };
  });
  const structureCompletion = getProductOption("structure", configuration.structure)?.completion ?? 78;

  return {
    module: productModule,
    optionRows,
    modulesCount: quantity,
    area: productModule.area * quantity,
    base: productModule.basePrice * quantity,
    optionTotal: optionRows.reduce((total, row) => total + row.amount, 0) * quantity,
    total: evaluation.quote.total ?? 0,
    priceOnRequest: evaluation.quote.status !== "estimated",
    pricePerM2:
      evaluation.quote.total === null
        ? 0
        : Math.round(evaluation.quote.total / Math.max(1, productModule.area * quantity)),
    completion: structureCompletion,
    leadTime: productModule.leadTime,
    assemblyTime: productModule.assemblyTime,
    configuration: selection,
    catalogVersion: evaluation.quote.catalogVersion,
    priceBookVersion: evaluation.quote.priceBookVersion,
    validation: {
      valid: evaluation.valid,
      issues: evaluation.issues,
    },
    quote: evaluation.quote,
  };
}
