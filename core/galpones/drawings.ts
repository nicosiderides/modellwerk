import { EAVE_OVERHANG, GIRT_SPACING, PURLIN_SPACING } from "./geometry-rules.ts";
import { PURLIN_H, warehouseLayout, type WarehouseLayout } from "./layout.ts";
import { SLAB_BOTTOM, foundationSizes } from "./foundations.ts";
import { formatNumber } from "./metrics.ts";
import type { FoundationId, WarehouseConfig, WarehouseDefinition } from "./types.ts";

/**
 * Lámina de planos básicos (A3 apaisada) generada desde la configuración.
 *
 * Todo sale de `warehouseLayout`, el mismo replanteo que usa el modelo 3D,
 * así planta, cortes y vistas coinciden con lo que se ve en el visor.
 * Salida: un SVG en milímetros de papel (viewBox 420 × 297), vectorial,
 * listo para imprimir o guardar como PDF. Sin dependencias ni DOM.
 */

type Pt = [number, number];

export type DrawingSheetOptions = {
  /** Perspectiva 3D (data URL PNG/JPG) capturada del visor. */
  image?: string | null;
  /** Relación ancho/alto de la imagen, para encuadrarla sin deformar. */
  imageAspect?: number;
  date?: string;
  /** Nombre de la obra o cliente (opcional). */
  project?: string;
};

export type DrawingSheet = { svg: string; scale: number };

/* ───────────────────────── formato ───────────────────────── */

const fmt = (v: number, d = 2) => {
  const fixed = Math.abs(v).toFixed(d).replace(".", ",");
  const [int, dec] = fixed.split(",");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${v < 0 ? "−" : ""}${grouped}${dec ? `,${dec}` : ""}`;
};
const lvl = (v: number) => (Math.abs(v) < 0.005 ? "±0,00" : `${v > 0 ? "+" : "−"}${fmt(Math.abs(v))}`);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n2 = (v: number) => Math.round(v * 100) / 100;

/* ───────────────────────── lienzo ───────────────────────── */

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

/**
 * Acumula elementos SVG en mm de papel y lleva la caja que ocupan, para
 * después ubicar cada dibujo en la lámina.
 */
class Pen {
  readonly parts: string[] = [];
  minX = Infinity;
  minY = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;
  private clipCount = 0;
  readonly id: string;
  constructor(id: string) {
    this.id = id;
  }

  private grow(x: number, y: number) {
    if (x < this.minX) this.minX = x;
    if (y < this.minY) this.minY = y;
    if (x > this.maxX) this.maxX = x;
    if (y > this.maxY) this.maxY = y;
  }
  raw(svg: string, pts: Pt[] = []) {
    this.parts.push(svg);
    for (const [x, y] of pts) this.grow(x, y);
  }
  line(a: Pt, b: Pt, cls: string) {
    this.raw(`<line x1="${n2(a[0])}" y1="${n2(a[1])}" x2="${n2(b[0])}" y2="${n2(b[1])}" class="${cls}"/>`, [a, b]);
  }
  poly(pts: Pt[], cls: string, closed = true) {
    const d = pts.map(([x, y]) => `${n2(x)},${n2(y)}`).join(" ");
    this.raw(`<${closed ? "polygon" : "polyline"} points="${d}" class="${cls}"/>`, pts);
  }
  rect(a: Pt, b: Pt, cls: string) {
    const x = Math.min(a[0], b[0]);
    const y = Math.min(a[1], b[1]);
    const w = Math.abs(a[0] - b[0]);
    const h = Math.abs(a[1] - b[1]);
    this.raw(`<rect x="${n2(x)}" y="${n2(y)}" width="${n2(Math.max(w, 0.01))}" height="${n2(Math.max(h, 0.01))}" class="${cls}"/>`, [a, b]);
  }
  circle(c: Pt, r: number, cls: string) {
    this.raw(`<circle cx="${n2(c[0])}" cy="${n2(c[1])}" r="${r}" class="${cls}"/>`, [
      [c[0] - r, c[1] - r],
      [c[0] + r, c[1] + r],
    ]);
  }
  path(d: string, cls: string, pts: Pt[]) {
    this.raw(`<path d="${d}" class="${cls}"/>`, pts);
  }
  text(p: Pt, s: string, size: number, anchor: "start" | "middle" | "end" = "middle", extra = "", rotate = 0, grow = true) {
    const w = s.length * size * 0.56;
    const x0 = anchor === "start" ? p[0] : anchor === "end" ? p[0] - w : p[0] - w / 2;
    const transform = rotate ? ` transform="rotate(${rotate} ${n2(p[0])} ${n2(p[1])})"` : "";
    this.parts.push(`<text x="${n2(p[0])}" y="${n2(p[1])}" font-size="${size}" text-anchor="${anchor}"${transform} ${extra}>${esc(s)}</text>`);
    if (!grow) return;
    if (rotate === -90) {
      this.grow(p[0] - size, p[1] - (anchor === "middle" ? w / 2 : 0));
      this.grow(p[0] + 0.3, p[1] + (anchor === "middle" ? w / 2 : w));
    } else {
      this.grow(x0, p[1] - size * 0.8);
      this.grow(x0 + w, p[1] + size * 0.25);
    }
  }
  /** Agrupa los elementos siguientes recortados por un polígono. */
  clip(pts: Pt[], body: () => void) {
    const id = `${this.id}-clip${this.clipCount++}`;
    const d = pts.map(([x, y]) => `${n2(x)},${n2(y)}`).join(" ");
    this.parts.push(`<clipPath id="${id}"><polygon points="${d}"/></clipPath><g clip-path="url(#${id})">`);
    const before = [this.minX, this.minY, this.maxX, this.maxY];
    body();
    [this.minX, this.minY, this.maxX, this.maxY] = before;
    this.parts.push("</g>");
  }
  get width() {
    return this.maxX - this.minX;
  }
  get height() {
    return this.maxY - this.minY;
  }
}

/* ───────────────────── anotaciones ───────────────────── */

const DIM_TEXT = 1.7;

function tick(pen: Pen, p: Pt) {
  pen.line([p[0] - 0.7, p[1] + 0.7], [p[0] + 0.7, p[1] - 0.7], "tick");
}

/** Cota horizontal (en y = yLine) entre x1 y x2, con líneas de referencia desde yFrom. */
function dimH(pen: Pen, x1: number, x2: number, yLine: number, yFrom: number, label: string) {
  const dir = yLine > yFrom ? 1 : -1;
  for (const x of [x1, x2]) pen.line([x, yFrom + dir * 1], [x, yLine + dir * 1.2], "dim");
  pen.line([Math.min(x1, x2) - 1, yLine], [Math.max(x1, x2) + 1, yLine], "dim");
  tick(pen, [x1, yLine]);
  tick(pen, [x2, yLine]);
  const span = Math.abs(x2 - x1);
  const fits = span > label.length * DIM_TEXT * 0.56 + 1;
  pen.text([(x1 + x2) / 2, yLine - 0.7], label, fits ? DIM_TEXT : DIM_TEXT * 0.82, "middle", 'class="tdim"');
}

/** Cota vertical (en x = xLine) entre y1 e y2. */
function dimV(pen: Pen, y1: number, y2: number, xLine: number, xFrom: number, label: string) {
  const dir = xLine > xFrom ? 1 : -1;
  for (const y of [y1, y2]) pen.line([xFrom + dir * 1, y], [xLine + dir * 1.2, y], "dim");
  pen.line([xLine, Math.min(y1, y2) - 1], [xLine, Math.max(y1, y2) + 1], "dim");
  tick(pen, [xLine, y1]);
  tick(pen, [xLine, y2]);
  const span = Math.abs(y2 - y1);
  const fits = span > label.length * DIM_TEXT * 0.56 + 1;
  pen.text([xLine - 0.7, (y1 + y2) / 2], label, fits ? DIM_TEXT : DIM_TEXT * 0.82, "middle", 'class="tdim"', -90);
}

/** Marca de nivel: triángulo + cota de nivel. */
function level(pen: Pen, p: Pt, value: number, label = "", side: 1 | -1 = 1) {
  const [x, y] = p;
  pen.poly(
    [
      [x, y],
      [x - 1.1, y - 1.6],
      [x + 1.1, y - 1.6],
    ],
    "lvl"
  );
  const text = label ? `${lvl(value)} ${label}` : lvl(value);
  pen.line([x - 2.2 * side, y], [x + (2.6 + text.length * 0.95) * side, y], "dim");
  pen.text([x + 1.8 * side, y - 0.6], text, DIM_TEXT, side > 0 ? "start" : "end", 'class="tdim"');
}

function bubble(pen: Pen, c: Pt, label: string) {
  pen.circle(c, 2.1, "bubble");
  pen.text([c[0], c[1] + 0.75], label, 2, "middle", 'class="tbub"');
}

function title(pen: Pen, p: Pt, name: string, scale: number) {
  pen.text(p, name, 3.0, "start", 'class="ttitle"');
  const w = name.length * 3.0 * 0.7;
  pen.text([p[0] + w + 2.5, p[1]], `Esc. 1:${scale}`, 1.9, "start", 'class="tnote"');
  pen.line([p[0], p[1] + 1.4], [p[0] + w + 18, p[1] + 1.4], "ttl");
}

/** Marca de corte: dos trazos fuera del edificio con flecha hacia donde se mira. */
function sectionMark(pen: Pen, a: Pt, b: Pt, look: Pt, label: string) {
  for (const p of [a, b]) {
    const other = p === a ? b : a;
    const len = Math.hypot(other[0] - p[0], other[1] - p[1]);
    const u: Pt = [(other[0] - p[0]) / len, (other[1] - p[1]) / len];
    pen.line(p, [p[0] + u[0] * 5, p[1] + u[1] * 5], "cutmark");
    const tip: Pt = [p[0] + look[0] * 3.2, p[1] + look[1] * 3.2];
    const side: Pt = [-look[1], look[0]];
    pen.poly([tip, [p[0] + side[0] * 1.1, p[1] + side[1] * 1.1], [p[0] - side[0] * 1.1, p[1] - side[1] * 1.1]], "arrow");
    pen.text([p[0] - u[0] * 2.6, p[1] - u[1] * 2.6 + 0.9], label, 2.6, "middle", 'class="tbub"');
  }
}

function leader(pen: Pen, from: Pt, to: Pt, text: string, anchor: "start" | "end" = "start") {
  pen.circle(from, 0.35, "dot");
  pen.line(from, to, "lead");
  const end: Pt = [to[0] + (anchor === "start" ? 6 : -6), to[1]];
  pen.line(to, end, "lead");
  pen.text([end[0] + (anchor === "start" ? 0.8 : -0.8), end[1] + 0.6], text, 1.55, anchor, 'class="tnote"');
}

/* ───────────────────── piezas comunes ───────────────────── */

function purlinStations(lay: WarehouseLayout) {
  const count = Math.max(2, Math.ceil(lay.halfSlope / PURLIN_SPACING) + 1);
  const out: { x: number; y: number }[] = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k < count; k += 1) {
      const t = k / (count - 1);
      const x = side * (lay.half + 0.05 - t * (lay.half - 0.25));
      out.push({ x, y: lay.roofSurface(x) - lay.roofT - PURLIN_H / 2 });
    }
  }
  return out;
}

function girtHeights(lay: WarehouseLayout) {
  const start = lay.baseH > 0 ? lay.baseH + 0.4 : 1.0;
  const out: number[] = [];
  for (let y = start; y < lay.eave - 0.5; y += GIRT_SPACING) out.push(y);
  return out;
}

/** Borde inferior de la viga de alma llena (mismo contorno que el 3D). */
function portalUnderside(lay: WarehouseLayout, xAbs: number) {
  const { half, colD, W, rd, topSteel } = lay;
  const x = -xAbs;
  const x0 = -half - colD / 2;
  const pts: Pt[] = [
    [x0, topSteel(x0) - rd * 2],
    [x0 + colD, topSteel(x0 + colD) - rd * 2],
    [-half + Math.max(1.5, 0.12 * W), topSteel(-half + Math.max(1.5, 0.12 * W)) - rd],
    [-Math.max(0.6, 0.06 * W), topSteel(-Math.max(0.6, 0.06 * W)) - rd],
    [0, topSteel(0) - rd * 1.25],
  ];
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    if (x >= ax && x <= bx) return ay + ((x - ax) / (bx - ax)) * (by - ay);
  }
  return pts[pts.length - 1][1];
}

const gutterY = (lay: WarehouseLayout) => lay.roofSurface(lay.half + EAVE_OVERHANG * Math.cos(lay.angle)) - 0.16;
const gutterX = (lay: WarehouseLayout) => lay.half + EAVE_OVERHANG * Math.cos(lay.angle) + 0.1;
const sideTop = (lay: WarehouseLayout) => lay.roofSurface(lay.wallX) - lay.roofT - 0.03;
const eaveEdgeX = (lay: WarehouseLayout) => lay.half + EAVE_OVERHANG * Math.cos(lay.angle);

/** Líneas de la chapa (ondas / juntas) según terminación, para las vistas. */
function sheetPattern(pen: Pen, lay: WarehouseLayout, toPaper: (u: number, y: number) => Pt, u0: number, u1: number, y0: number, y1: number) {
  const finish = lay.wallOption.finish;
  if (finish === "sandwich") {
    for (let y = y0 + 1; y < y1; y += 1) pen.line(toPaper(u0, y), toPaper(u1, y), "pat");
  } else {
    const step = finish === "standingSeam" ? 0.5 : 1;
    const start = Math.ceil(Math.min(u0, u1) / step) * step;
    for (let u = start; u < Math.max(u0, u1); u += step) pen.line(toPaper(u, y0), toPaper(u, y1), "pat");
  }
}

function sectionalDoorElevation(pen: Pen, toPaper: (u: number, y: number) => Pt, uc: number, lay: WarehouseLayout) {
  const { doorW, doorH } = lay;
  pen.rect(toPaper(uc - doorW / 2 - 0.12, 0), toPaper(uc + doorW / 2 + 0.12, doorH + 0.12), "frame");
  pen.rect(toPaper(uc - doorW / 2, 0), toPaper(uc + doorW / 2, doorH), "door");
  for (let y = 0.6; y < doorH - 0.1; y += 0.6) pen.line(toPaper(uc - doorW / 2, y), toPaper(uc + doorW / 2, y), "thin");
}

function windowElevation(pen: Pen, toPaper: (u: number, y: number) => Pt, uc: number, lay: WarehouseLayout) {
  const { winW, winH, winV0 } = lay;
  pen.rect(toPaper(uc - winW / 2, winV0), toPaper(uc + winW / 2, winV0 + winH), "glass");
  pen.line(toPaper(uc, winV0), toPaper(uc, winV0 + winH), "thin");
}

/* ───────────────────────── PLANTA ───────────────────────── */

function drawPlan(lay: WarehouseLayout, scale: number, config: WarehouseConfig, floorName = "") {
  const k = 1000 / scale;
  const pen = new Pen("plan");
  const P = (z: number, x: number): Pt => [z * k, -x * k];
  const { half, frameZ, n, wallX, gableZ, wallT, colD, flange, L } = lay;
  const minWall = 0.55 / k; // espesor mínimo visible del muro cortado
  const cutT = Math.max(lay.precast && lay.baseH > 1.2 ? 0.16 : wallT, minWall);
  const outerX = lay.precast && lay.baseH > 1.2 ? wallX + 0.06 : wallX;
  const zEnd = gableZ + wallT;

  // Ejes
  const axTop = P(0, wallX)[1] - 9;
  const axBot = P(0, -wallX)[1] + 3;
  frameZ.forEach((z, i) => {
    pen.line([P(z, 0)[0], axTop + 2.1], [P(z, 0)[0], axBot], "axis");
    bubble(pen, [P(z, 0)[0], axTop], String(i + 1));
  });
  const axLeft = P(-zEnd, 0)[0] - 9;
  for (const [x, name] of [
    [half, "B"],
    [-half, "A"],
  ] as const) {
    pen.line([axLeft + 2.1, P(0, x)[1]], [P(zEnd, 0)[0] + 3, P(0, x)[1]], "axis");
    bubble(pen, [axLeft, P(0, x)[1]], name);
  }

  // Proyecciones (cubierta) en trazo fino discontinuo
  const eaveX = eaveEdgeX(lay);
  pen.rect(P(frameZ[0] - 0.45, eaveX), P(frameZ[n] + 0.45, -eaveX), "proj");
  pen.line(P(frameZ[0] - 0.45, 0), P(frameZ[n] + 0.45, 0), "proj");
  if (lay.skylightsOn) {
    for (let bay = 0; bay < n; bay += 1) {
      if (!lay.isSkylight(bay)) continue;
      for (const s of [-1, 1]) pen.rect(P(frameZ[bay], s * lay.skylightBand.xOuter), P(frameZ[bay + 1], s * lay.skylightBand.xInner), "proj");
    }
  }
  if (lay.crane) for (const s of [-1, 1]) pen.line(P(-L / 2, s * lay.crane.railX), P(L / 2, s * lay.crane.railX), "proj2");
  if (lay.canopy) {
    const c = lay.canopy;
    pen.rect(P(c.zWall - c.depth, c.width / 2), P(c.zWall, -c.width / 2), "proj");
  }

  // Muros cortados, con huecos de aberturas
  const wallBand = (side: -1 | 1, z0: number, z1: number) => {
    const xo = side * outerX;
    const xi = side * (outerX - cutT);
    pen.rect(P(z0, xo), P(z1, xi), "cutw");
  };
  const segments = (a: number, b: number, gaps: [number, number][]) => {
    const out: [number, number][] = [];
    let cur = a;
    for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
      if (g0 > cur) out.push([cur, Math.min(g0, b)]);
      cur = Math.max(cur, g1);
    }
    if (cur < b) out.push([cur, b]);
    return out;
  };
  const eastGaps: [number, number][] = lay.sideDoorBays.map((bay) => [lay.bayCenter(bay) - lay.doorW / 2, lay.bayCenter(bay) + lay.doorW / 2]);
  const westGaps: [number, number][] = lay.personDoorZ.map((z) => [z - lay.personW / 2, z + lay.personW / 2]);
  for (const [a, b] of segments(-zEnd, zEnd, eastGaps)) wallBand(1, a, b);
  for (const [a, b] of segments(-zEnd, zEnd, westGaps)) wallBand(-1, a, b);
  for (const [zSign, doors] of [
    [-1, lay.frontDoors],
    [1, lay.backDoors],
  ] as const) {
    const zo = zSign * (lay.precast && lay.baseH > 1.2 ? gableZ + 0.06 : gableZ + wallT);
    const zi = zo - zSign * cutT;
    const gaps: [number, number][] = doors.map((dx) => [dx - lay.doorW / 2, dx + lay.doorW / 2]);
    for (const [a, b] of segments(-(outerX - cutT), outerX - cutT, gaps)) pen.rect(P(zo, a), P(zi, b), "cutw");
  }

  // Columnas (cortadas)
  for (const z of frameZ) {
    for (const s of [-1, 1]) {
      const w = lay.latticeColumns ? Math.max(colD, 0.3) : colD;
      pen.rect(P(z - flange / 2, s * half - w / 2), P(z + flange / 2, s * half + w / 2), "cut");
    }
  }
  for (const [z, doors] of [
    [frameZ[0], lay.frontDoors],
    [frameZ[n], lay.backDoors],
  ] as const) {
    for (const x of lay.gablePosts(doors)) pen.rect(P(z - 0.13, x - 0.075), P(z + 0.13, x + 0.075), "cut");
  }

  // Portones seccionales: hoja proyectada (va por arriba) + etiqueta
  const doorTag = (p: Pt, text: string) => pen.text(p, text, 1.6, "middle", 'class="ttag"');
  for (const bay of lay.sideDoorBays) {
    const zc = lay.bayCenter(bay);
    pen.line(P(zc - lay.doorW / 2, outerX - cutT / 2), P(zc + lay.doorW / 2, outerX - cutT / 2), "thin");
    pen.rect(P(zc - lay.doorW / 2, outerX - cutT - 0.1), P(zc + lay.doorW / 2, outerX - cutT - 0.1 - Math.min(lay.doorH, 3)), "hid");
    doorTag([P(zc, 0)[0], P(0, outerX - cutT - Math.min(lay.doorH, 3))[1] + 2.4], "PS");
  }
  for (const [zSign, doors] of [
    [-1, lay.frontDoors],
    [1, lay.backDoors],
  ] as const) {
    for (const dx of doors) {
      const zw = zSign * (gableZ + wallT / 2);
      pen.line(P(zw, dx - lay.doorW / 2), P(zw, dx + lay.doorW / 2), "thin");
      const zIn = zSign * (gableZ - 0.1);
      pen.rect(P(zIn, dx - lay.doorW / 2), P(zIn - zSign * Math.min(lay.doorH, 3), dx + lay.doorW / 2), "hid");
      doorTag([P(zIn - zSign * Math.min(lay.doorH, 3), 0)[0] + zSign * 2.4, P(0, dx)[1] + 0.6], "PS");
    }
  }
  // Puertas peatonales: hoja abatida hacia afuera
  for (const zc of lay.personDoorZ) {
    const hinge = P(zc - lay.personW / 2, -outerX);
    const r = lay.personW * k;
    const open: Pt = [hinge[0], hinge[1] + r];
    const closed: Pt = [hinge[0] + r, hinge[1]];
    pen.line(hinge, open, "frame");
    pen.path(`M ${n2(open[0])} ${n2(open[1])} A ${n2(r)} ${n2(r)} 0 0 0 ${n2(closed[0])} ${n2(closed[1])}`, "thin", [open, closed]);
    doorTag([hinge[0] + r / 2, hinge[1] - 1.4], "PP");
  }
  // Ventanas (altas, por encima del plano de corte): discontinuo
  for (const [side, bays] of [
    [1, lay.windowBaysEast],
    [-1, lay.windowBaysWest],
  ] as const) {
    for (const bay of bays) {
      const zc = lay.bayCenter(bay);
      const xo = side * (outerX + 0.2 / k);
      pen.line(P(zc - lay.winW / 2, xo + side * 0.35 / k), P(zc + lay.winW / 2, xo + side * 0.35 / k), "hid");
      pen.text([P(zc, 0)[0], P(0, side * outerX)[1] + (side > 0 ? 3 : -1.4)], "V", 1.6, "middle", 'class="ttag"');
    }
  }

  // Rótulos interiores
  const cz = frameZ[Math.floor(n / 2)] + (n % 2 ? lay.baySpacing / 2 : 0);
  const area = lay.W * lay.L;
  pen.text([P(cz, 0)[0], P(0, half * 0.35)[1]], "NAVE", 2.4, "middle", 'class="troom"');
  pen.text([P(cz, 0)[0], P(0, half * 0.35)[1] + 3.2], `${fmt(area, 0)} m² · NPT ±0,00`, 1.7, "middle", 'class="tnote"');
  if (floorName) pen.text([P(cz, 0)[0], P(0, half * 0.35)[1] + 5.6], `Piso: ${floorName.charAt(0).toLowerCase()}${floorName.slice(1)}`, 1.5, "middle", 'class="tnote"');
  if (lay.canopy) pen.text([P(lay.canopy.zWall - lay.canopy.depth / 2, 0)[0], P(0, 0)[1] + 0.6], "Marquesina", 1.4, "middle", 'class="tnote"', -90);
  if (lay.skylightsOn) {
    const sk = [...Array(n).keys()].find((b) => lay.isSkylight(b));
    if (sk !== undefined) pen.text([P(lay.bayCenter(sk), 0)[0], P(0, (lay.skylightBand.xOuter + lay.skylightBand.xInner) / 2)[1] + 0.5], "lucernario", 1.3, "middle", 'class="tnote"');
  }
  if (lay.crane) pen.text([P(frameZ[n] - lay.baySpacing / 2, 0)[0], P(0, lay.crane.railX)[1] + 2.2], "viga carrilera", 1.3, "middle", 'class="tnote"');

  // Marcas de corte
  const secBay = sectionBay(lay);
  const zA = lay.bayCenter(secBay);
  const yBelow = P(0, -wallX)[1] + (lay.canopy && lay.canopy.width / 2 > wallX ? (lay.canopy.width / 2 - wallX) * k : 0) + 6 + 5 + 4;
  sectionMark(pen, [P(zA, 0)[0], P(0, wallX)[1] - 3], [P(zA, 0)[0], yBelow], [1, 0], "X");
  const xB = sectionX(lay);
  sectionMark(pen, [P(-zEnd, 0)[0] - 3, P(0, xB)[1]], [P(zEnd, 0)[0] + 3, P(0, xB)[1]], [0, -1], "Y");

  // Cotas: cadena de módulos + total entre ejes (abajo) y luz (izquierda)
  const yBase = P(0, -wallX)[1] + (lay.canopy && lay.canopy.width / 2 > wallX ? (lay.canopy.width / 2 - wallX) * k : 0) + 6;
  for (let i = 0; i < n; i += 1) dimH(pen, P(frameZ[i], 0)[0], P(frameZ[i + 1], 0)[0], yBase, axBot, fmt(lay.baySpacing));
  dimH(pen, P(frameZ[0], 0)[0], P(frameZ[n], 0)[0], yBase + 5, yBase, fmt(L));
  const xDim = axLeft - 5;
  dimV(pen, P(0, half)[1], P(0, -half)[1], xDim, axLeft - 2, fmt(lay.W));
  void config;
  return pen;
}

/** Módulo por donde pasa el corte X-X: central, preferentemente sin lucernario. */
function sectionBay(lay: WarehouseLayout) {
  const mid = Math.floor(lay.n / 2);
  return lay.isSkylight(mid) && mid + 1 < lay.n ? mid + 1 : mid;
}
/** Posición del corte Y-Y: a mitad de faldón del lado oeste. */
const sectionX = (lay: WarehouseLayout) => -lay.half / 2;

/* ───────────────────────── VISTAS LATERALES ───────────────────────── */

function drawSideElevation(lay: WarehouseLayout, scale: number, side: -1 | 1) {
  const k = 1000 / scale;
  const pen = new Pen(side < 0 ? "elevW" : "elevE");
  // Oeste: frente a la izquierda. Este: frente a la derecha (vista real).
  const E = (z: number, y: number): Pt => [(side < 0 ? z : -z) * k, -y * k];
  const { frameZ, n, gableZ, wallT, L, baseH, ridge } = lay;
  const zEnd = gableZ + wallT;
  const top = sideTop(lay);
  const yEdge = lay.roofSurface(eaveEdgeX(lay));
  const gy = gutterY(lay);

  // Suelo
  const ext = (lay.canopy ? lay.canopy.depth : 0) + 3;
  pen.line(E(side < 0 ? -zEnd - ext : zEnd + 3, 0), E(side < 0 ? zEnd + 3 : -zEnd - ext, 0), "ground");

  // Cubierta vista (faldón) y cumbrera
  pen.poly([E(frameZ[0] - 0.45, yEdge - lay.roofT), E(frameZ[n] + 0.45, yEdge - lay.roofT), E(frameZ[n] + 0.45, ridge), E(frameZ[0] - 0.45, ridge)], "roofv");
  pen.line(E(frameZ[0] - 0.45, ridge + 0.04), E(frameZ[n] + 0.45, ridge + 0.04), "ol");

  // Cerramiento
  const wallPoly: Pt[] = [E(-zEnd, 0), E(zEnd, 0), E(zEnd, top), E(-zEnd, top)];
  pen.poly(wallPoly, "wall");
  pen.clip(wallPoly, () => sheetPattern(pen, lay, E, -zEnd, zEnd, baseH, top));
  if (baseH > 0) {
    pen.rect(E(-zEnd, 0), E(zEnd, baseH), "precast");
    for (let z = -L / 2; z <= L / 2 + 0.01; z += 2.5) pen.line(E(z, 0), E(z, baseH), "pat2");
  }

  // Canaleta y bajadas
  pen.rect(E(-(L + 0.9) / 2, gy - 0.1), E((L + 0.9) / 2, gy + 0.1), "wall");
  [frameZ[0] + 0.4, frameZ[Math.floor(n / 2)] + 0.6, frameZ[n] - 0.4].forEach((z) => pen.rect(E(z - 0.06, 0), E(z + 0.06, gy - 0.1), "pipe"));

  // Aberturas
  const tag = (p: Pt, t: string) => pen.text(p, t, 1.6, "middle", 'class="ttag"');
  if (side > 0) {
    for (const bay of lay.sideDoorBays) {
      const zc = lay.bayCenter(bay);
      sectionalDoorElevation(pen, E, zc, lay);
      tag([E(zc, 0)[0], E(0, lay.doorH + 0.12)[1] - 1.2], "PS");
    }
  } else {
    for (const zc of lay.personDoorZ) {
      pen.rect(E(zc - lay.personW / 2 - 0.08, 0), E(zc + lay.personW / 2 + 0.08, lay.personH + 0.08), "frame");
      pen.rect(E(zc - lay.personW / 2, 0), E(zc + lay.personW / 2, lay.personH), "door");
      tag([E(zc, 0)[0], E(0, lay.personH + 0.08)[1] - 1.2], "PP");
    }
  }
  for (const bay of side > 0 ? lay.windowBaysEast : lay.windowBaysWest) {
    const zc = lay.bayCenter(bay);
    windowElevation(pen, E, zc, lay);
    tag([E(zc, 0)[0], E(0, lay.winV0 + lay.winH)[1] - 1.2], "V");
  }

  // Marquesina de perfil
  if (lay.canopy) {
    const c = lay.canopy;
    const yTop = c.height + 0.32;
    pen.poly([E(c.zWall, yTop + 0.13), E(c.zWall - c.depth - 0.1, yTop - 0.07), E(c.zWall - c.depth - 0.1, yTop - 0.3), E(c.zWall, yTop - 0.1)], "wall");
    pen.line(E(c.zWall, c.height - 1.1), E(c.zWall - c.depth * 0.55, c.height + 0.18), "ol");
  }

  // Niveles (del lado del contrafrente) y cotas de altura (del lado del frente)
  const xLvl = E(zEnd, 0)[0] + (side < 0 ? 3 : -3);
  const s = side < 0 ? 1 : -1;
  level(pen, [xLvl, E(0, 0)[1]], 0, "", s as 1 | -1);
  level(pen, [xLvl, E(0, lay.eave)[1]], lay.eave, "alero", s as 1 | -1);
  level(pen, [xLvl, E(0, ridge)[1]], ridge, "cumbrera", s as 1 | -1);
  const front = E(-zEnd, 0)[0];
  const xDim = front + (side < 0 ? -(lay.canopy ? lay.canopy.depth * k + 4 : 4) : lay.canopy ? lay.canopy.depth * k + 4 : 4);
  dimV(pen, E(0, 0)[1], E(0, lay.eave)[1], xDim, front, fmt(lay.eave));
  dimV(pen, E(0, lay.eave)[1], E(0, ridge)[1], xDim, front, fmt(ridge - lay.eave));
  return pen;
}

/* ───────────────────────── VISTAS DE TESTERO ───────────────────────── */

function drawGableElevation(lay: WarehouseLayout, scale: number, which: "front" | "back") {
  const k = 1000 / scale;
  const pen = new Pen(which === "front" ? "elevF" : "elevC");
  // Frente: se mira hacia +Z (oeste a la derecha). Contrafrente: al revés.
  const F = (x: number, y: number): Pt => [(which === "front" ? -x : x) * k, -y * k];
  const { half, wallX, baseH, ridge, roofT } = lay;
  const top = sideTop(lay);
  const xe = eaveEdgeX(lay);
  const yEdge = lay.roofSurface(xe);
  const gy = gutterY(lay);
  const gx = gutterX(lay);

  pen.line(F(-wallX - 3, 0), F(wallX + 3, 0), "ground");
  // Testero
  const wallPoly: Pt[] = [F(-wallX, 0), F(wallX, 0), F(wallX, top), F(0, lay.roofSurface(0) - roofT - 0.03), F(-wallX, top)];
  pen.poly(wallPoly, "wall");
  pen.clip(wallPoly, () => sheetPattern(pen, lay, F, -wallX, wallX, baseH, ridge));
  if (baseH > 0) {
    pen.rect(F(-wallX, 0), F(wallX, baseH), "precast");
    for (let x = -half; x <= half + 0.01; x += 2.5) pen.line(F(x, 0), F(x, baseH), "pat2");
  }
  // Cubierta (canto) y cumbrera
  pen.poly([F(-xe, yEdge), F(0, ridge), F(xe, yEdge), F(xe, yEdge - roofT), F(0, ridge - roofT), F(-xe, yEdge - roofT)], "roofe");
  pen.poly([F(-0.4, ridge - 0.03), F(0, ridge + 0.06), F(0.4, ridge - 0.03)], "ol", false);
  for (const s of [-1, 1]) {
    pen.rect(F(s * gx - 0.14, gy - 0.1), F(s * gx + 0.14, gy + 0.1), "wall");
    pen.rect(F(s * (wallX + 0.12) - 0.06, 0), F(s * (wallX + 0.12) + 0.06, gy - 0.1), "pipe");
  }
  // Portones
  const doors = which === "front" ? lay.frontDoors : lay.backDoors;
  for (const dx of doors) {
    sectionalDoorElevation(pen, F, dx, lay);
    pen.text([F(dx, 0)[0], F(0, lay.doorH + 0.12)[1] - 1.2], "PS", 1.6, "middle", 'class="ttag"');
  }
  // Marquesina (sólo frente)
  if (which === "front" && lay.canopy) {
    const c = lay.canopy;
    const w = (c.width + 0.3) / 2;
    pen.rect(F(-w, c.height - 0.02), F(w, c.height + 0.3), "wall");
    pen.line(F(-w, c.height + 0.18), F(w, c.height + 0.18), "thin");
    const beams = Math.max(2, Math.round(c.width / 4) + 1);
    for (let i = 0; i < beams; i += 1) {
      const x = -c.width / 2 + (i * c.width) / (beams - 1);
      pen.line(F(x, c.height - 1.1), F(x, c.height - 0.02), "ol");
    }
  }
  // Pendiente
  const xm = half * 0.5;
  const ym = lay.roofSurface(xm) + 0.25;
  const pm = F(xm, ym);
  pen.text([pm[0], pm[1] - 1.2], `i = ${fmt(lay.roofSlope, 0)} %`, 1.6, "middle", 'class="tnote"');

  // Ejes, cota de luz y niveles
  const yAx = F(0, 0)[1] + 4;
  for (const [x, name] of [
    [-half, "A"],
    [half, "B"],
  ] as const) {
    pen.line([F(x, 0)[0], F(0, 0)[1] + 1], [F(x, 0)[0], yAx + 6], "axis");
    bubble(pen, [F(x, 0)[0], yAx + 8.1], name);
  }
  dimH(pen, F(-half, 0)[0], F(half, 0)[0], yAx + 2, F(0, 0)[1] + 1, fmt(lay.W));
  const right = Math.max(F(xe, 0)[0], F(-xe, 0)[0]) + 2.5;
  level(pen, [right, F(0, 0)[1]], 0);
  level(pen, [right, F(0, lay.eave)[1]], lay.eave, "alero");
  level(pen, [right, F(0, ridge)[1]], ridge, "cumbrera");
  return pen;
}

/* ───────────────────────── CORTE X-X (transversal) ───────────────────────── */

function drawCrossSection(lay: WarehouseLayout, scale: number, structureName: string, foundation: FoundationId = "padFootings") {
  const k = 1000 / scale;
  const pen = new Pen("secX");
  const C = (x: number, y: number): Pt => [-x * k, -y * k];
  const { half, wallX, wallT, baseH, ridge, roofT, colD, topSteel, frameZ, n } = lay;
  const bay = sectionBay(lay);
  const zc = lay.bayCenter(bay);
  const top = sideTop(lay);
  const xe = eaveEdgeX(lay);
  const minT = 0.45 / k;

  // Terreno, platea (cortada) y bases (ocultas)
  pen.line(C(-wallX - 3, 0), C(wallX + 3, 0), "ground");
  pen.rect(C(-wallX - 0.3, 0), C(wallX + 0.3, -0.2), "conc");
  // Fundaciones según el tipo (el corte pasa entre pórticos: bases y cabezales quedan en vista, ocultos).
  const fs = foundationSizes(lay.W);
  // Lo más bajo que se dibuja: los ejes y la cota total van debajo.
  const deepest = foundation === "piles" ? SLAB_BOTTOM - fs.piles.capHeight - Math.min(fs.piles.length, 3.2) : foundation === "stripFooting" ? fs.strip.bottom : fs.pad.bottom;
  for (const s of [-1, 1]) {
    const x = s * half;
    if (foundation === "stripFooting") {
      const { width: bw, thickness: t, bottom, stemWidth } = fs.strip;
      pen.rect(C(x - bw / 2, bottom), C(x + bw / 2, bottom + t), "conc");
      pen.rect(C(x - stemWidth / 2, bottom + t), C(x + stemWidth / 2, SLAB_BOTTOM), "conc");
    } else if (foundation === "piles") {
      const P = fs.piles;
      const capBottom = SLAB_BOTTOM - P.capHeight;
      const shown = Math.min(P.length, 3.2);
      pen.rect(C(x - P.capMain[0] / 2, capBottom), C(x + P.capMain[0] / 2, SLAB_BOTTOM), "hid");
      pen.rect(C(x - P.beam[0] / 2, SLAB_BOTTOM - P.beam[1]), C(x + P.beam[0] / 2, SLAB_BOTTOM), "conc");
      for (const dx of [-P.spacing / 2, P.spacing / 2]) {
        const px = x + dx;
        pen.rect(C(px - P.diameter / 2, capBottom - shown), C(px + P.diameter / 2, capBottom), "hid");
      }
      // Corte del dibujo (los pilotes siguen más abajo) y su largo.
      const yb = capBottom - shown;
      const zig: Pt[] = [C(x - 0.9, yb), C(x - 0.3, yb + 0.15), C(x - 0.1, yb - 0.15), C(x + 0.1, yb + 0.15), C(x + 0.3, yb - 0.15), C(x + 0.9, yb)];
      pen.poly(zig, "thin", false);
      // C() espeja x: "afuera" del galpón en el papel es x + s.
      pen.text(C(x + s * 1.3, capBottom - shown / 2), `pilotes L≈${formatNumber(P.length, 0)} m`, DIM_TEXT * 0.8, s > 0 ? "end" : "start", 'class="tdim"');
    } else {
      const D = fs.pad;
      pen.rect(C(x - D.side / 2, D.bottom), C(x + D.side / 2, D.bottom + D.thickness), "hid");
      pen.rect(C(x - D.stem / 2, D.bottom + D.thickness), C(x + D.stem / 2, SLAB_BOTTOM), "hid");
    }
  }

  // Pórtico del fondo (en vista)
  const colTop = topSteel(half + colD / 2);
  for (const s of [-1, 1]) {
    if (lay.latticeColumns) {
      const a = colD / 2;
      const xa = s * half - a;
      const xb = s * half + a;
      pen.line(C(xa, 0), C(xa, s > 0 ? lay.bottomChordY : colTop), "ol");
      pen.line(C(xb, 0), C(xb, s > 0 ? colTop : lay.bottomChordY), "ol");
      const step = Math.max(0.8, colD * 1.4);
      let left = true;
      for (let y = 0.4; y + step < lay.bottomChordY - 0.1; y += step) {
        pen.line(C(left ? xa : xb, y), C(left ? xb : xa, y + step), "thin");
        left = !left;
      }
    } else {
      pen.rect(C(s * half - colD / 2, 0), C(s * half + colD / 2, colTop), "steel");
    }
  }
  if (lay.trussRafters) {
    const chord = Math.min(0.26, Math.max(0.14, lay.W / 250));
    const panels = 2 * Math.max(3, Math.round(half / 2.4));
    const xs = Array.from({ length: panels + 1 }, (_, i) => -half + (i * lay.W) / panels);
    const tp = (x: number) => topSteel(x) - chord / 2;
    const bt = lay.bottomChordY + chord / 2;
    pen.poly([C(-half - 0.15, tp(-half - 0.15)), C(0, tp(0)), C(half + 0.15, tp(half + 0.15))], "olw", false);
    pen.line(C(-half, bt), C(half, bt), "olw");
    xs.forEach((x, i) => {
      pen.line(C(x, bt), C(x, tp(x)), "thin");
      if (i < panels) {
        const xn = xs[i + 1];
        if (x < 0) pen.line(C(x, tp(x)), C(xn, bt), "thin");
        else pen.line(C(x, bt), C(xn, tp(xn)), "thin");
      }
    });
  } else {
    const x0 = -half - colD / 2;
    const xh = -half + Math.max(1.5, 0.12 * lay.W);
    const xr = -Math.max(0.6, 0.06 * lay.W);
    const left: Pt[] = [
      [x0, topSteel(x0)],
      [0, topSteel(0)],
      [0, topSteel(0) - lay.rd * 1.25],
      [xr, topSteel(xr) - lay.rd],
      [xh, topSteel(xh) - lay.rd],
      [x0 + colD, topSteel(x0 + colD) - lay.rd * 2],
      [x0, topSteel(x0) - lay.rd * 2],
    ];
    pen.poly(left.map(([x, y]) => C(x, y)), "steel");
    pen.poly(left.map(([x, y]) => C(-x, y)), "steel");
  }

  // Cubierta cortada (con lucernario si el módulo lo tiene)
  const roofPoly = (x0: number, x1: number): Pt[] => {
    const pts: Pt[] = [];
    const xs = [x0, ...(x0 < 0 && x1 > 0 ? [0] : []), x1];
    for (const x of xs) pts.push(C(x, lay.roofSurface(x)));
    for (const x of [...xs].reverse()) pts.push(C(x, lay.roofSurface(x) - Math.max(roofT, minT)));
    return pts;
  };
  pen.poly(roofPoly(-xe, xe), "cutw");
  if (lay.isSkylight(bay)) for (const s of [-1, 1]) pen.poly(roofPoly(Math.min(s * lay.skylightBand.xInner, s * lay.skylightBand.xOuter), Math.max(s * lay.skylightBand.xInner, s * lay.skylightBand.xOuter)), "glasscut");
  pen.poly([C(-0.45, ridge + 0.02), C(0, ridge + 0.06), C(0.45, ridge + 0.02)], "ol", false);

  // Correas y largueros (cortados)
  for (const p of purlinStations(lay)) pen.rect(C(p.x - 0.05, p.y - PURLIN_H / 2), C(p.x + 0.05, p.y + PURLIN_H / 2), "cut");
  const opening = (sideSign: 1 | -1): { y0: number; y1: number; kind: "door" | "window" | "person" } | null => {
    if (sideSign > 0 && lay.sideDoorBays.includes(bay)) return { y0: 0, y1: lay.doorH, kind: "door" };
    if (sideSign < 0 && lay.personDoorZ.some((z) => Math.abs(z - zc) < lay.personW / 2)) return { y0: 0, y1: lay.personH, kind: "person" };
    if ((sideSign > 0 ? lay.windowBaysEast : lay.windowBaysWest).includes(bay)) return { y0: lay.winV0, y1: lay.winV0 + lay.winH, kind: "window" };
    return null;
  };
  const girtDepth = Math.max(0.06, 0.18 - wallT - 0.006);
  for (const s of [-1, 1] as const) {
    const op = opening(s);
    for (const y of girtHeights(lay)) {
      if (op && y < op.y1 + 0.1 && y > op.y0 - 0.1) continue;
      const xg = s * (half + colD / 2 + 0.003 + girtDepth / 2);
      pen.rect(C(xg - girtDepth / 2, y - 0.04), C(xg + girtDepth / 2, y + 0.04), "cut");
    }
    // Cerramiento cortado
    const xo = s * wallX;
    const xi = s * (wallX - Math.max(wallT, minT));
    const bands: [number, number][] = [];
    const y0 = baseH;
    if (op && op.y1 > y0) {
      if (op.y0 > y0) bands.push([y0, op.y0]);
      bands.push([op.y1, top]);
    } else bands.push([y0, top]);
    for (const [a, b] of bands) pen.rect(C(xo, a), C(xi, b), "cutw");
    if (op) {
      const xm = s * (wallX - wallT / 2);
      pen.line(C(xm, Math.max(op.y0, op.kind === "window" ? op.y0 : 0)), C(xm, op.y1), op.kind === "window" ? "glassl" : "frame");
    }
    if (baseH > 0) {
      const bTop = op && op.y0 < baseH ? null : baseH;
      if (bTop !== null) pen.rect(C(s * (wallX + 0.06), 0), C(s * (wallX - 0.1), baseH), "conc");
    }
    // Canaleta
    const gx = gutterX(lay);
    const gy = gutterY(lay);
    pen.rect(C(s * gx - 0.14, gy - 0.1), C(s * gx + 0.14, gy + 0.1), "cutw");
  }
  if (lay.crane) for (const s of [-1, 1]) pen.rect(C(s * lay.crane.railX - 0.15, lay.crane.railY - 0.3), C(s * lay.crane.railX + 0.15, lay.crane.railY + 0.3), "cut");

  // Anotaciones
  const roofName = `${lay.roofOption.name} e=${lay.roofOption.thicknessMm} mm`;
  const xr = half * 0.62;
  leader(pen, C(xr, lay.roofSurface(xr)), [C(xr, 0)[0] - 4, C(0, ridge)[1] - 3], `Cubierta: ${roofName}`, "end");
  const mid = C(half * 0.4, lay.trussRafters ? lay.bottomChordY : portalUnderside(lay, half * 0.4));
  leader(pen, mid, [mid[0] + 3, mid[1] + 5], structureName);
  if (lay.crane) pen.text([C(0, 0)[0], C(0, lay.crane.railY)[1] - 1.5], "vigas carrileras", 1.3, "middle", 'class="tnote"');
  const g0 = girtHeights(lay).find((y) => y > lay.clearHeight * 0.55);
  if (g0 !== undefined) leader(pen, C(-(half + colD / 2), g0), [C(-wallX, 0)[0] + 2.5, C(0, g0)[1] - 2.5], "largueros");

  // Ejes, cotas y niveles
  const yAx = C(0, deepest - 0.2)[1] + 3;
  for (const [x, name] of [
    [-half, "A"],
    [half, "B"],
  ] as const) {
    pen.line([C(x, 0)[0], C(0, deepest - 0.2)[1] + 1], [C(x, 0)[0], yAx + 6], "axis");
    bubble(pen, [C(x, 0)[0], yAx + 8.1], name);
  }
  dimH(pen, C(-half, 0)[0], C(half, 0)[0], yAx + 2, C(0, deepest - 0.2)[1] + 1, fmt(lay.W));
  const xIn = C(half - colD / 2 - 0.6, 0)[0] + 2.5;
  dimV(pen, C(0, 0)[1], C(0, lay.clearHeight)[1], xIn, xIn - 1, `h libre ${fmt(lay.clearHeight)}`);
  const right = Math.max(C(xe, 0)[0], C(-xe, 0)[0]) + 2.5;
  level(pen, [right, C(0, 0)[1]], 0);
  level(pen, [right, C(0, lay.eave)[1]], lay.eave, "alero");
  level(pen, [right, C(0, ridge)[1]], ridge, "cumbrera");
  void frameZ;
  void n;
  return pen;
}

/* ───────────────────────── CORTE Y-Y (longitudinal) ───────────────────────── */

function drawLongSection(lay: WarehouseLayout, scale: number) {
  const k = 1000 / scale;
  const pen = new Pen("secY");
  const B = (z: number, y: number): Pt => [z * k, -y * k];
  const { frameZ, n, gableZ, wallT, L, baseH, half, colD, flange, topSteel } = lay;
  const xc = sectionX(lay);
  const minT = 0.45 / k;
  const zEnd = gableZ + wallT;
  const roofY = lay.roofSurface(xc);
  const gableTop = roofY - lay.roofT - 0.03;
  const ext = (lay.canopy ? lay.canopy.depth : 0) + 3;

  pen.line(B(-zEnd - ext, 0), B(zEnd + 3, 0), "ground");
  pen.rect(B(-gableZ - 0.3, 0), B(gableZ + 0.3, -0.2), "conc");

  // Fondo: cerramiento este con sus aberturas y columnas del eje B
  if (baseH > 0) pen.line(B(-gableZ, baseH), B(gableZ, baseH), "thin");
  for (const bay of lay.sideDoorBays) {
    const zc = lay.bayCenter(bay);
    pen.rect(B(zc - lay.doorW / 2, 0), B(zc + lay.doorW / 2, lay.doorH), "doorbg");
  }
  for (const bay of lay.windowBaysEast) {
    const zc = lay.bayCenter(bay);
    pen.rect(B(zc - lay.winW / 2, lay.winV0), B(zc + lay.winW / 2, lay.winV0 + lay.winH), "doorbg");
  }
  const colTop = topSteel(half + colD / 2);
  for (const z of frameZ) pen.rect(B(z - Math.max(flange, 0.14) / 2, 0), B(z + Math.max(flange, 0.14) / 2, colTop), "steelbg");
  if (lay.crane) pen.rect(B(-L / 2, lay.crane.railY - 0.3), B(L / 2, lay.crane.railY + 0.3), "steelbg");

  // Vigas / cerchas cortadas en cada pórtico
  for (const z of frameZ) {
    if (lay.trussRafters) {
      const chord = Math.min(0.26, Math.max(0.14, lay.W / 250));
      const tTop = topSteel(xc);
      const bTop = lay.bottomChordY + chord;
      pen.line(B(z, tTop - chord), B(z, bTop), "ol");
      pen.rect(B(z - chord / 2, tTop), B(z + chord / 2, tTop - chord), "cut");
      pen.rect(B(z - chord / 2, bTop), B(z + chord / 2, lay.bottomChordY), "cut");
    } else {
      pen.rect(B(z - flange / 2, topSteel(xc)), B(z + flange / 2, portalUnderside(lay, Math.abs(xc))), "cut");
    }
  }

  // Cubierta cortada, lucernarios y testeros cortados
  const roofT = Math.max(lay.roofT, minT);
  const sky = Math.abs(xc) <= lay.skylightBand.xOuter && Math.abs(xc) >= lay.skylightBand.xInner;
  for (let bay = 0; bay < n; bay += 1) {
    const z0 = frameZ[bay] - (bay === 0 ? 0.45 : 0);
    const z1 = frameZ[bay + 1] + (bay === n - 1 ? 0.45 : 0);
    pen.rect(B(z0, roofY), B(z1, roofY - roofT), sky && lay.isSkylight(bay) ? "glasscut" : "cutw");
  }
  for (const zSign of [-1, 1] as const) {
    const doors = zSign < 0 ? lay.frontDoors : lay.backDoors;
    const door = doors.find((dx) => Math.abs(dx - xc) < lay.doorW / 2);
    const zo = zSign * zEnd;
    const zi = zSign * (zEnd - Math.max(wallT, minT));
    const from = door !== undefined ? lay.doorH : baseH;
    pen.rect(B(zo, Math.max(from, baseH)), B(zi, gableTop), "cutw");
    if (baseH > 0 && door === undefined) pen.rect(B(zSign * (gableZ + 0.06), 0), B(zSign * (gableZ - 0.1), baseH), "conc");
    if (door !== undefined) pen.line(B(zSign * (gableZ - 0.12), 0), B(zSign * (gableZ - 0.12), lay.doorH), "frame");
  }
  if (lay.canopy && Math.abs(xc) < lay.canopy.width / 2) {
    const c = lay.canopy;
    const yTop = c.height + 0.32;
    pen.poly([B(c.zWall, yTop + 0.13), B(c.zWall - c.depth - 0.1, yTop - 0.07), B(c.zWall - c.depth - 0.1, yTop - 0.2), B(c.zWall, yTop)], "cutw");
    pen.line(B(c.zWall, c.height - 1.1), B(c.zWall - c.depth * 0.55, c.height + 0.18), "ol");
  }

  // Ejes, cotas y niveles
  const yAx = B(0, -0.2)[1] + 3;
  frameZ.forEach((z, i) => {
    pen.line([B(z, 0)[0], B(0, -0.2)[1] + 1], [B(z, 0)[0], yAx + 6], "axis");
    bubble(pen, [B(z, 0)[0], yAx + 8.1], String(i + 1));
  });
  for (let i = 0; i < n; i += 1) dimH(pen, B(frameZ[i], 0)[0], B(frameZ[i + 1], 0)[0], yAx + 2, B(0, -0.2)[1] + 1, fmt(lay.baySpacing));
  const xl = B(zEnd, 0)[0] + 3;
  level(pen, [xl, B(0, 0)[1]], 0);
  level(pen, [xl, B(0, roofY)[1]], roofY, "cubierta en corte");
  const hFree = lay.trussRafters ? lay.bottomChordY : portalUnderside(lay, Math.abs(xc));
  const xd = B(-zEnd, 0)[0] - (lay.canopy ? lay.canopy.depth * k + 4 : 4);
  dimV(pen, B(0, 0)[1], B(0, hFree)[1], xd, B(-zEnd, 0)[0], fmt(hFree));
  return pen;
}

/* ───────────────────────── LÁMINA ───────────────────────── */

const SCALES = [100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 1500, 2000];

const PAGE = { w: 420, h: 297, m: 8 };
/** Anchos posibles de la columna derecha (perspectiva, testeros, corte X-X y rótulo). */
const RIGHT_WIDTHS = [122, 132, 142, 152];
const TITLE_H = 50;
const GAP = 7;
const TITLE_SPACE = 7;

type Placed = { pen: Pen; name: string };

function stackHeight(list: Placed[]) {
  return list.reduce((sum, p) => sum + p.pen.height + TITLE_SPACE, 0) + GAP * Math.max(0, list.length - 1);
}

const CSS = `
text{font-family:${FONT};fill:#1d1d1b}
.ttitle{font-weight:700;letter-spacing:.2px}
.tdim{fill:#1d1d1b}
.tnote{fill:#4a4a46}
.ttag{font-weight:700;fill:#1d1d1b}
.troom{font-weight:700;letter-spacing:.6px}
.tbub{font-weight:700}
.tsmall{fill:#4a4a46}
line,polyline,polygon,rect,path,circle{vector-effect:none}
.ground{stroke:#1d1d1b;stroke-width:.55}
.cut{fill:#1d1d1b;stroke:#1d1d1b;stroke-width:.12}
.cutw{fill:#5b5b57;stroke:#1d1d1b;stroke-width:.3}
.conc{fill:url(#hatch);stroke:#1d1d1b;stroke-width:.3}
.glasscut{fill:#cfe0e6;stroke:#1d1d1b;stroke-width:.25}
.glassl{stroke:#6c98a8;stroke-width:.35}
.steel{fill:#e9e8e3;stroke:#1d1d1b;stroke-width:.25}
.steelbg{fill:none;stroke:#8b8b86;stroke-width:.15}
.ol{fill:none;stroke:#1d1d1b;stroke-width:.25}
.olw{fill:none;stroke:#1d1d1b;stroke-width:.35}
.wall{fill:#fff;stroke:#1d1d1b;stroke-width:.3}
.roofv{fill:#e4e3de;stroke:#1d1d1b;stroke-width:.3}
.roofe{fill:#c9c8c2;stroke:#1d1d1b;stroke-width:.3}
.precast{fill:#efeee9;stroke:#1d1d1b;stroke-width:.25}
.pat{stroke:#c4c3bd;stroke-width:.08}
.pat2{stroke:#b5b4ae;stroke-width:.1}
.pipe{fill:#fff;stroke:#1d1d1b;stroke-width:.15}
.door{fill:#f4f3ef;stroke:#1d1d1b;stroke-width:.25}
.doorbg{fill:none;stroke:#8b8b86;stroke-width:.15}
.frame{fill:#1d1d1b;stroke:#1d1d1b;stroke-width:.3}
.glass{fill:#dbe8ec;stroke:#1d1d1b;stroke-width:.25}
.thin{fill:none;stroke:#1d1d1b;stroke-width:.12}
.hid{fill:none;stroke:#55554f;stroke-width:.15;stroke-dasharray:.9 .6}
.proj{fill:none;stroke:#7a7a74;stroke-width:.13;stroke-dasharray:1.6 .8}
.proj2{fill:none;stroke:#7a7a74;stroke-width:.13;stroke-dasharray:3 .8 .5 .8}
.axis{stroke:#9a9993;stroke-width:.13;stroke-dasharray:5 1 .6 1}
.bubble{fill:#fff;stroke:#1d1d1b;stroke-width:.2}
.dim{stroke:#1d1d1b;stroke-width:.12}
.tick{stroke:#1d1d1b;stroke-width:.35}
.lvl{fill:#1d1d1b}
.lead{stroke:#1d1d1b;stroke-width:.12;fill:none}
.dot{fill:#1d1d1b}
.cutmark{stroke:#1d1d1b;stroke-width:.6}
.arrow{fill:#1d1d1b}
.ttl{stroke:#1d1d1b;stroke-width:.3}
.frameline{fill:none;stroke:#1d1d1b;stroke-width:.5}
.cell{fill:none;stroke:#1d1d1b;stroke-width:.2}
.accent{fill:#c9a227}
`;

/** Arma la lámina completa. Elige la escala normalizada más grande que entra en A3. */
export function buildDrawingSheet(config: WarehouseConfig, definition: WarehouseDefinition, options: DrawingSheetOptions = {}): DrawingSheet {
  const lay = warehouseLayout(config, definition);
  const system = definition.structure.systems.find((s) => s.id === config.structure);
  const structureName = system?.name ?? config.structure;
  const floorName = definition.structure.floors?.find((f) => f.id === config.floor)?.name ?? "";
  const innerH = PAGE.h - 2 * PAGE.m - 6;
  const withBack = lay.backDoors.length > 0;
  const build = (scale: number) => ({
    left: [
      { pen: drawPlan(lay, scale, config, floorName), name: "PLANTA" },
      { pen: drawSideElevation(lay, scale, -1), name: "VISTA LATERAL OESTE" },
      { pen: drawSideElevation(lay, scale, 1), name: "VISTA LATERAL ESTE" },
      { pen: drawLongSection(lay, scale), name: "CORTE Y-Y" },
    ] as Placed[],
    right: [
      { pen: drawGableElevation(lay, scale, "front"), name: "VISTA FRENTE" },
      ...(withBack ? [{ pen: drawGableElevation(lay, scale, "back"), name: "VISTA CONTRAFRENTE" }] : []),
      { pen: drawCrossSection(lay, scale, structureName, config.foundation), name: "CORTE X-X" },
    ] as Placed[],
  });

  // La escala normalizada más grande en la que todo entra; para cada escala
  // se prueba ensanchar la columna derecha si la izquierda tiene lugar.
  let chosen: { scale: number; rightW: number; left: Placed[]; right: Placed[] } | null = null;
  for (const scale of SCALES) {
    const { left, right } = build(scale);
    const imageMin = 52;
    const fitsLeftH = stackHeight(left) <= innerH;
    const fitsRightH = stackHeight(right) + TITLE_H + imageMin + 2 * GAP <= innerH;
    if (!fitsLeftH || !fitsRightH) continue;
    const rightW = RIGHT_WIDTHS.find((rw) => {
      const leftW = PAGE.w - 2 * PAGE.m - rw - GAP;
      return left.every((p) => p.pen.width <= leftW - 3) && right.every((p) => p.pen.width <= rw);
    });
    if (rightW !== undefined) {
      chosen = { scale, rightW, left, right };
      break;
    }
  }
  if (!chosen) {
    const scale = SCALES[SCALES.length - 1];
    chosen = { scale, rightW: RIGHT_WIDTHS[0], ...build(scale) };
  }
  const RIGHT_W = chosen.rightW;
  const leftW = PAGE.w - 2 * PAGE.m - RIGHT_W - GAP;
  const { scale, left, right } = chosen;

  const out: string[] = [];
  const x0 = PAGE.m;
  const y0 = PAGE.m;
  const W = PAGE.w - 2 * PAGE.m;
  const H = PAGE.h - 2 * PAGE.m;
  out.push(`<rect x="${x0}" y="${y0}" width="${W}" height="${H}" class="frameline"/>`);
  const rightX = x0 + W - RIGHT_W;
  out.push(`<line x1="${rightX - GAP / 2}" y1="${y0}" x2="${rightX - GAP / 2}" y2="${y0 + H}" class="cell"/>`);

  const place = (p: Placed, x: number, y: number, w: number) => {
    const pen = p.pen;
    const dx = x + (w - pen.width) / 2 - pen.minX;
    const dy = y - pen.minY;
    out.push(`<g transform="translate(${n2(dx)} ${n2(dy)})">${pen.parts.join("")}</g>`);
    const t = new Pen("t");
    title(t, [x + (w - pen.width) / 2, y + pen.height + 5.2], p.name, scale);
    out.push(t.parts.join(""));
    return y + pen.height + TITLE_SPACE;
  };

  // Columna izquierda: repartir el aire sobrante entre dibujos
  const leftFree = H - 6 - stackHeight(left);
  const leftGap = GAP + Math.max(0, leftFree) / (left.length + 1);
  let y = y0 + 3 + Math.max(0, leftFree) / (left.length + 1);
  for (const p of left) y = place(p, x0 + 3, y, leftW - 3) + leftGap - GAP + GAP;

  // Columna derecha: perspectiva arriba, vistas/corte, rótulo abajo
  const titleY = y0 + H - TITLE_H;
  const rightStack = stackHeight(right);
  const imageH = Math.max(40, titleY - y0 - 6 - rightStack - 2 * GAP);
  const imgW = RIGHT_W - 6;
  if (options.image) {
    const aspect = options.imageAspect ?? 1.6;
    let w = imgW;
    let h = w / aspect;
    if (h > imageH) {
      h = imageH;
      w = h * aspect;
    }
    out.push(`<image href="${options.image}" x="${n2(rightX + (RIGHT_W - w) / 2)}" y="${n2(y0 + 3 + (imageH - h) / 2)}" width="${n2(w)}" height="${n2(h)}" preserveAspectRatio="xMidYMid meet"/>`);
  } else {
    out.push(`<rect x="${rightX + 3}" y="${y0 + 3}" width="${imgW}" height="${n2(imageH)}" fill="#f1f0ec"/>`);
    out.push(`<text x="${rightX + RIGHT_W / 2}" y="${n2(y0 + 3 + imageH / 2)}" font-size="2.4" text-anchor="middle" class="tnote">Perspectiva 3D</text>`);
  }
  out.push(`<text x="${rightX + 3}" y="${n2(y0 + 3 + imageH + 4.5)}" font-size="3" class="ttitle">PERSPECTIVA</text>`);
  let ry = y0 + 3 + imageH + 4.5 + GAP + (titleY - (y0 + 3 + imageH + 4.5 + GAP) - rightStack - GAP) / 2;
  for (const p of right) ry = place(p, rightX, ry, RIGHT_W) + GAP;

  out.push(titleBlock(config, definition, lay, scale, rightX, titleY, RIGHT_W, TITLE_H, structureName, options));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${PAGE.w}mm" height="${PAGE.h}mm" viewBox="0 0 ${PAGE.w} ${PAGE.h}">
<defs><style>${CSS}</style><pattern id="hatch" width="1.2" height="1.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.2" height="1.2" fill="#fff"/><line x1="0" y1="0" x2="0" y2="1.2" stroke="#6b6b66" stroke-width=".12"/></pattern></defs>
<rect width="${PAGE.w}" height="${PAGE.h}" fill="#fff"/>
${out.join("\n")}
</svg>`;
  return { svg, scale };
}

function titleBlock(config: WarehouseConfig, definition: WarehouseDefinition, lay: WarehouseLayout, scale: number, x: number, y: number, w: number, h: number, structureName: string, options: DrawingSheetOptions) {
  const env = definition.envelope;
  const find = <T extends { id: string }>(list: T[], id: string) => list.find((i) => i.id === id);
  const wallColor = find(env.colors, config.envelope.wallColor)?.name ?? "";
  const roofColor = find(env.colors, config.envelope.roofColor)?.name ?? "";
  const date = options.date ?? new Date().toLocaleDateString("es-AR");
  const t = (tx: number, ty: number, s: string, size: number, cls = "", anchor = "start") =>
    `<text x="${n2(tx)}" y="${n2(ty)}" font-size="${size}" text-anchor="${anchor}" class="${cls}">${esc(s)}</text>`;
  const r: string[] = [];
  r.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" class="cell"/>`);
  // Marca
  r.push(`<rect x="${x}" y="${y}" width="${w}" height="11" fill="#1d1d1b"/>`);
  r.push(`<rect x="${x}" y="${y + 11}" width="${w}" height=".8" class="accent"/>`);
  r.push(`<text x="${x + 3}" y="${y + 7.4}" font-size="4.2" font-weight="700" fill="#fff" letter-spacing=".6" style="fill:#fff">MODELLWERK</text>`);
  r.push(`<text x="${x + w - 3}" y="${y + 7.2}" font-size="2.2" text-anchor="end" style="fill:#c9a227" letter-spacing=".4">MW WAREHOUSE</text>`);
  // Datos
  let ty = y + 17;
  r.push(t(x + 3, ty, `${definition.code} · ${definition.name}${options.project ? ` — ${options.project}` : ""}`, 3, "ttitle"));
  ty += 4.2;
  r.push(t(x + 3, ty, `${fmt(lay.W, 1)} × ${fmt(lay.L, 1)} m · ${fmt(lay.W * lay.L, 0)} m² · alero ${fmt(lay.eave)} m · cumbrera ${fmt(lay.ridge)} m · i = ${fmt(lay.roofSlope, 0)} %`, 1.75, "tsmall"));
  ty += 3.3;
  const foundationName = definition.structure.foundations?.find((f) => f.id === config.foundation)?.name;
  r.push(t(x + 3, ty, `Estructura: ${structureName} · ${lay.n} módulos de ${fmt(lay.baySpacing)} m${foundationName ? ` · Fundación: ${foundationName.toLowerCase()}` : ""}`, 1.75, "tsmall"));
  ty += 3.3;
  r.push(t(x + 3, ty, `Cubierta: ${lay.roofOption.name} (${roofColor.toLowerCase()}) · Cerram.: ${lay.wallOption.name} (${wallColor.toLowerCase()})`, 1.75, "tsmall"));
  ty += 3.3;
  const refs = [
    `PS portón seccional ${fmt(lay.doorW)} × ${fmt(lay.doorH)}`,
    lay.personDoorZ.length ? `PP puerta ${fmt(lay.personW)} × ${fmt(lay.personH)}` : "",
    lay.windowBaysEast.length + lay.windowBaysWest.length ? `V ventana ${fmt(lay.winW)} × ${fmt(lay.winH)} (antep. ${fmt(lay.winV0)})` : "",
  ].filter(Boolean);
  r.push(t(x + 3, ty, `Ref.: ${refs.join(" · ")}`, 1.75, "tsmall"));
  ty += 3.3;
  r.push(t(x + 3, ty, "Cotas en metros, entre ejes estructurales. Niveles referidos a NPT ±0,00.", 1.5, "tnote"));
  ty += 2.8;
  r.push(t(x + 3, ty, "Esquema de anteproyecto generado por el configurador: verificar con ingeniería.", 1.5, "tnote"));
  // Celdas inferiores
  const cy = y + h - 9;
  r.push(`<line x1="${x}" y1="${cy}" x2="${x + w}" y2="${cy}" class="cell"/>`);
  const cells: [string, string][] = [
    ["LÁMINA", "L-01"],
    ["ESCALA", `1:${scale} (A3)`],
    ["FECHA", date],
    ["CONTENIDO", "Planos generales"],
  ];
  const cw = [18, 28, 26, w - 72];
  let cx = x;
  cells.forEach(([k, v], i) => {
    if (i > 0) r.push(`<line x1="${n2(cx)}" y1="${cy}" x2="${n2(cx)}" y2="${y + h}" class="cell"/>`);
    r.push(t(cx + 1.8, cy + 3, k, 1.35, "tnote"));
    r.push(t(cx + 1.8, cy + 7, v, 2.1, "ttitle"));
    cx += cw[i];
  });
  return r.join("\n");
}

/** Documento HTML listo para imprimir / guardar como PDF (A3 apaisado). */
export function drawingSheetHtml(sheet: DrawingSheet, titleText: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titleText)}</title>
<style>@page{size:420mm 297mm;margin:0}html,body{margin:0;padding:0;background:#fff}svg{display:block;width:420mm;height:297mm}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${sheet.svg}</body></html>`;
}
