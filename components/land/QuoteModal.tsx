"use client";

import { useEffect, useState } from "react";
import { Check, Download, Send, X } from "lucide-react";
import { downloadJson } from "@/components/galpones/WarehouseSummary";
import { formatNumber } from "@/core/galpones/metrics";
import { validateContact, type QuoteContact } from "@/core/galpones/quote";
import { BUILDING_TYPES } from "@/core/land/buildingTypes";
import { LAND_SPECS } from "@/core/land/design/catalog";
import { memory } from "@/core/land/design/costs";
import { sendLandQuote, type LandQuoteRequest, type LandQuoteResult } from "@/core/land/quote";
import { useCurrentScenario } from "./scenarios";
import { GALPON_DEFS, useLand } from "./store";
import { isLandType, useComputed } from "./useDesign";

/** Pedido de presupuesto (igual que en Galpones): se adjunta el lote, el edificio y su memoria descriptiva. */

const EMPTY: QuoteContact = { name: "", company: "", email: "", phone: "", city: "", projectLocation: "", comments: "" };
const FIELDS: { key: keyof QuoteContact; label: string; type?: string; required?: boolean; wide?: boolean; autoComplete?: string }[] = [
  { key: "name", label: "Nombre y apellido", required: true, autoComplete: "name" },
  { key: "company", label: "Empresa", autoComplete: "organization" },
  { key: "email", label: "Email", type: "email", required: true, autoComplete: "email" },
  { key: "phone", label: "Teléfono", type: "tel", autoComplete: "tel" },
  { key: "comments", label: "Comentarios", wide: true },
];

export function QuoteModal({ onClose }: { onClose: () => void }) {
  const study = useLand((s) => s.study);
  const typeId = useLand((s) => s.typeId);
  const design = useLand((s) => s.design);
  const computed = useComputed();
  const scenario = useCurrentScenario();
  const [contact, setContact] = useState<QuoteContact>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof QuoteContact, string>>>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ result: LandQuoteResult; request: LandQuoteRequest } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!study || !computed || !design || !scenario) return null;
  const p = study.parcel.properties;
  const plan = computed.plan;
  const type = BUILDING_TYPES.find((t) => t.id === typeId)!;
  const galpon = typeId === "galpon" && design.galpon ? GALPON_DEFS.find((d) => d.id === design.galpon!.warehouseId) : null;
  const mem = isLandType(typeId) && design.land[typeId] ? memory(LAND_SPECS[typeId], design.land[typeId]!) : galpon ? [{ title: galpon.name, text: galpon.description }] : [];

  const submit = async () => {
    const found = validateContact(contact);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSending(true);
    const request: LandQuoteRequest = {
      schema: "mw.land.quote/1",
      createdAt: new Date().toISOString(),
      contact: { ...contact, projectLocation: String(p.desig_oficial ?? p.Nomenclatura ?? "").trim(), city: String(p.localidad ?? "") },
      lot: { nomenclatura: String(p.Nomenclatura ?? ""), designacion: String(p.desig_oficial ?? "").trim(), cuenta: p.Nro_Cuenta ? String(p.Nro_Cuenta) : null, superficie: Math.round(computed.envelope.lotArea), zona: study.zone?.label ?? "" },
      building: { tipo: type.name, plantas: plan.floors.length, superficieCubierta: Math.round(plan.built), superficieVendible: Math.round(plan.sellable), unidades: plan.units, altura: Math.round(plan.height * 10) / 10 },
      memoria: mem,
      scenario,
    };
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    const result = await sendLandQuote(request, process.env.NEXT_PUBLIC_LAND_QUOTE_ENDPOINT, storage);
    setDone({ result, request });
    setSending(false);
  };

  return (
    <div className="gp-modal ld-quote" role="dialog" aria-modal="true" aria-label="Pedir presupuesto" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gp-modal__card is-wide">
        <header className="gp-modal__head">
          <div>
            <p className="gp-kicker">Pedido de presupuesto</p>
            <h2>{done ? (done.result.ok ? "Pedido registrado" : "No se pudo enviar") : `${type.name} · ${String(p.desig_oficial ?? "").trim()}`}</h2>
          </div>
          <button type="button" className="gp-ghost" onClick={onClose} aria-label="Cerrar">
            <X aria-hidden />
          </button>
        </header>
        <div className="gp-modal__body">
          {done ? (
            done.result.ok ? (
              <div className="gp-quote-done">
                <span className="gp-quote-done__icon">
                  <Check aria-hidden />
                </span>
                <p>
                  Referencia <code>{done.result.reference}</code>
                </p>
                <p className="gp-field__hint">{done.result.mode === "local-draft" ? "Modo demo: el pedido quedó guardado en este navegador con el lote, el edificio y la memoria descriptiva. No se envió a ningún servidor." : "Recibimos tu pedido con todos los datos adjuntos."}</p>
                <button type="button" className="gp-button" onClick={() => downloadJson(`pedido-${done.result.ok ? done.result.reference : "mw-land"}.json`, done.request)}>
                  <Download aria-hidden /> Descargar pedido (JSON)
                </button>
              </div>
            ) : (
              <p className="gp-issue gp-issue--warning">{done.result.error}</p>
            )
          ) : (
            <div className="gp-quote">
              <form
                className="gp-form"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                {FIELDS.map((f) => (
                  <label key={f.key} className={`gp-form__field ${f.wide ? "is-wide" : ""} ${errors[f.key] ? "has-error" : ""}`}>
                    <span>
                      {f.label}
                      {f.required && " *"}
                    </span>
                    {f.wide ? <textarea rows={3} value={contact[f.key]} onChange={(e) => setContact({ ...contact, [f.key]: e.target.value })} /> : <input type={f.type ?? "text"} autoComplete={f.autoComplete} value={contact[f.key]} onChange={(e) => setContact({ ...contact, [f.key]: e.target.value })} />}
                    {errors[f.key] && <em>{errors[f.key]}</em>}
                  </label>
                ))}
                <button type="submit" className="gp-button gp-button--primary gp-button--large" disabled={sending}>
                  <Send aria-hidden /> {sending ? "Enviando…" : "Enviar pedido"}
                </button>
              </form>
              <aside className="gp-quote__summary">
                <p className="gp-kicker">Se adjunta</p>
                <dl className="gp-deflist">
                  <div>
                    <dt>Lote</dt>
                    <dd>
                      {String(p.desig_oficial ?? p.Nomenclatura ?? "").trim()} · {formatNumber(Math.round(computed.envelope.lotArea))} m²
                    </dd>
                  </div>
                  <div>
                    <dt>Edificio</dt>
                    <dd>{type.name}</dd>
                  </div>
                  <div>
                    <dt>Superficie</dt>
                    <dd>{formatNumber(Math.round(plan.built))} m² cubiertos</dd>
                  </div>
                  <div>
                    <dt>Plantas</dt>
                    <dd>{plan.floors.length}</dd>
                  </div>
                </dl>
                <p className="gp-field__hint">Con la memoria descriptiva completa. Tus datos sólo se usan para responder esta consulta.</p>
              </aside>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
