"use client";

import { create } from "zustand";
import type { Feature, ParcelProps } from "@/core/galpones/geo/idecor";
import { composeStudy, fetchLotContext, type LotStudy, type RuleOverrides } from "@/core/land/geo/study";
import type { BuildingTypeId, RuleKey, UseStatus } from "@/core/land/types";

/**
 * Memoria de MW Land (Fase 1): el lote estudiado, el tipo de edificio con el
 * que se mira la caja y los valores normativos que cargó el usuario.
 */

export type Base = "photo" | "map";

type LandState = {
  study: LotStudy | null;
  error: string | null;
  typeId: BuildingTypeId;
  /** El usuario eligió el tipo a mano (no se cambia solo al elegir otro lote). */
  typeChosen: boolean;
  overrides: RuleOverrides;
  /** Lado elegido como frente (índice del contorno); null = automático. */
  front: number | null;
  base: Base;
  load: (parcel: Feature<ParcelProps>) => Promise<void>;
  clear: () => void;
  setError: (error: string | null) => void;
  setType: (id: BuildingTypeId) => void;
  setOverride: (key: RuleKey, value: number | null | undefined) => void;
  resetOverrides: () => void;
  chooseFront: (edge: number) => void;
  setBase: (base: Base) => void;
};

let abort: AbortController | null = null;

const RANK: Record<UseStatus, number> = { si: 0, condicionado: 1, verificar: 2, no: 3 };
const ORDER: BuildingTypeId[] = ["departamentos", "vivienda", "oficinas", "galpon"];

/** Tipo con el que conviene mirar la caja: el más permitido, priorizando departamentos. */
function bestType(study: LotStudy): BuildingTypeId {
  if (!study.zone) return "departamentos";
  const uses = study.zone.uses;
  return [...ORDER].sort((a, b) => RANK[uses[a].status] - RANK[uses[b].status])[0];
}

export const useLand = create<LandState>((set, get) => ({
  study: null,
  error: null,
  typeId: "departamentos",
  typeChosen: false,
  overrides: {},
  front: null,
  base: "photo",

  load: async (parcel) => {
    abort?.abort();
    const ctrl = new AbortController();
    abort = ctrl;
    set({ study: composeStudy(parcel, null, "loading"), error: null, overrides: {}, front: null });
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
    set({ study: null, error: null, overrides: {}, front: null });
  },

  setError: (error) => set({ error }),

  setType: (typeId) => set({ typeId, typeChosen: true }),

  setOverride: (key, value) =>
    set((s) => {
      const overrides = { ...s.overrides };
      if (value === undefined) delete overrides[key];
      else overrides[key] = value;
      return { overrides };
    }),

  resetOverrides: () => set({ overrides: {} }),

  chooseFront: (edge) => {
    const { study } = get();
    if (!study) return;
    set({ front: edge, study: composeStudy(study.parcel, study.context, study.status, edge) });
  },

  setBase: (base) => set({ base }),
}));
