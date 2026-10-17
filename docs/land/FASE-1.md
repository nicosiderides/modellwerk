# MW Land — Fase 1: lote, ficha normativa y caja máxima

Hecha el 17/10/2026. Abrir: doble clic en `abrir-land.bat` → http://localhost:3050/land

## Qué hace
- Mapa de Córdoba con foto aérea y parcelas del catastro (IDECOR). Búsqueda por dirección, cuenta o nomenclatura.
- Ficha del lote: frente, fondo, superficie, estado, zona, carácter urbanístico, protección patrimonial.
- Semáforo de uso para los 4 tipos (vivienda, departamentos, oficinas/locales, galpón).
- Caja máxima en 3D sobre el terreno real: retiros de frente, laterales y fondo, centro de manzana (manzanas típicas, regla 2/7), retiro en altura (desde la línea o desde el eje de calle, con el ancho de calle estimado con las manzanas del catastro).
- Números: superficie cubierta máxima, huella máxima (FOS), plantas, altura, unidades por densidad.
- Cada valor dice de dónde sale: Dato oficial / Interpretado / Estimado / Cargado por vos / A verificar. Todos se pueden cambiar a mano.

## Datos que usa (en vivo, desde el navegador)
Capas de IDECOR: parcelas, manzana, CBA_Ordenanza_8256 (todos sus campos), CBA_Ordenanza_8133, CBA_Centro_de_Manzana_8256, cba_inmuebles_catalogados, cba_area_de_proteccion_patrimonial, CBA_Red_Vial_8060.

## Lo que queda "a verificar" a propósito
- Retiro de frente por Art. 9 de la Ord. 8256 (depende de la cuadra).
- Centro de manzana en manzanas no típicas (rectangulares, triangulares, etc.).
- Plano límite a 45° (zonas que lo piden): se avisa, no se dibuja.
- Zonas con norma particular (RF, ordenanzas específicas): la caja es sólo de referencia.

## Archivos (todos nuevos; Galpones no se tocó)
- `app/land/page.tsx`
- `components/land/` — LandExperience, LandMap, LotSheet, overlays, store, land.css
- `core/land/` — types, buildingTypes, zoning/cordoba.ts, envelope/(poly, envelope).ts, geo/study.ts
- `core/land/land.test.mts` + `core/land/fixtures/cordoba-lotes.json` (11 lotes reales de prueba)

Pruebas: `node --experimental-strip-types --test core/land/land.test.mts`
