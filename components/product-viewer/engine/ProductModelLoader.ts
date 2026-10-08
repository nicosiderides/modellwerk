import type { Object3D, WebGLRenderer } from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ModelDefinition, ModelMetadataDocument } from "@/core/product-engine/types";
import { assetPath } from "@/components/environment/utils/assetPath";
import { createConfiguredGltfPipeline, type ConfiguredGltfPipeline } from "@/components/environment/utils/gltfPipeline";

/**
 * Sistema de carga centralizado: loading, caching, progreso, errores y metadata.
 *
 * Reutiliza `createConfiguredGltfPipeline` del Visor 1.0 (Draco + Meshopt + KTX2
 * con decodificadores locales). Cada modelo se descarga una sola vez; cada uso
 * recibe un clon (geometrías compartidas, materiales reemplazados por el visor).
 */

export type LoadedProductModel = {
  object: Object3D;
  metadata: ModelMetadataDocument | null;
  metadataError?: string;
};

type CacheEntry = Promise<{ scene: Object3D; metadata: ModelMetadataDocument | null; metadataError?: string }>;

const pipelines = new WeakMap<WebGLRenderer, ConfiguredGltfPipeline>();
const cache = new Map<string, CacheEntry>();

function pipelineFor(renderer: WebGLRenderer) {
  let pipeline = pipelines.get(renderer);
  if (!pipeline) {
    pipeline = createConfiguredGltfPipeline(renderer);
    pipelines.set(renderer, pipeline);
  }
  return pipeline;
}

const resolveUrl = (src: string) => (/^(https?:|blob:|data:)/.test(src) ? src : assetPath(src));

async function fetchMetadata(src: string): Promise<{ metadata: ModelMetadataDocument | null; error?: string }> {
  try {
    const response = await fetch(resolveUrl(src));
    if (!response.ok) return { metadata: null, error: `Metadata no disponible (${response.status})` };
    const json = (await response.json()) as ModelMetadataDocument;
    if (json?.schema !== "mw.product-metadata/1" || !Array.isArray(json.elements)) {
      return { metadata: null, error: "Metadata con formato desconocido" };
    }
    return { metadata: json };
  } catch {
    return { metadata: null, error: "No se pudo leer la metadata" };
  }
}

/**
 * loadProductModel(modelDefinition)
 * @param onProgress 0–1 (sólo GLB; la metadata suele ser liviana).
 */
export async function loadProductModel(
  definition: ModelDefinition,
  renderer: WebGLRenderer,
  onProgress?: (fraction: number) => void
): Promise<LoadedProductModel> {
  if (definition.type !== "glb" || !definition.src) throw new Error(`Modelo ${definition.id}: falta src GLB`);
  const key = `${definition.src}|${definition.metadataSrc ?? ""}`;
  let entry = cache.get(key);
  if (!entry) {
    const { loader } = pipelineFor(renderer);
    const glbPromise = loader.loadAsync(resolveUrl(definition.src), (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
    }) as Promise<GLTF>;
    const metadataPromise = definition.metadataSrc ? fetchMetadata(definition.metadataSrc) : Promise.resolve({ metadata: null, error: "Sin metadata externa" });
    entry = Promise.all([glbPromise, metadataPromise]).then(([gltf, meta]) => ({ scene: gltf.scene, metadata: meta.metadata, metadataError: meta.error }));
    cache.set(key, entry);
    // Un error no debe quedar cacheado: permitir reintento.
    entry.catch(() => cache.delete(key));
  }
  const loaded = await entry;
  onProgress?.(1);
  return { object: loaded.scene.clone(true), metadata: loaded.metadata, metadataError: loaded.metadataError };
}

/** Precarga (ej. al hacer hover en el catálogo). */
export function prefetchProductModel(definition: ModelDefinition, renderer: WebGLRenderer) {
  void loadProductModel(definition, renderer).catch(() => undefined);
}
