"use client";

import { create } from "zustand";
import type { MetadataIndex } from "@/core/product-engine/metadata";
import type { ModelCategory, ModelMetadataDocument } from "@/core/product-engine/types";
import { staticCatalog } from "@/core/galpones/catalog";
import { createDefaultConfig, normalizeConfig, selectVariant, setDimension } from "@/core/galpones/configuration";
import type { DimensionKey, Openings, StructureSystemId, WarehouseConfig, WarehouseDefinition } from "@/core/galpones/types";
import type { CameraPresetId, CameraRequest, ModelLoadState, SelectionInfo, ViewerQuality } from "@/components/product-viewer/types";

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
export type ConfigTab = "dimensions" | "structure" | "envelope" | "openings" | "options";
export type Modal = null | "quote" | "saved" | "compare";

type WarehouseState = { definitionId: string | null; config: WarehouseConfig | null };
type ViewerState = {
  camera: CameraRequest;
  explode: boolean;
  scaleReferences: boolean;
  hidden: ModelCategory[];
  isolated: { id: string; categories: ModelCategory[] } | null;
  quality: ViewerQuality;
};
type ModelState = ModelLoadState & { index: MetadataIndex | null; metadata: ModelMetadataDocument | null };
type UiState = { stage: Stage; tab: ConfigTab; modal: Modal; panelOpen: boolean; toast: { id: number; text: string } | null };
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
  toast: (text: string) => void;

  // configuración
  setDimension: (key: DimensionKey, value: number) => void;
  setVariant: (variantId: string) => void;
  setStructure: (id: StructureSystemId) => void;
  setStructureFinish: (id: string) => void;
  setEnvelope: (patch: Partial<WarehouseConfig["envelope"]>) => void;
  setOpenings: (patch: Partial<Openings>) => void;
  toggleOption: (id: string, on: boolean) => void;
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
  viewer: { camera: { preset: "perspective", nonce: 0 }, explode: false, scaleReferences: true, hidden: [], isolated: null, quality: "balanced" },
  model: { status: "idle", progress: 0, index: null, metadata: null },
  ui: { stage: "catalog", tab: "dimensions", modal: null, panelOpen: true, toast: null },
  selection: null,
  compare: { A: null, B: null },

  openWarehouse: (id, config) => {
    const definition = staticCatalog.get(id);
    if (!definition) return;
    const next = config ? normalizeConfig(definition, config) : createDefaultConfig(definition);
    set((state) => ({
      warehouse: { definitionId: id, config: next },
      ui: { ...state.ui, stage: "configure", tab: "dimensions", modal: null, panelOpen: true },
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
  toast: (text) => {
    toastId += 1;
    const id = toastId;
    set((state) => ({ ui: { ...state.ui, toast: { id, text } } }));
    window.setTimeout(() => {
      if (get().ui.toast?.id === id) set((state) => ({ ui: { ...state.ui, toast: null } }));
    }, 2800);
  },

  setDimension: (key, value) => set((state) => withConfig(state, (d, c) => setDimension(d, c, key, value))),
  setVariant: (variantId) => set((state) => ({ ...withConfig(state, (d, c) => selectVariant(d, c, variantId)), selection: null })),
  setStructure: (id) => set((state) => ({ ...withConfig(state, (d, c) => normalizeConfig(d, { ...c, structure: id })), selection: null })),
  setStructureFinish: (id) => set((state) => withConfig(state, (d, c) => normalizeConfig(d, { ...c, structureFinish: id }))),
  setEnvelope: (patch) => set((state) => withConfig(state, (d, c) => normalizeConfig(d, { ...c, envelope: { ...c.envelope, ...patch } }))),
  setOpenings: (patch) => set((state) => ({ ...withConfig(state, (d, c) => normalizeConfig(d, { ...c, openings: { ...c.openings, ...patch } })), selection: null })),
  toggleOption: (id, on) => set((state) => ({ ...withConfig(state, (d, c) => normalizeConfig(d, { ...c, options: { ...c.options, [id]: on } })), selection: null })),
  replaceConfig: (config) => {
    const definition = staticCatalog.get(config.warehouse);
    if (!definition) return;
    set((state) => ({ warehouse: { definitionId: definition.id, config: normalizeConfig(definition, config) }, selection: null, ui: { ...state.ui, stage: state.ui.stage === "catalog" ? "configure" : state.ui.stage } }));
  },
  reset: () => set((state) => withConfig(state, (d) => createDefaultConfig(d))),

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
