"use client";

import { create } from "zustand";
import type { Feature, ParcelProps } from "@/core/galpones/geo/idecor";
import { setDimension, selectVariant, normalizeConfig } from "@/core/galpones/configuration";
import { staticCatalog } from "@/core/galpones/catalog";
import type { WarehouseConfig } from "@/core/galpones/types";
import type { ModelCategory } from "@/core/product-engine/types";
import type { CameraPresetId, CameraRequest, SelectionInfo, ViewerQuality } from "@/components/product-viewer/types";
import { composeStudy, fetchLotContext, type LotStudy, type RuleOverrides } from "@/core/land/geo/study";
import { computeContext, defaultGalpon, initialDesign, type DesignState } from "@/core/land/design/compute";
import { planGalpon, planLand } from "@/core/land/design/plan";
import { LAND_SPECS } from "@/core/land/design/catalog";
import type { GalponDesign, LandConfig, LandTypeId } from "@/core/land/design/types";
import type { FinanceInputs, Input } from "@/core/land/finance/finance";
import type { BuildingTypeId, RuleKey, UseStatus } from "@/core/land/types";

/**
 * Memoria de MW Land: el lote estudiado, el tipo de edificio, su diseño y
 * customización, la simulación de inversión, los escenarios guardados y el
 * escenario con convenio.
 */

export type Base = "photo" | "map";
export type Stage = "lote" | "edificio" | "customizar" | "inversion" | "informe";
export type Mode = "simple" | "pro";
export type GroundMode = "photo" | "plan" | "off";

export type ConvenioInputs = { enabled: boolean; extraFotPct: Input; extraHeight: Input; contributionPct: Input };

export type Scenario = {
  id: string;
  name: string;
  savedAt: string;
  nomenclatura: string;
  designacion: string;
  lotArea: number;
  zone: string;
  typeId: BuildingTypeId;
  overrides: RuleOverrides;
  front: number | null;
  design: DesignState;
  finance: FinanceInputs | null;
  summary: { built: number; sellable: number; floors: number; units: number; investment: number; revenue: number; profit: number; irr: number | null; ok: boolean };
};

type ViewerState = {
  camera: CameraRequest;
  explode: boolean;
  hidden: ModelCategory[];
  isolated: ModelCategory[] | null;
  showEnvelope: boolean;
  ground: GroundMode;
  scaleRefs: boolean;
  quality: ViewerQuality;
};

type Toast = { id: number; text: string; tone: "info" | "warn" } | null;

type LandState = {
  study: LotStudy | null;
  error: string | null;
  typeId: BuildingTypeId;
  typeChosen: boolean;
  overrides: RuleOverrides;
  front: number | null;
  base: Base;
  stage: Stage;
  mode: Mode;
  design: DesignState | null;
  viewer: ViewerState;
  selection: SelectionInfo;
  finance: Partial<Record<BuildingTypeId, FinanceInputs>>;
  convenio: ConvenioInputs;
  scenarios: Scenario[];
  toast: Toast;
  load: (parcel: Feature<ParcelProps>) => Promise<void>;
  clear: () => void;
  setError: (error: string | null) => void;
  setType: (id: BuildingTypeId) => void;
  setOverride: (key: RuleKey, value: number | null | undefined) => void;
  resetOverrides: () => void;
  chooseFront: (edge: number) => void;
  setBase: (base: Base) => void;
  goTo: (stage: Stage) => void;
  setMode: (mode: Mode) => void;
  updateLand: (id: LandTypeId, patch: Partial<LandConfig>, opts?: { clamp?: keyof LandConfig }) => void;
  updateGalpon: (patch: Partial<GalponDesign>) => void;
  setGalponDimension: (key: "width" | "length" | "eaveHeight" | "roofSlope", value: number) => void;
  setGalponConfig: (fn: (c: WarehouseConfig) => WarehouseConfig) => void;
  setCamera: (preset: CameraPresetId) => void;
  setViewer: (patch: Partial<ViewerState>) => void;
  toggleHidden: (categories: ModelCategory[]) => void;
  isolate: (categories: ModelCategory[] | null) => void;
  select: (selection: SelectionInfo) => void;
  setFinance: (id: BuildingTypeId, inputs: FinanceInputs | undefined) => void;
  setConvenio: (patch: Partial<ConvenioInputs>) => void;
  saveScenario: (s: Scenario) => void;
  removeScenario: (id: string) => void;
  restoreScenario: (s: Scenario, parcel: Feature<ParcelProps>) => Promise<void>;
  showToast: (text: string, tone?: "info" | "warn") => void;
};

let abort: AbortController | null = null;
const RANK: Record<UseStatus, number> = { si: 0, condicionado: 1, verificar: 2, no: 3 };
const ORDER: BuildingTypeId[] = ["departamentos", "vivienda", "oficinas", "galpon"];
const GALPONES = staticCatalog.list();
const STORAGE = "mw-land:scenarios:v1";

function bestType(study: LotStudy): BuildingTypeId {
  if (!study.zone) return "departamentos";
  const uses = study.zone.uses;
  return [...ORDER].sort((a, b) => RANK[uses[a].status] - RANK[uses[b].status])[0];
}

function readScenarios(): Scenario[] {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE) : null;
    return raw ? (JSON.parse(raw) as Scenario[]) : [];
  } catch {
    return [];
  }
}

function writeScenarios(list: Scenario[]) {
  try {
    window.localStorage.setItem(STORAGE, JSON.stringify(list));
  } catch {
    /* sin almacenamiento: quedan en memoria */
  }
}

const pending = (note: string): Input => ({ value: null, status: "pending", note });
let toastId = 0;

export const useLand = create<LandState>((set, get) => ({
  study: null,
  error: null,
  typeId: "departamentos",
  typeChosen: false,
  overrides: {},
  front: null,
  base: "photo",
  stage: "lote",
  mode: "simple",
  design: null,
  viewer: { camera: { preset: "perspective", nonce: 0 }, explode: false, hidden: [], isolated: null, showEnvelope: true, ground: "photo", scaleRefs: false, quality: "balanced" },
  selection: null,
  finance: {},
  convenio: {
    enabled: false,
    extraFotPct: { value: 30, status: "cargado", note: "Ejemplo para simular: no es un valor de la ordenanza. El aumento real se negocia en cada convenio." },
    extraHeight: { value: 6, status: "cargado", note: "Ejemplo para simular (2 pisos más). Sujeto a aprobación." },
    contributionPct: pending("Aporte al municipio por el mayor aprovechamiento (% del valor del suelo creado). Se define en cada convenio: cargalo cuando lo tengas."),
  },
  scenarios: readScenarios(),
  toast: null,

  load: async (parcel) => {
    abort?.abort();
    const ctrl = new AbortController();
    abort = ctrl;
    set({ study: composeStudy(parcel, null, "loading"), error: null, overrides: {}, front: null, design: null, finance: {}, selection: null });
    try {
      const context = await fetchLotContext(parcel, ctrl.signal);
      if (ctrl.signal.aborted) return;
      const study = composeStudy(parcel, context, context.z8256 || context.z8133 ? "ok" : "none");
      set((s) => ({ study, typeId: s.typeChosen ? s.typeId : bestType(study) }));
    } catch (e) {
      if ((e as Error).name === "AbortError" || ctrl.signal.aborted) return;
      set((s) => ({ study: s.study ? { ...s.study, status: "error" } : null, error: "No pudimos consultar la normativa de este lote. Revisá la conexión y volvé a tocarlo." }));
    }
  },

  clear: () => {
    abort?.abort();
    set({ study: null, error: null, overrides: {}, front: null, design: null, finance: {}, stage: "lote", selection: null });
  },

  setError: (error) => set({ error }),
  setType: (typeId) => set({ typeId, typeChosen: true, selection: null, viewer: { ...get().viewer, hidden: [], isolated: null, explode: false } }),

  setOverride: (key, value) => {
    set((s) => {
      const overrides = { ...s.overrides };
      if (value === undefined) delete overrides[key];
      else overrides[key] = value;
      return { overrides };
    });
    const { study, design } = get();
    if (study && design) set({ design: initialDesign(study, get().overrides, LAND_SPECS, GALPONES, design) });
  },

  resetOverrides: () => {
    set({ overrides: {} });
    const { study, design } = get();
    if (study && design) set({ design: initialDesign(study, {}, LAND_SPECS, GALPONES, design) });
  },

  chooseFront: (edge) => {
    const { study, design, overrides } = get();
    if (!study) return;
    const next = composeStudy(study.parcel, study.context, study.status, edge);
    set({ front: edge, study: next, design: design ? initialDesign(next, overrides, LAND_SPECS, GALPONES, design) : null });
  },

  setBase: (base) => set({ base }),

  goTo: (stage) => {
    const { study, design, overrides } = get();
    if (stage !== "lote" && (!study || study.status !== "ok" || !study.zone)) return;
    if (stage !== "lote" && !design && study) set({ design: initialDesign(study, overrides, LAND_SPECS, GALPONES) });
    set({ stage, selection: null });
  },

  setMode: (mode) => set({ mode }),

  updateLand: (id, patch, opts) => {
    const { study, design, overrides } = get();
    if (!study || !design) return;
    const spec = LAND_SPECS[id];
    const base = computeContext(study, id, overrides);
    const current = design.land[id]!;
    let next: LandConfig = { ...current, ...patch, options: { ...current.options, ...(patch.options ?? {}) } };
    if (base) {
      const before = planLand(spec, current, base.ctx);
      const after = planLand(spec, next, base.ctx);
      const failsBefore = new Set(before.checks.filter((c) => c.status === "fail").map((c) => c.id));
      const newFail = after.checks.find((c) => c.status === "fail" && !failsBefore.has(c.id));
      if (newFail && opts?.clamp) {
        // Igual que en Galpones: lo obligatorio frena. Se busca el máximo valor que cumple.
        const key = opts.clamp;
        const step = key === "floors" ? 1 : key === "width" ? spec.building.dimensions.width.step : spec.building.dimensions.depth.step;
        let value = Number(next[key]);
        const min = key === "floors" ? 1 : 0;
        while (value - step >= min) {
          value = Math.round((value - step) * 100) / 100;
          const trial = { ...next, [key]: value } as LandConfig;
          const p = planLand(spec, trial, base.ctx);
          if (!p.checks.some((c) => c.status === "fail" && !failsBefore.has(c.id))) {
            next = trial;
            break;
          }
        }
        get().showToast(`${newFail.label}: ${newFail.detail} Se frenó en el máximo que cumple.`, "warn");
      } else if (newFail) {
        get().showToast(`Atención — ${newFail.label}: ${newFail.detail}`, "warn");
      }
      const U = base.tiers[0]?.rect;
      if (U) next = { ...next, width: Math.min(next.width, Math.floor((U.x1 - U.x0) * 10) / 10), depth: Math.min(next.depth, Math.floor((U.z1 - U.z0) * 10) / 10) };
      if (patch.floors !== undefined) {
        const p = planLand(spec, next, base.ctx);
        if (p.floors.length < next.floors) {
          next = { ...next, floors: Math.max(1, p.floors.length) };
          get().showToast(`En la caja entran ${p.floors.length} plantas con estas medidas.`, "warn");
        }
      }
    }
    set({ design: { ...design, land: { ...design.land, [id]: next } } });
  },

  updateGalpon: (patch) => {
    const { design } = get();
    if (!design?.galpon) return;
    let galpon = { ...design.galpon, ...patch };
    if (patch.warehouseId && patch.warehouseId !== design.galpon.warehouseId) {
      const def = GALPONES.find((d) => d.id === patch.warehouseId);
      if (def) galpon = { ...defaultGalpon(def), align: galpon.align, front: galpon.front };
    }
    set({ design: { ...design, galpon } });
  },

  setGalponDimension: (key, value) => {
    const { design, study, overrides } = get();
    if (!design?.galpon || !study) return;
    const def = GALPONES.find((d) => d.id === design.galpon!.warehouseId);
    if (!def) return;
    const base = computeContext(study, "galpon", overrides);
    const before = base ? planGalpon(def, design.galpon, base.ctx) : null;
    let config = setDimension(def, design.galpon.config, key, value);
    if (base && before) {
      const failsBefore = new Set(before.checks.filter((c) => c.status === "fail").map((c) => c.id));
      const after = planGalpon(def, { ...design.galpon, config }, base.ctx);
      const newFail = after.checks.find((c) => c.status === "fail" && !failsBefore.has(c.id));
      if (newFail) {
        const range = def.dimensions[key];
        let v = value;
        while (v - range.step >= range.min) {
          v -= range.step;
          const c = setDimension(def, design.galpon.config, key, v);
          const p = planGalpon(def, { ...design.galpon, config: c }, base.ctx);
          if (!p.checks.some((x) => x.status === "fail" && !failsBefore.has(x.id))) {
            config = c;
            break;
          }
        }
        get().showToast(`${newFail.label}: ${newFail.detail} Se frenó en el máximo que cumple.`, "warn");
      }
    }
    set({ design: { ...design, galpon: { ...design.galpon, config } } });
  },

  setGalponConfig: (fn) => {
    const { design } = get();
    if (!design?.galpon) return;
    const def = GALPONES.find((d) => d.id === design.galpon!.warehouseId);
    if (!def) return;
    const raw = fn(design.galpon.config);
    const config = raw.variant !== design.galpon.config.variant && raw.variant ? selectVariant(def, raw, raw.variant) : normalizeConfig(def, raw);
    set({ design: { ...design, galpon: { ...design.galpon, config } } });
  },

  setCamera: (preset) => set((s) => ({ viewer: { ...s.viewer, camera: { preset, nonce: s.viewer.camera.nonce + 1 } } })),
  setViewer: (patch) => set((s) => ({ viewer: { ...s.viewer, ...patch } })),
  toggleHidden: (categories) =>
    set((s) => {
      const all = categories.every((c) => s.viewer.hidden.includes(c));
      const hidden = all ? s.viewer.hidden.filter((c) => !categories.includes(c)) : Array.from(new Set([...s.viewer.hidden, ...categories]));
      return { viewer: { ...s.viewer, hidden } };
    }),
  isolate: (isolated) => set((s) => ({ viewer: { ...s.viewer, isolated } })),
  select: (selection) => set({ selection }),

  setFinance: (id, inputs) =>
    set((s) => {
      const finance = { ...s.finance };
      if (inputs) finance[id] = inputs;
      else delete finance[id];
      return { finance };
    }),
  setConvenio: (patch) => set((s) => ({ convenio: { ...s.convenio, ...patch } })),

  saveScenario: (scenario) => {
    const list = [scenario, ...get().scenarios.filter((x) => x.id !== scenario.id)].slice(0, 24);
    writeScenarios(list);
    set({ scenarios: list });
    get().showToast(`Escenario «${scenario.name}» guardado`);
  },
  removeScenario: (id) => {
    const list = get().scenarios.filter((x) => x.id !== id);
    writeScenarios(list);
    set({ scenarios: list });
  },
  restoreScenario: async (scenario, parcel) => {
    await get().load(parcel);
    let { study } = get();
    if (!study || study.status !== "ok") return;
    if (scenario.front !== null) {
      study = composeStudy(study.parcel, study.context, study.status, scenario.front);
      set({ study, front: scenario.front });
    }
    set({ overrides: scenario.overrides, typeId: scenario.typeId, typeChosen: true, design: scenario.design, finance: scenario.finance ? { [scenario.typeId]: scenario.finance } : {}, stage: "edificio" });
  },

  showToast: (text, tone = "info") => {
    toastId += 1;
    const id = toastId;
    set({ toast: { id, text, tone } });
    window.setTimeout(() => get().toast?.id === id && set({ toast: null }), 4200);
  },
}));

export const GALPON_DEFS = GALPONES;
