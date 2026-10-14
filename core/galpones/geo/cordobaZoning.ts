import type { LotRules, LotZone } from "../types.ts";

/**
 * Normativa de Córdoba capital a partir de las capas de Mapas Córdoba (IDECOR):
 *   - Ord. 8256 (ocupación del suelo): FOS, FOT, alturas y retiros por zona.
 *   - Ord. 8133 (uso del suelo): patrón de actividades permitidas.
 *
 * Los números que la capa trae como dato (FOS, FOT, altura, retiros en metros)
 * se toman tal cual. Lo que viene como texto (por ejemplo, retiros laterales
 * que dependen del ancho del frente) se interpreta para las zonas industriales
 * y queda marcado "a confirmar".
 */

export const MAPAS_CORDOBA_URL = "https://www.mapascordoba.gob.ar/#/geoservicios";

export type Ord8256Props = {
  perfil_o_zona?: string | null;
  fos?: number | null;
  fot?: number | null;
  altura_maxima?: number | null;
  retiro_frente?: string | null;
  otros_retiros?: string | null;
  observacion?: string | null;
  actividad_industrial?: string | null;
  caracter_urbanistico?: string | null;
};

export type Ord8133Props = { patron?: string | null; descripcion?: string | null; localizacion?: string | null };

type Source = { text: string; url?: string; verified: boolean };

const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const num = (v: string) => Number(v.replace(",", "."));
const short = (v: string, n = 140) => (v.length > n ? `${v.slice(0, n - 1)}…` : v);

/** "10 m", "Retiro a 6 m de la Línea…", "USO INDUSTRIAL: 20,00 mts…" → metros. */
export function parseMeters(text: string | null | undefined): number | null {
  const t = clean(text);
  if (!t) return null;
  let m = t.match(/USO INDUSTRIAL:\s*(\d+(?:[.,]\d+)?)/i);
  if (m) return num(m[1]);
  m = t.match(/^(\d+(?:[.,]\d+)?)\s*m/i) ?? t.match(/^Retiro (?:a|de)\s*(\d+(?:[.,]\d+)?)\s*m/i);
  if (m) return num(m[1]);
  if (/^S\/\s*L[íi]nea (Municipal|de Edificaci)/i.test(t)) return 0;
  return null;
}

/** Retiro de fondo dentro del texto "otros retiros". */
export function parseBack(text: string | null | undefined): number | null {
  const m = clean(text).match(/FONDO:?\s*(\d+(?:[.,]\d+)?)\s*m/i);
  return m ? num(m[1]) : null;
}

export type ZoneResult = { rules: Partial<LotRules>; zone: LotZone };

/** Patrón de uso del suelo (Ord. 8133) → compatibilidad con un galpón industrial. */
export function classifyUse(patron: string | null | undefined): Pick<LotZone, "uso" | "usoTexto"> {
  const p = clean(patron);
  if (!p) return { uso: "desconocido", usoTexto: "Sin dato de uso del suelo para esta ubicación" };
  if (/^(IVa|IVb|V)$/.test(p)) return { uso: "industrial", usoTexto: `Patrón ${p}: zona para actividades industriales` };
  if (/^III[abc]/.test(p) || /^II[abc]/.test(p)) return { uso: "condicionado", usoTexto: `Patrón ${p}: industria compatible con restricciones (según la actividad)` };
  if (/^I[abcd]\b|^AE$/.test(p)) return { uso: "condicionado", usoTexto: `Patrón ${p}: sólo actividades de pequeña escala` };
  return { uso: "no", usoTexto: `Patrón ${p}: zona no prevista para industria` };
}

/**
 * Reglas del lote a partir de la zona de la Ord. 8256 (y el patrón de la 8133).
 * `frontWidth` es el ancho del frente del lote: algunas zonas cambian los
 * retiros laterales o el FOS según ese ancho.
 */
export function zoneFromCordoba(z8256: Ord8256Props | null, z8133: Ord8133Props | null, frontWidth: number): ZoneResult | null {
  if (!z8256 && !z8133) return null;
  const perfil = clean(z8256?.perfil_o_zona) || "s/d";
  const use = classifyUse(z8133?.patron);
  const notes: string[] = [];
  const sources: LotZone["sources"] = {};
  const rules: Partial<LotRules> = {
    minArea: null,
    minFront: null,
    fos: null,
    fot: null,
    maxHeight: null,
    setbackFront: null,
    setbackSide: null,
    sideCount: null,
    setbackBack: null,
  };
  const layer = (what: string): Source => ({ text: `Ord. 8256 · zona ${perfil}: ${what} (capa de Mapas Córdoba / IDECOR)`, url: MAPAS_CORDOBA_URL, verified: true });
  const read = (what: string): Source => ({ text: `Ord. 8256 · zona ${perfil}: interpretado del texto «${short(what)}»`, url: MAPAS_CORDOBA_URL, verified: false });

  if (z8256) {
    if (typeof z8256.fos === "number" && z8256.fos > 0) {
      rules.fos = z8256.fos / 100;
      sources.fos = layer(`FOS ${z8256.fos} %`);
    }
    if (typeof z8256.fot === "number" && z8256.fot > 0) {
      rules.fot = z8256.fot;
      sources.fot = layer(`FOT ${z8256.fot}`);
    }
    if (typeof z8256.altura_maxima === "number" && z8256.altura_maxima > 0) {
      rules.maxHeight = z8256.altura_maxima;
      sources.maxHeight = layer(`altura máxima ${z8256.altura_maxima} m`);
    } else if (z8256.altura_maxima === 0) {
      sources.maxHeight = layer("altura sin limitaciones");
    }
    const front = parseMeters(z8256.retiro_frente);
    if (front !== null) {
      rules.setbackFront = front;
      sources.setbackFront = layer(`retiro de frente «${short(clean(z8256.retiro_frente), 60)}»`);
    } else if (clean(z8256.retiro_frente)) {
      notes.push(`Retiro de frente: «${short(clean(z8256.retiro_frente), 120)}». Cargalo a mano cuando lo confirmes.`);
    }
    const back = parseBack(z8256.otros_retiros);
    if (back !== null) {
      rules.setbackBack = back;
      sources.setbackBack = read(clean(z8256.otros_retiros));
    }
  }

  // Zonas industriales: retiros laterales y FOS que dependen del frente.
  const others = clean(z8256?.otros_retiros);
  switch (perfil) {
    case "L": {
      // "Frente inferior a 25 m FOS 80, mayor a 25 m FOS 60". Laterales: <25 m no; 25–60 m uno; >60 m ambos; 1/3 de la altura, no menos de 6 m.
      rules.fos = frontWidth < 25 ? 0.8 : 0.6;
      sources.fos = read(clean(z8256?.observacion));
      rules.setbackSide = frontWidth < 25 ? null : 6;
      rules.sideCount = frontWidth < 25 ? 0 : frontWidth <= 60 ? 1 : 2;
      sources.setbackSide = read(others);
      if (frontWidth >= 25) notes.push("Retiro lateral: 1/3 de la altura del galpón, nunca menos de 6 m (con galpones de hasta 18 m de alto rigen los 6 m).");
      break;
    }
    case "M":
      rules.setbackSide = 15;
      rules.sideCount = 2;
      rules.setbackBack = 15;
      sources.setbackSide = read(others);
      sources.setbackBack = read(others);
      break;
    case "N":
      rules.setbackSide = 20;
      rules.sideCount = 2;
      rules.setbackBack = 20;
      sources.setbackSide = read(others);
      sources.setbackBack = read(others);
      notes.push("Zona rural e industrial: los retiros de 20 m son para uso industrial.");
      break;
    case "N1":
      rules.setbackSide = 3;
      rules.sideCount = 2;
      sources.setbackSide = read(others);
      break;
    case "J1":
    case "J2":
      if (frontWidth >= 18) {
        rules.setbackSide = 4;
        rules.sideCount = frontWidth >= 22 ? 2 : 1;
        sources.setbackSide = read(others);
        if (frontWidth >= 22) {
          rules.setbackBack = 4;
          sources.setbackBack = read(others);
        }
        notes.push("Retiros: 1/3 de la altura, nunca menos de 4 m.");
      }
      break;
    default:
      if (others && !/^(\s|-)*$/.test(others)) notes.push(`Otros retiros: «${short(others, 160)}».`);
  }
  if (perfil === "K" || /Art\.?\s*9/i.test(clean(z8256?.retiro_frente))) {
    notes.push("Esta zona remite al Art. 9 de la Ord. 8256 para el retiro de frente: confirmalo en la Municipalidad.");
  }
  notes.push("Confirmá que tu actividad esté permitida en la grilla de la Ord. 8133 y los retiros en el Plano de Retiros de la Línea de Edificación.");

  const kind = clean(z8256?.actividad_industrial);
  const label = `Zona ${perfil}${kind ? ` · ${kind.charAt(0)}${kind.slice(1).toLowerCase()}` : ""}`;
  return {
    rules,
    zone: { perfil, label, patron: clean(z8133?.patron) || null, ...use, notes, rules: { ...rules }, sources },
  };
}
