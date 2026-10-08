"use client";

import type { Estimate } from "@/core/product-engine/types";
import { calculateMetrics, formatEstimate, formatNumber } from "@/core/galpones/metrics";
import type { WarehouseConfig, WarehouseDefinition } from "@/core/galpones/types";

/** Panel de datos técnicos: métricas exactas + estimaciones identificadas. */

function EstimateValue({ estimate }: { estimate: Estimate }) {
  return (
    <span className={`gp-estimate gp-estimate--${estimate.status}`}>
      {formatEstimate(estimate)}
      {estimate.status === "demo" && <em>Estimación demo</em>}
      {estimate.status === "pending" && <em>Sin dato</em>}
    </span>
  );
}

export function TechnicalPanel({ config, definition, compact }: { config: WarehouseConfig; definition: WarehouseDefinition; compact?: boolean }) {
  const m = calculateMetrics(config, definition);
  const rows: [string, string][] = [
    ["Superficie cubierta", `${formatNumber(m.floorArea)} m²`],
    ["Volumen interior", `${formatNumber(m.internalVolume)} m³`],
    ["Luz libre", `${formatNumber(m.clearSpan, Number.isInteger(m.clearSpan) ? 0 : 1)} m`],
    ["Altura de alero", `${formatNumber(m.eaveHeight, 1)} m`],
    ["Altura libre bajo estructura", `${formatNumber(m.clearHeight, 2)} m`],
    ["Altura total (cumbrera)", `${formatNumber(m.buildingHeight, 2)} m`],
    ["Pendiente de cubierta", `${formatNumber(m.roofSlopePercent)} % · ${formatNumber(m.roofSlopeDegrees, 1)}°`],
    ["Pórticos / módulos", `${m.numberOfFrames} / ${m.numberOfBays}`],
    ["Separación de pórticos", `${formatNumber(m.baySpacing, 1)} m`],
    ["Superficie de cubierta", `${formatNumber(m.roofArea)} m²`],
    ["Superficie de cerramientos", `${formatNumber(m.wallArea)} m²`],
    ["Superficie de aberturas", `${formatNumber(m.openingsArea)} m²`],
  ];
  const shown = compact ? rows.filter((_, i) => [0, 1, 2, 4, 5, 7, 9, 10].includes(i)) : rows;
  return (
    <div className="gp-tech">
      <dl className="gp-tech__rows">
        {shown.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <dl className="gp-tech__rows gp-tech__rows--estimates">
        <div>
          <dt>Acero estimado</dt>
          <dd><EstimateValue estimate={m.estimatedSteelWeight} /></dd>
        </div>
        <div>
          <dt>Acero por m²</dt>
          <dd><EstimateValue estimate={m.kgSteelPerM2} /></dd>
        </div>
        <div>
          <dt>Plazo de obra</dt>
          <dd><EstimateValue estimate={m.estimatedConstructionTime} /></dd>
        </div>
        <div>
          <dt>Costo estimado</dt>
          <dd><EstimateValue estimate={m.estimatedCost} /></dd>
        </div>
      </dl>
      <p className="gp-tech__note">{definition.pricing.disclaimer} Las métricas geométricas son exactas para la configuración; no incluyen cálculo estructural.</p>
    </div>
  );
}
