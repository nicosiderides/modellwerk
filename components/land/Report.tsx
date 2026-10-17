"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Copy, FolderOpen, Printer, Save, Send, Trash2, X } from "lucide-react";
import { formatNumber } from "@/core/galpones/metrics";
import { BUILDING_TYPES } from "@/core/land/buildingTypes";
import { LAND_SPECS } from "@/core/land/design/catalog";
import { costPerM2, memory } from "@/core/land/design/costs";
import { CORDOBA_NORMS } from "@/core/land/zoning/cordoba";
import { Checks } from "./DesignPanel";
import { Results, useMoney } from "./FinancePanel";
import { captureLandSnapshot } from "./LandViewer";
import { estadoText } from "./LandMap";
import { QuoteModal } from "./QuoteModal";
import { openScenario, shareLink, useCurrentScenario, useSaveScenario } from "./scenarios";
import { GALPON_DEFS, useLand } from "./store";
import { isLandType, useComputed, useConvenio, useFinance } from "./useDesign";

/**
 * Paso 05 · Informe: ficha de prefactibilidad imprimible (lote, normativa con
 * fuentes, imagen 3D, edificio, memoria descriptiva, números) + comparación de
 * escenarios guardados + enlace para compartir.
 */

const m2 = (v: number) => `${formatNumber(Math.round(v))} m²`;
const m1 = (v: number | null) => (v === null ? "—" : `${formatNumber(v, 1)} m`);
const pct = (v: number | null) => (v === null ? "—" : `${formatNumber(v * 100, 1)} %`);

function Compare() {
  const scenarios = useLand((s) => s.scenarios);
  const remove = useLand((s) => s.removeScenario);
  const showToast = useLand((s) => s.showToast);
  const { fmt } = useMoney();
  const [picked, setPicked] = useState<string[]>([]);
  const list = scenarios.filter((s) => picked.length === 0 || picked.includes(s.id)).slice(0, 4);
  /** Marca el mejor valor de cada fila cuando se comparan dos o más (A/B): más superficie, menos inversión, más ganancia y retorno. */
  const best = (key: "built" | "investment" | "profit" | "irr", s: (typeof list)[number]) => {
    if (list.length < 2) return "";
    const vals = list.map((x) => x.summary[key]).filter((v): v is number => typeof v === "number");
    if (vals.length < 2) return "";
    const target = key === "investment" ? Math.min(...vals) : Math.max(...vals);
    return s.summary[key] === target && new Set(vals).size > 1 ? "is-best" : "";
  };
  if (!scenarios.length) return <p className="ld-muted">Todavía no guardaste escenarios. Usá «Guardar escenario» para comparar lotes, tipos o tamaños lado a lado.</p>;
  return (
    <>
      <div className="ld-scenario-list">
        {scenarios.map((s) => (
          <label key={s.id} className="ld-scenario">
            <input type="checkbox" checked={picked.includes(s.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))} />
            <span>
              <strong>{s.name}</strong>
              <em>
                {s.zone} · {new Date(s.savedAt).toLocaleDateString("es-AR")}
              </em>
            </span>
            <button
              type="button"
              className="gp-ghost"
              title="Copiar enlace"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareLink(s));
                  showToast("Enlace copiado");
                } catch {
                  showToast("No se pudo copiar el enlace", "warn");
                }
              }}
            >
              <Copy aria-hidden />
            </button>
            <button
              type="button"
              className="gp-ghost"
              title="Abrir este escenario"
              onClick={async () => {
                showToast("Abriendo el escenario…");
                const ok = await openScenario(s);
                showToast(ok ? `Escenario «${s.name}» abierto` : "No se pudo abrir el escenario", ok ? "info" : "warn");
              }}
            >
              <FolderOpen aria-hidden />
            </button>
            <button type="button" className="gp-ghost" title="Borrar" onClick={() => remove(s.id)}>
              <Trash2 aria-hidden />
            </button>
          </label>
        ))}
      </div>
      <div className="ld-table-wrap">
        <table className="ld-table ld-compare">
          <thead>
            <tr>
              <th />
              {list.map((s) => (
                <th key={s.id}>{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.some((s) => s.image) && (
              <tr className="ld-compare__img">
                <td>Vista</td>
                {list.map((s) => (
                  <td key={s.id}>{s.image ? <img src={s.image} alt={`Vista 3D de ${s.name}`} /> : <span className="ld-muted">sin imagen</span>}</td>
                ))}
              </tr>
            )}
            <tr>
              <td>Lote</td>
              {list.map((s) => (
                <td key={s.id}>
                  {s.designacion || s.nomenclatura} · {m2(s.lotArea)}
                </td>
              ))}
            </tr>
            <tr>
              <td>Zona</td>
              {list.map((s) => (
                <td key={s.id}>{s.zone}</td>
              ))}
            </tr>
            <tr>
              <td>Superficie cubierta</td>
              {list.map((s) => (
                <td key={s.id} className={best("built", s)}>{m2(s.summary.built)}</td>
              ))}
            </tr>
            <tr>
              <td>Plantas / unidades</td>
              {list.map((s) => (
                <td key={s.id}>
                  {s.summary.floors} / {s.summary.units}
                </td>
              ))}
            </tr>
            <tr>
              <td>Inversión</td>
              {list.map((s) => (
                <td key={s.id} className={best("investment", s)}>{fmt(s.summary.investment)}</td>
              ))}
            </tr>
            <tr>
              <td>Ganancia</td>
              {list.map((s) => (
                <td key={s.id} className={`${s.summary.profit < 0 ? "is-neg" : ""} ${best("profit", s)}`}>
                  {fmt(s.summary.profit)}
                </td>
              ))}
            </tr>
            <tr>
              <td>TIR anual</td>
              {list.map((s) => (
                <td key={s.id} className={best("irr", s)}>{pct(s.summary.irr)}</td>
              ))}
            </tr>
            <tr>
              <td>Normativa</td>
              {list.map((s) => (
                <td key={s.id}>{s.summary.ok ? "Cumple" : "No cumple"}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Report({ onClose, sheetOnly }: { onClose?: () => void; sheetOnly?: boolean }) {
  const study = useLand((s) => s.study);
  const typeId = useLand((s) => s.typeId);
  const design = useLand((s) => s.design);
  const goTo = useLand((s) => s.goTo);
  const showToast = useLand((s) => s.showToast);
  const computed = useComputed();
  const { inputs, result } = useFinance(computed);
  const conv = useConvenio(computed, inputs);
  const convenio = useLand((s) => s.convenio);
  const money = useMoney();
  const current = useCurrentScenario();
  const save = useSaveScenario();
  const image = useMemo(() => captureLandSnapshot(), []);
  const [quote, setQuote] = useState(false);
  if (!study || !computed || !design) return null;
  const p = study.parcel.properties;
  const zone = study.zone;
  const r = computed.rules;
  const env = computed.envelope;
  const plan = computed.plan;
  const type = BUILDING_TYPES.find((t) => t.id === typeId)!;
  const mem = isLandType(typeId) && design.land[typeId] ? memory(LAND_SPECS[typeId], design.land[typeId]!) : [];
  const galpon = typeId === "galpon" && design.galpon ? GALPON_DEFS.find((d) => d.id === design.galpon!.warehouseId) : null;
  const today = new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
  const rows: [string, string, string][] = [
    ["FOS", r.fos.value === null ? "—" : `${Math.round(r.fos.value * 100)} %`, r.fos.source.text],
    ["FOT", r.fot.value === null ? "sin FOT" : formatNumber(r.fot.value, 2), r.fot.source.text],
    ["Altura máxima", r.maxHeight.unlimited ? "sin límite" : m1(r.maxHeight.value), r.maxHeight.source.text],
    ["Plantas máximas", r.maxFloors.value === null ? "—" : String(r.maxFloors.value), r.maxFloors.source.text],
    ["Retiro de frente", r.setbackFront.value === null ? "a verificar" : m1(r.setbackFront.value), r.setbackFront.source.text],
    ["Retiro en altura", r.upperSetback.value ? `desde ${m1(r.upperSetback.value.from)}: ${m1(r.upperSetback.value.dist)} ${r.upperSetback.value.ref === "eje" ? "del eje" : "de la línea"}` : "—", r.upperSetback.source.text],
    ["Retiro lateral", r.setbackSide.value === null || r.sideCount === 0 ? "no exige" : `${m1(r.setbackSide.value)} (${r.sideCount})`, r.setbackSide.source.text],
    ["Retiro de fondo", r.setbackBack.value === null ? "no exige" : m1(r.setbackBack.value), r.setbackBack.source.text],
    ["Densidad", r.areaPerUnit.value === null ? "sin tope" : `1 cada ${formatNumber(r.areaPerUnit.value)} m²`, r.areaPerUnit.source.text],
    [`Fraccionamiento (${CORDOBA_NORMS.fraccionamiento.ordenanza})`, "a verificar", CORDOBA_NORMS.fraccionamiento.nota],
  ];
  return (
    <>
      <div className="ld-report" role="dialog" aria-label="Informe de prefactibilidad">
        <div className="ld-report__bar">
          {onClose ? (
            <button type="button" className="gp-button" onClick={onClose}>
              <X aria-hidden /> Cerrar ficha
            </button>
          ) : (
            <button type="button" className="gp-button" onClick={() => goTo("inversion")}>
              <ArrowLeft aria-hidden /> Inversión
            </button>
          )}
          <div className="ld-report__actions">
            {!sheetOnly && (
              <>
                <button type="button" className="gp-button" title="Guardar escenario" onClick={save}>
                  <Save aria-hidden /> Guardar escenario
                </button>
                <button
                  type="button"
                  className="gp-button"
                  title="Copiar enlace"
                  onClick={async () => {
                    if (!current) return;
                    try {
                      await navigator.clipboard.writeText(shareLink(current));
                      showToast("Enlace copiado: quien lo abra ve este lote y este edificio");
                    } catch {
                      showToast("No se pudo copiar el enlace", "warn");
                    }
                  }}
                >
                  <Copy aria-hidden /> Copiar enlace
                </button>
              </>
            )}
            <button type="button" className="gp-button" title="Pedir presupuesto" onClick={() => setQuote(true)}>
              <Send aria-hidden /> Pedir presupuesto
            </button>
            <button type="button" className="gp-button gp-button--primary" title="Imprimir o guardar como PDF" onClick={() => window.print()}>
              <Printer aria-hidden /> Imprimir / PDF
            </button>
          </div>
        </div>

        <article className="ld-sheet-print">
          <header className="ld-sheet-print__head">
            <div>
              <p className="ld-kicker">MW Land · {sheetOnly ? "Ficha técnica" : "Informe de prefactibilidad"}</p>
              <h1>{String(p.desig_oficial || "Lote").trim()}</h1>
              <p>
                {String(p.localidad ?? "").charAt(0)}
                {String(p.localidad ?? "").slice(1).toLowerCase()} · Nomenclatura {p.Nomenclatura}
                {p.Nro_Cuenta ? ` · Cuenta ${p.Nro_Cuenta}` : ""} · {today}
              </p>
            </div>
            <div className="ld-sheet-print__type">
              <strong>{type.name}</strong>
              <span>
                {plan.floors.length} plantas · {m2(plan.built)}
              </span>
            </div>
          </header>

          {image && <img className="ld-sheet-print__img" src={image} alt="Vista 3D del edificio en el lote" />}

          <section>
            <h2>Lote</h2>
            <dl className="ld-kv">
              <div>
                <dt>Superficie</dt>
                <dd>{m2(env.lotArea)}</dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd>{estadoText(String(p.Estado ?? ""))}</dd>
              </div>
              <div>
                <dt>Zona</dt>
                <dd>{zone?.label}</dd>
              </div>
              <div>
                <dt>Uso del suelo</dt>
                <dd>{zone?.patron ?? "—"}</dd>
              </div>
            </dl>
            {zone && <p className="ld-muted">{zone.caracter}</p>}
            {study.heritage.length > 0 && <p className="ld-warnline">Protección patrimonial: {study.heritage.map((h) => `${h.label} (${h.detail})`).join("; ")}.</p>}
          </section>

          <section>
            <h2>Normativa aplicada {type.group === "industrial" ? "(uso industrial)" : ""}</h2>
            <table className="ld-table">
              <thead>
                <tr>
                  <th>Parámetro</th>
                  <th>Valor</th>
                  <th>Fuente</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([k, v, s]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{v}</td>
                    <td className="ld-src">{s}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="ld-muted">
              {zone?.ordinance}
              {zone?.chart ? ` · Gráfico del perfil: ${zone.chart}` : ""} · Datos de {CORDOBA_NORMS.fuentes.mapas.nombre} consultados en vivo · Reglas de interpretación actualizadas al {new Date(`${CORDOBA_NORMS.actualizado}T12:00:00`).toLocaleDateString("es-AR")}
            </p>
          </section>

          <section>
            <h2>Caja máxima y edificio</h2>
            <dl className="ld-kv">
              <div>
                <dt>Planta disponible</dt>
                <dd>{m2(env.groundArea)}</dd>
              </div>
              <div>
                <dt>Huella máxima (FOS)</dt>
                <dd>{m2(env.footprintMax)}</dd>
              </div>
              <div>
                <dt>Superficie máx. (FOT)</dt>
                <dd>{env.fotArea === null ? "—" : m2(env.fotArea)}</dd>
              </div>
              <div>
                <dt>Altura de la caja</dt>
                <dd>{m1(env.height)}</dd>
              </div>
              <div>
                <dt>Edificio: huella</dt>
                <dd>{m2(plan.footprint)}</dd>
              </div>
              <div>
                <dt>Superficie cubierta</dt>
                <dd>{m2(plan.built)}</dd>
              </div>
              <div>
                <dt>Superficie vendible</dt>
                <dd>{m2(plan.sellable)}</dd>
              </div>
              <div>
                <dt>{typeId === "departamentos" ? "Departamentos" : typeId === "oficinas" ? "Oficinas" : "Altura"}</dt>
                <dd>{typeId === "departamentos" || typeId === "oficinas" ? plan.units : m1(plan.height)}</dd>
              </div>
            </dl>
            <Checks checks={plan.checks} />
          </section>

          <section>
            <h2>Memoria descriptiva</h2>
            {galpon && design.galpon && (
              <ul className="ld-memory">
                <li>
                  <strong>{galpon.name}</strong> — nave de {formatNumber(design.galpon.config.dimensions.width)} × {formatNumber(design.galpon.config.dimensions.length)} m, alero {formatNumber(design.galpon.config.dimensions.eaveHeight, 1)} m.
                </li>
                {galpon.structure.systems
                  .filter((s) => s.id === design.galpon!.config.structure)
                  .map((s) => (
                    <li key={s.id}>
                      <strong>Estructura: {s.name}.</strong> {s.memoryText}
                    </li>
                  ))}
                {galpon.envelope.roof
                  .filter((o) => o.id === design.galpon!.config.envelope.roof)
                  .map((o) => (
                    <li key={o.id}>
                      <strong>Cubierta: {o.name}.</strong> {o.memoryText}
                    </li>
                  ))}
                {galpon.envelope.walls
                  .filter((o) => o.id === design.galpon!.config.envelope.walls)
                  .map((o) => (
                    <li key={o.id}>
                      <strong>Cerramientos: {o.name}.</strong> {o.memoryText}
                    </li>
                  ))}
              </ul>
            )}
            {mem.length > 0 && (
              <ul className="ld-memory">
                {mem.map((m) => (
                  <li key={m.title}>
                    <strong>{m.title}.</strong> {m.text}
                  </li>
                ))}
              </ul>
            )}
            {isLandType(typeId) && design.land[typeId] && <p className="ld-muted">Costo de obra de referencia (demo): USD {formatNumber(costPerM2(LAND_SPECS[typeId], design.land[typeId]!))}/m².</p>}
          </section>

          {!sheetOnly && inputs && result && (
            <section>
              <h2>Simulación de inversión ({inputs.mode === "venta" ? "construir y vender" : "construir y alquilar"})</h2>
              <Results r={result} mode={inputs.mode} fmt={money.fmt} />
              {conv && (
                <p className="ld-muted">
                  Escenario con convenio (hipotético, sujeto a aprobación): {m2(conv.plan.built)} cubiertos, ganancia {money.fmt(conv.result.profit)}, TIR {pct(conv.result.irr)}
                  {convenio.contributionPct.value === null ? " — sin el aporte cargado." : "."}
                </p>
              )}
            </section>
          )}

          {!sheetOnly && (
            <section className="ld-noprint">
              <h2>Comparar escenarios</h2>
              <Compare />
            </section>
          )}

          <footer className="ld-sheet-print__foot">
            Prefactibilidad generada con MW Land (MODELLWERK) con datos abiertos de IDECOR · Gobierno de Córdoba (CC BY-SA 4.0). Los valores marcados como demo son de referencia. No reemplaza al profesional, la consulta municipal ni un informe catastral.
          </footer>
        </article>
      </div>
      {quote && <QuoteModal onClose={() => setQuote(false)} />}
    </>
  );
}
