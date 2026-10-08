"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { ArrowLeft, GitCompareArrows, Save, Send } from "lucide-react";
import { assetPath } from "@/components/environment/utils/assetPath";
import { configFromShareCode } from "@/core/galpones/storage";
import { WarehouseCatalog } from "./WarehouseCatalog";
import { WarehouseConfigurator } from "./WarehouseConfigurator";
import { WarehouseExplorer } from "./WarehouseExplorer";
import { WarehouseSummary } from "./WarehouseSummary";
import { ViewToolbar } from "./ViewToolbar";
import { ModelStatus } from "./ModelStatus";
import { CompareModal } from "./CompareModal";
import { QuoteModal } from "./QuoteModal";
import { SavedModal } from "./SavedModal";
import { definitionOf, useGalpones, type Stage } from "./store";

const WarehouseViewer = dynamic(() => import("./WarehouseViewer"), { ssr: false });

const STEPS: { id: Stage; label: string }[] = [
  { id: "catalog", label: "Catálogo" },
  { id: "configure", label: "Configurar" },
  { id: "explore", label: "Explorar" },
  { id: "summary", label: "Resumen" },
];

function Header() {
  const stage = useGalpones((s) => s.ui.stage);
  const definition = useGalpones((s) => definitionOf(s));
  const goTo = useGalpones((s) => s.goTo);
  const setModal = useGalpones((s) => s.setModal);
  const compare = useGalpones((s) => s.compare);
  const compareCount = Number(Boolean(compare.A)) + Number(Boolean(compare.B));

  return (
    <header className={`gp-header ${stage === "catalog" ? "gp-header--catalog" : ""}`}>
      <a className="gp-brand" href="../" title="Volver a MODELLWERK">
        <img src={assetPath("/brand/mw-lockup-light.svg?v=3")} alt="MODELLWERK" />
        <span className="gp-brand__product">MW / WAREHOUSE</span>
      </a>

      <nav className="gp-steps" aria-label="Etapas">
        {STEPS.map((step, i) => {
          const disabled = step.id !== "catalog" && !definition;
          return (
            <button
              key={step.id}
              type="button"
              className={`gp-step ${stage === step.id ? "is-active" : ""}`}
              disabled={disabled}
              onClick={() => goTo(step.id)}
              aria-current={stage === step.id ? "step" : undefined}
            >
              <span className="gp-step__index">{String(i + 1).padStart(2, "0")}</span>
              <span className="gp-step__label">{step.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="gp-header__actions">
        {definition && stage !== "catalog" && (
          <>
            <button type="button" className="gp-icon-button gp-hide-mobile" onClick={() => setModal("compare")} title="Comparar alternativas">
              <GitCompareArrows aria-hidden />
              <span>Comparar</span>
              {compareCount > 0 && <em className="gp-badge">{compareCount}</em>}
            </button>
            <button type="button" className="gp-icon-button" onClick={() => setModal("saved")} title="Guardar o abrir configuraciones">
              <Save aria-hidden />
              <span className="gp-hide-mobile">Guardar</span>
            </button>
            <button type="button" className="gp-button gp-button--primary gp-hide-mobile" onClick={() => setModal("quote")}>
              <Send aria-hidden /> Pedir presupuesto
            </button>
          </>
        )}
        {stage === "catalog" && definition && (
          <button type="button" className="gp-icon-button" onClick={() => goTo("configure")}>
            <ArrowLeft aria-hidden /> <span>Volver a {definition.name}</span>
          </button>
        )}
      </div>
    </header>
  );
}

function Toast() {
  const toast = useGalpones((s) => s.ui.toast);
  if (!toast) return null;
  return (
    <div className="gp-toast" role="status" key={toast.id}>
      {toast.text}
    </div>
  );
}

export default function GalponesExperience() {
  const stage = useGalpones((s) => s.ui.stage);
  const hasModel = useGalpones((s) => Boolean(s.warehouse.config));
  const modal = useGalpones((s) => s.ui.modal);

  // Calidad según el dispositivo + configuración compartida por URL (?c=...).
  // ?capture=<tipología> abre el visor sin interfaz (para generar miniaturas del catálogo).
  useEffect(() => {
    const state = useGalpones.getState();
    const params = new URLSearchParams(window.location.search);
    const small = window.matchMedia("(max-width: 900px)").matches;
    state.setQuality(params.get("quality") === "high" || (!small && (navigator.hardwareConcurrency ?? 4) >= 6) ? "high" : "balanced");
    const capture = params.get("capture");
    if (capture) {
      state.openWarehouse(capture);
      state.setScaleReferences(params.get("refs") === "1");
      document.documentElement.dataset.gpCapture = "1";
      return;
    }
    const code = params.get("c");
    if (code) {
      const shared = configFromShareCode(code);
      if (shared) {
        state.openWarehouse(shared.warehouse, shared);
        state.toast("Configuración compartida cargada");
      }
    }
  }, []);

  return (
    <div className={`gp-app gp-app--${stage}`}>
      {hasModel && (
        <div className={`gp-stage ${stage === "catalog" ? "is-hidden" : ""}`} aria-hidden={stage === "catalog"}>
          <WarehouseViewer />
        </div>
      )}
      <Header />
      {stage === "catalog" && <WarehouseCatalog />}
      {stage !== "catalog" && hasModel && (
        <>
          <ModelStatus />
          {stage === "configure" && <WarehouseConfigurator />}
          {stage === "explore" && <WarehouseExplorer />}
          {stage === "summary" && <WarehouseSummary />}
          {stage !== "summary" && <ViewToolbar />}
        </>
      )}
      {modal === "compare" && <CompareModal />}
      {modal === "quote" && <QuoteModal />}
      {modal === "saved" && <SavedModal />}
      <Toast />
    </div>
  );
}
