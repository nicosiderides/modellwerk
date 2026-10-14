"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { createWarehouseModel } from "@/core/galpones/geometry";
import { getVariant } from "@/core/galpones/configuration";
import ProductViewer from "@/components/product-viewer/ProductViewer";
import type { ModelCategory } from "@/core/product-engine/types";
import type { ViewerBackdrop, ViewerContent, ViewerInsets, ViewerSurroundings } from "@/components/product-viewer/types";
import { buildSite, disposeSite } from "@/core/galpones/site";
import { planSite } from "@/core/galpones/sitePlan";
import { createGroundBackdrop, groundAttribution, hasPhoto } from "./map/groundMap";
import { staticCatalog } from "@/core/galpones/catalog";
import { WarehouseMaterialLibrary, materialSpecs, materialVersion } from "./materials";
import { definitionOf, useGalpones } from "./store";

/**
 * Puente entre el estado de MW Galpones y el visor genérico.
 * Decide qué contenido mostrar (procedural o GLB) y traduce la configuración
 * a materiales, visibilidad y cámara. El visor no sabe nada de galpones.
 */

/** Altura del corte en la vista en planta (m). */
export const PLAN_CUT_HEIGHT = 1.2;

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

  const underground = viewer.underground;
  // Vista en planta: el galpón se corta a 1,20 m, como un plano de arquitectura.
  const planCut = viewer.camera.preset === "top" && viewer.camera.nonce > 0 ? PLAN_CUT_HEIGHT : null;
  const version = config ? materialVersion(config, underground) : "";
  useMemo(() => {
    if (config && definition) library.update(materialSpecs(config, definition, { underground }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, definition]);

  // Clave geométrica: sólo lo que cambia la forma del modelo.
  const geometryKey = config
    ? JSON.stringify([config.warehouse, config.variant, config.dimensions, config.structure, config.foundation, config.envelope.roof, config.envelope.walls, config.openings, config.options])
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

  // Piso de mapa real: sólo si el lote tiene ubicación (elegido en el mapa).
  const location = config?.lot.enabled ? config.lot.location : null;
  const groundMode = !location || viewer.ground === "off" ? "off" : viewer.ground === "photo" && !hasPhoto(location.center) ? "plan" : viewer.ground;
  const detail = mobile ? "low" : "high";
  const backdropKey = location && groundMode !== "off" ? `${location.nomenclatura}|${location.fit.origin.join(",")}|${groundMode}|${detail}` : null;
  const realGround = backdropKey !== null;

  // Entorno: depende de la planta del galpón, del entorno elegido y de si se muestran vehículos.
  const siteKey = config ? JSON.stringify([geometryKey, config.site, config.lot, viewer.scaleReferences, realGround]) : null;
  const surroundings = useMemo<ViewerSurroundings | null>(() => {
    if (!config || !definition) return null;
    const snapshotConfig = structuredClone(config);
    const vehicles = viewer.scaleReferences;
    return { key: siteKey!, build: () => buildSite(snapshotConfig, definition, { vehicles, realGround }), dispose: (root) => disposeSite(root as Parameters<typeof disposeSite>[0]) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, definition]);

  // Rincón del lote (frente-oeste) en coordenadas del modelo: ahí se apoya el mapa.
  const lotCorner = useMemo(() => {
    if (!config || !definition || !realGround) return null;
    const L = planSite(config, definition).lotRect;
    return L ? ([L.x0, 0, L.z0] as [number, number, number]) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, definition, realGround]);
  const backdrop = useMemo<ViewerBackdrop | null>(() => {
    if (!backdropKey || !location || !lotCorner || groundMode === "off") return null;
    const where = location;
    const mode = groundMode;
    return { key: backdropKey, offset: lotCorner, build: (invalidate) => createGroundBackdrop(where, mode, { detail, onChange: invalidate }) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backdropKey, lotCorner?.[0], lotCorner?.[2]]);

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

  // Bajo el suelo se ve el esqueleto: estructura y fundaciones, sin envolvente.
  const hidden = useMemo<ModelCategory[]>(
    () => (underground ? Array.from(new Set<ModelCategory>([...viewer.hidden, "roof", "walls", "doors", "windows", "skylights", "gutters", "canopy"])) : viewer.hidden),
    [underground, viewer.hidden]
  );
  const isolated = viewer.isolated?.categories ?? null;
  const onSnapshot = useCallback((capture: () => string | null) => {
    snapshot = capture;
  }, []);

  if (!content) return null;
  return (
    <>
      <ProductViewer
        className={`gp-viewer gp-viewer--${stage}`}
        content={content}
        surroundings={underground ? null : surroundings}
        backdrop={backdrop}
        underground={underground}
        sectionHeight={planCut}
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
      {planCut !== null && !capture && (
        <p className="gp-cut-badge" style={{ left: insets.left + 14 }}>
          Planta · corte a +{planCut.toFixed(2).replace(".", ",")} m
        </p>
      )}
      {backdrop && !capture && !underground && (
        <p className="gp-map-credit" style={{ left: insets.left + 14 }}>
          {groundAttribution(groundMode)}
        </p>
      )}
    </>
  );
}
