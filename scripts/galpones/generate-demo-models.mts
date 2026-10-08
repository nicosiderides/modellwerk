/**
 * Genera los GLB demostrativos de la tipología "logistics" (estrategia discreteVariant).
 *
 * Simula el resultado de un pipeline Revit/IFC → GLB + metadata:
 *  - IDs numéricos tipo ElementId guardados en glTF extras (`elementId`).
 *  - Nombres de nodos según la convención <CODIGO>_<CATEGORIA>_<CALIFICADOR>.
 *  - Metadata externa (`*.metadata.json`) con categoría nativa, familia, tipo y parámetros.
 *  - La variante más grande se exporta desplazada del origen (como un modelo con
 *    coordenadas de proyecto) para comprobar normalizeModel().
 *
 * Uso:  node --experimental-strip-types scripts/galpones/generate-demo-models.mts
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { assembleDefinition, WAREHOUSE_FILE_NAMES, type WarehouseFiles } from "../../core/galpones/definition.ts";
import { createDefaultConfig, selectVariant } from "../../core/galpones/configuration.ts";
import { createWarehouseModel } from "../../core/galpones/geometry.ts";

// GLTFExporter usa FileReader del navegador; adaptador mínimo para Node.
class NodeFileReader {
  result: string | ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((r) => {
      this.result = r;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob: Blob) {
    void blob.arrayBuffer().then((r) => {
      this.result = `data:${blob.type};base64,${Buffer.from(r).toString("base64")}`;
      this.onloadend?.();
    });
  }
}
Object.assign(globalThis, { FileReader: NodeFileReader });

const id = "logistics";
const files = Object.fromEntries(
  await Promise.all(WAREHOUSE_FILE_NAMES.map(async (name) => [name, JSON.parse(await readFile(`data/galpones/${id}/${name}.json`, "utf8"))]))
) as WarehouseFiles;
const definition = assembleDefinition(files);
if (definition.model.strategy !== "discreteVariant") throw new Error("logistics debe ser discreteVariant");

await mkdir(`public/galpones/${id}`, { recursive: true });
const base = createDefaultConfig(definition);

for (const [i, variant] of definition.model.variants.entries()) {
  const config = selectVariant(definition, base, variant.id);
  const { root, metadata, stats } = createWarehouseModel(config, definition, {
    idStyle: "revit",
    source: "demo",
    modelId: variant.id,
    modelName: `${definition.name} ${variant.label}`,
  });
  // Variante 3: coordenadas de proyecto desplazadas (normalizeModel debe centrarla).
  if (i === 2) root.position.set(250, 0, -120);
  root.updateMatrixWorld(true);

  metadata.model.tool = "Demo export (simula Revit → GLB + metadata)";
  metadata.model.exportedAt = "2026-10-08T00:00:00.000Z";
  metadata.model.revision = "R1";
  metadata.categoryMap = { "Structural Framing": "rafters" };

  const glb = (await new GLTFExporter().parseAsync(root, { binary: true })) as ArrayBuffer;
  await writeFile(`public/galpones/${id}/${variant.id}.glb`, Buffer.from(glb));
  await writeFile(`public/galpones/${id}/${variant.id}.metadata.json`, JSON.stringify(metadata, null, 1) + "\n");
  console.log(`${variant.id}: ${stats.elements} elementos, ${stats.meshes} meshes, ${stats.triangles} triángulos, ${(glb.byteLength / 1024).toFixed(0)} KB`);
}
