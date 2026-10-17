import type { BuildingPlan } from "./plan.ts";
import type { LandConfig, LandSpec, OptionData } from "./types.ts";

/**
 * Costos de demostración que salen de la customización: costo por m² según
 * estructura y envolvente, y extras por cada opción. Todo marcado "demo".
 */

export function costPerM2(spec: LandSpec, cfg: LandConfig) {
  const s = spec.structure.systems.find((x) => x.id === cfg.structure)?.costFactor ?? 1;
  const f = spec.envelope.facades.find((x) => x.id === cfg.facade)?.costFactor ?? 1;
  const r = spec.envelope.roofs.find((x) => x.id === cfg.roof)?.costFactor ?? 1;
  return Math.round(spec.pricing.costPerM2.value * s * f * r);
}

export function optionCost(o: OptionData, plan: BuildingPlan) {
  if (o.cost.kind === "fixed") return o.cost.value;
  if (o.cost.kind === "fixed-per-floor") return o.cost.value * Math.max(0, plan.floors.length - 1);
  return o.cost.value * plan.built;
}

export function extrasCost(spec: LandSpec, cfg: LandConfig, plan: BuildingPlan) {
  return spec.options.options.filter((o) => cfg.options[o.id]).reduce((s, o) => s + optionCost(o, plan), 0);
}

/** Memoria descriptiva: textos de cada elección (para la ficha técnica y el informe). */
export function memory(spec: LandSpec, cfg: LandConfig): { title: string; text: string }[] {
  const s = spec.structure.systems.find((x) => x.id === cfg.structure);
  const f = spec.envelope.facades.find((x) => x.id === cfg.facade);
  const r = spec.envelope.roofs.find((x) => x.id === cfg.roof);
  const g = spec.envelope.glazing.find((x) => x.id === cfg.glazing);
  const out = [
    s && { title: `Estructura: ${s.name}`, text: s.memoryText },
    f && { title: `Fachada: ${f.name}`, text: f.memoryText },
    r && { title: `Cubierta: ${r.name}`, text: r.memoryText },
    g && { title: `Aberturas: ${g.name}`, text: g.memoryText },
    ...spec.options.options.filter((o) => cfg.options[o.id]).map((o) => ({ title: o.name, text: o.memoryText })),
  ];
  return out.filter((x): x is { title: string; text: string } => Boolean(x));
}
