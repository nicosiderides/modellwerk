"use client";

import { ArrowLeft, ArrowRight, CircleAlert, CircleCheck, CircleX, AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import { NumberField, ChoiceCard } from "@/components/galpones/controls";
import { formatNumber } from "@/core/galpones/metrics";
import { getVariant, isDiscrete, ridgeHeight } from "@/core/galpones/configuration";
import { BUILDING_TYPES } from "@/core/land/buildingTypes";
import { LAND_SPECS } from "@/core/land/design/catalog";
import type { Align, LandTypeId } from "@/core/land/design/types";
import { rectD, rectW } from "@/core/land/design/usable";
import type { PlanCheck } from "@/core/land/design/plan";
import type { UseStatus } from "@/core/land/types";
import { GALPON_DEFS, useLand } from "./store";
import { isLandType, useComputed } from "./useDesign";

/**
 * Paso 02 · Edificio: tipo y tamaño dentro de la caja máxima.
 * Igual que en Galpones, lo obligatorio frena y lo recomendable avisa.
 */

const m2 = (v: number) => `${formatNumber(Math.round(v))} m²`;
const USE: Record<UseStatus, string> = { si: "Permitido", condicionado: "Con condiciones", verificar: "A verificar", no: "No previsto" };

export function Checks({ checks }: { checks: PlanCheck[] }) {
  return (
    <ul className="ld-checks">
      {checks.map((c) => (
        <li key={c.id} className={`is-${c.status}`}>
          {c.status === "ok" ? <CircleCheck aria-hidden /> : c.status === "warn" ? <CircleAlert aria-hidden /> : <CircleX aria-hidden />}
          <span>
            <strong>{c.label}</strong> {c.detail}
          </span>
        </li>
      ))}
    </ul>
  );
}

function AlignPicker({ value, onChange }: { value: Align; onChange: (a: Align) => void }) {
  const items: { id: Align; label: string; icon: typeof AlignLeft }[] = [
    { id: "left", label: "Izquierda", icon: AlignLeft },
    { id: "center", label: "Centro", icon: AlignCenter },
    { id: "right", label: "Derecha", icon: AlignRight },
  ];
  return (
    <div className="gp-field">
      <span className="gp-label">Ubicación en el lote</span>
      <div className="gp-segmented" role="radiogroup" aria-label="Ubicación en el lote">
        {items.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="radio" aria-checked={value === id} className={value === id ? "is-selected" : ""} onClick={() => onChange(id)}>
            <Icon aria-hidden /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TypeTabs() {
  const study = useLand((s) => s.study);
  const typeId = useLand((s) => s.typeId);
  const setType = useLand((s) => s.setType);
  const uses = study?.zone?.uses;
  return (
    <div className="ld-typetabs" role="tablist" aria-label="Tipo de edificio">
      {BUILDING_TYPES.map((t) => {
        const st = uses?.[t.id].status ?? "verificar";
        return (
          <button key={t.id} type="button" role="tab" aria-selected={typeId === t.id} className={`ld-typetab is-${st} ${typeId === t.id ? "is-on" : ""}`} onClick={() => setType(t.id)} title={uses?.[t.id].text}>
            <span>{t.short}</span>
            <em>{USE[st]}</em>
          </button>
        );
      })}
    </div>
  );
}

function LandSize({ id }: { id: LandTypeId }) {
  const cfg = useLand((s) => s.design?.land[id]);
  const update = useLand((s) => s.updateLand);
  const computed = useComputed();
  const spec = LAND_SPECS[id];
  if (!cfg || !computed) return null;
  const U = computed.usable;
  const d = spec.building.dimensions;
  return (
    <section className="gp-section">
      <div className="gp-grid-2">
        <NumberField label="Ancho (frente)" unit="m" value={cfg.width} min={d.width.min} max={d.width.max} step={d.width.step} cap={U ? Math.floor(rectW(U) * 10) / 10 : null} capNote="lugar disponible" onChange={(v) => update(id, { width: v }, { clamp: "width" })} />
        <NumberField label="Fondo" unit="m" value={cfg.depth} min={d.depth.min} max={d.depth.max} step={d.depth.step} cap={U ? Math.floor(rectD(U) * 10) / 10 : null} capNote="lugar disponible" onChange={(v) => update(id, { depth: v }, { clamp: "depth" })} />
      </div>
      <NumberField label="Plantas" value={cfg.floors} min={d.floors.min} max={d.floors.max} step={1} decimals={0} cap={computed.envelope.floors < d.floors.max ? computed.envelope.floors : null} capNote="entran en la caja" hint={`Planta baja de ${formatNumber(spec.building.groundHeight, 1)} m y pisos de ${formatNumber(spec.building.floorHeight, 1)} m.`} onChange={(v) => update(id, { floors: Math.round(v) }, { clamp: "floors" })} />
      <AlignPicker value={cfg.align} onChange={(a) => update(id, { align: a })} />
      <NumberField label="Retiro extra desde el frente" unit="m" value={cfg.front} min={0} max={U ? Math.max(0, Math.floor((rectD(U) - cfg.depth) * 10) / 10) : 0} step={0.5} hint={id === "vivienda" ? "Jardín de frente." : "Corre el edificio hacia el fondo."} onChange={(v) => update(id, { front: v })} />
    </section>
  );
}

function GalponSize() {
  const gd = useLand((s) => s.design?.galpon);
  const updateGalpon = useLand((s) => s.updateGalpon);
  const setDim = useLand((s) => s.setGalponDimension);
  const setConfig = useLand((s) => s.setGalponConfig);
  const computed = useComputed();
  if (!gd || !computed) return null;
  const def = GALPON_DEFS.find((d) => d.id === gd.warehouseId)!;
  const dims = gd.config.dimensions;
  const r = def.dimensions;
  const U = computed.usable;
  return (
    <section className="gp-section">
      <div className="ld-choices">
        {GALPON_DEFS.map((d) => (
          <ChoiceCard key={d.id} selected={d.id === gd.warehouseId} title={d.name} summary={`${d.structuralSystemLabel} · luz ${d.dimensions.width.min}–${d.dimensions.width.max} m`} onSelect={() => updateGalpon({ warehouseId: d.id })} />
        ))}
      </div>
      {isDiscrete(def) && def.model.strategy === "discreteVariant" ? (
        <div className="ld-choices">
          {def.model.variants.map((v) => (
            <ChoiceCard key={v.id} selected={getVariant(def, gd.config.variant)?.id === v.id} title={v.label} summary={`${v.dimensions.width} × ${v.dimensions.length} m · modelo BIM`} onSelect={() => setConfig((c) => ({ ...c, variant: v.id }))} />
          ))}
        </div>
      ) : (
        <>
          <div className="gp-grid-2">
            <NumberField label="Luz (ancho)" unit="m" value={dims.width} min={r.width.min} max={r.width.max} step={r.width.step} cap={U ? Math.floor(rectW(U)) : null} capNote="lugar disponible" onChange={(v) => setDim("width", v)} />
            <NumberField label="Largo" unit="m" value={dims.length} min={r.length.min} max={r.length.max} step={dims.baySpacing} cap={U ? Math.floor(rectD(U)) : null} capNote="lugar disponible" onChange={(v) => setDim("length", v)} />
          </div>
          <div className="gp-grid-2">
            <NumberField label="Altura de alero" unit="m" value={dims.eaveHeight} min={r.eaveHeight.min} max={r.eaveHeight.max} step={r.eaveHeight.step} onChange={(v) => setDim("eaveHeight", v)} />
            <NumberField label="Pendiente" unit="%" value={dims.roofSlope} min={r.roofSlope.min} max={r.roofSlope.max} step={r.roofSlope.step} decimals={0} hint={`Cumbrera ${formatNumber(ridgeHeight(dims), 2)} m`} onChange={(v) => setDim("roofSlope", v)} />
          </div>
        </>
      )}
      <AlignPicker value={gd.align} onChange={(a) => updateGalpon({ align: a })} />
      <NumberField label="Corrimiento hacia el fondo" unit="m" value={gd.front} min={0} max={U ? Math.max(0, Math.floor(rectD(U) - dims.length)) : 0} step={1} hint="Deja playón de maniobras al frente." onChange={(v) => updateGalpon({ front: v })} />
    </section>
  );
}

export function PlanSummary() {
  const computed = useComputed();
  const typeId = useLand((s) => s.typeId);
  if (!computed) return null;
  const p = computed.plan;
  return (
    <section className="ld-plansum" aria-label="Resumen del edificio">
      <div>
        <span>Superficie cubierta</span>
        <strong>{m2(p.built)}</strong>
      </div>
      <div>
        <span>{typeId === "galpon" ? "Nave" : "Vendible"}</span>
        <strong>{m2(p.sellable)}</strong>
      </div>
      <div>
        <span>Plantas</span>
        <strong>{p.floors.length}</strong>
      </div>
      <div>
        <span>{typeId === "departamentos" ? "Deptos." : typeId === "oficinas" ? (p.unitsLabel === "plantas libres" ? "Plantas libres" : "Oficinas") : "Altura"}</span>
        <strong>{typeId === "departamentos" || typeId === "oficinas" ? p.units : `${formatNumber(p.height, 1)} m`}</strong>
      </div>
    </section>
  );
}

export function DesignPanel() {
  const typeId = useLand((s) => s.typeId);
  const goTo = useLand((s) => s.goTo);
  const study = useLand((s) => s.study);
  const mode = useLand((s) => s.mode);
  const computed = useComputed();
  const use = study?.zone?.uses[typeId];
  const type = BUILDING_TYPES.find((t) => t.id === typeId)!;
  const failing = computed?.plan.checks.filter((c) => c.status === "fail") ?? [];
  return (
    <aside className="gp-panel gp-panel--config ld-panel" aria-label="Edificio">
      <header className="gp-panel__head">
        <div>
          <p className="ld-kicker">Paso 02 · Edificio</p>
          <h2>{type.name}</h2>
        </div>
      </header>
      <div className="gp-panel__body">
        <TypeTabs />
        {use && (
          <p className={`ld-usebar is-${use.status}`}>
            {use.status === "si" ? <CircleCheck aria-hidden /> : use.status === "no" ? <CircleX aria-hidden /> : <CircleAlert aria-hidden />} {use.text}
          </p>
        )}
        <PlanSummary />
        {failing.length > 0 && (
          <div className="ld-failbox">
            <Checks checks={failing} />
          </div>
        )}
        {isLandType(typeId) ? <LandSize id={typeId} /> : <GalponSize />}
        {computed && mode === "pro" && (
          <section className="ld-block">
            <h3>Verificación de la normativa</h3>
            <Checks checks={computed.plan.checks} />
          </section>
        )}
        {computed && mode === "simple" && failing.length === 0 && (
          <p className="ld-okline">
            <CircleCheck aria-hidden /> Cumple la normativa de la zona (FOS, FOT, altura y retiros).
          </p>
        )}
      </div>
      <footer className="gp-panel__foot gp-panel__nav">
        <button type="button" className="gp-button" onClick={() => goTo("lote")}>
          <ArrowLeft aria-hidden /> Lote
        </button>
        <button type="button" className="gp-button gp-button--primary" onClick={() => goTo("customizar")}>
          Customizar <ArrowRight aria-hidden />
        </button>
      </footer>
    </aside>
  );
}
