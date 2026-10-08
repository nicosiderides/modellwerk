# Cómo agregar un galpón nuevo

Cada tipología es una carpeta con **7 archivos JSON**. No hace falta tocar el visor.

```text
data/galpones/<id>/
  warehouse.json   nombre, textos, rangos de medidas, valores iniciales, reglas
  structure.json   sistemas estructurales, terminaciones, etiquetas de perfiles
  envelope.json    cubiertas, cerramientos, aislaciones, colores
  options.json     opcionales (lucernarios, marquesina, grúa…) y aberturas
  specs.json       plantillas de la memoria descriptiva y notas
  pricing.json     datos comerciales (demo o reales)
  model.json       estrategia de modelo y variantes GLB
```

## Paso a paso

1. **Copiá** una carpeta parecida, por ejemplo `data/galpones/industrial-pro/` → `data/galpones/agro/`.
2. En **`warehouse.json`**:
   - `id` en minúsculas con guiones (`agro`) y `code` corto en mayúsculas (`GP05`). El `code` se usa en los nombres de las piezas y en los IDs.
   - `name`, `tagline`, `description`, `use`, `structuralSystemLabel`, `highlights`.
   - `thumbnail`: `/galpones/agro/thumb.webp`.
   - `dimensions`: rangos `{min, max, step}` en metros (la pendiente va en %). `bayCount` es la cantidad de módulos.
   - `defaults`: medidas iniciales. Tiene que cumplirse **`bayCount × baySpacing` dentro del rango de largo**.
   - `rules` (opcional): avisos que aparecen en el panel. Por ejemplo:
     ```json
     { "id": "agro-ancho", "level": "warning", "message": "Más de 30 m de luz: conviene reticulado.",
       "when": { "widthAbove": 30, "structureIn": ["portalFrame"] }, "suggest": { "structure": "truss" } }
     ```
     Condiciones disponibles: `widthAbove`, `widthBelow`, `eaveHeightAbove`, `eaveHeightBelow`, `structureIn`, `optionOn`, `roofIn`.
3. En **`structure.json`**: elegí qué sistemas ofrecer (`portalFrame`, `truss`, `mixed`, `custom`), el `default` y las terminaciones con su color `hex`.
4. En **`envelope.json`**: cubiertas y cerramientos (`finish`: `trapezoidal`, `sandwich`, `standingSeam` o `precastSheet`), aislaciones compatibles con cada cubierta y la **paleta de colores**. Los colores salen de este archivo: no hay colores RAL fijos en el código.
5. En **`options.json`**: los opcionales con `status: "available"` aparecen como interruptores. Los que tienen `"planned"` aparecen como "Próximamente". `minEaveHeight` bloquea un opcional si la nave es baja.
6. En **`specs.json`**: los párrafos de la memoria descriptiva, con estos tokens:
   `{name} {width} {length} {area} {volume} {eaveHeight} {ridgeHeight} {clearHeight} {slope} {slopeDeg} {bays} {frames} {spacing} {structure} {finish} {roof} {walls} {insulation} {roofColor} {wallColor} {openings} {options} {use}`.
   Si un párrafo usa un token vacío (por ejemplo `{options}` sin opcionales), ese párrafo se omite solo.
7. En **`pricing.json`**: `status: "demo"` o `"real"`. Si un valor es `null`, la app muestra *A cotizar* o *Sin dato*. Nunca inventa números.
8. En **`model.json`**:
   - Paramétrico: `{ "strategy": "dynamicGeometry" }`.
   - BIM/GLB: `{ "strategy": "discreteVariant", "defaultVariant": "...", "variants": [...] }` (ver [REVIT_A_GLB.md](./REVIT_A_GLB.md)).
9. **Registrá** la tipología en `core/galpones/catalog.ts`: agregá los 7 `import` y una línea `assembleDefinition({...})`.
10. **Miniatura:** con el servidor abierto, entrá a `/galpones?capture=agro&quality=high&refs=1` y sacá una captura, o usá `scripts/galpones/capture-thumbnails.mjs`. Guardala como `public/galpones/agro/thumb.webp`.
11. **Verificá:**
    ```bash
    node --experimental-strip-types --test core/galpones/engine.test.mts
    npx tsc --noEmit
    ```
    Si un JSON tiene un error, `assembleDefinition` avisa qué archivo y qué campo lo tiene.

## Usar el motor para otro producto (módulos, fachadas, equipos…)

`core/product-engine` y `components/product-viewer` no conocen galpones. Para otro producto:

1. Definí sus tipos y reglas en `core/<producto>/` (como `core/galpones/`).
2. Proveé el contenido: GLB + metadata, o un adaptador procedural que devuelva `{ root, metadata }`.
3. Escribí una librería de materiales (`MaterialResolver`) y un puente como `WarehouseViewer.tsx` que arme las props de `<ProductViewer />`.
