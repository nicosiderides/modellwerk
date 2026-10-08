# BIM → Web: pipeline recomendado (MW Warehouse / MW Product Engine)

Los modelos de Revit pesan mucho para la web: miles de elementos, materiales duplicados, coordenadas lejos del origen y geometría de detalle que el cliente nunca ve. Esta guía propone cómo llevarlos al visor sin perder **la identidad BIM de cada pieza**.

```text
REVIT ──► IFC ──► DATA PROCESSING ──► GLB optimizado ──► WEB VIEWER ──► config / metadata / datos comerciales
  └────────────── exportador directo ──────┘
```

## 1. Antes de exportar

- Usar una **vista 3D de exportación** dedicada: sólo las disciplinas que el showroom explica (estructura, envolvente, aberturas). Sin anotaciones, mobiliario, MEP de detalle, tornillería ni entorno.
- Nivel de detalle **medio** en Revit para la web. El detalle fino queda en el BIM, no en el navegador.
- Trabajar en **metros, con Y vertical y cerca del origen**. Si no se convierte antes, usar `scale`, `rotation` y `origin` en `model.json`; `normalizeModel()` hace el resto.

## 2. Identidad (lo más importante)

- Cada nodo GLB lleva su `elementId` (UniqueId de Revit o GlobalId de IFC) en **glTF extras**.
- La metadata (`*.metadata.json`) se versiona junto con el GLB de la misma revisión.
- **Ninguna optimización puede perder el vínculo** mesh → `elementId`. Validarlo siempre después de optimizar (ver el punto 6).

## 3. Optimizaciones de geometría

| Técnica | Cuándo | Cuidado |
|---|---|---|
| **Deduplicar materiales** | Siempre: Revit exporta muchos materiales equivalentes. | La web reasigna materiales por `materialKey` igualmente. |
| **Instancing** (`EXT_mesh_gpu_instancing`) | Piezas repetidas: correas, columnas, pernos. | Para seleccionar instancias, el raycast debe leer `instanceId` → `elementId` (pendiente para V2). |
| **Geometry merging** | Muchas piezas chicas con el mismo material y categoría. | Conservar rangos de triángulos por `elementId` o un *proxy* de selección. No fusionar todo en un solo mesh. |
| **LOD** | Modelos de más de ~500 k triángulos. | Probar los umbrales a escala de pantalla real. |
| **Simplificación** | Curvas, perfiles con radios y chapas onduladas modeladas. | Las ondas de chapa se representan con *normal maps*, no con geometría. |

## 4. Compresión

| Formato | Uso | Estado en la app |
|---|---|---|
| **Draco** | Geometría (mayor compresión, más tiempo de decodificación). | Soportado: `public/draco/` + `createConfiguredGltfPipeline` del Visor 1.0. |
| **Meshopt** (`EXT_meshopt_compression`) | Geometría y animación (decodifica muy rápido). Recomendado como opción por defecto. | Soportado (`MeshoptDecoder`). |
| **KTX2 / Basis** | Texturas comprimidas en GPU. | Soportado: `public/basis/` + `KTX2Loader`. |

Comando de referencia con [glTF Transform](https://gltf-transform.dev):

```bash
npx @gltf-transform/cli optimize entrada.glb salida.glb \
  --compress meshopt --texture-compress ktx2 --simplify false --instance true
```

(`--simplify false` evita alterar la geometría BIM. Activarlo sólo en modelos de presentación.)

## 5. Carga en la web

- **Lazy loading:** se descarga sólo la variante elegida. El catálogo muestra miniaturas livianas (`thumb.webp`, de ~10–15 KB).
- **Caché:** `loadProductModel()` descarga cada GLB **una sola vez** por sesión y entrega clones (geometría compartida).
- **Progreso y errores:** el indicador de estado muestra el porcentaje de descarga y los errores, sin romper la app.
- **Publicación:** assets versionados (`LG-30x72.r2.glb`) con caché HTTP/CDN de larga duración.

## 6. Validación después de optimizar

- [ ] La caja envolvente, la orientación y el nivel del piso coinciden con el original.
- [ ] Hay la misma cantidad de `elementId` antes y después, y cada mesh mapea a metadata (`unmatchedNodes = 0`, visible en el estado del modelo).
- [ ] La selección, el aislamiento y la explosión funcionan.
- [ ] Transparencias (vidrios, lucernarios) y materiales correctos.
- [ ] En un celular de gama media, la variante más pesada carga en un tiempo razonable.

## 7. Selección con miles de meshes

- Un único raycast en clic (nunca en hover) y un índice hash `mesh.uuid → elementId → metadata`. Es lineal y no tiene listeners de React por pieza.
- Para más de ~20 k meshes: incorporar `three-mesh-bvh` (aceleración del raycast) y *merge* por categoría con tabla de rangos → `elementId`.

## Números de la demo (no son un benchmark)

| Variante | Elementos | Meshes | Triángulos | GLB |
|---|---|---|---|---|
| LG-30x72 | 190 | 233 | 8.828 | 409 KB |
| LG-36x96 | 235 | 296 | 12.836 | 516 KB |
| LG-45x120 | 288 | 367 | 16.404 | 621 KB |

Sin compresión. Con Meshopt se espera una reducción importante, que hay que medir en cada caso.
