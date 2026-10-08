"use client";

import { Box, Boxes, TriangleAlert } from "lucide-react";
import { formatNumber } from "@/core/galpones/metrics";
import { definitionOf, useGalpones } from "./store";

/** Indicador del modelo: origen (paramétrico / BIM), progreso, errores y escala. */
export function ModelStatus() {
  const model = useGalpones((s) => s.model);
  const config = useGalpones((s) => s.warehouse.config);
  const definition = useGalpones((s) => definitionOf(s));
  const goTo = useGalpones((s) => s.goTo);
  if (!config || !definition) return null;
  const d = config.dimensions;
  const glb = definition.model.strategy === "discreteVariant";
  return (
    <div className="gp-status" aria-live="polite">
      <button type="button" className="gp-status__back" onClick={() => goTo("catalog")} title="Volver al catálogo">
        ← Catálogo
      </button>
      <span className={`gp-status__source ${glb ? "is-bim" : ""}`}>
        {glb ? <Box aria-hidden /> : <Boxes aria-hidden />}
        {glb ? "BIM · GLB" : "Paramétrico"}
      </span>
      <span className="gp-status__dims">
        {formatNumber(d.width)} × {formatNumber(d.length)} × {formatNumber(d.eaveHeight, 1)} m
      </span>
      {model.status === "loading" && (
        <span className="gp-status__progress">
          <i style={{ width: `${Math.round(model.progress * 100)}%` }} />
          {glb ? `Cargando GLB ${Math.round(model.progress * 100)} %` : "Generando…"}
        </span>
      )}
      {model.status === "ready" && model.stats && (
        <span className="gp-status__stats gp-hide-mobile" title="Elementos con metadata / meshes / triángulos">
          {model.stats.elements} elementos · {formatNumber(model.stats.triangles)} tri
        </span>
      )}
      {model.status === "error" && (
        <span className="gp-status__error">
          <TriangleAlert aria-hidden /> {model.error}
        </span>
      )}
    </div>
  );
}
