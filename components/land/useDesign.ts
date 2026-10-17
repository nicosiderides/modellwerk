"use client";

import { useMemo } from "react";
import { computeDesign, computeContext, type Computed } from "@/core/land/design/compute";
import { LAND_SPECS, GALPON_PRICING } from "@/core/land/design/catalog";
import { costPerM2, extrasCost } from "@/core/land/design/costs";
import { fitLand, planLand } from "@/core/land/design/plan";
import type { LandTypeId } from "@/core/land/design/types";
import { defaultInputs, simulate, type FinanceArea, type FinanceInputs, type FinanceResult } from "@/core/land/finance/finance";
import { GALPON_DEFS, useLand } from "./store";

/** Todo lo calculado del diseño actual (normativa, caja, planta y verificación). */
export function useComputed(): Computed | null {
  const study = useLand((s) => s.study);
  const typeId = useLand((s) => s.typeId);
  const overrides = useLand((s) => s.overrides);
  const design = useLand((s) => s.design);
  return useMemo(() => (study && design ? computeDesign(study, typeId, overrides, design, LAND_SPECS, GALPON_DEFS) : null), [study, typeId, overrides, design]);
}

export const isLandType = (t: string): t is LandTypeId => t === "vivienda" || t === "departamentos" || t === "oficinas";

/** Valor de referencia demo de la tierra por m² de lote (USD). Sólo para arrancar: se pide el real. */
const LAND_REF_PER_M2 = 280;

/** Entradas de la simulación del tipo actual: las guardadas o las de referencia. */
export function useFinance(computed: Computed | null): { inputs: FinanceInputs | null; result: FinanceResult | null; area: FinanceArea | null } {
  const typeId = useLand((s) => s.typeId);
  const saved = useLand((s) => s.finance[typeId]);
  const design = useLand((s) => s.design);
  return useMemo(() => {
    if (!computed || !design) return { inputs: null, result: null, area: null };
    const plan = computed.plan;
    const area: FinanceArea = { built: plan.built, sellable: plan.sellable, lotArea: computed.envelope.lotArea, units: plan.units };
    let extras = 0;
    let ref = { cost: GALPON_PRICING.costPerM2.value, sale: GALPON_PRICING.salePerM2.value, rent: GALPON_PRICING.rentPerM2Month.value, months: GALPON_PRICING.buildMonths, note: GALPON_PRICING.costPerM2.note };
    if (isLandType(typeId) && design.land[typeId]) {
      const spec = LAND_SPECS[typeId];
      const cfg = design.land[typeId]!;
      extras = extrasCost(spec, cfg, plan);
      ref = { cost: costPerM2(spec, cfg), sale: spec.pricing.salePerM2.value, rent: spec.pricing.rentPerM2Month.value, months: spec.pricing.buildMonths, note: spec.pricing.costPerM2.note };
    }
    const base = defaultInputs({ costPerM2: ref.cost, salePerM2: ref.sale, rentPerM2Month: ref.rent, buildMonths: ref.months, land: Math.round((computed.envelope.lotArea * LAND_REF_PER_M2) / 1000) * 1000, extras, note: ref.note, sellable: plan.sellable, units: plan.units });
    // Lo guardado manda, salvo los extras y el costo por m² mientras sigan siendo demo (siguen a la customización).
    let inputs = saved ?? base;
    if (saved) {
      // Escenarios viejos no traen el precio por unidad: se completan con los de referencia.
      const unitDemo = (k: "salePerUnit" | "rentPerUnitMonth") => (!saved[k] || saved[k].status === "demo" ? base[k] : saved[k]);
      inputs = { ...base, ...saved, basis: saved.basis ?? "m2", salePerUnit: unitDemo("salePerUnit"), rentPerUnitMonth: unitDemo("rentPerUnitMonth"), extras: saved.extras.status === "demo" ? base.extras : saved.extras, costPerM2: saved.costPerM2.status === "demo" ? base.costPerM2 : saved.costPerM2 };
    }
    return { inputs, result: simulate(inputs, area), area };
  }, [computed, design, typeId, saved]);
}

/** Escenario con convenio: más superficie y altura (supuestos del usuario), mismo edificio ajustado a la caja ampliada. */
export function useConvenio(computed: Computed | null, inputs: FinanceInputs | null) {
  const study = useLand((s) => s.study);
  const overrides = useLand((s) => s.overrides);
  const typeId = useLand((s) => s.typeId);
  const design = useLand((s) => s.design);
  const convenio = useLand((s) => s.convenio);
  return useMemo(() => {
    if (!convenio.enabled || !computed || !study || !design || !inputs || !isLandType(typeId)) return null;
    const r = computed.rules;
    const extraPct = (convenio.extraFotPct.value ?? 0) / 100;
    const extraH = convenio.extraHeight.value ?? 0;
    const spec = LAND_SPECS[typeId];
    const cfg = design.land[typeId]!;
    const boosted = {
      ...overrides,
      ...(r.fot.value !== null ? { fot: r.fot.value * (1 + extraPct) } : {}),
      ...(r.maxHeight.value !== null ? { maxHeight: r.maxHeight.value + extraH } : {}),
      ...(r.maxFloors.value !== null ? { maxFloors: r.maxFloors.value + Math.round(extraH / spec.building.floorHeight) } : {}),
    };
    const ctx = computeContext(study, typeId, boosted);
    if (!ctx) return null;
    const cfgB = fitLand(spec, { ...cfg, floors: spec.building.dimensions.floors.max }, ctx.ctx);
    const planB = planLand(spec, cfgB, ctx.ctx);
    const extraSellable = Math.max(0, planB.sellable - computed.plan.sellable);
    const contribution = convenio.contributionPct.value === null ? null : (extraSellable * (inputs.salePerM2.value ?? 0) * convenio.contributionPct.value) / 100;
    const area: FinanceArea = { built: planB.built, sellable: planB.sellable, lotArea: computed.envelope.lotArea, units: planB.units };
    const extras = extrasCost(spec, cfgB, planB);
    const inputsB: FinanceInputs = { ...inputs, extras: { ...inputs.extras, value: extras }, other: { ...inputs.other, value: (inputs.other.value ?? 0) + (contribution ?? 0) } };
    return { plan: planB, config: cfgB, envelope: ctx.envelope, result: simulate(inputsB, area), contribution, extraSellable };
  }, [convenio, computed, study, overrides, typeId, design, inputs]);
}
