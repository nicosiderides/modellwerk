import { ridgeHeight } from "./configuration.ts";
import { EAVE_OVERHANG, columnDepth, rafterDepth, trussEndDepth } from "./geometry-rules.ts";
import type { WarehouseConfig, WarehouseDefinition } from "./types.ts";

/**
 * Replanteo del galpón: todas las medidas y posiciones que comparten el
 * modelo 3D (geometry.ts) y los planos 2D (drawings.ts). Si algo se mueve
 * acá, se mueve en los dos lados a la vez.
 *
 * Ejes: X = ancho (luz; eje A al oeste, eje B al este), Y = vertical,
 * Z = largo (frente en −Z, contrafrente en +Z). Piso en Y = 0. Metros.
 */

/** Reparte `count` aberturas en módulos interiores, evitando los excluidos. */
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

export const PURLIN_H = 0.2;

export function warehouseLayout(config: WarehouseConfig, definition: WarehouseDefinition) {
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
  const roofT = Math.max(0.03, roofOption.thicknessMm / 1000);
  const wallT = Math.max(0.03, wallOption.thicknessMm / 1000);
  const precast = wallOption.finish === "precastSheet";
  const baseH = precast ? env.precastBaseHeight : 0;

  const latticeColumns = config.structure === "truss";
  const trussRafters = config.structure === "truss" || config.structure === "mixed";
  const colD = latticeColumns ? Math.max(0.6, columnDepth(W, eave) + 0.2) : columnDepth(W, eave);
  const flange = Math.min(0.32, 0.16 + colD * 0.18);
  const rd = rafterDepth(W);

  const roofSurface = (x: number) => eave + (half - Math.abs(x)) * S;
  const topSteel = (x: number) => roofSurface(x) - roofT - PURLIN_H;
  const endDepth = trussEndDepth(W);
  const bottomChordY = topSteel(half) - endDepth;
  const wallX = half + colD / 2 + 0.18;
  const gableZ = L / 2 + flange / 2 + 0.18;
  /** Altura libre bajo la estructura junto a la columna. */
  const clearHeight = trussRafters ? bottomChordY : topSteel(half) - rd * 2;

  /* aberturas (snap points) */
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
  const personW = specs.personDoor.width;
  const personH = specs.personDoor.height;
  /** Centro (Z) de cada puerta peatonal del lateral oeste. */
  const personDoorZ = personDoorBays.map((bay) => frameZ[bay] + 1.0 + personW / 2);
  const bayCenter = (bay: number) => (frameZ[bay] + frameZ[bay + 1]) / 2;

  /* columnas de testero (se saltean donde hay portón) */
  const postCount = Math.max(1, Math.round(W / 6));
  const gablePosts = (doors: number[]) => {
    const xs: number[] = [];
    for (let k = 1; k < postCount; k += 1) {
      const x = -half + (k * W) / postCount;
      if (!doors.some((dx) => Math.abs(x - dx) < doorW / 2 + 0.25)) xs.push(x);
    }
    return xs;
  };

  /* lucernarios: módulos impares, salvo el último */
  const skylightsOn = Boolean(config.options.skylights);
  const isSkylight = (bay: number) => skylightsOn && bay % 2 === 1 && bay < n - 1;
  const halfSlope = Math.hypot(half, ridge - eave);
  const sheetLen = halfSlope + EAVE_OVERHANG + 0.05;
  /** Faja del lucernario sobre el faldón, medida en planta desde el eje (|x|). */
  const skylightBand = (() => {
    const along = (t: number) => -EAVE_OVERHANG + t * sheetLen;
    return { xOuter: half - along(0.38) * Math.cos(angle), xInner: half - along(0.62) * Math.cos(angle) };
  })();

  /* marquesina sobre el frente */
  const canopy = config.options.canopy
    ? (() => {
        const cw = Math.min(W * 0.62, Math.max(8, doorW * Math.max(1, frontDoors.length) + 4));
        const depth = 4;
        const hc = Math.min((frontDoors.length ? doorH : 4) + 0.7, eave - 0.3);
        return { width: cw, depth, height: hc, zWall: -gableZ - 0.05 };
      })()
    : null;

  /* puente grúa (representación) */
  const crane = config.options.crane
    ? (() => {
        const railY = clearHeight - 1.4;
        const railX = half - colD / 2 - 0.35;
        return { railY, railX, bridgeZ: frameZ[Math.max(1, Math.floor(n / 3))] + d.baySpacing / 2 };
      })()
    : null;

  return {
    W, L, half, S, angle, eave, ridge, n, frameZ, baySpacing: d.baySpacing, roofSlope: d.roofSlope,
    roofOption, wallOption, roofT, wallT, precast, baseH,
    latticeColumns, trussRafters, colD, flange, rd, roofSurface, topSteel, endDepth, bottomChordY, wallX, gableZ, clearHeight,
    doorW, doorH, frontDoors, backDoors, sideDoorBays, personDoorBays, personDoorZ, personW, personH,
    windowBaysEast, windowBaysWest, winW, winH, winV0, bayCenter,
    postCount, gablePosts, skylightsOn, isSkylight, halfSlope, sheetLen, skylightBand, canopy, crane,
  };
}

export type WarehouseLayout = ReturnType<typeof warehouseLayout>;
