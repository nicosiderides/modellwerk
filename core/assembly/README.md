# MW Assembly Planner — motor de planificación preliminar

Este dominio funciona sin React, Three.js, red ni servidor. La interfaz y la escena consumen el mismo `Project` y el mismo `Schedule`; el estado visible se deriva del tiempo, por lo que pausar, retroceder y recorrer la timeline no acumula errores de animación.

## Datos y unidades

- `types.ts`: contrato JSON con IDs estables. `position` es el centro de la base del módulo; X/Z forman el plano e Y es altura. Dimensiones `[ancho, alto, profundidad]` en metros, orientación en grados, masa en toneladas métricas. Niveles desde cero.
- `demo.ts`: campamento MW900 de 24 módulos, 12 por nivel, dos columnas por seis filas. Una grúa, 12 camiones y dos cuadrillas de estructura.
- `engine.ts`: programación, estados, posiciones, conflictos, reordenamiento atómico y propuesta topológica.
- `validation.ts`: frontera de importación JSON. Rechaza tipos incorrectos, no finitos, IDs duplicados, referencias inexistentes, ciclos y secuencias incompletas. Hasta 256 módulos. Una geometría o secuencia insegura sigue siendo analizable; los conflictos se muestran en vez de ocultarlos.
- `engine.test.mts`: pruebas del motor con `node --experimental-strip-types --test core/assembly/engine.test.mts`.

## Supuestos explícitos del MVP

Los tiempos son minutos laborables desde el día 1 a las 08:00, con jornadas de ocho horas. No se representan noches ni fines de semana en la escala; `formatTime` identifica cada jornada. No se inicia un izaje que terminaría suspendido al cierre. Conexiones e inspección pueden continuar en la jornada siguiente.

Cada entrega transporta **un módulo completo**. Los 12 camiones del demo realizan **dos viajes sucesivos**, uno para cada módulo asignado; `moduleIds` no describe dos módulos cargados simultáneamente. `arrival` es la disponibilidad más temprana del camión. La llegada programada es justo a tiempo según recursos y predecesores. El retorno mínimo para otro viaje es 90 minutos desde el inicio del posicionamiento de la carga anterior. Se modela una única playa de descarga y tres minutos de despeje.

Cada operación reserva una grúa durante preparación (10 min), izaje (editable), posicionamiento/alineación (8 min) y fijación (editable). La liberación estructural habilita los sucesores. La cuadrilla permanece ocupada hasta terminar conexión (6 min), tareas de servicios/sellado (8 min) e inspección (4 min). Estas últimas son paquetes de tiempo agregados; aún no son trabajos certificados ni cuadrillas especializadas MEP/QA independientes. Dos grúas pueden trabajar en paralelo cuando playa, cuadrillas y dependencias lo permiten.

La trayectoria es aproximada: levantamiento vertical, traslado horizontal y descenso, a una cota de transporte dos metros sobre la altura máxima del edificio. Se verifican radio en toma y destino, capacidad escalar configurada, altura con dos metros de aparejos, dependencias, recursos y cruces de zonas. La envolvente del módulo se aproxima conservadoramente por su semidiagonal en planta. Los apoyos de grúa tienen un margen preliminar de tres metros.

El análisis **no constituye ingeniería de izaje certificada**. No incluye tabla de cargas por radio/pluma, viento, suelo, reacción de estabilizadores, aparejos reales, flecha, estabilidad estructural, fase resistente, balance por centro de gravedad ni colisiones 3D detalladas. El centro de gravedad se conserva como dato de proyecto; no se presenta como un cálculo. Las zonas peatonales generan advertencias; exclusiones, excavaciones y líneas aéreas interceptadas generan conflictos. Se detecta implantación de grúa dentro del edificio y acopio superpuesto a zonas NO STORAGE. ACCESS se conserva para la próxima fase logística; no se calcula un estudio completo de radios de giro o circulación.

## Planificación y evolución

La secuencia manual expresa prioridades constructivas. Reordenar es atómico: se rechaza una permutación que coloque un sucesor antes que su predecesor. Una secuencia importada que contradiga dependencias puede analizarse y corregirse con `autoPlan`; los módulos bloqueados no se montan artificialmente. `autoPlan` es una heurística determinista que prioriza niveles bajos y orden topológico, estima la próxima liberación con disponibilidad de camión/cuadrilla/grúa, y pondera distancia desde la última colocación a 0,25 minutos por metro. Conserva una planificación completa existente si la propuesta incrementa su duración. No promete un óptimo ni certifica estabilidad.

Para la siguiente etapa, separar cada paquete en `Task` con `predecessors`, `resourceRequirements`, calendario, hitos y cantidades; usar relaciones de fin-inicio desde fijación. Incorporar `Site`, `Building`, `Scenario`, curvas de carga de grúas, viajes por camión y entregas versionadas conservando los IDs actuales. Las futuras fuentes MW MOD / CONFIGURE / MATERIAL / FACTORY pueden producir módulos y pesos; LOGISTICS / SITE / QA/QC / COMMISSIONING pueden consumir tareas e hitos. La planificación actual se serializa íntegramente y puede reconstruir sus resultados a partir del mismo JSON.
