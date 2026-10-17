import { Box3, BufferAttribute, BufferGeometry, DoubleSide, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, ShapeUtils, Vector2, type Material } from "three";
import { toLot, type XY } from "@/core/galpones/geo/parcel";
import { buildCar, CAR_COLORS, createVehicleMaterials, instanceVehicles, type Placement } from "@/core/galpones/vehicles";
import type { Envelope } from "@/core/land/envelope/envelope";
import type { LotStudy } from "@/core/land/geo/study";
import type { BuildingTypeId } from "@/core/land/types";

/**
 * Entorno del edificio en el visor 3D (coordenadas del lote): la caja máxima
 * como un volumen de vidrio, el contorno del lote y la planta edificable.
 * No se selecciona ni se explota; el visor lo dibuja junto al modelo.
 */

/** Prisma de un polígono (x, z) entre dos alturas. */
export function prism(poly: XY[], y0: number, y1: number): BufferGeometry {
  let ring = poly;
  if (ShapeUtils.isClockWise(ring.map(([x, z]) => new Vector2(x, z)))) ring = [...ring].reverse();
  const tris = ShapeUtils.triangulateShape(ring.map(([x, z]) => new Vector2(x, z)), []);
  const pos: number[] = [];
  const push = (x: number, y: number, z: number) => pos.push(x, y, z);
  for (const [a, b, c] of tris) {
    push(ring[a][0], y1, ring[a][1]);
    push(ring[c][0], y1, ring[c][1]);
    push(ring[b][0], y1, ring[b][1]);
    push(ring[a][0], y0, ring[a][1]);
    push(ring[b][0], y0, ring[b][1]);
    push(ring[c][0], y0, ring[c][1]);
  }
  for (let i = 0; i < ring.length; i += 1) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    push(p[0], y0, p[1]);
    push(q[0], y0, q[1]);
    push(q[0], y1, q[1]);
    push(p[0], y0, p[1]);
    push(q[0], y1, q[1]);
    push(p[0], y1, p[1]);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

/** Banda fina sobre el piso siguiendo un contorno cerrado. */
function outline(poly: XY[], y: number, width: number) {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const [x0, z0] = poly[i];
    const [x1, z1] = poly[(i + 1) % poly.length];
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.05) continue;
    const nx = (-(z1 - z0) / len) * (width / 2);
    const nz = ((x1 - x0) / len) * (width / 2);
    const g = new BufferGeometry();
    const v = [x0 - nx, y, z0 - nz, x1 - nx, y, z1 - nz, x1 + nx, y, z1 + nz, x0 - nx, y, z0 - nz, x1 + nx, y, z1 + nz, x0 + nx, y, z0 + nz];
    g.setAttribute("position", new BufferAttribute(new Float32Array(v), 3));
    g.computeVertexNormals();
    parts.push(g);
  }
  return parts;
}

const lotPoly = (study: LotStudy, ring: XY[]) => ring.map((p) => toLot(study.analysis.fit.axes, p));

export type SceneOptions = {
  showEnvelope: boolean;
  typeId: BuildingTypeId;
  /** Hay foto aérea o plano debajo: entonces la calle real ya se ve y no se dibuja. */
  realGround?: boolean;
  /** Autos de referencia (con "Escala"). */
  cars?: Placement[];
};

/** Cuadrilátero sobre el piso entre dos segmentos paralelos. */
function band(a: XY, b: XY, n: XY, d0: number, d1: number, y: number) {
  const g = new BufferGeometry();
  const p = (q: XY, d: number) => [q[0] + n[0] * d, y, q[1] + n[1] * d];
  const v = [...p(a, d0), ...p(b, d0), ...p(b, d1), ...p(a, d0), ...p(b, d1), ...p(a, d1)];
  g.setAttribute("position", new BufferAttribute(new Float32Array(v), 3));
  g.computeVertexNormals();
  return g;
}

export function buildSurroundings(study: LotStudy, env: Envelope, opts: SceneOptions): { root: Group; box: Box3 } {
  const root = new Group();
  root.name = "MW_LAND_SITE";
  const materials: Material[] = [];
  const mat = <T extends Material>(m: T) => (materials.push(m), m);

  // Contorno del lote (dorado, como en el mapa) y planta edificable (celeste).
  const lot = lotPoly(study, study.analysis.ring);
  const gold = mat(new MeshStandardMaterial({ color: "#f0c45c", emissive: "#5a4313", roughness: 0.6, side: DoubleSide }));
  for (const g of outline(lot, 0.03, 0.22)) root.add(new Mesh(g, gold));
  const blue = mat(new MeshStandardMaterial({ color: "#8fb8c6", emissive: "#1d3740", roughness: 0.6, side: DoubleSide, transparent: true, opacity: 0.9 }));
  for (const piece of env.ground) for (const g of outline(lotPoly(study, piece), 0.035, 0.1)) root.add(new Mesh(g, blue));

  if (opts.typeId === "vivienda") {
    const grass = mat(new MeshStandardMaterial({ color: "#6f8a55", roughness: 0.95, transparent: true, opacity: 0.55 }));
    const m = new Mesh(prism(lot, 0.005, 0.02), grass);
    m.receiveShadow = true;
    root.add(m);
  }

  // Calle y vereda pública frente a cada lado del lote sobre la calle (sólo sin mapa debajo, como en Galpones).
  if (!opts.realGround) {
    const cx = lot.reduce((s2, p) => s2 + p[0], 0) / lot.length;
    const cz = lot.reduce((s2, p) => s2 + p[1], 0) / lot.length;
    const walk = mat(new MeshStandardMaterial({ color: "#bdb8ad", roughness: 0.92, side: DoubleSide }));
    const curb = mat(new MeshStandardMaterial({ color: "#8f8a82", roughness: 0.9, side: DoubleSide }));
    const asphalt = mat(new MeshStandardMaterial({ color: "#4a4c4e", roughness: 0.95, side: DoubleSide }));
    const ring = study.analysis.ring;
    for (const i of study.analysis.streetEdges) {
      const a0 = toLot(study.analysis.fit.axes, ring[i]);
      const b0 = toLot(study.analysis.fit.axes, ring[(i + 1) % ring.length]);
      const len = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]);
      if (len < 1) continue;
      const u: XY = [(b0[0] - a0[0]) / len, (b0[1] - a0[1]) / len];
      let n: XY = [-u[1], u[0]];
      const mx = (a0[0] + b0[0]) / 2;
      const mz = (a0[1] + b0[1]) / 2;
      if (n[0] * (cx - mx) + n[1] * (cz - mz) > 0) n = [-n[0], -n[1]];
      const ext = 18;
      const a: XY = [a0[0] - u[0] * ext, a0[1] - u[1] * ext];
      const b: XY = [b0[0] + u[0] * ext, b0[1] + u[1] * ext];
      root.add(new Mesh(band(a, b, n, 0, 2.85, 0.12), walk));
      root.add(new Mesh(band(a, b, n, 2.85, 3.0, 0.14), curb));
      const road = new Mesh(band(a, b, n, 3.0, 12, -0.02), asphalt);
      road.receiveShadow = true;
      root.add(road);
    }
  }

  if (opts.cars?.length) {
    const cars = instanceVehicles(buildCar("hatch"), createVehicleMaterials(), opts.cars.map((c, i) => ({ ...c, color: c.color ?? CAR_COLORS[(i * 5 + 3) % CAR_COLORS.length] })), "autos");
    root.add(cars);
  }

  if (opts.showEnvelope) {
    const glass = mat(new MeshStandardMaterial({ color: "#a9cbd6", transparent: true, opacity: 0.13, roughness: 0.2, metalness: 0, depthWrite: false, side: DoubleSide }));
    const edge = mat(new LineBasicMaterial({ color: "#a9cbd6", transparent: true, opacity: 0.75 }));
    for (const tier of env.tiers)
      for (const piece of tier.pieces) {
        const g = prism(lotPoly(study, piece), tier.from + 0.02, tier.to);
        const m = new Mesh(g, glass);
        m.renderOrder = 5;
        root.add(m);
        root.add(new LineSegments(new EdgesGeometry(g, 20), edge));
      }
  }
  const box = new Box3().setFromObject(root);
  root.userData.dispose = () => {
    const all = new Set<Material>(materials);
    root.traverse((o) => {
      if (o.name === "MW_SITE") return;
      (o as Mesh).geometry?.dispose();
      const m = (o as Mesh).material;
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => all.add(x));
    });
    all.forEach((m) => m.dispose());
  };
  return { root, box };
}

export function disposeSurroundings(root: Group) {
  (root.userData.dispose as (() => void) | undefined)?.();
}
