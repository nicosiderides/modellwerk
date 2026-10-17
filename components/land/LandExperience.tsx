"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { assetPath } from "@/components/environment/utils/assetPath";
import { CustomizePanel } from "./CustomizePanel";
import { DesignPanel } from "./DesignPanel";
import { FinancePanel } from "./FinancePanel";
import { LandMap } from "./LandMap";
import { LotSheet } from "./LotSheet";
import { Report } from "./Report";
import { openShared } from "./scenarios";
import { useLand, type Stage } from "./store";
import { ElementCard, Toast, ViewTools } from "./ViewTools";

const LandViewer = dynamic(() => import("./LandViewer"), { ssr: false });

/**
 * MW Land — prefactibilidad de lotes en Córdoba.
 * 01 Lote · 02 Edificio · 03 Customizar · 04 Inversión · 05 Informe.
 */

const STEPS: { id: Stage; label: string }[] = [
  { id: "lote", label: "Lote" },
  { id: "edificio", label: "Edificio" },
  { id: "customizar", label: "Customizar" },
  { id: "inversion", label: "Inversión" },
  { id: "informe", label: "Informe" },
];

function Header() {
  const stage = useLand((s) => s.stage);
  const mode = useLand((s) => s.mode);
  const setMode = useLand((s) => s.setMode);
  const goTo = useLand((s) => s.goTo);
  const ready = useLand((s) => Boolean(s.study && s.study.status === "ok" && s.study.zone));
  return (
    <header className={`ld-header ${stage !== "lote" ? "is-design" : ""}`}>
      <a className="gp-brand ld-brand" href="../" title="Volver a MODELLWERK">
        <img src={assetPath("/brand/mw-lockup-light.svg?v=3")} alt="MODELLWERK" />
        <span className="gp-brand__product">MW / LAND</span>
      </a>
      <nav className="ld-steps" aria-label="Etapas">
        {STEPS.map((s, i) => {
          const enabled = s.id === "lote" || ready;
          return (
            <button key={s.id} type="button" className={`ld-step ${stage === s.id ? "is-active" : ""}`} aria-current={stage === s.id ? "step" : undefined} disabled={!enabled} title={enabled ? undefined : "Primero elegí un lote"} onClick={() => goTo(s.id)}>
              <b>{String(i + 1).padStart(2, "0")}</b> {s.label}
            </button>
          );
        })}
      </nav>
      <div className="gp-segmented ld-mode" role="radiogroup" aria-label="Modo">
        <button type="button" role="radio" aria-checked={mode === "simple"} className={mode === "simple" ? "is-selected" : ""} onClick={() => setMode("simple")} title="Respuestas claras, sin detalle técnico">
          Simple
        </button>
        <button type="button" role="radio" aria-checked={mode === "pro"} className={mode === "pro" ? "is-selected" : ""} onClick={() => setMode("pro")} title="Todos los datos técnicos, fuentes y detalle de números">
          Profesional
        </button>
      </div>
    </header>
  );
}

export default function LandExperience() {
  const stage = useLand((s) => s.stage);
  const mode = useLand((s) => s.mode);
  const hasLot = useLand((s) => Boolean(s.study));
  const [sheet, setSheet] = useState(false);
  const design = stage !== "lote";

  // Escenario compartido por enlace (?e=...) y calidad según el equipo.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const small = window.matchMedia("(max-width: 900px)").matches;
    useLand.getState().setViewer({ quality: !small && (navigator.hardwareConcurrency ?? 4) >= 6 ? "high" : "balanced" });
    const code = params.get("e");
    if (code) {
      useLand.getState().showToast("Abriendo el escenario compartido…");
      openShared(code).then((ok) => useLand.getState().showToast(ok ? "Escenario compartido cargado" : "No se pudo abrir el escenario compartido", ok ? "info" : "warn"));
    }
  }, []);

  return (
    <div className={`gp-app ld-app ld-app--${stage} ld-mode-${mode}`}>
      {!design && <LandMap />}
      {design && (
        <div className="gp-stage ld-stage">
          <LandViewer panelWidth={stage === "inversion" ? 480 : 400} />
        </div>
      )}
      <Header />
      {!design && (
        <aside className={`gp-map__card ld-card ${hasLot ? "has-lot" : ""}`} aria-live="polite">
          <LotSheet />
        </aside>
      )}
      {stage === "edificio" && <DesignPanel />}
      {stage === "customizar" && <CustomizePanel onSheet={() => setSheet(true)} />}
      {stage === "inversion" && <FinancePanel />}
      {design && stage !== "informe" && <ViewTools />}
      {design && stage !== "informe" && <ElementCard />}
      {stage === "informe" && <Report />}
      {sheet && stage === "customizar" && <Report sheetOnly onClose={() => setSheet(false)} />}
      <Toast />
    </div>
  );
}
