"use client";

import { ArrowRight, ChevronDown, Info, RotateCcw, TriangleAlert, X } from "lucide-react";
import { evaluateRules, getVariant, isDiscrete, openingLimits, ridgeHeight, slopeDegrees } from "@/core/galpones/configuration";
import { calculateMetrics, formatNumber } from "@/core/galpones/metrics";
import type { WarehouseConfig, WarehouseDefinition } from "@/core/galpones/types";
import { ChoiceCard, NumberField, Stepper, Swatches, Toggle, useRemembered } from "./controls";
import { definitionOf, useGalpones, type ConfigTab } from "./store";

const TABS: { id: ConfigTab; label: string }[] = [
  { id: "dimensions", label: "Medidas" },
  { id: "structure", label: "Estructura" },
  { id: "envelope", label: "Envolvente" },
  { id: "openings", label: "Aberturas" },
  { id: "options", label: "Opcionales" },
];

function DimensionsPanel({ definition, config }: { definition: WarehouseDefinition; config: WarehouseConfig }) {
  const setDimension = useGalpones((s) => s.setDimension);
  const setVariant = useGalpones((s) => s.setVariant);
  const [advanced, setAdvanced] = useRemembered("dims-advanced", false);
  const d = config.dimensions;
  const r = definition.dimensions;
  const locked = isDiscrete(definition);
  const variant = getVariant(definition, config.variant);
  const ridge = ridgeHeight(d);

  return (
    <div className="gp-section">
      {locked && definition.model.strategy === "discreteVariant" && (
        <>
          <p className="gp-note">
            <Info aria-hidden /> Este modelo viene de BIM (GLB) y no se deforma: elegí entre las variantes ya modeladas.
          </p>
          <div className="gp-variants" role="radiogroup" aria-label="Variantes del modelo">
            {definition.model.variants.map((v) => (
              <ChoiceCard key={v.id} selected={v.id === variant?.id} title={`${v.dimensions.width} × ${v.dimensions.length} m`} summary={`Alero ${formatNumber(v.dimensions.eaveHeight, 1)} m · ${v.dimensions.bayCount} módulos de ${v.dimensions.baySpacing} m`} badge={v.id} onSelect={() => setVariant(v.id)} />
            ))}
          </div>
        </>
      )}
      <div className="gp-grid-2">
        <NumberField label="Ancho / luz" value={d.width} min={r.width.min} max={r.width.max} step={r.width.step} unit="m" locked={locked} onChange={(v) => setDimension("width", v)} />
        <NumberField label="Largo" value={d.length} min={r.length.min} max={r.length.max} step={d.baySpacing} unit="m" locked={locked} onChange={(v) => setDimension("length", v)} hint={locked ? undefined : `${d.bayCount} módulos × ${formatNumber(d.baySpacing, 1)} m`} />
      </div>
      <NumberField label="Altura de alero" value={d.eaveHeight} min={r.eaveHeight.min} max={r.eaveHeight.max} step={r.eaveHeight.step} unit="m" locked={locked} onChange={(v) => setDimension("eaveHeight", v)} />
      <button type="button" className={`gp-disclosure ${advanced ? "is-open" : ""}`} onClick={() => setAdvanced(!advanced)} aria-expanded={advanced}>
        Pendiente, cumbrera y módulos <ChevronDown aria-hidden />
      </button>
      {advanced && (
        <div className="gp-advanced">
          <div className="gp-grid-2">
            <NumberField label="Pendiente" value={d.roofSlope} min={r.roofSlope.min} max={r.roofSlope.max} step={r.roofSlope.step} unit="%" decimals={0} locked={locked} hint={`${formatNumber(slopeDegrees(d.roofSlope), 1)}°`} onChange={(v) => setDimension("roofSlope", v)} />
            <NumberField
              label="Cumbrera"
              value={ridge}
              min={Number((d.eaveHeight + (d.width / 2) * (r.roofSlope.min / 100)).toFixed(2))}
              max={Number((d.eaveHeight + (d.width / 2) * (r.roofSlope.max / 100)).toFixed(2))}
              step={0.1}
              unit="m"
              decimals={2}
              locked={locked}
              onChange={(v) => setDimension("ridgeHeight", v)}
            />
          </div>
          <div className="gp-grid-2">
            <NumberField label="Separación de pórticos" value={d.baySpacing} min={r.baySpacing.min} max={r.baySpacing.max} step={r.baySpacing.step} unit="m" locked={locked} onChange={(v) => setDimension("baySpacing", v)} />
            <NumberField label="Módulos" value={d.bayCount} min={r.bayCount.min} max={r.bayCount.max} step={1} decimals={0} locked={locked} onChange={(v) => setDimension("bayCount", v)} />
          </div>
        </div>
      )}
    </div>
  );
}

function StructurePanel({ definition, config }: { definition: WarehouseDefinition; config: WarehouseConfig }) {
  const setStructure = useGalpones((s) => s.setStructure);
  const setFinish = useGalpones((s) => s.setStructureFinish);
  const locked = isDiscrete(definition);
  return (
    <div className="gp-section">
      <div className="gp-choices">
        {definition.structure.systems.map((system) => (
          <ChoiceCard
            key={system.id}
            selected={config.structure === system.id}
            title={system.name}
            summary={system.summary}
            badge={system.availability === "onRequest" ? "Consultar" : undefined}
            disabled={locked && config.structure !== system.id}
            onSelect={() => setStructure(system.id)}
          >
            {config.structure === system.id && (
              <ul className="gp-bullets">
                {system.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
          </ChoiceCard>
        ))}
      </div>
      {locked && (
        <p className="gp-note">
          <Info aria-hidden /> El sistema estructural está modelado en el GLB de cada variante.
        </p>
      )}
      <Swatches
        label="Terminación de estructura"
        colors={definition.structure.finishes.map((f) => ({ id: f.id, name: f.name, hex: f.hex }))}
        value={config.structureFinish}
        onChange={setFinish}
      />
    </div>
  );
}

function EnvelopePanel({ definition, config }: { definition: WarehouseDefinition; config: WarehouseConfig }) {
  const setEnvelope = useGalpones((s) => s.setEnvelope);
  const env = definition.envelope;
  const roof = env.roof.find((o) => o.id === config.envelope.roof);
  const locked = isDiscrete(definition);
  return (
    <div className="gp-section">
      <h3 className="gp-subhead">Cubierta</h3>
      <div className="gp-choices gp-choices--compact">
        {env.roof.map((o) => (
          <ChoiceCard key={o.id} selected={config.envelope.roof === o.id} title={o.name} summary={o.summary} onSelect={() => setEnvelope({ roof: o.id })} />
        ))}
      </div>
      <Swatches label="Color de cubierta" colors={env.colors} value={config.envelope.roofColor} onChange={(id) => setEnvelope({ roofColor: id })} />
      <h3 className="gp-subhead">Cerramientos</h3>
      <div className="gp-choices gp-choices--compact">
        {env.walls.map((o) => (
          <ChoiceCard key={o.id} selected={config.envelope.walls === o.id} title={o.name} summary={o.summary} onSelect={() => setEnvelope({ walls: o.id })} />
        ))}
      </div>
      <Swatches label="Color de cerramientos" colors={env.colors} value={config.envelope.wallColor} onChange={(id) => setEnvelope({ wallColor: id })} />
      <h3 className="gp-subhead">Aislación</h3>
      <div className="gp-segmented" role="radiogroup" aria-label="Aislación">
        {env.insulation.map((o) => {
          const allowed = roof?.insulation.includes(o.id) ?? true;
          return (
            <button key={o.id} type="button" role="radio" aria-checked={config.envelope.insulation === o.id} className={config.envelope.insulation === o.id ? "is-selected" : ""} disabled={!allowed} title={allowed ? o.summary : `No compatible con ${roof?.name}`} onClick={() => setEnvelope({ insulation: o.id })}>
              <span>{o.name}</span>
              <i className="gp-level">{"●".repeat(o.level)}{"○".repeat(3 - o.level)}</i>
            </button>
          );
        })}
      </div>
      <p className="gp-field__hint">{env.insulation.find((o) => o.id === config.envelope.insulation)?.summary}</p>
      {locked && (
        <p className="gp-note">
          <Info aria-hidden /> En el modelo BIM, la cubierta y los cerramientos cambian de terminación y color; los espesores reales quedan como en el GLB.
        </p>
      )}
    </div>
  );
}

function OpeningsPanel({ definition, config }: { definition: WarehouseDefinition; config: WarehouseConfig }) {
  const setOpenings = useGalpones((s) => s.setOpenings);
  const locked = isDiscrete(definition);
  const limits = openingLimits(definition, config.dimensions);
  const o = config.openings;
  const specs = definition.options.openings;
  if (locked) {
    return (
      <div className="gp-section">
        <p className="gp-note">
          <Info aria-hidden /> Las aberturas forman parte del modelo BIM de la variante.
        </p>
        <dl className="gp-deflist">
          <div><dt>Portones frente</dt><dd>{o.doorsFront}</dd></div>
          <div><dt>Portones contrafrente</dt><dd>{o.doorsBack}</dd></div>
          <div><dt>Portones laterales</dt><dd>{o.doorsSide}</dd></div>
          <div><dt>Puertas peatonales</dt><dd>{o.personDoors}</dd></div>
          <div><dt>Ventanas por lateral</dt><dd>{o.windowsPerSide}</dd></div>
        </dl>
      </div>
    );
  }
  return (
    <div className="gp-section">
      <p className="gp-field__hint">Las aberturas se ubican en posiciones predefinidas (módulos y ejes del testero).</p>
      <h3 className="gp-subhead">
        {specs.sectionalDoor.name} <span>{formatNumber(specs.sectionalDoor.width, 1)} × {formatNumber(Math.min(specs.sectionalDoor.height, config.dimensions.eaveHeight - 0.6), 1)} m</span>
      </h3>
      <Stepper label="Frente" value={o.doorsFront} max={limits.doorsFront} onChange={(v) => setOpenings({ doorsFront: v })} hint={`hasta ${limits.doorsFront}`} />
      <Stepper label="Contrafrente" value={o.doorsBack} max={limits.doorsBack} onChange={(v) => setOpenings({ doorsBack: v })} hint={`hasta ${limits.doorsBack}`} />
      <Stepper label="Lateral este" value={o.doorsSide} max={limits.doorsSide} onChange={(v) => setOpenings({ doorsSide: v })} hint={`hasta ${limits.doorsSide}`} />
      <h3 className="gp-subhead">Otras aberturas</h3>
      <Stepper label={specs.personDoor.name} value={o.personDoors} max={limits.personDoors} onChange={(v) => setOpenings({ personDoors: v })} hint="lateral oeste" />
      <Stepper label="Ventanas por lateral" value={o.windowsPerSide} max={limits.windowsPerSide} onChange={(v) => setOpenings({ windowsPerSide: v })} hint={`${formatNumber(specs.window.width, 1)} × ${formatNumber(specs.window.height, 1)} m`} />
    </div>
  );
}

function OptionsPanel({ definition, config }: { definition: WarehouseDefinition; config: WarehouseConfig }) {
  const toggleOption = useGalpones((s) => s.toggleOption);
  const locked = isDiscrete(definition);
  const available = definition.options.options.filter((o) => o.status === "available");
  const planned = definition.options.options.filter((o) => o.status === "planned");
  return (
    <div className="gp-section">
      {available.map((option) => {
        const tooLow = option.minEaveHeight !== undefined && config.dimensions.eaveHeight < option.minEaveHeight;
        return (
          <Toggle
            key={option.id}
            label={option.name}
            summary={option.summary}
            checked={Boolean(config.options[option.id])}
            disabled={locked || tooLow}
            note={locked ? "Definido por el modelo BIM" : tooLow ? `Requiere alero ≥ ${option.minEaveHeight} m` : undefined}
            onChange={(on) => toggleOption(option.id, on)}
          />
        );
      })}
      {planned.length > 0 && (
        <>
          <h3 className="gp-subhead">Próximamente</h3>
          <div className="gp-planned">
            {planned.map((o) => (
              <span key={o.id} title={o.summary}>{o.name}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Issues({ definition, config }: { definition: WarehouseDefinition; config: WarehouseConfig }) {
  const setStructure = useGalpones((s) => s.setStructure);
  const issues = evaluateRules(definition, config);
  if (issues.length === 0) return null;
  return (
    <div className="gp-issues">
      {issues.map((issue) => (
        <div key={issue.id} className={`gp-issue gp-issue--${issue.level}`}>
          {issue.level === "warning" ? <TriangleAlert aria-hidden /> : <Info aria-hidden />}
          <span>{issue.message}</span>
          {issue.suggest?.structure && definition.structure.systems.some((s) => s.id === issue.suggest!.structure) && (
            <button type="button" onClick={() => setStructure(issue.suggest!.structure!)}>
              Aplicar
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function WarehouseConfigurator() {
  const definition = useGalpones((s) => definitionOf(s));
  const config = useGalpones((s) => s.warehouse.config);
  const tab = useGalpones((s) => s.ui.tab);
  const setTab = useGalpones((s) => s.setTab);
  const goTo = useGalpones((s) => s.goTo);
  const reset = useGalpones((s) => s.reset);
  const panelOpen = useGalpones((s) => s.ui.panelOpen);
  const setPanelOpen = useGalpones((s) => s.setPanelOpen);
  if (!definition || !config) return null;
  const m = calculateMetrics(config, definition);
  const tabIndex = TABS.findIndex((t) => t.id === tab);
  const next = TABS[tabIndex + 1];

  return (
    <aside className={`gp-panel gp-panel--config ${panelOpen ? "is-open" : "is-collapsed"}`} aria-label="Configuración">
      <div className="gp-panel__head">
        <div>
          <p className="gp-kicker">
            {definition.code} / {definition.use}
          </p>
          <h2>{definition.name}</h2>
        </div>
        <div className="gp-panel__head-actions">
          <button type="button" className="gp-ghost" onClick={reset} title="Volver a los valores iniciales">
            <RotateCcw aria-hidden />
          </button>
          <button type="button" className="gp-ghost gp-show-mobile" onClick={() => setPanelOpen(!panelOpen)} aria-label={panelOpen ? "Contraer panel" : "Expandir panel"}>
            {panelOpen ? <X aria-hidden /> : <ChevronDown aria-hidden style={{ transform: "rotate(180deg)" }} />}
          </button>
        </div>
      </div>
      <nav className="gp-tabs" role="tablist" aria-label="Secciones">
        {TABS.map((t, i) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "is-active" : ""} onClick={() => setTab(t.id)}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="gp-panel__body" role="tabpanel">
        {tab === "dimensions" && <DimensionsPanel definition={definition} config={config} />}
        {tab === "structure" && <StructurePanel definition={definition} config={config} />}
        {tab === "envelope" && <EnvelopePanel definition={definition} config={config} />}
        {tab === "openings" && <OpeningsPanel definition={definition} config={config} />}
        {tab === "options" && <OptionsPanel definition={definition} config={config} />}
        <Issues definition={definition} config={config} />
      </div>
      <div className="gp-panel__foot">
        <dl className="gp-kpis">
          <div>
            <dt>Superficie</dt>
            <dd>{formatNumber(m.floorArea)} m²</dd>
          </div>
          <div>
            <dt>Luz libre</dt>
            <dd>{formatNumber(m.clearSpan, Number.isInteger(m.clearSpan) ? 0 : 1)} m</dd>
          </div>
          <div>
            <dt>Altura</dt>
            <dd>{formatNumber(m.buildingHeight, 1)} m</dd>
          </div>
        </dl>
        <div className="gp-panel__nav">
          {next ? (
            <button type="button" className="gp-button" onClick={() => setTab(next.id)}>
              {next.label} <ArrowRight aria-hidden />
            </button>
          ) : (
            <button type="button" className="gp-button" onClick={() => goTo("explore")}>
              Explorar <ArrowRight aria-hidden />
            </button>
          )}
          <button type="button" className="gp-button gp-button--primary" onClick={() => goTo("summary")}>
            Resumen <ArrowRight aria-hidden />
          </button>
        </div>
      </div>
    </aside>
  );
}
