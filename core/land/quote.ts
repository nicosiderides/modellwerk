import type { QuoteContact } from "../galpones/quote.ts";

/**
 * Pedido de presupuesto de MW Land. Igual que en Galpones: si existe
 * NEXT_PUBLIC_LAND_QUOTE_ENDPOINT se envía por POST a esa dirección; si no,
 * queda guardado en el navegador como borrador (no se manda a nadie) y se
 * puede descargar con todos los datos del lote y del edificio.
 */

export type LandQuoteRequest = {
  schema: "mw.land.quote/1";
  createdAt: string;
  contact: QuoteContact;
  lot: { nomenclatura: string; designacion: string; cuenta: string | null; superficie: number; zona: string };
  building: { tipo: string; plantas: number; superficieCubierta: number; superficieVendible: number; unidades: number; altura: number };
  memoria: { title: string; text: string }[];
  /** Escenario completo (lote, tipo, diseño y números) para rearmarlo en MW Land. */
  scenario: unknown;
};

export type LandQuoteResult = { ok: true; reference: string; mode: "api" | "local-draft" } | { ok: false; error: string };

const DRAFTS_KEY = "mw-land:quote-drafts:v1";

export function quoteReference(now = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `MWL-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

export async function sendLandQuote(request: LandQuoteRequest, endpoint: string | undefined, storage: Pick<Storage, "getItem" | "setItem"> | null): Promise<LandQuoteResult> {
  if (endpoint) {
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
      if (!res.ok) return { ok: false, error: `El servidor respondió ${res.status}` };
      const body = (await res.json().catch(() => ({}))) as { reference?: string };
      return { ok: true, reference: body.reference ?? quoteReference(new Date(request.createdAt)), mode: "api" };
    } catch {
      return { ok: false, error: "No se pudo conectar con el servidor" };
    }
  }
  const reference = quoteReference(new Date(request.createdAt));
  try {
    const list = JSON.parse(storage?.getItem(DRAFTS_KEY) ?? "[]") as unknown[];
    list.unshift({ reference, ...request });
    storage?.setItem(DRAFTS_KEY, JSON.stringify(list.slice(0, 20)));
  } catch {
    // Sin almacenamiento: igual se puede descargar.
  }
  return { ok: true, reference, mode: "local-draft" };
}
