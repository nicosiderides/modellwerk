import { Box3, Color, Material, Mesh, MeshStandardMaterial, Raycaster, Vector2, Vector3, type Camera, type Object3D } from "three";
import { buildMetadataIndex, type MetadataIndex } from "@/core/product-engine/metadata";
import type { ModelCategory, ModelMetadataDocument } from "@/core/product-engine/types";
import type { ExplodeOffsets, MaterialResolver } from "../types";

/**
 * Controlador imperativo del modelo montado.
 *
 * Centraliza todo lo que toca a miles de meshes sin crear componentes ni
 * listeners React por elemento:
 *   - índice mesh.uuid → elementId → metadata
 *   - asignación de materiales web
 *   - visibilidad por categoría (aislar / ocultar)
 *   - vista explotada animada
 *   - resaltado de selección
 *   - raycasting único al hacer clic
 */

type MeshRecord = {
  mesh: Mesh;
  elementId: string;
  category: ModelCategory;
  materialKey?: string;
  basePosition: Vector3;
  /** Desplazamiento de explosión en coordenadas locales del padre. */
  explodeLocal: Vector3;
  baseMaterial: Material | Material[];
};

const HIGHLIGHT = new Color("#c89b3c");

export class ModelStageController {
  readonly root: Object3D;
  readonly index: MetadataIndex;
  readonly metadata: ModelMetadataDocument | null;
  private readonly records: MeshRecord[] = [];
  private readonly recordsByElement = new Map<string, MeshRecord[]>();
  private readonly meshes: Mesh[] = [];
  private readonly highlightCache = new WeakMap<Material, Material>();
  private selected: string | null = null;
  private explodeFactor = 0;
  private readonly raycaster = new Raycaster();
  private readonly box: Box3;

  constructor(root: Object3D, metadata: ModelMetadataDocument | null, explodeOffsets: ExplodeOffsets) {
    this.root = root;
    this.metadata = metadata;
    root.updateMatrixWorld(true);
    root.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.isMesh) this.meshes.push(mesh);
    });
    this.index = buildMetadataIndex(this.meshes, metadata);
    this.box = new Box3().setFromObject(root);
    const center = this.box.getCenter(new Vector3());
    const size = this.box.getSize(new Vector3());

    const meshBox = new Box3();
    const worldCenter = new Vector3();
    for (const mesh of this.meshes) {
      const elementId = this.index.elementIdByNode.get(mesh.uuid)!;
      const element = this.index.elements.get(elementId)!;
      const offsets = explodeOffsets[element.category] ?? { up: 0, out: 0 };
      meshBox.setFromObject(mesh);
      meshBox.getCenter(worldCenter);
      // Dirección hacia afuera según el eje dominante (paredes ⟂ a su plano).
      const dx = (worldCenter.x - center.x) / Math.max(1, size.x / 2);
      const dz = (worldCenter.z - center.z) / Math.max(1, size.z / 2);
      const outward = Math.abs(dx) > Math.abs(dz) ? new Vector3(Math.sign(dx) || 1, 0, 0) : new Vector3(0, 0, Math.sign(dz) || 1);
      const worldOffset = outward.multiplyScalar(offsets.out).add(new Vector3(0, offsets.up, 0));
      const parent = mesh.parent ?? root;
      const from = parent.worldToLocal(worldCenter.clone());
      const to = parent.worldToLocal(worldCenter.clone().add(worldOffset));
      const record: MeshRecord = {
        mesh,
        elementId,
        category: element.category,
        materialKey: (mesh.userData?.materialKey as string | undefined) ?? element.materialKey,
        basePosition: mesh.position.clone(),
        explodeLocal: to.sub(from),
        baseMaterial: mesh.material,
      };
      this.records.push(record);
      const list = this.recordsByElement.get(elementId);
      if (list) list.push(record);
      else this.recordsByElement.set(elementId, [record]);
    }
  }

  get meshCount() {
    return this.meshes.length;
  }

  get triangleCount() {
    let total = 0;
    for (const mesh of this.meshes) {
      const g = mesh.geometry;
      total += (g.index ? g.index.count : g.getAttribute("position").count) / 3;
    }
    return Math.round(total);
  }

  bounds() {
    return this.box.clone();
  }

  /** Reemplaza materiales de autoría por la librería web (por clave/categoría). */
  applyMaterials(resolve: MaterialResolver) {
    for (const record of this.records) {
      const material = resolve(record.materialKey, record.category);
      record.baseMaterial = material ?? record.baseMaterial;
      record.mesh.material = record.baseMaterial;
      const transparent = Array.isArray(record.baseMaterial) ? false : record.baseMaterial.transparent;
      record.mesh.castShadow = !transparent;
      record.mesh.receiveShadow = true;
    }
    this.applyHighlight();
  }

  setVisibility(hidden: ModelCategory[], isolated: ModelCategory[] | null) {
    const hiddenSet = new Set(hidden);
    const isolatedSet = isolated ? new Set(isolated) : null;
    for (const record of this.records) {
      record.mesh.visible = !hiddenSet.has(record.category) && (!isolatedSet || isolatedSet.has(record.category));
    }
  }

  /** factor 0–1 */
  setExplode(factor: number) {
    this.explodeFactor = factor;
    for (const record of this.records) {
      record.mesh.position.copy(record.basePosition).addScaledVector(record.explodeLocal, factor);
    }
  }

  getExplode() {
    return this.explodeFactor;
  }

  select(elementId: string | null) {
    this.selected = elementId;
    this.applyHighlight();
  }

  private highlightOf(material: Material): Material {
    let cached = this.highlightCache.get(material);
    if (!cached) {
      cached = material.clone();
      if (cached instanceof MeshStandardMaterial) {
        cached.emissive = HIGHLIGHT.clone();
        cached.emissiveIntensity = 0.75;
        cached.color.lerp(HIGHLIGHT, 0.35);
      }
      this.highlightCache.set(material, cached);
    }
    return cached;
  }

  private applyHighlight() {
    for (const record of this.records) {
      const active = this.selected !== null && record.elementId === this.selected;
      const base = record.baseMaterial;
      record.mesh.material = active && !Array.isArray(base) ? this.highlightOf(base) : base;
    }
  }

  /** Raycast único: devuelve el elementId del primer mesh visible bajo el cursor. */
  pick(ndc: Vector2, camera: Camera): string | null {
    this.raycaster.setFromCamera(ndc, camera);
    const hits = this.raycaster.intersectObjects(this.meshes, false);
    for (const hit of hits) {
      const mesh = hit.object as Mesh;
      if (!mesh.visible) continue;
      // Los ancestros también deben estar visibles.
      let visible = true;
      let parent = mesh.parent;
      while (parent) {
        if (!parent.visible) visible = false;
        parent = parent.parent;
      }
      if (!visible) continue;
      return this.index.elementIdByNode.get(mesh.uuid) ?? null;
    }
    return null;
  }

  /** Caja del elemento (para enfocar la cámara). */
  elementBox(elementId: string) {
    const box = new Box3();
    for (const record of this.recordsByElement.get(elementId) ?? []) box.expandByObject(record.mesh);
    return box;
  }

  dispose() {
    // Los materiales de resaltado son propios; las geometrías las libera quien las creó.
    this.selected = null;
  }
}
