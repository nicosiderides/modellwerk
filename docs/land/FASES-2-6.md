# MW Land · Fases 2 a 6

Fecha: 17/10/2026. Hecho de corrido mientras Nico no estaba ("labura hasta completar las fases").
Todo lo que sigue funciona en `/land`. La app Galpones (`/galpones`) **no se tocó** (mismas huellas de archivo).

## Cómo se usa (pasos de arriba)

1. **Lote**: buscar el lote, ver la normativa y la caja máxima (Fase 1).
2. **Edificio** (Fase 2): elegir el tipo (vivienda, departamentos, oficinas/locales, galpón) y el tamaño: ancho, fondo, plantas, ubicación en el lote y retiro extra. Igual que en Galpones, si pedís más de lo que permite la zona, **frena** y avisa.
3. **Customizar** (Fase 3): estructura, fachada, colores, carpinterías, vidrios, techo y opciones (cocheras, amenities, pileta, paneles solares, etc.). Herramientas de vista: 3D, frente, lateral, planta, explotar, mostrar/ocultar la caja, escala humana, piso con foto aérea, plano o sin piso, y mostrar/ocultar grupos de piezas. Botón **Ficha** con la ficha técnica.
4. **Inversión** (Fase 4): construir y vender o construir y alquilar. Dólares, o pesos si cargás el tipo de cambio. Cada dato dice si es **real**, **estimado (demo)**, **pendiente** o **cargado por vos**. Resultados: ganancia, inversión, ventas, TIR, precio mínimo para no perder, y "¿qué pasa si…?" (precio ±, costo +, obra más larga).
5. **Informe** (Fase 5): informe imprimible / PDF, guardar escenarios, compararlos lado a lado y copiar un enlace para compartir.

- **Modo Simple / Profesional** (arriba a la derecha): el simple muestra respuestas claras; el profesional suma fuentes, verificación completa y el detalle de los números.
- **Convenio urbanístico** (Fase 6, dentro de Inversión): simula "más superficie / más altura a cambio de un aporte" (Ord. 13.557). Siempre dice **"sujeto a aprobación"**. Los porcentajes que trae son ejemplos para simular, **no** son valores de la ordenanza.

## Decisiones que tomé sin poder consultarte

- **No toqué el visor compartido** (`core/product-engine`). Para las piezas nuevas (losas, balcones, núcleo, parasoles…) usé las categorías que el visor ya tiene y les puse nombres propios de MW Land. Así Galpones queda igual.
- **Galpón**: usa exactamente la geometría y los modelos de Galpones (incluidos los modelos BIM de medida fija). La customización del galpón se hace dentro de MW Land con las mismas opciones que Galpones.
- **Los otros tres tipos** se arman sobre una grilla (módulo según tipo, como acordamos en la Fase 0) con piezas repetibles de la misma familia visual: platea, losas, columnas en grilla, vigas de borde, paños de fachada con aberturas, balcones, terrazas cuando el edificio se retira en altura, núcleo con ascensor, parapetos.
  - Vivienda: hasta 2 plantas, jardín de frente, techo plano o a dos aguas, galería, cochera.
  - Departamentos: balcones al frente, cocheras en PB opcionales, amenities en la azotea.
  - Oficinas: PB alta (4,5 m) para locales, parasoles verticales.
- **Medianeras**: si la zona no exige retiro lateral, ese lado queda ciego (sin ventanas).
- **Costos y precios**: son **valores demo** de referencia (obra: vivienda 950, deptos 1.050, oficinas 1.150, galpón 420 USD/m²; venta: 1.350 / 1.750 / 1.650 / 650 USD/m²). El terreno se estima en 280 USD por m² de lote (demo). Todos aparecen marcados como demo hasta que cargues los reales. Por eso el ejemplo de departamentos en zona A da pérdida: no es una conclusión, es el resultado con números de prueba.
- **Escenarios guardados** quedan en el navegador de cada persona. El **enlace para compartir** lleva todo adentro (lote, edificio, customización y números) y, al abrirlo, se busca el lote en el catastro y se rearma.
- En el **celular** los pasos de arriba se ocultan (se navega con los botones de abajo de cada panel) y las herramientas de vista quedan en una fila que se desliza.

## A verificar / pendiente

- Todos los costos, precios, honorarios, impuestos y plazos son **demo**: hay que reemplazarlos por valores reales de Córdoba.
- El aporte del convenio queda **pendiente** hasta que se cargue (se negocia en cada caso).
- La cantidad de departamentos/oficinas por planta es una estimación por superficie, no un proyecto.
- Prefactibilidad: **no reemplaza al profesional ni la consulta municipal**.

## Pruebas

- `node --experimental-strip-types --test core/land/*.test.mts` → 15 pruebas OK (normativa, caja, diseño que siempre cumple, freno, grilla, costos e inversión).
- TypeScript, ESLint y `next build` sin errores (genera `/land` estático, apto para GitHub Pages).
- Recorrido completo probado en un navegador (escritorio y celular): lote → edificio (4 tipos) → customizar → explotar → inversión → convenio → guardar → informe → copiar enlace → abrir el enlace en otra ventana (da el mismo resultado).
- No se publicó nada en GitHub.

## Archivos nuevos

- `data/land/{vivienda,departamentos,oficinas}/` (building, structure, envelope, options, pricing) y `data/land/galpon-pricing.json`.
- `core/land/design/` (tamaño, verificación, freno, costos), `core/land/kit/` (piezas 3D), `core/land/finance/` (simulación), `core/land/design.test.mts`.
- `components/land/`: LandViewer, DesignPanel, CustomizePanel, ViewTools, FinancePanel, Report, scenarios, useDesign, scene, materials.
- Modificados (de la Fase 1): `components/land/store.ts`, `LandExperience.tsx`, `LotSheet.tsx`, `land.css`.
