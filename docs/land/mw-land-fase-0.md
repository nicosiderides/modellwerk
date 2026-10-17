# MW Land — Fase 0: relevamiento y propuesta

> Revisión hecha el 17/10/2026 sobre tu carpeta `modellwerk`, **solo lectura**: no se modificó ningún archivo.

## 1. Lo que encontré en Galpones (en simple)

Galpones está armada en dos mitades, y eso es una gran noticia para MW Land:

- **El "cerebro"** (carpeta `core/galpones`): cálculos puros, sin pantallas. Genera el galpón en 3D, busca lotes en IDECOR, lee la normativa, verifica retiros, FOS, FOT y altura. Todo esto **se puede usar desde MW Land sin tocarlo**, como quien usa una calculadora prestada.
- **Las pantallas** (carpeta `components/galpones`): botones, paneles, el mapa a pantalla completa. Están "atadas" a Galpones (comparten su memoria interna), así que **no se pueden reusar tal cual**: MW Land tendrá las suyas, con el mismo estilo visual.

Además hay un **visor 3D genérico** (`components/product-viewer`) que ya fue pensado para mostrar "cualquier producto", no solo galpones: cámaras, luces, materiales, aislar/ocultar piezas, explotar, cortes, foto del entorno. MW Land lo usa directo.

### Qué se reutiliza y cómo

| Pieza de Galpones | Para qué sirve en MW Land | Cómo |
|---|---|---|
| Geometría del galpón (`geometry.ts`) + tipologías (Industrial Light, Pro, Large Span, Logistics) | El tipo "Galpón" | Se usa tal cual |
| Reglas del galpón en el lote (`lotLimits.ts`, `configuration.ts`) | Que el galpón frene si se sale de norma | Se usa tal cual |
| Búsqueda de lotes y catastro (`geo/idecor.ts`) | Buscar por dirección, cuenta o nomenclatura | Se usa tal cual |
| Análisis del lote real (`geo/parcel.ts`) | Frente, fondo, lados a la calle, rectángulo útil | Se usa tal cual |
| Lectura de zonas Ord. 8256 / 8133 (`geo/cordobaZoning.ts`) | Traer FOS, FOT, altura, retiros | Se usa la lectura de datos; la interpretación hay que ampliarla (ver punto 2) |
| Foto aérea y manzana en 3D (`map/groundMap.ts`) | El piso real alrededor del edificio | Se usa tal cual |
| Visor 3D (`product-viewer`) | Mostrar los cuatro tipos de edificio | Se usa tal cual |
| Mapa a pantalla completa (`map/LotMap.tsx`), paneles, memoria de la app (`store.ts`) | — | **No**: están atados a Galpones. MW Land tiene los suyos, mismo estilo |

## 2. Lo que falta (lo nuevo de MW Land)

1. **La caja máxima.** Galpones verifica si *un galpón* entra; no calcula "el volumen máximo que la norma permite". MW Land lo calcula sobre el contorno real del lote: le resta los retiros, lo limita por FOS (huella), altura y FOT (m² totales), y lo muestra como un volumen transparente.
2. **Normativa para vivienda, departamentos y oficinas.** Hoy la interpretación de zonas está hecha **solo para zonas industriales** (L, M, N, N1, J1, J2), y la lectura de uso del suelo responde "¿sirve para un galpón?". Hay que sumar:
   - la interpretación de las zonas residenciales y comerciales de la Ord. 8256,
   - una respuesta de uso por cada tipo de edificio (vivienda / departamentos / oficinas-locales / galpón).
   La Ord. 8133 regula sobre todo actividades industriales; para vivienda y comercio hay que relevar qué dice cada zona. **Nada de esto se inventa**: lo que no esté confirmado se muestra "a verificar".
3. **Los tres tipos de edificio nuevos** (vivienda, departamentos, oficinas/locales), con su geometría expandible.
4. **La simulación de inversión**, la comparación de escenarios y el informe.
5. **El escenario "con convenio"** (Ord. 13.557).

## 3. Cómo se organiza MW Land

```
app/land/                 → la página /land
components/land/          → pantallas propias de MW Land (mapa, paneles, visor)
core/land/                → el "cerebro" de MW Land, sin pantallas
   lote/                  → caja máxima a partir del lote real
   normativa/             → interpretación por zona y uso por tipo de edificio
   recetas/               → galpón, vivienda, departamentos, oficinas/locales
   kit/                   → piezas estándar que comparten los tres tipos nuevos
   inversion/             → simulación de números
   escenarios/            → guardar, comparar y compartir
data/land/                → datos editables: reglas por zona (con fuente y fecha),
                            costos por m², valores de venta y alquiler (marcados estimados)
```

Galpones no se toca: MW Land **lee** sus piezas, nunca las cambia.

### Las "recetas" de edificio

Cada tipo de edificio es una receta independiente que responde siempre las mismas preguntas:

- ¿En qué zonas y usos está permitido?
- ¿Qué le pregunto al usuario? (pisos, unidades, superficie…)
- ¿Cómo llena la caja máxima?
- ¿Cómo dibuja su 3D?
- ¿Cuántos m² cubiertos, vendibles o alquilables da?
- ¿Qué costo e ingreso usa por defecto?

Sumar un tipo nuevo más adelante (por ejemplo, módulos MODELLWERK) = escribir una receta más, sin rehacer la app.

- **Galpón:** usa la geometría de Galpones tal cual. Su customización (estructura, cerramientos, aberturas, opciones) se hace dentro de MW Land, reutilizando los datos y la lógica de Galpones.
- **Vivienda, departamentos, oficinas/locales:** se arman con un **kit de piezas estándar** común (columnas, losas, muros, carpinterías, escalera/ascensor, cubierta, cocheras, barandas), todas sobre una grilla. Así salen expandibles, prolijos y de la misma familia visual que el galpón.

### Grilla y medidas propuestas para los tipos nuevos (para que apruebes)

Son criterios de diseño para que se vean bien y creíbles, no valores de norma:

| | Vivienda | Departamentos | Oficinas / locales |
|---|---|---|---|
| Módulo de estructura | 3,6 a 4,8 m | 4,8 a 6 m | 6 a 8 m |
| Altura de piso | 2,9 m | 2,9 m | 3,6 m (PB comercial 4,5 m) |
| Cómo crece | sumando módulos en frente/fondo, 1 o 2 plantas | sumando pisos tipo y módulos | sumando pisos y módulos de planta libre |
| Piezas típicas | cochera, galería, patio | núcleo escalera/ascensor, balcones, cocheras | núcleo, fachada vidriada, locales en PB |

Antes de programar cada uno te muestro una imagen en 2 o 3 tamaños para aprobar el estilo.

## 4. Detalle de las fases

**Fase 1 — Lote, ficha normativa y caja máxima en 3D**
- Pantalla de MW Land con el mapa (mismo estilo que Galpones): búsqueda, foto aérea, parcelas, elegir el lote.
- Ficha del lote: zona, FOS, FOT, altura, retiros, cada uno con su fuente y si está verificado o "a verificar".
- Semáforo de uso por cada tipo de edificio.
- Caja máxima en 3D sobre la foto real.
- Relevamiento de las zonas residenciales y comerciales de la Ord. 8256 para cargarlas como datos.

**Fase 2 — Los cuatro tipos de edificio**
- Galpón con su geometría existente dentro de la caja.
- Kit de piezas estándar + imagen de estilo para aprobar.
- Vivienda → departamentos → oficinas/locales, cada uno aprobado antes de programarlo.
- Frena lo obligatorio, avisa lo recomendable, como en Galpones.

**Fase 3 — Customización (como en Galpones, para los cuatro tipos)**
- Misma experiencia que Galpones: estructura, envolvente, aberturas, opciones, entorno.
- Herramientas de exploración: explotar, aislar, tocar piezas, corte por piso, A/B, ficha técnica.
- Cada tipo con sus archivos de datos organizados igual que los de los galpones.
- La normativa sigue activa y cada opción actualiza superficies y costos.
- Primero la lista de opciones de cada tipo para aprobar, después se programa.

**Fase 4 — Simulación de inversión**
- En dólares (opción pesos con tipo de cambio cargado).
- Inversión total, ingresos, ganancia, margen, retorno anual, recupero, precio mínimo.
- "¿Qué pasa si…?" moviendo precio, costo o plazo.
- Cada número marcado real / estimado / pendiente.

**Fase 5 — Modos, comparar e informe**
- Modo simple / profesional.
- Guardar escenarios, comparar lado a lado, compartir por enlace.
- Informe imprimible / PDF.

**Fase 6 — Escenario "con convenio"**
- Segundo escenario con lo que permitiría la Ord. 13.557, marcado "sujeto a aprobación".

## 5. Decisiones (aprobadas el 17/10/2026)

1. ✅ **Tipos de pieza del visor:** se agregan los que hagan falta (losas, escaleras, núcleo de ascensor, balcones, barandas, terrazas, parasoles, tabiques, cocheras, parquizado). Solo agregar, sin cambiar nada existente, y comprobando que Galpones queda exactamente igual.
2. ✅ **Galpón dentro de MW Land:** se customiza dentro de MW Land, como los demás tipos.
3. ✅ **Grilla y alturas de piso** de la tabla del punto 3, como punto de partida (ajustables).

## 6. A tener en cuenta

- **Datos de IDECOR para las pruebas:** desde mi espacio de trabajo no tengo acceso directo a los servicios de Mapas Córdoba (en tu navegador sí funcionan). Para probar con zonas residenciales reales voy a guardar algunos ejemplos usando el navegador de tu compu, como ya hicimos con el lote de Ferreyra.
- **Prefactibilidad:** la aclaración "no reemplaza al profesional ni la consulta municipal" aparece siempre, también en el informe.
- **Publicación:** MW Land va a vivir en `nicosiderides.github.io/modellwerk/land`, con el mismo método de publicación que Galpones, y solo cuando vos lo pidas.
