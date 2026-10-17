import vivBuilding from "../../../data/land/vivienda/building.json";
import vivStructure from "../../../data/land/vivienda/structure.json";
import vivEnvelope from "../../../data/land/vivienda/envelope.json";
import vivOptions from "../../../data/land/vivienda/options.json";
import vivPricing from "../../../data/land/vivienda/pricing.json";
import depBuilding from "../../../data/land/departamentos/building.json";
import depStructure from "../../../data/land/departamentos/structure.json";
import depEnvelope from "../../../data/land/departamentos/envelope.json";
import depOptions from "../../../data/land/departamentos/options.json";
import depPricing from "../../../data/land/departamentos/pricing.json";
import ofiBuilding from "../../../data/land/oficinas/building.json";
import ofiStructure from "../../../data/land/oficinas/structure.json";
import ofiEnvelope from "../../../data/land/oficinas/envelope.json";
import ofiOptions from "../../../data/land/oficinas/options.json";
import ofiPricing from "../../../data/land/oficinas/pricing.json";
import galponPricing from "../../../data/land/galpon-pricing.json";
import type { Specs } from "./compute";
import type { LandSpec, PricingData } from "./types";

/** Datos de los tipos de MW Land (en el navegador; las pruebas los leen con testSpecs.ts). */
const spec = (building: unknown, structure: unknown, envelope: unknown, options: unknown, pricing: unknown) => ({ building, structure, envelope, options, pricing }) as LandSpec;

export const LAND_SPECS: Specs = {
  vivienda: spec(vivBuilding, vivStructure, vivEnvelope, vivOptions, vivPricing),
  departamentos: spec(depBuilding, depStructure, depEnvelope, depOptions, depPricing),
  oficinas: spec(ofiBuilding, ofiStructure, ofiEnvelope, ofiOptions, ofiPricing),
};

export const GALPON_PRICING = galponPricing as PricingData;
