import type { Estimate } from "../product-engine/types.ts";
import { ridgeHeight, slopeDegrees } from "./configuration.ts";
import { trussEndDepth } from "./geometry-rules.ts";
import type { WarehouseConfig, WarehouseDefinition } from "./types.ts";

/**
 * WarehouseMetricsEngine — métricas geométricas exactas de la configuración
 * y estimaciones comerciales SOLO cuando pricing.json las provee (marcadas demo).
 * No se realizan cálculos estructurales.
 */

export type WarehouseMetrics = {
  floorArea: number;
  internalVolume: number;
  clearSpan: number;
  /** Altura libre bajo estructura (en reticulados, bajo el cordón inferior). */
  clearHeight: number;
  eaveHeight: number;
  buildingHeight: number;
  numberOfBays: number;
  numberOfFrames: number;
  baySpacing: number;
  roofSlopePercent: number;
  roofSlopeDegrees: number;
  roofArea: number;
  wallArea: number;
  openingsArea: number;
  netWallArea: number;
  perimeter: number;
  estimatedSteelWeight: Estimate;
  kgSteelPerM2: Estimate;
  estimatedConstructionTime: Estimate;
  estimatedCost: Estimate;
};

const r = (value: number, decimals = 1) => Math.round(value * 10 ** decimals) / 10 ** decimals;
const mid = ([a, b]: [number, number]) => (a + b) / 2;

export function calculateMetrics(config: WarehouseConfig, definition: WarehouseDefinition): WarehouseMetrics {
  const d = config.dimensions;
  const ridge = ridgeHeight(d);
  const rise = ridge - d.eaveHeight;
  const halfSlopeLength = Math.hypot(d.width / 2, rise);

  const floorArea = d.width * d.length;
  const internalVolume = d.width * d.length * d.eaveHeight + (d.width * rise * d.length) / 2;
  const roofArea = 2 * halfSlopeLength * d.length;
  const gableArea = d.width * d.eaveHeight + (d.width * rise) / 2;
  const wallArea = 2 * d.length * d.eaveHeight + 2 * gableArea;

  const { sectionalDoor, personDoor, window } = definition.options.openings;
  const o = config.openings;
  const openingsArea =
    (o.doorsFront + o.doorsBack + o.doorsSide) * sectionalDoor.width * Math.min(sectionalDoor.height, d.eaveHeight - 0.6) +
    o.personDoors * personDoor.width * personDoor.height +
    o.windowsPerSide * 2 * window.width * window.height;

  const truss = config.structure === "truss" || config.structure === "mixed";
  const clearHeight = truss ? d.eaveHeight - trussEndDepth(d.width) : d.eaveHeight;

  const p = definition.pricing;
  const tag = p.status === "real" ? "real" : "demo";
  const note = "Estimación demo";

  const steelPerM2: Estimate = p.steelKgPerM2
    ? tag === "real"
      ? { status: "real", value: r(mid(p.steelKgPerM2)), unit: "kg/m²" }
      : { status: "demo", value: r(mid(p.steelKgPerM2)), unit: "kg/m²", note }
    : { status: "pending", unit: "kg/m²", note: "Requiere ingeniería" };

  const steelWeight: Estimate =
    steelPerM2.status === "pending"
      ? { status: "pending", unit: "t", note: "Requiere ingeniería" }
      : { ...steelPerM2, value: r((steelPerM2.value * floorArea) / 1000, 1), unit: "t" };

  const time: Estimate = p.constructionDays
    ? {
        status: tag === "real" ? "real" : "demo",
        value: Math.round(p.constructionDays.base + (floorArea / 1000) * p.constructionDays.perThousandM2),
        unit: "días",
        note,
      } as Estimate
    : { status: "pending", unit: "días", note: "A definir" };

  const cost: Estimate = p.costPerM2
    ? ({ status: tag === "real" ? "real" : "demo", value: Math.round((mid(p.costPerM2) * floorArea) / 1000) * 1000, unit: p.currency, note } as Estimate)
    : { status: "pending", unit: p.currency, note: "A cotizar" };

  return {
    floorArea: r(floorArea, 0),
    internalVolume: r(internalVolume, 0),
    clearSpan: r(d.width, 1),
    clearHeight: r(clearHeight, 2),
    eaveHeight: d.eaveHeight,
    buildingHeight: r(ridge, 2),
    numberOfBays: d.bayCount,
    numberOfFrames: d.bayCount + 1,
    baySpacing: d.baySpacing,
    roofSlopePercent: d.roofSlope,
    roofSlopeDegrees: slopeDegrees(d.roofSlope),
    roofArea: r(roofArea, 0),
    wallArea: r(wallArea, 0),
    openingsArea: r(openingsArea, 0),
    netWallArea: r(wallArea - openingsArea, 0),
    perimeter: r(2 * (d.width + d.length), 1),
    estimatedSteelWeight: steelWeight,
    kgSteelPerM2: steelPerM2,
    estimatedConstructionTime: time,
    estimatedCost: cost,
  };
}

/** Formato numérico local (es-AR): 1.440, 8,5 */
export function formatNumber(value: number, decimals = 0) {
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

export function formatMeters(value: number) {
  return `${formatNumber(value, Number.isInteger(value) ? 0 : 1)} m`;
}

export function formatEstimate(estimate: Estimate) {
  if (estimate.status === "pending") return estimate.note;
  const decimals = estimate.value < 100 && !Number.isInteger(estimate.value) ? 1 : 0;
  const value = formatNumber(estimate.value, decimals);
  return estimate.unit === "USD" || estimate.unit === "ARS" ? `${estimate.unit} ${value}` : `${value} ${estimate.unit}`;
}
