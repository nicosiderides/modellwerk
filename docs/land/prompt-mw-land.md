# Prompt — MW Land: app de factibilidad e inversión en lotes (MODELLWERK)

> Nombre de la app: **MW Land** · Ruta: **/land** (nicosiderides.github.io/modellwerk/land)

## Quién soy y cómo trabajamos

Soy Nico. Nunca estudié programación: explicame todo en castellano simple, sin palabras técnicas (y si usás una, explicala con un ejemplo). Mi proyecto es MODELLWERK, un sitio con varias apps 3D (Next.js + React + Three.js), en mi compu Windows en `C:\Users\nicos\Documents\proyectos\modellwerk`, publicado en GitHub Pages (nicosiderides.github.io/modellwerk). Al publicarse queda como sitio estático: no hay servidor propio, todo corre en el navegador.

Reglas de trabajo:
- **No modificar la app Galpones (/galpones) ni ninguna otra app existente.** Galpones sigue siendo un producto propio. Si hace falta compartir piezas, primero proponeme cómo y esperá mi OK.
- Antes de pisar cualquier archivo en mi carpeta, verificá que sea igual al que tenés (comparar huellas/hash) y hacé copia en una carpeta "Copia de seg\<descripción>-<fecha>".
- Probá cada cambio vos mismo en un navegador (capturas incluidas) antes de decirme que funciona.
- Trabajamos por fases. Al terminar cada fase: frená, mostrame qué hay y cómo lo pruebo, y esperá mi OK para seguir.
- No publiques en GitHub hasta que yo lo pida.

## La idea

**MW Land** es una app nueva dentro de MODELLWERK, en su propia ruta `/land`, separada de todas las demás. Una app donde cualquiera busca un lote (o el que ya tiene) en el mapa real de la ciudad de Córdoba y puede verificar, **visual y técnicamente**, qué puede construir ahí y si el negocio cierra:

1. Encuentra el lote.
2. La app le dice qué permite la normativa (uso y tamaño).
3. Ve en 3D la "caja máxima" construible.
4. Elige un tipo de edificio y su tamaño dentro de esa caja.
5. **Lo customiza**, igual que hoy se customiza un galpón en Galpones, pero para cualquier tipo de edificio.
6. Simula la inversión: costo, ingresos, ganancia y retorno.
7. Compara escenarios y genera un informe para compartir.

Es una herramienta de **prefactibilidad**: siempre debe aclarar que no reemplaza al profesional ni la consulta municipal.

## Usuarios

Tiene que servir a tres tipos de personas, con un selector "Modo simple / Modo profesional":
- **Inversor común**: respuestas claras tipo semáforo (se puede / con condiciones / no se puede), cuánto gana y en cuánto tiempo recupera.
- **Desarrollista**: compara varios lotes y escenarios, ajusta números finos.
- **Arquitecto**: ve todos los datos técnicos y la fuente de cada regla, y saca un informe de prefactibilidad para su cliente.

## Tipos de edificio (primera etapa)

No se trata de productos MODELLWERK: son edificios genéricos.
1. **Galpón** — **usar la geometría que ya está generada en Galpones** (los modelos 3D que se estiran según las medidas: Industrial Light, Industrial Pro, Large Span, y las variantes de Logistics), junto con la lógica que ya resolvimos (límites del lote, retiros, ingreso y giro de camiones). Se usa tal cual, sin copiarla a mano ni modificar los archivos de Galpones; si para usarla hace falta algún ajuste, proponémelo primero.
2. **Vivienda unifamiliar** — superficie, plantas, ubicación en el lote, cochera, patio.
3. **Edificio de departamentos simple** — planta baja + planta tipo repetida; escalera/ascensor; cantidad y tamaño de unidades; cocheras.
4. **Oficinas / locales comerciales** — planta libre por piso, locales en planta baja, cocheras.

**Estilo de los tres tipos nuevos (vivienda, departamentos, oficinas/locales):** tienen que estar hechos con el mismo criterio que la geometría de los galpones:
- **Expandibles:** se generan solos a partir de medidas y parámetros (frente, fondo, cantidad de pisos, unidades, módulos) y se estiran o achican en vivo sin deformarse, igual que los galpones.
- **Estandarizados:** armados sobre una grilla o módulo fijo (por ejemplo, ejes de estructura cada cierta medida), con piezas repetibles: estructura, losas, muros, aberturas, núcleo de escalera/ascensor, cubierta, cocheras. Que crezcan sumando módulos, no inventando formas sueltas.
- **Prolijos:** encuentros limpios, nada que se superponga ni parpadee, aberturas alineadas, proporciones creíbles (alturas de piso, tamaños de ventanas y puertas reales).
- **Estéticos:** mismo lenguaje visual que Galpones y el resto de MODELLWERK (materiales, iluminación, colores de marca, cámaras), arquitectura contemporánea sobria. Que los cuatro tipos se vean como una misma familia.
- Cada pieza del modelo identificada por categoría (estructura, cerramiento, aberturas, etc.), igual que en Galpones, para poder aislar, ocultar y medir.
- Antes de programar cada tipo, mostrame una imagen de cómo se va a ver con 2 o 3 tamaños distintos para aprobar el estilo.

Cada tipo debe ser como una "receta" independiente, para poder sumar tipos nuevos más adelante sin rehacer la app. Cada receta define: en qué usos de suelo está permitido, cómo llena la caja máxima, qué datos pide al usuario, cómo genera su geometría, cómo calcula superficies (cubierta, vendible/alquilable) y qué valores de costo e ingreso usa.

## Customización (después de elegir lote, tipo y tamaño)

Una vez elegido el lote, el tipo de edificio y su tamaño, viene la instancia de customización, **con la misma experiencia que hoy tiene Galpones** (mismo orden de pasos, mismo estilo de paneles, mismas herramientas de exploración), pero para los cuatro tipos de edificio.

Qué se puede customizar en todos los tipos:
- **Estructura:** sistema estructural según el tipo.
- **Envolvente:** cubierta, fachadas y sus materiales y colores, aislación.
- **Aberturas:** ventanas, puertas, portones, vidrieras; cantidad y tamaño dentro de lo que permite la grilla.
- **Opciones del tipo:** las que tengan sentido para cada uno.
- **Entorno:** veredas, cocheras, parquizado, accesos.

Ejemplos de opciones por tipo (punto de partida para proponerme la lista final):
- **Galpón:** las mismas opciones que ya tiene Galpones (estructura, cerramientos, aislación, colores, portones, lucernarias, oficinas, etc.), reutilizando sus datos y su lógica, sin modificarlos.
- **Vivienda:** techo plano o inclinado, fachada (revoque, ladrillo visto, placas), galería, cochera cubierta o descubierta, terraza, pileta.
- **Departamentos:** balcones (sí/no y tipo), fachada, ascensor, cocheras en planta baja o subsuelo, terraza o amenities en la azotea.
- **Oficinas / locales:** fachada vidriada o de placas, vidrieras en planta baja, planta libre o subdividida, terraza.

Herramientas de exploración, igual que en Galpones: vistas de cámara, vista explotada, aislar u ocultar grupos de piezas, tocar una pieza para ver su información, corte por piso, referencias de escala, comparar A/B, ficha técnica imprimible con memoria descriptiva y pedido de presupuesto.

Reglas de la customización:
- **La normativa sigue activa:** si una opción hace que el edificio se salga de norma (por ejemplo, una terraza que suma altura), frena o avisa igual que en el paso anterior.
- **Cada opción mueve los números:** la customización actualiza en vivo superficies y costos, y eso alimenta la simulación de inversión (marcando qué es estimado).
- **Mismo modelo de datos que Galpones:** cada tipo de edificio tiene sus archivos de datos con la misma organización que los galpones (estructura, envolvente, opciones, especificaciones, precios, modelo), con textos para la memoria descriptiva en cada opción. Así sumar opciones o tipos es cargar datos, no reprogramar.
- Las pantallas de customización son propias de MW Land (no se reutilizan las de Galpones), pero con su mismo aspecto y comportamiento.

## Normativa (Córdoba capital primero)

- Reutilizar la búsqueda de lotes que ya funciona en Galpones (IDECOR / Mapas Córdoba: dirección, cuenta o nomenclatura, foto aérea, parcelas, zonas).
- Dos controles separados:
  - **Uso del suelo** (¿se puede hacer esto acá?) — Ord. 8133/85.
  - **Ocupación del suelo** (¿qué tan grande?) — Ord. 8256/86 y 8057/85: FOS, FOT, altura, retiros. También fraccionamiento (Ord. 8060/85) y protección patrimonial cuando corresponda.
- **Escenario "con convenio"**: además de lo permitido hoy, mostrar como escenario aparte lo que podría lograrse con los instrumentos de la Ord. 13.557 (Convenios Urbanísticos, Polígonos de Actuación Concertada), marcado claramente como "sujeto a aprobación".
- Las reglas tienen que estar guardadas aparte del dibujo, en archivos de datos fáciles de actualizar, cada una con su fuente y fecha. Pensarlo para que después se puedan sumar otras ciudades cambiando solo esos datos.
- **No inventar valores normativos.** Si un dato no se pudo obtener o verificar, mostrarlo como "a verificar".
- Igual que en Galpones: si el diseño se sale de norma, frenar lo que es obligatorio y solo avisar lo que es recomendación.

## Vista 3D y mapa

- El mapa es lo que más atrae: tiene que verse muy bien.
- Sobre el lote real, mostrar la caja máxima transparente y, dentro, el edificio configurado.
- Cambiar parámetros (pisos, unidades, superficie) actualiza el 3D y los números en vivo.
- Referencias de escala (personas, autos) y vista de manzana/entorno.

## Simulación de inversión

- Todo en **dólares** (con opción de ver en pesos usando un tipo de cambio que carga el usuario).
- Entradas: precio del terreno, costo de obra por m² según tipo, honorarios, impuestos y trámites, plazo de obra, y venta o alquiler (precio por m² o por unidad).
- Resultados: inversión total, ingresos, ganancia, margen, retorno anual aproximado, plazo de recupero y precio mínimo de venta para no perder.
- "¿Qué pasa si…?": mover precio de venta, costo de obra o plazo y ver cómo cambia el resultado.
- Cada número debe decir si es **dato real**, **estimado (demo)** o **pendiente**. Los valores por defecto son editables y deben estar marcados como estimados.

## Comparar e informe

- Guardar escenarios (lote + tipo + configuración + números) y comparar dos o más lado a lado.
- Guardar en el navegador y compartir por enlace.
- Informe imprimible / PDF: ficha del lote, normativa con fuentes, imagen 3D, superficies, números y la aclaración de prefactibilidad.

## Fuera de alcance por ahora (pero que el diseño lo permita después)

Productos MODELLWERK, otras ciudades, comprar o publicar lotes, capa de sol y sombra.

## Decisiones ya aprobadas (Fase 0)

La Fase 0 está hecha (ver `mw-land-fase-0.md`). Lo aprobado:

- **Qué se reutiliza de Galpones, sin modificarlo:** geometría y tipologías del galpón, su lógica de límites en el lote y de configuración, búsqueda de lotes y catastro (IDECOR), análisis del lote real, lectura de las capas de las Ord. 8256 y 8133, foto aérea en 3D y el visor 3D genérico (`product-viewer`).
- **Qué hace MW Land por su cuenta:** sus pantallas (mapa, paneles, customización) y su memoria interna, con el mismo estilo que Galpones; la caja máxima; la interpretación normativa para vivienda, departamentos y oficinas/locales; las recetas de los tipos nuevos; la simulación, la comparación y el informe.
- **Organización:** `app/land` (página), `components/land` (pantallas), `core/land` (lote, normativa, recetas, kit de piezas, inversión, escenarios), `data/land` (datos editables con fuente y fecha).
- **Tipos de pieza del visor:** autorizado a **agregar** los tipos de pieza que necesiten los edificios a la lista compartida del visor (`core/product-engine/types.ts`), por ejemplo: losas, escaleras, núcleo de ascensor, balcones, barandas, terrazas, parasoles, tabiques, cocheras y parquizado. Condiciones: solo agregar (no cambiar ni quitar nada de lo existente), hacerlo de forma que Galpones no necesite ningún cambio, y comprobar con sus pruebas y con capturas que Galpones sigue exactamente igual.
- **Grilla y alturas de partida para los tipos nuevos** (criterio de diseño, no de norma; ajustable):

  | | Vivienda | Departamentos | Oficinas / locales |
  |---|---|---|---|
  | Módulo de estructura | 3,6 a 4,8 m | 4,8 a 6 m | 6 a 8 m |
  | Altura de piso | 2,9 m | 2,9 m | 3,6 m (PB comercial 4,5 m) |
  | Cómo crece | sumando módulos, 1 o 2 plantas | sumando pisos tipo y módulos | sumando pisos y módulos de planta libre |

- **Galpón dentro de MW Land:** se customiza dentro de MW Land, como los demás tipos.
- **Pruebas con datos reales:** desde el espacio de trabajo de Claude no se llega a los servicios de Mapas Córdoba; para probar se guardan ejemplos reales (incluidas zonas residenciales y comerciales) usando el navegador de la compu de Nico.

## Fases

0. ✅ **Relevamiento (sin código):** hecho y aprobado.
1. Lote + ficha normativa + caja máxima en 3D.
2. Los cuatro tipos de edificio con su tamaño dentro de la caja: primero el galpón con su geometría existente; después los tres nuevos, cada uno con su imagen de estilo aprobada antes de programarlo.
3. Customización de los cuatro tipos (experiencia tipo Galpones): primero proponerme la lista de opciones de cada tipo para aprobar, después programarla.
4. Simulación de inversión.
5. Modo simple/profesional, comparar escenarios e informe.
6. Escenario "con convenio".

Empezá por la Fase 1. Antes de programar, repasá `mw-land-fase-0.md` y contame en dos líneas por dónde arrancás.
