# Modellwerk — Configurador 3D de Módulos Habitables

## Visión del proyecto

**Modellwerk** es un estudio BIM argentino que está desarrollando un configurador web de módulos habitables industrializados. La meta a largo plazo es ofrecer al mercado argentino y latinoamericano un producto del nivel de **Kleusberg ModuLine** (Alemania), adaptado a la realidad local.

### Referencia estratégica: Kleusberg ModuLine

Kleusberg es una empresa alemana familiar fundada en 1948, con +1.400 empleados en 13 ubicaciones y +75 años de experiencia en construcción modular. Su sistema **ModuLine** es la referencia que define el rumbo de Modellwerk:

**Filosofía:** transición de un modelo de negocio basado en proyectos a uno **basado en productos**. Como explicó su CEO Oliver Hartmann: "estandarizamos lo que el usuario no ve, individualizamos todo lo demás". Esta es la filosofía que guía cada decisión técnica y de diseño de Modellwerk.

**Características de ModuLine que adoptamos como horizonte:**

- **Configurador online robusto** (https://www.kleusberg.de/moduline-konfigurator/konfigurator) que permite combinar diferentes tipos y tamaños de módulos en un sistema modular flexible
- **Garantía de precio fijo y plazo de entrega** (Festpreis- und Termingarantie) — un módulo Kleusberg se entrega 70-80% más rápido que construcción tradicional
- **Genehmigungsfähigkeit:** edificios aprobables como construcción permanente, no como contenedores temporarios — cumplen normativa térmica (GEG), protección contra incendios certificada, acústica y clima interior
- **Combinación flexible de módulos:** desde una escuela hasta un complejo de oficinas a partir del mismo sistema base
- **Trama de diseño flexible sin paredes interiores estructurales:** permite plantas de oficinas individuales hasta espacios open-space
- **Vidas múltiples:** los edificios pueden desmontarse, trasladarse, ampliarse o reducirse según evolución del cliente
- **Sustentabilidad sistémica:** producción optimizada en planta, reutilización al final de vida útil
- **App VR complementaria** para experiencia inmersiva más allá del configurador web
- **Pre-configuraciones:** el cliente puede partir de "módulos funcionales pre-configurados" (oficina, aula, baño) o desde cero
- **Personalización RAL:** colores de fachada custom según marca corporativa del cliente

### Posicionamiento de Modellwerk vs. competencia local

A diferencia de las empresas argentinas de "containers" o "casas modulares" tradicionales, Modellwerk apunta a:

1. Un producto **arquitectónicamente serio** (no estética industrial-contenedor)
2. **Configurador web de calidad internacional** que reduce el ciclo de venta consultiva
3. **Estandarización inteligente** que permite individualización amplia sin perder eficiencia productiva
4. Mercado objetivo: vivienda, oficinas, espacios educativos, retail premium

---

## Quién soy y cómo trabajar conmigo

**Soy Nicolás Siderides**, arquitecto BIM trabajando en ECOSAN (Argentina), ubicado en Córdoba. Sé poco de programación. El desarrollo lo hice iterando con Claude vía chat web. Ahora paso a Claude Code para trabajar más directamente sobre los archivos.

**Cómo prefiero trabajar:**

- Soy arquitecto, no programador. Explicame las cosas técnicas en términos arquitectónicos cuando puedas.
- Prefiero menos código por iteración pero mejor explicado.
- Cuando algo se ve raro, primero diagnosticá el problema antes de tirar código.
- Las decisiones grandes me las consultás antes.
- Tono español argentino (vos, cercano pero profesional).

---

## Estado actual del proyecto

### Repositorio GitHub

`https://github.com/nicosiderides/modellwerk`

Hosteado en GitHub Pages: `https://nicosiderides.github.io/modellwerk/`

### Estructura de archivos

```
modellwerk/
├── index.html                        # Web Modellwerk (estudio BIM ya operativo)
├── visor/
│   ├── index.html                    # Configurador 3D (en desarrollo activo)
│   ├── Modulo01.glb                  # Modelo BIM completo (con instalaciones, EPS, etc)
│   ├── Modulo02.glb                  # Simplificado, materiales renombrados
│   ├── Modulo03.glb                  # Muros unificados (en uso actualmente)
│   └── assets/
│       ├── hdri/
│       │   └── meadow_2_2k.hdr       # HDRI actual (a reemplazar)
│       ├── suelo_pasto/
│       │   ├── aerial_grass_rock_diff_2k.jpg
│       │   ├── aerial_grass_rock_arm_2k.jpg
│       │   └── aerial_grass_rock_nor_dx_2k.jpg
│       └── textures/
│           ├── ext_panel/            # rust_coarse_01_*  (revestimiento ext.)
│           ├── pared_madera/         # raw_plank_wall_*  (madera int.)
│           ├── piso_cemento/         # concrete_floor_worn_001_*
│           └── piso_madera/          # wood_shutter_*
```

### Stack técnico

- **Three.js v0.158** (CDN unpkg, ES modules)
- **GLTFLoader** para modelos GLB
- **RGBELoader** para HDRI
- **PMREMGenerator** para environment mapping
- **EffectComposer + SSAOPass** para ambient occlusion
- **GitHub Pages** (sin servidor propio)
- **HTML/CSS/JS vanilla** — sin frameworks

### Diseño visual

**Layout estilo Vans/Tesla con horizonte Kleusberg:**

```
┌──────────────────────────────────────────────────────────────┐
│ Header: Modellwerk · Configurar · Galería · Tecnología · CTA │
├────────────┬──────────────────────────────┬──────────────────┤
│ Sidebar    │  Visor 3D (full height)      │ Sidebar derecha  │
│ izq.       │  - Toggle Orbital/Recorrer   │                  │
│ (oscura)   │  - Customizador flotante     │ Resumen          │
│ Modelos    │    abajo con tabs            │ Especificaciones │
│ + steps    │  - Selector ambiente HDRI    │ Precio en grande │
│            │  - Debug categorías          │ CTA cotización   │
└────────────┴──────────────────────────────┴──────────────────┘
```

**Tipografía:** Fraunces (serif italiana) para títulos, Inter para UI, DM Mono para datos técnicos.

**Paleta:**
- Background: `#fafaf7` (crema claro)
- Ink: `#16161a` (negro suave)
- Accent: `#c4a572` (dorado tabaco)
- Accent strong: `#9a7d4f`
- Sidebar oscura: `#16161a`

---

## Sistema de detección de categorías

Como los nombres de **materiales** definidos en Revit NO viajan al GLB cuando se exporta vía FBX → Blender → GLB, el detector identifica categorías por **nombre de nodo/mesh**.

### Categorías y sus patrones

```js
function norm(s) { return s.toLowerCase().replace(/[_\-\.]/g, ' '); }

const CATEGORIES = [
  { key: 'EXT_REVESTIMIENTO', label: 'Rev. exterior', mode: 'tint',
    match: n => (n.includes('muro panel pir') || n.includes('basic wall') ||
                 n.includes('ext pared') || n.includes('mw ext')) &&
                !n.includes('cielorraso'),
    texSet: 'ext_panel',
    options: [/* 5 colores con tinte sobre textura PBR */]
  },
  { key: 'EXT_TECHO', label: 'Techo', mode: 'color-only',
    match: n => n.includes('chapa') || n.includes('ext techo'),
    options: [/* 4 colores planos */]
  },
  { key: 'INT_PARED', label: 'Pared interior', mode: 'tint',
    match: n => n.includes('zocalo') || (n.includes('madera') && !n.includes('puerta')),
    texSet: 'pared_madera',
    options: [/* 4 tonos sobre textura madera */]
  },
  { key: 'INT_CIELORRASO', label: 'Cielorraso', mode: 'color-only',
    match: n => n.includes('cielorraso'),
    options: [/* 3 colores */]
  },
  { key: 'PISO', label: 'Piso', mode: 'texture-swap',
    match: n => n.includes('floor') || n.includes('vinilico') || n.includes('piso'),
    options: [
      { texSet: 'piso_cemento', color: '#ffffff', name: 'Cemento alisado' },
      { texSet: 'piso_madera',  color: '#ffffff', name: 'Madera natural' },
      { texSet: 'piso_madera',  color: '#5a3a20', name: 'Madera oscura' },
      { texSet: 'piso_cemento', color: '#3a3a3a', name: 'Cemento oscuro' }
    ]
  },
  { key: 'CARP_MARCOS', label: 'Carpintería', mode: 'color-only',
    match: n => n.includes('ventana') || n.includes('aluminio') || n.includes('puerta'),
    options: [/* 4 colores: negro, aluminio, madera, blanco */]
  }
];
```

### Tres modos de customización

- **`tint`** — la textura PBR es fija pero el color base se multiplica por el tinte elegido (mantiene detalle de superficie)
- **`color-only`** — sin textura, solo color plano (chapas, marcos, cielorraso)
- **`texture-swap`** — la textura cambia entre opciones (cemento ↔ madera para piso)

### Materiales fijos (no customizables)

Función `getFixedMaterial(name)` detecta por palabras clave:
- Vidrios → `MeshPhysicalMaterial` con transmission
- Estructura (tubo, viga, IPN, columna) → metálico (metalness 0.85 — **a revisar, se ve azul**)
- EPS, compriband → mate gris
- Cañerías → metálico oscuro
- Sanitarios → cerámica blanca brillante
- LEDs → emisivo cálido

---

## Sistema de texturas PBR

```js
const TEX_SETS = {
  ext_panel:    { diff, arm, norm, worldScale: 1.5 },  // 1 textura cada 1.5m
  pared_madera: { diff, arm, norm, worldScale: 2.0 },
  piso_cemento: { diff, arm, norm, worldScale: 1.2 },
  piso_madera:  { diff, arm, norm, worldScale: 1.5 },
  suelo_pasto:  { diff, arm, norm, worldScale: 4.0 }
};
```

### Auto-escala UV por mesh

Cada mesh con textura PBR calcula su bounding box y aplica repetición proporcional al tamaño físico real. Esto mantiene la textura a escala física consistente (1 metro de panel siempre se ve igual de grande).

```js
const repeatX = Math.max(0.5, w / tex.worldScale);
const repeatY = Math.max(0.5, h / tex.worldScale);
```

---

## Iluminación y ambiente

### 3 presets de ambiente

- **`hdri`** — HDRI real desde repo + sol cenital + hemisférica
- **`day`** — gradiente procedural cielo claro + sol direccional
- **`studio`** — fondo neutro + luces mixtas

### Setup actual del modo HDRI (mediodía)

```js
sun = new THREE.DirectionalLight(0xfffaf0, 2.8);
sun.position.set(4, 18, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0003;
sun.shadow.radius = 4;

renderer.toneMappingExposure = 1.0;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
```

### Suelo

- `CircleGeometry(60, 96)` con material PBR de pasto
- Fade ring en el borde (50-60m) para fundirse con HDRI
- Sombra de contacto sutil bajo el módulo

### Post-processing

- `RenderPass`
- `SSAOPass` (kernelRadius: 0.4, minDistance: 0.001, maxDistance: 0.08)
- `OutputPass`

---

## Cámaras

### Modo Orbital

```js
let theta = Math.PI / 4, phi = Math.PI / 3.2, radius = 13;
camera.position.set(x, y + 1.2, z);
camera.lookAt(0, 1.5, 0);
```

Mouse drag para rotar, scroll para zoom.

### Modo FPS (recorrer)

- WASD para mover (PointerLock activado)
- Mouse para mirar
- ESC para salir
- Altura humana fija: 1.6m

---

## Tareas pendientes (en orden de prioridad)

### 1. Reemplazar HDRI actual
**Decisión tomada:** descargar `kloofendal_43d_clear_puresky_2k.hdr` de Poly Haven y subirlo a `assets/hdri/`. Cielo limpio sudafricano, sin árboles. Cuando esté:

```js
const HDRI_URL = REPO_BASE + 'assets/hdri/kloofendal_43d_clear_puresky_2k.hdr';
```

### 2. Generar `Modulo04.glb` con muros simplificados desde Revit
**Problema:** los paneles PIR de Revit son sándwich de 3 capas con UVs invertidas → textura "rayada" en el visor. **Solución:** en Revit reemplazar el tipo de muro `Basic Wall - Muro panel PIR` por uno simple de 1 capa de 80mm. Detalle del paso a paso:

1. Abrir Revit, seleccionar muro perimetral
2. Editar tipo → Duplicar → nombrar `MW_EXT_Simple`
3. Estructura → Editar → borrar capas → dejar 1 capa de 80mm
4. Aplicar a los 4 muros perimetrales
5. Exportar a Blender → exportar como `Modulo04.glb`

### 3. Estructura metálica se ve azul
**Causa:** `metalness: 0.85` refleja el cielo HDRI. **Decisión pendiente:** color objetivo. Probable: gris oscuro casi negro mate (steel frame Argentina), `metalness: 0.3-0.4`, `roughness: 0.7-0.8`.

### 4. Filtros de visualización (vistas tipo Kleusberg)

Inspirado en cómo Kleusberg permite explorar el sistema constructivo. Implementar selector flotante con vistas:

- Vista completa
- Solo estructura
- Solo paredes / sin techo
- Vista interior (sin paredes ext.) ← clave para mobiliario futuro
- Solo instalaciones
- Modo técnico (transparencias, capas constructivas)

Implementación: agregar botones flotantes que togglean `mesh.visible` por categoría. La detección por nombre ya existente sirve directamente.

### 5. Renombrar familias en Revit (mejora a futuro)

Para mayor robustez, prefijar familias en Revit:
- `MW_EXT_*` (revestimiento exterior)
- `MW_PIS_*` (pisos)
- `MW_INT_*` (interior)
- `MW_CARP_*` (carpintería)
- `MW_TEC_*` (techo)
- `MW_EST_*` (estructura)

El detector ya está preparado para reconocer estos prefijos.

### 6. Escalado del catálogo

Actual: 4-5 opciones por categoría. **Meta tipo Kleusberg:** llegar a tener mínimo 4 opciones por categoría con texturas reales y, eventualmente, **6-8 opciones premium**. Esto es lo que hace que un configurador "se sienta serio".

---

## Roadmap a largo plazo (inspirado en Kleusberg)

Cuando el configurador básico esté pulido, los próximos saltos hacia ser "el Kleusberg argentino":

### Fase 1 — Lo que estamos haciendo ahora
- Configurador de UN módulo (MW40)
- Customización de materiales en tiempo real
- Recorrido virtual interior/exterior

### Fase 2 — Multi-módulo (la gran idea de Kleusberg)
- Permitir **combinar múltiples tipos de módulos** en grid flexible
- Plantas configurables (escuela, oficina, vivienda)
- Pre-configuraciones funcionales (módulo cocina, módulo baño, módulo dormitorio)
- Sistema de "trama de diseño" sin paredes interiores estructurales

### Fase 3 — Customización profunda
- Mobiliario interior configurable
- Aberturas posicionables (ventanas, puertas)
- Equipamiento técnico (climatización, instalaciones)
- Colores RAL custom (no solo paleta predefinida)

### Fase 4 — Experiencia inmersiva
- App VR/AR companion (como Kleusberg)
- Renders fotorrealistas pre-hechos en Twinmotion para combinaciones populares
- Tour guiado interactivo

### Fase 5 — Producción y comercialización
- **Festpreis-und-Termingarantie:** precio fijo y plazo garantizado mostrados en el configurador
- Catálogo de proyectos referenciales (escuelas, oficinas, viviendas construidas)
- Sistema de cotización automatizado conectado al configurador
- Panel admin para actualizar opciones y precios sin tocar código

---

## Diferencias técnicas con Kleusberg que aceptamos por ahora

**Three.js puro NO puede llegar al fotorrealismo de un render Twinmotion/Unreal.** Esto está aceptado en el proyecto.

**Cuando hace falta calidad fotográfica:** se renderizan combinaciones populares en Twinmotion como imágenes fijas. Three.js queda para exploración interactiva. Es lo que hace el 90% de la industria (Vans, Tesla, IKEA).

**Pixel Streaming de Unreal Engine** queda como opción a futuro si el proyecto crece y justifica los US$200-500/mes de infraestructura.

---

## Modos de iteración rápida durante desarrollo

```bash
# Servidor local desde la carpeta visor
cd visor
python -m http.server 8000
# Abrir http://localhost:8000/

# O con Node:
npx serve visor
```

---

## Referencias visuales y conceptuales

- **Kleusberg ModuLine** (https://www.kleusberg.de/moduline-konfigurator/konfigurator) — referencia estratégica principal del producto
- **Vans Customs** (https://www.vans.com/es-es/customize) — referencia de UX de configurador
- **Tesla Configurator** — referencia de specs panel y precio
- **Porsche Newsroom sobre Kleusberg** (https://newsroom.porsche.com/en/2024/company/porsche-consulting-a-new-school-in-12-weeks-36324.html) — explica la filosofía "from project to product" que adoptamos como horizonte

---

## Cómo arrancar Claude Code en este proyecto

Una vez que Claude Code esté instalado y estés dentro del repo (`cd modellwerk`):

1. Ejecutar `claude` en la terminal
2. Como primer mensaje, pegar:

> Hola. Estoy continuando un proyecto que empecé en chat web con Claude. Antes de hacer nada, leé el archivo `CONTEXT.md` en la raíz del repo. Tiene todo: visión del proyecto, referencia estratégica (Kleusberg ModuLine), estado actual, sistema técnico construido y tareas pendientes priorizadas. Después de leerlo, decime qué tarea querés atacar primero y arrancamos.

3. La primera tarea recomendada es la **#1 (HDRI nuevo)** o la **#3 (estructura azul)** porque son las más visibles y rápidas.
