"use client";

import { assetPath } from "@/components/environment/utils/assetPath";
import { LandMap } from "./LandMap";
import { LotSheet } from "./LotSheet";
import { useLand } from "./store";

/**
 * MW Land — prefactibilidad de lotes en Córdoba.
 * Fase 1: lote real + ficha normativa + caja máxima en 3D.
 */

const STEPS = [
  { id: "lote", label: "Lote" },
  { id: "edificio", label: "Edificio" },
  { id: "customizar", label: "Customizar" },
  { id: "inversion", label: "Inversión" },
  { id: "informe", label: "Informe" },
];

export default function LandExperience() {
  const hasLot = useLand((s) => Boolean(s.study));
  return (
    <div className="gp-app ld-app">
      <LandMap />
      <header className="ld-header">
        <a className="gp-brand ld-brand" href="../" title="Volver a MODELLWERK">
          <img src={assetPath("/brand/mw-lockup-light.svg?v=3")} alt="MODELLWERK" />
          <span className="gp-brand__product">MW / LAND</span>
        </a>
        <nav className="ld-steps" aria-label="Etapas">
          {STEPS.map((s, i) => (
            <span key={s.id} className={`ld-step ${i === 0 ? "is-active" : ""}`} aria-current={i === 0 ? "step" : undefined} title={i === 0 ? undefined : "Próximamente"}>
              <b>{String(i + 1).padStart(2, "0")}</b> {s.label}
            </span>
          ))}
        </nav>
      </header>
      <aside className={`gp-map__card ld-card ${hasLot ? "has-lot" : ""}`} aria-live="polite">
        <LotSheet />
      </aside>
    </div>
  );
}
