import { Box3, Group, MathUtils, Vector3, type Object3D } from "three";
import type { ModelDefinition } from "@/core/product-engine/types";

/**
 * normalizeModel()
 *
 * Lleva cualquier modelo (procedural, Revit, IFC…) a la convención del visor:
 * metros, Y vertical, centrado en X/Z y apoyado en Y = 0.
 *
 *   wrapper (identidad, lo monta el visor)
 *     └── inner (escala de unidades · rotación de ejes · origen · centrado)
 *           └── modelo original
 *
 * Crítico con modelos de Revit, que suelen llegar con coordenadas de proyecto
 * lejos del origen o en milímetros.
 */

export type NormalizedModel = {
  root: Group;
  box: Box3;
  size: Vector3;
  center: Vector3;
};

export function normalizeModel(object: Object3D, definition: Pick<ModelDefinition, "scale" | "rotation" | "origin" | "center"> = {}): NormalizedModel {
  const root = new Group();
  root.name = "MW_NORMALIZED_ROOT";
  const inner = new Group();
  inner.name = "MW_NORMALIZED_INNER";
  inner.add(object);
  root.add(inner);

  const scale = definition.scale ?? 1;
  inner.scale.setScalar(scale);
  const [rx, ry, rz] = definition.rotation ?? [0, 0, 0];
  inner.rotation.set(MathUtils.degToRad(rx), MathUtils.degToRad(ry), MathUtils.degToRad(rz));
  const [ox, oy, oz] = definition.origin ?? [0, 0, 0];
  inner.position.set(ox * scale, oy * scale, oz * scale);
  root.updateMatrixWorld(true);

  const box = new Box3().setFromObject(root);
  if (definition.center && !box.isEmpty()) {
    const c = box.getCenter(new Vector3());
    inner.position.x -= c.x;
    inner.position.z -= c.z;
    inner.position.y -= box.min.y;
    root.updateMatrixWorld(true);
    box.setFromObject(root);
  }
  return { root, box, size: box.getSize(new Vector3()), center: box.getCenter(new Vector3()) };
}

/** Caja de un objeto ignorando elementos invisibles (para encuadres). */
export function visibleBox(object: Object3D) {
  const box = new Box3();
  object.updateMatrixWorld(true);
  object.traverseVisible((child) => {
    const mesh = child as Object3D & { isMesh?: boolean };
    if (mesh.isMesh) box.expandByObject(child, false);
  });
  return box;
}
