# MW Mod 1.0

Plataforma piloto de Modellwerk, independiente de `visor1.0` y de la aplicación que vive en la raíz del repositorio. No cambia sus archivos, dependencias ni procesos de publicación.

## Ejecutar localmente

Desde esta carpeta: `npm install` y `npm run dev -- --host 127.0.0.1 --port 3100`. Abrir http://localhost:3100. Requiere Node 22.13 o posterior; verificado con Node 24.15.

La base de datos y los archivos locales persisten dentro de `.wrangler/state`. No borrar esa carpeta si se quieren conservar proyectos y archivos. La copia alojada usa su propia base de datos y almacenamiento: no copia automáticamente los datos locales.

## Recorrido disponible

- Vista general y tres proyectos de demostración.
- Creación y búsqueda de proyectos; vista de tarjetas o lista.
- Configurador 3D conceptual con cantidad, disposición, envolvente, acabados y aberturas. Vistas completa, estructura y despiece visual; identificación por clic y cámara orbital.
- Guardado de revisiones con detección de conflictos. Los precios se calculan en centavos enteros, también en el servidor.
- Estimaciones inmutables por revisión, impresión / guardar como PDF desde el navegador y exportación JSON.
- Biblioteca privada de archivos GLB e IFC (máximo 10 MB). GLB autocontenido para visualización; IFC con diagnóstico básico, sin conversión de geometría.
- Recorrido didáctico por proyecto, progreso persistente y QR que identifica revisión. Una revisión nueva reinicia los pasos y un QR viejo produce advertencia.

## Límites del piloto

Todo el catálogo, los precios, las reglas y el 3D configurado son demostrativos. Las imágenes son referencias visuales preexistentes; no constituyen una vista exacta de las variantes conceptuales. No hay planos de taller, cómputo de fabricación, certificación BIM, cálculo estructural, firma contractual ni liberación de producción. El paquete de aberturas y cerramiento no declara prestaciones verificadas.

El IFC importado conserva su original y permite leer encabezado y conteos básicos. No se convierte en un producto paramétrico ni afecta precios. El visualizador GLB no implementa todos los decodificadores de compresión; un archivo no soportado sigue disponible para descargar. Los documentos de fabricación aprobados todavía deben incorporarse.

La identidad corresponde al propietario del espacio en Sites. Los registros y archivos están separados por esa identidad. El piloto no implementa membresías por empresa, invitaciones, roles de operario/comercial ni un portal público de clientes. El desarrollo local se sirve en loopback con la identidad de prueba del entorno. No exponer ese servidor a Internet. No se guardan datos de negocio en localStorage.

## Arquitectura

- `components/workspace.tsx`: recorridos y formularios.
- `components/module-viewer.tsx`: motor 3D Three.js, aislado de precios.
- `lib/domain.ts`: catálogo piloto, validación y cálculos.
- `lib/storage.ts`: identidad, aislamiento y persistencia D1.
- `app/api/workspace`: proyectos, revisiones, snapshots y aprendizaje.
- `app/api/assets`: diagnóstico y almacenamiento R2.
- `db/schema.ts` y `drizzle/`: esquema y migración versionada.

Las revisiones de cotizaciones son snapshots completos. Los cambios de configuración utilizan control optimista; no sobrescriben estimaciones anteriores. Los archivos se validan antes de almacenar y nunca se utilizan sus nombres como rutas de disco. Las solicitudes de escritura controlan origen y tamaño.

## Verificación

`npm run typecheck`, `npm run lint`, `npm test` y `npm run build`.

Con el servidor local activo, `node scripts/verify-integration.mjs` comprueba persistencia, conflictos, snapshots, controles de entrada y rechazo de importaciones inválidas. Utiliza un proyecto temporal identificado con un UUID y elimina únicamente sus registros al finalizar. No ejecutar contra producción.

La aplicación no se ha sometido a validación industrial ni a una auditoría de seguridad externa. Los próximos pasos son un catálogo real aprobado, asociaciones BIM-producto, permisos por equipo y revisión técnica antes de fabricar.
