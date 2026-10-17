import { BoxGeometry, BufferGeometry, Group, Mesh, MeshStandardMaterial, type Material } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BimElementMetadata, ModelCategory, ModelMetadataDocument } from "../../product-engine/types.ts";

/**
 * Kit de piezas estándar de MW Land: arma un `Group` de Three + la metadata
 * con el mismo contrato que usan los galpones (`mw.product-metadata/1`), así
 * el visor genérico los muestra, explota, aísla y deja tocar cada pieza.
 *
 * Coordenadas del lote: x a lo largo del frente, z hacia el fondo, y arriba.
 */

/** Claves de material web (las resuelve la librería de materiales de MW Land). */
export type LandMaterialKey =
  | "plinth"
  | "slab"
  | "concrete"
  | "steel"
  | "wallMain"
  | "wallSide"
  | "wallAccent"
  | "glass"
  | "frame"
  | "railing"
  | "roof"
  | "core"
  | "door"
  | "deck"
  | "fin"
  | "solar"
  | "water"
  | "pergola"
  | "partition"
  | "paving"
  | "grass"
  | "trunk"
  | "foliage";

/**
 * Las piezas de los edificios usan las categorías que ya conoce el visor
 * (así Galpones no se toca), con nombres propios en MW Land.
 */
export const LAND_CATEGORY_LABELS: Partial<Record<ModelCategory, string>> = {
  foundations: "Platea y fundaciones",
  structure: "Losas",
  columns: "Columnas",
  rafters: "Vigas",
  walls: "Muros y fachadas",
  windows: "Ventanas y vidrios",
  purlins: "Marcos de carpintería",
  doors: "Puertas y portones",
  roof: "Cubierta y parapetos",
  canopy: "Balcones, galería y aleros",
  gutters: "Barandas",
  equipment: "Núcleo: escalera y ascensor",
  girts: "Parasoles",
  skylights: "Paneles solares",
  bracing: "Exteriores y entorno",
};

export const LAND_GROUPS: { id: string; label: string; categories: ModelCategory[] }[] = [
  { id: "estructura", label: "Estructura", categories: ["foundations", "structure", "columns", "rafters"] },
  { id: "envolvente", label: "Envolvente", categories: ["walls", "roof", "windows", "purlins", "doors"] },
  { id: "exteriores", label: "Exteriores", categories: ["canopy", "gutters", "girts", "skylights", "bracing"] },
  { id: "servicios", label: "Servicios", categories: ["equipment"] },
];

export type ElementSpec = {
  category: ModelCategory;
  key: string;
  label: string;
  family: string;
  type?: string;
  material: string;
  level?: string;
  parameters?: BimElementMetadata["parameters"];
};

/** Caja entre dos esquinas (min, max). */
export function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): BufferGeometry {
  const w = Math.max(0.005, Math.abs(x1 - x0));
  const h = Math.max(0.005, Math.abs(y1 - y0));
  const d = Math.max(0.005, Math.abs(z1 - z0));
  const g = new BoxGeometry(w, h, d);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return meterUVs(g);
}

/** UV en metros: las texturas no se estiran con el tamaño de la pieza. */
export function meterUVs(geometry: BufferGeometry) {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  if (!uv) return geometry;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    if (ny >= nx && ny >= nz) uv.setXY(i, x / 2, z / 2);
    else if (nx >= nz) uv.setXY(i, z / 2, y / 2);
    else uv.setXY(i, x / 2, y / 2);
  }
  uv.needsUpdate = true;
  return geometry;
}

const PLACEHOLDER: Record<LandMaterialKey, string> = {
  plinth: "#8f8b82",
  slab: "#bdb8ad",
  concrete: "#a9a59d",
  steel: "#4b5257",
  wallMain: "#ece8df",
  wallSide: "#d6d0c4",
  wallAccent: "#4a4d50",
  glass: "#8fa9b5",
  frame: "#2a2c2e",
  railing: "#9fb7c2",
  roof: "#8c8a85",
  core: "#cfcac0",
  door: "#3e3a35",
  deck: "#9c7b5b",
  fin: "#b9bdbf",
  solar: "#1d2a3a",
  water: "#4fa3c7",
  pergola: "#3a3f43",
  partition: "#e4e0d8",
  paving: "#bdb8ae",
  grass: "#6f8a55",
  trunk: "#5b4636",
  foliage: "#56713f",
};

export class LandBuilder {
  readonly root = new Group();
  readonly elements: BimElementMetadata[] = [];
  private readonly materials = new Map<LandMaterialKey, Material>();
  private readonly used = new Set<string>();
  private meshes = 0;
  private triangles = 0;

  private readonly code: string;

  constructor(code: string) {
    this.code = code;
    this.root.name = `${code}_MODEL`;
  }

  private material(key: LandMaterialKey) {
    let m = this.materials.get(key);
    if (!m) {
      m = new MeshStandardMaterial({ name: key, color: PLACEHOLDER[key], roughness: 0.7, metalness: 0.1 });
      this.materials.set(key, m);
    }
    return m;
  }

  /** Agrega un elemento: varias geometrías del mismo material se funden en una sola malla. */
  add(spec: ElementSpec, parts: { geometry: BufferGeometry[]; materialKey: LandMaterialKey }[]) {
    const real = parts.filter((p) => p.geometry.length);
    if (!real.length) return;
    let key = spec.key;
    for (let i = 2; this.used.has(key); i += 1) key = `${spec.key}-${i}`;
    this.used.add(key);
    const elementId = `${this.code}-${key}`;
    real.forEach((part, index) => {
      const geometry = part.geometry.length === 1 ? part.geometry[0] : mergeGeometries(part.geometry, false);
      if (part.geometry.length > 1) part.geometry.forEach((g) => g.dispose());
      const mesh = new Mesh(geometry, this.material(part.materialKey));
      mesh.name = `${this.code}_${spec.category.toUpperCase()}_${key}${index ? `_P${index + 1}` : ""}`;
      mesh.userData = { elementId, materialKey: part.materialKey };
      const transparent = part.materialKey === "glass" || part.materialKey === "railing" || part.materialKey === "water";
      mesh.castShadow = !transparent;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      this.meshes += 1;
      const idx = geometry.getIndex();
      this.triangles += (idx ? idx.count : geometry.getAttribute("position").count) / 3;
    });
    this.elements.push({
      elementId,
      nodeName: `${this.code}_${spec.category.toUpperCase()}_${key}`,
      category: spec.category,
      bimCategory: LAND_CATEGORY_LABELS[spec.category] ?? spec.category,
      family: spec.family,
      type: spec.type ?? spec.family,
      material: spec.material,
      materialKey: real[0].materialKey,
      level: spec.level ?? "Planta baja",
      label: spec.label,
      parameters: spec.parameters,
    });
  }

  document(id: string, name: string): ModelMetadataDocument {
    return { schema: "mw.product-metadata/1", model: { id, name, source: "procedural", units: "m", tool: "MW Land kit estándar" }, elements: this.elements };
  }

  stats() {
    return { elements: this.elements.length, meshes: this.meshes, triangles: Math.round(this.triangles) };
  }
}
