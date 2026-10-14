import { Box3, Color, DoubleSide, Material, Mesh, MeshStandardMaterial, Plane, Raycaster, Vector2, Vector3, type Camera, type Object3D, type Side } from "three";
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

/**
 * Corte horizontal (vista en planta): todo lo que está por encima de la altura
 * de corte desaparece y la "sección" de muros y columnas se ve rellena de un
 * gris oscuro (poché), como en un plano. El relleno son las caras internas
 * de cada pieza, que sólo se dibujan mientras dura el corte.
 */
const POCHE = "vec4(0.17, 0.18, 0.19, 1.0)";
const pocheUniforms = new WeakMap<Material, { value: number }>();
const sideBefore = new WeakMap<Material, Side>();

function installPoche(material: Material) {
  let uniform = pocheUniforms.get(material);
  if (uniform) return uniform;
  uniform = { value: 0 };
  pocheUniforms.set(material, uniform);
  const u = uniform;
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.uPoche = u;
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", "uniform float uPoche;\nvoid main() {")
      .replace("#include <dithering_fragment>", `#include <dithering_fragment>\n\tif (uPoche > 0.5 && !gl_FrontFacing) gl_FragColor = ${POCHE};`);
  };
  material.customProgramCacheKey = () => `${previousKey()}|poche`;
  material.needsUpdate = true;
  return uniform;
}

function sectionMaterial(material: Material, plane: Plane | null) {
  const had = Boolean(material.clippingPlanes?.length);
  const uniform = installPoche(material);
  if (plane) {
    if (!sideBefore.has(material)) sideBefore.set(material, material.side);
    material.side = DoubleSide;
    material.clippingPlanes = [plane];
    material.clipShadows = true;
    // Vidrios y lucernarios: se cortan, pero sin relleno.
    uniform.value = material.transparent ? 0 : 1;
  } else {
    const side = sideBefore.get(material);
    if (side !== undefined) {
      material.side = side;
      sideBefore.delete(material);
    }
    material.clippingPlanes = null;
    uniform.value = 0;
  }
  if (had !== Boolean(plane)) material.needsUpdate = true;
}

export class ModelStageController {
  readonly root: Object3D;
  readonly index: MetadataIndex;
  readonly metadata: ModelMetadataDocument | null;
  private readonly records: MeshRecord[] = [];
  private readonly recordsByElement = new Map<string, MeshRecord[]>();
  private readonly meshes: Mesh[] = [];
  private readonly highlightCache = new WeakMap<Material, Material>();
  private selected: string | null = null;
  private section: Plane | null = null;
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

  /** Caja del modelo sobre el terreno: lo enterrado (fundaciones, pilotes) no cuenta para el encuadre. */
  bounds() {
    const box = this.box.clone();
    if (box.max.y > 0) box.min.y = Math.max(box.min.y, -0.25);
    return box;
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

  /** Corte horizontal a una altura (m) o sin corte (null). */
  setSection(height: number | null) {
    this.section = height === null ? null : new Plane(new Vector3(0, -1, 0), height);
    this.applySection();
  }

  private applySection() {
    const materials = new Set<Material>();
    for (const record of this.records) {
      for (const m of [record.baseMaterial, record.mesh.material].flat()) materials.add(m);
      if (!Array.isArray(record.baseMaterial)) {
        const highlight = this.highlightCache.get(record.baseMaterial);
        if (highlight) materials.add(highlight);
      }
    }
    for (const material of materials) sectionMaterial(material, this.section);
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
    if (this.section) this.applySection();
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
      // Con corte en planta, lo que está por encima no se ve: no se puede elegir.
      if (this.section && hit.point.y > this.section.constant + 0.01) continue;
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
