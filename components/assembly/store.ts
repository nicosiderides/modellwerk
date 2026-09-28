"use client";

import { create } from "zustand";
import { createDemoProject } from "@/core/assembly/demo";
import { buildSchedule, moveInSequence, autoPlan } from "@/core/assembly/engine";
import type { Project, Vec3 } from "@/core/assembly/types";

export type Mode = "ASSEMBLY" | "PLAN" | "LOGISTICS" | "CRANE" | "TIMELINE" | "DEPENDENCIES" | "SIMULATION";
type AssemblyStore = {
  project: Project; time: number; playing: boolean; speed: number;
  selectedId: string | null; mode: Mode; view: "iso" | "top" | "front";
  structure: boolean; transparent: boolean; showLabels: boolean;
  hiddenIds: string[]; isolatedId: string | null; notice: string;
  setTime: (time: number) => void; togglePlay: () => void;
  setSpeed: (speed: number) => void; select: (id: string | null) => void;
  setMode: (mode: Mode) => void; setView: (view: "iso" | "top" | "front") => void;
  toggle: (key: "structure" | "transparent" | "showLabels") => void;
  hide: (id: string) => void; isolate: (id: string) => void; showAll: () => void;
  move: (id: string, beforeId: string) => void; plan: () => void;
  moveCrane: (position: Vec3) => void; setCrane: (key: "radius" | "capacity" | "height", value: number) => void;
  setModule: (id: string, key: "weight" | "liftMinutes" | "fixMinutes", value: number) => void;
  load: (project: Project) => void; notify: (message: string) => void;
};

const demo = createDemoProject();
const preview = buildSchedule(demo).items[15];

export const useAssembly = create<AssemblyStore>((set, get) => ({
  project: demo, time: preview ? preview.liftStart + 3 : 0,
  selectedId: preview?.moduleId ?? demo.modules[0]?.id ?? null,
  playing: false, speed: 30, mode: "ASSEMBLY", view: "iso",
  structure: false, transparent: false, showLabels: false,
  hiddenIds: [], isolatedId: null, notice: "",
  setTime: (time) => set({ time: Math.max(0, Math.min(time, buildSchedule(get().project).duration)), playing: false }),
  togglePlay: () => set((s) => ({ playing: !s.playing, time: s.time >= buildSchedule(s.project).duration ? 0 : s.time })),
  setSpeed: (speed) => set({ speed }), select: (selectedId) => set({ selectedId }),
  setMode: (mode) => set((s) => ({ mode, view: mode === "PLAN" || mode === "LOGISTICS" ? "top" : s.view })),
  setView: (view) => set({ view }),
  toggle: (key) => set((s) => ({ [key]: !s[key] })),
  hide: (id) => set((s) => ({ hiddenIds: s.hiddenIds.includes(id) ? s.hiddenIds.filter((v) => v !== id) : [...s.hiddenIds, id] })),
  isolate: (id) => set((s) => ({ isolatedId: s.isolatedId === id ? null : id })),
  showAll: () => set({ hiddenIds: [], isolatedId: null }),
  move: (id, beforeId) => {
    const result = moveInSequence(get().project, id, beforeId);
    set(result.error ? { notice: result.error } : { project: result.project, playing: false, time: 0, notice: "Secuencia actualizada. Cronograma recalculado." });
  },
  plan: () => { set({ project: autoPlan(get().project), time: 0, playing: false, notice: "Secuencia preliminar propuesta: dependencias y recorrido de grúa." }); },
  moveCrane: (position) => set((s) => ({ project: { ...s.project, cranes: s.project.cranes.map((c, i) => i ? c : { ...c, position }) }, playing: false })),
  setCrane: (key, value) => { if (!Number.isFinite(value) || value <= 0 || value > 10000) { set({ notice: "El valor debe ser mayor que cero y no superar 10000." }); return; } set((s) => ({ project: { ...s.project, cranes: s.project.cranes.map((c, i) => i ? c : { ...c, [key]: value }) }, playing: false })); },
  setModule: (id, key, value) => { if (!Number.isFinite(value) || value <= 0 || value > 10000) { set({ notice: "El valor debe ser mayor que cero y no superar 10000." }); return; } set((s) => ({ project: { ...s.project, modules: s.project.modules.map((m) => m.id === id ? { ...m, [key]: value } : m) }, playing: false, time: 0 })); },
  load: (project) => set({ project, time: 0, playing: false, selectedId: project.sequence[0] ?? null, hiddenIds: [], isolatedId: null }),
  notify: (notice) => set({ notice }),
}));
