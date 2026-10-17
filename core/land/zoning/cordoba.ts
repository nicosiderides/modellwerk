import { classifyUse } from "../../galpones/geo/cordobaZoning.ts";
import NORMS from "../../../data/land/normativa/cordoba.json" with { type: "json" };
import type { BuildingTypeId, LandRules, LandZone, Source, Sourced, UpperSetback, UseGroup, UseVerdict } from "../types.ts";

/**
 * Normativa de Córdoba capital para MW Land, a partir de las capas oficiales
 * de Mapas Córdoba (IDECOR):
 *   - Ord. 8256 (ocupación del suelo): FOS, FOT, alturas, retiros, densidad, carácter de la zona.
 *   - Ord. 8133 (uso del suelo): patrón de actividades (sirve sobre todo para industria).
 *
 * Regla de oro: no se inventa nada. Lo que la capa trae como número es "dato";
 * lo que viene como texto y se lee con reglas es "interpretado"; lo que no se
 * puede leer queda como "falta" (a verificar).
 */

/** Reglas por perfil, fuentes y fechas: en un archivo de datos aparte (data/land/normativa/cordoba.json). */
type Amount = { valor?: number; valorIndustrial?: number; minimo?: number; divisorAltura?: number };
type PerfilRules = { fuente: string; lateral?: Amount & { lados: { frenteDesde: number; lados: 1 | 2 }[] }; fondo?: Amount & { frenteDesde?: number }; nota?: string };
export type CityNorms = {
  ciudad: string;
  actualizado: string;
  fuentes: Record<"mapas" | "graficos", { nombre: string; url: string; fecha: string }>;
  ordenanzas: { id: string; nombre: string; uso: string }[];
  alturaReferenciaSinDato: number;
  perfiles: Record<string, PerfilRules>;
  fraccionamiento: { ordenanza: string; frenteMinimo: number | null; superficieMinima: number | null; estado: string; nota: string };
  planoLimite45: { estado: string; nota: string };
};
export const CORDOBA_NORMS = NORMS as CityNorms;

export const MAPAS_CORDOBA_URL = CORDOBA_NORMS.fuentes.mapas.url;
export const GRAFICOS_URL = CORDOBA_NORMS.fuentes.graficos.url;

/** Todos los campos de la capa CBA_Ordenanza_8256. */
export type Ord8256Full = {
  ocupacion_del_suelo?: string | null;
  ord_y_perfil?: string | null;
  ord_original?: string | null;
  ord_modificatoria?: string | null;
  art_ord?: string | null;
  perfil_o_zona?: string | null;
  zona?: string | null;
  grafico?: string | null;
  enlace_grafico?: string | null;
  caracter_urbanistico?: string | null;
  actividad_industrial?: string | null;
  fos?: number | null;
  fot?: number | null;
  retiro_frente?: string | null;
  retiro_le?: string | null;
  otros_retiros?: string | null;
  otras_disposiciones?: string | null;
  altura_lm?: number | null;
  altura_maxima?: number | null;
  plano_a_45?: string | null;
  altura_perim?: string | null;
  pisos_lm?: string | null;
  pisos_maximos?: string | null;
  n_pisos_li?: string | null;
  cantidad_unidades?: string | null;
  observacion?: string | null;
  informacion_adicional?: string | null;
};

export type Ord8133Full = { patron?: string | null; descripcion?: string | null; localizacion?: string | null };

/** Datos del lote que cambian algunas reglas. */
export type LotFacts = { frontWidth: number; area: number; corner: boolean };

const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const num = (v: string) => Number(v.replace(",", "."));
const short = (v: string, n = 120) => (v.length > n ? `${v.slice(0, n - 1)}…` : v);
const cap = (v: string) => (v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : v);

/* ─────────────────────────── lectura de textos ─────────────────────────── */

/** "Planta Baja + 7 pisos" / "PB + 4 pisos (…)" → 8 / 5 plantas en total. */
export function parseFloors(text: string | null | undefined): number | null {
  const t = clean(text);
  const m = t.match(/(?:Planta Baja|PB)\s*\+\s*(\d+)\s*(?:pisos?|plantas?)/i);
  return m ? Number(m[1]) + 1 : null;
}

/** "1 cada 250m² de Superficie de Parcela" / "UF: 1 c/100m2…" → 250 / 100 (m² de lote por unidad). */
export function parseAreaPerUnit(text: string | null | undefined): number | null {
  const m = clean(text).match(/1\s*(?:cada|c\/)\s*(\d+(?:[.,]\d+)?)\s*m/i);
  return m ? num(m[1]) : null;
}

/** Retiro en altura escrito como texto. */
export function parseUpperSetback(text: string | null | undefined): UpperSetback | null {
  const t = clean(text);
  const from = t.match(/a partir de (?:los )?(\d+(?:[.,]\d+)?)\s*m/i);
  if (!from) return null;
  const axis = t.match(/retiro (?:a|de) (\d+(?:[.,]\d+)?)\s*m (?:del|al) eje/i);
  if (axis) return { from: num(from[1]), dist: num(axis[1]), ref: "eje" };
  const line = t.match(/retiro (?:a|de)?\s*(\d+(?:[.,]\d+)?)\s*m (?:de la|desde la?|desde) L[íi]nea/i) ?? t.match(/retiro L\.?E\.? a (\d+(?:[.,]\d+)?)\s*m/i);
  if (line) return { from: num(from[1]), dist: num(line[1]), ref: "linea" };
  return null;
}

/** Retiro de frente en planta baja. */
export function parseFront(text: string | null | undefined, group: UseGroup): { value: number | null; kind: "dato" | "interpretado" | "falta" } {
  const t = clean(text);
  if (!t) return { value: null, kind: "falta" };
  const split = t.match(/USO INDUSTRIAL:\s*(\d+(?:[.,]\d+)?)\s*mts?.*VIVIENDA[^:]*:\s*(\d+(?:[.,]\d+)?)/i);
  if (split) return { value: num(group === "industrial" ? split[1] : split[2]), kind: "interpretado" };
  if (/^S\/\s*L[íi]nea/i.test(t)) return { value: 0, kind: "interpretado" };
  if (/^A partir de/i.test(t)) return { value: 0, kind: "interpretado" };
  if (/^Retiro .*a partir de/i.test(t) && !/^Retiro a \d+(?:[.,]\d+)?\s*m\s*$/i.test(t)) return { value: 0, kind: "interpretado" };
  let m = t.match(/^(\d+(?:[.,]\d+)?)\s*m\b/i);
  if (m) return { value: num(m[1]), kind: "dato" };
  m = t.match(/^Retiro a (\d+(?:[.,]\d+)?)\s*m\s*$/i);
  if (m) return { value: num(m[1]), kind: "dato" };
  return { value: null, kind: "falta" };
}

/** Retiro de fondo dentro de un texto ("Retiro de Fondo: 3m", "FONDO 10 m"). */
export function parseBack(text: string | null | undefined): number | null {
  const m = clean(text).match(/FONDO:?\s*(\d+(?:[.,]\d+)?)\s*m/i);
  return m ? num(m[1]) : null;
}

/* ─────────────────────────── reglas ─────────────────────────── */

const src = (kind: Source["kind"], text: string): Source => ({ kind, text, url: MAPAS_CORDOBA_URL });
const val = <T>(value: T | null, source: Source): Sourced<T> => ({ value, source });
const missing = <T>(what: string): Sourced<T> => ({ value: null, source: { kind: "falta", text: `${what}: la capa oficial no lo trae. A verificar en la Municipalidad.` } });

function rulesFor(z: Ord8256Full, group: UseGroup, lot: LotFacts, notes: Set<string>): LandRules {
  const perfil = clean(z.perfil_o_zona) || "s/d";
  const layer = (what: string) => src("dato", `Ord. 8256 · zona ${perfil}: ${what} (capa de Mapas Córdoba / IDECOR)`);
  const read = (what: string) => src("interpretado", `Ord. 8256 · zona ${perfil}: leído del texto «${short(what)}»`);

  /* FOS */
  let fos: Sourced<number> = typeof z.fos === "number" && z.fos > 0 ? val(z.fos / 100, layer(`FOS ${z.fos} %`)) : missing("FOS");
  const od = clean(z.otras_disposiciones);
  const byArea = od.match(/FOS:\s*sup\.?\s*parcela\s*<\s*(\d+)\s*m2?\s*=\s*(\d+)\s*%\s*-\s*sup\.?\s*parcela\s*≥\s*\d+\s*m?2?\s*=\s*(\d+)\s*%/i);
  if (byArea) {
    const limit = Number(byArea[1]);
    fos = val((lot.area < limit ? Number(byArea[2]) : Number(byArea[3])) / 100, read(od));
  }
  const obs = clean(z.observacion);
  const byFront = obs.match(/inferior a (\d+)\s*m\s*FOS\s*(\d+),?\s*mayor a \d+\s*m\s*FOS\s*(\d+)/i);
  if (byFront) fos = val((lot.frontWidth < Number(byFront[1]) ? Number(byFront[2]) : Number(byFront[3])) / 100, read(obs));
  if (/FOS\s*=\s*0,80 CUANDO LA SUPERFICIE DEL LOTE NO ALCANCE/i.test(obs)) notes.add("Si el lote no llega a la superficie mínima de la Ord. 8060, el FOS sube a 80 %.");

  /* FOT */
  let fot: Sourced<number>;
  if (typeof z.fot === "number" && z.fot > 0) fot = val(z.fot, layer(`FOT ${z.fot}`));
  else if (typeof z.altura_maxima === "number" && z.altura_maxima > 0) fot = { value: null, source: src("interpretado", `Ord. 8256 · zona ${perfil}: sin FOT; la superficie la limitan la altura, los retiros y el FOS`) };
  else fot = missing("FOT");

  /* Alturas */
  let maxHeight: LandRules["maxHeight"];
  if (typeof z.altura_maxima === "number" && z.altura_maxima > 0) maxHeight = val(z.altura_maxima, layer(`altura máxima ${z.altura_maxima} m`));
  else if (z.altura_maxima === 0 || /sin limitaci/i.test(obs)) maxHeight = { value: null, unlimited: true, source: layer("altura sin limitaciones") };
  else maxHeight = missing("Altura máxima");
  const heightAtLine = typeof z.altura_lm === "number" && z.altura_lm > 0 ? val(z.altura_lm, layer(`altura sobre línea ${z.altura_lm} m`)) : val<number>(null, src("interpretado", `Ord. 8256 · zona ${perfil}: la capa no fija una altura distinta sobre la línea`));
  const floors = parseFloors(z.pisos_maximos);
  const maxFloors = floors ? val(floors, read(clean(z.pisos_maximos))) : val<number>(null, src("falta", "Cantidad de pisos: la capa no la trae"));

  /* Retiros */
  const front = parseFront(z.retiro_frente, group);
  let setbackFront: Sourced<number>;
  if (front.value !== null) setbackFront = val(front.value, front.kind === "dato" ? layer(`retiro de frente «${short(clean(z.retiro_frente), 60)}»`) : read(clean(z.retiro_frente)));
  else if (/Art\.?\s*9/i.test(clean(z.retiro_frente))) {
    setbackFront = { value: null, source: src("falta", `Ord. 8256 · zona ${perfil}: el retiro de frente se define por el Art. 9 de la Ord. 8256 (según la cuadra). Cargalo cuando lo confirmes.`) };
  } else setbackFront = missing("Retiro de frente");
  const upper = parseUpperSetback(z.retiro_frente) ?? parseUpperSetback(z.otros_retiros);
  const upperSetback: Sourced<UpperSetback> = upper ? val(upper, read(clean(z.retiro_frente) || clean(z.otros_retiros))) : val<UpperSetback>(null, src("interpretado", `Ord. 8256 · zona ${perfil}: la capa no indica retiro en altura`));

  const others = clean(z.otros_retiros);
  const hRef = maxHeight.value ?? CORDOBA_NORMS.alturaReferenciaSinDato;
  let setbackSide: Sourced<number> = val<number>(null, src("interpretado", `Ord. 8256 · zona ${perfil}: la capa no indica retiros laterales`));
  let sideCount: 0 | 1 | 2 = 0;
  let setbackBack: Sourced<number> = val<number>(null, src("interpretado", `Ord. 8256 · zona ${perfil}: la capa no indica retiro de fondo`));
  const backText = parseBack(others);
  if (backText !== null) setbackBack = val(backText, read(others));
  const backExceptCorner = /excepto.*esquina/i.test(others);

  const profile = CORDOBA_NORMS.perfiles[perfil];
  const amount = (a: Amount) => (a.valor !== undefined ? (group === "industrial" && a.valorIndustrial !== undefined ? a.valorIndustrial : a.valor) : Math.max(a.minimo ?? 0, a.divisorAltura ? hRef / a.divisorAltura : 0));
  if (profile) {
    const sides = profile.lateral ? [...profile.lateral.lados].sort((a, b) => b.frenteDesde - a.frenteDesde).find((x) => lot.frontWidth >= x.frenteDesde) : undefined;
    if (profile.lateral && sides) {
      setbackSide = val(amount(profile.lateral), read(others));
      sideCount = sides.lados;
      if (profile.nota) notes.add(profile.nota);
    }
    if (profile.fondo && lot.frontWidth >= (profile.fondo.frenteDesde ?? 0)) setbackBack = val(amount(profile.fondo), read(others));
  } else {
    const both = others.match(/(\d+(?:[.,]\d+)?)\s*m\s*ambos laterales/i);
    if (both) {
      setbackSide = val(num(both[1]), read(others));
      sideCount = 2;
    } else if (/laterales/i.test(others)) notes.add(`Retiros laterales: «${short(others, 160)}». Confirmalos.`);
  }

  /* Densidad */
  const unitsText = clean(z.cantidad_unidades);
  const per = parseAreaPerUnit(unitsText);
  const areaPerUnit = per ? val(per, read(unitsText)) : val<number>(null, src("interpretado", unitsText ? `Densidad: «${short(unitsText)}»` : `Ord. 8256 · zona ${perfil}: la capa no fija un tope de unidades por superficie`));

  const plane45 = /^SI/i.test(clean(z.plano_a_45));
  return { fos, fot, maxHeight, heightAtLine, upperSetback, plane45, maxFloors, setbackFront, setbackSide, sideCount, setbackBack, backExceptCorner, areaPerUnit };
}

/* ─────────────────────────── usos por tipo de edificio ─────────────────────────── */

const characterSource = (perfil: string, text: string): Source => src("interpretado", `Ord. 8256 · zona ${perfil}: carácter urbanístico «${short(text, 160)}»`);

export function usesFor(z: Ord8256Full | null, z8133: Ord8133Full | null): Record<BuildingTypeId, UseVerdict> {
  const perfil = clean(z?.perfil_o_zona) || "s/d";
  const c = clean(z?.caracter_urbanistico).toUpperCase();
  const s = characterSource(perfil, clean(z?.caracter_urbanistico));
  const unknown = (what: string): UseVerdict => ({ status: "verificar", text: `La capa oficial no dice si se permite ${what} en esta zona.`, source: { kind: "falta", text: "Sin dato en la capa de la Ord. 8256" } });
  const industrialZone = ["L", "M", "N"].includes(perfil);

  let vivienda: UseVerdict;
  if (!z || !c) vivienda = unknown("vivienda");
  else if (industrialZone || /EXCLUIDA LA LOCALIZACI[ÓO]N DE PLANES DE VIVIENDA/.test(c)) vivienda = { status: "condicionado", text: perfil === "N" ? "Zona rural e industrial: vivienda con estricto control de unidades." : "Zona industrial: sólo una vivienda accesoria al uso industrial.", source: s };
  else if (/VIV(IENDA|\.)\s*INDIV|RESIDENCIAL/.test(c)) vivienda = { status: "si", text: "La zona prevé vivienda individual.", source: s };
  else if (/DENSIFICACI/.test(c)) vivienda = { status: "verificar", text: "Zona de densificación: una casa no está excluida en el texto, pero la zona apunta a edificios. Confirmalo.", source: s };
  else vivienda = unknown("vivienda");

  let departamentos: UseVerdict;
  if (!z || !c) departamentos = unknown("vivienda colectiva");
  else if (industrialZone) departamentos = { status: "no", text: "Zona industrial / rural: no prevé edificios de vivienda.", source: s };
  else if (/EXCLUSIVAMENTE/.test(c) && /INDIV/.test(c)) departamentos = { status: "no", text: "La zona admite sólo vivienda individual.", source: s };
  else if (/COLECTIVA/.test(c)) {
    const cond = clean(z.caracter_urbanistico).match(/COLECTIVA[^.]*(PARCELAS DETALLADAS|SELECTIVAMENTE|solo en parcelas[^)]*)/i);
    departamentos = cond ? { status: "condicionado", text: `Vivienda colectiva con condiciones: ${cond[1].toLowerCase()}.`, source: s } : { status: "si", text: "La zona prevé vivienda colectiva.", source: s };
  } else if (/DENSIFICACI/.test(c)) departamentos = { status: "si", text: "Zona de densificación poblacional: prevé edificios de vivienda.", source: s };
  else if (/PLANES DE VIV/.test(c)) departamentos = { status: "condicionado", text: "Vivienda colectiva sólo dentro de planes de vivienda.", source: s };
  else departamentos = unknown("vivienda colectiva");

  let oficinas: UseVerdict;
  if (!z || !c) oficinas = unknown("oficinas o locales");
  else if (/USOS? MIXTOS?|CAR[ÁA]CTER MIXTO/.test(c) && !industrialZone && perfil !== "N1") oficinas = { status: "si", text: "Zona de usos mixtos: admite comercio y oficinas junto a la vivienda.", source: s };
  else if (/[ÁA]REA CENTRAL/.test(c)) oficinas = { status: "condicionado", text: "Zona ligada al área central: oficinas y locales según el rubro (habilitación municipal).", source: s };
  else oficinas = { status: "verificar", text: "La capa no lo indica: oficinas y locales se habilitan según el rubro. Consultalo en la Municipalidad.", source: s };

  const g = classifyUse(z8133?.patron);
  const patronSrc: Source = { kind: "interpretado", text: `Ord. 8133 · ${g.usoTexto}`, url: MAPAS_CORDOBA_URL };
  const maxRestriction = /M[ÁA]XIMA/i.test(clean(z?.actividad_industrial));
  const galpon: UseVerdict =
    g.uso === "industrial"
      ? { status: "si", text: "Zona para actividades industriales.", source: patronSrc }
      : g.uso === "condicionado"
        ? {
            status: "condicionado",
            text: maxRestriction ? "Zona de máxima restricción a la industria: sólo depósitos o talleres chicos, según el rubro." : "Sólo actividades compatibles con la zona, según el rubro y su escala.",
            source: patronSrc,
          }
        : g.uso === "no"
          ? { status: "no", text: "Zona no prevista para industria.", source: patronSrc }
          : { status: "verificar", text: "Sin patrón de uso del suelo para este punto.", source: patronSrc };

  return { vivienda, departamentos, oficinas, galpon };
}

/* ─────────────────────────── zona completa ─────────────────────────── */

export function landZoneFromCordoba(z: Ord8256Full | null, z8133: Ord8133Full | null, lot: LotFacts): LandZone | null {
  if (!z && !z8133) return null;
  const perfil = clean(z?.perfil_o_zona) || "s/d";
  const notes = new Set<string>();
  const residencial = rulesFor(z ?? {}, "residencial", lot, notes);
  const industrial = rulesFor(z ?? {}, "industrial", lot, notes);
  const special = !z || /^Ord\.|^Dto\./i.test(perfil) || (z.fos == null && z.altura_maxima == null && z.fot == null);
  if (special) notes.add("Zona con normativa particular: la capa no trae sus parámetros. Consultá la ordenanza específica en la Municipalidad.");
  if (residencial.plane45) notes.add(CORDOBA_NORMS.planoLimite45.nota);
  for (const t of [z?.otras_disposiciones, z?.informacion_adicional]) {
    const c = clean(t);
    if (c && !/^FOS:/i.test(c)) notes.add(short(cap(c), 240));
  }
  if (clean(z?.cantidad_unidades) && /cloacal/i.test(clean(z?.cantidad_unidades))) notes.add("Densidad: el tope de unidades cambia si el lote tiene conexión a la red cloacal.");
  if (perfil === "I" || /CENTRO HIST/i.test(clean(z?.otras_disposiciones))) notes.add("Centro histórico: las alturas de cada manzana se consultan en Planeamiento Urbano.");
  notes.add("Confirmá la Línea de Edificación en el Plano de Retiros de la Municipalidad.");
  const kind = clean(z?.actividad_industrial);
  const caracter = clean(z?.caracter_urbanistico);
  return {
    perfil,
    label: `Zona ${perfil}`,
    caracter: caracter ? cap(caracter) : "Sin descripción en la capa oficial",
    industria: kind ? cap(kind) : "",
    patron: clean(z8133?.patron) || null,
    special,
    ordinance: [clean(z?.ord_original), clean(z?.ord_modificatoria)].filter(Boolean).join(" · ") || "Ord. 8256",
    chart: clean(z?.enlace_grafico) || null,
    rules: { residencial, industrial },
    uses: usesFor(z, z8133),
    notes: [...notes],
  };
}
