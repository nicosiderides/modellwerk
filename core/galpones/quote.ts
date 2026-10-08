import { calculateMetrics } from "./metrics.ts";
import { generateTechnicalDescription } from "./description.ts";
import { serializeConfig, type SerializedWarehouseConfig } from "./storage.ts";
import type { WarehouseConfig, WarehouseDefinition } from "./types.ts";

/**
 * Solicitud de presupuesto. Frontera preparada para una API futura.
 *
 * Hoy: si existe NEXT_PUBLIC_GALPONES_QUOTE_ENDPOINT se hace POST JSON a esa URL;
 * si no, la solicitud se guarda como borrador local (sin enviar nada a terceros).
 */

export type QuoteContact = {
  name: string;
  company: string;
  email: string;
  phone: string;
  city: string;
  projectLocation: string;
  comments: string;
};

export type WarehouseQuoteRequest = {
  schema: "mw.galpones.quote/1";
  createdAt: string;
  contact: QuoteContact;
  warehouseConfiguration: SerializedWarehouseConfig;
  summary: {
    warehouse: string;
    variant?: string;
    floorArea: number;
    clearSpan: number;
    buildingHeight: number;
    description: string[];
  };
};

export type QuoteResult =
  | { ok: true; reference: string; mode: "api" | "local-draft" }
  | { ok: false; error: string };

export type QuoteTransport = (request: WarehouseQuoteRequest) => Promise<QuoteResult>;

export function validateContact(contact: QuoteContact): Partial<Record<keyof QuoteContact, string>> {
  const errors: Partial<Record<keyof QuoteContact, string>> = {};
  if (!contact.name.trim()) errors.name = "Ingresá tu nombre";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact.email.trim())) errors.email = "Revisá el email";
  if (contact.phone.trim() && !/^[+()\d\s-]{6,}$/.test(contact.phone.trim())) errors.phone = "Revisá el teléfono";
  return errors;
}

export function buildQuoteRequest(contact: QuoteContact, config: WarehouseConfig, definition: WarehouseDefinition, now = new Date()): WarehouseQuoteRequest {
  const metrics = calculateMetrics(config, definition);
  return {
    schema: "mw.galpones.quote/1",
    createdAt: now.toISOString(),
    contact,
    warehouseConfiguration: serializeConfig(config, now),
    summary: {
      warehouse: definition.name,
      variant: config.variant,
      floorArea: metrics.floorArea,
      clearSpan: metrics.clearSpan,
      buildingHeight: metrics.buildingHeight,
      description: generateTechnicalDescription(config, definition),
    },
  };
}

function reference(now = new Date()) {
  const stamp = now.toISOString().slice(2, 10).replace(/-/g, "");
  return `GP-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

/** Transporte HTTP para la API futura. */
export function httpTransport(endpoint: string): QuoteTransport {
  return async (request) => {
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
      if (!response.ok) return { ok: false, error: `El servidor respondió ${response.status}` };
      const body = (await response.json().catch(() => ({}))) as { reference?: string };
      return { ok: true, reference: body.reference ?? reference(), mode: "api" };
    } catch {
      return { ok: false, error: "No se pudo conectar con el servidor" };
    }
  };
}

const DRAFTS_KEY = "mw-galpones:quote-drafts:v1";

/** Transporte local: guarda la solicitud en el navegador. */
export function localDraftTransport(storage: Pick<Storage, "getItem" | "setItem"> | null): QuoteTransport {
  return async (request) => {
    const ref = reference(new Date(request.createdAt));
    try {
      const list = JSON.parse(storage?.getItem(DRAFTS_KEY) ?? "[]") as unknown[];
      list.unshift({ reference: ref, ...request });
      storage?.setItem(DRAFTS_KEY, JSON.stringify(list.slice(0, 20)));
    } catch {
      // Sin almacenamiento disponible: la solicitud igual se puede descargar.
    }
    return { ok: true, reference: ref, mode: "local-draft" };
  };
}

/** submitWarehouseQuote — punto único de envío. */
export async function submitWarehouseQuote(
  contact: QuoteContact,
  config: WarehouseConfig,
  definition: WarehouseDefinition,
  transport: QuoteTransport
): Promise<{ result: QuoteResult; request: WarehouseQuoteRequest }> {
  const request = buildQuoteRequest(contact, config, definition);
  const result = await transport(request);
  return { result, request };
}
