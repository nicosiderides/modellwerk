# MODELLWERK · Visor 2.0

Configurador de edificios modulares MW900 con edición por módulo, muros y aberturas, cómputos y guardado local de proyectos.

Versión web: https://nicosiderides.github.io/modellwerk/visor2.0/

En GitHub, el código fuente está en `apps/visor2.0/` y la exportación estática publicada por GitHub Pages está en `visor2.0/`. Cada aplicación instala y verifica sus dependencias por separado.

## Desarrollo

Con Node.js 22.18 o posterior, desde esta carpeta:

```sh
npm ci
npm run dev
```

## Verificación

```sh
npm run typecheck
npm run lint
npm run test:core
npm run test:assets
```

## Publicación en GitHub Pages

Desde esta carpeta, en PowerShell:

```powershell
$env:NEXT_PUBLIC_DEPLOY_TARGET = 'github-pages'
npm run build -- --webpack
Remove-Item Env:NEXT_PUBLIC_DEPLOY_TARGET
```

La exportación se genera en `out/` con la base `/modellwerk/visor2.0`. Copiar su contenido a la carpeta `visor2.0/` del repositorio de GitHub, reemplazando la exportación anterior. Publicar los cambios en `main`; GitHub Pages sirve la raíz del repositorio y requiere conservar el archivo `.nojekyll` para los recursos de Next.js.

La web guarda proyectos en el navegador y permite importar/exportar JSON. El prototipo de escritorio usa SQLite y requiere compilación propia; no se ejecuta dentro de GitHub Pages.

Ver [motor MW900](docs/MW900-ENGINE.md) y [prototipo de escritorio](docs/DESKTOP-PROTOTYPE.md) para detalles. Los scripts de Blender mencionados en esas notas pertenecen al proyecto de trabajo completo y no son necesarios para ejecutar el visor web.
