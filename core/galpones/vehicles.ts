import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Path,
  Shape,
  TorusGeometry,
  Vector2,
  type Material,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * Vehículos de referencia (autos, camiones, autoelevador) modelados por código.
 *
 * Cada modelo se arma con perfiles laterales extruidos y redondeados (como se
 * dibuja un auto de costado), ruedas con cubierta, llanta y maza, vidrios,
 * ópticas, paragolpes y espejos. Las piezas se agrupan por material y se
 * dibujan con instancias: 40 autos cuestan casi lo mismo que uno.
 *
 * Ejes del vehículo: +Z hacia adelante, Y arriba, X a lo ancho.
 * Origen: centro de la huella en el piso.
 */

type Pt = [number, number];

export type PartKey = "paint" | "glass" | "trim" | "chrome" | "lamp" | "tail" | "plate" | "tire" | "rim" | "box" | "accent" | "cargo" | "wood";
export type VehicleModel = { parts: Partial<Record<PartKey, BufferGeometry>>; length: number; width: number; height: number };

/* ───────────────────────── utilidades de modelado ───────────────────────── */

/**
 * Las piezas se modelan en "coordenadas de costado": X hacia adelante, Y arriba,
 * Z a lo ancho (como un dibujo de vista lateral). `toVehicle` las gira a los
 * ejes del vehículo (X ancho, Z adelante).
 */
const toVehicle = (g: BufferGeometry) => g.rotateY(-Math.PI / 2);

class Parts {
  private readonly bins = new Map<PartKey, BufferGeometry[]>();
  /** Deformación de carrocería (estrechamiento del habitáculo, redondeo en planta). */
  morph: ((x: number, y: number, z: number) => number) | null = null;
  add(key: PartKey, g: BufferGeometry, morph = true) {
    const list = this.bins.get(key) ?? [];
    const plain = g.index ? g.toNonIndexed() : g;
    if (morph && this.morph) {
      const pos = plain.getAttribute("position");
      // Deformación leve: se conservan las normales originales (sombreado suave).
      for (let i = 0; i < pos.count; i += 1) pos.setX(i, pos.getX(i) * this.morph(pos.getX(i), pos.getY(i), pos.getZ(i)));
    }
    for (const name of Object.keys(plain.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") plain.deleteAttribute(name);
    if (!plain.getAttribute("uv")) return;
    plain.clearGroups();
    list.push(plain);
    this.bins.set(key, list);
  }
  build(): Partial<Record<PartKey, BufferGeometry>> {
    const out: Partial<Record<PartKey, BufferGeometry>> = {};
    for (const [key, list] of this.bins) {
      const merged = mergeGeometries(list, false);
      if (merged) {
        merged.computeBoundingSphere();
        out[key] = merged;
      }
      list.forEach((g) => g.dispose());
    }
    return out;
  }
}

/** Perfil lateral extruido a lo ancho, con cantos redondeados. */
function side(pts: Pt[], width: number, bevel = 0.05, thickness = 0.08, segments = 4) {
  const shape = new Shape(pts.map(([x, y]) => new Vector2(x, y)));
  const depth = Math.max(0.002, width - 2 * thickness);
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: thickness > 0, bevelThickness: thickness, bevelSize: bevel, bevelSegments: segments, curveSegments: 8 });
  g.translate(0, 0, -depth / 2);
  return toVehicle(g);
}

/** Lámina delgada (vidrio lateral) apoyada sobre una cara a ±z. */
function sheet(pts: Pt[], z: number, thickness = 0.008) {
  const shape = new Shape(pts.map(([x, y]) => new Vector2(x, y)));
  const g = new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  g.translate(0, 0, z >= 0 ? z : z - thickness);
  return toVehicle(g);
}

/** Paño plano a lo ancho sobre una arista inclinada del perfil (parabrisas, luneta). */
function pane(a: Pt, b: Pt, width: number, offset: number, inset = 0.06) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const nx = dy / len;
  const ny = -dx / len;
  const g = new RoundedBoxGeometry(Math.max(0.05, len - 2 * inset), 0.012, width, 2, 0.005);
  g.rotateZ(Math.atan2(dy, dx));
  g.translate((a[0] + b[0]) / 2 + nx * offset, (a[1] + b[1]) / 2 + ny * offset, 0);
  return toVehicle(g);
}

/** Caja redondeada en coordenadas de costado (largo X, alto Y, ancho Z). */
function rbox(len: number, h: number, w: number, r: number, at: [number, number, number], rotZ = 0) {
  // Piezas chicas con un solo segmento de redondeo (chaflán): mismo aspecto, un tercio de triángulos.
  const segments = Math.min(len, h, w) < 0.25 ? 1 : 2;
  const g = new RoundedBoxGeometry(len, h, w, segments, Math.min(r, len / 2 - 0.001, h / 2 - 0.001, w / 2 - 0.001));
  if (rotZ) g.rotateZ(rotZ);
  g.translate(at[0], at[1], at[2]);
  return toVehicle(g);
}

/** Cilindro con eje a lo ancho (Z de costado → X del vehículo). */
function axleCyl(r: number, w: number, at: [number, number, number], seg = 16) {
  const g = new CylinderGeometry(r, r, w, seg);
  g.rotateX(Math.PI / 2);
  g.translate(at[0], at[1], at[2]);
  return toVehicle(g);
}

/** Cilindro con eje longitudinal (tanque de combustible, caños). */
function longCyl(r: number, len: number, at: [number, number, number], seg = 16) {
  const g = new CylinderGeometry(r, r, len, seg);
  g.rotateZ(Math.PI / 2);
  g.translate(at[0], at[1], at[2]);
  return toVehicle(g);
}

function vertCyl(r: number, h: number, at: [number, number, number], seg = 10) {
  const g = new CylinderGeometry(r, r, h, seg);
  g.translate(at[0], at[1], at[2]);
  return toVehicle(g);
}

/** Arco de rueda: puntos sobre la circunferencia, de atrás hacia adelante por arriba. */
function arch(cx: number, cy: number, r: number, n = 12): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i += 1) {
    const a = Math.PI - (i / n) * Math.PI;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

type WheelStyle = "alloy" | "steel" | "industrial";

/**
 * Rueda completa centrada en `at` (coordenadas de costado). `outer` = +1 si la
 * cara de la llanta mira hacia +Z de costado (lado derecho), −1 al revés.
 */
function wheel(parts: Parts, R: number, W: number, at: [number, number, number], outer: 1 | -1, style: WheelStyle, dual = false) {
  const rimR = style === "alloy" ? R * 0.66 : R * 0.6;
  const tire = (zc: number) => {
    const sh = Math.min(0.05, W * 0.18);
    const prof = [
      new Vector2(rimR * 0.98, -W / 2),
      new Vector2(R - sh * 1.2, -W / 2),
      new Vector2(R - sh * 0.25, -W / 2 + sh * 0.3),
      new Vector2(R, -W / 2 + sh),
      new Vector2(R, W / 2 - sh),
      new Vector2(R - sh * 0.25, W / 2 - sh * 0.3),
      new Vector2(R - sh * 1.2, W / 2),
      new Vector2(rimR * 0.98, W / 2),
    ];
    const g = new LatheGeometry(prof, 22);
    g.rotateX(Math.PI / 2);
    g.translate(at[0], at[1], zc);
    parts.add("tire", toVehicle(g), false);
    // Barril interior: tapa el agujero de la cubierta del lado de adentro
    const barrel = new CylinderGeometry(rimR * 0.98, rimR * 0.98, W * 0.45, 20);
    barrel.rotateX(Math.PI / 2);
    barrel.translate(at[0], at[1], zc - outer * W * 0.24);
    parts.add(style === "alloy" ? "trim" : "rim", toVehicle(barrel), false);
  };
  const zs = dual ? [at[2] - outer * (W * 0.53), at[2] + outer * (W * 0.53)] : [at[2]];
  zs.forEach(tire);
  const faceZ = Math.max(...zs.map((z) => z * outer)) * outer + outer * (W / 2 - 0.035);

  if (style === "alloy") {
    // Cara de llanta de 5 rayos (5 ventanas sobre un disco)
    const face = new Shape();
    face.absarc(0, 0, rimR, 0, Math.PI * 2, false);
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2 + Math.PI / 10;
      const hole = new Path();
      const cx = Math.cos(a) * rimR * 0.56;
      const cy = Math.sin(a) * rimR * 0.56;
      hole.absellipse(cx, cy, rimR * 0.2, rimR * 0.3, 0, Math.PI * 2, true, a);
      face.holes.push(hole);
    }
    const g = new ExtrudeGeometry(face, { depth: 0.035, bevelEnabled: false, curveSegments: 7 });
    g.translate(at[0], at[1], faceZ - (outer > 0 ? 0.035 : 0));
    parts.add("rim", toVehicle(g), false);
    const disc = new CylinderGeometry(rimR * 0.82, rimR * 0.82, 0.03, 14);
    disc.rotateX(Math.PI / 2);
    disc.translate(at[0], at[1], faceZ - outer * 0.07);
    parts.add("trim", toVehicle(disc), false);
    const hub = new CylinderGeometry(rimR * 0.2, rimR * 0.22, 0.05, 14);
    hub.rotateX(Math.PI / 2);
    hub.translate(at[0], at[1], faceZ + outer * 0.005);
    parts.add("chrome", toVehicle(hub), false);
  } else {
    // Llanta de chapa: disco con aro de tuercas y maza
    const disc = new CylinderGeometry(rimR, rimR, 0.04, 24);
    disc.rotateX(Math.PI / 2);
    disc.translate(at[0], at[1], faceZ - outer * 0.03);
    parts.add("rim", toVehicle(disc), false);
    const hub = new CylinderGeometry(rimR * 0.36, rimR * 0.42, style === "steel" ? 0.14 : 0.08, 16);
    hub.rotateX(Math.PI / 2);
    hub.translate(at[0], at[1], faceZ + outer * (style === "steel" ? 0.04 : 0.01));
    parts.add("chrome", toVehicle(hub), false);
    if (style === "steel") {
      const ring = new TorusGeometry(rimR * 0.62, 0.018, 6, 24);
      ring.translate(at[0], at[1], faceZ + outer * 0.002);
      parts.add("trim", toVehicle(ring), false);
    }
  }
}

/* ───────────────────────────────── AUTOS ───────────────────────────────── */

export type CarKind = "sedan" | "hatch" | "suv" | "pickup";

type CarSpec = {
  width: number;
  wheelR: number;
  axles: [number, number];
  sill: number;
  front: Pt[];
  top: Pt[];
  rear: Pt[];
  cabin: Pt[];
  cabinWidth: number;
  windows: Pt[][];
  lampY: number;
  bumperY: number;
  bed?: { x0: number; x1: number; floor: number; top: number };
};

const CAR_SPECS: Record<CarKind, CarSpec> = {
  sedan: {
    width: 1.8,
    wheelR: 0.32,
    axles: [-1.33, 1.38],
    sill: 0.2,
    front: [[2.16, 0.22], [2.29, 0.34], [2.33, 0.5], [2.29, 0.66]],
    top: [[1.98, 0.75], [1.1, 0.87], [-1.42, 0.92], [-1.98, 0.94], [-2.22, 0.88]],
    rear: [[-2.3, 0.72], [-2.31, 0.44], [-2.22, 0.24]],
    cabin: [[1.12, 0.84], [0.3, 1.38], [-0.82, 1.41], [-1.52, 0.88]],
    cabinWidth: 1.52,
    windows: [
      [[0.96, 0.93], [0.33, 1.31], [-0.1, 1.33], [-0.1, 0.93]],
      [[-0.2, 0.93], [-0.2, 1.33], [-0.8, 1.34], [-1.3, 0.95]],
    ],
    lampY: 0.62,
    bumperY: 0.34,
  },
  hatch: {
    width: 1.76,
    wheelR: 0.31,
    axles: [-1.22, 1.28],
    sill: 0.2,
    front: [[1.92, 0.22], [2.04, 0.34], [2.07, 0.5], [2.02, 0.66]],
    top: [[1.72, 0.76], [0.98, 0.88], [-1.78, 0.94]],
    rear: [[-1.96, 0.9], [-2.0, 0.6], [-1.99, 0.4], [-1.9, 0.24]],
    cabin: [[1.0, 0.85], [0.22, 1.4], [-1.48, 1.43], [-1.9, 0.9]],
    cabinWidth: 1.5,
    windows: [
      [[0.85, 0.94], [0.25, 1.33], [-0.2, 1.35], [-0.2, 0.94]],
      [[-0.3, 0.94], [-0.3, 1.35], [-1.15, 1.36], [-1.15, 0.95]],
      [[-1.25, 0.95], [-1.25, 1.36], [-1.5, 1.36], [-1.72, 0.97]],
    ],
    lampY: 0.64,
    bumperY: 0.34,
  },
  suv: {
    width: 1.88,
    wheelR: 0.37,
    axles: [-1.38, 1.42],
    sill: 0.3,
    front: [[2.22, 0.34], [2.34, 0.48], [2.38, 0.7], [2.32, 0.92]],
    top: [[1.98, 1.0], [1.12, 1.08], [-2.06, 1.12]],
    rear: [[-2.3, 1.06], [-2.36, 0.8], [-2.34, 0.48], [-2.24, 0.34]],
    cabin: [[1.16, 1.05], [0.36, 1.66], [-2.02, 1.69], [-2.27, 1.1]],
    cabinWidth: 1.62,
    windows: [
      [[1.0, 1.13], [0.4, 1.59], [-0.12, 1.61], [-0.12, 1.13]],
      [[-0.22, 1.13], [-0.22, 1.61], [-1.3, 1.62], [-1.3, 1.13]],
      [[-1.4, 1.13], [-1.4, 1.62], [-1.98, 1.62], [-2.15, 1.15]],
    ],
    lampY: 0.84,
    bumperY: 0.46,
  },
  pickup: {
    width: 1.88,
    wheelR: 0.38,
    axles: [-1.6, 1.65],
    sill: 0.34,
    front: [[2.5, 0.38], [2.6, 0.55], [2.63, 0.78], [2.58, 0.98]],
    top: [[2.12, 1.08], [1.3, 1.13], [-1.02, 1.14], [-1.06, 0.8], [-2.6, 0.8]],
    rear: [[-2.66, 0.62], [-2.64, 0.4]],
    cabin: [[1.32, 1.1], [0.56, 1.72], [-0.94, 1.74], [-1.04, 1.1]],
    cabinWidth: 1.66,
    windows: [
      [[1.15, 1.18], [0.6, 1.65], [0.05, 1.67], [0.05, 1.18]],
      [[-0.05, 1.18], [-0.05, 1.67], [-0.84, 1.67], [-0.84, 1.18]],
    ],
    lampY: 0.9,
    bumperY: 0.5,
    bed: { x0: -2.64, x1: -1.08, floor: 0.8, top: 1.16 },
  },
};

export function buildCar(kind: CarKind): VehicleModel {
  const s = CAR_SPECS[kind];
  const p = new Parts();
  const R = s.wheelR;
  const archR = R + 0.07;
  const [axR, axF] = s.axles;
  const rearPt = s.rear[s.rear.length - 1];
  const frontPt = s.front[0];

  // Carrocería: perfil con pasaruedas
  const bottom: Pt[] = [
    [rearPt[0] + 0.12, s.sill],
    [axR - archR, s.sill],
    ...arch(axR, R + 0.02, archR),
    [axR + archR, s.sill],
    [axF - archR, s.sill],
    ...arch(axF, R + 0.02, archR),
    [axF + archR, s.sill],
    [frontPt[0] - 0.08, s.sill],
  ];
  const outline: Pt[] = [...bottom, ...s.front, ...s.top, ...s.rear];
  const W = s.width;
  // Forma: el habitáculo se angosta hacia el techo (tumblehome), el zócalo se
  // mete hacia adentro y las puntas se redondean en planta.
  const belt = Math.min(...s.cabin.map((q) => q[1]));
  const roof = Math.max(...s.cabin.map((q) => q[1]));
  const fxm = Math.max(...s.front.map((q) => q[0]));
  const rxm = Math.min(...s.rear.map((q) => q[0]));
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  p.morph = (_x, y, z) => {
    const up = clamp01((y - belt) / (roof - belt));
    const low = clamp01(1 - (y - s.sill) / 0.28);
    const nose = clamp01((z - (fxm - 0.75)) / 0.75);
    const tail = clamp01((rxm + 0.6 - z) / 0.6);
    return (1 - 0.13 * up * up) * (1 - 0.05 * low) * (1 - 0.07 * nose * nose) * (1 - 0.05 * tail * tail);
  };
  p.add("paint", side(outline, W, 0.06, 0.15, 4));

  // Habitáculo (techo y parantes en color de carrocería) + vidrios
  const cw = s.cabinWidth;
  p.add("paint", side(s.cabin, cw, 0.04, 0.07, 3));
  const n = s.cabin.length;
  p.add("glass", pane(s.cabin[0], s.cabin[1], cw - 0.14, 0.046, 0.05));
  p.add("glass", pane(s.cabin[n - 2], s.cabin[n - 1], cw - 0.16, 0.046, 0.06));
  for (const win of s.windows) for (const z of [cw / 2 + 0.004, -cw / 2 - 0.004]) p.add("glass", sheet(win, z));

  // Caja de carga (pickup)
  if (s.bed) {
    const b = s.bed;
    for (const z of [W / 2 - 0.05, -W / 2 + 0.05]) p.add("paint", rbox(b.x1 - b.x0, b.top - b.floor, 0.07, 0.025, [(b.x0 + b.x1) / 2, (b.floor + b.top) / 2, z]));
    p.add("paint", rbox(0.07, b.top - b.floor, W - 0.1, 0.025, [b.x0 + 0.035, (b.floor + b.top) / 2, 0]));
    p.add("trim", rbox(b.x1 - b.x0 - 0.1, 0.02, W - 0.2, 0.005, [(b.x0 + b.x1) / 2, b.floor + 0.012, 0]));
    p.add("chrome", rbox(0.05, 0.05, W - 0.3, 0.02, [b.x1 - 0.2, b.top + 0.28, 0]));
    for (const z of [W / 2 - 0.2, -W / 2 + 0.2]) p.add("chrome", rbox(0.04, 0.3, 0.04, 0.015, [b.x1 - 0.2, b.top + 0.14, z]));
  }

  // Frente: parrilla, ópticas, paragolpes, patente
  const fx = Math.max(...s.front.map((q) => q[0]));
  const rx = Math.min(...s.rear.map((q) => q[0]));
  // Ópticas y parrilla asoman unos centímetros de la carrocería (que crece 6 cm por el redondeo)
  p.add("trim", rbox(0.14, 0.18, W * 0.46, 0.04, [fx + 0.01, s.lampY - 0.06, 0]));
  for (const z of [W / 2 - 0.27, -W / 2 + 0.27]) {
    p.add("lamp", rbox(0.16, 0.12, 0.4, 0.04, [fx + 0.0, s.lampY, z]));
    p.add("tail", rbox(0.14, 0.14, 0.4, 0.04, [rx - 0.01, s.lampY + 0.06, z]));
  }
  p.add("trim", rbox(0.2, 0.16, W - 0.04, 0.06, [fx - 0.02, s.bumperY, 0]));
  p.add("trim", rbox(0.2, 0.16, W - 0.04, 0.06, [rx + 0.02, s.bumperY, 0]));
  p.add("plate", rbox(0.02, 0.12, 0.5, 0.01, [fx + 0.09, s.bumperY + 0.02, 0]));
  p.add("plate", rbox(0.02, 0.12, 0.5, 0.01, [rx - 0.09, s.bumperY + 0.12, 0]));

  // Espejos
  const mx = s.cabin[0][0] - 0.12;
  const my = s.cabin[0][1] + 0.1;
  for (const sgn of [1, -1]) {
    p.add("paint", rbox(0.16, 0.12, 0.2, 0.04, [mx, my, sgn * (W / 2 + 0.07)]));
    p.add("trim", rbox(0.1, 0.04, 0.1, 0.015, [mx + 0.02, my - 0.05, sgn * (W / 2 - 0.02)]));
  }
  // Manijas
  for (const win of s.windows.slice(0, 2)) {
    const hx = Math.min(...win.map((q) => q[0])) + 0.12;
    for (const sgn of [1, -1]) p.add("chrome", rbox(0.16, 0.025, 0.02, 0.008, [hx, s.top[1][1] - 0.12, sgn * (W / 2 + 0.03)]));
  }

  // Ruedas
  p.morph = null;
  for (const x of [axR, axF]) for (const sgn of [1, -1] as const) wheel(p, R, 0.22, [x, R, sgn * (W / 2 - 0.13)], sgn, "alloy");

  const height = Math.max(...s.cabin.map((q) => q[1])) + 0.05;
  return { parts: p.build(), length: fx - rx + 0.2, width: W + 0.2, height };
}

/* ──────────────────────────────── CAMIONES ──────────────────────────────── */

/** Cabina tipo "cab-over" (frente plano), en coordenadas de costado. `front` = X del frente. */
function cabOver(p: Parts, front: number, width: number, scale = 1) {
  const s = scale;
  const y0 = 1.02 * s;
  const prof: Pt[] = [
    [front - 0.02, y0],
    [front + 0.06, 1.72 * s],
    [front + 0.04, 2.34 * s],
    [front - 0.12, 3.22 * s],
    [front - 0.3, 3.38 * s],
    [front - 2.2 * s, 3.4 * s],
    [front - 2.26 * s, y0],
  ];
  p.add("paint", side(prof, width, 0.08, 0.14, 4));
  // Deflector de techo
  p.add("paint", side([[front - 0.36, 3.36 * s], [front - 0.95 * s, 3.92 * s], [front - 2.16 * s, 3.95 * s], [front - 2.2 * s, 3.36 * s]], width - 0.12, 0.05, 0.1, 3));
  // Parabrisas y vidrios de puerta
  p.add("glass", pane([front + 0.04, 2.34 * s], [front - 0.12, 3.22 * s], width - 0.3, 0.09, 0.08));
  const door: Pt[] = [
    [front - 0.2, 2.3 * s],
    [front - 0.3, 3.12 * s],
    [front - 1.12 * s, 3.12 * s],
    [front - 1.12 * s, 2.3 * s],
  ];
  for (const z of [width / 2 + 0.005, -width / 2 - 0.005]) p.add("glass", sheet(door, z));
  // Visera, parrilla, ópticas, paragolpes, escalones
  p.add("paint", rbox(0.4, 0.06, width - 0.2, 0.02, [front - 0.08, 3.3 * s, 0], 0.25));
  p.add("trim", rbox(0.1, 0.62 * s, width * 0.66, 0.03, [front + 0.08, 1.92 * s, 0]));
  for (let i = 0; i < 4; i += 1) p.add("chrome", rbox(0.04, 0.03, width * 0.62, 0.01, [front + 0.14, (1.7 + i * 0.15) * s, 0]));
  p.add("trim", rbox(0.36, 0.42 * s, width + 0.02, 0.06, [front + 0.02, 0.92 * s, 0]));
  for (const z of [width / 2 - 0.3, -(width / 2 - 0.3)]) {
    p.add("lamp", rbox(0.06, 0.16, 0.42, 0.03, [front + 0.2, 1.0 * s, z]));
    p.add("accent", rbox(0.04, 0.06, 0.22, 0.02, [front + 0.2, 0.84 * s, z]));
    // Escalones de acceso
    p.add("trim", rbox(0.5, 0.05, 0.22, 0.015, [front - 0.75, 0.62 * s, Math.sign(z) * (width / 2 - 0.05)]));
    p.add("trim", rbox(0.5, 0.05, 0.22, 0.015, [front - 0.75, 0.3 * s, Math.sign(z) * (width / 2 - 0.05)]));
    // Espejos con brazo
    const zs = Math.sign(z) * (width / 2 + 0.32);
    p.add("chrome", longCyl(0.025, 0.4, [front - 0.18, 2.95 * s, Math.sign(z) * (width / 2 + 0.12)]));
    p.add("trim", rbox(0.14, 0.5, 0.24, 0.05, [front - 0.12, 2.75 * s, zs]));
    p.add("glass", rbox(0.02, 0.42, 0.18, 0.01, [front - 0.05, 2.75 * s, zs]));
  }
}

function chassisRails(p: Parts, x0: number, x1: number, y: number) {
  for (const z of [0.46, -0.46]) p.add("trim", rbox(x1 - x0, 0.3, 0.1, 0.01, [(x0 + x1) / 2, y, z]));
}

function fender(p: Parts, x: number, R: number, width: number) {
  for (const z of [width / 2 - 0.22, -(width / 2 - 0.22)]) {
    const prof = arch(0, 0, R + 0.12, 10).map(([a, b]) => [a + x, b + R] as Pt);
    const outer = prof;
    const inner = [...arch(0, 0, R + 0.06, 10)].reverse().map(([a, b]) => [a + x, b + R] as Pt);
    const shape = [...outer, ...inner];
    const g = new ExtrudeGeometry(new Shape(shape.map(([a, b]) => new Vector2(a, b))), { depth: 0.6, bevelEnabled: false, curveSegments: 6 });
    g.translate(0, 0, z - 0.3);
    p.add("trim", toVehicle(g));
  }
}

/** Semirremolque con tractor cab-over (≈ 17,6 m). */
export function buildSemiTruck(): VehicleModel {
  const p = new Parts();
  const W = 2.5;
  const front = 8.8;
  cabOver(p, front, W);
  const R = 0.52;
  // Tractor
  chassisRails(p, 1.7, front - 0.4, 0.95);
  p.add("trim", rbox(1.2, 0.18, 1.5, 0.04, [3.0, 1.2, 0])); // plato de enganche
  p.add("chrome", longCyl(0.32, 1.25, [5.4, 0.78, W / 2 - 0.42])); // tanque
  p.add("trim", rbox(0.9, 0.55, 0.5, 0.05, [5.4, 0.8, -(W / 2 - 0.4)])); // baterías
  p.add("chrome", vertCyl(0.09, 1.6, [6.45, 3.2, -(W / 2 - 0.2)])); // escape
  fender(p, 7.45, R, W);
  fender(p, 3.6, R, W);
  fender(p, 2.3, R, W);
  for (const sgn of [1, -1] as const) {
    wheel(p, R, 0.3, [7.45, R, sgn * (W / 2 - 0.22)], sgn, "steel");
    wheel(p, R, 0.28, [3.6, R, sgn * (W / 2 - 0.42)], sgn, "steel", true);
    wheel(p, R, 0.28, [2.3, R, sgn * (W / 2 - 0.42)], sgn, "steel", true);
  }
  // Semirremolque furgón (13,6 m)
  const tf = 4.25;
  const tr = tf - 13.6;
  const tw = 2.6;
  const yb = 1.28;
  const yt = 4.02;
  p.add("box", rbox(tf - tr, yt - yb, tw, 0.05, [(tf + tr) / 2, (yb + yt) / 2, 0]));
  for (let x = tr + 0.6; x < tf - 0.3; x += 1.13) for (const z of [tw / 2 + 0.012, -tw / 2 - 0.012]) p.add("accent", rbox(0.06, yt - yb - 0.24, 0.02, 0.005, [x, (yb + yt) / 2, z]));
  for (const y of [yb + 0.06, yt - 0.06]) for (const z of [tw / 2 + 0.02, -tw / 2 - 0.02]) p.add("chrome", rbox(tf - tr, 0.12, 0.03, 0.01, [(tf + tr) / 2, y, z]));
  // Puertas traseras
  p.add("trim", rbox(0.04, yt - yb - 0.1, tw - 0.08, 0.01, [tr - 0.02, (yb + yt) / 2, 0]));
  p.add("box", rbox(0.03, yt - yb - 0.26, tw / 2 - 0.12, 0.01, [tr - 0.04, (yb + yt) / 2, tw / 4 - 0.02]));
  p.add("box", rbox(0.03, yt - yb - 0.26, tw / 2 - 0.12, 0.01, [tr - 0.04, (yb + yt) / 2, -tw / 4 + 0.02]));
  for (const z of [0.3, 0.9, -0.3, -0.9]) p.add("chrome", vertCyl(0.02, yt - yb - 0.3, [tr - 0.07, (yb + yt) / 2, z]));
  // Bastidor, ejes, patas de apoyo, defensas
  for (const z of [0.5, -0.5]) p.add("trim", rbox(tf - tr - 0.4, 0.26, 0.12, 0.01, [(tf + tr) / 2, yb - 0.15, z]));
  for (const x of [-5.9, -7.22, -8.54]) {
    for (const sgn of [1, -1] as const) wheel(p, 0.5, 0.28, [x, 0.5, sgn * (tw / 2 - 0.42)], sgn, "steel", true);
    p.add("trim", axleCyl(0.07, tw - 0.4, [x, 0.5, 0]));
  }
  for (const z of [0.95, -0.95]) {
    p.add("trim", rbox(0.14, yb - 0.25, 0.14, 0.02, [1.0, (yb - 0.1) / 2 + 0.05, z]));
    p.add("trim", rbox(0.4, 0.05, 0.3, 0.01, [1.0, 0.03, z]));
  }
  for (const z of [tw / 2 - 0.08, -(tw / 2 - 0.08)]) {
    for (const y of [0.55, 0.85]) p.add("chrome", rbox(5.4, 0.08, 0.04, 0.01, [-2.45, y, z]));
    // Ménsulas que toman la defensa lateral del bastidor
    for (const x of [-0.1, -2.45, -4.8]) p.add("trim", rbox(0.08, yb - 0.5, 0.05, 0.01, [x, (yb + 0.5) / 2, z - Math.sign(z) * 0.03]));
  }
  p.add("trim", rbox(0.12, 0.14, tw - 0.2, 0.02, [tr + 0.1, 0.55, 0]));
  for (const z of [tw / 2 - 0.25, -(tw / 2 - 0.25)]) {
    p.add("tail", rbox(0.06, 0.12, 0.4, 0.02, [tr + 0.02, 0.78, z]));
    p.add("trim", rbox(0.02, 0.45, 0.55, 0.01, [-9.15, 0.4, z]));
  }
  return { parts: p.build(), length: front - tr + 0.4, width: tw + 0.6, height: 4.05 };
}

/** Camión chasis con furgón (≈ 9,6 m), para distribución urbana. */
export function buildBoxTruck(): VehicleModel {
  const p = new Parts();
  const W = 2.35;
  const front = 4.8;
  cabOver(p, front, W, 0.92);
  const R = 0.46;
  chassisRails(p, -4.6, front - 0.3, 0.86);
  fender(p, 3.75, R, W);
  fender(p, -1.2, R, W);
  for (const sgn of [1, -1] as const) {
    wheel(p, R, 0.27, [3.75, R, sgn * (W / 2 - 0.22)], sgn, "steel");
    wheel(p, R, 0.25, [-1.2, R, sgn * (W / 2 - 0.4)], sgn, "steel", true);
  }
  const bf = 2.45;
  const br = -4.75;
  const bw = 2.45;
  const yb = 1.12;
  const yt = 3.6;
  p.add("box", rbox(bf - br, yt - yb, bw, 0.05, [(bf + br) / 2, (yb + yt) / 2, 0]));
  for (const y of [yb + 0.05, yt - 0.05]) for (const z of [bw / 2 + 0.015, -bw / 2 - 0.015]) p.add("chrome", rbox(bf - br, 0.1, 0.03, 0.01, [(bf + br) / 2, y, z]));
  p.add("trim", rbox(0.04, yt - yb - 0.1, bw - 0.08, 0.01, [br - 0.02, (yb + yt) / 2, 0]));
  p.add("box", rbox(0.03, yt - yb - 0.24, bw / 2 - 0.1, 0.01, [br - 0.04, (yb + yt) / 2, bw / 4]));
  p.add("box", rbox(0.03, yt - yb - 0.24, bw / 2 - 0.1, 0.01, [br - 0.04, (yb + yt) / 2, -bw / 4]));
  for (const z of [bw / 2 - 0.25, -(bw / 2 - 0.25)]) p.add("tail", rbox(0.06, 0.12, 0.35, 0.02, [br + 0.05, 0.75, z]));
  p.add("trim", rbox(0.12, 0.14, bw - 0.2, 0.02, [br + 0.15, 0.5, 0]));
  return { parts: p.build(), length: front - br + 0.4, width: bw + 0.6, height: 3.62 };
}

/* ─────────────────────────────── AUTOELEVADOR ─────────────────────────────── */

export function buildForklift(): VehicleModel {
  const p = new Parts();
  const W = 1.15;
  // Chasis con contrapeso redondeado
  p.add("paint", side([[-1.2, 0.26], [-1.32, 0.6], [-1.26, 0.98], [-1.05, 1.18], [-0.55, 1.2], [-0.45, 1.02], [0.36, 1.0], [0.5, 0.78], [0.52, 0.26]], W, 0.04, 0.07, 4));
  p.add("trim", rbox(0.7, 0.1, W - 0.2, 0.03, [-0.05, 1.02, 0])); // piso
  p.add("trim", rbox(0.45, 0.12, 0.5, 0.05, [-0.42, 1.28, 0])); // asiento
  p.add("trim", rbox(0.1, 0.5, 0.48, 0.04, [-0.66, 1.55, 0], 0.15)); // respaldo
  // Columna y volante
  p.add("trim", longCyl(0.03, 0.55, [0.12, 1.32, 0])); // placeholder corto
  const wheelRing = new TorusGeometry(0.16, 0.018, 8, 24);
  wheelRing.rotateY(Math.PI / 2);
  wheelRing.rotateZ(0.6);
  wheelRing.translate(0.1, 1.62, 0);
  p.add("trim", toVehicle(wheelRing));
  // Protección superior (4 parantes + techo)
  for (const [x, z] of [
    [0.32, 0.5],
    [0.32, -0.5],
    [-0.95, 0.5],
    [-0.95, -0.5],
  ] as const) {
    p.add("trim", rbox(0.07, 1.25, 0.07, 0.02, [x, 1.75, z]));
  }
  p.add("trim", rbox(1.4, 0.06, 1.08, 0.02, [-0.32, 2.38, 0]));
  for (let i = 0; i < 4; i += 1) p.add("paint", rbox(1.32, 0.03, 0.06, 0.01, [-0.32, 2.42, -0.36 + i * 0.24]));
  p.add("lamp", rbox(0.05, 0.1, 0.12, 0.02, [0.36, 2.3, 0.42]));
  p.add("lamp", rbox(0.05, 0.1, 0.12, 0.02, [0.36, 2.3, -0.42]));
  // Mástil, cilindro, carro y uñas
  for (const z of [0.36, -0.36]) p.add("trim", rbox(0.12, 2.45, 0.1, 0.02, [0.7, 1.32, z]));
  for (const y of [0.4, 1.4, 2.45]) p.add("trim", rbox(0.1, 0.08, 0.84, 0.02, [0.7, y, 0]));
  p.add("chrome", vertCyl(0.05, 1.9, [0.62, 1.1, 0]));
  p.add("trim", rbox(0.06, 0.55, 1.0, 0.02, [0.82, 0.55, 0]));
  for (let i = 0; i < 5; i += 1) p.add("trim", rbox(0.03, 0.75, 0.03, 0.008, [0.82, 1.2, -0.4 + i * 0.2]));
  for (const z of [0.3, -0.3]) {
    p.add("chrome", rbox(0.05, 0.55, 0.11, 0.01, [0.88, 0.33, z]));
    p.add("chrome", rbox(1.15, 0.045, 0.11, 0.01, [1.45, 0.06, z]));
  }
  // Pallet con carga en las uñas
  const px = 1.45;
  p.add("wood", rbox(1.2, 0.03, 1.0, 0.005, [px, 0.1, 0]));
  p.add("wood", rbox(1.2, 0.03, 1.0, 0.005, [px, 0.22, 0]));
  for (const z of [-0.45, 0, 0.45]) p.add("wood", rbox(1.2, 0.1, 0.1, 0.005, [px, 0.16, z]));
  for (const [x, y, z, w, h] of [
    [px - 0.3, 0.45, -0.25, 0.58, 0.42],
    [px + 0.3, 0.45, -0.25, 0.58, 0.42],
    [px - 0.3, 0.45, 0.25, 0.58, 0.42],
    [px + 0.3, 0.45, 0.25, 0.58, 0.42],
    [px - 0.15, 0.87, 0, 0.6, 0.4],
    [px + 0.32, 0.87, 0.1, 0.5, 0.4],
  ] as const) p.add("cargo", rbox(w, h, 0.48, 0.015, [x, y, z]));
  for (const sgn of [1, -1] as const) {
    wheel(p, 0.33, 0.24, [0.3, 0.33, sgn * (W / 2 - 0.1)], sgn, "industrial");
    wheel(p, 0.25, 0.18, [-0.95, 0.25, sgn * (W / 2 - 0.12)], sgn, "industrial");
  }
  return { parts: p.build(), length: 3.4, width: W + 0.1, height: 2.45 };
}

/* ───────────────────────────── materiales e instancias ───────────────────────────── */

export type VehicleMaterials = Record<PartKey, Material>;

export function createVehicleMaterials(paintHex = "#ffffff"): VehicleMaterials {
  return {
    paint: new MeshPhysicalMaterial({ color: paintHex, metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12, name: "veh:paint" }),
    glass: new MeshPhysicalMaterial({ color: "#1c2429", metalness: 0.6, roughness: 0.06, envMapIntensity: 1.6, name: "veh:glass" }),
    trim: new MeshStandardMaterial({ color: "#1d1f21", metalness: 0.2, roughness: 0.62, name: "veh:trim" }),
    chrome: new MeshStandardMaterial({ color: "#c7cacd", metalness: 1, roughness: 0.22, name: "veh:chrome" }),
    lamp: new MeshStandardMaterial({ color: "#eef1f3", emissive: "#fff6df", emissiveIntensity: 0.25, metalness: 0.3, roughness: 0.08, name: "veh:lamp" }),
    tail: new MeshStandardMaterial({ color: "#7d0d10", emissive: "#3a0000", emissiveIntensity: 0.6, roughness: 0.2, name: "veh:tail" }),
    plate: new MeshStandardMaterial({ color: "#f1f1ec", roughness: 0.5, name: "veh:plate" }),
    tire: new MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.92, metalness: 0, name: "veh:tire" }),
    rim: new MeshStandardMaterial({ color: "#b8bbbf", metalness: 0.85, roughness: 0.3, name: "veh:rim" }),
    box: new MeshStandardMaterial({ color: "#eeeeea", metalness: 0.15, roughness: 0.45, name: "veh:box", side: DoubleSide }),
    accent: new MeshStandardMaterial({ color: "#d5d6d3", metalness: 0.4, roughness: 0.4, name: "veh:accent" }),
    cargo: new MeshStandardMaterial({ color: "#b48a5c", roughness: 0.85, name: "veh:cargo" }),
    wood: new MeshStandardMaterial({ color: "#a98a63", roughness: 0.9, name: "veh:wood" }),
  };
}

export type Placement = { x: number; z: number; rotation: number; color?: string };

/**
 * Un grupo con una InstancedMesh por material. La pintura toma el color de
 * cada instancia (autos de distintos colores con una sola llamada de dibujo).
 */
export function instanceVehicles(model: VehicleModel, materials: VehicleMaterials, placements: Placement[], name: string) {
  const group = new Group();
  group.name = name;
  if (!placements.length) return group;
  const m = new Matrix4();
  const color = new Color();
  for (const [key, geometry] of Object.entries(model.parts) as [PartKey, BufferGeometry][]) {
    const mesh = new InstancedMesh(geometry, materials[key], placements.length);
    mesh.name = `${name}:${key}`;
    placements.forEach((pl, i) => {
      m.makeRotationY(pl.rotation).setPosition(pl.x, 0, pl.z);
      mesh.setMatrixAt(i, m);
      if (key === "paint") mesh.setColorAt(i, color.set(pl.color ?? "#ffffff"));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = key !== "glass" && key !== "lamp" && key !== "plate";
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}

/** Colores de autos habituales (blanco, plata, grises, negro y algunos de color). */
export const CAR_COLORS = ["#f2f2ef", "#c9ccce", "#8d9296", "#4c5156", "#1e2124", "#f2f2ef", "#c9ccce", "#7a1c1f", "#24395a", "#2f4a3c", "#b9a98a", "#5e1f2a"];
