import { toLot, type ParcelAnalysis, type XY } from "../../galpones/geo/parcel.ts";
import type { BuildingType } from "../buildingTypes.ts";
import type { BlockCenter, LandRules } from "../types.ts";
import { clipAll, insideBox, insideOfEdge, polygonArea, rayHit, subtractBox, totalArea } from "./poly.ts";

/**
 * Caja máxima: el volumen que la normativa permite construir en el lote real.
 *
 * Se arma en planta recortando el contorno real del lote con cada retiro
 * (frente, laterales, fondo) y el centro de manzana; después se apila en
 * alturas: hasta la altura sobre la línea con la planta completa y, si la zona
 * pide retiro en altura, el resto retirado. Todo en metros, coordenadas locales
 * del análisis de la parcela (las mismas de `ParcelAnalysis.ring`).
 */

export type EnvelopeTier = { from: number; to: number; pieces: XY[][]; area: number };

export type HeightBasis = "norma" | "pisos" | "fot" | "referencia";

export type Envelope = {
  lotArea: number;
  /** Planta donde se puede construir (después de retiros y centro de manzana). */
  ground: XY[][];
  groundArea: number;
  /** Centro de manzana dentro del lote (para dibujarlo), si se aplicó. */
  blockCenter: XY[][];
  tiers: EnvelopeTier[];
  /** Altura con la que se dibuja la caja y de dónde sale. */
  height: number;
  heightBasis: HeightBasis;
  /** Ocupación máxima del suelo (FOS × lote), si hay FOS. */
  fosArea: number | null;
  /** Huella máxima: la menor entre la planta disponible y el FOS. */
  footprintMax: number;
  /** Superficie total máxima por FOT, si hay FOT. */
  fotArea: number | null;
  /** Plantas que entran para el tipo de edificio elegido. */
  floors: number;
  /** Superficie cubierta máxima estimada para ese tipo (m²). */
  builtMax: number;
  /** Qué la limita. */
  builtLimit: "fot" | "volumen" | "tipo";
  /** Unidades funcionales máximas por densidad (si la zona la fija). */
  units: number | null;
  /** Ancho de calle estimado frente al lote (m), si se pudo medir. */
  streetWidth: number | null;
  warnings: string[];
};

export type EnvelopeInput = {
  analysis: ParcelAnalysis;
  rules: LandRules;
  type: BuildingType;
  /** Manzana del lote y manzanas vecinas (lon/lat ya pasadas a XY locales). */
  block: XY[] | null;
  neighborBlocks: XY[][];
  blockCenter: BlockCenter | null;
};

const MAX_DRAW = 45;

/** Ancho de la calle frente a un lado: de la línea municipal hasta la manzana de enfrente. */
export function streetWidthAt(a: XY, b: XY, neighborBlocks: XY[][]): number | null {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const out: XY = [(b[1] - a[1]) / len, -(b[0] - a[0]) / len]; // afuera = derecha (antihorario)
  const hits = [0.3, 0.5, 0.7]
    .map((k) => rayHit([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], out, neighborBlocks, 70))
    .filter((d): d is number => d !== null)
    .sort((p, q) => p - q);
  if (!hits.length) return null;
  const w = hits[Math.floor(hits.length / 2)];
  return w >= 6 && w <= 70 ? w : null;
}

export function computeEnvelope(input: EnvelopeInput): Envelope {
  const { analysis, rules, type } = input;
  const warnings: string[] = [];
  const ring = analysis.ring;
  const edges = analysis.edges;
  const street = new Set(analysis.streetEdges);
  const corner = analysis.corner !== "none" || analysis.sides.length > 1;
  const t = analysis.axes.t;
  const lotArea = analysis.area;

  /* ── retiros en planta ── */
  let ground: XY[][] = [ring];
  const front = rules.setbackFront.value ?? 0;
  if (rules.setbackFront.value === null) warnings.push("Retiro de frente sin dato: la caja se dibuja sobre la línea municipal hasta que lo cargues.");
  if (front > 0) for (const i of street) ground = clipAll(ground, insideOfEdge(edges[i].a, edges[i].b, front));
  if (corner && front > 0 && analysis.sides.length > 1) warnings.push("Lote en esquina: el retiro de frente se aplicó sobre las dos calles. Confirmalo en el Plano de Retiros.");

  const sideEdges: number[] = [];
  const backEdges: number[] = [];
  for (const e of edges) {
    if (street.has(e.index) || e.length < 0.3) continue;
    const outward: XY = [e.dir[1], -e.dir[0]];
    if (outward[0] * t[0] + outward[1] * t[1] > Math.cos((45 * Math.PI) / 180)) backEdges.push(e.index);
    else sideEdges.push(e.index);
  }
  const side = rules.setbackSide.value ?? 0;
  if (side > 0 && rules.sideCount > 0) {
    // Con un solo lateral obligatorio se toma el izquierdo mirando desde la calle (el oeste del rectángulo útil).
    let chosen = sideEdges;
    if (rules.sideCount === 1) {
      const sMid = (i: number) => toLot(analysis.fit.axes, [(edges[i].a[0] + edges[i].b[0]) / 2, (edges[i].a[1] + edges[i].b[1]) / 2])[0];
      const mid = analysis.fit.width / 2;
      chosen = sideEdges.filter((i) => sMid(i) < mid);
      warnings.push("Retiro lateral en un solo lindero: se dibujó del lado izquierdo mirando desde la calle.");
    }
    for (const i of chosen) ground = clipAll(ground, insideOfEdge(edges[i].a, edges[i].b, side));
  }
  const back = rules.backExceptCorner && corner ? 0 : rules.setbackBack.value ?? 0;
  if (back > 0) for (const i of backEdges) ground = clipAll(ground, insideOfEdge(edges[i].a, edges[i].b, back));

  /* ── centro de manzana ── */
  let blockCenterPieces: XY[][] = [];
  if (input.blockCenter?.kind === "tipica" && input.block && input.block.length >= 3) {
    // Art. 28: líneas paralelas a las líneas municipales a 2/7 de la distancia entre líneas opuestas.
    const ax = analysis.axes;
    const ss = input.block.map((p) => toLot(ax, p)[0]);
    const tt = input.block.map((p) => toLot(ax, p)[1]);
    const [s0, s1, t0, t1] = [Math.min(...ss), Math.max(...ss), Math.min(...tt), Math.max(...tt)];
    const box = { s0: s0 + ((s1 - s0) * 2) / 7, s1: s1 - ((s1 - s0) * 2) / 7, t0: t0 + ((t1 - t0) * 2) / 7, t1: t1 - ((t1 - t0) * 2) / 7 };
    const before = totalArea(ground);
    const after = subtractBox(ground, ax, box);
    if (before - totalArea(after) > 0.5) {
      blockCenterPieces = insideBox([ring], ax, box);
      ground = after;
    }
  } else if (input.blockCenter?.kind === "otra") {
    warnings.push(`Centro de manzana «${input.blockCenter.label}»: su trazado depende de la forma de la manzana y no está dibujado. Confirmalo.`);
  }
  const groundArea = totalArea(ground);
  if (!ground.length || groundArea < 1) warnings.push("Con estos retiros no queda superficie para construir.");

  /* ── ocupación y superficie total ── */
  const fosArea = rules.fos.value !== null ? rules.fos.value * lotArea : null;
  const footprintMax = Math.max(0, fosArea !== null ? Math.min(fosArea, groundArea) : groundArea);
  const fotArea = rules.fot.value !== null ? rules.fot.value * lotArea : null;

  /* ── altura de la caja ── */
  let height: number;
  let heightBasis: HeightBasis;
  const floorsFromRule = rules.maxFloors.value;
  if (rules.maxHeight.value !== null) {
    height = rules.maxHeight.value;
    heightBasis = "norma";
  } else if (floorsFromRule) {
    height = type.groundHeight + (floorsFromRule - 1) * type.floorHeight;
    heightBasis = "pisos";
  } else if (fotArea !== null && footprintMax > 0) {
    const n = Math.max(1, Math.ceil(fotArea / footprintMax));
    height = Math.min(MAX_DRAW, 3 + (n - 1) * 3);
    heightBasis = "fot";
    warnings.push(rules.maxHeight.unlimited ? "Altura sin límite en la zona: la caja se dibuja hasta donde alcanza el FOT." : "Sin altura máxima en la capa: la caja se dibuja hasta donde alcanza el FOT.");
  } else {
    height = 12;
    heightBasis = "referencia";
    warnings.push("Sin altura ni FOT en la capa: la caja se dibuja con 12 m sólo como referencia.");
  }

  /* ── retiro en altura ── */
  const tiers: EnvelopeTier[] = [];
  const up = rules.upperSetback.value;
  let streetWidth: number | null = null;
  const frontSide = analysis.sides.find((s) => s.edges.includes(analysis.frontEdge)) ?? null;
  if (frontSide) streetWidth = streetWidthAt(frontSide.a, frontSide.b, input.neighborBlocks);
  if (up && up.from < height - 0.1) {
    let upper = ground;
    let applied = true;
    for (const i of street) {
      let extra: number | null;
      if (up.ref === "linea") extra = front + up.dist;
      else {
        const sideOf = analysis.sides.find((s) => s.edges.includes(i));
        const w = sideOf ? streetWidthAt(sideOf.a, sideOf.b, input.neighborBlocks) : null;
        extra = w !== null ? Math.max(front, up.dist - w / 2) : null;
      }
      if (extra === null) {
        applied = false;
        continue;
      }
      if (extra > front) upper = clipAll(upper, insideOfEdge(edges[i].a, edges[i].b, extra));
    }
    if (!applied) warnings.push(`Retiro en altura a ${up.dist} m del eje de calle: no se pudo medir el ancho de la calle, así que no está dibujado.`);
    else if (up.ref === "eje" && streetWidth !== null) warnings.push(`Retiro en altura medido con una calle de ${streetWidth.toFixed(1)} m de ancho (estimado con las manzanas del catastro).`);
    tiers.push({ from: 0, to: up.from, pieces: ground, area: groundArea });
    if (upper.length) tiers.push({ from: up.from, to: height, pieces: upper, area: totalArea(upper) });
  } else {
    tiers.push({ from: 0, to: height, pieces: ground, area: groundArea });
  }

  /* ── plantas y superficie para el tipo elegido ── */
  let floors = height >= type.groundHeight ? 1 + Math.max(0, Math.floor((height - type.groundHeight + 1e-6) / type.floorHeight)) : 0;
  if (floorsFromRule) floors = Math.min(floors, floorsFromRule);
  let builtLimit: Envelope["builtLimit"] = "volumen";
  if (type.maxFloors !== null && floors > type.maxFloors) {
    floors = type.maxFloors;
    builtLimit = "tipo";
  }
  let builtByVolume = 0;
  for (let f = 0; f < floors; f += 1) {
    const base = f === 0 ? 0 : type.groundHeight + (f - 1) * type.floorHeight;
    const tier = tiers.find((tr) => base >= tr.from - 1e-6 && base < tr.to - 1e-6) ?? tiers[tiers.length - 1];
    builtByVolume += Math.min(tier?.area ?? 0, footprintMax);
  }
  let builtMax = builtByVolume;
  if (fotArea !== null && fotArea < builtByVolume) {
    builtMax = fotArea;
    builtLimit = "fot";
  }
  if (type.id === "galpon") builtMax = footprintMax;

  const units = rules.areaPerUnit.value ? Math.max(1, Math.floor(lotArea / rules.areaPerUnit.value)) : null;

  return {
    lotArea,
    ground,
    groundArea,
    blockCenter: blockCenterPieces,
    tiers,
    height,
    heightBasis,
    fosArea,
    footprintMax,
    fotArea,
    floors,
    builtMax,
    builtLimit,
    units,
    streetWidth,
    warnings,
  };
}

/** Superficie de cada pieza (para pruebas y depuración). */
export const pieceAreas = (pieces: XY[][]) => pieces.map(polygonArea);
