import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type Material,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { surfaceNormalMap } from "../../components/product-viewer/materials/proceduralTextures.ts";
import { STALL_D, STALL_W, planSite, segments, type Rect, type SitePlan } from "./sitePlan.ts";
import type { WarehouseConfig, WarehouseDefinition } from "./types.ts";
import { CAR_COLORS, buildBoxTruck, buildCar, buildForklift, buildSemiTruck, createVehicleMaterials, instanceVehicles, type CarKind, type Placement } from "./vehicles.ts";

/**
 * Entorno del galpón: veredas con cordón, playón de maniobras, estacionamiento
 * demarcado, calle de acceso, césped, árboles, luminarias y vehículos.
 *
 * Se arma en las mismas coordenadas del modelo (layout.ts): frente en −Z,
 * lateral oeste en −X. No es parte del modelo BIM: no se selecciona ni se
 * explota, y no entra en el encuadre de cámara.
 */

export type SiteBuild = { root: Group; box: Box3 };

const Y = {
  grass: -0.012,
  asphalt: 0.004,
  concrete: 0.008,
  paint: 0.014,
  walk: 0.12,
};

const rect = (x0: number, x1: number, z0: number, z1: number): Rect => ({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) });

/** Pseudoaleatorio estable (misma configuración → mismo entorno). */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Plano horizontal con UV en metros (para las juntas del hormigón). */
function plane(r: Rect, y: number) {
  const g = new PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0);
  g.rotateX(-Math.PI / 2);
  g.translate((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
  const pos = g.getAttribute("position");
  const uv = g.getAttribute("uv");
  for (let i = 0; i < pos.count; i += 1) uv.setXY(i, pos.getX(i), pos.getZ(i));
  return g;
}

function slab(r: Rect, y0: number, y1: number) {
  const g = new BoxGeometry(r.x1 - r.x0, y1 - y0, r.z1 - r.z0);
  g.translate((r.x0 + r.x1) / 2, (y0 + y1) / 2, (r.z0 + r.z1) / 2);
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const uv = g.getAttribute("uv");
  for (let i = 0; i < pos.count; i += 1) {
    if (Math.abs(nor.getY(i)) > 0.5) uv.setXY(i, pos.getX(i), pos.getZ(i));
    else if (Math.abs(nor.getX(i)) > 0.5) uv.setXY(i, pos.getZ(i), pos.getY(i));
    else uv.setXY(i, pos.getX(i), pos.getY(i));
  }
  return g;
}

class Bin {
  readonly list: BufferGeometry[] = [];
  add(g: BufferGeometry) {
    const plain = g.index ? g.toNonIndexed() : g;
    plain.clearGroups();
    this.list.push(plain);
  }
  mesh(material: Material, name: string, shadows: { cast: boolean; receive: boolean } = { cast: false, receive: true }) {
    if (!this.list.length) return null;
    const merged = mergeGeometries(this.list, false);
    this.list.forEach((g) => g.dispose());
    if (!merged) return null;
    merged.computeBoundingSphere();
    const mesh = new Mesh(merged, material);
    mesh.name = name;
    mesh.castShadow = shadows.cast;
    mesh.receiveShadow = shadows.receive;
    return mesh;
  }
}

function siteMaterials() {
  const concreteMap = surfaceNormalMap("slab");
  const walkMap = surfaceNormalMap("slab", 0.25);
  const paint = (color: string) => new MeshStandardMaterial({ color, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  return {
    concrete: new MeshStandardMaterial({ color: "#b9b8b2", roughness: 0.92, normalMap: concreteMap, name: "site:concrete" }),
    walk: new MeshStandardMaterial({ color: "#d3d0c8", roughness: 0.9, normalMap: walkMap, name: "site:walk" }),
    curb: new MeshStandardMaterial({ color: "#bdb9b0", roughness: 0.85, name: "site:curb" }),
    asphalt: new MeshStandardMaterial({ color: "#4a4c4f", roughness: 0.96, metalness: 0, name: "site:asphalt" }),
    grass: new MeshStandardMaterial({ color: "#8d9a70", roughness: 1, name: "site:grass" }),
    white: paint("#eeeeea"),
    yellow: paint("#d8a520"),
    blue: paint("#2f5f9e"),
    stop: new MeshStandardMaterial({ color: "#b9b5ac", roughness: 0.9, name: "site:stop" }),
    trunk: new MeshStandardMaterial({ color: "#5d4c3d", roughness: 0.95, name: "site:trunk" }),
    leaves: new MeshStandardMaterial({ color: "#ffffff", roughness: 0.9, flatShading: true, name: "site:leaves" }),
    pole: new MeshStandardMaterial({ color: "#7d8387", roughness: 0.45, metalness: 0.7, name: "site:pole" }),
    lamp: new MeshStandardMaterial({ color: "#2a2d30", roughness: 0.5, metalness: 0.4, emissive: "#fff3d6", emissiveIntensity: 0.05, name: "site:lamp" }),
    fence: new MeshStandardMaterial({ color: "#8b9196", roughness: 0.5, metalness: 0.6, name: "site:fence" }),
    mesh: new MeshStandardMaterial({ color: "#8b9196", roughness: 0.6, metalness: 0.4, transparent: true, opacity: 0.28, depthWrite: false, side: DoubleSide, name: "site:fence-mesh" }),
    setback: new MeshStandardMaterial({ color: "#c9a227", roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, name: "site:setback" }),
  };
}

/* ─────────────────────────────── árboles ─────────────────────────────── */

function treeCanopy() {
  const parts = [
    new IcosahedronGeometry(1.7, 1).translate(0, 4.4, 0),
    new IcosahedronGeometry(1.3, 1).translate(0.9, 3.9, 0.4),
    new IcosahedronGeometry(1.25, 1).translate(-0.8, 4.0, -0.5),
    new IcosahedronGeometry(1.1, 1).translate(0.1, 5.4, -0.2),
  ].map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(parts, false)!;
  // Leve deformación para que no se vea "de catálogo"
  const pos = merged.getAttribute("position");
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = Math.sin(x * 2.1 + z * 1.3) * 0.12 + Math.cos(y * 1.7 - x) * 0.1;
    pos.setXYZ(i, x * (1 + n), y + n * 0.4, z * (1 + n));
  }
  merged.computeVertexNormals();
  return merged;
}

/* ─────────────────────────────── entorno ─────────────────────────────── */

/**
 * `realGround`: debajo hay un mapa real (foto aérea o plano). Entonces no se
 * dibuja la calle genérica ni sus veredas y árboles: la calle es la del mapa.
 */
export type SiteOptions = { vehicles: boolean; realGround?: boolean };

export function buildSite(config: WarehouseConfig, definition: WarehouseDefinition, opts: SiteOptions): SiteBuild {
  const plan = planSite(config, definition);
  return buildSiteFromPlan(plan, opts);
}

export function buildSiteFromPlan(plan: SitePlan, opts: SiteOptions): SiteBuild {
  const { lay, site } = plan;
  const mats = siteMaterials();
  const root = new Group();
  root.name = "MW_SITE";
  const box = new Box3();
  const grow = (r: Rect) => {
    box.expandByPoint(new Vector3(r.x0, 0, r.z0));
    box.expandByPoint(new Vector3(r.x1, 0, r.z1));
  };
  grow(plan.footprint);
  if (plan.lotRect) grow(plan.lotRect);

  const concrete = new Bin();
  const walk = new Bin();
  const curb = new Bin();
  const asphalt = new Bin();
  const grass = new Bin();
  const white = new Bin();
  const yellow = new Bin();
  const blue = new Bin();
  const stops = new Bin();
  const fence = new Bin();
  const fenceMesh = new Bin();
  const setback = new Bin();

  /* Veredas perimetrales con cordón */
  for (const { rect: r, edge } of plan.sidewalks) {
    walk.add(slab(r, -0.03, Y.walk));
    const c = 0.14;
    const cr = edge === "x0" ? rect(r.x0, r.x0 + c, r.z0, r.z1) : edge === "x1" ? rect(r.x1 - c, r.x1, r.z0, r.z1) : edge === "z0" ? rect(r.x0, r.x1, r.z0, r.z0 + c) : rect(r.x0, r.x1, r.z1 - c, r.z1);
    curb.add(slab(cr, -0.03, Y.walk + 0.01));
    grow(r);
  }
  /* Playones, rampas y caminos */
  for (const r of [...plan.yards, ...plan.aprons]) {
    concrete.add(plane(r, Y.concrete));
    grow(r);
  }
  for (const r of plan.driveways) {
    asphalt.add(plane(r, Y.asphalt));
    grow(r);
  }
  /* Guías amarillas de aproximación */
  const guide = (cx: number, cz: number, dir: Vector3, len: number) => {
    if (len < 3) return;
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), dir);
    const sideV = new Vector3(dir.z, 0, -dir.x);
    for (const s of [-1, 1]) {
      const g = new PlaneGeometry(0.15, len).rotateX(-Math.PI / 2).applyQuaternion(q);
      const at = new Vector3(cx, 0, cz).addScaledVector(dir, len / 2).addScaledVector(sideV, (s * lay.doorW) / 2);
      yellow.add(g.translate(at.x, Y.paint, at.z));
    }
  };
  if (site.truckYard) {
    const fy = plan.yards.find((y) => y.z1 <= -plan.ez + 0.01);
    if (fy) for (const x of plan.doors.front) guide(x, -plan.ez, new Vector3(0, 0, -1), Math.min(16, -plan.ez - fy.z0 - 2));
    const ey = plan.yards.find((y) => y.x0 >= plan.ex - 0.01);
    if (ey) for (const z of plan.doors.side) guide(plan.ex, z, new Vector3(1, 0, 0), Math.min(14, ey.x1 - plan.ex - 2));
    const by = plan.yards.find((y) => y.z0 >= plan.ez - 0.01);
    if (by) for (const x of plan.doors.back) guide(x, by.z0, new Vector3(0, 0, 1), Math.min(12, by.z1 - by.z0 - 2));
  }

  /* Estacionamiento */
  const P = plan.parking;
  if (P) {
    asphalt.add(plane(P.rect, Y.asphalt));
    grow(P.rect);
    const along = new Vector3(P.along[0], 0, P.along[1]);
    const out = new Vector3(P.out[0], 0, P.out[1]);
    const origin = new Vector3(P.origin[0], 0, P.origin[1]);
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), out);
    const place = (g: BufferGeometry, at: Vector3) => g.applyQuaternion(q).translate(at.x, Y.paint, at.z);
    for (const row of P.rows) {
      if (row.u1 <= row.u0) continue;
      for (let u = row.u0; u <= row.u1 + 0.01; u += STALL_W) {
        const at = origin.clone().addScaledVector(along, u).addScaledVector(out, row.v0 + STALL_D / 2);
        white.add(place(new PlaneGeometry(0.1, STALL_D).rotateX(-Math.PI / 2), at));
      }
      const headV = row.head < 0 ? row.v0 + 0.05 : row.v0 + STALL_D - 0.05;
      const mid = origin.clone().addScaledVector(along, (row.u0 + row.u1) / 2).addScaledVector(out, headV);
      const qAlong = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), along);
      white.add(new PlaneGeometry(0.1, row.u1 - row.u0).rotateX(-Math.PI / 2).applyQuaternion(qAlong).translate(mid.x, Y.paint, mid.z));
    }
    for (const s of P.stalls) {
      const head = new Vector3(s.head[0], 0, s.head[1]);
      const stopAt = new Vector3(s.x, 0, s.z).addScaledVector(head, STALL_D / 2 - 0.55);
      const g = new BoxGeometry(1.7, 0.12, 0.16);
      g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), head));
      g.translate(stopAt.x, Y.asphalt + 0.06, stopAt.z);
      stops.add(g);
      if (s.accessible) blue.add(place(new PlaneGeometry(STALL_W - 0.2, STALL_D - 0.2).rotateX(-Math.PI / 2), new Vector3(s.x, 0, s.z)));
    }
    for (const [a0, a1] of P.aisles) {
      const vMid = (a0 + a1) / 2;
      for (let u = 6; u < P.length - 4; u += 14) {
        const at = origin.clone().addScaledVector(along, u).addScaledVector(out, vMid);
        const qa = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), along);
        white.add(new PlaneGeometry(0.16, 2.2).rotateX(-Math.PI / 2).applyQuaternion(qa).translate(at.x, Y.paint, at.z));
        const tip = at.clone().addScaledVector(along, 1.1);
        white.add(new PlaneGeometry(0.7, 0.7).rotateX(-Math.PI / 2).rotateY(Math.PI / 4).translate(tip.x, Y.paint, tip.z));
      }
    }
  }

  /* Ingresos, calle y veredas públicas */
  for (const g of plan.gates) {
    concrete.add(plane(g, Y.concrete));
    grow(g);
  }
  if (plan.road && !opts.realGround) {
    const R = plan.road;
    asphalt.add(plane(R.main, Y.asphalt));
    if (R.side) asphalt.add(plane(R.side, Y.asphalt + 0.001));
    const gateXs = plan.gates.map((g) => [g.x0, g.x1] as [number, number]);
    const near = R.publicWalk[0];
    for (const [x0, x1] of segments(near.x0, near.x1, gateXs)) {
      walk.add(slab(rect(x0, x1, near.z0 + 0.15, near.z1), -0.03, 0.12));
      curb.add(slab(rect(x0, x1, near.z0, near.z0 + 0.15), -0.03, 0.14));
    }
    for (const w of R.publicWalk.slice(1)) {
      walk.add(slab(w, -0.03, 0.12));
      if (w === R.publicWalk[1]) curb.add(slab(rect(w.x0, w.x1, w.z1 - 0.15, w.z1), -0.03, 0.14));
    }
    for (let x = R.main.x0 + 2; x < R.main.x1 - 3; x += 6) white.add(new PlaneGeometry(3, 0.14).rotateX(-Math.PI / 2).translate(x + 1.5, Y.paint, R.centerZ));
    if (R.side && R.sideCenterX !== null) for (let z = R.side.z0 + 4; z < R.side.z1 - 3; z += 6) white.add(new PlaneGeometry(0.14, 3).rotateX(-Math.PI / 2).translate(R.sideCenterX, Y.paint, z + 1.5));
    grow(rect(near.x0 + 60, near.x1 - 60, R.main.z0, near.z1));
  }
  if (plan.grass) grass.add(plane(plan.grass, Y.grass));

  /* Lote: cerco perimetral con portones y línea de edificación (retiros) */
  if (plan.lotRect) {
    const L = plan.lotRect;
    const h = 2.0;
    const postAt = (x: number, z: number) => fence.add(new BoxGeometry(0.06, h, 0.06).translate(x, h / 2, z));
    const run = (a: [number, number], b: [number, number]) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.5) return;
      const n = Math.max(1, Math.round(len / 3));
      for (let i = 0; i <= n; i += 1) postAt(a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n);
      const alongX = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]);
      const mx = (a[0] + b[0]) / 2;
      const mz = (a[1] + b[1]) / 2;
      fence.add(new BoxGeometry(alongX ? len : 0.04, 0.04, alongX ? 0.04 : len).translate(mx, h, mz));
      fenceMesh.add(new PlaneGeometry(len, h - 0.1).rotateY(alongX ? 0 : Math.PI / 2).translate(mx, (h - 0.1) / 2 + 0.05, mz));
    };
    const gatesOnLine = plan.gates.filter((g) => g.z1 >= L.z0 - 0.01 && g.z0 <= L.z0 + 0.01).map((g) => [g.x0, g.x1] as [number, number]);
    for (const [x0, x1] of segments(L.x0, L.x1, gatesOnLine)) run([x0, L.z0], [x1, L.z0]);
    run([L.x0, L.z1], [L.x1, L.z1]);
    run([L.x0, L.z0], [L.x0, L.z1]);
    run([L.x1, L.z0], [L.x1, L.z1]);
    // Línea de edificación: trazo discontinuo dorado
    if (plan.buildable) {
      const B = plan.buildable;
      const dash = (a: [number, number], b: [number, number]) => {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const dx = (b[0] - a[0]) / len;
        const dz = (b[1] - a[1]) / len;
        for (let t = 0; t < len; t += 2.4) {
          const l = Math.min(1.4, len - t);
          const cx = a[0] + dx * (t + l / 2);
          const cz = a[1] + dz * (t + l / 2);
          setback.add(new PlaneGeometry(Math.abs(dx) > 0.5 ? l : 0.18, Math.abs(dx) > 0.5 ? 0.18 : l).rotateX(-Math.PI / 2).translate(cx, Y.paint + 0.004, cz));
        }
      };
      dash([B.x0, B.z0], [B.x1, B.z0]);
      dash([B.x0, B.z1], [B.x1, B.z1]);
      dash([B.x0, B.z0], [B.x0, B.z1]);
      dash([B.x1, B.z0], [B.x1, B.z1]);
    }
  }

  const add = (m: Mesh | null) => m && root.add(m);
  add(grass.mesh(mats.grass, "site:grass"));
  add(asphalt.mesh(mats.asphalt, "site:asphalt"));
  add(concrete.mesh(mats.concrete, "site:concrete"));
  add(walk.mesh(mats.walk, "site:walk", { cast: true, receive: true }));
  add(curb.mesh(mats.curb, "site:curb", { cast: true, receive: true }));
  add(white.mesh(mats.white, "site:paint-white"));
  add(yellow.mesh(mats.yellow, "site:paint-yellow"));
  add(blue.mesh(mats.blue, "site:paint-blue"));
  add(setback.mesh(mats.setback, "site:setback-line"));
  add(stops.mesh(mats.stop, "site:wheel-stops", { cast: true, receive: true }));
  add(fence.mesh(mats.fence, "site:fence", { cast: true, receive: true }));
  add(fenceMesh.mesh(mats.mesh, "site:fence-mesh", { cast: false, receive: false }));

  /* Árboles y luminarias (instancias) */
  const inLot = (z: number) => !plan.lotRect || z >= plan.lotRect.z0;
  const trees = site.landscape ? plan.trees.filter(([, z]) => !opts.realGround || inLot(z)) : [];
  if (trees.length) {
    const rand = rng(trees.length * 7919 + Math.round(lay.L * 13));
    const trunkGeo = new CylinderGeometry(0.11, 0.17, 3.4, 8).translate(0, 1.7, 0);
    const canopyGeo = treeCanopy();
    const trunks = new InstancedMesh(trunkGeo, mats.trunk, trees.length);
    const canopies = new InstancedMesh(canopyGeo, mats.leaves, trees.length);
    const m = new Matrix4();
    const c = new Color();
    const greens = ["#6d8050", "#74875a", "#627647", "#7d8d5e", "#6a7a4b"];
    trees.forEach(([x, z], i) => {
      const s = 0.8 + rand() * 0.5;
      m.compose(new Vector3(x, 0, z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rand() * Math.PI * 2), new Vector3(s, s * (0.9 + rand() * 0.25), s));
      trunks.setMatrixAt(i, m);
      canopies.setMatrixAt(i, m);
      canopies.setColorAt(i, c.set(greens[Math.floor(rand() * greens.length)]));
    });
    trunks.castShadow = canopies.castShadow = true;
    trunks.receiveShadow = canopies.receiveShadow = true;
    trunks.name = "site:trees-trunk";
    canopies.name = "site:trees-canopy";
    root.add(trunks, canopies);
  }
  if (plan.poles.length) {
    const poleGeo = new CylinderGeometry(0.06, 0.1, 7.5, 8).translate(0, 3.75, 0);
    const armGeo = mergeGeometries([new BoxGeometry(0.08, 0.08, 1.4).translate(0, 7.35, 0.7).toNonIndexed(), new BoxGeometry(0.34, 0.12, 0.7).translate(0, 7.3, 1.45).toNonIndexed()], false)!;
    const p1 = new InstancedMesh(poleGeo, mats.pole, plan.poles.length);
    const p2 = new InstancedMesh(armGeo, mats.lamp, plan.poles.length);
    const m = new Matrix4();
    plan.poles.forEach((p, i) => {
      m.compose(new Vector3(p.x, 0, p.z), new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(p.dir[0], 0, p.dir[1])), new Vector3(1, 1, 1));
      p1.setMatrixAt(i, m);
      p2.setMatrixAt(i, m);
    });
    p1.castShadow = p2.castShadow = true;
    p1.name = "site:poles";
    p2.name = "site:luminaires";
    root.add(p1, p2);
  }

  /* Vehículos */
  if (opts.vehicles) {
    const rand = rng(Math.round(lay.W * 31 + lay.L * 17 + site.parking * 7));
    const vehicles = new Group();
    vehicles.name = "MW_SITE_VEHICLES";
    const kinds: CarKind[] = ["sedan", "hatch", "suv", "pickup"];
    const byKind = new Map<CarKind, Placement[]>(kinds.map((k) => [k, []]));
    const pickKind = (): CarKind => {
      const r = rand();
      return r < 0.34 ? "sedan" : r < 0.6 ? "hatch" : r < 0.84 ? "suv" : "pickup";
    };
    const pickColor = () => CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)];
    if (P && P.stalls.length) {
      for (const s of P.stalls) {
        if (s.accessible || rand() > 0.72) continue;
        const backedIn = rand() < 0.22;
        const dir = new Vector3(s.head[0], 0, s.head[1]).multiplyScalar(backedIn ? -1 : 1);
        const rot = Math.atan2(dir.x, dir.z) + (rand() - 0.5) * 0.05;
        const sideV = new Vector3(dir.z, 0, -dir.x);
        const at = new Vector3(s.x, 0, s.z).addScaledVector(sideV, (rand() - 0.5) * 0.18).addScaledVector(new Vector3(s.head[0], 0, s.head[1]), -0.15);
        byKind.get(pickKind())!.push({ x: at.x, z: at.z, rotation: rot, color: pickColor() });
      }
    } else {
      const zs = lay.personDoorZ.length ? lay.personDoorZ : [0];
      zs.slice(0, 2).forEach((z, i) => byKind.get(i ? "suv" : "sedan")!.push({ x: -plan.ex - 4.5, z: z + 4, rotation: 0.08, color: pickColor() }));
    }
    const carMats = createVehicleMaterials("#ffffff");
    for (const kind of kinds) {
      const list = byKind.get(kind)!;
      if (list.length) vehicles.add(instanceVehicles(buildCar(kind), carMats, list, `cars:${kind}`));
    }
    const V = plan.vehicles;
    if (V.semi) vehicles.add(instanceVehicles(buildSemiTruck(), createVehicleMaterials("#2f4a5e"), [V.semi], "semi"));
    if (V.box) vehicles.add(instanceVehicles(buildBoxTruck(), createVehicleMaterials("#e7e5df"), [V.box], "box-truck"));
    if (V.forklift) vehicles.add(instanceVehicles(buildForklift(), createVehicleMaterials("#d89a1c"), [V.forklift], "forklift"));
    root.add(vehicles);
  }

  root.updateMatrixWorld(true);
  return { root, box };
}

/** Libera geometrías y materiales del entorno al reemplazarlo. */
export function disposeSite(root: Group) {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => materials.add(m));
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => {
    const std = m as MeshStandardMaterial;
    std.normalMap?.dispose();
    m.dispose();
  });
}
