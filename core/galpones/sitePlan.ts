import { warehouseLayout, type WarehouseLayout } from "./layout.ts";
import { MANEUVER_FACTOR, normalizeLot, sideSetbacks, vehicleById } from "./lotRules.ts";
import { normalizeSite } from "./siteConfig.ts";
import type { LotConfig, SiteConfig, WarehouseConfig, WarehouseDefinition } from "./types.ts";

/**
 * Planta del entorno (pura, sin 3D): lote, retiros, veredas, playones,
 * estacionamiento, ingresos, calle y posición de los vehículos.
 *
 * La usan el modelo 3D del entorno (site.ts) y la verificación de normativa
 * y logística (siteCheck.ts), así lo que se ve es lo que se verifica.
 * Coordenadas del galpón: frente (portones) en −Z, oeste en −X. Metros.
 */

export type Rect = { x0: number; x1: number; z0: number; z1: number };
export const rect = (x0: number, x1: number, z0: number, z1: number): Rect => ({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) });
export const area = (r: Rect) => (r.x1 - r.x0) * (r.z1 - r.z0);
const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));
const inside = (x: number, z: number, r: Rect, pad = 0) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;
const ceilTo = (v: number, step: number) => Math.ceil(v / step - 1e-9) * step;

/** Tramos de [a, b] que quedan fuera de los huecos. */
export function segments(a: number, b: number, gaps: [number, number][]) {
  const out: [number, number][] = [];
  let cur = a;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g1 <= cur || g0 >= b) continue;
    if (g0 > cur) out.push([cur, g0]);
    cur = Math.max(cur, g1);
  }
  if (cur < b) out.push([cur, b]);
  return out;
}

/* ─────────────────────────── estacionamiento ─────────────────────────── */

export const STALL_W = 2.5;
export const STALL_D = 5;
export const AISLE = 6.5;
export const ISLAND = 1.6;

type V2 = [number, number];
export type Stall = { x: number; z: number; head: V2; accessible: boolean };
export type ParkingRow = { v0: number; head: 1 | -1; u0: number; u1: number };
export type ParkingLot = {
  side: "west" | "back";
  origin: V2;
  along: V2;
  out: V2;
  length: number;
  depth: number;
  rect: Rect;
  rows: ParkingRow[];
  aisles: [number, number][];
  stalls: Stall[];
  requested: number;
};

/** Profundidad de un estacionamiento de `rows` filas (fila + pasillo + fila + isla…). */
export function parkingDepth(rows: number) {
  let v = 0;
  for (let i = 0; i < rows; i += 1) {
    if (i % 2 === 0) v += (i > 0 ? ISLAND : 0) + STALL_D + AISLE;
    else v += STALL_D;
  }
  return v;
}

function layoutParking(side: "west" | "back", origin: V2, along: V2, out: V2, length: number, requested: number, maxDepth = Infinity): ParkingLot | null {
  const perRow = Math.max(1, Math.floor(Math.max(STALL_W, length - 2) / STALL_W));
  let rowsCount = Math.min(6, Math.ceil(requested / perRow));
  while (rowsCount > 0 && parkingDepth(rowsCount) > maxDepth) rowsCount -= 1;
  if (rowsCount === 0) return null;
  const rows: ParkingRow[] = [];
  const aisles: [number, number][] = [];
  let v = 0;
  for (let i = 0; i < rowsCount; i += 1) {
    if (i % 2 === 0) {
      if (i > 0) v += ISLAND;
      rows.push({ v0: v, head: -1, u0: 0, u1: 0 });
      v += STALL_D;
      aisles.push([v, v + AISLE]);
      v += AISLE;
    } else {
      rows.push({ v0: v, head: 1, u0: 0, u1: 0 });
      v += STALL_D;
    }
  }
  const stalls: Stall[] = [];
  let remaining = Math.min(requested, perRow * rowsCount);
  rows.forEach((row, ri) => {
    const count = Math.min(perRow, remaining);
    remaining -= count;
    const start = (length - count * STALL_W) / 2;
    row.u0 = start;
    row.u1 = start + count * STALL_W;
    for (let k = 0; k < count; k += 1) {
      const u = start + (k + 0.5) * STALL_W;
      const vc = row.v0 + STALL_D / 2;
      stalls.push({
        x: origin[0] + along[0] * u + out[0] * vc,
        z: origin[1] + along[1] * u + out[1] * vc,
        head: [out[0] * row.head, out[1] * row.head],
        accessible: ri === 0 && k === 0 && requested >= 10,
      });
    }
  });
  const end: V2 = [origin[0] + along[0] * length + out[0] * v, origin[1] + along[1] * length + out[1] * v];
  return { side, origin, along, out, length, depth: v, rect: rect(origin[0], end[0], origin[1], end[1]), rows, aisles, stalls, requested };
}

/* ─────────────────────────────── plan ─────────────────────────────── */

export type Placement = { x: number; z: number; rotation: number };

export type SitePlan = {
  lay: WarehouseLayout;
  site: SiteConfig;
  lot: LotConfig;
  /** Huella del galpón (caras exteriores de muros). */
  footprint: Rect;
  canopy: Rect | null;
  ox: number;
  oz: number;
  ex: number;
  ez: number;
  doors: { front: number[]; back: number[]; side: number[] };
  /** Lote en coordenadas del galpón (null si la implantación está apagada). */
  lotRect: Rect | null;
  /** Distancias libres del galpón a cada lindero (m). */
  clear: { front: number; back: number; west: number; east: number } | null;
  /** Rango en que puede ubicarse el galpón dentro del lote propio (distancia a la línea municipal y al lindero oeste). */
  placementRange: { front: [number, number]; left: [number, number] } | null;
  /** Retiro lateral exigido a cada lado (con retiro en un solo lateral, uno es 0). */
  sideSetback: { west: number; east: number; count: 0 | 1 | 2 };
  /** Línea de edificación (retiros) si la normativa los define. */
  buildable: Rect | null;
  sidewalks: { rect: Rect; edge: "x0" | "x1" | "z0" | "z1" }[];
  aprons: Rect[];
  yards: Rect[];
  driveways: Rect[];
  parking: ParkingLot | null;
  /** Portones del cerco sobre la línea municipal / calle lateral. */
  gates: Rect[];
  road: { main: Rect; side: Rect | null; publicWalk: Rect[]; centerZ: number; sideCenterX: number | null } | null;
  grass: Rect | null;
  trees: V2[];
  poles: { x: number; z: number; dir: V2 }[];
  vehicles: { semi: Placement | null; box: Placement | null; forklift: Placement | null };
  /** Largo del vehículo de diseño y profundidad de maniobra pedida. */
  design: { length: number; maneuver: number };
};

const SEMI_REAR = 9.39;
const BOX_REAR = 4.79;

export function planSite(config: WarehouseConfig, definition: WarehouseDefinition): SitePlan {
  const lay = warehouseLayout(config, definition);
  const site = normalizeSite(config.site);
  const lot = normalizeLot(config.lot);
  const rules = lot.rules;
  const vehicle = vehicleById(lot.vehicle);
  const VL = vehicle.length;
  const maneuver = VL * MANEUVER_FACTOR;

  const ox = lay.wallX + (lay.precast ? 0.06 : 0);
  const oz = lay.gableZ + lay.wallT + (lay.precast ? 0.06 : 0);
  const sw = site.sidewalk;
  const ex = ox + sw;
  const ez = oz + sw;
  const footprint = rect(-ox, ox, -oz, oz);
  const canopy = lay.canopy ? rect(-(lay.canopy.width + 0.3) / 2, (lay.canopy.width + 0.3) / 2, lay.canopy.zWall - lay.canopy.depth - 0.2, -oz) : null;
  const front = lay.frontDoors;
  const back = lay.backDoors;
  const side = lay.sideDoorBays.map((b) => lay.bayCenter(b));
  const gapW = lay.doorW + 0.6;
  const parkingOn = site.parking > 0;
  const westP = parkingOn && site.parkingSide === "west";
  const backP = parkingOn && site.parkingSide === "back";
  const wantFrontYard = site.truckYard && (front.length > 0 || (side.length === 0 && back.length === 0));
  const truckDepth = (doors: number) => (doors > 0 ? (site.truckYard ? maneuver : VL + 1) : 0);

  /* ── Lote: mínimo que cumple (auto) o medidas propias (manual) ── */
  let lotRect: Rect | null = null;
  let clear: SitePlan["clear"] = null;
  let placementRange: SitePlan["placementRange"] = null;
  let sideSetback: SitePlan["sideSetback"] = sideSetbacks(rules);
  if (lot.enabled) {
    // Lo que necesita cada lado del galpón: retiro, playón de camiones, estacionamiento.
    const reqParkingDepth = parkingOn ? parkingDepth(Math.min(6, Math.ceil(site.parking / Math.max(1, Math.floor(((westP ? 2 * ez : 2 * ex) - 2) / STALL_W))))) : 0;
    const canopyReach = canopy ? -oz - canopy.z0 : 0;
    const F = Math.max(rules.setbackFront ?? 0, truckDepth(front.length), canopy ? canopyReach + 2 : 0, sw + 3);
    const westNeed = Math.max(westP ? sw + reqParkingDepth + 1 : 0, backP ? sw + AISLE + 1 : 0);
    const eastNeed = truckDepth(side.length);
    sideSetback = sideSetbacks(rules, westNeed, eastNeed);
    const W = Math.max(sideSetback.west, westNeed, sw + 1.5);
    const E = Math.max(sideSetback.east, eastNeed, sw + 1.5);
    const B = Math.max(rules.setbackBack ?? 0, truckDepth(back.length) + (backP ? reqParkingDepth : 0), backP ? sw + reqParkingDepth + 1 : 0, sw + 1.5);
    if (lot.mode === "auto") {
      let width = ceilTo(W + 2 * ox + E, 0.5);
      if (rules.minFront) width = Math.max(width, rules.minFront);
      let depth = ceilTo(F + 2 * oz + B, 0.5);
      const covered = area(footprint) + (canopy ? area(canopy) : 0);
      const minArea = Math.max(rules.minArea ?? 0, rules.fos ? covered / rules.fos : 0, rules.fot ? covered / rules.fot : 0);
      if (width * depth < minArea) depth = ceilTo(minArea / width, 0.5);
      lotRect = rect(-ox - W, -ox - W + width, -oz - F, -oz - F + depth);
    } else {
      // Lote propio: el galpón siempre queda dentro, fuera de los retiros y
      // separado del alambrado (vereda + 0,5 m, o la marquesina al frente).
      const minWest = Math.max(sideSetback.west, sw + 0.5);
      const minEast = Math.max(sideSetback.east, sw + 0.5);
      const minFront = Math.max(rules.setbackFront ?? 0, sw + 0.5, canopy ? canopyReach + 0.5 : 0);
      const minBack = Math.max(rules.setbackBack ?? 0, sw + 0.5);
      const spanX = lot.width - 2 * ox;
      const spanZ = lot.depth - 2 * oz;
      const range = (lo: number, hi: number): [number, number] => (hi >= lo ? [lo, hi] : [Math.max(0, (lo + hi) / 2), Math.max(0, (lo + hi) / 2)]);
      const leftR = range(minWest, spanX - minEast);
      const frontR = range(minFront, spanZ - minBack);
      placementRange = { front: frontR, left: leftR };
      const clampTo = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));
      // Reparte el espacio que sobra: primero lo que necesita cada lado (playón,
      // estacionamiento), y lo que queda, mitad y mitad (o hacia el fondo).
      const share = (lo: number, hi: number, needA: number, needB: number, minA: number, minB: number, rest: number) => {
        const free = hi - lo;
        const a = Math.max(0, needA - minA);
        const b = Math.max(0, needB - minB);
        if (free <= 0) return lo;
        if (a + b >= free) return lo + (a + b > 0 ? (free * a) / (a + b) : free / 2);
        return lo + a + (free - a - b) * rest;
      };
      const autoLeft = share(leftR[0], leftR[1], W, E, minWest, minEast, 0.5);
      const autoFront = share(frontR[0], frontR[1], F, B, minFront, minBack, 0);
      const left = lot.placement === "manual" ? clampTo(lot.left, leftR) : autoLeft;
      const frontDist = lot.placement === "manual" ? clampTo(lot.front, frontR) : autoFront;
      const x0 = -ox - left;
      const z0 = -oz - frontDist;
      lotRect = rect(x0, x0 + lot.width, z0, z0 + lot.depth);
    }
    clear = { front: -oz - lotRect.z0, back: lotRect.z1 - oz, west: -ox - lotRect.x0, east: lotRect.x1 - ox };
  }
  const L = lotRect;
  const buildable =
    L && (rules.setbackFront !== null || rules.setbackSide !== null || rules.setbackBack !== null)
      ? rect(L.x0 + sideSetback.west, L.x1 - sideSetback.east, L.z0 + (rules.setbackFront ?? 0), L.z1 - (rules.setbackBack ?? 0))
      : null;

  /* ── Veredas perimetrales del galpón ── */
  const sidewalks: SitePlan["sidewalks"] = [];
  if (sw > 0) {
    sidewalks.push({ rect: rect(-ex, -ox, -oz, oz), edge: "x0" });
    for (const [a, b] of segments(-oz, oz, side.map((z) => [z - gapW / 2, z + gapW / 2]))) sidewalks.push({ rect: rect(ox, ex, a, b), edge: "x1" });
    for (const [a, b] of segments(-ex, ex, front.map((x) => [x - gapW / 2, x + gapW / 2]))) sidewalks.push({ rect: rect(a, b, -ez, -oz), edge: "z0" });
    for (const [a, b] of segments(-ex, ex, back.map((x) => [x - gapW / 2, x + gapW / 2]))) sidewalks.push({ rect: rect(a, b, oz, ez), edge: "z1" });
  }

  /* ── Estacionamiento ── */
  let parking: ParkingLot | null = null;
  if (westP) {
    const maxDepth = L ? -ex - (L.x0 + 1) : Infinity;
    parking = layoutParking("west", [-ex, -ez], [0, 1], [-1, 0], 2 * ez, site.parking, maxDepth);
  } else if (backP) {
    const backYard = back.length && site.truckYard ? maneuver : 0;
    const maxDepth = L ? L.z1 - 1 - ez - backYard : Infinity;
    parking = layoutParking("back", [-ex, ez], [1, 0], [0, 1], 2 * ex, site.parking, maxDepth);
  }
  const pDepth = parking?.depth ?? 0;

  /* ── Playones ── */
  const yards: Rect[] = [];
  const freeFront = L ? -ez - L.z0 : maneuver;
  const freeEast = L ? L.x1 - 1 - ex : Math.min(maneuver, 24);
  if (wantFrontYard && freeFront > 3) {
    const x0 = L ? L.x0 + 1 : westP ? -ex - pDepth : -ex - 4;
    const x1 = L ? L.x1 - 1 : side.length ? ex + Math.min(maneuver, 24) : ex + 4;
    yards.push(rect(x0, x1, -ez - freeFront, -ez));
  }
  if (site.truckYard && side.length && freeEast > 4) yards.push(rect(ex, ex + freeEast, -ez, L ? Math.min(L.z1 - 1, ez + (back.length ? 18 : 0)) : ez + (back.length ? 18 : 0)));
  if (site.truckYard && back.length) {
    const z0 = ez + (backP ? pDepth : 0);
    const z1 = L ? L.z1 - 1 : z0 + Math.min(maneuver, 24);
    if (z1 - z0 > 4) yards.push(rect(-ex, side.length && site.truckYard ? ex + Math.max(0, freeEast) : ex, z0, z1));
  }
  const aprons: Rect[] = [];
  const reach = site.truckYard ? 0 : 3;
  for (const x of front) aprons.push(rect(x - gapW / 2, x + gapW / 2, -ez - reach, -oz));
  for (const x of back) aprons.push(rect(x - gapW / 2, x + gapW / 2, oz, ez + reach));
  for (const z of side) aprons.push(rect(ox, ex + reach, z - gapW / 2, z + gapW / 2));

  // Camino al estacionamiento del contrafrente (por el lateral oeste)
  const driveways: Rect[] = [];
  if (parking && parking.side === "back") {
    const roomWest = L ? -ex - (L.x0 + 1) : AISLE + 2;
    const startZ = wantFrontYard && yards.length ? -ez : L ? L.z0 : -ez - 6;
    if (roomWest >= AISLE) driveways.push(rect(-ex - AISLE, -ex, startZ, ez + Math.min(pDepth, AISLE)));
  }

  /* ── Ingresos, calle, césped ── */
  const paved = [...yards, ...aprons, ...driveways, ...(parking ? [parking.rect] : [])];
  const bbox = [footprint, ...(canopy ? [canopy] : []), ...paved, ...sidewalks.map((s) => s.rect)].reduce((a, r) => rect(Math.min(a.x0, r.x0), Math.max(a.x1, r.x1), Math.min(a.z0, r.z0), Math.max(a.z1, r.z1)));
  const frontYard = yards.find((y) => y.z1 <= -ez + 0.01) ?? null;
  const gates: Rect[] = [];
  let road: SitePlan["road"] = null;
  let grass: Rect | null = null;
  const lineZ = L ? L.z0 : bbox.z0 - 5;
  const cornerGap = rules.accessFromCorner ?? 0;
  const truckGateW = 12;
  if (L || site.landscape) {
    // Portón de camiones alineado con los portones del frente (lejos de la esquina)
    const lo = (L ? L.x0 : bbox.x0 - 8) + truckGateW / 2 + 0.5 + (L && lot.corner === "west" ? cornerGap : 0);
    const hi = (L ? L.x1 : bbox.x1 + 8) - truckGateW / 2 - 0.5 - (L && lot.corner === "east" ? cornerGap : 0);
    const doorsMid = front.length ? (Math.min(...front) + Math.max(...front)) / 2 : 0;
    const cx = Math.min(hi, Math.max(lo, doorsMid));
    if (frontYard || front.length || !parking) gates.push(rect(cx - truckGateW / 2, cx + truckGateW / 2, lineZ - 3, frontYard ? frontYard.z0 : -ez));
    // Ingreso de autos al estacionamiento oeste cuando no hay playón al frente
    if (parking && parking.side === "west" && !frontYard) gates.push(rect(parking.rect.x0, parking.rect.x1, lineZ - 3, parking.rect.z0));
    if (parking && parking.side === "back" && driveways.length && !frontYard) gates.push(rect(driveways[0].x0, driveways[0].x1, lineZ - 3, driveways[0].z0));
    const mainX0 = (L ? L.x0 : bbox.x0) - 70;
    const mainX1 = (L ? L.x1 : bbox.x1) + 70;
    const walkW = 3;
    const main = rect(mainX0, mainX1, lineZ - walkW - 9, lineZ - walkW);
    let sideRoad: Rect | null = null;
    let sideCenterX: number | null = null;
    const publicWalk = [rect(mainX0, mainX1, lineZ - walkW, lineZ), rect(mainX0, mainX1, main.z0 - 3, main.z0)];
    if (L && lot.corner !== "none") {
      const xs = lot.corner === "east" ? L.x1 + walkW : L.x0 - walkW - 9;
      sideRoad = rect(xs, xs + 9, main.z1, L.z1 + 70);
      sideCenterX = xs + 4.5;
      publicWalk.push(lot.corner === "east" ? rect(L.x1, L.x1 + walkW, lineZ, L.z1 + 70) : rect(L.x0 - walkW, L.x0, lineZ, L.z1 + 70));
    }
    road = { main, side: sideRoad, publicWalk, centerZ: (main.z0 + main.z1) / 2, sideCenterX };
    grass = L ?? (site.landscape ? rect(bbox.x0 - 8, bbox.x1 + 8, lineZ, bbox.z1 + 10) : null);
  }

  /* ── Árboles y luminarias ── */
  const trees: V2[] = [];
  const blocked = (x: number, z: number) => [...paved, footprint, ...(canopy ? [canopy] : []), ...sidewalks.map((s) => s.rect), ...gates].some((r) => inside(x, z, r, 1.6));
  if (site.landscape && road) {
    for (let x = road.main.x0 + 30; x < road.main.x1 - 30; x += 9) if (!gates.some((g) => x > g.x0 - 2 && x < g.x1 + 2)) trees.push([x, lineZ - 1.6]);
    const g = grass!;
    // Borde interior del lote / del parquizado
    for (let x = g.x0 + 2; x < g.x1 - 1; x += 8) if (!blocked(x, g.z0 + 2)) trees.push([x, g.z0 + 2]);
    for (let x = g.x0 + 3; x < g.x1 - 1; x += 9) if (!blocked(x, g.z1 - 2.5)) trees.push([x, g.z1 - 2.5]);
    for (let z = g.z0 + 8; z < g.z1 - 4; z += 9) {
      if (!blocked(g.x0 + 2.2, z)) trees.push([g.x0 + 2.2, z]);
      if (!blocked(g.x1 - 2.2, z)) trees.push([g.x1 - 2.2, z]);
    }
    if (parking) {
      const p = parking.rect;
      if (parking.side === "west") for (let z = p.z0 + 4; z < p.z1 - 2; z += 7.5) if (!L || p.x0 - 2.2 > L.x0 + 0.8) trees.push([p.x0 - 2.2, z]);
      if (parking.side === "back") for (let x = p.x0 + 4; x < p.x1 - 2; x += 7.5) if (!L || p.z1 + 2.2 < L.z1 - 0.8) trees.push([x, p.z1 + 2.2]);
    }
  }
  const poles: SitePlan["poles"] = [];
  if (parking) {
    const p = parking.rect;
    if (parking.side === "west") for (let z = p.z0 + 8; z < p.z1; z += 22) poles.push({ x: p.x0 + 0.6, z, dir: [1, 0] });
    else for (let x = p.x0 + 8; x < p.x1; x += 22) poles.push({ x, z: p.z1 - 0.6, dir: [0, -1] });
  }

  /* ── Vehículos ── */
  const semi: Placement | null = front.length ? { x: front[Math.floor(front.length / 2)], z: -oz - 0.9 - SEMI_REAR, rotation: Math.PI } : { x: 0, z: -ez - 14, rotation: Math.PI / 2 };
  let box: Placement | null = null;
  if (side.length) box = { x: ox + 0.9 + BOX_REAR, z: side[side.length - 1], rotation: Math.PI / 2 };
  else if (back.length) box = { x: back[0], z: oz + 0.9 + BOX_REAR, rotation: 0 };
  else if (front.length > 1) box = { x: front[0], z: -oz - 0.9 - BOX_REAR, rotation: Math.PI };
  const fx = front.length > 1 ? front[front.length - 1] : (front[0] ?? 0) + lay.doorW;
  const forklift: Placement = { x: fx + 1.2, z: -ez - 5.5, rotation: Math.PI * 0.82 };

  void overlap;
  return {
    lay, site, lot, footprint, canopy, ox, oz, ex, ez,
    doors: { front, back, side },
    lotRect: L, clear, placementRange, sideSetback, buildable, sidewalks, aprons, yards, driveways, parking, gates, road, grass, trees, poles,
    vehicles: { semi, box, forklift },
    design: { length: VL, maneuver },
  };
}

/** Superficie pavimentada dentro del lote (playones, rampas, estacionamiento, veredas). */
export function pavedAreaInLot(plan: SitePlan) {
  if (!plan.lotRect) return 0;
  const L = plan.lotRect;
  const parts = [...plan.yards, ...plan.aprons, ...plan.driveways, ...(plan.parking ? [plan.parking.rect] : []), ...plan.sidewalks.map((s) => s.rect)];
  // Suma por partes (los rectángulos casi no se pisan; las rampas sí con el playón)
  let total = 0;
  parts.forEach((r, i) => {
    const own = overlap(r, L);
    const dup = parts.slice(0, i).reduce((acc, q) => acc + overlap(r, q), 0);
    total += Math.max(0, own - dup);
  });
  return total;
}
