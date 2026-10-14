import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Path,
  Quaternion,
  Shape,
  Vector3,
  type Material,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildNodeName } from "../product-engine/naming.ts";
import type { BimElementMetadata, ModelCategory, ModelMetadataDocument, ModelSource } from "../product-engine/types.ts";
import { EAVE_OVERHANG, GIRT_SPACING, PURLIN_SPACING } from "./geometry-rules.ts";
import { SLAB_BOTTOM, foundationSizes } from "./foundations.ts";
import { PURLIN_H, warehouseLayout } from "./layout.ts";
import type { WarehouseConfig, WarehouseDefinition } from "./types.ts";

/**
 * Adaptador procedural (TYPE A — PARAMETRIC WEB MODEL).
 *
 * Genera un `Group` de Three + un documento de metadata con el MISMO contrato
 * que un GLB exportado desde Revit/IFC. El visor no distingue el origen: monta
 * un único `primitive` y consulta la metadata. Así, reemplazar este adaptador
 * por un GLB real no requiere reescribir el engine.
 *
 * Ejes: X = ancho (luz), Y = vertical, Z = largo. Piso en Y = 0, centrado en X/Z.
 * Unidades: metros. Las proporciones de perfiles son VISUALES (ver geometry-rules).
 */

export type MaterialKey =
  | "structure"
  | "secondary"
  | "bracing"
  | "roofSheet"
  | "wallSheet"
  | "precast"
  | "slab"
  | "footing"
  | "skylight"
  | "sectionalDoor"
  | "personDoor"
  | "trim"
  | "glass"
  | "gutter"
  | "canopyRoof"
  | "crane";

export type GeneratorOptions = {
  /** grid: IDs legibles por grilla (GP02-COL-A03). revit: IDs numéricos tipo ElementId. */
  idStyle?: "grid" | "revit";
  source?: ModelSource;
  modelId?: string;
  modelName?: string;
};

export type GeneratedModel = {
  root: Group;
  metadata: ModelMetadataDocument;
  stats: { elements: number; meshes: number; triangles: number };
};

type Part = {
  geometry: BufferGeometry;
  materialKey: MaterialKey;
  position?: [number, number, number];
  rotation?: [number, number, number];
};

type ElementSpec = {
  category: ModelCategory;
  /** Sufijo legible y único (COL-A03). */
  key: string;
  label: string;
  bimCategory: string;
  family: string;
  type: string;
  material: string;
  parameters?: BimElementMetadata["parameters"];
};

const PLACEHOLDER_COLORS: Record<MaterialKey, string> = {
  structure: "#5f6870",
  secondary: "#8b9196",
  bracing: "#6d747a",
  roofSheet: "#c3c5c2",
  wallSheet: "#c9cbc7",
  precast: "#a9a59b",
  slab: "#9d9a93",
  footing: "#8f8b82",
  skylight: "#e9f1f4",
  sectionalDoor: "#d7d8d4",
  personDoor: "#4b5257",
  trim: "#3e4447",
  glass: "#9fb7c2",
  gutter: "#b9bcb9",
  canopyRoof: "#c3c5c2",
  crane: "#d5a021",
};

const UP = new Vector3(0, 1, 0);
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Prisma rectangular entre dos puntos (eje largo = a→b). */
function memberBetween(a: Vector3, b: Vector3, w: number, d: number): BufferGeometry {
  const length = a.distanceTo(b);
  const geometry = new BoxGeometry(w, length, d);
  const direction = b.clone().sub(a).normalize();
  const q = new Quaternion().setFromUnitVectors(UP, direction);
  geometry.applyMatrix4(new Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new Vector3(1, 1, 1)));
  return geometry;
}

/** Perfil doble T extruido a lo largo de +Y. Alma en X, alas en Z. */
function iSection(depth: number, flange: number, height: number): BufferGeometry {
  const tf = Math.max(0.012, depth * 0.055);
  const tw = Math.max(0.008, depth * 0.035);
  const h = depth / 2;
  const b = flange / 2;
  const s = new Shape();
  s.moveTo(-h, -b);
  s.lineTo(-h + tf, -b);
  s.lineTo(-h + tf, -tw / 2);
  s.lineTo(h - tf, -tw / 2);
  s.lineTo(h - tf, -b);
  s.lineTo(h, -b);
  s.lineTo(h, b);
  s.lineTo(h - tf, b);
  s.lineTo(h - tf, tw / 2);
  s.lineTo(-h + tf, tw / 2);
  s.lineTo(-h + tf, b);
  s.lineTo(-h, b);
  s.closePath();
  const geometry = new ExtrudeGeometry(s, { depth: height, bevelEnabled: false, steps: 1 });
  geometry.rotateX(-Math.PI / 2); // extrusión Z → Y; la forma queda en X / -Z
  return geometry;
}

/**
 * UV planares en METROS por cara (para normal maps de chapa con período real).
 * Caras horizontales: u = z (o x), v = la otra. Caras verticales: u = horizontal, v = y.
 */
/**
 * Quita las caras planas que caen sobre un plano dado (eje = valor).
 * Se usa en las uniones entre piezas vecinas: esas caras quedan ocultas
 * dentro del cerramiento, pero la placa de video no sabe si van delante o
 * detrás de la chapa vecina y dibuja una línea punteada oscura en la unión.
 */
function dropFacesOnPlanes(geometry: BufferGeometry, axis: "x" | "y" | "z", values: number[]) {
  if (!values.length) return geometry;
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = g.getAttribute("position");
  const read = axis === "x" ? (i: number) => position.getX(i) : axis === "y" ? (i: number) => position.getY(i) : (i: number) => position.getZ(i);
  // Un triángulo se quita sólo si sus tres vértices están sobre el MISMO plano.
  const onPlane = (t: number) => values.some((v) => [t, t + 1, t + 2].every((i) => Math.abs(read(i) - v) < 1e-4));
  const keep: number[] = [];
  for (let t = 0; t < position.count; t += 3) if (!onPlane(t)) keep.push(t);
  if (keep.length * 3 === position.count) return g;
  const out = new BufferGeometry();
  for (const [name, attribute] of Object.entries(g.attributes)) {
    const size = attribute.itemSize;
    const data = new (attribute.array.constructor as Float32ArrayConstructor)(keep.length * 3 * size);
    keep.forEach((t, k) => data.set((attribute.array as Float32Array).subarray(t * size, (t + 3) * size), k * 3 * size));
    out.setAttribute(name, new BufferAttribute(data, size));
  }
  // Grupos de materiales: se recalculan contando los triángulos que quedan.
  for (const group of g.groups) {
    const start = keep.findIndex((t) => t >= group.start);
    const count = keep.filter((t) => t >= group.start && t < group.start + group.count).length;
    if (count) out.addGroup(start < 0 ? 0 : start * 3, count * 3, group.materialIndex);
  }
  return out;
}

function meterUVsForBox(geometry: BufferGeometry, uAxis: "x" | "z" = "z") {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    if (ny >= nx && ny >= nz) uv.setXY(i, uAxis === "z" ? z : x, uAxis === "z" ? x : z);
    else if (nx >= nz) uv.setXY(i, z, y);
    else uv.setXY(i, x, y);
  }
  uv.needsUpdate = true;
  return geometry;
}

type Rect = { u0: number; u1: number; v0: number; v1: number };

/**
 * Panel plano con huecos. La forma está en el plano (u, v) y se extruye `t`.
 * Las aberturas que tocan el borde inferior se resuelven como muescas.
 */
function panelWithOpenings(outlineTop: [number, number][], uMin: number, uMax: number, vBottom: number, openings: Rect[], t: number) {
  const notches = openings.filter((o) => o.v0 <= vBottom + 0.001).sort((a, b) => a.u0 - b.u0);
  const holes = openings.filter((o) => o.v0 > vBottom + 0.001);
  const shape = new Shape();
  shape.moveTo(uMin, vBottom);
  for (const n of notches) {
    const u0 = Math.max(uMin + 0.05, n.u0);
    const u1 = Math.min(uMax - 0.05, n.u1);
    if (u1 <= u0) continue;
    shape.lineTo(u0, vBottom);
    shape.lineTo(u0, n.v1);
    shape.lineTo(u1, n.v1);
    shape.lineTo(u1, vBottom);
  }
  shape.lineTo(uMax, vBottom);
  for (const [u, v] of outlineTop) shape.lineTo(u, v);
  shape.closePath();
  for (const hole of holes) {
    const p = new Path();
    p.moveTo(hole.u0, hole.v0);
    p.lineTo(hole.u0, hole.v1);
    p.lineTo(hole.u1, hole.v1);
    p.lineTo(hole.u1, hole.v0);
    p.closePath();
    shape.holes.push(p);
  }
  return new ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, steps: 1 });
}

/** Segmentos de [a, b] que no se superponen con las exclusiones. */
function segmentsExcluding(a: number, b: number, exclusions: [number, number][]) {
  const result: [number, number][] = [];
  let cursor = a;
  for (const [e0, e1] of [...exclusions].sort((x, y) => x[0] - y[0])) {
    if (e1 <= cursor || e0 >= b) continue;
    if (e0 > cursor + 0.2) result.push([cursor, e0]);
    cursor = Math.max(cursor, e1);
  }
  if (b > cursor + 0.2) result.push([cursor, b]);
  return result;
}

/** Distribuye `count` elementos en índices de módulos interiores, de forma pareja. */
export { distributeInBays } from "./layout.ts";

class ModelBuilder {
  readonly root = new Group();
  readonly elements: BimElementMetadata[] = [];
  private readonly materials = new Map<MaterialKey, Material>();
  private counter = 0;
  private meshes = 0;
  private triangles = 0;
  private readonly usedKeys = new Set<string>();

  private readonly code: string;
  private readonly idStyle: "grid" | "revit";

  constructor(code: string, idStyle: "grid" | "revit") {
    this.code = code;
    this.idStyle = idStyle;
    this.root.name = `${code}_MODEL`;
  }

  material(key: MaterialKey) {
    let m = this.materials.get(key);
    if (!m) {
      m = new MeshStandardMaterial({ name: key, color: PLACEHOLDER_COLORS[key], metalness: key === "glass" ? 0.1 : 0.35, roughness: 0.55 });
      this.materials.set(key, m);
    }
    return m;
  }

  add(spec: ElementSpec, parts: Part[]) {
    if (parts.length === 0) return;
    let key = spec.key;
    if (this.usedKeys.has(key)) {
      let i = 2;
      while (this.usedKeys.has(`${spec.key}-${i}`)) i += 1;
      key = `${spec.key}-${i}`;
    }
    this.usedKeys.add(key);
    this.counter += 1;
    const elementId = this.idStyle === "revit" ? String(400000 + this.counter * 7) : `${this.code}-${key}`;
    const nodeName = buildNodeName(this.code, spec.category, key);
    parts.forEach((part, index) => {
      const mesh = new Mesh(part.geometry, this.material(part.materialKey));
      mesh.name = index === 0 ? nodeName : `${nodeName}_P${index + 1}`;
      mesh.userData = { elementId, materialKey: part.materialKey };
      if (part.position) mesh.position.set(...part.position);
      if (part.rotation) mesh.rotation.set(...part.rotation);
      const transparent = part.materialKey === "glass" || part.materialKey === "skylight";
      mesh.castShadow = !transparent;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      this.meshes += 1;
      const index_ = part.geometry.getIndex();
      this.triangles += (index_ ? index_.count : part.geometry.getAttribute("position").count) / 3;
    });
    this.elements.push({
      elementId,
      nodeName,
      category: spec.category,
      bimCategory: spec.bimCategory,
      family: spec.family,
      type: spec.type,
      material: spec.material,
      materialKey: parts[0].materialKey,
      level: "Nivel 0",
      label: spec.label,
      parameters: spec.parameters,
    });
  }

  stats() {
    return { elements: this.elements.length, meshes: this.meshes, triangles: Math.round(this.triangles) };
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * createWarehouseModel — construye el galpón a partir de la configuración.
 * Función pura respecto de la configuración: misma entrada → mismos IDs.
 */
export function createWarehouseModel(config: WarehouseConfig, definition: WarehouseDefinition, options: GeneratorOptions = {}): GeneratedModel {
  const idStyle = options.idStyle ?? "grid";
  const b = new ModelBuilder(definition.code, idStyle);
  const lay = warehouseLayout(config, definition);
  const d = config.dimensions;
  const { W, L, half, S, angle, eave, ridge, n, frameZ, roofT, wallT, baseH, latticeColumns, trussRafters, colD, flange, rd } = lay;
  const { roofSurface, topSteel, endDepth, bottomChordY, wallX, gableZ } = lay;
  const { doorW, doorH, frontDoors, backDoors, sideDoorBays, personDoorBays, windowBaysEast, windowBaysWest, winW, winH, winV0 } = lay;
  const roofOption = lay.roofOption;
  const wallOption = lay.wallOption;
  const specs = definition.options.openings;

  const finish = definition.structure.finishes.find((f) => f.id === config.structureFinish);
  const system = definition.structure.systems.find((s) => s.id === config.structure);
  const systemName = system?.name ?? config.structure;
  const profiles = definition.structure.profileLabels;
  const finishName = finish?.name ?? "";
  // Los marcos de portones y puertas se meten 5 mm dentro del vano para que
  // su cara no coincida con el canto del cerramiento (evita el parpadeo).
  const TRIM_INSET = 0.005;

  const steel = "Acero estructural";
  const steelParams = (extra: Record<string, string | number>) => ({ sistema: systemName, terminacion: finishName, ...extra });

  /* ───────────── fundaciones ───────────── */
  b.add(
    { category: "foundations", key: "SLAB", label: "Platea / contrapiso", bimCategory: "Floors", family: "Contrapiso de hormigón", type: "Hormigón armado — espesor a definir", material: "Hormigón", parameters: { area_m2: Math.round(W * L) } },
    [{ geometry: meterUVsForBox(new BoxGeometry(2 * wallX + 0.6, 0.2, 2 * gableZ + 0.6), "x"), materialKey: "slab", position: [0, -0.1, 0] }]
  );
  // Las fundaciones se arman al final, cuando se conocen todas las columnas.
  const columnPoints: { x: number; z: number; key: string; label: string; main: boolean }[] = [];
  const footingAt = (x: number, z: number, key: string, label: string, main = true) => columnPoints.push({ x, z, key, label, main });

  /* ───────────── pórticos ───────────── */
  const columnCache = new Map<number, BufferGeometry>();
  const columnOfHeight = (h: number) => {
    const key = r3(h);
    let g = columnCache.get(key);
    if (!g) {
      g = iSection(colD, flange, key);
      columnCache.set(key, g);
    }
    return g;
  };
  const latticeColumn = (height: number, outerHeight: number) => {
    const a = colD / 2;
    const parts: BufferGeometry[] = [];
    const chord = 0.14;
    parts.push(memberBetween(new Vector3(-a, 0, 0), new Vector3(-a, outerHeight, 0), chord, chord));
    parts.push(memberBetween(new Vector3(a, 0, 0), new Vector3(a, height, 0), chord, chord));
    const step = Math.max(0.8, colD * 1.4);
    let y = 0.4;
    let left = true;
    while (y + step < height - 0.1) {
      parts.push(memberBetween(new Vector3(left ? -a : a, y, 0), new Vector3(left ? a : -a, y + step, 0), 0.07, 0.07));
      y += step;
      left = !left;
    }
    parts.push(memberBetween(new Vector3(-a, 0.4, 0), new Vector3(a, 0.4, 0), 0.08, 0.08));
    return mergeGeometries(parts);
  };

  const portalRafter = (() => {
    const x0 = -half - colD / 2;
    const xh = -half + Math.max(1.5, 0.12 * W);
    const xr = -Math.max(0.6, 0.06 * W);
    const s = new Shape();
    s.moveTo(x0, topSteel(x0));
    s.lineTo(0, topSteel(0));
    s.lineTo(0, topSteel(0) - rd * 1.25);
    s.lineTo(xr, topSteel(xr) - rd);
    s.lineTo(xh, topSteel(xh) - rd);
    s.lineTo(x0 + colD, topSteel(x0 + colD) - rd * 2);
    s.lineTo(x0, topSteel(x0) - rd * 2);
    s.closePath();
    const g = new ExtrudeGeometry(s, { depth: flange, bevelEnabled: false });
    g.translate(0, 0, -flange / 2);
    return g;
  })();

  const trussRafter = (() => {
    const chord = Math.min(0.26, Math.max(0.14, W / 250));
    const web = chord * 0.6;
    const panels = 2 * Math.max(3, Math.round(half / 2.4));
    const parts: BufferGeometry[] = [];
    const xs = Array.from({ length: panels + 1 }, (_, i) => -half + (i * W) / panels);
    const top = (x: number) => topSteel(x) - chord / 2;
    const bot = bottomChordY + chord / 2;
    parts.push(memberBetween(new Vector3(-half - 0.15, top(-half - 0.15), 0), new Vector3(0, top(0), 0), chord, chord));
    parts.push(memberBetween(new Vector3(0, top(0), 0), new Vector3(half + 0.15, top(half + 0.15), 0), chord, chord));
    parts.push(memberBetween(new Vector3(-half, bot, 0), new Vector3(half, bot, 0), chord, chord));
    xs.forEach((x, i) => {
      parts.push(memberBetween(new Vector3(x, bot, 0), new Vector3(x, top(x), 0), web, web));
      if (i < panels) {
        const xn = xs[i + 1];
        const towardCenter = x < 0;
        parts.push(
          towardCenter
            ? memberBetween(new Vector3(x, top(x), 0), new Vector3(xn, bot, 0), web, web)
            : memberBetween(new Vector3(x, bot, 0), new Vector3(xn, top(xn), 0), web, web)
        );
      }
    });
    return mergeGeometries(parts);
  })();

  const colTopOuter = topSteel(half + colD / 2);
  const latticeGeometry = latticeColumns ? latticeColumn(bottomChordY, colTopOuter) : null;

  frameZ.forEach((z, i) => {
    const frame = pad(i + 1);
    for (const side of [-1, 1] as const) {
      const axis = side < 0 ? "A" : "B";
      const x = side * half;
      const label = `${axis}-${frame}`;
      if (latticeGeometry) {
        b.add(
          { category: "columns", key: `COL-${label}`, label: `Columna ${label}`, bimCategory: "Structural Columns", family: "Columna reticulada", type: profiles.columns, material: steel, parameters: steelParams({ grilla: label, altura_m: r3(colTopOuter) }) },
          [{ geometry: latticeGeometry, materialKey: "structure", position: [x, 0, z], rotation: [0, side < 0 ? 0 : Math.PI, 0] }]
        );
      } else {
        const h = topSteel(half + colD / 2);
        b.add(
          { category: "columns", key: `COL-${label}`, label: `Columna ${label}`, bimCategory: "Structural Columns", family: "Columna alma llena", type: profiles.columns, material: steel, parameters: steelParams({ grilla: label, altura_m: r3(h) }) },
          [{ geometry: columnOfHeight(h), materialKey: "structure", position: [x, 0, z] }]
        );
      }
      footingAt(x, z, label, label);
    }

    if (trussRafters) {
      b.add(
        { category: "rafters", key: `TR-${frame}`, label: `Cercha pórtico ${frame}`, bimCategory: "Structural Trusses", family: "Viga reticulada", type: profiles.rafters, material: steel, parameters: steelParams({ portico: frame, luz_m: W, altura_apoyo_m: endDepth }) },
          [{ geometry: trussRafter, materialKey: "structure", position: [0, 0, z] }]
        );
    } else {
      for (const side of [-1, 1] as const) {
        const axis = side < 0 ? "A" : "B";
        b.add(
          { category: "rafters", key: `RA-${axis}${frame}`, label: `Viga ${axis}-${frame}`, bimCategory: "Structural Framing", family: "Viga alma llena con cartela", type: profiles.rafters, material: steel, parameters: steelParams({ portico: frame, faldon: axis }) },
          [{ geometry: portalRafter, materialKey: "structure", position: [0, 0, z], rotation: [0, side < 0 ? 0 : Math.PI, 0] }]
        );
      }
    }
  });

  /* ───────────── columnas de testero (snap con portones) ───────────── */
  for (const [z, doors, tag] of [[frameZ[0], frontDoors, "F"], [frameZ[n], backDoors, "C"]] as const) {
    for (const x of lay.gablePosts(doors)) {
      const k = Math.round(((x + half) * lay.postCount) / W);
      const h = (trussRafters ? bottomChordY : topSteel(x) - rd) - 0.02;
      const label = `${tag}${k}`;
      b.add(
        { category: "columns", key: `GC-${label}`, label: `Columna de testero ${label}`, bimCategory: "Structural Columns", family: "Columna de testero", type: profiles.columns, material: steel, parameters: steelParams({ grilla: label, altura_m: r3(h) }) },
        [{ geometry: iSection(0.26, 0.15, h), materialKey: "structure", position: [x, 0, z], rotation: [0, Math.PI / 2, 0] }]
      );
      footingAt(x, z, `G${label}`, `testero ${label}`, false);
    }
  }

  /* ───────────── fundaciones según el tipo elegido ───────────── */
  {
    const kind = config.foundation ?? "padFootings";
    const option = definition.structure.foundations?.find((f) => f.id === kind);
    const family = option?.name ?? "Fundación";
    const concrete = "Hormigón armado";
    const size = foundationSizes(W);
    const z0 = frameZ[0];
    const zN = frameZ[n];
    // Las caras de arriba quedan 1 cm por debajo de la platea: si coinciden
    // con su cara inferior, en la vista bajo el suelo "titilan".
    const TOP = SLAB_BOTTOM - 0.01;
    const runsAround = (inset: number): [string, string, number, number, number, number][] => [
      ["A", "lateral A", -half, z0 - inset, -half, zN + inset],
      ["B", "lateral B", half, z0 - inset, half, zN + inset],
      ["F", "frente", -half + inset, z0, half - inset, z0],
      ["C", "contrafrente", -half + inset, zN, half - inset, zN],
    ];
    if (kind === "stripFooting") {
      // Zapata corrida perimetral + viga de fundación bajo las líneas de columnas.
      const { width: bw, thickness: t, bottom, stemWidth } = size.strip;
      const stemH = TOP - (bottom + t);
      // Las zapatas y las vigas de los testeros llegan justo hasta las de los
      // laterales (se tocan, no se encimen: así no hay caras superpuestas).
      const stems = runsAround(stemWidth / 2);
      runsAround(bw / 2).forEach(([key, where, xa, za, xb, zb], i) => {
        const alongZ = Math.abs(zb - za) > Math.abs(xb - xa);
        const len = alongZ ? zb - za : xb - xa;
        const [, , sxa, sza, sxb, szb] = stems[i];
        const stemLen = alongZ ? szb - sza : sxb - sxa;
        b.add(
          { category: "foundations", key: `ZC-${key}`, label: `Zapata corrida ${where}`, bimCategory: "Structural Foundations", family, type: `${concrete} — ancho ${bw} m (referencial)`, material: concrete, parameters: { largo_m: r3(len), ancho_m: bw } },
          [
            { geometry: new BoxGeometry(alongZ ? bw : len, t, alongZ ? len : bw), materialKey: "footing", position: [(xa + xb) / 2, bottom + t / 2, (za + zb) / 2] },
            { geometry: new BoxGeometry(alongZ ? stemWidth : stemLen, stemH, alongZ ? stemLen : stemWidth), materialKey: "footing", position: [(sxa + sxb) / 2, TOP - stemH / 2, (sza + szb) / 2] },
          ]
        );
      });
    } else if (kind === "piles") {
      // Pilotes con cabezal bajo cada columna, unidos por vigas de encadenado.
      const P = size.piles;
      const pileTop = TOP - P.capHeight;
      const pileMain = new CylinderGeometry(P.diameter / 2, P.diameter / 2, P.length, 14);
      const pileGable = new CylinderGeometry(P.diameterGable / 2, P.diameterGable / 2, P.length, 14);
      const capMain = new BoxGeometry(P.capMain[0], P.capHeight, P.capMain[1]);
      const capGable = new BoxGeometry(P.capGable[0], P.capHeight, P.capGable[1]);
      for (const p of columnPoints) {
        const piles = p.main ? [-P.spacing / 2, P.spacing / 2] : [0];
        b.add(
          { category: "foundations", key: `PI-${p.key}`, label: `Cabezal y pilotes ${p.label}`, bimCategory: "Structural Foundations", family, type: `${concrete} — ${piles.length} pilote${piles.length > 1 ? "s" : ""} Ø ${Math.round((p.main ? P.diameter : P.diameterGable) * 100)} cm (referencial)`, material: concrete, parameters: { grilla: p.label, pilotes: piles.length, largo_pilote_m: P.length } },
          [
            { geometry: p.main ? capMain : capGable, materialKey: "footing", position: [p.x, TOP - P.capHeight / 2, p.z] },
            ...piles.map((dx): Part => ({ geometry: p.main ? pileMain : pileGable, materialKey: "footing", position: [p.x + dx, pileTop - P.length / 2, p.z] })),
          ]
        );
      }
      const [beamW, beamH] = P.beam;
      // Vigas: su cara de arriba queda dentro de los cabezales (más baja) y las
      // de los testeros terminan donde empiezan las de los laterales.
      const beamTop = TOP - 0.05;
      for (const [key, where, xa, za, xb, zb] of runsAround(beamW / 2).map(([k, w, xa, za, xb, zb]) => [k, w, xa, k === "A" || k === "B" ? za + beamW / 2 : za, xb, k === "A" || k === "B" ? zb - beamW / 2 : zb] as const)) {
        const alongZ = Math.abs(zb - za) > Math.abs(xb - xa);
        const len = alongZ ? zb - za : xb - xa;
        b.add(
          { category: "foundations", key: `VE-${key}`, label: `Viga de encadenado ${where}`, bimCategory: "Structural Framing", family: "Viga de encadenado", type: `${concrete} — ${beamW * 100}×${beamH * 100} cm (referencial)`, material: concrete, parameters: { largo_m: r3(len) } },
          [{ geometry: new BoxGeometry(alongZ ? beamW : len, beamH, alongZ ? len : beamW), materialKey: "footing", position: [(xa + xb) / 2, beamTop - beamH / 2, (za + zb) / 2] }]
        );
      }
    } else {
      // Bases aisladas: zapata cuadrada + fuste hasta la platea.
      const D = size.pad;
      const stemH = TOP - (D.bottom + D.thickness);
      const padMain = new BoxGeometry(D.side, D.thickness, D.side);
      const padGable = new BoxGeometry(D.sideGable, D.thickness, D.sideGable);
      const stem = new BoxGeometry(D.stem, stemH, D.stem);
      for (const p of columnPoints) {
        const side = p.main ? D.side : D.sideGable;
        b.add(
          { category: "foundations", key: `FD-${p.key}`, label: `Base ${p.label}`, bimCategory: "Structural Foundations", family, type: `${concrete} — ${side} × ${side} m (referencial)`, material: concrete, parameters: { grilla: p.label, lado_m: side } },
          [
            { geometry: p.main ? padMain : padGable, materialKey: "footing", position: [p.x, D.bottom + D.thickness / 2, p.z] },
            { geometry: stem, materialKey: "footing", position: [p.x, TOP - stemH / 2, p.z] },
          ]
        );
      }
    }
  }

  /* ───────────── correas ───────────── */
  const halfSlope = Math.hypot(half, ridge - eave);
  const purlinCount = Math.max(2, Math.ceil(halfSlope / PURLIN_SPACING) + 1);
  const purlinGeometry = new BoxGeometry(0.08, PURLIN_H, L + 0.4);
  for (const side of [-1, 1] as const) {
    const label = side < 0 ? "O" : "E";
    for (let k = 0; k < purlinCount; k += 1) {
      const t = k / (purlinCount - 1);
      const x = side * (half + 0.05 - t * (half - 0.25));
      const rot = side < 0 ? angle : -angle;
      const ny = Math.cos(angle);
      const nx = side < 0 ? -Math.sin(angle) : Math.sin(angle);
      const cy = roofSurface(x) - roofT;
      b.add(
        { category: "purlins", key: `PU-${label}${pad(k + 1)}`, label: `Correa ${label}-${pad(k + 1)}`, bimCategory: "Structural Framing", family: "Correa C conformada", type: profiles.purlins, material: "Acero galvanizado", parameters: { faldon: label === "O" ? "Oeste" : "Este", longitud_m: r3(L + 0.4) } },
        [{ geometry: purlinGeometry, materialKey: "secondary", position: [x - nx * (PURLIN_H / 2), cy - ny * (PURLIN_H / 2), 0], rotation: [0, 0, rot] }]
      );
    }
  }

  /* ───────────── largueros ───────────── */
  const girtStart = baseH > 0 ? baseH + 0.4 : 1.0;
  const girtHeights: number[] = [];
  for (let y = girtStart; y < eave - 0.5; y += GIRT_SPACING) girtHeights.push(y);
  const sideOpenings = (side: -1 | 1): [number, number, number, number][] => {
    // [z0, z1, base, top] de portones y puertas, que cortan los largueros (las
    // ventanas se resuelven aparte, sin cortar: ver más abajo).
    const result: [number, number, number, number][] = [];
    const doorBays = side > 0 ? sideDoorBays : [];
    for (const bay of doorBays) {
      const zc = (frameZ[bay] + frameZ[bay + 1]) / 2;
      result.push([zc - doorW / 2, zc + doorW / 2, 0, doorH]);
    }
    if (side < 0) {
      for (const bay of personDoorBays) {
        const z0 = frameZ[bay] + 1.0;
        result.push([z0, z0 + specs.personDoor.width, 0, specs.personDoor.height]);
      }
    }
    return result;
  };
  // Margen alrededor de una abertura dentro del cual un larguero se interrumpe.
  const OPENING_CLEAR = 0.1;
  for (const side of [-1, 1] as const) {
    const label = side < 0 ? "O" : "E";
    // El larguero va entre la columna y la chapa: su cara exterior queda 3 mm
    // detrás de la cara interior del cerramiento (antes asomaba por la fachada).
    const girtDepth = Math.max(0.06, 0.18 - wallT - 0.006);
    const x = side * (half + colD / 2 + 0.003 + girtDepth / 2);
    const cuts = sideOpenings(side);
    // Ventanas: el larguero que pasaría por la ventana no se corta en el aire.
    // En ese módulo se reemplaza por dos largueros horizontales de columna a
    // columna, uno justo debajo de la ventana y otro justo encima.
    const winBays = side > 0 ? windowBaysEast : windowBaysWest;
    const winTop = winV0 + winH;
    const crossesWindow = (y: number) => y > winV0 - OPENING_CLEAR && y < winTop + OPENING_CLEAR;
    const bayRange = (bay: number): [number, number] => [bay === 0 ? -L / 2 - 0.1 : frameZ[bay], bay === n - 1 ? L / 2 + 0.1 : frameZ[bay + 1]];
    girtHeights.forEach((y, k) => {
      // Sólo se corta el larguero que pasa a la altura de un portón o puerta:
      // los que quedan por encima siguen enteros.
      const exclusions = cuts.filter(([, , base, top]) => y > base - OPENING_CLEAR && y < top + OPENING_CLEAR).map(([z0, z1]) => [z0 - 0.05, z1 + 0.05] as [number, number]);
      if (crossesWindow(y)) exclusions.push(...winBays.map(bayRange));
      const segments = segmentsExcluding(-L / 2 - 0.1, L / 2 + 0.1, exclusions);
      const parts: Part[] = segments.map(([z0, z1]) => ({ geometry: new BoxGeometry(girtDepth, 0.08, z1 - z0), materialKey: "secondary" as MaterialKey, position: [x, y, (z0 + z1) / 2] }));
      b.add({ category: "girts", key: `GI-${label}${pad(k + 1)}`, label: `Larguero lateral ${label}-${pad(k + 1)}`, bimCategory: "Structural Framing", family: "Larguero C conformado", type: profiles.girts, material: "Acero galvanizado", parameters: { altura_m: r3(y) } }, parts);
    });
    if (girtHeights.some(crossesWindow)) {
      winBays.forEach((bay, k) => {
        const [z0, z1] = bayRange(bay);
        const parts: Part[] = [winV0 - 0.06, winTop + 0.06].map((y) => ({ geometry: new BoxGeometry(girtDepth, 0.08, z1 - z0), materialKey: "secondary" as MaterialKey, position: [x, y, (z0 + z1) / 2] }));
        b.add(
          { category: "girts", key: `GV-${label}${pad(k + 1)}`, label: `Largueros de ventana ${label}-${pad(k + 1)}`, bimCategory: "Structural Framing", family: "Larguero C conformado", type: profiles.girts, material: "Acero galvanizado", parameters: { modulo: bay + 1, antepecho_m: r3(winV0 - 0.06), dintel_m: r3(winTop + 0.06) } },
          parts
        );
      });
    }
  }
  for (const [zSign, doors, tag] of [[-1, frontDoors, "F"], [1, backDoors, "C"]] as const) {
    const z = zSign * (L / 2 + flange / 2 + 0.09);
    girtHeights.concat(ridge - eave > 1.2 ? [eave + (ridge - eave) * 0.45] : []).forEach((y, k) => {
      const reach = y > eave ? half - (y - eave) / S - 0.3 : half;
      if (reach < 1) return;
      const exclusions = y < doorH + 0.1 ? doors.map((dx) => [dx - doorW / 2 - 0.05, dx + doorW / 2 + 0.05] as [number, number]) : [];
      const segments = segmentsExcluding(-reach, reach, exclusions);
      const parts: Part[] = segments.map(([x0, x1]) => ({ geometry: new BoxGeometry(x1 - x0, 0.08, 0.18), materialKey: "secondary" as MaterialKey, position: [(x0 + x1) / 2, y, z] }));
      b.add({ category: "girts", key: `GI-${tag}${pad(k + 1)}`, label: `Larguero testero ${tag}-${pad(k + 1)}`, bimCategory: "Structural Framing", family: "Larguero C conformado", type: profiles.girts, material: "Acero galvanizado", parameters: { altura_m: r3(y) } }, parts);
    });
  }

  /* ───────────── arriostramientos (módulos extremos) ───────────── */
  const braceBays = n >= 3 ? [0, n - 1] : [0];
  for (const bay of braceBays) {
    const z0 = frameZ[bay];
    const z1 = frameZ[bay + 1];
    for (const side of [-1, 1] as const) {
      const label = side < 0 ? "O" : "E";
      const xa = side * half;
      const xb = side * 0.5;
      const ya = (x: number) => (trussRafters ? topSteel(x) - 0.12 : topSteel(x) - 0.1);
      b.add(
        { category: "bracing", key: `BR-R${label}${pad(bay + 1)}`, label: `Arriostramiento de cubierta ${label}-${pad(bay + 1)}`, bimCategory: "Structural Framing", family: "Cruz de San Andrés", type: profiles.bracing, material: "Acero", parameters: { modulo: bay + 1 } },
        [{ geometry: mergeGeometries([memberBetween(new Vector3(xa, ya(xa), z0), new Vector3(xb, ya(xb), z1), 0.04, 0.04), memberBetween(new Vector3(xa, ya(xa), z1), new Vector3(xb, ya(xb), z0), 0.04, 0.04)]), materialKey: "bracing" }]
      );
      const top = (trussRafters ? bottomChordY : topSteel(half) - rd * 2) - 0.1;
      const xw = side * half;
      b.add(
        { category: "bracing", key: `BR-W${label}${pad(bay + 1)}`, label: `Arriostramiento lateral ${label}-${pad(bay + 1)}`, bimCategory: "Structural Framing", family: "Cruz de San Andrés", type: profiles.bracing, material: "Acero", parameters: { modulo: bay + 1 } },
        [{ geometry: mergeGeometries([memberBetween(new Vector3(xw, 0.3, z0), new Vector3(xw, top, z1), 0.04, 0.04), memberBetween(new Vector3(xw, 0.3, z1), new Vector3(xw, top, z0), 0.04, 0.04)]), materialKey: "bracing" }]
      );
    }
  }

  /* ───────────── cubierta + lucernarios ───────────── */
  const sheetLen = halfSlope + EAVE_OVERHANG + 0.05;
  const isSkylight = lay.isSkylight;
  const sheetPiece = (fromT: number, toT: number, bayLen: number, openEnds: number[] = []) =>
    dropFacesOnPlanes(meterUVsForBox(new BoxGeometry((toT - fromT) * sheetLen, roofT, bayLen), "z"), "z", openEnds.map((e) => (e * bayLen) / 2));
  for (let bay = 0; bay < n; bay += 1) {
    const z0 = frameZ[bay] - (bay === 0 ? 0.45 : 0);
    const z1 = frameZ[bay + 1] + (bay === n - 1 ? 0.45 : 0);
    const bayLen = z1 - z0;
    const zc = (z0 + z1) / 2;
    const isSkylightBay = isSkylight(bay);
    for (const side of [-1, 1] as const) {
      const label = side < 0 ? "O" : "E";
      const rot = side < 0 ? angle : -angle;
      // Parámetro t: 0 = alero (incluye vuelo), 1 = cumbrera
      const pointAt = (t: number) => {
        const along = -EAVE_OVERHANG + t * sheetLen;
        const x = side * (half - along * Math.cos(angle));
        return { x, y: roofSurface(x) };
      };
      const placeSlice = (fromT: number, toT: number) => {
        const p = pointAt((fromT + toT) / 2);
        const nx = side < 0 ? -Math.sin(angle) : Math.sin(angle);
        const ny = Math.cos(angle);
        return [p.x - nx * (roofT / 2), p.y - ny * (roofT / 2), zc] as [number, number, number];
      };
      // Sin tapas en la unión con el módulo vecino, salvo junto a un lucernario
      // (ahí el canto de la chapa se ve a través del policarbonato).
      const openEnds = [...(bay > 0 && !isSkylight(bay - 1) ? [-1] : []), ...(bay < n - 1 && !isSkylight(bay + 1) ? [1] : [])];
      const parts = (ranges: [number, number][]) => ranges.map(([a, c]) => ({ geometry: sheetPiece(a, c, bayLen, openEnds), materialKey: "roofSheet" as MaterialKey, position: placeSlice(a, c), rotation: [0, 0, rot] as [number, number, number] }));
      const common = { category: "roof" as ModelCategory, bimCategory: "Roofs", family: roofOption.name, type: roofOption.name, material: roofOption.name, parameters: { faldon: label === "O" ? "Oeste" : "Este", modulo: bay + 1, pendiente_pct: d.roofSlope, espesor_mm: roofOption.thicknessMm } };
      if (isSkylightBay) {
        b.add({ ...common, key: `RF-${label}${pad(bay + 1)}`, label: `Cubierta ${label}-${pad(bay + 1)}` }, parts([[0, 0.38], [0.62, 1]]));
        const p = placeSlice(0.38, 0.62);
        b.add(
          { category: "skylights", key: `SK-${label}${pad(bay + 1)}`, label: `Lucernario ${label}-${pad(bay + 1)}`, bimCategory: "Roofs", family: "Lucernario policarbonato", type: "Policarbonato alveolar", material: "Policarbonato", parameters: { modulo: bay + 1, faldon: label === "O" ? "Oeste" : "Este" } },
          // Ocupa todo el largo del hueco: antes quedaban 30 cm abiertos en cada punta.
          [{ geometry: sheetPiece(0.38, 0.62, bayLen), materialKey: "skylight", position: [p[0], p[1] + 0.005, p[2]], rotation: [0, 0, rot] }]
        );
      } else {
        b.add({ ...common, key: `RF-${label}${pad(bay + 1)}`, label: `Cubierta ${label}-${pad(bay + 1)}` }, parts([[0, 1]]));
      }
    }
  }
  // Cumbrera
  const capW = 0.45;
  const cap = (side: -1 | 1) => {
    const g = new BoxGeometry(capW, 0.02, L + 0.9);
    return { geometry: g, materialKey: "roofSheet" as MaterialKey, position: [side * (capW / 2) * Math.cos(angle), ridge + 0.02 - (capW / 2) * Math.sin(angle), 0] as [number, number, number], rotation: [0, 0, side < 0 ? angle : -angle] as [number, number, number] };
  };
  b.add({ category: "roof", key: "RF-RIDGE", label: "Cumbrera", bimCategory: "Roofs", family: "Cumbrera", type: "Babeta de cumbrera", material: roofOption.name }, [cap(-1), cap(1)]);

  /* ───────────── canaletas y bajadas ───────────── */
  for (const side of [-1, 1] as const) {
    const label = side < 0 ? "O" : "E";
    const gx = side * (half + EAVE_OVERHANG * Math.cos(angle) + 0.1);
    const gy = roofSurface(half + EAVE_OVERHANG * Math.cos(angle)) - 0.16;
    const downPipes = [frameZ[0], frameZ[Math.floor(n / 2)], frameZ[n]].map((z, k) => ({
      geometry: new CylinderGeometry(0.06, 0.06, gy, 10),
      materialKey: "gutter" as MaterialKey,
      position: [side * (wallX + 0.12), gy / 2, z + (k === 0 ? 0.4 : k === 2 ? -0.4 : 0.6)] as [number, number, number],
    }));
    b.add(
      { category: "gutters", key: `GU-${label}`, label: `Canaleta ${label === "O" ? "oeste" : "este"}`, bimCategory: "Gutters", family: "Canaleta de chapa", type: "Desarrollo a definir", material: "Chapa galvanizada", parameters: { longitud_m: r3(L + 0.9), bajadas: downPipes.length } },
      [{ geometry: new BoxGeometry(0.28, 0.2, L + 0.9), materialKey: "gutter", position: [gx, gy, 0] }, ...downPipes]
    );
  }

  /* ───────────── cerramientos laterales ───────────── */
  // Uniones entre módulos (pórticos interiores): ahí se tocan dos piezas.
  const joints = frameZ.slice(1, -1);
  const sideTop = roofSurface(wallX) - roofT - 0.03;
  for (const side of [-1, 1] as const) {
    const label = side < 0 ? "O" : "E";
    const doorBays = new Set(side > 0 ? sideDoorBays : []);
    const winBays = new Set(side > 0 ? windowBaysEast : windowBaysWest);
    const personBays = new Set(side < 0 ? personDoorBays : []);
    for (let bay = 0; bay < n; bay += 1) {
      const u0 = bay === 0 ? -gableZ - wallT : frameZ[bay];
      const u1 = bay === n - 1 ? gableZ + wallT : frameZ[bay + 1];
      const uc = (frameZ[bay] + frameZ[bay + 1]) / 2;
      const openings: Rect[] = [];
      if (doorBays.has(bay)) openings.push({ u0: uc - doorW / 2, u1: uc + doorW / 2, v0: 0, v1: doorH });
      if (personBays.has(bay)) openings.push({ u0: frameZ[bay] + 1.0, u1: frameZ[bay] + 1.0 + specs.personDoor.width, v0: 0, v1: specs.personDoor.height });
      if (winBays.has(bay)) openings.push({ u0: uc - winW / 2, u1: uc + winW / 2, v0: winV0, v1: winV0 + winH });

      const sheetOpenings = openings.map((op) => ({ ...op, v0: Math.max(op.v0, baseH) })).filter((op) => op.v1 > baseH + 0.05);
      // Muescas: aberturas que llegan al borde inferior del panel de chapa.
      const sheetRects = sheetOpenings.map((op) => (op.v0 <= baseH + 0.001 ? { ...op, v0: baseH } : op));
      // forma en (u=z, v=y), extrusión → mapear a pared en x = ±wallX
      const geometry = panelWithOpenings([[u1, sideTop], [u0, sideTop]], u0, u1, baseH, sheetRects, wallT).rotateY(-Math.PI / 2);
      const panel = dropFacesOnPlanes(geometry, "z", joints.filter((j) => Math.abs(j - u0) < 0.001 || Math.abs(j - u1) < 0.001));
      const xOuter = side * wallX;
      const parts: Part[] = [{ geometry: panel, materialKey: "wallSheet", position: [side < 0 ? xOuter + wallT : xOuter, 0, 0] }];
      b.add(
        { category: "walls", key: `WL-${label}${pad(bay + 1)}`, label: `Cerramiento ${label}-${pad(bay + 1)}`, bimCategory: "Walls", family: wallOption.name, type: wallOption.name, material: wallOption.name, parameters: { modulo: bay + 1, lado: label === "O" ? "Oeste" : "Este", espesor_mm: wallOption.thicknessMm } },
        parts
      );
      if (baseH > 0) {
        const gaps = openings.filter((op) => op.v0 < baseH).map((op) => [op.u0, op.u1] as [number, number]);
        const segs = segmentsExcluding(u0, u1, gaps);
        b.add(
          { category: "walls", key: `PC-${label}${pad(bay + 1)}`, label: `Zócalo premoldeado ${label}-${pad(bay + 1)}`, bimCategory: "Walls", family: "Panel premoldeado", type: `Hormigón premoldeado h=${baseH} m`, material: "Hormigón", parameters: { modulo: bay + 1, altura_m: baseH } },
          segs.map(([a, c]) => ({
            geometry: dropFacesOnPlanes(meterUVsForBox(new BoxGeometry(0.16, baseH, c - a), "z"), "z", joints.filter((j) => Math.abs(j - a) < 0.001 || Math.abs(j - c) < 0.001).map((j) => j - (a + c) / 2)),
            materialKey: "precast" as MaterialKey,
            position: [side * (wallX - 0.02), baseH / 2, (a + c) / 2] as [number, number, number],
          }))
        );
      }
    }
  }

  /* ───────────── testeros ───────────── */
  for (const [zSign, doors, tag, name] of [[-1, frontDoors, "F", "Frente"], [1, backDoors, "C", "Contrafrente"]] as const) {
    // El testero termina contra la cara interior de los laterales, así las
    // esquinas no tienen dos caras en el mismo plano.
    const gableX = wallX - wallT;
    const top: [number, number][] = [
      [gableX, roofSurface(wallX) - roofT - 0.03],
      [0, roofSurface(0) - roofT - 0.03],
      [-gableX, roofSurface(wallX) - roofT - 0.03],
    ];
    const openings: Rect[] = doors.map((dx) => ({ u0: dx - doorW / 2, u1: dx + doorW / 2, v0: 0, v1: doorH }));
    const sheetRects = openings.filter((op) => op.v1 > baseH + 0.05).map((op) => ({ ...op, v0: baseH }));
    const geometry = panelWithOpenings(top, -gableX, gableX, baseH, sheetRects, wallT);
    const z = zSign * gableZ;
    b.add(
      { category: "walls", key: `WL-${tag}`, label: `Cerramiento ${name.toLowerCase()}`, bimCategory: "Walls", family: wallOption.name, type: wallOption.name, material: wallOption.name, parameters: { testero: name, espesor_mm: wallOption.thicknessMm } },
      [{ geometry, materialKey: "wallSheet", position: [0, 0, zSign < 0 ? z - wallT : z] }]
    );
    if (baseH > 0) {
      const segs = segmentsExcluding(-wallX, wallX, openings.map((op) => [op.u0, op.u1]));
      b.add(
        { category: "walls", key: `PC-${tag}`, label: `Zócalo premoldeado ${name.toLowerCase()}`, bimCategory: "Walls", family: "Panel premoldeado", type: `Hormigón premoldeado h=${baseH} m`, material: "Hormigón", parameters: { altura_m: baseH } },
        segs.map(([a, c]) => ({ geometry: meterUVsForBox(new BoxGeometry(c - a, baseH, 0.16), "x"), materialKey: "precast" as MaterialKey, position: [(a + c) / 2, baseH / 2, zSign * (gableZ - 0.02)] }))
      );
    }
    // Portones del testero
    doors.forEach((dx, k) => {
      const zDoor = zSign * (gableZ - 0.12);
      b.add(
        { category: "doors", key: `DR-${tag}${k + 1}`, label: `Portón ${name.toLowerCase()} ${k + 1}`, bimCategory: "Doors", family: specs.sectionalDoor.name, type: `${doorW} × ${r3(doorH)} m`, material: "Panel de acero con aislación", parameters: { ancho_m: doorW, alto_m: r3(doorH), testero: name } },
        [
          { geometry: meterUVsForBox(new BoxGeometry(doorW - 0.04, doorH - 0.02, 0.05), "x"), materialKey: "sectionalDoor", position: [dx, doorH / 2, zDoor] },
          { geometry: mergeGeometries([new BoxGeometry(0.12, doorH, 0.14).translate(-doorW / 2 - 0.06 + TRIM_INSET, doorH / 2, 0), new BoxGeometry(0.12, doorH, 0.14).translate(doorW / 2 + 0.06 - TRIM_INSET, doorH / 2, 0), new BoxGeometry(doorW + 0.24, 0.12, 0.14).translate(0, doorH + 0.06 - TRIM_INSET, 0)]), materialKey: "trim", position: [dx, 0, zSign * (gableZ - 0.02)] },
        ]
      );
    });
  }

  /* ───────────── aberturas laterales ───────────── */
  sideDoorBays.forEach((bay, k) => {
    const zc = (frameZ[bay] + frameZ[bay + 1]) / 2;
    const x = wallX - 0.12;
    b.add(
      { category: "doors", key: `DR-E${k + 1}`, label: `Portón lateral ${k + 1}`, bimCategory: "Doors", family: specs.sectionalDoor.name, type: `${doorW} × ${r3(doorH)} m`, material: "Panel de acero con aislación", parameters: { ancho_m: doorW, alto_m: r3(doorH), modulo: bay + 1 } },
      [
        { geometry: meterUVsForBox(new BoxGeometry(0.05, doorH - 0.02, doorW - 0.04), "z"), materialKey: "sectionalDoor", position: [x, doorH / 2, zc] },
        { geometry: mergeGeometries([new BoxGeometry(0.14, doorH, 0.12).translate(0, doorH / 2, -doorW / 2 - 0.06 + TRIM_INSET), new BoxGeometry(0.14, doorH, 0.12).translate(0, doorH / 2, doorW / 2 + 0.06 - TRIM_INSET), new BoxGeometry(0.14, 0.12, doorW + 0.24).translate(0, doorH + 0.06 - TRIM_INSET, 0)]), materialKey: "trim", position: [wallX - 0.02, 0, zc] },
      ]
    );
  });
  personDoorBays.forEach((bay, k) => {
    const pw = specs.personDoor.width;
    const ph = specs.personDoor.height;
    const zc = frameZ[bay] + 1.0 + pw / 2;
    b.add(
      { category: "doors", key: `PD-O${k + 1}`, label: `Puerta peatonal ${k + 1}`, bimCategory: "Doors", family: specs.personDoor.name, type: `${pw} × ${ph} m`, material: "Chapa doble", parameters: { ancho_m: pw, alto_m: ph, modulo: bay + 1 } },
      [
        { geometry: new BoxGeometry(0.05, ph - 0.02, pw - 0.04), materialKey: "personDoor", position: [-wallX + 0.1, ph / 2, zc] },
        { geometry: mergeGeometries([new BoxGeometry(0.13, ph, 0.08).translate(0, ph / 2, -pw / 2 - 0.04 + TRIM_INSET), new BoxGeometry(0.13, ph, 0.08).translate(0, ph / 2, pw / 2 + 0.04 - TRIM_INSET), new BoxGeometry(0.13, 0.08, pw + 0.16).translate(0, ph + 0.04 - TRIM_INSET, 0)]), materialKey: "trim", position: [-wallX - 0.02, 0, zc] },
      ]
    );
  });
  for (const side of [-1, 1] as const) {
    const label = side < 0 ? "O" : "E";
    const bays = side < 0 ? windowBaysWest : windowBaysEast;
    bays.forEach((bay, k) => {
      const zc = (frameZ[bay] + frameZ[bay + 1]) / 2;
      const x = side * (wallX - wallT / 2);
      const f = 0.07;
      const frame = mergeGeometries([
        new BoxGeometry(0.12, f, winW).translate(0, -winH / 2 + f / 2, 0),
        new BoxGeometry(0.12, f, winW).translate(0, winH / 2 - f / 2, 0),
        new BoxGeometry(0.12, winH, f).translate(0, 0, -winW / 2 + f / 2),
        new BoxGeometry(0.12, winH, f).translate(0, 0, winW / 2 - f / 2),
        new BoxGeometry(0.1, winH - 2 * f, 0.04),
      ]);
      b.add(
        { category: "windows", key: `WN-${label}${pad(k + 1)}`, label: `Ventana ${label}-${pad(k + 1)}`, bimCategory: "Windows", family: specs.window.name, type: `${r3(winW)} × ${winH} m`, material: "Aluminio + vidrio", parameters: { modulo: bay + 1, antepecho_m: r3(winV0) } },
        [
          { geometry: frame, materialKey: "trim", position: [x, winV0 + winH / 2, zc] },
          { geometry: new BoxGeometry(0.02, winH - 2 * f, winW - 2 * f), materialKey: "glass", position: [x, winV0 + winH / 2, zc] },
        ]
      );
    });
  }

  /* ───────────── marquesina ───────────── */
  if (lay.canopy) {
    const { width: cw, depth, height: hc, zWall } = lay.canopy;
    const beams: BufferGeometry[] = [];
    const beamCount = Math.max(2, Math.round(cw / 4) + 1);
    for (let k = 0; k < beamCount; k += 1) {
      const x = -cw / 2 + (k * cw) / (beamCount - 1);
      beams.push(memberBetween(new Vector3(x, hc + 0.25, zWall), new Vector3(x, hc + 0.05, zWall - depth), 0.12, 0.22));
      beams.push(memberBetween(new Vector3(x, hc - 1.1, zWall), new Vector3(x, hc + 0.18, zWall - depth * 0.55), 0.05, 0.05));
    }
    beams.push(memberBetween(new Vector3(-cw / 2, hc + 0.08, zWall - depth), new Vector3(cw / 2, hc + 0.08, zWall - depth), 0.12, 0.2));
    b.add(
      { category: "canopy", key: "CN-STRUCT", label: "Estructura de marquesina", bimCategory: "Structural Framing", family: "Marquesina en voladizo", type: `${r3(cw)} × ${depth} m`, material: steel, parameters: { ancho_m: r3(cw), vuelo_m: depth } },
      [{ geometry: mergeGeometries(beams), materialKey: "structure" }]
    );
    const tilt = Math.atan(0.2 / depth);
    b.add(
      { category: "canopy", key: "CN-ROOF", label: "Cubierta de marquesina", bimCategory: "Roofs", family: roofOption.name, type: roofOption.name, material: roofOption.name, parameters: { ancho_m: r3(cw), vuelo_m: depth } },
      [{ geometry: meterUVsForBox(new BoxGeometry(cw + 0.3, 0.05, depth + 0.2), "x"), materialKey: "canopyRoof", position: [0, hc + 0.32, zWall - depth / 2], rotation: [-tilt, 0, 0] }]
    );
  }

  /* ───────────── puente grúa (placeholder) ───────────── */
  if (lay.crane) {
    const { railY, railX } = lay.crane;
    for (const side of [-1, 1] as const) {
      const label = side < 0 ? "A" : "B";
      const parts: BufferGeometry[] = [new BoxGeometry(0.3, 0.6, L).translate(side * railX, railY, 0)];
      for (const z of frameZ) parts.push(new BoxGeometry(0.5, 0.45, 0.25).translate(side * (railX + 0.2), railY - 0.5, z));
      b.add(
        { category: "equipment", key: `CR-RUN-${label}`, label: `Viga carrilera ${label}`, bimCategory: "Specialty Equipment", family: "Viga carrilera (placeholder)", type: "Capacidad a definir", material: steel, parameters: { altura_riel_m: r3(railY + 0.3) } },
        [{ geometry: mergeGeometries(parts), materialKey: "structure" }]
      );
    }
    const bridgeZ = lay.crane.bridgeZ;
    const span = 2 * railX;
    b.add(
      { category: "equipment", key: "CR-BRIDGE", label: "Puente grúa (placeholder)", bimCategory: "Specialty Equipment", family: "Puente grúa birriel", type: "Representación conceptual — sin capacidad definida", material: "Acero pintado", parameters: { luz_m: r3(span), estado: "placeholder" } },
      [
        { geometry: mergeGeometries([new BoxGeometry(span, 0.8, 0.45).translate(0, 0, -0.6), new BoxGeometry(span, 0.8, 0.45).translate(0, 0, 0.6), new BoxGeometry(0.6, 0.5, 2.4).translate(-span / 2, -0.1, 0), new BoxGeometry(0.6, 0.5, 2.4).translate(span / 2, -0.1, 0)]), materialKey: "crane", position: [0, railY + 0.75, bridgeZ] },
        { geometry: mergeGeometries([new BoxGeometry(1.6, 0.7, 1.8).translate(0, 0.55, 0), new CylinderGeometry(0.02, 0.02, 3, 6).translate(0, -1.3, 0), new BoxGeometry(0.4, 0.5, 0.25).translate(0, -2.9, 0)]), materialKey: "trim", position: [-span * 0.18, railY + 0.75, bridgeZ] },
      ]
    );
  }

  const modelId = options.modelId ?? `${definition.code}-${config.structure}-${W}x${L}x${eave}`;
  const metadata: ModelMetadataDocument = {
    schema: "mw.product-metadata/1",
    model: {
      id: modelId,
      name: options.modelName ?? `${definition.name} ${W} × ${L} m`,
      source: options.source ?? "procedural",
      units: "m",
      tool: "MW Galpones procedural adapter",
    },
    elements: b.elements,
  };
  return { root: b.root, metadata, stats: b.stats() };
}

/** Libera geometrías de un modelo generado (el visor lo llama al reemplazarlo). */
export function disposeGeneratedModel(root: Group) {
  const seen = new Set<BufferGeometry>();
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.isMesh && mesh.geometry && !seen.has(mesh.geometry)) {
      seen.add(mesh.geometry);
      mesh.geometry.dispose();
    }
  });
}
