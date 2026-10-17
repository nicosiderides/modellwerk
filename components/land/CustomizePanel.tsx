"use client";

import { ArrowLeft, ArrowRight, FileText } from "lucide-react";
import { ChoiceCard, Stepper, Swatches, Toggle } from "@/components/galpones/controls";
import { formatNumber } from "@/core/galpones/metrics";
import { isDiscrete, openingLimits } from "@/core/galpones/configuration";
import { LAND_SPECS } from "@/core/land/design/catalog";
import { costPerM2, optionCost } from "@/core/land/design/costs";
import type { LandTypeId } from "@/core/land/design/types";
import { Checks, PlanSummary, TypeTabs } from "./DesignPanel";
import { GALPON_DEFS, useLand } from "./store";
import { isLandType, useComputed } from "./useDesign";

/**
 * Paso 03 · Customizar: la misma experiencia que Galpones (estructura,
 * envolvente, aberturas, opciones), para los cuatro tipos. Cada elección
 * mueve los costos (demo) y la normativa sigue vigilando.
 */

const usd = (v: number) => `USD ${formatNumber(Math.round(v))}`;
const pctBadge = (k?: number) => (k && Math.abs(k - 1) > 0.001 ? `${k > 1 ? "+" : "−"}${Math.round(Math.abs(k - 1) * 100)} %` : undefined);

function Section({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="ld-block">
      <h3>{title}</h3>
      {note && <p className="ld-muted">{note}</p>}
      {children}
    </section>
  );
}

function LandCustomize({ id }: { id: LandTypeId }) {
  const spec = LAND_SPECS[id];
  const cfg = useLand((s) => s.design?.land[id]);
  const update = useLand((s) => s.updateLand);
  const computed = useComputed();
  if (!cfg || !computed) return null;
  const env = spec.envelope;
  const facade = env.facades.find((f) => f.id === cfg.facade);
  return (
    <>
      <p className="ld-costline">
        Costo de obra de referencia: <strong>{usd(costPerM2(spec, cfg))}/m²</strong> <span className="ld-badge is-falta">demo</span>
      </p>
      <Section title="Estructura">
        <div className="ld-choices">
          {spec.structure.systems.map((s) => (
            <ChoiceCard key={s.id} selected={cfg.structure === s.id} title={s.name} summary={s.memoryText} badge={pctBadge(s.costFactor)} onSelect={() => update(id, { structure: s.id })} />
          ))}
        </div>
      </Section>
      <Section title="Fachada">
        <div className="ld-choices">
          {env.facades.map((f) => (
            <ChoiceCard key={f.id} selected={cfg.facade === f.id} title={f.name} summary={f.memoryText} badge={pctBadge(f.costFactor)} onSelect={() => update(id, { facade: f.id })} />
          ))}
        </div>
        {!facade?.look.color && <Swatches label={facade?.id === "muro-cortina" ? "Color de antepechos" : "Color de fachada"} colors={env.colors} value={cfg.facadeColor} onChange={(v) => update(id, { facadeColor: v })} />}
        <Swatches label="Color de acento (parapetos, tabiques)" colors={env.colors} value={cfg.accentColor} onChange={(v) => update(id, { accentColor: v })} />
        <Swatches label="Carpinterías" colors={env.frames} value={cfg.frameColor} onChange={(v) => update(id, { frameColor: v })} />
      </Section>
      <Section title="Aberturas">
        <div className="ld-choices">
          {env.glazing.map((g) => (
            <ChoiceCard key={g.id} selected={cfg.glazing === g.id} title={g.name} summary={g.memoryText} onSelect={() => update(id, { glazing: g.id })} />
          ))}
        </div>
      </Section>
      {env.roofs.length > 1 && (
        <Section title="Cubierta">
          <div className="ld-choices">
            {env.roofs.map((r) => (
              <ChoiceCard key={r.id} selected={cfg.roof === r.id} title={r.name} summary={r.memoryText} badge={pctBadge(r.costFactor)} onSelect={() => update(id, { roof: r.id, options: r.id !== "plana" ? { terraza: false, solar: cfg.options.solar } : {} })} />
            ))}
          </div>
        </Section>
      )}
      <Section title="Opciones" note="Los costos son de referencia (demo) y se suman a la simulación de inversión.">
        <div className="ld-toggles">
          {spec.options.options.map((o) => {
            const blocked = o.requires?.roof && cfg.roof !== o.requires.roof;
            return <Toggle key={o.id} label={o.name} summary={o.memoryText} checked={Boolean(cfg.options[o.id]) && !blocked} disabled={Boolean(blocked)} note={blocked ? "Necesita azotea plana" : `${usd(optionCost(o, computed.plan))} (demo)`} onChange={(on) => update(id, { options: { [o.id]: on } })} />;
          })}
        </div>
      </Section>
    </>
  );
}

function GalponCustomize() {
  const gd = useLand((s) => s.design?.galpon);
  const setConfig = useLand((s) => s.setGalponConfig);
  if (!gd) return null;
  const def = GALPON_DEFS.find((d) => d.id === gd.warehouseId)!;
  const c = gd.config;
  const discrete = isDiscrete(def);
  const limits = openingLimits(def, c.dimensions);
  const env = def.envelope;
  const walls = env.walls.find((w) => w.id === c.envelope.walls);
  const roof = env.roof.find((w) => w.id === c.envelope.roof);
  const insulations = env.insulation.filter((i) => (roof?.insulation ?? []).includes(i.id) || (walls?.insulation ?? []).includes(i.id));
  return (
    <>
      <p className="ld-muted">Mismas opciones y datos que MW Warehouse (Galpones).</p>
      <Section title="Estructura">
        <div className="ld-choices">
          {def.structure.systems.map((s) => (
            <ChoiceCard key={s.id} selected={c.structure === s.id} title={s.name} summary={s.summary} badge={s.availability === "onRequest" ? "a pedido" : undefined} disabled={discrete} onSelect={() => setConfig((x) => ({ ...x, structure: s.id }))} />
          ))}
        </div>
        <Swatches label="Terminación de la estructura" colors={def.structure.finishes} value={c.structureFinish} onChange={(v) => setConfig((x) => ({ ...x, structureFinish: v }))} />
        <div className="ld-choices">
          {def.structure.floors.map((f) => (
            <ChoiceCard key={f.id} selected={c.floor === f.id} title={`Piso: ${f.name}`} summary={f.whenToUse} onSelect={() => setConfig((x) => ({ ...x, floor: f.id }))} />
          ))}
        </div>
      </Section>
      <Section title="Cerramientos">
        <div className="ld-choices">
          {env.roof.map((o) => (
            <ChoiceCard key={o.id} selected={c.envelope.roof === o.id} title={`Cubierta: ${o.name}`} summary={o.summary} onSelect={() => setConfig((x) => ({ ...x, envelope: { ...x.envelope, roof: o.id } }))} />
          ))}
          {env.walls.map((o) => (
            <ChoiceCard key={o.id} selected={c.envelope.walls === o.id} title={`Laterales: ${o.name}`} summary={o.summary} onSelect={() => setConfig((x) => ({ ...x, envelope: { ...x.envelope, walls: o.id } }))} />
          ))}
        </div>
        {insulations.length > 1 && (
          <div className="ld-choices">
            {insulations.map((i) => (
              <ChoiceCard key={i.id} selected={c.envelope.insulation === i.id} title={`Aislación: ${i.name}`} summary={i.summary} onSelect={() => setConfig((x) => ({ ...x, envelope: { ...x.envelope, insulation: i.id } }))} />
            ))}
          </div>
        )}
        <Swatches label="Color de cubierta" colors={env.colors} value={c.envelope.roofColor} onChange={(v) => setConfig((x) => ({ ...x, envelope: { ...x.envelope, roofColor: v } }))} />
        <Swatches label="Color de laterales" colors={env.colors} value={c.envelope.wallColor} onChange={(v) => setConfig((x) => ({ ...x, envelope: { ...x.envelope, wallColor: v } }))} />
      </Section>
      {!discrete && (
        <Section title="Aberturas">
          <Stepper label="Portones al frente" value={c.openings.doorsFront} max={limits.doorsFront} onChange={(v) => setConfig((x) => ({ ...x, openings: { ...x.openings, doorsFront: v } }))} />
          <Stepper label="Portones atrás" value={c.openings.doorsBack} max={limits.doorsBack} onChange={(v) => setConfig((x) => ({ ...x, openings: { ...x.openings, doorsBack: v } }))} />
          <Stepper label="Portones laterales" value={c.openings.doorsSide} max={limits.doorsSide} onChange={(v) => setConfig((x) => ({ ...x, openings: { ...x.openings, doorsSide: v } }))} />
          <Stepper label="Puertas peatonales" value={c.openings.personDoors} max={limits.personDoors} onChange={(v) => setConfig((x) => ({ ...x, openings: { ...x.openings, personDoors: v } }))} />
          <Stepper label="Ventanas por lateral" value={c.openings.windowsPerSide} max={limits.windowsPerSide} onChange={(v) => setConfig((x) => ({ ...x, openings: { ...x.openings, windowsPerSide: v } }))} />
        </Section>
      )}
      <Section title="Opciones">
        <div className="ld-toggles">
          {def.options.options.map((o) => (
            <Toggle key={o.id} label={o.name} summary={o.summary} checked={Boolean(c.options[o.id])} disabled={o.status !== "available" || discrete} note={o.status !== "available" ? "Próximamente" : undefined} onChange={(on) => setConfig((x) => ({ ...x, options: { ...x.options, [o.id]: on } }))} />
          ))}
        </div>
      </Section>
    </>
  );
}

export function CustomizePanel({ onSheet }: { onSheet: () => void }) {
  const typeId = useLand((s) => s.typeId);
  const goTo = useLand((s) => s.goTo);
  const computed = useComputed();
  const failing = computed?.plan.checks.filter((c) => c.status !== "ok") ?? [];
  return (
    <aside className="gp-panel gp-panel--config ld-panel" aria-label="Customizar">
      <header className="gp-panel__head">
        <div>
          <p className="ld-kicker">Paso 03 · Customizar</p>
          <h2>Tu edificio, a tu manera</h2>
        </div>
        <button type="button" className="gp-icon-button" onClick={onSheet} title="Ficha técnica imprimible">
          <FileText aria-hidden /> <span>Ficha</span>
        </button>
      </header>
      <div className="gp-panel__body">
        <TypeTabs />
        <PlanSummary />
        {failing.length > 0 && <Checks checks={failing} />}
        {isLandType(typeId) ? <LandCustomize id={typeId} /> : <GalponCustomize />}
      </div>
      <footer className="gp-panel__foot gp-panel__nav">
        <button type="button" className="gp-button" onClick={() => goTo("edificio")}>
          <ArrowLeft aria-hidden /> Edificio
        </button>
        <button type="button" className="gp-button gp-button--primary" onClick={() => goTo("inversion")}>
          Inversión <ArrowRight aria-hidden />
        </button>
      </footer>
    </aside>
  );
}
