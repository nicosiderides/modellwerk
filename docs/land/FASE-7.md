# MW Land · Fase 7: completar lo que pedía el pedido original

Fecha: 17/10/2026. Las fases 1 a 6 ya estaban. Revisé el pedido original punto por punto y sumé lo que faltaba.
La app Galpones (`/galpones`) **no se tocó** (mismas huellas de archivo). Se usan sus piezas sin cambiarlas.

## Qué se sumó

### Galpón completo, como en Galpones
- Alrededor de la nave aparece el mismo entorno de Galpones: veredas, playón de maniobras, estacionamiento, parquizado, luminarias y, con «Escala», el camión, los autos y el autoelevador.
- Se verifica si el camión entra y gira dentro del lote. Igual que en Galpones, eso **avisa pero no frena**. Ejemplo: «el camión sobresale 19,8 m del lote». Corriendo la nave hacia el fondo, el aviso desaparece.
- En Customizar hay una sección **Entorno** con: playón, parquizado, vereda perimetral, cantidad de cocheras, estacionamiento al costado o al fondo, y camión de diseño (semirremolque o rígido).
- Arreglo: ahora la nave se mide por fuera (muros incluidos) y con la marquesina del frente. Antes se medía entre ejes y podía pasarse unos centímetros de la caja.

### Entorno en vivienda, departamentos y oficinas
- Hay una vereda de acceso desde la línea municipal hasta la puerta, cuando hay retiro de frente.
- Hay un acceso vehicular hasta la cochera (vivienda) o hasta el portón de cocheras o la rampa del subsuelo.
- Opción nueva **Parquizado y árboles**: césped en lo libre del lote y árboles. No se ponen sobre la pileta, la galería ni los accesos.
- Con **«Sin piso»** se ven la calle, el cordón y la vereda pública sobre cada frente del lote. Con foto aérea o plano no se dibujan, porque ya se ven los reales (igual que en Galpones).
- Con **«Escala»** aparece un auto en la cochera o en el acceso.
- Si la vivienda no tiene un costado libre de 2,8 m, la cochera avisa.

### Herramientas que faltaban
- **Corte por piso** (botón «Corte»): corta el edificio a 1,2 m sobre el piso elegido y lo muestra en planta. Las flechas cambian de piso.
- **Comparar A/B con imagen:**
  - cada escenario guardado lleva una foto chica del 3D;
  - en la comparación se marca con ★ lo mejor de cada fila (más superficie, menos inversión, más ganancia y retorno);
  - con el botón de carpeta se vuelve a abrir el escenario.
- **Pedido de presupuesto:**
  - el botón está en el informe y en la ficha técnica;
  - el pedido adjunta el lote, el edificio, la memoria descriptiva y el escenario completo;
  - igual que en Galpones, hoy queda guardado en el navegador (modo demo, no se manda a nadie) y se puede descargar;
  - cuando haya una dirección para recibirlo, se carga en `NEXT_PUBLIC_LAND_QUOTE_ENDPOINT`.

### Detalles de cada tipo
- **Tamaño de los departamentos:** monoambiente, 1, 2 o 3 dormitorios. Cambia la cantidad de unidades, y con eso la densidad que se verifica.
- **Oficinas:** planta libre (una por piso) o divididas en oficinas de ~120 m² o ~60 m².
- **Tabiques entre unidades:** se ven por las ventanas y en el corte por piso.
- **Ventanas:** una o dos por módulo de la grilla. El tamaño sigue saliendo del tipo de ventana.
- **Cocheras en subsuelo** (departamentos y oficinas): suman el subsuelo y la rampa con portón al frente. El costo es por m² de planta baja (demo).
- **Oficinas:**
  - los «Locales en planta baja» ahora se ven (vidrieras) y, si se apagan, la planta baja lleva ventanas;
  - las «Cocheras» ahora tienen portón.
- **Inversión por unidad:** en departamentos y oficinas se puede poner el precio por unidad en vez de por m², para venta o alquiler. El precio mínimo para no perder también sale por unidad.

### Normativa en archivos de datos
- Las reglas que la capa oficial trae como texto por perfil están en `data/land/normativa/cordoba.json`, con fuentes y fecha. Esas reglas son los retiros laterales y de fondo de J1, J2, F1, N1, M, N y L, y la altura de referencia.
- Para otra ciudad se suma otro archivo igual. Comprobé con 360 casos que da exactamente lo mismo que antes.
- **Fraccionamiento (Ord. 8060):** aparece en la ficha del lote y en el informe como **«a verificar»**. Las medidas mínimas para subdividir no vienen en las capas y no se inventan.
- El informe dice de dónde salen los datos y la fecha de las reglas.

## Lo que sigue siendo «a verificar» o demo
- Todos los costos y precios son demo (incluidos el parquizado, el subsuelo y el precio por unidad).
- Fraccionamiento (Ord. 8060), retiro de frente por Art. 9 y plano límite a 45°.
- La cantidad de unidades es una estimación por superficie, no un proyecto de plantas.
- Prefactibilidad: no reemplaza al profesional ni la consulta municipal.

## Pruebas
- 21 pruebas automáticas OK: `node --experimental-strip-types --test core/land/*.test.mts`.
- TypeScript, ESLint y `next build` sin errores.
- Probado en el navegador, en escritorio y en celular:
  - galpón con entorno y avisos de camión;
  - departamentos con 2 dormitorios, dos ventanas, parquizado y subsuelo, corte en PB y P3, precio por unidad, dos escenarios comparados con imagen y pedido de presupuesto;
  - vivienda con cochera, pileta, galería, parquizado, calle y auto;
  - oficinas divididas en 60 m² y en planta libre, con corte;
  - recorrido completo y enlace compartido como antes.

## Publicación en GitHub Pages

URL: **https://nicosiderides.github.io/modellwerk/land/**

La carpeta `land/` (en la raíz del repo) es la exportación estática de la ruta `/land`, con `basePath` `/modellwerk/land` (igual que `galpones/`). Para regenerarla:

1. Cambiar **temporalmente** `next.config.ts` (no se publica este cambio):
   ```ts
   const base = "/modellwerk/land";
   const nextConfig = { output: "export", basePath: base, assetPrefix: base, trailingSlash: true, images: { unoptimized: true } };
   ```
2. Construir: `$env:NEXT_PUBLIC_ASSET_BASE_PATH = "/modellwerk/land"; npm run build`
3. Armar la carpeta `land/`:
   - los archivos sueltos de `out/land/` (`index.html`, `index.txt`, `__next.*.txt`);
   - `out/_next` → `land/_next`;
   - `out/brand`, `out/draco`, `out/basis`, `out/people`, `out/vendor` → `land/`;
   - `out/hdr/kloofendal_43d_clear_puresky_2k.hdr` → `land/hdr/`;
   - las carpetas de tipologías de `out/galpones/` (`industrial-light`, `industrial-pro`, `logistics`, `large-span`) → `land/galpones/`.
4. Restaurar `next.config.ts`.
