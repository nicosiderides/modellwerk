"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, CircleAlert, Pencil, RotateCcw, Save } from "lucide-react";
import { Toggle } from "@/components/galpones/controls";
import { formatNumber } from "@/core/galpones/metrics";
import { LABELS, sensitivity, type FinanceInputs, type FinanceKey, type FinanceResult, type Input, type ValueStatus } from "@/core/land/finance/finance";
import { PlanSummary, TypeTabs } from "./DesignPanel";
import { useLand } from "./store";
import { useComputed, useConvenio, useFinance } from "./useDesign";
import { useSaveScenario } from "./scenarios";

/**
 * Paso 04 · Inversión: entradas editables (cada una dice si es real, demo,
 * pendiente o cargada), resultados y "¿qué pasa si…?". Abajo, el escenario
 * con convenio urbanístico (Fase 6), marcado "sujeto a aprobación".
 */

const STATUS: Record<ValueStatus, string> = { real: "Dato real", demo: "Estimado (demo)", pending: "Pendiente", cargado: "Cargado por vos" };
const STATUS_CLASS: Record<ValueStatus, string> = { real: "dato", demo: "falta", pending: "falta", cargado: "cargado" };

type Key = FinanceKey;
const UNITS: Partial<Record<Key, { unit: string; kind: "usd" | "pct" | "n" }>> = {
  land: { unit: "USD", kind: "usd" },
  costPerM2: { unit: "USD/m²", kind: "usd" },
  extras: { unit: "USD", kind: "usd" },
  other: { unit: "USD", kind: "usd" },
  feesPct: { unit: "%", kind: "pct" },
  taxesPct: { unit: "%", kind: "pct" },
  contingencyPct: { unit: "%", kind: "pct" },
  commissionPct: { unit: "%", kind: "pct" },
  salePerM2: { unit: "USD/m²", kind: "usd" },
  rentPerM2Month: { unit: "USD/m²/mes", kind: "usd" },
  salePerUnit: { unit: "USD/unidad", kind: "usd" },
  rentPerUnitMonth: { unit: "USD/unidad/mes", kind: "usd" },
  vacancyPct: { unit: "%", kind: "pct" },
  opexPct: { unit: "%", kind: "pct" },
  buildMonths: { unit: "meses", kind: "n" },
  saleMonths: { unit: "meses", kind: "n" },
  fx: { unit: "$ por USD", kind: "n" },
};

export function useMoney() {
  const typeId = useLand((s) => s.typeId);
  const saved = useLand((s) => s.finance[typeId]);
  const [ars, setArs] = useState(false);
  const fx = saved?.fx.value ?? null;
  const fmt = (usd: number) => (ars && fx ? `$ ${formatNumber(Math.round(usd * fx))}` : `USD ${formatNumber(Math.round(usd))}`);
  return { fmt, ars: ars && Boolean(fx), setArs, fx };
}

function InputRow({ k, input, onChange }: { k: Key; input: Input; onChange: (i: Input) => void }) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState("");
  const u = UNITS[k]!;
  const shown = input.value === null ? "—" : u.kind === "pct" ? `${formatNumber(input.value, 1)} %` : u.kind === "usd" ? `${formatNumber(Math.round(input.value))} ${u.unit}` : `${formatNumber(input.value, k === "fx" ? 0 : 0)} ${u.unit}`;
  const save = () => {
    const v = Number(text.replace(/\./g, "").replace(",", "."));
    if (text.trim() !== "" && Number.isFinite(v) && v >= 0) onChange({ value: v, status: "cargado", note: "Valor que cargaste vos" });
    setEdit(false);
  };
  return (
    <li className={`ld-rule ${input.status === "pending" ? "is-missing" : ""}`}>
      <div className="ld-rule__main">
        <span className="ld-rule__label">{LABELS[k]}</span>
        {edit ? (
          <form
            className="ld-rule__edit"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <input autoFocus inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} onBlur={save} aria-label={LABELS[k]} />
            <span>{u.unit}</span>
          </form>
        ) : (
          <strong className="ld-rule__value">{shown}</strong>
        )}
      </div>
      <div className="ld-rule__meta">
        <span className={`ld-badge is-${STATUS_CLASS[input.status]}`} title={input.note}>
          {STATUS[input.status]}
        </span>
        {!edit && (
          <button
            type="button"
            className="ld-link"
            onClick={() => {
              setText(input.value === null ? "" : String(Math.round(input.value * 100) / 100).replace(".", ","));
              setEdit(true);
            }}
          >
            <Pencil aria-hidden /> {input.value === null ? "Cargar" : "Cambiar"}
          </button>
        )}
      </div>
      <p className="ld-rule__src">{input.note}</p>
    </li>
  );
}

export function Results({ r, mode, fmt, perUnit = false }: { r: FinanceResult; mode: FinanceInputs["mode"]; fmt: (v: number) => string; perUnit?: boolean }) {
  const pct = (v: number | null) => (v === null ? "—" : `${formatNumber(v * 100, 1)} %`);
  return (
    <section className="ld-capacity ld-results" aria-label="Resultados">
      <div className="ld-capacity__grid">
        <div className="is-main">
          <span>{mode === "venta" ? "Ganancia" : "Renta neta anual"}</span>
          <strong className={(mode === "venta" ? r.profit : r.noi ?? 0) < 0 ? "is-neg" : ""}>{fmt(mode === "venta" ? r.profit : r.noi ?? 0)}</strong>
          <em>{mode === "venta" ? `Margen ${pct(r.margin)} · ROI ${pct(r.roi)}` : `Rendimiento ${pct(r.yield)} anual sobre la inversión`}</em>
        </div>
        <div>
          <span>Inversión total</span>
          <strong>{fmt(r.investment)}</strong>
          <em>terreno + obra + extras + costos</em>
        </div>
        <div>
          <span>{mode === "venta" ? "Ventas" : "Alquiler bruto anual"}</span>
          <strong>{fmt(r.revenue)}</strong>
          <em>{mode === "venta" ? `neto de comisión ${fmt(r.netRevenue)}` : "antes de vacancia y gastos"}</em>
        </div>
        <div>
          <span>Retorno anual (TIR)</span>
          <strong>{pct(r.irr)}</strong>
          <em>{mode === "venta" ? `en ${r.months} meses` : "a 20 años, sin valor de reventa"}</em>
        </div>
        <div>
          <span>{mode === "venta" ? "Precio mínimo para no perder" : "Recupero"}</span>
          <strong>{mode === "venta" ? (perUnit && r.breakEvenPerUnit ? `${fmt(r.breakEvenPerUnit)}` : `${fmt(r.breakEvenPerM2)}/m²`) : r.payback ? `${formatNumber(r.payback, 1)} años` : "—"}</strong>
          <em>{mode === "venta" ? (perUnit && r.breakEvenPerUnit ? `por unidad (${fmt(r.breakEvenPerM2)}/m²)` : "por m² vendible") : "inversión / renta neta"}</em>
        </div>
      </div>
      {(r.pending.length > 0 || r.demo.length > 0) && (
        <p className="ld-warnline">
          <CircleAlert aria-hidden />
          {r.pending.length > 0 ? ` Faltan datos: ${r.pending.join(", ")}. ` : " "}
          {r.demo.length > 0 ? `Con valores de demostración: ${r.demo.join(", ")}. Cargá los reales para que el resultado sirva para decidir.` : ""}
        </p>
      )}
    </section>
  );
}

function Breakdown({ r, fmt }: { r: FinanceResult; fmt: (v: number) => string }) {
  const rows: [string, number][] = [
    ["Terreno", r.landCost],
    ["Obra", r.hardCost],
    ["Extras", r.extras],
    ["Otros costos", r.other],
    ["Honorarios", r.fees],
    ["Impuestos y derechos", r.taxes],
    ["Imprevistos", r.contingency],
  ];
  const max = Math.max(1, ...rows.map(([, v]) => v));
  return (
    <section className="ld-block">
      <h3>De qué se compone la inversión</h3>
      <ul className="ld-bars">
        {rows.map(([label, v]) => (
          <li key={label}>
            <span>{label}</span>
            <i style={{ width: `${(v / max) * 100}%` }} />
            <strong>{fmt(v)}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Sensitivity({ inputs, area, fmt }: { inputs: FinanceInputs; area: { built: number; sellable: number; lotArea: number; units?: number }; fmt: (v: number) => string }) {
  const rows = sensitivity(inputs, area);
  return (
    <section className="ld-block">
      <h3>¿Qué pasa si…?</h3>
      <table className="ld-table">
        <thead>
          <tr>
            <th>Cambio</th>
            <th>{inputs.mode === "venta" ? "Ganancia" : "Resultado a 20 años"}</th>
            <th>TIR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.label}${r.delta}`}>
              <td>{r.label.startsWith("Obra") ? r.label : `${r.label} ${r.delta > 0 ? "+" : "−"}${Math.round(Math.abs(r.delta) * 100)} %`}</td>
              <td className={r.profit < 0 ? "is-neg" : ""}>{fmt(r.profit)}</td>
              <td>{r.irr === null ? "—" : `${formatNumber(r.irr * 100, 1)} %`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Convenio({ fmt }: { fmt: (v: number) => string }) {
  const convenio = useLand((s) => s.convenio);
  const setConvenio = useLand((s) => s.setConvenio);
  const typeId = useLand((s) => s.typeId);
  const computed = useComputed();
  const { inputs, result } = useFinance(computed);
  const b = useConvenio(computed, inputs);
  const field = (k: "extraFotPct" | "extraHeight" | "contributionPct", label: string, unit: string) => {
    const input = convenio[k];
    return (
      <label className="ld-conv__field">
        <span>{label}</span>
        <span className="ld-conv__input">
          <input
            inputMode="decimal"
            defaultValue={input.value === null ? "" : String(input.value).replace(".", ",")}
            placeholder="cargar"
            onBlur={(e) => {
              const t = e.target.value.trim();
              const v = Number(t.replace(",", "."));
              setConvenio({ [k]: t === "" ? { ...input, value: null, status: "pending" } : Number.isFinite(v) ? { ...input, value: v, status: "cargado" } : input });
            }}
          />
          <em>{unit}</em>
        </span>
        <small>{input.note}</small>
      </label>
    );
  };
  return (
    <section className="ld-block ld-conv">
      <h3>Escenario con convenio urbanístico</h3>
      <p className="ld-muted">La Ord. 13.557 de la ciudad de Córdoba creó instrumentos (convenios urbanísticos, polígonos de actuación concertada) para construir más a cambio de un aporte. Cada caso se negocia: acá podés simularlo con tus supuestos.</p>
      <Toggle label="Simular escenario con convenio" summary="Sujeto a aprobación del municipio y del Concejo Deliberante." checked={convenio.enabled} onChange={(on) => setConvenio({ enabled: on })} />
      {convenio.enabled && typeId === "galpon" && <p className="ld-muted">Para galpones el convenio no cambia el resultado: la nave usa una sola planta.</p>}
      {convenio.enabled && (
        <>
          <div className="ld-conv__grid">
            {field("extraFotPct", "Más superficie (FOT)", "%")}
            {field("extraHeight", "Más altura", "m")}
            {field("contributionPct", "Aporte al municipio", "% del valor extra")}
          </div>
          {b && result && (
            <table className="ld-table">
              <thead>
                <tr>
                  <th />
                  <th>Hoy</th>
                  <th>Con convenio*</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Superficie cubierta</td>
                  <td>{formatNumber(Math.round(computed!.plan.built))} m²</td>
                  <td>{formatNumber(Math.round(b.plan.built))} m²</td>
                </tr>
                <tr>
                  <td>Plantas</td>
                  <td>{computed!.plan.floors.length}</td>
                  <td>{b.plan.floors.length}</td>
                </tr>
                <tr>
                  <td>Aporte estimado</td>
                  <td>—</td>
                  <td>{b.contribution === null ? "pendiente" : fmt(b.contribution)}</td>
                </tr>
                <tr>
                  <td>Inversión</td>
                  <td>{fmt(result.investment)}</td>
                  <td>{fmt(b.result.investment)}</td>
                </tr>
                <tr>
                  <td>Ganancia</td>
                  <td className={result.profit < 0 ? "is-neg" : ""}>{fmt(result.profit)}</td>
                  <td className={b.result.profit < 0 ? "is-neg" : ""}>{fmt(b.result.profit)}</td>
                </tr>
                <tr>
                  <td>TIR anual</td>
                  <td>{result.irr === null ? "—" : `${formatNumber(result.irr * 100, 1)} %`}</td>
                  <td>{b.result.irr === null ? "—" : `${formatNumber(b.result.irr * 100, 1)} %`}</td>
                </tr>
              </tbody>
            </table>
          )}
          <p className="ld-warnline">
            <CircleAlert aria-hidden /> *Escenario hipotético, sujeto a aprobación. {convenio.contributionPct.value === null ? "Sin el aporte cargado, la ganancia con convenio está sobrestimada." : ""}
          </p>
        </>
      )}
    </section>
  );
}

export function FinancePanel() {
  const typeId = useLand((s) => s.typeId);
  const mode = useLand((s) => s.mode);
  const goTo = useLand((s) => s.goTo);
  const setFinance = useLand((s) => s.setFinance);
  const saved = useLand((s) => s.finance[typeId]);
  const computed = useComputed();
  const { inputs, result, area } = useFinance(computed);
  const money = useMoney();
  const save = useSaveScenario();
  if (!inputs || !result || !area) return null;
  const set = (k: Key, i: Input) => setFinance(typeId, { ...inputs, [k]: i });
  const units = area.units ?? 0;
  const perUnit = inputs.basis === "unidad" && units > 1;
  const sale: Key = perUnit ? "salePerUnit" : "salePerM2";
  const rent: Key = perUnit ? "rentPerUnitMonth" : "rentPerM2Month";
  const keys: Key[] = ["land", "costPerM2", "extras", "other", "feesPct", "taxesPct", "contingencyPct", ...(inputs.mode === "venta" ? ([sale, "commissionPct", "saleMonths"] as Key[]) : ([rent, "vacancyPct", "opexPct"] as Key[])), "buildMonths", "fx"];
  return (
    <aside className="gp-panel gp-panel--config ld-panel ld-panel--wide" aria-label="Inversión">
      <header className="gp-panel__head">
        <div>
          <p className="ld-kicker">Paso 04 · Inversión</p>
          <h2>¿Cierra el negocio?</h2>
        </div>
        <div className="gp-segmented ld-mini" role="radiogroup" aria-label="Moneda">
          <button type="button" role="radio" aria-checked={!money.ars} className={!money.ars ? "is-selected" : ""} onClick={() => money.setArs(false)}>
            USD
          </button>
          <button type="button" role="radio" aria-checked={money.ars} className={money.ars ? "is-selected" : ""} disabled={!money.fx} title={money.fx ? undefined : "Cargá el tipo de cambio"} onClick={() => money.setArs(true)}>
            $
          </button>
        </div>
      </header>
      <div className="gp-panel__body">
        <TypeTabs />
        <PlanSummary />
        <div className="gp-segmented" role="radiogroup" aria-label="Venta o alquiler">
          {(["venta", "alquiler"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={inputs.mode === m} className={inputs.mode === m ? "is-selected" : ""} onClick={() => setFinance(typeId, { ...inputs, mode: m })}>
              {m === "venta" ? "Construir y vender" : "Construir y alquilar"}
            </button>
          ))}
        </div>
        {units > 1 && (
          <div className="gp-segmented" role="radiogroup" aria-label="Precio por m² o por unidad">
            {(["m2", "unidad"] as const).map((b) => (
              <button key={b} type="button" role="radio" aria-checked={(inputs.basis ?? "m2") === b} className={(inputs.basis ?? "m2") === b ? "is-selected" : ""} onClick={() => setFinance(typeId, { ...inputs, basis: b })}>
                {b === "m2" ? "Precio por m²" : `Precio por unidad (${units})`}
              </button>
            ))}
          </div>
        )}
        <Results r={result} mode={inputs.mode} fmt={money.fmt} perUnit={perUnit} />
        {mode === "pro" && <Breakdown r={result} fmt={money.fmt} />}
        <section className="ld-rules">
          <div className="ld-rules__head">
            <h3>Datos de la simulación</h3>
            {saved && (
              <button type="button" className="ld-link" onClick={() => setFinance(typeId, undefined)}>
                <RotateCcw aria-hidden /> Valores de referencia
              </button>
            )}
          </div>
          <ul>
            {keys.filter((k) => mode === "pro" || ["land", "costPerM2", "salePerM2", "rentPerM2Month", "salePerUnit", "rentPerUnitMonth", "buildMonths", "extras", "fx"].includes(k)).map((k) => (
              <InputRow key={`${k}-${inputs[k].value}`} k={k} input={inputs[k]} onChange={(i) => set(k, i)} />
            ))}
          </ul>
          {mode === "simple" && <p className="ld-muted">En modo profesional ves y cambiás honorarios, impuestos, imprevistos, comisión y el detalle de la inversión.</p>}
        </section>
        {mode === "pro" && <Sensitivity inputs={inputs} area={area} fmt={money.fmt} />}
        <Convenio fmt={money.fmt} />
      </div>
      <footer className="gp-panel__foot gp-panel__nav">
        <button type="button" className="gp-button" onClick={save}>
          <Save aria-hidden /> Guardar escenario
        </button>
        <button type="button" className="gp-button gp-button--primary" onClick={() => goTo("informe")}>
          Informe <ArrowRight aria-hidden />
        </button>
      </footer>
      <button type="button" className="ld-backlink" onClick={() => goTo("customizar")}>
        <ArrowLeft aria-hidden /> Customizar
      </button>
    </aside>
  );
}
