# Reemplazar el placeholder por un GLB de Revit / IFC

La tipología **Logistics** ya funciona así: sus tres variantes son GLB con IDs numéricos tipo ElementId y metadata externa. Están generadas por `scripts/galpones/generate-demo-models.mts` para imitar una exportación real.

## Flujos soportados

```text
REVIT → IFC → procesamiento de datos → GLB + metadata.json → web
REVIT → exportador directo (plugin propio o de terceros) → GLB + metadata.json → web
```

La app **no depende** de ninguna herramienta de exportación. Sólo exige el contrato de abajo.

## Paso a paso

1. **Vista de exportación en Revit:** sólo el galpón (estructura, envolvente, aberturas). Sin anotaciones, planos, mobiliario ni entorno.
2. **Exportar a GLB** (directo, o IFC → GLB con un proceso intermedio). Cada elemento debe conservar su ID:
   - Revit: preferí el **UniqueId** (estable entre exportaciones) o el ElementId.
   - IFC: el **GlobalId**.
   - Guardalo en los **extras de glTF** del nodo como `"elementId"`. GLTFLoader lo deja en `mesh.userData.elementId`.
3. **Generar la metadata** (`<variante>.metadata.json`) de la misma revisión (ver el formato abajo).
4. **Copiar** el GLB y la metadata a `public/galpones/<id>/`.
5. **Declarar la variante** en `data/galpones/<id>/model.json`:
   ```json
   {
     "id": "LG-30x72",
     "label": "30 × 72 m · alero 10 m",
     "model": {
       "id": "LG-30x72",
       "type": "glb",
       "src": "/galpones/logistics/LG-30x72.glb",
       "metadataSrc": "/galpones/logistics/LG-30x72.metadata.json",
       "scale": 1,
       "rotation": [0, 0, 0],
       "origin": [0, 0, 0],
       "center": true
     },
     "dimensions": { "width": 30, "length": 72, "eaveHeight": 10, "roofSlope": 8, "baySpacing": 8, "bayCount": 9 },
     "structure": "truss",
     "includes": {
       "options": { "skylights": true, "canopy": true, "crane": false },
       "openings": { "doorsFront": 3, "doorsBack": 0, "doorsSide": 3, "personDoors": 2, "windowsPerSide": 0 }
     }
   }
   ```
   - `scale`: conversión de unidades (`0.001` si el archivo viene en milímetros). **No** sirve para estirar el galpón.
   - `rotation` (en grados): para llevar el modelo a Y vertical si el exportador dejó Z arriba (típico: `[-90, 0, 0]`).
   - `origin` + `center: true`: `normalizeModel()` centra en X/Z y apoya el modelo en el piso. La variante `LG-45x120` está exportada a propósito desplazada (250, 0, −120) para probar esto.
   - `dimensions`, `structure` e `includes` describen **lo que realmente está modelado**. La interfaz lo muestra bloqueado.
6. **Abrí la app y verificá:** que el modelo esté apoyado en el piso, orientado con el frente hacia −Z, que se pueda seleccionar, que el árbol muestre las categorías y que los colores cambien.
7. **Reemplazá los IDs demo** por los reales y poné `"source": "revit"` o `"ifc"`. No dejes metadata ficticia asociada a geometría real.

## Convención de nombres de nodos

```text
<CODIGO>_<CATEGORIA>[_<CALIFICADOR>]

GP03_COLUMNS_COL-A-03        columna del eje A, pórtico 3
GP03_RAFTERS_TR-05           cercha del pórtico 5
GP03_PURLINS_PU-E04          correa 4 del faldón este
GP03_ROOF_RF-O07             chapa de cubierta, faldón oeste, módulo 7
GP03_WALLS_WL-F              cerramiento del frente
GP03_DOORS_DR-F1             portón 1 del frente
WH01_STRUCTURE_COLUMNS       forma corta del pedido original (también se reconoce)
```

Tokens reconocidos (`core/product-engine/naming.ts`): `STRUCTURE`, `COLUMNS`, `RAFTERS`/`TRUSS`, `PURLINS`, `BRACING`, `GIRTS`, `ROOF`, `WALLS`, `DOORS`, `WINDOWS`, `SKYLIGHTS`, `GUTTERS`, `FOUNDATIONS`/`SLAB`, `CANOPY`, `EQUIPMENT`/`CRANE`.

Si un nodo tiene varias partes con distintos materiales (por ejemplo una ventana: marco + vidrio), todas comparten el mismo `elementId` y llevan el sufijo `_P2`, `_P3`…

**El nombre es sólo un respaldo.** La categoría se resuelve en este orden:

1. `category` de la metadata (la más confiable).
2. `bimCategory` (categoría nativa de Revit/IFC), traducida con `DEFAULT_BIM_CATEGORY_MAP` o con el `categoryMap` del archivo.
3. El nombre del nodo, según la convención.
4. Si nada aplica, `structure`. El elemento sigue siendo seleccionable.

## Metadata (`mw.product-metadata/1`)

```json
{
  "schema": "mw.product-metadata/1",
  "model": {
    "id": "LG-30x72",
    "name": "Logistics 30 × 72 m",
    "source": "revit",
    "units": "m",
    "tool": "Exportador X 2.1",
    "exportedAt": "2026-10-08T00:00:00Z",
    "revision": "R1"
  },
  "categoryMap": { "Structural Framing": "rafters" },
  "elements": [
    {
      "elementId": "123456",
      "nodeName": "GP03_COLUMNS_COL-A-01",
      "category": "columns",
      "bimCategory": "Structural Columns",
      "family": "HEB Column",
      "type": "HEB 300",
      "material": "Steel",
      "materialKey": "structure",
      "level": "Level 0",
      "label": "Columna A-01",
      "parameters": { "height": 8000, "weight": 425, "finish": "epoxy" }
    }
  ]
}
```

- `parameters` acepta cualquier parámetro de Revit/IFC con valores simples (texto, número, sí/no). En **Explorar** se muestran todos.
- `materialKey` le dice a la web qué material PBR usar: `structure`, `secondary`, `bracing`, `roofSheet`, `wallSheet`, `precast`, `slab`, `footing`, `skylight`, `sectionalDoor`, `personDoor`, `trim`, `glass`, `gutter`, `canopyRoof` o `crane`. Si falta, se usa uno según la categoría. Así, el color y la terminación que elige el cliente se aplican también al GLB de Revit.
- Categorías semánticas (`ModelCategory`): `structure`, `columns`, `rafters`, `purlins`, `bracing`, `girts`, `roof`, `walls`, `doors`, `windows`, `skylights`, `gutters`, `foundations`, `canopy`, `equipment`.

## Integraciones futuras (sin bloquear ninguna)

| Opción | Cómo encaja |
|---|---|
| **IFC.js / web-ifc** | En un *worker* o en un paso previo: leer el IFC → emitir GLB + metadata con este contrato. Un visor IFC completo sería otro adaptador de contenido. |
| **IFC → GLB (preproceso)** | IfcConvert / IfcOpenShell / Blender (IFC add-on) + un script que escriba la metadata. |
| **Exportador propio de Revit** | Plugin (API de Revit) que exporte la geometría con `UniqueId` en extras + el JSON de metadata. |
| **Speckle** | Conectores de Revit → servicio que transforme los objetos Speckle a GLB + metadata. Un objeto Speckle no es un GLB. |
| **Autodesk APS (Forge)** | Model Derivative (SVF2 + propiedades) → transformación propia, o un adaptador de visor alternativo. |
| **Pipeline propio** | Cualquier proceso que entregue GLB + metadata con este contrato funciona sin cambios en la app. |
