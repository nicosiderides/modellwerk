"use client";

import { useState } from "react";
import { Check, Download, Send } from "lucide-react";
import { formatNumber } from "@/core/galpones/metrics";
import { calculateMetrics } from "@/core/galpones/metrics";
import { structureLabel } from "@/core/galpones/configuration";
import { httpTransport, localDraftTransport, submitWarehouseQuote, validateContact, type QuoteContact, type QuoteResult, type WarehouseQuoteRequest } from "@/core/galpones/quote";
import { Modal } from "./Modal";
import { downloadJson } from "./WarehouseSummary";
import { definitionOf, useGalpones } from "./store";

const EMPTY: QuoteContact = { name: "", company: "", email: "", phone: "", city: "", projectLocation: "", comments: "" };

const FIELDS: { key: keyof QuoteContact; label: string; type?: string; required?: boolean; wide?: boolean; autoComplete?: string }[] = [
  { key: "name", label: "Nombre y apellido", required: true, autoComplete: "name" },
  { key: "company", label: "Empresa", autoComplete: "organization" },
  { key: "email", label: "Email", type: "email", required: true, autoComplete: "email" },
  { key: "phone", label: "Teléfono", type: "tel", autoComplete: "tel" },
  { key: "city", label: "Ciudad", autoComplete: "address-level2" },
  { key: "projectLocation", label: "Ubicación de la obra" },
  { key: "comments", label: "Comentarios", wide: true },
];

export function QuoteModal() {
  const definition = useGalpones((s) => definitionOf(s));
  const config = useGalpones((s) => s.warehouse.config);
  const [contact, setContact] = useState<QuoteContact>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof QuoteContact, string>>>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ result: QuoteResult; request: WarehouseQuoteRequest } | null>(null);
  if (!definition || !config) return null;
  const m = calculateMetrics(config, definition);

  const submit = async () => {
    const found = validateContact(contact);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSending(true);
    const endpoint = process.env.NEXT_PUBLIC_GALPONES_QUOTE_ENDPOINT;
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    const transport = endpoint ? httpTransport(endpoint) : localDraftTransport(storage);
    setDone(await submitWarehouseQuote(contact, config, definition, transport));
    setSending(false);
  };

  if (done) {
    return (
      <Modal title={done.result.ok ? "Solicitud registrada" : "No se pudo enviar"} kicker="Pedido de presupuesto">
        {done.result.ok ? (
          <div className="gp-quote-done">
            <span className="gp-quote-done__icon"><Check aria-hidden /></span>
            <p>
              Referencia <code>{done.result.reference}</code>
            </p>
            <p className="gp-field__hint">
              {done.result.mode === "local-draft"
                ? "Modo demo: la solicitud quedó guardada en este navegador con la configuración completa adjunta. No se envió a ningún servidor."
                : "Recibimos tu solicitud con la configuración completa adjunta."}
            </p>
            <button type="button" className="gp-button" onClick={() => downloadJson(`solicitud-${done.result.ok ? done.result.reference : "galpon"}.json`, done.request)}>
              <Download aria-hidden /> Descargar solicitud (JSON)
            </button>
          </div>
        ) : (
          <p className="gp-issue gp-issue--warning">{done.result.error}</p>
        )}
      </Modal>
    );
  }

  return (
    <Modal title="Solicitar presupuesto" kicker={`${definition.code} · ${definition.name}`} wide>
      <div className="gp-quote">
        <form
          className="gp-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          noValidate
        >
          {FIELDS.map((f) => (
            <label key={f.key} className={`gp-form__field ${f.wide ? "is-wide" : ""} ${errors[f.key] ? "has-error" : ""}`}>
              <span>
                {f.label}
                {f.required && " *"}
              </span>
              {f.wide ? (
                <textarea rows={3} value={contact[f.key]} onChange={(e) => setContact({ ...contact, [f.key]: e.target.value })} />
              ) : (
                <input type={f.type ?? "text"} autoComplete={f.autoComplete} value={contact[f.key]} onChange={(e) => setContact({ ...contact, [f.key]: e.target.value })} />
              )}
              {errors[f.key] && <em>{errors[f.key]}</em>}
            </label>
          ))}
          <button type="submit" className="gp-button gp-button--primary gp-button--large" disabled={sending}>
            <Send aria-hidden /> {sending ? "Enviando…" : "Enviar solicitud"}
          </button>
        </form>
        <aside className="gp-quote__summary">
          <p className="gp-kicker">Se adjunta la configuración</p>
          <dl className="gp-deflist">
            <div><dt>Medidas</dt><dd>{formatNumber(config.dimensions.width)} × {formatNumber(config.dimensions.length)} m</dd></div>
            <div><dt>Superficie</dt><dd>{formatNumber(m.floorArea)} m²</dd></div>
            <div><dt>Alero</dt><dd>{formatNumber(config.dimensions.eaveHeight, 1)} m</dd></div>
            <div><dt>Estructura</dt><dd>{structureLabel(definition, config.structure)}</dd></div>
            <div><dt>Cubierta</dt><dd>{definition.envelope.roof.find((r) => r.id === config.envelope.roof)?.name}</dd></div>
            <div><dt>Cerramientos</dt><dd>{definition.envelope.walls.find((r) => r.id === config.envelope.walls)?.name}</dd></div>
          </dl>
          <p className="gp-field__hint">Tus datos sólo se usan para responder esta consulta.</p>
        </aside>
      </div>
    </Modal>
  );
}
