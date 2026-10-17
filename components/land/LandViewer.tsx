"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Group, Vector3 } from "three";
import ProductViewer from "@/components/product-viewer/ProductViewer";
import type { ViewerBackdrop, ViewerContent, ViewerInsets, ViewerSurroundings } from "@/components/product-viewer/types";
import { createGroundBackdrop, groundAttribution, hasPhoto } from "@/components/galpones/map/groundMap";
import { WarehouseMaterialLibrary, materialSpecs, materialVersion } from "@/components/galpones/materials";
import { staticCatalog } from "@/core/galpones/catalog";
import { getVariant } from "@/core/galpones/configuration";
import { createWarehouseModel } from "@/core/galpones/geometry";
import { buildLotLocation } from "@/core/galpones/geo/lotFromParcel";
import { buildSiteFromPlan, disposeSite } from "@/core/galpones/site";
import { galponSitePlan } from "@/core/land/design/galponSite";
import { LAND_SPECS } from "@/core/land/design/catalog";
import { carSpots, createLandBuilding } from "@/core/land/kit/building";
import { LandMaterialLibrary, LAND_EXPLODE, landMaterialSpecs, landMaterialVersion } from "./materials";
import { buildSurroundings, disposeSurroundings } from "./scene";
import { GALPON_DEFS, useLand } from "./store";
import { isLandType, useComputed } from "./useDesign";

/**
 * Visor 3D de MW Land: el edificio elegido (generado con el kit estándar o la
 * geometría de Galpones), la caja máxima como vidrio y la foto aérea real del
 * lote como piso. Usa el visor genérico de MODELLWERK sin modificarlo.
 */

let snapshot: (() => string | null) | null = null;
export const captureLandSnapshot = () => snapshot?.() ?? null;

function subscribeResize(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}

export default function LandViewer({ panelWidth }: { panelWidth: number }) {
  const study = useLand((s) => s.study);
  const typeId = useLand((s) => s.typeId);
  const design = useLand((s) => s.design);
  const viewer = useLand((s) => s.viewer);
  const selection = useLand((s) => s.selection);
  const select = useLand((s) => s.select);
  const computed = useComputed();
  const width = useSyncExternalStore(subscribeResize, () => window.innerWidth, () => 1440);
  const height = useSyncExternalStore(subscribeResize, () => window.innerHeight, () => 900);
  const [landLib] = useState(() => new LandMaterialLibrary());
  const [galponLib] = useState(() => new WarehouseMaterialLibrary());

  const galpon = typeId === "galpon" ? design?.galpon ?? null : null;
  const galponDef = galpon ? GALPON_DEFS.find((d) => d.id === galpon.warehouseId) ?? null : null;
  const landCfg = isLandType(typeId) ? design?.land[typeId] ?? null : null;
  const plan = computed?.plan ?? null;
  const rect = plan?.rect ?? null;

  /* materiales */
  const version = landCfg ? landMaterialVersion(landCfg) : galpon ? materialVersion(galpon.config) : "";
  useMemo(() => {
    if (landCfg && isLandType(typeId)) landLib.update(landMaterialSpecs(LAND_SPECS[typeId], landCfg));
    if (galpon && galponDef) galponLib.update(materialSpecs(galpon.config, galponDef));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, typeId]);

  /* contenido: los tipos nuevos se arman en coordenadas del lote; el galpón llega centrado y se corre al lugar */
  const galponVariant = galpon && galponDef ? getVariant(galponDef, galpon.config.variant) : null;
  const center: [number, number] = rect ? [(rect.x0 + rect.x1) / 2, (rect.z0 + rect.z1) / 2] : [0, 0];
  /** Corrimiento del entorno y del piso: sólo para el galpón con modelo BIM (GLB), que el visor centra. */
  const shift: [number, number, number] = galponVariant ? [-center[0], 0, -center[1]] : [0, 0, 0];

  const contentKey = computed && rect ? JSON.stringify([typeId, landCfg, galpon?.config, galpon?.align, galpon?.front, rect, plan?.floors.map((f) => [f.base, f.rect])]) : null;
  const content = useMemo<ViewerContent | null>(() => {
    if (!computed || !rect || !plan || !contentKey) return null;
    if (galpon && galponDef) {
      if (galponVariant) return { kind: "glb", key: `${galponDef.id}/${galponVariant.id}`, definition: galponVariant.model, fitOnChange: true };
      const cfg = structuredClone(galpon.config);
      const c = center;
      return {
        kind: "procedural",
        key: contentKey,
        fitGroup: `galpon-${galponDef.id}`,
        build: () => {
          const m = createWarehouseModel(cfg, galponDef);
          const g = new Group();
          g.name = "MW_LAND_GALPON";
          g.position.set(c[0], 0, c[1]);
          g.add(m.root);
          return { root: g, metadata: m.metadata };
        },
      };
    }
    if (landCfg && isLandType(typeId)) {
      const spec = LAND_SPECS[typeId];
      const cfg = { ...landCfg };
      const p = plan;
      const site = { usable: computed.usable!, party: computed.party };
      return { kind: "procedural", key: contentKey, fitGroup: `land-${typeId}`, build: () => createLandBuilding(spec, cfg, p, site) };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey]);

  /* piso: foto aérea real del lote (se calcula antes porque el entorno del galpón depende de si hay mapa) */
  const location = useMemo(() => (study ? buildLotLocation(study.parcel, study.analysis, null) : null), [study]);
  const mobile = width < 760;
  const groundMode = !location || viewer.ground === "off" ? "off" : viewer.ground === "photo" && !hasPhoto(location.center) ? "plan" : viewer.ground;
  const realGround = groundMode !== "off";

  /* entorno: caja máxima, contorno del lote, planta edificable y, en el galpón, el entorno de Galpones */
  const cars = useMemo(() => (viewer.scaleRefs && landCfg && plan && computed?.usable && isLandType(typeId) ? carSpots(LAND_SPECS[typeId], landCfg, plan, { usable: computed.usable, party: computed.party }) : []), [viewer.scaleRefs, landCfg, plan, computed, typeId]);
  const showEnvelope = viewer.showEnvelope && viewer.cut === null;
  const galponSiteKey = galpon && rect ? JSON.stringify([galpon.config.site, galpon.config.lot.vehicle, galpon.config.options, galpon.config.dimensions, galpon.config.variant, rect, viewer.scaleRefs, realGround]) : null;
  const siteKey = study && computed ? JSON.stringify([study.parcel.properties.Nomenclatura, study.analysis.frontEdge, computed.envelope.tiers.map((t) => [t.from, t.to, t.area]), showEnvelope, typeId, shift, galponSiteKey, realGround, cars]) : null;
  const surroundings = useMemo<ViewerSurroundings | null>(() => {
    if (!study || !computed || !siteKey) return null;
    const env = computed.envelope;
    const opts = { showEnvelope, typeId, realGround: realGround || typeId === "galpon", cars };
    const s = shift;
    const gSite = galpon && galponDef && rect ? galponSitePlan(study, galponDef, galpon.config, rect) : null;
    const c = center;
    const siteOpts = { vehicles: viewer.scaleRefs, realGround };
    return {
      key: siteKey,
      build: () => {
        const built = buildSurroundings(study, env, opts);
        if (gSite) {
          // Veredas, playón, estacionamiento, parquizado y vehículos: el armado de Galpones, alrededor de la nave.
          const site = buildSiteFromPlan(gSite, siteOpts);
          site.root.position.set(c[0], 0, c[1]);
          built.root.add(site.root);
          built.box.union(site.box.clone().translate(new Vector3(c[0], 0, c[1])));
        }
        built.root.position.set(s[0], s[1], s[2]);
        built.root.updateMatrixWorld(true);
        built.box.translate(built.root.position);
        return built;
      },
      dispose: (root) => {
        const site = (root as Group).getObjectByName("MW_SITE");
        if (site) {
          site.removeFromParent();
          disposeSite(site as Group);
        }
        disposeSurroundings(root as Group);
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  const detail = mobile ? "low" : "high";
  const backdropKey = location && groundMode !== "off" ? `${location.nomenclatura}|${location.fit.origin.join(",")}|${groundMode}|${detail}` : null;
  const backdrop = useMemo<ViewerBackdrop | null>(() => {
    if (!backdropKey || !location || groundMode === "off") return null;
    const mode = groundMode;
    return { key: backdropKey, offset: shift, build: (invalidate) => createGroundBackdrop(location, mode, { detail, onChange: invalidate }) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backdropKey, shift[0], shift[2]]);

  const insets = useMemo<ViewerInsets>(() => (mobile ? { top: 120, right: 0, bottom: Math.round(height * 0.5), left: 0 } : { top: 80, right: panelWidth + 24, bottom: 76, left: 0 }), [mobile, height, panelWidth]);
  const onSnapshot = useCallback((c: () => string | null) => {
    snapshot = c;
  }, []);
  const explodeOffsets = galpon ? staticCatalog.shared().explodeOffsets : LAND_EXPLODE;
  /** Corte por piso: 1,2 m sobre el piso elegido (como una planta de arquitectura). */
  const cutFloor = viewer.cut !== null && plan?.floors.length ? plan.floors[Math.min(viewer.cut, plan.floors.length - 1)] : null;
  const sectionHeight = cutFloor ? (galpon ? 1.5 : cutFloor.base + (cutFloor.index === 0 ? 1.2 : 1.45)) : null;

  if (!content) return null;
  return (
    <>
      <ProductViewer
        className="gp-viewer ld-viewer"
        content={content}
        surroundings={surroundings}
        backdrop={backdrop}
        resolveMaterial={galpon ? galponLib.resolve : landLib.resolve}
        materialVersion={version}
        hiddenCategories={viewer.hidden}
        isolatedCategories={viewer.isolated}
        explode={viewer.explode}
        explodeOffsets={explodeOffsets}
        selectable
        selectedElementId={selection?.elementId ?? null}
        onSelect={select}
        cameraRequest={viewer.camera}
        showScaleReferences={viewer.scaleRefs}
        sectionHeight={sectionHeight}
        quality={viewer.quality}
        insets={insets}
        onSnapshotReady={onSnapshot}
      />
      {backdrop && <p className="gp-map-credit ld-credit">{groundAttribution(groundMode)}</p>}
    </>
  );
}
