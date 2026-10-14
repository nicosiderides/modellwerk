"use client";

import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  Vector3,
  type Texture,
} from "three";
import { IDECOR_ORTHO_BOUNDS, IDECOR_ORTHO_TILES, blocksInBBox, namedRoadsIn, parcelRingsInBBox } from "@/core/galpones/geo/idecor";
import type { LonLat } from "@/core/galpones/geo/parcel";
import { TILE, levelLonLat, lotTransform, mapLevel, metersPerPx, worldPx, worldPxToLonLat, type MapLevel } from "@/core/galpones/geo/tiles";
import type { LotLocation } from "@/core/galpones/types";
import type { GroundMode } from "../store";

/**
 * Piso de mapa del visor 3D: la foto aérea (o un plano del barrio) alrededor
 * del lote real, en varias capas que se funden entre sí y con el fondo.
 *
 * Todo se arma en coordenadas del lote (x desde el lindero oeste, z desde la
 * línea municipal); el visor sólo corre el grupo al rincón del lote.
 */

export type GroundDetail = "high" | "low";

/** Capas en metros (medio lado del cuadrado alrededor del lote). */
const FAR_HALF = 1150;
const MID_HALF = 480;

const ATTRIBUTION_PHOTO = "Foto aérea: IDECOR · Gobierno de Córdoba (CC BY-SA 4.0)";
const ATTRIBUTION_PLAN = "Plano: catastro IDECOR · Gobierno de Córdoba (CC BY-SA 4.0)";
export const groundAttribution = (mode: GroundMode) => (mode === "photo" ? ATTRIBUTION_PHOTO : mode === "plan" ? ATTRIBUTION_PLAN : "");

/** ¿La foto aérea de IDECOR cubre este punto? (fuera de Córdoba capital no hay). */
export function hasPhoto([lon, lat]: LonLat) {
  const [w, s, e, n] = IDECOR_ORTHO_BOUNDS;
  return lon > w && lon < e && lat > s && lat < n;
}

/* ─────────────────────────── lienzos por capa ─────────────────────────── */

type Layer = {
  level: MapLevel;
  canvas: HTMLCanvasElement;
  /** Escala lienzo / píxel mundial. */
  scale: number;
  listeners: Set<() => void>;
  ready: boolean;
};

function newLayer(level: MapLevel, maxSize: number): Layer {
  const w = level.px[2] - level.px[0];
  const scale = Math.min(1, maxSize / w);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.max(2, Math.round(w * scale));
  return { level, canvas, scale, listeners: new Set(), ready: false };
}

const notify = (layer: Layer) => layer.listeners.forEach((fn) => fn());

/** Centro del rectángulo útil del lote. */
function lotCenter(location: LotLocation): LonLat {
  return lotTransform(location.fit).toLonLat([location.fit.width / 2, location.fit.depth / 2]);
}

const lotRadius = (location: LotLocation) => Math.hypot(location.fit.width, location.fit.depth) / 2;

/* ── Foto aérea ── */

function loadTile(url: string, signal: { cancelled: boolean }) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    if (signal.cancelled) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function tileInBounds(level: MapLevel, x: number, y: number) {
  const [w, s, e, n] = IDECOR_ORTHO_BOUNDS;
  const [lonA, latA] = worldPxToLonLat([x * TILE, y * TILE], level.z);
  const [lonB, latB] = worldPxToLonLat([(x + 1) * TILE, (y + 1) * TILE], level.z);
  return lonB > w && lonA < e && latA > s && latB < n;
}

function paintPhoto(layer: Layer, signal: { cancelled: boolean }) {
  const { level, canvas, scale } = layer;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  const queue = level.tiles.filter((t) => tileInBounds(level, t.x, t.y));
  let pending = queue.length;
  if (!pending) {
    layer.ready = true;
    notify(layer);
    return;
  }
  // Pocas descargas a la vez: el servidor de IDECOR es compartido.
  let next = 0;
  const worker = async () => {
    while (next < queue.length && !signal.cancelled) {
      const t = queue[next++];
      const url = IDECOR_ORTHO_TILES.replace("{z}", String(level.z)).replace("{x}", String(t.x)).replace("{y}", String(t.y));
      const img = await loadTile(url, signal);
      if (signal.cancelled) return;
      if (img) {
        const s = TILE * scale;
        // +0,5 px de solape: sin costuras entre mosaicos.
        ctx.drawImage(img, (t.x * TILE - level.px[0]) * scale - 0.25, (t.y * TILE - level.px[1]) * scale - 0.25, s + 0.5, s + 0.5);
      }
      pending -= 1;
      if (!pending) layer.ready = true;
      notify(layer);
    }
  };
  for (let i = 0; i < 6; i += 1) void worker();
}

/* ── Plano del barrio (dibujo propio con datos de catastro) ── */

type PlanData = { blocks: LonLat[][]; parcels: { ring: LonLat[]; built: boolean }[]; roads: { line: LonLat[]; name: string; kind: string }[] };

function bboxAround(center: LonLat, half: number): [number, number, number, number] {
  const dLat = half / 111320;
  const dLon = half / (111320 * Math.cos((center[1] * Math.PI) / 180));
  return [center[0] - dLon, center[1] - dLat, center[0] + dLon, center[1] + dLat];
}

/** Paleta del plano: manzanas claras sobre calles más oscuras (figura-fondo), en los tonos del visor. */
const PLAN = {
  street: "#c9c4b9",
  block: "#ece9e2",
  built: "#e3dfd6",
  vacant: "#f0ede7",
  parcelLine: "rgba(104, 96, 82, 0.34)",
  blockLine: "rgba(104, 96, 82, 0.55)",
  road: "#bcb6aa",
  roadEdge: "rgba(90, 84, 74, 0.22)",
  label: "rgba(64, 60, 53, 0.78)",
};

function drawPlan(layer: Layer, data: PlanData, detail: "near" | "far") {
  const { level, canvas, scale } = layer;
  const ctx = canvas.getContext("2d")!;
  const mpp = metersPerPx(worldPxToLonLat([(level.px[0] + level.px[2]) / 2, (level.px[1] + level.px[3]) / 2], level.z)[1], level.z) / scale;
  const P = (p: LonLat) => {
    const [x, y] = worldPx(p, level.z);
    return [(x - level.px[0]) * scale, (y - level.px[1]) * scale] as const;
  };
  const path = (ring: LonLat[]) => {
    ctx.beginPath();
    ring.forEach((p, i) => {
      const [x, y] = P(p);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
  };
  ctx.fillStyle = PLAN.street;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Vías principales: banda clara un poco más ancha que la calzada.
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const r of data.roads) {
    const main = /arterial|ruta|autopista/i.test(r.kind) || /RUTA|AUTOPISTA|CIRCUNVALACION/i.test(r.name);
    ctx.beginPath();
    r.line.forEach((p, i) => {
      const [x, y] = P(p);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.strokeStyle = PLAN.roadEdge;
    ctx.lineWidth = (main ? 30 : 20) / mpp;
    ctx.stroke();
    ctx.strokeStyle = PLAN.road;
    ctx.lineWidth = (main ? 26 : 17) / mpp;
    ctx.stroke();
  }

  // Manzanas
  ctx.fillStyle = PLAN.block;
  for (const b of data.blocks) {
    path(b);
    ctx.fill();
  }
  // Parcelas: edificadas un poco más oscuras que los baldíos.
  const lineW = Math.max(0.6, 0.35 / mpp);
  for (const p of data.parcels) {
    path(p.ring);
    ctx.fillStyle = p.built ? PLAN.built : PLAN.vacant;
    ctx.fill();
    ctx.strokeStyle = PLAN.parcelLine;
    ctx.lineWidth = lineW;
    ctx.stroke();
  }
  ctx.strokeStyle = PLAN.blockLine;
  ctx.lineWidth = Math.max(0.8, 0.6 / mpp);
  for (const b of data.blocks) {
    path(b);
    ctx.stroke();
  }

  // Nombres de las vías principales, a lo largo de su tramo más largo.
  const font = getComputedStyle(document.documentElement).getPropertyValue("--mw-font-tech").trim() || "\"JetBrains Mono\", Consolas, monospace";
  const sizeM = detail === "near" ? 5.5 : 11;
  ctx.font = `600 ${Math.max(9, sizeM / mpp)}px ${font}`;
  ctx.fillStyle = PLAN.label;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const named = new Set<string>();
  for (const r of [...data.roads].sort((a, b) => b.line.length - a.line.length)) {
    if (!r.name || named.has(r.name)) continue;
    let best: { a: readonly [number, number]; b: readonly [number, number]; len: number } | null = null;
    for (let i = 0; i + 1 < r.line.length; i += 1) {
      const a = P(r.line[i]);
      const b = P(r.line[i + 1]);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const inside = mid[0] > canvas.width * 0.08 && mid[0] < canvas.width * 0.92 && mid[1] > canvas.height * 0.08 && mid[1] < canvas.height * 0.92;
      if (inside && (!best || len > best.len)) best = { a, b, len };
    }
    const label = r.name.replace(/\s+/g, " ").toUpperCase().split("").join(" ");
    if (!best || best.len < ctx.measureText(label).width * 1.2) continue;
    named.add(r.name);
    let angle = Math.atan2(best.b[1] - best.a[1], best.b[0] - best.a[0]);
    if (angle > Math.PI / 2) angle -= Math.PI;
    if (angle < -Math.PI / 2) angle += Math.PI;
    ctx.save();
    ctx.translate((best.a[0] + best.b[0]) / 2, (best.a[1] + best.b[1]) / 2);
    ctx.rotate(angle);
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
  layer.ready = true;
  notify(layer);
}

/* ─────────────────────────── caché ─────────────────────────── */

type Built = { layers: { layer: Layer; role: "far" | "mid" | "near" }[]; signal: { cancelled: boolean }; users: number };
const cache = new Map<string, Built>();

function getLayers(location: LotLocation, mode: "photo" | "plan", detail: GroundDetail): Built {
  const key = `${location.nomenclatura}|${location.fit.origin.join(",")}|${mode}|${detail}`;
  const hit = cache.get(key);
  if (hit) return hit;
  // Se guardan sólo los dos últimos lotes (cada uno ocupa varios MB).
  for (const [k, v] of cache) if (cache.size >= 2 && v.users === 0) {
    v.signal.cancelled = true;
    cache.delete(k);
  }
  const center = lotCenter(location);
  const near = Math.min(210, Math.max(140, lotRadius(location) + 100));
  const signal = { cancelled: false };
  const max = detail === "high" ? 2048 : 1024;
  let built: Built;
  if (mode === "photo") {
    const layers = [
      { layer: newLayer(mapLevel(center, FAR_HALF, 15), max), role: "far" as const },
      { layer: newLayer(mapLevel(center, MID_HALF, 17), max), role: "mid" as const },
      { layer: newLayer(mapLevel(center, near, detail === "high" ? 19 : 18), max), role: "near" as const },
    ];
    built = { layers, signal, users: 0 };
    // Primero el detalle cercano, después lo lejano.
    [...layers].reverse().forEach(({ layer }) => paintPhoto(layer, signal));
  } else {
    const far = { layer: newLayer(mapLevel(center, FAR_HALF, 17), max), role: "far" as const };
    const nearL = { layer: newLayer(mapLevel(center, near + 60, 19), max), role: "near" as const };
    built = { layers: [far, nearL], signal, users: 0 };
    const ctrl = new AbortController();
    void Promise.all([
      blocksInBBox(bboxAround(center, FAR_HALF), ctrl.signal).catch(() => [] as LonLat[][]),
      parcelRingsInBBox(bboxAround(center, near + 260), ctrl.signal).catch(() => []),
      namedRoadsIn(bboxAround(center, FAR_HALF), ctrl.signal).catch(() => []),
    ]).then(([blocks, parcels, roads]) => {
      if (signal.cancelled) return;
      const data: PlanData = { blocks, parcels, roads };
      drawPlan(far.layer, data, "far");
      drawPlan(nearL.layer, data, "near");
    });
  }
  cache.set(key, built);
  return built;
}

/* ─────────────────────────── malla y material ─────────────────────────── */

/** Máscara de transparencia: se desvanece hacia los bordes (redonda o cuadrada). */
function fadeMask(shape: "round" | "square", inner: number): CanvasTexture {
  const n = 128;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(n, n);
  for (let j = 0; j < n; j += 1)
    for (let i = 0; i < n; i += 1) {
      const u = ((i + 0.5) / n) * 2 - 1;
      const v = ((j + 0.5) / n) * 2 - 1;
      const d = shape === "round" ? Math.hypot(u, v) : Math.max(Math.abs(u), Math.abs(v));
      const k = Math.min(1, Math.max(0, (1 - d) / (1 - inner)));
      const a = Math.round(255 * k * k * (3 - 2 * k));
      const o = (j * n + i) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = a;
      img.data[o + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  return t;
}

/** Malla del recorte (norte arriba) llevada a coordenadas del lote. */
function levelGeometry(level: MapLevel, toLocal: (p: LonLat) => [number, number], y: number) {
  const N = 6;
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  for (let j = 0; j <= N; j += 1)
    for (let i = 0; i <= N; i += 1) {
      const [x, z] = toLocal(levelLonLat(level, i / N, j / N));
      pos.push(x, y, z);
      uv.push(i / N, 1 - j / N);
      nor.push(0, 1, 0);
    }
  // Sentido de los triángulos: que miren hacia arriba.
  const p = (i: number, j: number) => new Vector3(pos[(j * (N + 1) + i) * 3], 0, pos[(j * (N + 1) + i) * 3 + 2]);
  const up = new Vector3().subVectors(p(1, 0), p(0, 0)).cross(new Vector3().subVectors(p(0, 1), p(0, 0))).y > 0;
  const index: number[] = [];
  for (let j = 0; j < N; j += 1)
    for (let i = 0; i < N; i += 1) {
      const a = j * (N + 1) + i;
      const b = a + 1;
      const c = a + N + 1;
      const d = c + 1;
      if (up) index.push(a, b, c, b, d, c);
      else index.push(a, c, b, b, c, d);
    }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

/** Ajuste de color de la foto para que entre en la paleta del visor. */
type Grade = { saturation: number; tint: string; tintAmount: number; lift: number };
const GRADE: Record<"photo" | "plan", Grade> = {
  photo: { saturation: 0.86, tint: "#d6cfbf", tintAmount: 0.07, lift: 0.012 },
  plan: { saturation: 1, tint: "#d9d7d0", tintAmount: 0, lift: 0 },
};

function gradedMaterial(map: Texture, alphaMap: Texture, mode: "photo" | "plan", order: number) {
  const g = GRADE[mode];
  const m = new MeshStandardMaterial({
    map,
    alphaMap,
    transparent: true,
    depthWrite: false,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.6,
    color: new Color(mode === "photo" ? "#dadada" : "#b8b8b8"),
    polygonOffset: true,
    polygonOffsetFactor: 2 + order,
    polygonOffsetUnits: 2 + order,
  });
  m.name = `ground-map:${mode}`;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSat = { value: g.saturation };
    shader.uniforms.uTint = { value: new Color(g.tint) };
    shader.uniforms.uTintAmt = { value: g.tintAmount };
    shader.uniforms.uLift = { value: g.lift };
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", "uniform float uSat;\nuniform vec3 uTint;\nuniform float uTintAmt;\nuniform float uLift;\nvoid main() {")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        {
          float l = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb = mix(vec3(l), diffuseColor.rgb, uSat);
          diffuseColor.rgb = mix(diffuseColor.rgb, uTint, uTintAmt) + uLift;
        }`
      );
  };
  m.customProgramCacheKey = () => `ground-map-${mode}`;
  return m;
}

/** Contorno del lote real (cinta dorada sobre el mapa; queda debajo del lote del configurador). */
function parcelOutline(ring: [number, number][], width = 0.4) {
  const pos: number[] = [];
  const index: number[] = [];
  const n = ring.length;
  for (let i = 0; i < n; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * (width / 2);
    const nz = (dx / len) * (width / 2);
    // Se estira medio ancho en cada punta para cerrar las esquinas.
    const ex = (dx / len) * (width / 2);
    const ez = (dz / len) * (width / 2);
    const k = pos.length / 3;
    pos.push(a[0] - ex + nx, 0, a[1] - ez + nz, a[0] - ex - nx, 0, a[1] - ez - nz, b[0] + ex + nx, 0, b[1] + ez + nz, b[0] + ex - nx, 0, b[1] + ez - nz);
    index.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(index);
  g.computeVertexNormals();
  const m = new MeshStandardMaterial({ color: "#c9a227", roughness: 0.6, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  m.name = "ground-map:parcel";
  const mesh = new Mesh(g, m);
  mesh.name = "ground-map:parcel-outline";
  mesh.position.y = -0.035;
  mesh.receiveShadow = true;
  return mesh;
}

export type GroundBackdrop = { root: Group; dispose: () => void };

/**
 * Arma el piso de mapa para un lote. `onChange` avisa cada vez que llega una
 * parte de la imagen (el visor dibuja a demanda).
 */
export function createGroundBackdrop(location: LotLocation, mode: "photo" | "plan", opts: { detail: GroundDetail; anisotropy?: number; onChange: () => void }): GroundBackdrop {
  const built = getLayers(location, mode, opts.detail);
  built.users += 1;
  const { toLocal } = lotTransform(location.fit);
  const root = new Group();
  root.name = "MW_GROUND_MAP";
  const textures: Texture[] = [];
  const unsubscribe: (() => void)[] = [];
  let frame = 0;
  const masks = { far: fadeMask("round", 0.5), mid: fadeMask("square", 0.72), near: fadeMask("square", 0.6) };
  textures.push(masks.far, masks.mid, masks.near);

  built.layers.forEach(({ layer, role }, order) => {
    const tex = new CanvasTexture(layer.canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = opts.anisotropy ?? 8;
    tex.minFilter = LinearMipmapLinearFilter;
    textures.push(tex);
    const mesh = new Mesh(levelGeometry(layer.level, toLocal, -0.07 + order * 0.008), gradedMaterial(tex, masks[role], mode, built.layers.length - order));
    mesh.name = `ground-map:${role}`;
    mesh.receiveShadow = true;
    mesh.renderOrder = -10 + order;
    root.add(mesh);
    const update = () => {
      tex.needsUpdate = true;
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          opts.onChange();
        });
    };
    layer.listeners.add(update);
    unsubscribe.push(() => layer.listeners.delete(update));
    // Lo que ya estaba dibujado (caché)
    update();
  });

  if (location.ring.length > 2) root.add(parcelOutline(location.ring.map((p) => toLocal(p))));

  return {
    root,
    dispose: () => {
      if (frame) cancelAnimationFrame(frame);
      unsubscribe.forEach((fn) => fn());
      built.users -= 1;
      root.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        (mesh.material as MeshStandardMaterial).dispose();
      });
      textures.forEach((t) => t.dispose());
    },
  };
}
