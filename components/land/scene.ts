import { Box3, BufferAttribute, BufferGeometry, DoubleSide, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, ShapeUtils, Vector2, type Material } from "three";
import { toLot, type XY } from "@/core/galpones/geo/parcel";
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

export type SceneOptions = { showEnvelope: boolean; typeId: BuildingTypeId };

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
    root.traverse((o) => (o as Mesh).geometry?.dispose());
    materials.forEach((m) => m.dispose());
  };
  return { root, box };
}

export function disposeSurroundings(root: Group) {
  (root.userData.dispose as (() => void) | undefined)?.();
}
