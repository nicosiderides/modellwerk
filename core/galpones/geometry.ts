import {
  BoxGeometry,
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
import { ridgeHeight } from "./configuration.ts";
import { EAVE_OVERHANG, GIRT_SPACING, PURLIN_SPACING, columnDepth, rafterDepth, trussEndDepth } from "./geometry-rules.ts";
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
export function distributeInBays(count: number, bayCount: number, exclude: Set<number> = new Set()) {
  const candidates: number[] = [];
  for (let i = 1; i < bayCount - 1; i += 1) if (!exclude.has(i)) candidates.push(i);
  if (bayCount <= 2) for (let i = 0; i < bayCount; i += 1) if (!exclude.has(i)) candidates.push(i);
  const picked: number[] = [];
  if (count <= 0 || candidates.length === 0) return picked;
  const n = Math.min(count, candidates.length);
  for (let k = 0; k < n; k += 1) {
    const index = Math.min(candidates.length - 1, Math.floor(((k + 0.5) * candidates.length) / n));
    picked.push(candidates[index]);
  }
  return [...new Set(picked)];
}

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
  const d = config.dimensions;
  const W = d.width;
  const L = d.length;
  const half = W / 2;
  const S = d.roofSlope / 100;
  const angle = Math.atan(S);
  const eave = d.eaveHeight;
  const ridge = ridgeHeight(d);
  const n = d.bayCount;
  const frameZ = Array.from({ length: n + 1 }, (_, i) => -L / 2 + i * d.baySpacing);

  const env = definition.envelope;
  const roofOption = env.roof.find((o) => o.id === config.envelope.roof) ?? env.roof[0];
  const wallOption = env.walls.find((o) => o.id === config.envelope.walls) ?? env.walls[0];
  const finish = definition.structure.finishes.find((f) => f.id === config.structureFinish);
  const system = definition.structure.systems.find((s) => s.id === config.structure);
  const systemName = system?.name ?? config.structure;
  const profiles = definition.structure.profileLabels;
  const finishName = finish?.name ?? "";
  const roofT = Math.max(0.03, roofOption.thicknessMm / 1000);
  const wallT = Math.max(0.03, wallOption.thicknessMm / 1000);
  const precast = wallOption.finish === "precastSheet";
  const baseH = precast ? env.precastBaseHeight : 0;

  const latticeColumns = config.structure === "truss";
  const trussRafters = config.structure === "truss" || config.structure === "mixed";
  const colD = latticeColumns ? Math.max(0.6, columnDepth(W, eave) + 0.2) : columnDepth(W, eave);
  const flange = Math.min(0.32, 0.16 + colD * 0.18);
  const rd = rafterDepth(W);
  const PURLIN_H = 0.2;

  const roofSurface = (x: number) => eave + (half - Math.abs(x)) * S;
  const topSteel = (x: number) => roofSurface(x) - roofT - PURLIN_H;
  const endDepth = trussEndDepth(W);
  const bottomChordY = topSteel(half) - endDepth;
  const wallX = half + colD / 2 + 0.18;
  const gableZ = L / 2 + flange / 2 + 0.18;

  const steel = "Acero estructural";
  const steelParams = (extra: Record<string, string | number>) => ({ sistema: systemName, terminacion: finishName, ...extra });

  /* ───────────── aberturas (snap points) ───────────── */
  const specs = definition.options.openings;
  const doorW = specs.sectionalDoor.width;
  const doorH = Math.min(specs.sectionalDoor.height, eave - 0.6);
  const o = config.openings;
  const gableDoorX = (count: number) => Array.from({ length: count }, (_, i) => -half + ((i + 1) * W) / (count + 1));
  const frontDoors = gableDoorX(o.doorsFront);
  const backDoors = gableDoorX(o.doorsBack);
  const sideDoorBays = distributeInBays(o.doorsSide, n);
  const personDoorBays = distributeInBays(o.personDoors, n);
  const windowBaysEast = distributeInBays(o.windowsPerSide, n, new Set(sideDoorBays));
  const windowBaysWest = distributeInBays(o.windowsPerSide, n, new Set(personDoorBays));
  const winW = Math.min(specs.window.width, d.baySpacing - 1.4);
  const winH = specs.window.height;
  const winV0 = Math.max(baseH + 0.5, Math.min(eave * 0.55, eave - winH - 0.8));

  /* ───────────── fundaciones ───────────── */
  b.add(
    { category: "foundations", key: "SLAB", label: "Platea / contrapiso", bimCategory: "Floors", family: "Contrapiso de hormigón", type: "Hormigón armado — espesor a definir", material: "Hormigón", parameters: { area_m2: Math.round(W * L) } },
    [{ geometry: meterUVsForBox(new BoxGeometry(2 * wallX + 0.6, 0.2, 2 * gableZ + 0.6), "x"), materialKey: "slab", position: [0, -0.1, 0] }]
  );
  const footing = new BoxGeometry(1.4, 0.6, 1.4);
  const footingAt = (x: number, z: number, key: string, label: string) =>
    b.add(
      { category: "foundations", key: `FD-${key}`, label: `Base ${label}`, bimCategory: "Structural Foundations", family: "Base aislada", type: "A definir por ingeniería", material: "Hormigón armado", parameters: { grilla: label } },
      [{ geometry: footing, materialKey: "footing", position: [x, -0.5, z] }]
    );

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
  const postCount = Math.max(1, Math.round(W / 6));
  for (const [z, doors, tag] of [[frameZ[0], frontDoors, "F"], [frameZ[n], backDoors, "C"]] as const) {
    for (let k = 1; k < postCount; k += 1) {
      const x = -half + (k * W) / postCount;
      if (doors.some((dx) => Math.abs(x - dx) < doorW / 2 + 0.25)) continue;
      const h = (trussRafters ? bottomChordY : topSteel(x) - rd) - 0.02;
      const label = `${tag}${k}`;
      b.add(
        { category: "columns", key: `GC-${label}`, label: `Columna de testero ${label}`, bimCategory: "Structural Columns", family: "Columna de testero", type: profiles.columns, material: steel, parameters: steelParams({ grilla: label, altura_m: r3(h) }) },
        [{ geometry: iSection(0.26, 0.15, h), materialKey: "structure", position: [x, 0, z], rotation: [0, Math.PI / 2, 0] }]
      );
      footingAt(x, z, `G${label}`, `testero ${label}`);
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
  const sideOpenings = (side: -1 | 1): [number, number, number][] => {
    // [z0, z1, top] de aberturas que cortan largueros
    const result: [number, number, number][] = [];
    const doorBays = side > 0 ? sideDoorBays : [];
    for (const bay of doorBays) {
      const zc = (frameZ[bay] + frameZ[bay + 1]) / 2;
      result.push([zc - doorW / 2, zc + doorW / 2, doorH]);
    }
    const winBays = side > 0 ? windowBaysEast : windowBaysWest;
    for (const bay of winBays) {
      const zc = (frameZ[bay] + frameZ[bay + 1]) / 2;
      result.push([zc - winW / 2, zc + winW / 2, winV0 + winH]);
    }
    if (side < 0) {
      for (const bay of personDoorBays) {
        const z0 = frameZ[bay] + 1.0;
        result.push([z0, z0 + specs.personDoor.width, specs.personDoor.height]);
      }
    }
    return result;
  };
  for (const side of [-1, 1] as const) {
    const label = side < 0 ? "O" : "E";
    const x = side * (half + colD / 2 + 0.09);
    const cuts = sideOpenings(side);
    girtHeights.forEach((y, k) => {
      const exclusions = cuts.filter(([, , top]) => y < top + 0.1).map(([z0, z1]) => [z0 - 0.05, z1 + 0.05] as [number, number]);
      const segments = segmentsExcluding(-L / 2 - 0.1, L / 2 + 0.1, exclusions);
      const parts: Part[] = segments.map(([z0, z1]) => ({ geometry: new BoxGeometry(0.18, 0.08, z1 - z0), materialKey: "secondary" as MaterialKey, position: [x, y, (z0 + z1) / 2] }));
      b.add({ category: "girts", key: `GI-${label}${pad(k + 1)}`, label: `Larguero lateral ${label}-${pad(k + 1)}`, bimCategory: "Structural Framing", family: "Larguero C conformado", type: profiles.girts, material: "Acero galvanizado", parameters: { altura_m: r3(y) } }, parts);
    });
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
  const skylightsOn = Boolean(config.options.skylights);
  const sheetLen = halfSlope + EAVE_OVERHANG + 0.05;
  const sheetPiece = (fromT: number, toT: number, bayLen: number) =>
    meterUVsForBox(new BoxGeometry((toT - fromT) * sheetLen, roofT, bayLen), "z");
  for (let bay = 0; bay < n; bay += 1) {
    const z0 = frameZ[bay] - (bay === 0 ? 0.45 : 0);
    const z1 = frameZ[bay + 1] + (bay === n - 1 ? 0.45 : 0);
    const bayLen = z1 - z0;
    const zc = (z0 + z1) / 2;
    const isSkylightBay = skylightsOn && bay % 2 === 1 && bay < n - 1;
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
      const parts = (ranges: [number, number][]) => ranges.map(([a, c]) => ({ geometry: sheetPiece(a, c, bayLen), materialKey: "roofSheet" as MaterialKey, position: placeSlice(a, c), rotation: [0, 0, rot] as [number, number, number] }));
      const common = { category: "roof" as ModelCategory, bimCategory: "Roofs", family: roofOption.name, type: roofOption.name, material: roofOption.name, parameters: { faldon: label === "O" ? "Oeste" : "Este", modulo: bay + 1, pendiente_pct: d.roofSlope, espesor_mm: roofOption.thicknessMm } };
      if (isSkylightBay) {
        b.add({ ...common, key: `RF-${label}${pad(bay + 1)}`, label: `Cubierta ${label}-${pad(bay + 1)}` }, parts([[0, 0.38], [0.62, 1]]));
        const p = placeSlice(0.38, 0.62);
        b.add(
          { category: "skylights", key: `SK-${label}${pad(bay + 1)}`, label: `Lucernario ${label}-${pad(bay + 1)}`, bimCategory: "Roofs", family: "Lucernario policarbonato", type: "Policarbonato alveolar", material: "Policarbonato", parameters: { modulo: bay + 1, faldon: label === "O" ? "Oeste" : "Este" } },
          [{ geometry: sheetPiece(0.38, 0.62, bayLen - 0.6), materialKey: "skylight", position: [p[0], p[1] + 0.005, p[2]], rotation: [0, 0, rot] }]
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
      const geometry = panelWithOpenings([[u1, sideTop], [u0, sideTop]], u0, u1, baseH, sheetRects, wallT);
      // forma en (u=z, v=y), extrusión → mapear a pared en x = ±wallX
      geometry.rotateY(-Math.PI / 2);
      const xOuter = side * wallX;
      const parts: Part[] = [{ geometry, materialKey: "wallSheet", position: [side < 0 ? xOuter + wallT : xOuter, 0, 0] }];
      b.add(
        { category: "walls", key: `WL-${label}${pad(bay + 1)}`, label: `Cerramiento ${label}-${pad(bay + 1)}`, bimCategory: "Walls", family: wallOption.name, type: wallOption.name, material: wallOption.name, parameters: { modulo: bay + 1, lado: label === "O" ? "Oeste" : "Este", espesor_mm: wallOption.thicknessMm } },
        parts
      );
      if (baseH > 0) {
        const gaps = openings.filter((op) => op.v0 < baseH).map((op) => [op.u0, op.u1] as [number, number]);
        const segs = segmentsExcluding(u0, u1, gaps);
        b.add(
          { category: "walls", key: `PC-${label}${pad(bay + 1)}`, label: `Zócalo premoldeado ${label}-${pad(bay + 1)}`, bimCategory: "Walls", family: "Panel premoldeado", type: `Hormigón premoldeado h=${baseH} m`, material: "Hormigón", parameters: { modulo: bay + 1, altura_m: baseH } },
          segs.map(([a, c]) => ({ geometry: meterUVsForBox(new BoxGeometry(0.16, baseH, c - a), "z"), materialKey: "precast" as MaterialKey, position: [side * (wallX - 0.02), baseH / 2, (a + c) / 2] }))
        );
      }
    }
  }

  /* ───────────── testeros ───────────── */
  for (const [zSign, doors, tag, name] of [[-1, frontDoors, "F", "Frente"], [1, backDoors, "C", "Contrafrente"]] as const) {
    const top: [number, number][] = [
      [wallX, roofSurface(wallX) - roofT - 0.03],
      [0, roofSurface(0) - roofT - 0.03],
      [-wallX, roofSurface(wallX) - roofT - 0.03],
    ];
    const openings: Rect[] = doors.map((dx) => ({ u0: dx - doorW / 2, u1: dx + doorW / 2, v0: 0, v1: doorH }));
    const sheetRects = openings.filter((op) => op.v1 > baseH + 0.05).map((op) => ({ ...op, v0: baseH }));
    const geometry = panelWithOpenings(top, -wallX, wallX, baseH, sheetRects, wallT);
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
          { geometry: mergeGeometries([new BoxGeometry(0.12, doorH, 0.14).translate(-doorW / 2 - 0.06, doorH / 2, 0), new BoxGeometry(0.12, doorH, 0.14).translate(doorW / 2 + 0.06, doorH / 2, 0), new BoxGeometry(doorW + 0.24, 0.12, 0.14).translate(0, doorH + 0.06, 0)]), materialKey: "trim", position: [dx, 0, zSign * (gableZ - 0.02)] },
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
        { geometry: mergeGeometries([new BoxGeometry(0.14, doorH, 0.12).translate(0, doorH / 2, -doorW / 2 - 0.06), new BoxGeometry(0.14, doorH, 0.12).translate(0, doorH / 2, doorW / 2 + 0.06), new BoxGeometry(0.14, 0.12, doorW + 0.24).translate(0, doorH + 0.06, 0)]), materialKey: "trim", position: [wallX - 0.02, 0, zc] },
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
        { geometry: mergeGeometries([new BoxGeometry(0.12, ph, 0.08).translate(0, ph / 2, -pw / 2 - 0.04), new BoxGeometry(0.12, ph, 0.08).translate(0, ph / 2, pw / 2 + 0.04), new BoxGeometry(0.12, 0.08, pw + 0.16).translate(0, ph + 0.04, 0)]), materialKey: "trim", position: [-wallX - 0.02, 0, zc] },
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
  if (config.options.canopy) {
    const cw = Math.min(W * 0.62, Math.max(8, doorW * Math.max(1, frontDoors.length) + 4));
    const depth = 4;
    const hc = Math.min((frontDoors.length ? doorH : 4) + 0.7, eave - 0.3);
    const zWall = -gableZ - 0.05;
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
  if (config.options.crane) {
    const clear = trussRafters ? bottomChordY : topSteel(half) - rd * 2;
    const railY = clear - 1.4;
    const railX = half - colD / 2 - 0.35;
    for (const side of [-1, 1] as const) {
      const label = side < 0 ? "A" : "B";
      const parts: BufferGeometry[] = [new BoxGeometry(0.3, 0.6, L).translate(side * railX, railY, 0)];
      for (const z of frameZ) parts.push(new BoxGeometry(0.5, 0.45, 0.25).translate(side * (railX + 0.2), railY - 0.5, z));
      b.add(
        { category: "equipment", key: `CR-RUN-${label}`, label: `Viga carrilera ${label}`, bimCategory: "Specialty Equipment", family: "Viga carrilera (placeholder)", type: "Capacidad a definir", material: steel, parameters: { altura_riel_m: r3(railY + 0.3) } },
        [{ geometry: mergeGeometries(parts), materialKey: "structure" }]
      );
    }
    const bridgeZ = frameZ[Math.max(1, Math.floor(n / 3))] + d.baySpacing / 2;
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
