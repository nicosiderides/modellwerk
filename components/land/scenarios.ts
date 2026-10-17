"use client";

import { useCallback } from "react";
import { decodeFromUrl, encodeForUrl } from "@/core/product-engine/serialization";
import { parcelByNomenclature } from "@/core/galpones/geo/idecor";
import type { DesignState } from "@/core/land/design/compute";
import type { FinanceInputs } from "@/core/land/finance/finance";
import type { RuleOverrides } from "@/core/land/geo/study";
import type { BuildingTypeId } from "@/core/land/types";
import { captureLandSnapshot } from "./LandViewer";
import { useLand, type Scenario } from "./store";
import { useComputed, useFinance } from "./useDesign";

/** Guardar escenarios, compartirlos por enlace y abrir un enlace compartido. */

const TYPE_NAMES: Record<BuildingTypeId, string> = { vivienda: "Vivienda", departamentos: "Departamentos", oficinas: "Oficinas", galpon: "Galpón" };

/** Arma el escenario actual (id y fecha se ponen al guardar). */
export function useCurrentScenario(): Scenario | null {
  const study = useLand((s) => s.study);
  const typeId = useLand((s) => s.typeId);
  const overrides = useLand((s) => s.overrides);
  const front = useLand((s) => s.front);
  const design = useLand((s) => s.design);
  const computed = useComputed();
  const { inputs, result } = useFinance(computed);
  if (!study || !design || !computed) return null;
  const p = study.parcel.properties;
  const plan = computed.plan;
  return {
    id: `${p.Nomenclatura}-${typeId}`,
    name: `${TYPE_NAMES[typeId]} · ${String(p.desig_oficial ?? p.Nomenclatura ?? "lote").trim()} · ${plan.floors.length} pl.`,
    savedAt: "",
    nomenclatura: String(p.Nomenclatura ?? ""),
    designacion: String(p.desig_oficial ?? "").trim(),
    lotArea: computed.envelope.lotArea,
    zone: study.zone?.label ?? "",
    typeId,
    overrides,
    front,
    design,
    finance: inputs,
    summary: { built: plan.built, sellable: plan.sellable, floors: plan.floors.length, units: plan.units, investment: result?.investment ?? 0, revenue: result?.revenue ?? 0, profit: result?.profit ?? 0, irr: result?.irr ?? null, ok: plan.ok },
  };
}

/** Achica la captura del visor a una miniatura JPEG (para que entren varios escenarios en el navegador). */
export function thumbnail(dataUrl: string | null, width = 360): Promise<string | undefined> {
  if (!dataUrl) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const k = width / img.width;
        const c = document.createElement("canvas");
        c.width = width;
        c.height = Math.round(img.height * k);
        const ctx = c.getContext("2d");
        if (!ctx) return resolve(undefined);
        ctx.fillStyle = "#1c1f21";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.72));
      } catch {
        resolve(undefined);
      }
    };
    img.onerror = () => resolve(undefined);
    img.src = dataUrl;
  });
}

export function useSaveScenario() {
  const current = useCurrentScenario();
  const save = useLand((s) => s.saveScenario);
  return useCallback(async () => {
    if (current) {
      const now = new Date();
      const image = await thumbnail(captureLandSnapshot());
      save({ ...current, id: `${current.id}-${now.getTime()}`, savedAt: now.toISOString(), ...(image ? { image } : {}) });
    }
  }, [current, save]);
}

/** Abre un escenario guardado: busca el lote en el catastro y aplica el diseño. */
export async function openScenario(s: Scenario) {
  const parcel = await parcelByNomenclature(s.nomenclatura).catch(() => null);
  if (!parcel) return false;
  await useLand.getState().restoreScenario(s, parcel);
  const { study, design, overrides } = useLand.getState();
  if (study && design) {
    const { initialDesign } = await import("@/core/land/design/compute");
    const { LAND_SPECS } = await import("@/core/land/design/catalog");
    const { GALPON_DEFS } = await import("./store");
    useLand.setState({ design: initialDesign(study, overrides, LAND_SPECS, GALPON_DEFS, design) });
  }
  return true;
}

type ShareCode = { v: 1; n: string; t: BuildingTypeId; o: RuleOverrides; f: number | null; d: DesignState; fi: FinanceInputs | null };

export function shareLink(s: Scenario) {
  const code: ShareCode = { v: 1, n: s.nomenclatura, t: s.typeId, o: s.overrides, f: s.front, d: { land: s.typeId === "galpon" ? {} : { [s.typeId]: s.design.land[s.typeId as Exclude<BuildingTypeId, "galpon">] }, galpon: s.typeId === "galpon" ? s.design.galpon : null }, fi: s.finance };
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("e", encodeForUrl(code));
  return url.toString();
}

/** Abre un escenario compartido (?e=…): busca el lote en el catastro y aplica el diseño. */
export async function openShared(code: string) {
  const data = decodeFromUrl<ShareCode>(code);
  if (!data || data.v !== 1 || !data.n) return false;
  const scenario: Scenario = {
    id: `link-${Date.now()}`,
    name: "Escenario compartido",
    savedAt: new Date().toISOString(),
    nomenclatura: data.n,
    designacion: "",
    lotArea: 0,
    zone: "",
    typeId: data.t,
    overrides: data.o ?? {},
    front: data.f ?? null,
    design: data.d,
    finance: data.fi,
    summary: { built: 0, sellable: 0, floors: 0, units: 0, investment: 0, revenue: 0, profit: 0, irr: null, ok: true },
  };
  // El diseño compartido trae sólo el tipo elegido: los demás se arman solos al abrirlo.
  if (!(await openScenario(scenario))) return false;
  return true;
}
