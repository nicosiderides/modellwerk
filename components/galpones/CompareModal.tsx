"use client";

import { staticCatalog } from "@/core/galpones/catalog";
import { ridgeHeight, structureLabel } from "@/core/galpones/configuration";
import { calculateMetrics, formatEstimate, formatNumber } from "@/core/galpones/metrics";
import type { WarehouseConfig } from "@/core/galpones/types";
import { Modal } from "./Modal";
import { openingsLabel } from "./WarehouseSummary";
import { useGalpones } from "./store";

/** COMPARE: dos configuraciones guardadas lado a lado (resalta diferencias). */

function describe(config: WarehouseConfig | null) {
  if (!config) return null;
  const definition = staticCatalog.get(config.warehouse);
  if (!definition) return null;
  const m = calculateMetrics(config, definition);
  const env = definition.envelope;
  const ins = env.insulation.find((i) => i.id === config.envelope.insulation);
  const o = config.openings;
  const rows: Record<string, string> = {
    Tipología: definition.name,
    Medidas: `${formatNumber(config.dimensions.width)} × ${formatNumber(config.dimensions.length)} m`,
    Superficie: `${formatNumber(m.floorArea)} m²`,
    "Luz libre": `${formatNumber(m.clearSpan)} m`,
    "Alero / cumbrera": `${formatNumber(config.dimensions.eaveHeight, 1)} / ${formatNumber(ridgeHeight(config.dimensions), 1)} m`,
    Volumen: `${formatNumber(m.internalVolume)} m³`,
    Estructura: structureLabel(definition, config.structure),
    Cubierta: env.roof.find((r) => r.id === config.envelope.roof)?.name ?? "—",
    Cerramientos: env.walls.find((r) => r.id === config.envelope.walls)?.name ?? "—",
    Aislación: ins ? `${ins.name} ${"●".repeat(ins.level)}${"○".repeat(3 - ins.level)}` : "—",
    Aberturas: openingsLabel(o),
    Opcionales: definition.options.options.filter((x) => config.options[x.id]).map((x) => x.name).join(", ") || "—",
    "Acero (demo)": formatEstimate(m.estimatedSteelWeight),
    "Plazo (demo)": formatEstimate(m.estimatedConstructionTime),
    Costo: formatEstimate(m.estimatedCost),
  };
  return rows;
}

export function CompareModal() {
  const compare = useGalpones((s) => s.compare);
  const current = useGalpones((s) => s.warehouse.config);
  const saveToCompare = useGalpones((s) => s.saveToCompare);
  const replaceConfig = useGalpones((s) => s.replaceConfig);
  const setModal = useGalpones((s) => s.setModal);
  const clear = useGalpones((s) => s.clearCompare);
  const a = describe(compare.A);
  const b = describe(compare.B);
  const keys = Object.keys(a ?? b ?? describe(current) ?? {});

  return (
    <Modal title="Comparar alternativas" kicker="Opción A / Opción B" wide>
      <div className="gp-compare__actions">
        <button type="button" className="gp-button" onClick={() => saveToCompare("A")}>Guardar actual como A</button>
        <button type="button" className="gp-button" onClick={() => saveToCompare("B")}>Guardar actual como B</button>
        {(a || b) && (
          <button type="button" className="gp-link-button" onClick={clear}>Limpiar</button>
        )}
      </div>
      {!a && !b ? (
        <p className="gp-empty">Guardá la configuración actual como opción A, cambiá lo que quieras y guardala como opción B para verlas lado a lado.</p>
      ) : (
        <div className="gp-compare__scroll">
          <table className="gp-compare">
            <thead>
              <tr>
                <th />
                <th>
                  Opción A
                  {compare.A && (
                    <button type="button" className="gp-link-button" onClick={() => { replaceConfig(compare.A!); setModal(null); }}>Abrir</button>
                  )}
                </th>
                <th>
                  Opción B
                  {compare.B && (
                    <button type="button" className="gp-link-button" onClick={() => { replaceConfig(compare.B!); setModal(null); }}>Abrir</button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => {
                const va = a?.[key] ?? "—";
                const vb = b?.[key] ?? "—";
                const differs = a && b && va !== vb;
                return (
                  <tr key={key} className={differs ? "is-diff" : ""}>
                    <th scope="row">{key}</th>
                    <td>{va}</td>
                    <td>{vb}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="gp-field__hint">Las filas resaltadas son las que cambian. Acero y plazo son estimaciones demo; el costo se cotiza.</p>
    </Modal>
  );
}
