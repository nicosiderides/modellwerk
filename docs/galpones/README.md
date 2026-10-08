# MW Warehouse — Configurador de galpones (`/galpones`)

Catálogo técnico interactivo + configurador comercial de naves industriales, dentro de la app principal de MODELLWERK.
Es el **primer caso de uso** de un motor reutilizable para mostrar y vender productos constructivos BIM en la web:

```text
BIM MODEL  +  METADATA  +  CONFIGURATION  +  VISUALIZATION  +  COMMERCIAL DATA
```

> Esta app es **nueva e independiente**. No reemplaza ni modifica `/warehouse`, `apps/warehouse-site`, el Visor 1.0 ni ninguna otra app.

## Cómo abrirla

- Doble clic en **`abrir-galpones.bat`** (raíz del proyecto) → abre `http://localhost:3030/galpones`.
- O, si ya tenés otro servidor de MODELLWERK abierto (por ejemplo el de Planta en el puerto 3020), entrá a `/galpones` en esa misma dirección: `http://localhost:3020/galpones`.

## Qué hace

| Etapa | Qué ve el cliente |
|---|---|
| **01 Catálogo** | Cards grandes con miniatura 3D, luz, altura, uso, sistema, aislación y precio relativo. |
| **02 Configurar** | Visor 3D (≈75 % de la pantalla) y un panel liviano con 5 pestañas: medidas, estructura, envolvente, aberturas y opcionales. |
| **03 Explorar** | Clic sobre cualquier pieza → ficha BIM. Árbol del modelo con aislar/ocultar, vista explotada y datos técnicos. |
| **04 Resumen** | Ficha técnica con memoria descriptiva, datos técnicos, PDF (imprimir), guardar, compartir por enlace, JSON y pedido de presupuesto. |

Siempre disponibles: 5 vistas de cámara (perspectiva, frente, lateral, planta e interior), **Encuadrar**, **Explotar**, referencias de escala (persona, camión, auto y autoelevador), calidad visual, **Comparar A/B** y **Guardar**.

## Tipologías demo

| ID | Nombre | Estrategia de modelo | Notas |
|---|---|---|---|
| `industrial-light` | Industrial Light | `dynamicGeometry` | Pórtico de alma llena, 12–24 m |
| `industrial-pro` | Industrial Pro | `dynamicGeometry` | Pórtico / reticulado / mixto, 20–36 m, puente grúa |
| `logistics` | Logistics | `discreteVariant` (**GLB tipo BIM**) | 3 variantes GLB con IDs numéricos y metadata externa |
| `large-span` | Large Span | `dynamicGeometry` | Reticulado, 30–60 m |

Todos los datos son **demostrativos**. Las estimaciones (acero, plazo) se muestran con la etiqueta *Estimación demo*; el costo figura como *A cotizar* mientras no haya datos reales. No hay cálculo estructural.

## Arquitectura

Tiene cuatro capas separadas. Cada una sólo conoce a las de abajo:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ components/galpones/          INTERFAZ DEL PRODUCTO (React)          │
│   GalponesExperience · WarehouseCatalog · WarehouseConfigurator      │
│   WarehouseExplorer · WarehouseSummary · TechnicalPanel · modales    │
│   store.ts (Zustand) · materials.ts (librería PBR) · WarehouseViewer │
├──────────────────────────────────────────────────────────────────────┤
│ components/product-viewer/    VIEWER ENGINE genérico (R3F / Three)   │
│   ProductViewer · CameraDirector · ScaleReferences                   │
│   engine/ProductModelLoader  → loadProductModel(modelDefinition)     │
│   engine/normalizeModel      → normalizeModel()                      │
│   engine/ModelStageController→ selección, explosión, aislar, material│
├──────────────────────────────────────────────────────────────────────┤
│ core/galpones/                LÓGICA DEL DOMINIO (sin React)         │
│   configuration · metrics · description · geometry · quote · storage │
│ core/product-engine/          CONTRATOS GENÉRICOS (sin React/Three)  │
│   types · naming · metadata (ModelMetadataEngine) · serialization    │
├──────────────────────────────────────────────────────────────────────┤
│ data/galpones/<id>/*.json     CONTENIDO TÉCNICO Y COMERCIAL          │
│ public/galpones/<id>/         MODELOS GLB · METADATA · MINIATURAS    │
└──────────────────────────────────────────────────────────────────────┘
```

La separación pedida queda así:

| Concepto | Dónde vive |
|---|---|
| **viewer engine** | `components/product-viewer/` (no sabe qué es un galpón) |
| **model content** | GLB en `public/galpones/` o el adaptador procedural `core/galpones/geometry.ts` |
| **technical metadata** | `*.metadata.json` (contrato `mw.product-metadata/1`) + `core/product-engine/metadata.ts` |
| **commercial configuration** | `data/galpones/<id>/*.json` + `core/galpones/configuration.ts` |

**Decisión clave:** el GLB es **sólo la representación visual**. Las opciones, reglas, precios y textos viven en JSON/TypeScript externos. Por eso se puede reemplazar el modelo de Revit sin romper la app.

```text
REVIT / IFC → GEOMETRÍA + BIM IDs → GLB ─┐
                                         ▼
                                    MW ENGINE  ◄── metadata.json
                                         ▲
                     warehouse.json ─────┤
                     pricing.json  ──────┘
```

### Nombres del pedido → archivos reales

| Pedido | Implementación |
|---|---|
| `WarehouseExperience.tsx` | `components/galpones/GalponesExperience.tsx` |
| `WarehouseScene/Viewer.tsx` | `components/product-viewer/ProductViewer.tsx` + `components/galpones/WarehouseViewer.tsx` |
| `WarehouseCatalog/Configurator/Explorer/Summary.tsx` | mismos nombres en `components/galpones/` |
| `StructureSelector`, `EnvelopeSelector`, `DimensionsPanel` | paneles dentro de `WarehouseConfigurator.tsx` |
| `TechnicalPanel.tsx` | `components/galpones/TechnicalPanel.tsx` |
| `WarehouseModelLoader.ts` | `components/product-viewer/engine/ProductModelLoader.ts` (`loadProductModel`) |
| `ModelMetadataEngine.ts` | `core/product-engine/metadata.ts` |
| `ModelSelectionEngine.ts` | `components/product-viewer/engine/ModelStageController.ts` (`pick`) |
| `WarehouseMetricsEngine.ts` | `core/galpones/metrics.ts` |
| `TechnicalDescriptionEngine.ts` | `core/galpones/description.ts` (`generateTechnicalDescription`) |
| `warehouseStore.ts` | `components/galpones/store.ts` |
| `warehouseTypes.ts` | `core/galpones/types.ts` + `core/product-engine/types.ts` |

Los nombres con prefijo `galpones` y `product-*` se eligieron para **no chocar** con la app `/warehouse`, que ya usa `components/warehouse`, `core/warehouse` y `data/warehouses`.

### Estado (Zustand, `components/galpones/store.ts`)

| Parte | Contiene |
|---|---|
| `warehouse` | configuración serializable (`WarehouseConfig`) + tipología |
| `viewer` | pedido de cámara, explosión, ocultos/aislados, referencias de escala, calidad |
| `model` | carga (progreso/errores), índice de metadata, estadísticas |
| `ui` | etapa, pestaña, panel, modal, avisos |
| `selection` | elemento seleccionado (referencia a metadata; nunca se guardan UUID en el JSON comercial) |
| `compare` | opciones A y B |

### Dos estrategias de modelo

- **`dynamicGeometry` (TYPE A):** `createWarehouseModel(config, definition)` genera un `Group` + metadata con **el mismo contrato que un GLB**. Ancho, largo, alturas, pendiente, módulos, estructura, envolvente, aberturas y opcionales cambian la geometría.
- **`discreteVariant` (TYPE B):** se elige entre GLB ya exportados (`LG-30x72.glb`, …). Las dimensiones, la estructura, las aberturas y los opcionales quedan **bloqueados** (vienen del modelo). Colores y terminaciones sí se aplican, porque los materiales se reasignan por `materialKey`. **Nunca se escala un BIM para simular medidas que no tiene.**

### Rendimiento y selección

- Un solo `<primitive>` por modelo. No hay componentes ni listeners de React por pieza.
- Un único raycast **en clic** (no en hover), con un índice `mesh.uuid → elementId → metadata` que es lineal en la cantidad de meshes.
- Render a demanda (`frameloop="demand"`). La animación de explosión invalida frames sólo mientras se mueve.
- Las geometrías repetidas se comparten (columnas de igual altura, correas). Los materiales se comparten por clave.
- La oclusión ambiental (GTAO) sólo se activa en calidad **Alta**. En celular arranca en **Fluida**.

### Qué se reutiliza del Visor 1.0

- `createConfiguredGltfPipeline` (Draco + Meshopt + KTX2 con decodificadores locales) para cargar los GLB.
- `assetPath` (rutas compatibles con GitHub Pages).
- Tokens de marca (`assets/mw-tokens.css`), tipografías, logo y paleta (dorado *signal*, grafito, papel).
- `CameraControls` de drei con transiciones suaves, igual que el `CameraRig`. El `CameraRig` en sí **no** se importa, porque depende de las estaciones y límites de la fábrica.
- La imagen de escala humana (`public/people/factory-worker-scale.png`) y los HDR de `public/hdr/`.

### Conflictos evitados

- Todo el CSS nuevo está bajo el prefijo `.gp-`. No hay reglas globales (la única excepción es una regla `@media print` limitada con `:has(.gp-app)`).
- No se modificó ningún archivo existente: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx` y los estilos globales quedan como estaban. Tampoco se agregaron dependencias.
- `BIM_WEB_OPTIMIZATION.md` ya existía en la raíz (de `/warehouse`). La versión de esta app está en `docs/galpones/BIM_WEB_OPTIMIZATION.md`.

## Pruebas

```bash
node --experimental-strip-types --test core/galpones/engine.test.mts   # 14 pruebas del motor
npx tsc --noEmit                                                        # TypeScript de todo el proyecto
npx next build                                                          # build de todas las rutas
```

## Más documentación

- [AGREGAR_TIPOLOGIA.md](./AGREGAR_TIPOLOGIA.md): cómo agregar un galpón nuevo.
- [REVIT_A_GLB.md](./REVIT_A_GLB.md): cómo reemplazar el placeholder por un GLB de Revit/IFC, la convención de nombres y el formato de la metadata.
- [BIM_WEB_OPTIMIZATION.md](./BIM_WEB_OPTIMIZATION.md): el pipeline recomendado de BIM a la web.
- [V2.md](./V2.md): mejoras propuestas.

## Publicación en GitHub Pages

URL: **https://nicosiderides.github.io/modellwerk/galpones/**

La carpeta `galpones/` (en la raíz del repo) es la exportación estática de la ruta `/galpones`, con `basePath` `/modellwerk/galpones`. Para regenerarla:

1. Cambiar **temporalmente** `next.config.ts` para exportar (no se publica este cambio):
   ```ts
   const base = "/modellwerk/galpones";
   const nextConfig = { output: "export", basePath: base, assetPrefix: base, trailingSlash: true, images: { unoptimized: true } };
   ```
2. Construir con las rutas de recursos correctas:
   ```powershell
   $env:NEXT_PUBLIC_ASSET_BASE_PATH = "/modellwerk/galpones"
   npm run build
   ```
3. Armar la carpeta `galpones/`:
   - los archivos sueltos de `out/galpones/` (`index.html`, `index.txt`, `__next.*.txt`);
   - `out/_next` → `galpones/_next`;
   - `out/brand`, `out/draco`, `out/basis`, `out/people` → `galpones/`;
   - `out/hdr/kloofendal_43d_clear_puresky_2k.hdr` → `galpones/hdr/`;
   - las carpetas de tipologías de `out/galpones/` (`industrial-light`, `industrial-pro`, `logistics`, `large-span`) → `galpones/galpones/`.
4. Restaurar `next.config.ts` y publicar el código junto con la carpeta `galpones/`.
