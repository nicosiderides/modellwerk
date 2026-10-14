"use client";

import { useMemo } from "react";
import { ChevronDown, CircleCheck, CircleX, ExternalLink, Info, MapPinned, TriangleAlert } from "lucide-react";
import { DESIGN_VEHICLES, LOT_PRESETS, presetById, type RuleKey } from "@/core/galpones/lotRules";
import { SITE_LIMITS } from "@/core/galpones/siteConfig";
import { verifySite, type SiteCheck } from "@/core/galpones/siteCheck";
import { lotCapacity } from "@/core/galpones/lotLimits";
import { fitPointToLonLat, localFrame, toXY } from "@/core/galpones/geo/parcel";
import type { LotLocation, LotRules, WarehouseConfig, WarehouseDefinition } from "@/core/galpones/types";
import { formatNumber } from "@/core/galpones/metrics";
import { ChoiceCard, NumberField, Toggle, useRemembered } from "./controls";
import { useGalpones } from "./store";

/** Semáforo de verificación (también se usa en el Resumen). */
export function SiteChecksList({ checks, compact = false }: { checks: SiteCheck[]; compact?: boolean }) {
  const groups = ["Lote y normativa", "Logística"] as const;
  return (
    <div className={`gp-checks ${compact ? "gp-checks--compact" : ""}`}>
      {groups.map((group) => {
        const list = checks.filter((c) => c.group === group);
        if (!list.length) return null;
        return (
          <section key={group}>
            <h4 className="gp-checks__group">{group}</h4>
            <ul>
              {list.map((c, i) => (
                <li key={c.id} className={`gp-check gp-check--${c.status}`}>
                  {c.status === "ok" ? <CircleCheck aria-label="Cumple" /> : c.status === "warn" ? <TriangleAlert aria-label="Revisar" /> : c.status === "fail" ? <CircleX aria-label="No cumple" /> : <Info aria-label="Dato" />}
                  <div>
                    <strong>{c.label}</strong>
                    <span>{c.detail}</span>
                    {c.source && !compact && c.source.text !== list[i - 1]?.source?.text && (
                      <small>
                        <em className={c.source.verified ? "is-verified" : c.source.kind === "criterio" ? "is-criteria" : "is-assumed"}>{c.source.verified ? "fuente" : c.source.kind === "criterio" ? "criterio" : "a confirmar"}</em>
                        {c.source.url ? (
                          <a href={c.source.url} target="_blank" rel="noreferrer">
                            {c.source.text} <ExternalLink aria-hidden />
                          </a>
                        ) : (
                          c.source.text
                        )}
                      </small>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const RULE_FIELDS: { key: RuleKey; label: string; unit: string; step: number; decimals: number; scale?: number; max: number }[] = [
  { key: "minArea", label: "Lote mínimo", unit: "m²", step: 100, decimals: 0, max: 200000 },
  { key: "minFront", label: "Frente mínimo", unit: "m", step: 1, decimals: 0, max: 500 },
  { key: "fos", label: "FOS", unit: "%", step: 5, decimals: 0, scale: 100, max: 100 },
  { key: "fot", label: "FOT", unit: "", step: 0.1, decimals: 1, max: 10 },
  { key: "maxHeight", label: "Altura máxima", unit: "m", step: 0.5, decimals: 1, max: 100 },
  { key: "setbackFront", label: "Retiro de frente", unit: "m", step: 0.5, decimals: 1, max: 100 },
  { key: "setbackSide", label: "Retiros laterales", unit: "m", step: 0.5, decimals: 1, max: 50 },
  { key: "setbackBack", label: "Retiro de fondo", unit: "m", step: 0.5, decimals: 1, max: 50 },
];

/** Dibujo chico del lote real: contorno, frente y rectángulo útil (orientado con el frente abajo). */
function LotSketch({ location }: { location: LotLocation }) {
  const frame = localFrame(location.fit.origin);
  const { s, t } = location.fit;
  // Coordenadas del lote: x a lo largo del frente, y hacia el fondo (el frente queda abajo).
  const toLot = (p: [number, number]) => {
    const [x, y] = toXY(frame, p);
    return [x * s[0] + y * s[1], x * t[0] + y * t[1]] as [number, number];
  };
  const ring = location.ring.map(toLot);
  const rect = [fitPointToLonLat(location.fit, 0, 0), fitPointToLonLat(location.fit, location.fit.width, 0), fitPointToLonLat(location.fit, location.fit.width, location.fit.depth), fitPointToLonLat(location.fit, 0, location.fit.depth)].map(toLot);
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const size = 120;
  const k = (size - 16) / Math.max(maxX - minX, maxY - minY, 1);
  const P = ([x, y]: [number, number]) => `${(8 + (x - minX) * k + ((size - 16) - (maxX - minX) * k) / 2).toFixed(1)},${(size - 8 - (y - minY) * k - ((size - 16) - (maxY - minY) * k) / 2).toFixed(1)}`;
  const n = ring.length;
  const front = location.frontEdge;
  return (
    <svg className="gp-lotsketch" viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <polygon points={ring.map(P).join(" ")} className="gp-lotsketch__lot" />
      <polygon points={rect.map(P).join(" ")} className="gp-lotsketch__fit" />
      {location.streetEdges.map((i) => (
        <line key={i} x1={P(ring[i]).split(",")[0]} y1={P(ring[i]).split(",")[1]} x2={P(ring[(i + 1) % n]).split(",")[0]} y2={P(ring[(i + 1) % n]).split(",")[1]} className={i === front ? "gp-lotsketch__front" : "gp-lotsketch__street"} />
      ))}
    </svg>
  );
}

/** Ubicar el lote real en el mapa (o ver el que ya está ubicado). */
function LotLocationCard({ lot }: { lot: WarehouseConfig["lot"] }) {
  const setModal = useGalpones((s) => s.setModal);
  const clear = useGalpones((s) => s.clearLotLocation);
  const loc = lot.location;
  if (!loc) {
    return (
      <button type="button" className="gp-locate" onClick={() => setModal("map")}>
        <MapPinned aria-hidden />
        <span>
          <strong>Ubicá tu lote en el mapa</strong>
          <small>Buscalo por dirección o número de cuenta: la app toma sus medidas reales y la normativa de la zona. Córdoba capital.</small>
        </span>
      </button>
    );
  }
  return (
    <div className="gp-located">
      <LotSketch location={loc} />
      <div>
        <strong>{loc.designacion || "Lote ubicado"}</strong>
        <span>
          {formatNumber(loc.superficie)} m²{loc.zone ? ` · ${loc.zone.label}` : ""}
        </span>
        {loc.fit.coverage < 0.9 && <small>Lote irregular: se usa su parte rectangular más grande.</small>}
        <div className="gp-located__actions">
          <button type="button" className="gp-button" onClick={() => setModal("map")}>
            Ver en el mapa
          </button>
          <button type="button" className="gp-located__clear" onClick={clear}>
            Quitar ubicación
          </button>
        </div>
      </div>
    </div>
  );
}

/** "Lo que permite tu lote": los topes que el lote le pone al galpón. */
function LotCapacityCard({ definition, config }: { definition: WarehouseDefinition; config: WarehouseConfig }) {
  const cap = useMemo(() => lotCapacity(definition, config), [definition, config]);
  if (!cap) return null;
  const r = definition.dimensions;
  const coveredPct = cap.maxCovered ? Math.min(1, cap.covered / cap.maxCovered) : null;
  const limitText = (lim: typeof cap.width, typeMax: number) =>
    lim.max !== null ? (
      <>
        hasta <b>{formatNumber(lim.max, 1)} m</b> <small>{lim.reason?.label.toLowerCase()}</small>
      </>
    ) : (
      <>
        hasta {formatNumber(typeMax, 0)} m <small>máximo de esta tipología: el lote no lo limita</small>
      </>
    );
  return (
    <div className="gp-capacity">
      <h4>Lo que permite tu lote</h4>
      <dl>
        <div>
          <dt>Lote</dt>
          <dd>
            {formatNumber(cap.lot.width, 1)} × {formatNumber(cap.lot.depth, 1)} m · {formatNumber(Math.round(cap.lot.area))} m²
          </dd>
        </div>
        {cap.buildable && (
          <div>
            <dt>Zona edificable</dt>
            <dd>
              {formatNumber(Math.max(0, cap.buildable.width), 1)} × {formatNumber(Math.max(0, cap.buildable.depth), 1)} m <small>lote menos retiros</small>
            </dd>
          </div>
        )}
        <div>
          <dt>Superficie cubierta</dt>
          <dd>
            {cap.maxCovered !== null ? (
              <>
                máx. <b>{formatNumber(Math.round(cap.maxCovered))} m²</b> <small>hoy {formatNumber(Math.round(cap.covered))} m²</small>
                <i className={`gp-capacity__bar ${coveredPct !== null && cap.covered > cap.maxCovered + 0.5 ? "is-over" : ""}`} style={{ ["--gp-pct" as string]: `${Math.round((coveredPct ?? 0) * 100)}%` }} />
              </>
            ) : (
              <>sin tope (FOS / FOT sin cargar)</>
            )}
          </dd>
        </div>
        <div>
          <dt>Altura</dt>
          <dd>{cap.maxHeight !== null ? <>máx. <b>{formatNumber(cap.maxHeight, 1)} m</b> a cumbrera</> : "sin límite en la normativa"}</dd>
        </div>
        <div>
          <dt>Ancho del galpón</dt>
          <dd>{limitText(cap.width, r.width.max)}</dd>
        </div>
        <div>
          <dt>Largo del galpón</dt>
          <dd>{limitText(cap.length, r.length.max)}</dd>
        </div>
      </dl>
      <p className="gp-field__hint">
        {config.lot.placement === "auto"
          ? "Con la ubicación automática, el galpón se corre solo para aprovechar el lote: los topes son los del lote menos los retiros."
          : "Con la ubicación elegida por vos, los topes cuentan dónde está el galpón. Para crecer más, pasá a ubicación automática o correlo hacia el lado libre."}
      </p>
    </div>
  );
}

export function LotPanel({ definition, config }: { definition: WarehouseDefinition; config: WarehouseConfig }) {
  const setLot = useGalpones((s) => s.setLot);
  const setSite = useGalpones((s) => s.setSite);
  const scaleReferences = useGalpones((s) => s.viewer.scaleReferences);
  const setScaleReferences = useGalpones((s) => s.setScaleReferences);
  const [editRules, setEditRules] = useRemembered("lot-edit-rules", false);
  const lot = config.lot;
  const site = config.site;
  const preset = presetById(lot.preset);
  const verification = useMemo(() => verifySite(config, definition), [config, definition]);
  const v = verification;
  const range = v.plan.placementRange;

  const setRule = (key: RuleKey, value: number, scale = 1) => {
    const next: LotRules = { ...lot.rules, [key]: value <= 0 ? null : value / scale };
    setLot({ rules: next });
  };

  return (
    <div className="gp-section">
      <p className="gp-lead">Empezá por el lote: con la normativa y las medidas del terreno, el configurador sabe hasta dónde puede crecer el galpón y te frena si te pasás.</p>
      <Toggle label="Implantar en un lote" summary="Verifica normativa, retiros, ingresos y maniobras de camiones" checked={lot.enabled} onChange={(on) => setLot({ enabled: on })} />
      {lot.enabled && (
        <>
          <LotLocationCard lot={lot} />
          <h3 className="gp-subhead">
            Normativa <span>{preset.place}</span>
          </h3>
          <div className="gp-variants" role="radiogroup" aria-label="Normativa">
            {LOT_PRESETS.map((p) => (
              <ChoiceCard
                key={p.id}
                selected={p.id === lot.preset}
                title={p.name}
                summary={p.id === "cordoba-zona" ? (lot.location?.zone ? `${lot.location.zone.label}. ${p.summary}` : "Ubicá el lote en el mapa para cargarla.") : p.summary}
                disabled={p.id === "cordoba-zona" && !lot.location?.zone}
                onSelect={() => setLot(p.id === "cordoba-zona" && lot.location?.zone ? { preset: p.id, rules: { ...lot.rules, ...lot.location.zone.rules } } : { preset: p.id })}
              />
            ))}
          </div>
          <button type="button" className={`gp-disclosure ${editRules ? "is-open" : ""}`} onClick={() => setEditRules(!editRules)} aria-expanded={editRules}>
            Ver y editar parámetros <ChevronDown aria-hidden />
          </button>
          {editRules && (
            <div className="gp-advanced">
              <p className="gp-hint">0 = sin exigencia. Los valores marcados «a confirmar» son supuestos hasta cargar el reglamento.</p>
              <div className="gp-grid-2">
                {RULE_FIELDS.map((f) => {
                  const raw = lot.rules[f.key];
                  const source = preset.sources[f.key];
                  const changed = raw !== preset.rules[f.key];
                  return (
                    <NumberField
                      key={f.key}
                      label={f.label}
                      value={raw === null ? 0 : raw * (f.scale ?? 1)}
                      min={0}
                      max={f.max}
                      step={f.step}
                      unit={f.unit}
                      decimals={f.decimals}
                      hint={changed ? "Valor propio" : source ? (source.verified ? "Fuente verificada" : "A confirmar") : "Sin dato"}
                      onChange={(value) => setRule(f.key, value, f.scale ?? 1)}
                    />
                  );
                })}
              </div>
              {preset.notes.length > 0 && (
                <ul className="gp-lot-notes">
                  {preset.notes.map((n) => (
                    <li key={n.text}>{n.text}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <h3 className="gp-subhead">
            Lote{" "}
            {v.lot && (
              <span>
                {formatNumber(v.lot.width, 1)} × {formatNumber(v.lot.depth, 1)} m · {formatNumber(Math.round(v.lot.area))} m²
              </span>
            )}
          </h3>
          <div className="gp-grid-2" role="radiogroup" aria-label="Medidas del lote">
            <ChoiceCard selected={lot.mode === "manual"} title="Tengo un lote" summary="Cargá sus medidas: el galpón se adapta a él" onSelect={() => setLot({ mode: "manual" })} />
            <ChoiceCard selected={lot.mode === "auto"} title="Todavía no" summary="Calculamos el lote mínimo para tu galpón" onSelect={() => setLot({ mode: "auto" })} />
          </div>
          {lot.mode === "manual" && (
            <>
              <div className="gp-grid-2">
                <NumberField label="Frente del lote" value={lot.width} min={10} max={600} step={1} unit="m" decimals={1} onChange={(value) => setLot({ width: value })} />
                <NumberField label="Fondo del lote" value={lot.depth} min={10} max={800} step={1} unit="m" decimals={1} onChange={(value) => setLot({ depth: value })} />
              </div>
              <h3 className="gp-subhead">
                Ubicación del galpón <span>siempre dentro del lote</span>
              </h3>
              <div className="gp-segmented" role="radiogroup" aria-label="Ubicación del galpón">
                {(
                  [
                    ["auto", "Automática"],
                    ["manual", "La elijo yo"],
                  ] as const
                ).map(([id, label]) => (
                  <button key={id} type="button" role="radio" aria-checked={lot.placement === id} className={lot.placement === id ? "is-selected" : ""} onClick={() => setLot({ placement: id, ...(id === "manual" && v.lot ? { front: v.lot.front, left: v.lot.left } : {}) })}>
                    {label}
                  </button>
                ))}
              </div>
              {range && v.lot && (
                <div className="gp-grid-2">
                  <NumberField
                    label="Galpón a la línea municipal"
                    value={v.lot.front}
                    min={range.front[0]}
                    max={Math.max(range.front[0] + 0.5, range.front[1])}
                    step={0.5}
                    unit="m"
                    decimals={1}
                    hint={`Desde la fachada de portones · entre ${formatNumber(range.front[0], 1)} y ${formatNumber(range.front[1], 1)} m`}
                    onChange={(value) => setLot({ placement: "manual", front: value, left: v.lot!.left })}
                  />
                  <NumberField
                    label="Galpón al lindero oeste"
                    value={v.lot.left}
                    min={range.left[0]}
                    max={Math.max(range.left[0] + 0.5, range.left[1])}
                    step={0.5}
                    unit="m"
                    decimals={1}
                    hint={`Entre ${formatNumber(range.left[0], 1)} y ${formatNumber(range.left[1], 1)} m`}
                    onChange={(value) => setLot({ placement: "manual", left: value, front: v.lot!.front })}
                  />
                </div>
              )}
              <p className="gp-field__hint">
                {lot.placement === "auto"
                  ? "La app acomoda el galpón dentro del lote: respeta los retiros, deja lugar al playón de camiones y al estacionamiento, y se corre solo si el galpón crece o el lote cambia."
                  : "Podés mover el galpón, pero nunca sale del lote ni pisa los retiros o el alambrado: si el lote o el galpón cambian, se reacomoda dentro del rango permitido."}
              </p>
            </>
          )}
          {lot.mode === "manual" ? (
            <LotCapacityCard definition={definition} config={config} />
          ) : (
            <p className="gp-note">
              <Info aria-hidden /> Sin lote cargado, el lote crece con el galpón: sólo frena la altura máxima de la normativa. Cuando tengas el terreno, elegí «Tengo un lote».
            </p>
          )}
          <div className="gp-segmented gp-segmented--3" role="radiogroup" aria-label="Lote en esquina">
            {(
              [
                ["none", "Entre medianeras"],
                ["west", "Esquina oeste"],
                ["east", "Esquina este"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={lot.corner === id} className={lot.corner === id ? "is-selected" : ""} onClick={() => setLot({ corner: id })}>
                {label}
              </button>
            ))}
          </div>

          <h3 className="gp-subhead">Vehículo de diseño</h3>
          <div className="gp-grid-2" role="radiogroup" aria-label="Vehículo de diseño">
            {DESIGN_VEHICLES.map((d) => (
              <ChoiceCard key={d.id} selected={lot.vehicle === d.id} title={d.id === "semi" ? "Semirremolque" : "Camión rígido"} summary={`${formatNumber(d.length, 2)} m · Dec. 689/2026`} onSelect={() => setLot({ vehicle: d.id })} />
            ))}
          </div>

          <h3 className="gp-subhead">
            Verificación{" "}
            <span>
              {v.summary.ok} cumple · {v.summary.warn} revisar · {v.summary.fail} no cumple
            </span>
          </h3>
          <SiteChecksList checks={v.checks} />
        </>
      )}

      <h3 className="gp-subhead">Entorno</h3>
      <NumberField
        label="Vereda perimetral"
        value={site.sidewalk}
        min={SITE_LIMITS.sidewalk.min}
        max={SITE_LIMITS.sidewalk.max}
        step={SITE_LIMITS.sidewalk.step}
        unit="m"
        decimals={1}
        hint={site.sidewalk > 0 ? "Con cordón; se interrumpe en los portones" : "Sin vereda"}
        onChange={(value) => setSite({ sidewalk: value })}
      />
      <NumberField
        label="Estacionamiento"
        value={site.parking}
        min={SITE_LIMITS.parking.min}
        max={SITE_LIMITS.parking.max}
        step={SITE_LIMITS.parking.step}
        unit="cocheras"
        decimals={0}
        hint={site.parking > 0 ? "Cocheras de 2,50 × 5,00 m con pasillo de 6,50 m" : "Sin estacionamiento"}
        onChange={(value) => setSite({ parking: value })}
      />
      {site.parking > 0 && (
        <div className="gp-grid-2" role="radiogroup" aria-label="Ubicación del estacionamiento">
          <ChoiceCard selected={site.parkingSide === "west"} title="Lateral oeste" summary="Junto a las puertas peatonales" onSelect={() => setSite({ parkingSide: "west" })} />
          <ChoiceCard selected={site.parkingSide === "back"} title="Contrafrente" summary="Detrás del galpón" onSelect={() => setSite({ parkingSide: "back" })} />
        </div>
      )}
      <Toggle label="Playón de maniobras" summary="Hormigón frente a los portones, con guías para camiones" checked={site.truckYard} onChange={(on) => setSite({ truckYard: on })} />
      <Toggle label="Parquizado y calle" summary="Césped, árboles, luminarias y calle de acceso" checked={site.landscape} onChange={(on) => setSite({ landscape: on })} />
      <Toggle label="Vehículos y personas" summary="Autos, camiones y autoelevador para dar escala" checked={scaleReferences} onChange={(on) => setScaleReferences(on)} />
    </div>
  );
}
