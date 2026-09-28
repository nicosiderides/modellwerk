# MW Assembly Planner

MW Assembly Planner conecta una implantación modular, una secuencia constructiva, sus recursos y un cronograma calculado. Es un MVP funcional de planificación preliminar dentro del proyecto Next.js de MODELLWERK. La escena 3D representa el resultado del motor de programación y del instante elegido por el usuario.

La aplicación se encuentra en `/assembly`. El visor existente de la raíz sigue siendo una entrada independiente. El proyecto inicial es un campamento MW900 con 24 módulos de 9 × 3 × 2,80 m, dos niveles, una grúa, 12 camiones con dos viajes sucesivos y dos cuadrillas. Sus pesos y tiempos son datos de demostración.

## Ejecutar y verificar

Desde la raíz del repositorio, con las dependencias instaladas:

```powershell
npm run dev -- --port 3001
```

Abrir `http://localhost:3001/assembly`. La muestra importable está disponible en `http://localhost:3001/examples/mw-assembly-demo.json` y en `public/examples/mw-assembly-demo.json`.

El entorno de desarrollo utiliza Next.js, React, Three.js, React Three Fiber, Drei, Zustand y TypeScript. Las pruebas siguientes requieren una versión de Node.js compatible con `--experimental-strip-types`; esta implementación se verificó con Node.js 24.

```powershell
npm run test:assembly
npm run typecheck
```

El script `npm run test:core` del repositorio corresponde al configurador existente. Para revisar únicamente los archivos nuevos de interfaz y dominio:

```powershell
npx eslint components/assembly core/assembly app/assembly
```

## Recorrido de uso

1. **Inspeccionar el modelo.** Seleccionar un módulo en la escena, la lista, el cronograma o el grafo. La selección se comparte entre las vistas. El inspector muestra su identidad, dimensiones, nivel, recursos, dependencias e hitos.
2. **Explorar el montaje.** Usar reproducción, pausa, hitos anterior/siguiente, inicio/final o el deslizador inferior. Las velocidades son multiplicadores de tiempo real: a 60×, un segundo reproduce un minuto de trabajo. La barra espaciadora reproduce o pausa cuando el foco está fuera de un control de formulario.
3. **Cambiar la secuencia.** Arrastrar una fila de la lista sobre otra o usar las flechas del inspector. El cambio se rechaza si coloca un módulo antes que un predecesor; el proyecto conserva la secuencia anterior.
4. **Ajustar tiempos y peso.** Editar los campos numéricos del módulo y confirmar con Enter o al salir del campo. El motor recalcula el cronograma y la simulación vuelve al inicio. `liftMinutes` controla la fase de izaje; el motor agrega ocho minutos de posicionamiento.
5. **Planificar la grúa.** En Planta o Logística, arrastrar la grúa para reubicarla. En Grúa, editar posición X/Z, radio, capacidad escalar y altura de gancho. La edición interactiva de estos parámetros corresponde a la primera grúa del proyecto.
6. **Revisar dependencias y alertas.** Dependencias muestra los vínculos declarados entre módulos. El botón de alertas del inspector abre condiciones detectadas por las reglas actuales y permite seleccionar los módulos involucrados.
7. **Comparar alternativas.** Abrir el selector de escenario, guardar una copia, modificar el proyecto y comparar duración, horas de grúa y alertas. Las copias existen durante la sesión. `Auto plan` propone un orden según apoyos, niveles, recursos y recorrido aproximado.
8. **Conservar el trabajo.** Guardar almacena un proyecto en el navegador. Abrir el título del proyecto permite restaurar ese guardado, importar JSON o volver al demo. Exportar descarga el proyecto actual como `mw-assembly-project.json`; conviene exportar cada alternativa que se quiera conservar.

El guardado local es explícito, utiliza la clave `mw-assembly-project-v1` y conserva el proyecto, no la cámara, el instante de reproducción ni la colección de escenarios. La aplicación inicia con la demostración; restaurar el último guardado es una acción del usuario. La importación admite archivos JSON de hasta 2 MB.

## Alcance implementado

| Área | Disponible en el MVP | Alcance de esta versión |
| --- | --- | --- |
| Modelo | Módulos con dimensiones, posición, orientación, peso, centro de gravedad, conexiones y dependencias | Geometría paramétrica; construcción y edición completa de edificios mediante JSON |
| Visor | Órbita, zoom, vistas ISO/planta/frente, selección, ocultar/aislar, estructura, transparencia, etiquetas y estados | Representación técnica simplificada; no importa geometría BIM/IFC/GLB |
| Cronograma | Fases, jornadas, hitos, avance, reproducción, pausa y recorrido temporal reversible | Programación derivada de la secuencia y los recursos; sin edición libre de barras |
| Dependencias | Grafo por nivel, relaciones seleccionables y bloqueo del reordenamiento inválido | Dependencias declaradas; sin editor gráfico de vínculos |
| Grúas | Radio, capacidad escalar, altura, ubicación y asignación por disponibilidad | El motor admite varias grúas importadas; el inspector edita la primera |
| Logística | Entregas por camión, retorno entre viajes, llegada según disponibilidad y una playa de descarga | Viajes simplificados; sin rutas reales, giros ni planificación vial |
| Cuadrillas | Asignación por módulo y exclusión de solapes del mismo recurso | Una cuadrilla acompaña la operación hasta el cierre; sin tareas MEP/QA independientes |
| Conflictos | Dependencias, recursos, alcance, capacidad configurada, altura y restricciones geométricas aproximadas | Diagnóstico preliminar según reglas explícitas |
| Escenarios | Copias en sesión y comparación de duración, uso de grúa y alertas | Sin historial persistente ni edición colaborativa |
| Intercambio | Importación validada, guardado local y exportación JSON | Sin servidor, autenticación, API HTTP ni conexión automática con otros productos MW |

## Organización del código

```text
app/assembly/page.tsx                 Entrada de la aplicación y metadatos
components/assembly/
  AssemblyPlanner.tsx                 Interfaz, importación, guardado y escenarios
  store.ts                           Estado compartido y acciones con Zustand
  AssemblyScene.tsx                   Escena React Three Fiber y navegación
  AssemblyTimeline.tsx                Cronograma, fases y cursor de tiempo
  DependencyGraph.tsx                 Grafo de dependencias y selección
  assembly.css                       Estilos de la aplicación
  timeline.css                       Estilos de cronograma y grafo
core/assembly/
  types.ts                           Contratos del proyecto y resultados
  demo.ts                            Generador del proyecto de demostración
  validation.ts                      Validación del JSON de entrada
  engine.ts                          Programación, simulación y análisis
  engine.test.mts                    Pruebas de comportamiento del dominio
  README.md                          Supuestos y detalle técnico del motor
public/examples/mw-assembly-demo.json Proyecto completo importable
docs/assembly-planner.md              Esta guía
```

El dominio de `core/assembly` no depende de React, WebGL, red o servidor. `buildSchedule(project)` obtiene los hitos; `analyzePlan(project, schedule)` obtiene los conflictos. `getModuleState` y `getModulePosition` calculan estado y posición a partir del mismo cronograma y del tiempo absoluto. Retroceder el cursor vuelve a muestrear esas funciones, sin invertir una animación acumulada.

`AssemblyPlanner` calcula resultados cuando cambia el proyecto. El store conserva proyecto, selección, reproducción, modo, cámara y visibilidad. La escena se carga en el cliente y dispone de un mensaje alternativo cuando no puede iniciar WebGL. Las vistas comparten IDs; el cronograma y el grafo no mantienen copias de los módulos.

## Contrato JSON actual

El archivo contiene directamente un objeto `Project`, sin envoltorio. `types.ts` es la referencia de tipos y `validation.ts` aplica la validación al importarlo. El ejemplo publicado se genera mediante `createDemoProject()` y contiene todos los campos requeridos.

| Entidad | Campos principales |
| --- | --- |
| `Project` | `id`, `name`, `system`, `modules`, `cranes`, `trucks`, `crews`, `zones`, `sequence` |
| `AssemblyModule` | `id`, `name`, `type`, `position`, `rotation`, `level`, `weight`, `dimensions`, `centerOfGravity`, `liftMinutes`, `fixMinutes`, `connections`, `dependencies`, `truckId`, `crewId`, `notes` |
| `Crane` | `id`, `name`, `position`, `radius`, `capacity`, `height` |
| `Truck` | `id`, `name`, `moduleIds`, `arrival` |
| `Crew` | `id`, `name`, `type` |
| `SiteZone` | `id`, `name`, `type`, `position`, `size` |

Las posiciones usan `[x, y, z]` en metros: Y es vertical y X/Z forman la planta. La posición de un módulo es el centro de su base. `dimensions` utiliza `[ancho X, alto Y, profundidad Z]`; la presentación comercial 9 × 3 × 2,80 m se guarda como `[9, 2.8, 3]`. `rotation` expresa grados alrededor de Y; `level` comienza en cero; `weight` y la capacidad de grúa se expresan en toneladas métricas. `centerOfGravity` es un desplazamiento local desde la base del módulo y se conserva como dato.

Los IDs son identidades estables, no posiciones en una lista. `sequence` contiene cada ID de módulo exactamente una vez. `dependencies`, `truckId`, `crewId` y `moduleIds` deben apuntar a entidades existentes. Cada módulo debe figurar en las entregas de su camión asignado. `moduleIds` representa viajes sucesivos, con un módulo completo por viaje.

La validación rechaza valores de tipo incorrecto, números no finitos, IDs duplicados, referencias ausentes, ciclos y secuencias incompletas. Sus límites actuales son 256 módulos, 16 grúas, 256 camiones, 128 cuadrillas y 128 zonas. Una secuencia completa que contradiga el orden de sus predecesores puede importarse para analizarse y corregirse: el motor deja sin programar los módulos bloqueados y muestra conflictos.

El estado y el orden visible se derivan del cronograma y de `sequence`; no se guardan como propiedades adicionales del módulo. `Schedule` contiene `items`, `duration` y `craneMinutes`. Cada operación calculada contiene `moduleId`, `craneId`, `arrival`, `start`, `liftStart`, `positionStart`, `fixStart`, `release` y `end`. Exportar guarda entradas de planificación; el cronograma se reconstruye al importar.

## Reglas temporales y físicas del MVP

Los tiempos son minutos laborables desde el día 1 a las 08:00. Cada jornada dura 480 minutos; `480` se presenta como `D2 · 08:00`. La escala no incluye noches, fechas reales, fines de semana ni calendarios propios de recursos. Una maniobra que cabe en una jornada se desplaza al inicio de la siguiente cuando no puede terminar antes del cierre; una operación individual mayor que una jornada requiere revisar su duración y no queda resuelta por esta regla.

La grúa queda reservada durante preparación de 10 minutos, izaje configurable, posicionamiento de 8 minutos y fijación configurable. En `release` se libera la grúa y se habilitan los sucesores estructurales. La cuadrilla continúa ocupada durante 6 minutos de conexión, 8 de servicios/sellado y 4 de inspección. Son paquetes agregados de planificación. El cronograma agrupa estas tres últimas actividades bajo Control.

Las entregas llegan cuando lo permiten recursos y dependencias, a partir de la disponibilidad mínima `arrival` de cada camión. Después de comenzar el posicionamiento, el camión necesita 90 minutos para estar disponible en otro viaje. Una única playa de descarga permanece reservada hasta tres minutos después del inicio del posicionamiento. El motor permite paralelismo con varias grúas cuando no se solapan descarga, cuadrillas ni dependencias.

`Auto plan` es una heurística determinista: respeta dependencias, prioriza niveles bajos y estima disponibilidad de recursos con una ponderación de recorrido de 0,25 minutos por metro. Conserva una secuencia existente completa si la propuesta incrementaría su duración. No calcula un óptimo global.

Las trayectorias combinan elevación vertical, traslado horizontal y descenso. El análisis revisa radio en toma y destino, capacidad escalar, altura de gancho, apoyos, uso de recursos e intersecciones aproximadas con restricciones. Las zonas incluyen acceso, descarga, espera y acopio; el acceso todavía no genera un estudio de circulación.

El resultado es una estimación preliminar. No calcula tablas de carga dependientes de radio y pluma, viento, resistencia del suelo, reacciones de estabilizadores, aparejos reales, balance a partir del centro de gravedad, estabilidad por fase ni colisiones 3D detalladas. La ausencia de alertas significa que las reglas implementadas no detectaron conflictos; no constituye una certificación de montaje o izaje.

## Evolución del contrato y del producto

Las siguientes decisiones describen trabajo futuro; no están implementadas como API ni servicios actuales.

### Versionado e identidad

Introducir un envoltorio con `schemaVersion`, `projectId`, `revision`, `units`, `source` y `project`, acompañado de un esquema JSON publicable. El importador deberá seguir aceptando el objeto `Project` actual como formato heredado y migrarlo de forma explícita. La clave local `mw-assembly-project-v1` identifica el almacenamiento del MVP y no equivale a un esquema JSON versionado.

Los cambios compatibles pueden agregar campos opcionales; los cambios de unidades, significado o campos obligatorios requieren migración y una versión mayor. Las migraciones deben ser funciones puras probadas con archivos de versiones anteriores. Reordenar, copiar un escenario o recalcular no debe renumerar módulos ni alterar referencias. Incorporar `sourceModelId` y `sourceElementId` permitirá rastrear revisiones de modelos externos conservando la identidad interna.

Un futuro servicio HTTP puede exponer rutas bajo `/api/assembly/v1` para proyectos, revisiones, escenarios y cálculos. El servidor deberá validar los mismos contratos y devolver resultados con versión del motor y revisión del proyecto. Guardados con control de revisión, operaciones idempotentes y trazabilidad permitirán evitar sobrescrituras entre usuarios. Estas rutas aún no existen.

### Integración con MODELLWERK

| Producto o dominio | Intercambio propuesto |
| --- | --- |
| MW MOD / CONFIGURE | Identidad, geometría final, orientación, nivel y configuración del módulo |
| MATERIAL | Pesos y propiedades del módulo con procedencia y revisión |
| FACTORY | Disponibilidad de fabricación, liberación y fecha mínima de expedición |
| LOGISTICS | Viajes, asignación de transporte, llegada prevista y llegada real |
| SITE | Implantación, accesos, apoyos, zonas y restricciones de obra |
| QA/QC | Inspecciones, evidencias, incidencias y liberaciones verificadas |
| COMMISSIONING | Conexiones y puesta en servicio vinculadas a módulos y sistemas |

Los adaptadores deberán normalizar unidades y coordenadas, conservar IDs de origen y producir `Project` o sus sucesores versionados. La integración actual consiste en compartir repositorio, identidad visual y un contrato serializable; no hay sincronización automática con esos dominios.

### Próximas etapas

1. **Autoría de proyectos:** agregar/eliminar módulos, configurar edificios, editar dependencias, asignar recursos y dibujar zonas desde la interfaz; importar referencias geométricas manteniendo los IDs.
2. **Motor por tareas:** separar preparación, izaje, fijación, conexión e inspección en `Task` con predecesores, hitos, calendarios y requisitos de recursos. Agregar cuadrillas especializadas y restricciones configurables.
3. **Logística e ingeniería de maniobras:** viajes y entregas explícitos, múltiples áreas de descarga/acopio, rutas, curvas de carga, geometría de aparejos y verificaciones especializadas con sus supuestos documentados.
4. **Colaboración y ejecución:** proyectos persistentes, escenarios versionados, permisos, comparación entre plan y ejecución, evidencias, auditoría y adaptadores MW.
5. **Análisis avanzado:** rutas críticas, sensibilidad de duraciones, optimización con objetivos explícitos, consumo de recursos e informes exportables. Cada resultado deberá conservar la versión del motor y los datos que lo produjeron.

El motor puro y la separación entre entradas, resultados y vistas permiten desarrollar estas etapas sin acoplar los cálculos al renderizado 3D.

## Publicación en GitHub Pages

El sitio principal se publica desde `main` y la raíz del repositorio. Assembly Planner tiene una exportación separada, con `basePath` y recursos en `/modellwerk/assembly`, para conservar el visor existente. Desde el checkout de publicación:

```powershell
$env:NEXT_PUBLIC_DEPLOY_TARGET = "github-pages-assembly"
npm run build
Copy-Item -LiteralPath out/assembly -Destination assembly -Recurse -Force
Copy-Item -LiteralPath out/_next -Destination assembly/_next -Recurse -Force
Copy-Item -LiteralPath out/brand -Destination assembly/brand -Recurse -Force
Copy-Item -LiteralPath out/examples -Destination assembly/examples -Recurse -Force
```

Publicar junto con el código fuente, `assembly/` y el enlace de `index.html`. Los archivos con hash que ya no se usen pueden limpiarse en una revisión posterior; no deben borrarse sin comprobar que la versión actual dejó de referenciarlos. La URL es `https://nicosiderides.github.io/modellwerk/assembly/`.