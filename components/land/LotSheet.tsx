"use client";

import { CORDOBA_NORMS } from "@/core/land/zoning/cordoba";
import { useMemo, useState } from "react";
import { ArrowRight, CircleAlert, CircleCheck, CircleHelp, CircleX, Landmark, LoaderCircle, Pencil, RotateCcw, X } from "lucide-react";
import { formatNumber } from "@/core/galpones/metrics";
import { BUILDING_TYPES, buildingType } from "@/core/land/buildingTypes";
import { frontWidthOf, studyEnvelope } from "@/core/land/geo/study";
import { toLot } from "@/core/galpones/geo/parcel";
import type { Envelope } from "@/core/land/envelope/envelope";
import type { LandRules, RuleKey, Source, SourceKind, UseStatus } from "@/core/land/types";
import { estadoText, isOccupied } from "./LandMap";
import { useLand } from "./store";

/**
 * Ficha del lote: medidas, zona, qué tipos de edificio admite, la caja máxima
 * en números y la normativa con la fuente de cada valor (editable).
 */

const m2 = (v: number) => `${formatNumber(Math.round(v))} m²`;
const m1 = (v: number) => `${formatNumber(v, 1)} m`;

const KIND_LABEL: Record<SourceKind, string> = { dato: "Dato oficial", interpretado: "Interpretado", estimado: "Estimado", cargado: "Cargado por vos", falta: "A verificar" };
const USE_LABEL: Record<UseStatus, string> = { si: "Permitido", condicionado: "Con condiciones", verificar: "A verificar", no: "No previsto" };

function UseIcon({ status }: { status: UseStatus }) {
  if (status === "si") return <CircleCheck aria-hidden />;
  if (status === "no") return <CircleX aria-hidden />;
  if (status === "condicionado") return <CircleAlert aria-hidden />;
  return <CircleHelp aria-hidden />;
}

function Badge({ source }: { source: Source }) {
  return (
    <span className={`ld-badge is-${source.kind}`} title={source.text}>
      {KIND_LABEL[source.kind]}
    </span>
  );
}

type Row = { key: RuleKey | null; label: string; value: string; source: Source; editable?: { unit: string; factor?: number; current: number | null } };

const FRAC = CORDOBA_NORMS.fraccionamiento;

function rulesRows(r: LandRules): Row[] {
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)} %`);
  const meters = (v: number | null, none = "—") => (v === null ? none : m1(v));
  const rows: Row[] = [
    { key: "fos", label: "FOS (ocupación del suelo)", value: pct(r.fos.value), source: r.fos.source, editable: { unit: "%", factor: 100, current: r.fos.value } },
    { key: "fot", label: "FOT (superficie total)", value: r.fot.value === null ? (r.fot.source.kind === "dato" ? "sin FOT" : "—") : formatNumber(r.fot.value, 2), source: r.fot.source, editable: { unit: "", current: r.fot.value } },
    { key: "maxHeight", label: "Altura máxima", value: r.maxHeight.unlimited ? "sin límite" : meters(r.maxHeight.value), source: r.maxHeight.source, editable: { unit: "m", current: r.maxHeight.value } },
    { key: "maxFloors", label: "Plantas máximas", value: r.maxFloors.value === null ? "—" : `${r.maxFloors.value} (PB + ${r.maxFloors.value - 1})`, source: r.maxFloors.source, editable: { unit: "", current: r.maxFloors.value } },
    { key: "setbackFront", label: "Retiro de frente", value: r.setbackFront.value === null ? "a verificar" : r.setbackFront.value === 0 ? "sobre la línea" : m1(r.setbackFront.value), source: r.setbackFront.source, editable: { unit: "m", current: r.setbackFront.value } },
  ];
  if (r.upperSetback.value) {
    const u = r.upperSetback.value;
    rows.push({ key: null, label: "Retiro en altura", value: `desde ${m1(u.from)}: ${m1(u.dist)} ${u.ref === "eje" ? "del eje de calle" : "de la línea"}`, source: r.upperSetback.source });
  }
  rows.push(
    { key: "setbackSide", label: `Retiro lateral${r.sideCount === 1 ? " (un lado)" : r.sideCount === 2 ? " (ambos)" : ""}`, value: r.setbackSide.value === null || r.sideCount === 0 ? "no exige" : m1(r.setbackSide.value), source: r.setbackSide.source, editable: { unit: "m", current: r.setbackSide.value } },
    { key: "setbackBack", label: `Retiro de fondo${r.backExceptCorner ? " (no en esquina)" : ""}`, value: r.setbackBack.value === null ? "no exige" : m1(r.setbackBack.value), source: r.setbackBack.source, editable: { unit: "m", current: r.setbackBack.value } },
    { key: "areaPerUnit", label: "Densidad", value: r.areaPerUnit.value === null ? "sin tope" : `1 unidad cada ${formatNumber(r.areaPerUnit.value)} m² de lote`, source: r.areaPerUnit.source, editable: { unit: "m²", current: r.areaPerUnit.value } },
    { key: null, label: `Fraccionamiento (${FRAC.ordenanza})`, value: FRAC.frenteMinimo !== null && FRAC.superficieMinima !== null ? `frente ${m1(FRAC.frenteMinimo)} · ${formatNumber(FRAC.superficieMinima)} m²` : "a verificar", source: { kind: FRAC.frenteMinimo !== null ? "dato" : "falta", text: FRAC.nota } },
  );
  return rows;
}

function RuleRow({ row }: { row: Row }) {
  const setOverride = useLand((s) => s.setOverride);
  const overrides = useLand((s) => s.overrides);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const isOverridden = row.key !== null && overrides[row.key] !== undefined;
  const start = () => {
    const f = row.editable?.factor ?? 1;
    setText(row.editable?.current === null || row.editable?.current === undefined ? "" : String(Math.round(row.editable.current * f * 100) / 100).replace(".", ","));
    setEditing(true);
  };
  const save = () => {
    if (!row.key) return;
    const v = Number(text.replace(",", "."));
    if (text.trim() !== "" && Number.isFinite(v) && v >= 0) setOverride(row.key, v / (row.editable?.factor ?? 1));
    setEditing(false);
  };
  return (
    <li className={`ld-rule ${row.source.kind === "falta" ? "is-missing" : ""}`}>
      <div className="ld-rule__main">
        <span className="ld-rule__label">{row.label}</span>
        {editing ? (
          <form
            className="ld-rule__edit"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <input autoFocus inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} onBlur={save} aria-label={`Valor de ${row.label}`} />
            <span>{row.editable?.unit}</span>
          </form>
        ) : (
          <strong className="ld-rule__value">{row.value}</strong>
        )}
      </div>
      <div className="ld-rule__meta">
        <Badge source={row.source} />
        {row.editable && row.key && !editing && (
          <button type="button" className="ld-link" onClick={start} title="Cargar otro valor (por ejemplo, el que te confirmó la Municipalidad)">
            <Pencil aria-hidden /> {row.source.kind === "falta" ? "Cargar" : "Cambiar"}
          </button>
        )}
        {isOverridden && row.key && (
          <button type="button" className="ld-link" onClick={() => setOverride(row.key!, undefined)} title="Volver al valor de la zona">
            <RotateCcw aria-hidden /> Original
          </button>
        )}
      </div>
      <p className="ld-rule__src">{row.source.text}</p>
    </li>
  );
}

function Capacity({ env, typeName }: { env: Envelope; typeName: string }) {
  const limit = env.builtLimit === "fot" ? "la limita el FOT" : env.builtLimit === "tipo" ? `máximo de plantas para ${typeName.toLowerCase()}` : "la limitan los retiros y la altura";
  const heightNote = env.heightBasis === "norma" ? "altura de la zona" : env.heightBasis === "pisos" ? "según plantas de la zona" : env.heightBasis === "fot" ? "dibujada hasta donde llega el FOT" : "sólo de referencia";
  return (
    <section className="ld-capacity" aria-label="Qué podés construir">
      <h3>Qué entra en este lote</h3>
      <div className="ld-capacity__grid">
        <div className="is-main">
          <span>Superficie cubierta máxima</span>
          <strong>{m2(env.builtMax)}</strong>
          <em>{limit}</em>
        </div>
        <div>
          <span>Huella máxima</span>
          <strong>{m2(env.footprintMax)}</strong>
          <em>{env.fosArea !== null && env.fosArea < env.groundArea ? "la limita el FOS" : "la limitan los retiros"}</em>
        </div>
        <div>
          <span>Plantas</span>
          <strong>{env.floors}</strong>
          <em>{env.floors > 1 ? `PB + ${env.floors - 1}` : "planta baja"}</em>
        </div>
        <div>
          <span>Altura de la caja</span>
          <strong>{m1(env.height)}</strong>
          <em>{heightNote}</em>
        </div>
        {env.units !== null && (
          <div>
            <span>Unidades máximas</span>
            <strong>{env.units}</strong>
            <em>por densidad de la zona</em>
          </div>
        )}
      </div>
      <p className="ld-capacity__note">
        Planta disponible después de retiros: {m2(env.groundArea)} de {m2(env.lotArea)}
        {env.fosArea !== null ? ` · FOS: ${m2(env.fosArea)}` : ""}
        {env.fotArea !== null ? ` · FOT: ${m2(env.fotArea)}` : ""}.
      </p>
    </section>
  );
}

export function LotSheet() {
  const study = useLand((s) => s.study);
  const error = useLand((s) => s.error);
  const typeId = useLand((s) => s.typeId);
  const setType = useLand((s) => s.setType);
  const overrides = useLand((s) => s.overrides);
  const resetOverrides = useLand((s) => s.resetOverrides);
  const clear = useLand((s) => s.clear);
  const goTo = useLand((s) => s.goTo);
  const env = useMemo(() => (study ? studyEnvelope(study, typeId, overrides) : null), [study, typeId, overrides]);

  if (!study) return <EmptySheet error={error} />;

  const p = study.parcel.properties;
  const a = study.analysis;
  const zone = study.zone;
  const occupied = isOccupied(String(p.Estado ?? ""));
  const area = Number(p.Superficie_Tierra_Urbana) || Number(p.Superficie_Tierra_Rural) || a.area;
  const depth = (() => {
    const t = a.ring.map((q) => toLot(a.fit.axes, q)[1]);
    return Math.max(...t) - Math.min(...t);
  })();
  const type = buildingType(typeId);
  const nOverrides = Object.keys(overrides).length;

  return (
    <div className="gp-map__lot ld-sheet">
      <header>
        <div>
          <h2>{String(p.desig_oficial || "").trim() || "Parcela sin designación"}</h2>
          <p>{[p.localidad && String(p.localidad).charAt(0) + String(p.localidad).slice(1).toLowerCase(), p.Nomenclatura && `Nomenclatura ${p.Nomenclatura}`, p.Nro_Cuenta && `Cuenta ${p.Nro_Cuenta}`].filter(Boolean).join(" · ")}</p>
        </div>
        <button type="button" className="gp-ghost" onClick={clear} aria-label="Elegir otro lote">
          <X aria-hidden />
        </button>
      </header>

      <dl className="gp-map__stats">
        <div>
          <dt>Frente</dt>
          <dd>{m1(frontWidthOf(a))}</dd>
        </div>
        <div>
          <dt>Fondo</dt>
          <dd>{m1(depth)}</dd>
        </div>
        <div>
          <dt>Superficie</dt>
          <dd>{m2(area)}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>{estadoText(String(p.Estado ?? ""))}</dd>
        </div>
      </dl>
      {occupied && (
        <p className="gp-map__fitline">
          <CircleAlert aria-hidden /> El lote figura edificado: para invertir acá hay que sumar la compra de lo construido y su demolición o reciclaje.
        </p>
      )}

      {study.status === "loading" && (
        <p className="gp-map__loading">
          <LoaderCircle className="gp-spin" aria-hidden /> Consultando la normativa de la zona…
        </p>
      )}
      {study.status === "none" && <p className="gp-map__msg">La normativa de esta localidad todavía no está cargada en MW Land. Por ahora, Córdoba capital.</p>}
      {study.status === "error" && <p className="gp-map__msg">No se pudo consultar la normativa de la zona. Tocá el lote de nuevo.</p>}

      {zone && env && (
        <>
          <section className="gp-map__zone ld-zone">
            <div className="gp-map__zonehead">
              <h3>{zone.label}</h3>
              {zone.patron && <span className="ld-chip">Uso del suelo {zone.patron}</span>}
            </div>
            <p className="ld-caracter">{zone.caracter}</p>
            {zone.special && (
              <p className="gp-map__verdict is-warn">
                <CircleAlert aria-hidden /> Zona con normativa particular: la capa oficial no trae sus parámetros. La caja se dibuja sólo como referencia; cargá los valores que te confirme la Municipalidad.
              </p>
            )}
            {study.heritage.length > 0 && (
              <div className="ld-heritage">
                <Landmark aria-hidden />
                <div>
                  {study.heritage.map((h) => (
                    <p key={h.label + h.detail}>
                      <strong>{h.label}</strong>
                      {h.detail ? ` · ${h.detail}` : ""}
                    </p>
                  ))}
                  <p className="ld-muted">Puede haber restricciones extra de patrimonio: consultalo antes de proyectar.</p>
                </div>
              </div>
            )}
          </section>

          <section className="ld-uses" aria-label="Tipos de edificio">
            <h3>¿Qué se puede hacer acá?</h3>
            <p className="ld-muted">Tocá un tipo para ver su caja.</p>
            <ul>
              {BUILDING_TYPES.map((t) => {
                const u = zone.uses[t.id];
                return (
                  <li key={t.id}>
                    <button type="button" className={`ld-use is-${u.status} ${typeId === t.id ? "is-on" : ""}`} onClick={() => setType(t.id)} aria-pressed={typeId === t.id} title={u.source.text}>
                      <UseIcon status={u.status} />
                      <span className="ld-use__name">{t.name}</span>
                      <span className="ld-use__status">{USE_LABEL[u.status]}</span>
                      <span className="ld-use__text">{u.text}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <Capacity env={env.envelope} typeName={type.name} />

          {env.envelope.warnings.length > 0 && (
            <ul className="ld-warnings">
              {env.envelope.warnings.map((w) => (
                <li key={w}>
                  <CircleAlert aria-hidden /> {w}
                </li>
              ))}
            </ul>
          )}

          <section className="ld-rules" aria-label="Normativa del lote">
            <div className="ld-rules__head">
              <h3>Normativa {type.group === "industrial" ? "(uso industrial)" : ""}</h3>
              {nOverrides > 0 && (
                <button type="button" className="ld-link" onClick={resetOverrides}>
                  <RotateCcw aria-hidden /> Volver a los valores de la zona ({nOverrides})
                </button>
              )}
            </div>
            <ul>
              {rulesRows(env.rules).map((row) => (
                <RuleRow key={row.label} row={row} />
              ))}
              {study.blockCenter && (
                <li className="ld-rule">
                  <div className="ld-rule__main">
                    <span className="ld-rule__label">Centro de manzana</span>
                    <strong className="ld-rule__value">{study.blockCenter.kind === "no-exigible" ? "no exigible" : study.blockCenter.kind === "tipica" ? (env.envelope.blockCenter.length ? "afecta al lote" : "no afecta al lote") : "a verificar"}</strong>
                  </div>
                  <div className="ld-rule__meta">
                    <Badge source={study.blockCenter.source} />
                  </div>
                  <p className="ld-rule__src">{study.blockCenter.source.text}</p>
                </li>
              )}
            </ul>
            {zone.notes.length > 0 && (
              <details className="gp-map__notes">
                <summary>Aclaraciones de la zona ({zone.notes.length})</summary>
                <ul>
                  {zone.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </details>
            )}
            <p className="ld-muted">
              {zone.ordinance}
              {zone.chart ? ` · Gráfico del perfil: ${zone.chart}` : ""}
            </p>
          </section>

          <div className="gp-map__actions ld-next">
            <button type="button" className="gp-button gp-button--primary" onClick={() => goTo("edificio")}>
              Diseñar el edificio <ArrowRight aria-hidden />
            </button>
            <span className="ld-muted">Siguiente: elegí el tipo, su tamaño dentro de la caja y customizalo.</span>
          </div>
        </>
      )}
      {error && (
        <p className="gp-map__error">
          <CircleAlert aria-hidden /> {error}
        </p>
      )}
      <p className="gp-map__source">Prefactibilidad con datos de IDECOR (Catastro y Mapas Córdoba) consultados hoy. No reemplaza al profesional ni la consulta en la Municipalidad.</p>
    </div>
  );
}

function EmptySheet({ error }: { error: string | null }) {
  return (
    <div className="gp-map__empty ld-empty">
      <p className="ld-kicker">MW Land · Prefactibilidad</p>
      <h2>¿Qué podés construir en tu lote?</h2>
      <p>Buscá un lote por dirección, número de cuenta o nomenclatura, o acercá el mapa y tocalo.</p>
      <p>MW Land lee la normativa oficial de la zona, te dice qué tipos de edificio admite y dibuja en 3D la caja máxima que podés construir sobre el terreno real.</p>
      {error && (
        <p className="gp-map__error">
          <CircleAlert aria-hidden /> {error}
        </p>
      )}
      <div className="gp-map__legend">
        <span>
          <i className="is-lot" /> Límite de parcela
        </span>
        <span>
          <i className="is-vacant" /> Terreno baldío
        </span>
        <span>
          <i className="ld-legend-box" /> Caja máxima construible
        </span>
      </div>
      <p className="gp-map__note">Por ahora con normativa de Córdoba capital (Ord. 8256 y 8133). Es una prefactibilidad: no reemplaza al profesional ni la consulta municipal.</p>
    </div>
  );
}
