# Visor 2.0 · núcleo MW900

## Auditoría y decisiones

Se trabajó sobre `visor2.0`, cuyo `app/page.tsx` monta ProjectExperience y cuyo registro de Sites se titula MODELLWERK Visor 2.0. `MW Mod 2.0` es otro proyecto y no se modificó. Tampoco se modificaron el visor 1.0, el sitio institucional ni los masters estructurales anteriores.

Antes: React/Next + R3F/Drei, compositor aislado en tres archivos, catálogo compartido con el visor industrial, GLB clonado por unidad, selección por índice, cámara cenital de perspectiva y sin guardado del edificio. El motor `core/configurator` existente resuelve selecciones/precios del producto individual, no relaciones espaciales. Se conserva.

El compositor sumaba 0,34 m a ambas separaciones horizontales y 0,24 m entre niveles; además centraba cada fila y planta independientemente. La nueva grilla comparte origen y celdas entre niveles, llena primero los apoyos inferiores y toma los pasos de la definición medida. La huella cuenta celdas ocupadas, no el rectángulo envolvente de una planta incompleta.

Se conserva la organización header/sidebar/visor/panel/etapas y la paleta MODELLWERK. Se reemplazaron acciones inertes y porcentajes ficticios por navegación contextual, selección/edición, cómputo y guardado reales. Montaje y precios desconocidos se muestran como tales.

## Fuente dimensional

Medición mediante Blender MCP del `MW900_MASTER_v002.blend`, con el dependency graph actualizado:

- Envolvente estructural: X −4,50…4,50; Y −1,50…1,50; Z 0…2,80 m.
- 216 mallas semánticas, ocho columnas RHS de 120 mm.
- Vigas longitudinales inferiores: Z 0…0,20 m; superiores: Z 2,64…2,80 m.
- Blender → glTF/Three.js: `[X, Z, −Y]`; X longitudinal, Y vertical, Z transversal en la web.
- Origen: centro de la base estructural. El piso terminado propuesto está a +0,222 m, no en el cero estructural.
- Caras north/south identifican Z−/Z+ locales, no norte geográfico. La rotación del edificio se almacena aparte.

No había paquetes de cerramiento especificados en ese master. Se registraron como **propuestas**, no como datos medidos: placa de piso 18 mm, acabado 4 mm, paneles de muro 80 mm, placa de cielorraso 12 mm, plenum 28 mm y panel de cubierta 20 mm. Se alojan dentro de la envolvente medida. El piso/techo útil modelado se extiende hasta las caras interiores de las columnas. El metrado de pisos/cielorrasos/cubiertas del panel está explícitamente rotulado como superficie bruta/proyección.

## Contrato de datos

- `core/building/mw900.json`: definición generada en Blender, incluidos sockets, datums, paredes base, capas propuestas y obstáculos estructurales medidos.
- `types.ts`: Project → ModuleInstance → Wall / Opening. Una abertura referencia `wallId`; su posición es distancia desde `start`, y el antepecho parte del piso terminado.
- `assembly.ts`: composición, sockets, vecinos, solapamientos y huella. La grilla limita el alcance inicial a MW900 sin rotaciones individuales y tres niveles.
- `geometry.ts`: segmentación exacta de paneles alrededor de huecos rectangulares; la geometría no contiene estado del cliente.
- `validation.ts`: límites, ortogonalidad, solapamiento de divisores paralelos, márgenes de aberturas, colisiones entre huecos, obstáculos estructurales y apoyo completo.
- `engine.ts`: operaciones atómicas y cómputos. Un cambio inválido conserva el estado anterior.
- `persistence.ts`: contrato versionado, validación de importación y exportación JSON. Rechaza versiones futuras, hosts inexistentes y geometría inválida.

Los sockets son conexiones geométricas ideales con caras en contacto. **No certifican una unión resistente ni una tolerancia de fabricación**. El umbral numérico del grafo es 0,1 mm; el ajuste de edición de muros es 50 mm. Las aperturas respetan margen de 50 mm y una zona conservadora de interferencia de 20 mm junto a estructura. Estas son restricciones de configuración propuestas, no exigencias normativas.

## Blender ↔ Web

1. `tools/mw900/build_mw900_configurable.py` importa v002 en una escena independiente, mide, conserva estructura, crea FLOOR / EXTERNAL_WALLS / INTERNAL_WALLS / CEILING / ROOF / OPENINGS / COMPONENTS / METADATA y sockets.
2. Guarda `blender/mw900/MW900_CONFIGURABLE_v001.blend`, exporta GLB con extras y emite dos copias idénticas de la definición: core y public.
3. La web usa el GLB estructural y genera la envolvente/instancias desde los datos. No necesita Blender abierto para configurar.
4. Exportar JSON en Proyecto guarda composición, distribuciones, acabados y precios introducidos.
5. `tools/mw900/configure_mw900_from_project.py` reconstruye un módulo de ese JSON en otra escena Blender. Las aberturas usan Boolean modifiers sin aplicar y cutters separados; hojas, marcos y vidrios son elementos independientes.
6. `scripts/create-acceptance-project.mjs` genera un ejemplo reproducible y validado para este flujo. Se puede importar desde `public/models/mw900/configurable/example-project.json`.

La regeneración desde JSON es explícita; no hay sincronización bidireccional en vivo. Mover manualmente una malla en Blender no cambia el proyecto del cliente. Cambiar el producto requiere regenerar su definición y controlar la versión.

## Interacción y guardado

- Selección individual en el modelo y listado; doble clic o Editar entra al módulo.
- Dibujar muro: dos puntos en planta, alineación ortogonal; divisor completo como atajo.
- Puerta/ventana: añadir al muro seleccionado, o activar la herramienta y señalar un anfitrión.
- Panel con dimensiones en mm, posiciones, antepecho, material, tipo y apertura. Desplazador gráfico restringido al eje válido.
- Volver al edificio conserva los cambios. Esc sale de herramienta, elemento y módulo sucesivamente.
- Al editar una unidad, la cámara se encuadra exclusivamente sobre ella. El resto del edificio se mantiene como halftone no interactivo usando sus piezas reales —estructura, piso, muros, huecos, cielorraso y cubierta— y los módulos colindantes se identifican con una etiqueta de contexto. En planta se muestran los del mismo nivel y en 3D se conserva el contexto de todos los niveles.
- Deshacer/rehacer hasta 50 cambios; autosave en este navegador; importar/exportar JSON. No hay almacenamiento multiusuario ni sincronización remota.
- Planta: cámara ortográfica, selección de nivel y corte de paredes a +1,20 m sobre piso terminado. El código conserva todos los datos tridimensionales.

## Cantidades y precios

Las fachadas expuestas se derivan de los vecinos. Cuando dos módulos comparten una cara, ambos cerramientos de esa interfaz se suprimen automáticamente del visor, el cómputo y la regeneración en Blender; la estructura portante permanece. Si el edificio se recompone y esa cara vuelve al perímetro, el cerramiento reaparece. Los muros perimetrales también pueden eliminarse manualmente; esa decisión se conserva por módulo y elimina sus aberturas asociadas. El cómputo descuenta los huecos de cada panel y cuenta divisores, puertas, ventanas, módulos y cubierta expuesta. Longitud de divisores es un indicador, no una segunda partida cobrable junto a su área.

Los precios son unitarios introducidos por el usuario. El total permanece «A cotizar» mientras falten precios para partidas con cantidad. La estimación excluye impuestos, logística y montaje; no usa importes ficticios ni presupuestos de fábrica.

## Rendimiento y validación

La estructura se carga una vez, transforma a coordenadas de producto y se combina con colores por vértice en una geometría compartida, renderizada mediante un InstancedMesh para hasta 10 unidades, el límite de producto del configurador. El GLB original mantiene las 216 identidades de piezas; la selección del render combinado es por módulo. Muros y aberturas se memorizan, y el visor usa render a demanda. Las geometrías de caja son compartidas.

Comandos desde `visor2.0`:

```powershell
node ../node_modules/typescript/bin/tsc --noEmit
node --experimental-strip-types --test core/building/engine.test.mts core/configurator/engine.test.mts
node scripts/validate-mw900-assets.mjs
node ../node_modules/eslint/bin/eslint.js components/project core/building --max-warnings=0
node ../node_modules/next/dist/bin/next build --webpack
```

Verificaciones realizadas: composición/apoyos para cantidades 1…10 × niveles 1…3 × tres implantaciones; aislamiento de instancias, serialización, hosts, interferencias y cómputos; roundtrip GLB en Three.js con dimensiones 9 × 2,8 × 3 m y metadata completa. En Blender se comparó el volumen evaluado de los cuatro muros activos de M01 con área neta × espesor (tolerancia 0,00001 m³); los cuatro pasaron. El muro Sur quedó suprimido por su interfaz con M02.

El recorrido en navegador verificó M01 → divisor → mover 500 mm → puerta → ventana exterior 1500 × 1000 mm → rechazo de colisión con columna → guardar/recargar → M01 conserva cambios y M02 permanece independiente.

## Límites deliberados de esta etapa

No hay validación estructural, térmica, acústica, de fuego o normativa. La validación de arriostramientos usa bounding boxes conservadores, por lo que puede rechazar aberturas técnicamente resolubles. No se permite eliminar estructura ni mover módulos fuera de sockets. Aún faltan resolución de interfaces abiertas, juntas constructivas, cubierta de edificio continua, rotación individual, redes MEP, mobiliario, catálogo de fabricantes, cotización comercial, documentación de fabricación y edición colaborativa. Los muros interiores son ortogonales; cruces perpendiculares permiten uniones pero todavía no resuelven detalle de encuentro ni descuento de solape en metrado.
