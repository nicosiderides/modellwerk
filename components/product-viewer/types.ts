import type { Material, Object3D } from "three";
import type { MetadataIndex, ResolvedElement } from "@/core/product-engine/metadata";
import type { CategoryGroup, ModelCategory, ModelDefinition, ModelMetadataDocument } from "@/core/product-engine/types";

/**
 * Contratos del visor genérico (MW Product Viewer).
 * Ningún tipo de este módulo conoce galpones: el mismo visor sirve para
 * módulos, fachadas, equipos o cualquier producto BIM.
 */

/** Contenido a mostrar: un GLB (Revit/IFC) o un objeto generado por código. */
export type ViewerContent =
  | { kind: "glb"; key: string; definition: ModelDefinition; fitOnChange?: boolean }
  | { kind: "procedural"; key: string; build: () => { root: Object3D; metadata: ModelMetadataDocument }; fitGroup: string };

export type CameraPresetId = "perspective" | "front" | "side" | "top" | "interior" | "fit";

export type CameraRequest = { preset: CameraPresetId; nonce: number };

export type ModelLoadState = {
  status: "idle" | "loading" | "ready" | "error";
  progress: number;
  error?: string;
  source?: string;
  stats?: { meshes: number; elements: number; triangles: number; unmatched: number };
  size?: [number, number, number];
};

export type MaterialResolver = (materialKey: string | undefined, category: ModelCategory) => Material | undefined;

export type SelectionInfo = { elementId: string; element: ResolvedElement } | null;

export type ExplodeOffsets = Partial<Record<ModelCategory, { up: number; out: number }>>;

export type ViewerInsets = { top: number; right: number; bottom: number; left: number };

export type ViewerQuality = "high" | "balanced";

export type ProductViewerProps = {
  content: ViewerContent | null;
  /** Resolución de materiales web por clave/categoría (sustituye materiales de autoría). */
  resolveMaterial: MaterialResolver;
  /** Cambia cuando los materiales cambian (para reasignar). */
  materialVersion: string;
  hiddenCategories: ModelCategory[];
  isolatedCategories: ModelCategory[] | null;
  explode: boolean;
  explodeOffsets: ExplodeOffsets;
  selectable: boolean;
  selectedElementId: string | null;
  onSelect: (selection: SelectionInfo) => void;
  onIndex?: (index: MetadataIndex | null, metadata: ModelMetadataDocument | null) => void;
  onLoadState?: (state: ModelLoadState) => void;
  cameraRequest: CameraRequest;
  showScaleReferences: boolean;
  quality: ViewerQuality;
  insets: ViewerInsets;
  /** Grupos (solo para estadísticas/depuración). */
  groups?: CategoryGroup[];
  /** Modo captura (miniaturas): sin interacción y con buffer preservado. */
  captureMode?: boolean;
  /** Recibe una función que devuelve una imagen PNG (data URL) de la vista actual. */
  onSnapshotReady?: (capture: () => string | null) => void;
  className?: string;
};
