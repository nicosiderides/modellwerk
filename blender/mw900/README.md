# MW900 — desarrollo estructural v001 / v002

Primer prototipo estructural propio de Modellwerk para un módulo de
`9,00 x 3,00 x 2,80 m`.

> Estado: concepto de desarrollo de producto. Los perfiles, espesores,
> patrones de bulones y arriostramientos deben verificarse mediante cálculo
> estructural antes de fabricar.

## Estado actual: v002 MW-LOCK

La v002 conserva la grilla y los perfiles conceptuales de la v001, pero
reemplaza las placas genéricas por una primera familia de producto propia:

- `MW-NI6`: nodo intermedio de placa achaflanada, patrón 3 x 2 y seis M16;
- `MW-NC8`: cassette de esquina envolvente en L, ocho M16 y dos caras accesibles;
- `MW-NODE-CAP`: placa común de asiento/cierre de columna;
- 16 assemblies direccionables: ocho `MW-NI6` y ocho `MW-NC8`;
- SKU, assembly ID, familia y proceso conceptual de fabricación exportados
  como `extras` del GLB;
- BOM JSON preparada para conteo, selección y futura cotización web.

`MW-LOCK` es un nombre de desarrollo. La forma de las placas, espesores,
distancias a borde, patrones de bulones, accesibilidad de herramientas y
transferencia real de esfuerzos todavía deben calcularse y prototiparse.

## Idea del sistema

La referencia de estudio fue la vista `MW900_Estructura` del archivo
`Proyecto CUARZO 2024_detached.rvt`. Se tomó su lógica general de marco,
costillas y conexiones visibles, pero el MW900 se reconstruyó desde cero.

La versión v001 propone:

- cuatro líneas de pórticos y tres bahías longitudinales;
- vigas laterales segmentadas, con todas las uniones sobre una línea de pórtico;
- columnas y vigas primarias RHS cerradas;
- costillas de piso y cubierta con perfiles C plegados;
- placas normalizadas de cuatro bulones M16;
- cruces de estabilidad desmontables en los testeros;
- origen en el centro del módulo y nivel de piso en `Z = 0`.

## Secciones conceptuales

| Componente | Sección v001 |
| --- | --- |
| Columnas | RHS 120 x 120 x 4 mm |
| Vigas longitudinales de piso | RHS 200 x 100 x 4 mm |
| Vigas longitudinales de cubierta | RHS 160 x 100 x 4 mm |
| Pórticos transversales de piso | RHS 180 x 80 x 4 mm |
| Pórticos transversales de cubierta | RHS 140 x 80 x 4 mm |
| Costillas de piso | C 180 x 60 x 20 x 3 mm |
| Costillas de cubierta | C 120 x 50 x 15 x 2,5 mm |
| Placa lateral de nodo | 220 x 240 x 12 mm, cuatro M16 |
| Placa de testero | 200 x 240 x 12 mm, cuatro M16 |

## Archivos

- `MW900_MASTER.blend`: master congelado de la v001.
- `MW900_MASTER_v002.blend`: master editable actual con el kit MW-LOCK.
- `../../public/models/mw900/v001/structure.glb`: activo web comprimido.
- `../../public/models/mw900/v002/structure.glb`: activo web v002 comprimido.
- `../../public/models/mw900/v002/bom.json`: conteo conceptual por SKU.
- `../../public/models/mw900/v002/roundtrip.json`: validación del GLB reimportado.
- `../../public/models/mw900/v001/manifest.json`: contrato dimensional y rutas.
- `../../public/models/mw900/v001/validation.json`: validación de envolvente y semántica.
- `../../tools/mw900/build_mw900.py`: generador paramétrico reproducible.
- `../../tools/mw900/build_mw900_v002.py`: evolución versionada del kit MW-LOCK.
- `../../tools/mw900/validate_mw900_roundtrip.py`: control de contrato de runtime.

## Contrato semántico

Cada pieza exportada incluye propiedades glTF `extras`, entre ellas:

- `mw_product_id`
- `mw_part_id`
- `mw_package`
- `mw_category`
- `mw_role`
- `mw_profile`
- `mw_export`

Estas propiedades llegan a Three.js como `object.userData` y permiten filtrar,
resaltar, explotar o sustituir piezas sin depender de coincidencias difusas de
nombres.

## Validación v001

- Envolvente: `9,00 x 3,00 x 2,80 m`.
- Origen: centro del módulo, a nivel de piso.
- Mallas exportadas: 176.
- Triángulos: 11.232.
- GLB Draco: aproximadamente 79 KB.
- Referencia Cuarzo excluida del GLB.
- Reimportación GLB verificada con una desviación máxima inferior a `0,05 mm`
  debida a la cuantización Draco.

## Validación v002

- Envolvente fuente: `9,00 x 3,00 x 2,80 m`.
- Mallas exportadas: 216.
- Triángulos: 13.312.
- GLB Draco: aproximadamente 133 KB.
- Assemblies de conexión: 16.
- Bulones conceptuales M16 contabilizados: 112.
- Todos los objetos conservan `mw_part_id` único y `mw_version = v002`.
- Reimportación verificada con una desviación dimensional máxima de `0,044 mm`.

## Regeneración

Abrir Blender con el add-on MCP conectado y ejecutar el contenido de:

```text
tools/mw900/build_mw900.py
```

El generador v001 reconstruye la base original. Para la v002, abrir la v001 y
ejecutar `tools/mw900/build_mw900_v002.py`: conserva los miembros, sustituye el
kit de uniones, guarda un master independiente, exporta GLB/BOM/manifiesto y
genera las imágenes de control. Luego ejecutar
`tools/mw900/validate_mw900_roundtrip.py` sobre el GLB exportado.
