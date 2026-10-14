"use client";

import { create } from "zustand";
import type { MetadataIndex } from "@/core/product-engine/metadata";
import type { ModelCategory, ModelMetadataDocument } from "@/core/product-engine/types";
import { staticCatalog } from "@/core/galpones/catalog";
import { createDefaultConfig, normalizeConfig, selectVariant } from "@/core/galpones/configuration";
import { clampDimension, dimensionValue, fitToLot, limitSentence, ruleRequirement, variantFits } from "@/core/galpones/lotLimits";
import { formatNumber } from "@/core/galpones/metrics";
import type { DimensionKey, LotConfig, LotLocation, Openings, SiteConfig, StructureSystemId, WarehouseConfig, WarehouseDefinition } from "@/core/galpones/types";
import { lotPatchFromLocation } from "@/core/galpones/geo/lotFromParcel";
import type { ZoneResult } from "@/core/galpones/geo/cordobaZoning";
import { planSite } from "@/core/galpones/sitePlan";
import { presetById } from "@/core/galpones/lotRules";
import type { CameraPresetId, CameraRequest, ModelLoadState, SelectionInfo, ViewerQuality } from "@/components/product-viewer/types";

export type GroundMode = "photo" | "plan" | "off";

/**
 * Estado de MW Galpones, separado por responsabilidad:
 *   warehouse  → configuración comercial (serializable)
 *   viewer     → cámara, explosión, visibilidad, referencias, calidad
 *   model      → carga, índice de metadata, estadísticas
 *   ui         → etapa, pestaña, paneles y modales
 *   selection  → elemento seleccionado (referencia a metadata, nunca UUID en el JSON de negocio)
 *   compare    → alternativas A / B
 */

export type Stage = "catalog" | "configure" | "explore" | "summary";
export type ConfigTab = "dimensions" | "structure" | "envelope" | "openings" | "options" | "site";
export type Modal = null | "quote" | "saved" | "compare" | "map";

type WarehouseState = { definitionId: string | null; config: WarehouseConfig | null };
type ViewerState = {
  camera: CameraRequest;
  explode: boolean;
  scaleReferences: boolean;
  hidden: ModelCategory[];
  isolated: { id: string; categories: ModelCategory[] } | null;
  quality: ViewerQuality;
  /** Piso del visor cuando el lote tiene ubicación real: foto aérea, plano o neutro. */
  ground: GroundMode;
};
type ModelState = ModelLoadState & { index: MetadataIndex | null; metadata: ModelMetadataDocument | null };
export type ToastTone = "info" | "limit";
type UiState = { stage: Stage; tab: ConfigTab; modal: Modal; panelOpen: boolean; toast: { id: number; text: string; tone: ToastTone } | null };
type CompareState = { A: WarehouseConfig | null; B: WarehouseConfig | null };

export type GalponesState = {
  warehouse: WarehouseState;
  viewer: ViewerState;
  model: ModelState;
  ui: UiState;
  selection: SelectionInfo;
  compare: CompareState;

  // navegación
  openWarehouse: (id: string, config?: WarehouseConfig) => void;
  goTo: (stage: Stage) => void;
  setTab: (tab: ConfigTab) => void;
  setModal: (modal: Modal) => void;
  setPanelOpen: (open: boolean) => void;
  toast: (text: string, tone?: ToastTone) => void;

  // configuración
  setDimension: (key: DimensionKey, value: number) => void;
  setVariant: (variantId: string) => void;
  setStructure: (id: StructureSystemId) => void;
  setStructureFinish: (id: string) => void;
  setEnvelope: (patch: Partial<WarehouseConfig["envelope"]>) => void;
  setOpenings: (patch: Partial<Openings>) => void;
  toggleOption: (id: string, on: boolean) => void;
  setSite: (patch: Partial<SiteConfig>) => void;
  setLot: (patch: Partial<LotConfig>) => void;
  /** Achica / corre el galpón hasta que cumpla la normativa del lote. */
  fitToLot: () => void;
  /** Usa un lote real elegido en el mapa (medidas, esquina y normativa de la zona). */
  applyLotLocation: (location: LotLocation, corner: LotConfig["corner"], zone: ZoneResult | null) => void;
  /** Quita la ubicación real y vuelve a las medidas cargadas a mano. */
  clearLotLocation: () => void;
  replaceConfig: (config: WarehouseConfig) => void;
  reset: () => void;

  // visor
  requestCamera: (preset: CameraPresetId) => void;
  setExplode: (on: boolean) => void;
  setScaleReferences: (on: boolean) => void;
  toggleHidden: (categories: ModelCategory[]) => void;
  isolate: (id: string, categories: ModelCategory[]) => void;
  showAll: () => void;
  setQuality: (quality: ViewerQuality) => void;
  setGround: (ground: GroundMode) => void;

  // modelo / selección
  setModelState: (state: ModelLoadState) => void;
  setModelIndex: (index: MetadataIndex | null, metadata: ModelMetadataDocument | null) => void;
  select: (selection: SelectionInfo) => void;

  // comparación
  saveToCompare: (slot: "A" | "B") => void;
  clearCompare: () => void;
};

export const definitionOf = (state: Pick<GalponesState, "warehouse">): WarehouseDefinition | null =>
  (state.warehouse.definitionId && staticCatalog.get(state.warehouse.definitionId)) || null;

const withConfig = (state: GalponesState, change: (definition: WarehouseDefinition, config: WarehouseConfig) => WarehouseConfig): Partial<GalponesState> => {
  const definition = definitionOf(state);
  const config = state.warehouse.config;
  if (!definition || !config) return {};
  return { warehouse: { ...state.warehouse, config: change(definition, config) } };
};

let toastId = 0;

export const useGalpones = create<GalponesState>((set, get) => ({
  warehouse: { definitionId: null, config: null },
  viewer: { camera: { preset: "perspective", nonce: 0 }, explode: false, scaleReferences: true, hidden: [], isolated: null, quality: "balanced", ground: "photo" },
  model: { status: "idle", progress: 0, index: null, metadata: null },
  ui: { stage: "catalog", tab: "dimensions", modal: null, panelOpen: true, toast: null },
  selection: null,
  compare: { A: null, B: null },

  openWarehouse: (id, config) => {
    const definition = staticCatalog.get(id);
    if (!definition) return;
    let next = config ? normalizeConfig(definition, config) : createDefaultConfig(definition);
    // El lote y la normativa se eligen una vez: se conservan al cambiar de tipología.
    const previous = get().warehouse.config;
    let adjusted = false;
    if (!config && previous) {
      next = normalizeConfig(definition, { ...next, lot: structuredClone(previous.lot), site: { ...previous.site } });
      const fitted = fitToLot(definition, next);
      adjusted = JSON.stringify(fitted.dimensions) !== JSON.stringify(next.dimensions) || fitted.variant !== next.variant;
      next = fitted;
    }
    if (adjusted) window.setTimeout(() => get().toast("Medidas iniciales ajustadas a tu lote"), 0);
    set((state) => ({
      warehouse: { definitionId: id, config: next },
      ui: { ...state.ui, stage: "configure", tab: "site", modal: null, panelOpen: true },
      viewer: { ...state.viewer, explode: false, hidden: [], isolated: null },
      selection: null,
    }));
  },
  goTo: (stage) =>
    set((state) => ({
      ui: { ...state.ui, stage, modal: null, panelOpen: stage === "catalog" ? state.ui.panelOpen : true },
      selection: stage === "explore" ? state.selection : null,
      viewer: stage === "explore" ? state.viewer : { ...state.viewer, isolated: null, hidden: [], explode: stage === "summary" ? false : state.viewer.explode },
    })),
  setTab: (tab) => set((state) => ({ ui: { ...state.ui, tab, panelOpen: true } })),
  setModal: (modal) => set((state) => ({ ui: { ...state.ui, modal } })),
  setPanelOpen: (panelOpen) => set((state) => ({ ui: { ...state.ui, panelOpen } })),
  toast: (text, tone = "info") => {
    toastId += 1;
    const id = toastId;
    set((state) => ({ ui: { ...state.ui, toast: { id, text, tone } } }));
    window.setTimeout(() => {
      if (get().ui.toast?.id === id) set((state) => ({ ui: { ...state.ui, toast: null } }));
    }, tone === "limit" ? 4200 : 2800);
  },

  setDimension: (key, value) => {
    const state = get();
    const definition = definitionOf(state);
    const config = state.warehouse.config;
    if (!definition || !config) return;
    // Freno por lote y normativa: si el valor pedido no cumple, queda en el último que cumple.
    const { config: next, limitedBy } = clampDimension(definition, config, key, value);
    set((s) => ({ warehouse: { ...s.warehouse, config: next } }));
    if (limitedBy) {
      const unit = key === "roofSlope" ? " %" : key === "bayCount" ? " módulos" : " m";
      const what = { width: "de ancho", length: "de largo", eaveHeight: "de alero", ridgeHeight: "de cumbrera", roofSlope: "de pendiente", baySpacing: "entre pórticos", bayCount: "" }[key];
      const reached = formatNumber(dimensionValue(next, key), key === "bayCount" ? 0 : 1);
      get().toast(`Tope del lote: ${reached}${unit} ${what}. ${limitSentence(limitedBy)}`.replace(/\s+/g, " "), "limit");
    }
  },
  setVariant: (variantId) => {
    const state = get();
    const definition = definitionOf(state);
    const config = state.warehouse.config;
    if (!definition || !config) return;
    const issue = variantFits(definition, config, variantId);
    if (issue) {
      const need = ruleRequirement(issue);
      get().toast(`Esa variante no entra en el lote: ${issue.id === "fits" ? "se sale del terreno" : `${issue.label.toLowerCase()}${need ? ` (${need})` : ""}`}.`, "limit");
      return;
    }
    set((s) => ({ ...withConfig(s, (d, c) => selectVariant(d, c, variantId)), selection: null }));
  },
  setStructure: (id) => set((state) => ({ ...withConfig(state, (d, c) => normalizeConfig(d, { ...c, structure: id })), selection: null })),
  setStructureFinish: (id) => set((state) => withConfig(state, (d, c) => normalizeConfig(d, { ...c, structureFinish: id }))),
  setEnvelope: (patch) => set((state) => withConfig(state, (d, c) => normalizeConfig(d, { ...c, envelope: { ...c.envelope, ...patch } }))),
  setOpenings: (patch) => set((state) => ({ ...withConfig(state, (d, c) => normalizeConfig(d, { ...c, openings: { ...c.openings, ...patch } })), selection: null })),
  toggleOption: (id, on) => set((state) => ({ ...withConfig(state, (d, c) => normalizeConfig(d, { ...c, options: { ...c.options, [id]: on } })), selection: null })),
  setSite: (patch) => set((state) => withConfig(state, (d, c) => normalizeConfig(d, { ...c, site: { ...c.site, ...patch } }))),
  setLot: (patch) =>
    set((state) =>
      withConfig(state, (d, c) => {
        const next = { ...c.lot, ...patch };
        // Al pasar a medidas propias se parte del lote mínimo que ya cumple,
        // redondeado a múltiplos de 5 m (un poco de margen para crecer).
        if (patch.mode === "manual" && c.lot.mode === "auto") {
          const plan = planSite(c, d);
          const up5 = (v: number) => Math.ceil(v / 5 - 1e-9) * 5;
          if (plan.lotRect && plan.clear) Object.assign(next, { width: up5(plan.lotRect.x1 - plan.lotRect.x0), depth: up5(plan.lotRect.z1 - plan.lotRect.z0), front: plan.clear.front, left: plan.clear.west });
        }
        // Al cambiar de normativa se cargan sus valores.
        if (patch.preset && patch.preset !== c.lot.preset && !patch.rules) next.rules = { ...presetById(patch.preset).rules };
        return normalizeConfig(d, { ...c, lot: next });
      })
    ),
  fitToLot: () => {
    set((state) => withConfig(state, (d, c) => fitToLot(d, c)));
    get().toast("Galpón ajustado al lote y la normativa");
  },
  applyLotLocation: (location, corner, zone) => {
    const before = get().warehouse.config;
    set((state) => ({
      ...withConfig(state, (d, c) => fitToLot(d, normalizeConfig(d, { ...c, lot: { ...c.lot, ...lotPatchFromLocation(location, corner, zone) } }))),
      ui: { ...state.ui, modal: null, tab: "site" },
    }));
    const after = get().warehouse.config;
    const resized = before && after && (before.dimensions.width !== after.dimensions.width || before.dimensions.length !== after.dimensions.length || before.variant !== after.variant);
    const name = location.designacion || "Lote";
    get().toast(`${name} aplicado${zone ? ` · ${zone.zone.label}` : ""}${resized ? ". El galpón se ajustó al lote." : ""}`);
  },
  clearLotLocation: () =>
    set((state) =>
      withConfig(state, (d, c) => normalizeConfig(d, { ...c, lot: { ...c.lot, location: null, ...(c.lot.preset === "cordoba-zona" ? { preset: "custom" } : {}) } }))
    ),
  replaceConfig: (config) => {
    const definition = staticCatalog.get(config.warehouse);
    if (!definition) return;
    set((state) => ({ warehouse: { definitionId: definition.id, config: normalizeConfig(definition, config) }, selection: null, ui: { ...state.ui, stage: state.ui.stage === "catalog" ? "configure" : state.ui.stage } }));
  },
  // Vuelve a los valores iniciales del galpón, pero conserva el lote elegido.
  reset: () => set((state) => withConfig(state, (d, c) => fitToLot(d, normalizeConfig(d, { ...createDefaultConfig(d), lot: structuredClone(c.lot), site: { ...c.site } })))),

  requestCamera: (preset) => set((state) => ({ viewer: { ...state.viewer, camera: { preset, nonce: state.viewer.camera.nonce + 1 } } })),
  setExplode: (explode) => set((state) => ({ viewer: { ...state.viewer, explode } })),
  setScaleReferences: (scaleReferences) => set((state) => ({ viewer: { ...state.viewer, scaleReferences } })),
  toggleHidden: (categories) =>
    set((state) => {
      const hidden = new Set(state.viewer.hidden);
      const allHidden = categories.every((c) => hidden.has(c));
      for (const c of categories) {
        if (allHidden) hidden.delete(c);
        else hidden.add(c);
      }
      return { viewer: { ...state.viewer, hidden: [...hidden], isolated: null } };
    }),
  isolate: (id, categories) =>
    set((state) => ({ viewer: { ...state.viewer, isolated: state.viewer.isolated?.id === id ? null : { id, categories }, hidden: [] } })),
  showAll: () => set((state) => ({ viewer: { ...state.viewer, hidden: [], isolated: null } })),
  setQuality: (quality) => set((state) => ({ viewer: { ...state.viewer, quality } })),
  setGround: (ground) => set((state) => ({ viewer: { ...state.viewer, ground } })),

  setModelState: (model) => set((state) => ({ model: { ...state.model, ...model } })),
  setModelIndex: (index, metadata) => set((state) => ({ model: { ...state.model, index, metadata } })),
  select: (selection) => set({ selection }),

  saveToCompare: (slot) => {
    const config = get().warehouse.config;
    if (!config) return;
    set((state) => ({ compare: { ...state.compare, [slot]: structuredClone(config) } }));
    get().toast(`Configuración guardada como opción ${slot}`);
  },
  clearCompare: () => set({ compare: { A: null, B: null } }),
}));
