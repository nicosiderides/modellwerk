/**
 * MW Product Engine — contratos genéricos.
 *
 * Esta capa no conoce galpones, React ni Three.js. Describe cómo un producto
 * constructivo (galpón, módulo, fachada, equipo…) se representa en la web:
 *
 *   BIM MODEL  +  METADATA  +  CONFIGURATION  +  VISUALIZATION  +  COMMERCIAL DATA
 *
 * El modelo 3D (GLB) es sólo la representación visual. La identidad de cada
 * elemento vive en la metadata externa y la lógica comercial en JSON/TS propios
 * de cada producto.
 */

/** Categorías semánticas mínimas acordadas para el visor. */
export type ModelCategory =
  | "structure"
  | "columns"
  | "rafters"
  | "purlins"
  | "bracing"
  | "girts"
  | "roof"
  | "walls"
  | "doors"
  | "windows"
  | "skylights"
  | "gutters"
  | "foundations"
  | "canopy"
  | "equipment";

export const MODEL_CATEGORIES: readonly ModelCategory[] = [
  "structure",
  "columns",
  "rafters",
  "purlins",
  "bracing",
  "girts",
  "roof",
  "walls",
  "doors",
  "windows",
  "skylights",
  "gutters",
  "foundations",
  "canopy",
  "equipment",
];

/** Origen declarado de la geometría/metadata. Nunca se presenta "demo" como dato real. */
export type ModelSource = "procedural" | "revit" | "ifc" | "speckle" | "aps" | "custom" | "demo";

export type Vec3 = [number, number, number];

/**
 * Definición de un recurso de modelo. Es lo que recibe `loadProductModel()`.
 * `scale`, `rotation` y `origin` corrigen unidades/ejes de la exportación; no
 * sirven para "estirar" un modelo BIM a dimensiones comerciales que no tiene.
 */
export type ModelDefinition = {
  id: string;
  type: "glb" | "procedural";
  /** Ruta pública del GLB (type = glb). */
  src?: string;
  /** Ruta pública de la metadata externa (`mw.product-metadata/1`). */
  metadataSrc?: string;
  /** Conversión de unidades del archivo a metros (ej. 0.001 si viene en mm). */
  scale?: number;
  /** Rotación en grados [x, y, z] para llevar el modelo a Y vertical. */
  rotation?: Vec3;
  /** Traslación aplicada antes de centrar. */
  origin?: Vec3;
  /** Centrar en X/Z y apoyar el mínimo Y en el piso. */
  center?: boolean;
};

/** Parámetros BIM arbitrarios (Revit/IFC). Valores primitivos para poder serializarlos. */
export type BimParameters = Record<string, string | number | boolean | null>;

/** Un elemento identificable del modelo, tal como lo exporta Revit/IFC o lo genera el código. */
export type BimElementMetadata = {
  /** ID estable. Revit: preferir UniqueId; IFC: GlobalId; procedural: grilla. */
  elementId: string;
  /** Nombre del nodo dentro del GLB (fallback de mapeo cuando no hay extras). */
  nodeName?: string;
  /** Categoría semántica del visor. Si falta, se resuelve por `bimCategory` o por nombre. */
  category?: ModelCategory;
  /** Categoría nativa (ej. "Structural Columns", "IfcColumn"). */
  bimCategory?: string;
  family?: string;
  type?: string;
  material?: string;
  /** Clave de material web (para sustituir materiales de autoría por la librería PBR). */
  materialKey?: string;
  level?: string;
  /** Etiqueta legible (ej. "Columna A-03"). */
  label?: string;
  parameters?: BimParameters;
};

/** Documento de metadata externo asociado a un GLB o a un modelo procedural. */
export type ModelMetadataDocument = {
  schema: "mw.product-metadata/1";
  model: {
    id: string;
    name?: string;
    source: ModelSource;
    units: "m";
    exportedAt?: string;
    tool?: string;
    revision?: string;
  };
  /** Mapeo adicional de categorías nativas → semánticas para este modelo. */
  categoryMap?: Record<string, ModelCategory>;
  elements: BimElementMetadata[];
};

/** Agrupación de categorías para aislar/ocultar y para el árbol de modelo. */
export type CategoryGroup = {
  id: string;
  label: string;
  categories: ModelCategory[];
};

export type ModelTreeNode = {
  id: string;
  label: string;
  /** Categoría semántica si el nodo representa una categoría. */
  category?: ModelCategory;
  count: number;
  children: ModelTreeNode[];
};

/** Un valor numérico que puede no estar disponible todavía (sin inventar datos). */
export type Estimate =
  | { status: "real"; value: number; unit: string }
  | { status: "demo"; value: number; unit: string; note: string }
  | { status: "pending"; unit: string; note: string };
