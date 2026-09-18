# MODELLWERK Desktop · prototipo local-first

Este prototipo conserva el configurador MW900 y agrega una carcasa Tauri 2. La misma interfaz puede seguir publicándose como exportación web; al ejecutarse dentro de Tauri cambia automáticamente al almacenamiento de escritorio.

## Funciones incluidas

- Biblioteca local de proyectos con SQLite.
- Restauración del último proyecto abierto.
- Guardado automático y guardado manual.
- Nuevo proyecto y cambio entre proyectos.
- Importación de JSON o `.mwproject` mediante diálogo nativo.
- Exportación de copias `.mwproject` mediante diálogo nativo.
- Límite de 5 MB y validación del contrato antes de importar.
- Instalador Windows NSIS configurado. El MSI se puede solicitar como bundle alternativo en un entorno con Windows Installer disponible.
- CSP y permisos de Tauri restringidos a los comandos utilizados.

La base SQLite se guarda en el directorio de datos de la aplicación asignado por Tauri. Los archivos `.mwproject` contienen el JSON versionado actual; cambiar la extensión no altera el contrato del motor.

## Desarrollo

Requisitos en Windows:

1. Microsoft C++ Build Tools con el componente "Desktop development with C++".
2. Rust estable con Cargo.
3. WebView2 Runtime, incluido normalmente en Windows 10 y 11.
4. Node.js y las dependencias de este proyecto.

Comandos:

```powershell
npm install
npm run desktop:icon
npm run desktop:dev
```

El primer comando de iconos genera los formatos requeridos por Windows a partir del favicon existente. Para producir instaladores:

```powershell
npm run desktop:build
```

Para pedir específicamente un MSI:

```powershell
npm exec tauri build -- --bundles msi
```

## Frontera técnica

`components/project/projectStorage.ts` es el adaptador desktop. `useProject.ts` conserva la historia de edición y decide en tiempo de ejecución entre SQLite y `localStorage`. El núcleo `core/building` no conoce Tauri, SQL ni React.

En la siguiente etapa conviene extraer el núcleo a un paquete independiente, agregar revisiones inmutables y sincronizar la biblioteca local con una API multiempresa.
