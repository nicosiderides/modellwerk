import { parseNodeName } from "./naming.ts";
import type {
  BimElementMetadata,
  CategoryGroup,
  ModelCategory,
  ModelMetadataDocument,
  ModelTreeNode,
} from "./types.ts";
import { MODEL_CATEGORIES } from "./types.ts";

/**
 * ModelMetadataEngine
 *
 * Asocia objetos visuales (meshes de Three, nodos GLB…) con metadata BIM:
 *
 *   mesh.uuid ──► elementId ──► BimElementMetadata
 *
 * No depende de Three: recibe nodos con la forma mínima `MetadataNode`, por lo
 * que funciona igual con un GLB de miles de meshes o con geometría procedural.
 */

/** Forma mínima de un nodo visual (compatible con THREE.Object3D). */
export type MetadataNode = {
  uuid: string;
  name: string;
  userData: Record<string, unknown>;
  parent?: MetadataNode | null;
};

/** Mapeo por defecto de categorías nativas Revit/IFC → categorías semánticas. */
export const DEFAULT_BIM_CATEGORY_MAP: Record<string, ModelCategory> = {
  // Revit
  "Structural Columns": "columns",
  "Structural Framing": "rafters",
  "Structural Trusses": "rafters",
  "Structural Foundations": "foundations",
  "Structural Connections": "structure",
  Roofs: "roof",
  Walls: "walls",
  "Curtain Panels": "walls",
  Doors: "doors",
  Windows: "windows",
  "Specialty Equipment": "equipment",
  "Mechanical Equipment": "equipment",
  "Generic Models": "structure",
  Floors: "foundations",
  // IFC
  IfcColumn: "columns",
  IfcBeam: "rafters",
  IfcMember: "purlins",
  IfcRoof: "roof",
  IfcSlab: "foundations",
  IfcFooting: "foundations",
  IfcWall: "walls",
  IfcWallStandardCase: "walls",
  IfcPlate: "walls",
  IfcDoor: "doors",
  IfcWindow: "windows",
  IfcBuildingElementProxy: "structure",
  IfcFlowTerminal: "equipment",
};

const isCategory = (value: unknown): value is ModelCategory =>
  typeof value === "string" && (MODEL_CATEGORIES as readonly string[]).includes(value);

/** Resuelve la categoría semántica de un elemento con una cadena de respaldos. */
export function resolveCategory(
  element: Pick<BimElementMetadata, "category" | "bimCategory" | "nodeName"> | undefined,
  nodeName: string | undefined,
  categoryMap: Record<string, ModelCategory> = {}
): ModelCategory {
  if (element?.category && isCategory(element.category)) return element.category;
  const native = element?.bimCategory;
  if (native) {
    const mapped = categoryMap[native] ?? DEFAULT_BIM_CATEGORY_MAP[native];
    if (mapped) return mapped;
  }
  const parsed = parseNodeName(element?.nodeName) ?? parseNodeName(nodeName);
  if (parsed) return parsed.category;
  return "structure";
}

export type ResolvedElement = BimElementMetadata & { category: ModelCategory };

export type MetadataIndex = {
  /** mesh.uuid → elementId */
  elementIdByNode: Map<string, string>;
  /** elementId → uuids de los nodos visuales que lo representan */
  nodesByElement: Map<string, string[]>;
  /** elementId → metadata resuelta */
  elements: Map<string, ResolvedElement>;
  /** categoría → elementIds */
  elementsByCategory: Map<ModelCategory, string[]>;
  /** nodos sin metadata (se les asigna un id sintético para no perder selección) */
  unmatchedNodes: number;
};

/** Lee el elementId de un nodo: extras de glTF (userData) o el de un ancestro. */
function readElementId(node: MetadataNode): string | undefined {
  let current: MetadataNode | null | undefined = node;
  while (current) {
    const id = current.userData?.elementId ?? current.userData?.ElementId ?? current.userData?.GlobalId;
    if (typeof id === "string" || typeof id === "number") return String(id);
    current = current.parent;
  }
  return undefined;
}

/**
 * Construye el índice de metadata para un conjunto de nodos visuales.
 * Complejidad lineal: apto para modelos con miles de meshes.
 */
export function buildMetadataIndex(
  nodes: Iterable<MetadataNode>,
  document: ModelMetadataDocument | null | undefined
): MetadataIndex {
  const byId = new Map<string, BimElementMetadata>();
  const byNodeName = new Map<string, BimElementMetadata>();
  for (const element of document?.elements ?? []) {
    byId.set(element.elementId, element);
    if (element.nodeName) byNodeName.set(element.nodeName, element);
  }
  const categoryMap = document?.categoryMap ?? {};

  const index: MetadataIndex = {
    elementIdByNode: new Map(),
    nodesByElement: new Map(),
    elements: new Map(),
    elementsByCategory: new Map(),
    unmatchedNodes: 0,
  };

  for (const node of nodes) {
    const declaredId = readElementId(node);
    let element = (declaredId && byId.get(declaredId)) || byNodeName.get(node.name);
    let elementId = element?.elementId ?? declaredId;
    if (!elementId) {
      // Sin ID: conservar la posibilidad de seleccionar el objeto igualmente.
      elementId = `node:${node.name || node.uuid}`;
      index.unmatchedNodes += 1;
    }
    if (!element) element = { elementId, nodeName: node.name };

    index.elementIdByNode.set(node.uuid, elementId);
    const list = index.nodesByElement.get(elementId);
    if (list) list.push(node.uuid);
    else index.nodesByElement.set(elementId, [node.uuid]);

    if (!index.elements.has(elementId)) {
      const resolved: ResolvedElement = {
        ...element,
        elementId,
        category: resolveCategory(element, node.name, categoryMap),
      };
      index.elements.set(elementId, resolved);
      const bucket = index.elementsByCategory.get(resolved.category);
      if (bucket) bucket.push(elementId);
      else index.elementsByCategory.set(resolved.category, [elementId]);
    }
  }
  return index;
}

/** Árbol de modelo: Producto → grupos → categorías (con conteo de elementos). */
export function buildModelTree(
  rootLabel: string,
  index: Pick<MetadataIndex, "elementsByCategory">,
  groups: CategoryGroup[],
  categoryLabels: Partial<Record<ModelCategory, string>>
): ModelTreeNode {
  const used = new Set<ModelCategory>();
  const children: ModelTreeNode[] = [];
  for (const group of groups) {
    const categoryNodes: ModelTreeNode[] = [];
    for (const category of group.categories) {
      const count = index.elementsByCategory.get(category)?.length ?? 0;
      used.add(category);
      if (count === 0) continue;
      categoryNodes.push({ id: `${group.id}/${category}`, label: categoryLabels[category] ?? category, category, count, children: [] });
    }
    if (categoryNodes.length === 0) continue;
    children.push({
      id: group.id,
      label: group.label,
      count: categoryNodes.reduce((sum, node) => sum + node.count, 0),
      children: categoryNodes,
    });
  }
  // Categorías presentes que ningún grupo declara: no ocultarlas en silencio.
  const leftovers: ModelTreeNode[] = [];
  for (const [category, ids] of index.elementsByCategory) {
    if (used.has(category) || ids.length === 0) continue;
    leftovers.push({ id: `other/${category}`, label: categoryLabels[category] ?? category, category, count: ids.length, children: [] });
  }
  if (leftovers.length) {
    children.push({ id: "other", label: "Otros", count: leftovers.reduce((s, n) => s + n.count, 0), children: leftovers });
  }
  return {
    id: "root",
    label: rootLabel,
    count: children.reduce((sum, node) => sum + node.count, 0),
    children,
  };
}

/** Lista de categorías incluidas en un grupo o categoría seleccionada del árbol. */
export function categoriesOfTreeNode(node: ModelTreeNode): ModelCategory[] {
  if (node.category) return [node.category];
  return node.children.flatMap(categoriesOfTreeNode);
}
