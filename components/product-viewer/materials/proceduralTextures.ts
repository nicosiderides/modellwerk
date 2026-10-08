import { CanvasTexture, LinearSRGBColorSpace, RepeatWrapping, type Texture } from "three";

/**
 * Mapas normales procedurales (sin descargas) para superficies constructivas.
 * Las UV de los modelos están en METROS, así que `repeat = 1 / período`.
 * Un GLB real puede traer sus propias texturas; la librería de materiales decide.
 */

export type SurfacePattern = "trapezoidal" | "standingSeam" | "sandwichWall" | "sandwichRoof" | "sectionalDoor" | "precast" | "slab" | "smooth";

type HeightFn = (u: number, v: number) => number;

const SIZE = 256;
const cache = new Map<string, Texture>();

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Perfil trapezoidal: plano bajo, flanco, cresta, flanco. */
function trapezoid(x: number, crest = 0.18, flank = 0.08) {
  const p = x - Math.floor(x);
  const up = smoothstep(0.5 - crest / 2 - flank, 0.5 - crest / 2, p);
  const down = 1 - smoothstep(0.5 + crest / 2, 0.5 + crest / 2 + flank, p);
  return Math.min(up, down);
}

function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise(u: number, v: number) {
  const x = Math.floor(u);
  const y = Math.floor(v);
  const fx = u - x;
  const fy = v - y;
  const a = hash(x, y);
  const b = hash(x + 1, y);
  const c = hash(x, y + 1);
  const d = hash(x + 1, y + 1);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

const PATTERNS: Record<SurfacePattern, { height: HeightFn; strength: number; period: [number, number] }> = {
  // período en metros [u, v] que cubre la textura completa
  trapezoidal: { height: (u) => trapezoid(u * 4), strength: 3.2, period: [1.0, 1.0] },
  standingSeam: {
    height: (u) => {
      const p = (u * 2) % 1;
      const d = Math.min(p, 1 - p);
      return 1 - smoothstep(0.012, 0.03, d) + Math.sin(p * Math.PI * 2 * 5) * 0.02;
    },
    strength: 3.5,
    period: [1.0, 1.0],
  },
  sandwichWall: { height: (u, v) => Math.sin(v * Math.PI * 2 * 10) * 0.08 + (Math.abs(v - 0.5) > 0.494 ? -1 : 0), strength: 2.2, period: [1.0, 1.0] },
  sandwichRoof: { height: (u) => trapezoid(u * 3, 0.1, 0.06) * 0.8 + Math.sin(u * Math.PI * 2 * 15) * 0.04, strength: 3.0, period: [1.0, 1.0] },
  sectionalDoor: { height: (u, v) => (Math.abs(((v * 2) % 1) - 0.5) > 0.47 ? -1 : 0) + Math.sin(v * Math.PI * 2 * 8) * 0.06, strength: 2.4, period: [1.0, 1.2] },
  precast: { height: (u, v) => (Math.abs(u - 0.5) > 0.495 ? -1 : 0) + (noise(u * 40, v * 40) - 0.5) * 0.12, strength: 2.0, period: [2.5, 2.5] },
  slab: { height: (u, v) => (Math.abs(u - 0.5) > 0.497 || Math.abs(v - 0.5) > 0.497 ? -1 : 0) + (noise(u * 60, v * 60) - 0.5) * 0.08, strength: 1.4, period: [6, 6] },
  smooth: { height: () => 0, strength: 0, period: [1, 1] },
};

function buildNormalCanvas(pattern: SurfacePattern) {
  const { height, strength } = PATTERNS[pattern];
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(SIZE, SIZE);
  const h = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) h[y * SIZE + x] = height(x / SIZE, y / SIZE);
  }
  const at = (x: number, y: number) => h[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * SIZE + x) * 4;
      image.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      // El canvas tiene Y hacia abajo; las UV de Three, hacia arriba.
      image.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      image.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      image.data[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

/** Normal map con `repeat` ajustado para UV en metros. */
export function surfaceNormalMap(pattern: SurfacePattern, scale = 1): Texture | null {
  if (pattern === "smooth" || typeof document === "undefined") return null;
  let base = cache.get(pattern);
  if (!base) {
    base = new CanvasTexture(buildNormalCanvas(pattern));
    base.colorSpace = LinearSRGBColorSpace;
    base.wrapS = RepeatWrapping;
    base.wrapT = RepeatWrapping;
    base.anisotropy = 4;
    cache.set(pattern, base);
  }
  const texture = base.clone();
  const [pu, pv] = PATTERNS[pattern].period;
  texture.repeat.set(1 / (pu * scale), 1 / (pv * scale));
  texture.needsUpdate = true;
  return texture;
}
