"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { createWarehouseModel } from "@/core/galpones/geometry";
import { getVariant } from "@/core/galpones/configuration";
import ProductViewer from "@/components/product-viewer/ProductViewer";
import type { ViewerContent, ViewerInsets } from "@/components/product-viewer/types";
import { staticCatalog } from "@/core/galpones/catalog";
import { WarehouseMaterialLibrary, materialSpecs, materialVersion } from "./materials";
import { definitionOf, useGalpones } from "./store";

/**
 * Puente entre el estado de MW Galpones y el visor genérico.
 * Decide qué contenido mostrar (procedural o GLB) y traduce la configuración
 * a materiales, visibilidad y cámara. El visor no sabe nada de galpones.
 */

let snapshot: (() => string | null) | null = null;
export const captureViewerSnapshot = () => snapshot?.() ?? null;

function subscribeResize(callback: () => void) {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}

function useViewportSize() {
  const width = useSyncExternalStore(subscribeResize, () => window.innerWidth, () => 1440);
  const height = useSyncExternalStore(subscribeResize, () => window.innerHeight, () => 900);
  return [width, height] as const;
}

export default function WarehouseViewer() {
  const config = useGalpones((s) => s.warehouse.config);
  const definition = useGalpones((s) => definitionOf(s));
  const viewer = useGalpones((s) => s.viewer);
  const stage = useGalpones((s) => s.ui.stage);
  const panelOpen = useGalpones((s) => s.ui.panelOpen);
  const selection = useGalpones((s) => s.selection);
  const select = useGalpones((s) => s.select);
  const setModelState = useGalpones((s) => s.setModelState);
  const setModelIndex = useGalpones((s) => s.setModelIndex);
  const [library] = useState(() => new WarehouseMaterialLibrary());
  const [width, height] = useViewportSize();
  const shared = staticCatalog.shared();

  const version = config ? materialVersion(config) : "";
  useMemo(() => {
    if (config && definition) library.update(materialSpecs(config, definition));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, definition]);

  // Clave geométrica: sólo lo que cambia la forma del modelo.
  const geometryKey = config
    ? JSON.stringify([config.warehouse, config.variant, config.dimensions, config.structure, config.envelope.roof, config.envelope.walls, config.openings, config.options])
    : null;

  const content = useMemo<ViewerContent | null>(() => {
    if (!config || !definition) return null;
    const variant = getVariant(definition, config.variant);
    if (variant) return { kind: "glb", key: `${definition.id}/${variant.id}`, definition: variant.model, fitOnChange: true };
    const snapshotConfig = structuredClone(config);
    return {
      kind: "procedural",
      key: geometryKey!,
      fitGroup: definition.id,
      build: () => createWarehouseModel(snapshotConfig, definition),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometryKey, definition]);

  const mobile = width < 760;
  const capture = typeof document !== "undefined" && document.documentElement.dataset.gpCapture === "1";
  const insets = useMemo<ViewerInsets>(() => {
    if (capture) return { top: 0, right: 0, bottom: 0, left: 0 };
    // Móvil: el panel es una hoja inferior (~46 % de la altura).
    if (mobile) return { top: 140, right: 0, bottom: stage === "summary" ? height : panelOpen || selection ? Math.round(height * 0.46) + 8 : 96, left: 0 };
    if (stage === "configure") return { top: 72, right: panelOpen ? 404 : 0, bottom: 64, left: 0 };
    if (stage === "explore") return { top: 72, right: selection ? 360 : 0, bottom: 64, left: panelOpen ? 300 : 0 };
    if (stage === "summary") return { top: 72, right: Math.min(720, Math.max(440, width * 0.46)), bottom: 24, left: 0 };
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }, [capture, mobile, stage, panelOpen, selection, width, height]);

  const hidden = viewer.hidden;
  const isolated = viewer.isolated?.categories ?? null;
  const onSnapshot = useCallback((capture: () => string | null) => {
    snapshot = capture;
  }, []);

  if (!content) return null;
  return (
    <ProductViewer
      className={`gp-viewer gp-viewer--${stage}`}
      content={content}
      resolveMaterial={library.resolve}
      materialVersion={version}
      hiddenCategories={hidden}
      isolatedCategories={isolated}
      explode={viewer.explode}
      explodeOffsets={shared.explodeOffsets}
      selectable={stage === "explore" || stage === "configure"}
      selectedElementId={selection?.elementId ?? null}
      onSelect={(next) => {
        select(next);
        if (next && useGalpones.getState().ui.stage === "configure") useGalpones.getState().goTo("explore");
        if (next) useGalpones.getState().select(next);
      }}
      onIndex={setModelIndex}
      onLoadState={setModelState}
      cameraRequest={viewer.camera}
      showScaleReferences={viewer.scaleReferences}
      quality={viewer.quality}
      insets={insets}
      onSnapshotReady={onSnapshot}
    />
  );
}
