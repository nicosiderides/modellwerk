import type { LonLat } from "./parcel.ts";
import type { Ord8133Props, Ord8256Props } from "./cordobaZoning.ts";

/**
 * Consultas a los servicios abiertos de la Provincia de Córdoba (IDECOR /
 * Mapas Córdoba) y al buscador de direcciones del Gobierno nacional (Georef).
 * Todos aceptan pedidos desde cualquier página web, así que la app los consulta
 * directo, sin servidor propio.
 *
 * Datos de IDECOR: licencia Creative Commons BY-SA 4.0 (hay que citar la fuente).
 */

export const IDECOR_WFS = "https://idecor-ws.mapascordoba.gob.ar/geoserver/idecor/wfs";
export const IDECOR_ORTHO_TILES = "https://idecor-tiles.mapascordoba.gob.ar/geoserver/gwc/service/wmts/rest/idecor-tiles:Mosaico_CBAFeb2021//EPSG:900913/EPSG:900913:{z}/{y}/{x}?format=image/jpeg";
/** Zona que cubre la foto aérea del Gran Córdoba (vuelo de febrero de 2021). */
export const IDECOR_ORTHO_BOUNDS: [number, number, number, number] = [-64.359, -31.5506, -64.0226, -31.2299];
export const IGN_DARK_TILES = "https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/argenmap_oscuro@EPSG%3A3857@png/{z}/{x}/{y}.png";
export const GEOREF_API = "https://apis.datos.gob.ar/georef/api";

export const ATTRIBUTION = "Catastro y normativa: IDECOR · Gobierno de Córdoba (CC BY-SA 4.0) · Mapa base: IGN · Direcciones: Georef";

export type ParcelProps = {
  Nomenclatura?: string;
  desig_oficial?: string;
  Estado?: string;
  Superficie_Tierra_Urbana?: number;
  Superficie_Tierra_Rural?: number;
  Nro_Cuenta?: number | string;
  Tipo_Parcela?: string;
  localidad?: string;
};

type Geometry = { type: "Polygon"; coordinates: LonLat[][] } | { type: "MultiPolygon"; coordinates: LonLat[][][] };
export type Feature<P> = { type: "Feature"; geometry: Geometry; properties: P };
export type FeatureCollection<P> = { type: "FeatureCollection"; features: Feature<P>[] };

const PARCEL_FIELDS = "Nomenclatura,desig_oficial,Estado,Superficie_Tierra_Urbana,Superficie_Tierra_Rural,Nro_Cuenta,Tipo_Parcela,localidad";

async function getJson<T>(url: string, signal?: AbortSignal, timeoutMs = 15000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function wfs(layer: string, filter: string, options: { fields?: string; count?: number } = {}) {
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: layer,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
    count: String(options.count ?? 2000),
    CQL_FILTER: filter,
  });
  if (options.fields) params.set("propertyName", `${options.fields},geom`);
  return `${IDECOR_WFS}?${params.toString()}`;
}

const point = ([lon, lat]: LonLat) => `SRID=4326;POINT(${lon.toFixed(7)} ${lat.toFixed(7)})`;
const bboxFilter = ([w, s, e, n]: [number, number, number, number]) => `BBOX(geom,${w.toFixed(6)},${s.toFixed(6)},${e.toFixed(6)},${n.toFixed(6)},'EPSG:4326')`;

/** Contorno exterior principal de un polígono o multipolígono. */
export function outerRing(geometry: Geometry): LonLat[] {
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let best: LonLat[] = polys[0]?.[0] ?? [];
  let bestArea = 0;
  for (const poly of polys) {
    const ring = poly[0] ?? [];
    let a = 0;
    for (let i = 0; i < ring.length - 1; i += 1) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    if (Math.abs(a) > bestArea) {
      bestArea = Math.abs(a);
      best = ring;
    }
  }
  return best;
}

/* ─────────────────────────── catastro ─────────────────────────── */

export const parcelsInBBox = (bbox: [number, number, number, number], signal?: AbortSignal) =>
  getJson<FeatureCollection<ParcelProps>>(wfs("idecor:parcelas", bboxFilter(bbox), { fields: PARCEL_FIELDS, count: 2500 }), signal);

export async function parcelAt(p: LonLat, signal?: AbortSignal) {
  const fc = await getJson<FeatureCollection<ParcelProps>>(wfs("idecor:parcelas", `INTERSECTS(geom, ${point(p)})`, { fields: PARCEL_FIELDS, count: 1 }), signal);
  return fc.features[0] ?? null;
}

export async function parcelByAccount(cuenta: string, signal?: AbortSignal) {
  const fc = await getJson<FeatureCollection<ParcelProps>>(wfs("idecor:parcelas", `Nro_Cuenta=${Number(cuenta)}`, { fields: PARCEL_FIELDS, count: 1 }), signal);
  return fc.features[0] ?? null;
}

export async function parcelByNomenclature(nomenclatura: string, signal?: AbortSignal) {
  const fc = await getJson<FeatureCollection<ParcelProps>>(wfs("idecor:parcelas", `Nomenclatura='${nomenclatura.replace(/\D/g, "")}'`, { fields: PARCEL_FIELDS, count: 1 }), signal);
  return fc.features[0] ?? null;
}

/** Manzana que contiene un punto (su borde marca qué lados del lote dan a la calle). */
export async function blockAt(p: LonLat, signal?: AbortSignal) {
  const fc = await getJson<FeatureCollection<{ nomenclatura?: string }>>(wfs("idecor:manzana", `INTERSECTS(geom, ${point(p)})`, { fields: "nomenclatura", count: 1 }), signal);
  return fc.features[0] ? outerRing(fc.features[0].geometry) : null;
}

/** Vías principales (Ord. 8060) cerca: ayudan a elegir el frente en lotes de esquina. */
export async function mainRoadsIn(bbox: [number, number, number, number], signal?: AbortSignal) {
  type Line = { type: "Feature"; geometry: { type: "MultiLineString" | "LineString"; coordinates: LonLat[][] | LonLat[] }; properties: { nombre?: string; tipo?: string } };
  const fc = await getJson<{ features: Line[] }>(wfs("idecor:CBA_Red_Vial_8060", bboxFilter(bbox), { fields: "nombre,tipo", count: 50 }), signal);
  return fc.features.flatMap((f) => (f.geometry.type === "LineString" ? [f.geometry.coordinates as LonLat[]] : (f.geometry.coordinates as LonLat[][])));
}

/* ─────────────────────────── normativa ─────────────────────────── */

export async function zoningAt(p: LonLat, signal?: AbortSignal): Promise<{ z8256: Ord8256Props | null; z8133: Ord8133Props | null }> {
  const [a, b] = await Promise.all([
    getJson<FeatureCollection<Ord8256Props>>(wfs("idecor:CBA_Ordenanza_8256", `INTERSECTS(geom, ${point(p)})`, { fields: "perfil_o_zona,fos,fot,altura_maxima,retiro_frente,otros_retiros,observacion,actividad_industrial,caracter_urbanistico", count: 1 }), signal).catch(() => null),
    getJson<FeatureCollection<Ord8133Props>>(wfs("idecor:CBA_Ordenanza_8133", `INTERSECTS(geom, ${point(p)})`, { fields: "patron,descripcion,localizacion", count: 1 }), signal).catch(() => null),
  ]);
  return { z8256: a?.features[0]?.properties ?? null, z8133: b?.features[0]?.properties ?? null };
}

/* ─────────────────────────── búsqueda ─────────────────────────── */

export type SearchResult = { kind: "address" | "cuenta" | "nomenclatura"; label: string; detail: string; center: LonLat; parcel?: Feature<ParcelProps> | null };

/** Centro aproximado de un anillo (promedio de vértices). */
export const ringCenter = (ring: LonLat[]): LonLat => ring.reduce<LonLat>((acc, p) => [acc[0] + p[0] / ring.length, acc[1] + p[1] / ring.length], [0, 0]);

/**
 * Busca por número de cuenta (12 dígitos), nomenclatura catastral (16 dígitos)
 * o dirección (Georef, provincia de Córdoba).
 */
export async function search(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const q = query.trim();
  const digits = q.replace(/[\s.\-/]/g, "");
  if (/^\d{9,13}$/.test(digits)) {
    const parcel = await parcelByAccount(digits, signal);
    if (!parcel) return [];
    return [{ kind: "cuenta", label: `Cuenta ${digits}`, detail: [parcel.properties.desig_oficial, parcel.properties.localidad].filter(Boolean).join(" · "), center: ringCenter(outerRing(parcel.geometry)), parcel }];
  }
  if (/^\d{14,18}$/.test(digits)) {
    const parcel = await parcelByNomenclature(digits, signal);
    if (!parcel) return [];
    return [{ kind: "nomenclatura", label: `Nomenclatura ${digits}`, detail: [parcel.properties.desig_oficial, parcel.properties.localidad].filter(Boolean).join(" · "), center: ringCenter(outerRing(parcel.geometry)), parcel }];
  }
  if (q.length < 3) return [];
  type Georef = { direcciones?: { nomenclatura: string; ubicacion: { lat: number | null; lon: number | null }; localidad_censal?: { nombre?: string } }[] };
  const params = new URLSearchParams({ direccion: q, provincia: "cordoba", max: "6" });
  const res = await getJson<Georef>(`${GEOREF_API}/direcciones?${params.toString()}`, signal, 8000);
  return (res.direcciones ?? [])
    .filter((d) => d.ubicacion.lat !== null && d.ubicacion.lon !== null)
    .map((d) => {
      const [street, ...rest] = d.nomenclatura.split(",");
      return { kind: "address" as const, label: street.trim(), detail: rest.join(",").trim(), center: [d.ubicacion.lon!, d.ubicacion.lat!] as LonLat };
    });
}
