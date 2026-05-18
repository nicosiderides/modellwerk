import * as THREE from 'three';
import { GLTFLoader   } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader  } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader   } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass     } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass       } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass     } from 'three/addons/postprocessing/OutputPass.js';
// (Antes acá había integración Gaussian Splat con mkkellogg y luego gsplat.js;
// ambos sin éxito en nuestro setup. Pivoteamos a entorno 3D dentro del GLB.)

import { norm, CATS, catMeshes, fixedMeshes } from './config.js';
import { fixedMat, getFixedKey, applyOption, applyOptionToWall } from './materials.js';
import { buildUI }                            from './ui.js';
import { buildFiltersUI }                     from './filters.js';
import { initCamera, updateCamera, setOrbitFromModel, setFpsStart } from './camera.js';

// ─── Renderer ─────────────────────────────────────────────────────────────────

const vw = document.getElementById('vw');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(vw.clientWidth, vw.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.outputColorSpace  = THREE.SRGBColorSpace;
renderer.toneMapping       = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;     // ligeramente sobre-expuesto = colores más vivos
vw.appendChild(renderer.domElement);

// ─── Scene & Camera ──────────────────────────────────────────────────────────

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, vw.clientWidth / vw.clientHeight, 0.05, 300);
camera.position.set(10, 5, 10);

// ─── Post-processing ──────────────────────────────────────────────────────────

// MSAA render target (WebGL2): da bordes suaves dentro del pipeline de
// post-procesado. Sin esto, el composer bypasea el AA del renderer y los
// bordes se ven facetados/dentados.
const _msaaTarget = new THREE.WebGLRenderTarget(
  vw.clientWidth, vw.clientHeight,
  {
    samples: 4,                                       // 4x MSAA (subir a 8 si la GPU aguanta)
    type:    THREE.HalfFloatType,                     // preserva rango HDR del tone mapping
    colorSpace: THREE.LinearSRGBColorSpace,
  }
);
const composer = new EffectComposer(renderer, _msaaTarget);
composer.addPass(new RenderPass(scene, camera));
const ssao = new SSAOPass(scene, camera, vw.clientWidth * 0.5, vw.clientHeight * 0.5);
ssao.kernelRadius = 0.3;
ssao.minDistance  = 0.001;
ssao.maxDistance  = 0.06;
composer.addPass(ssao);
composer.addPass(new OutputPass());

// ─── Lighting ────────────────────────────────────────────────────────────────

// ─── Iluminación estilo "studio product viz" ─────────────────────────────────
// HDRI (vía scene.environment) → ambient + reflejos suaves de la pradera.
// Sun → key light fuerte con sombras definidas.
// Fill → key suave del lado opuesto para no perder detalle en sombras.
// Rim → contraluz tenue para separar el módulo del fondo oscuro.
scene.add(new THREE.AmbientLight(0xffffff, 0.05));

// KEY (sol cálido) — sombras definidas, key light dominante
const sun = new THREE.DirectionalLight(0xffeacc, 3.2);
sun.position.set(8, 18, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);            // shadow más nítida
sun.shadow.bias   = -0.00015;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 4;                          // sombras un poco más definidas
sun.shadow.camera.near   =   0.5; sun.shadow.camera.far    =  80;
sun.shadow.camera.left   = -15;   sun.shadow.camera.right  =  15;
sun.shadow.camera.top    =  15;   sun.shadow.camera.bottom = -15;
scene.add(sun);

// FILL (azulado frío) — abre las sombras del lado opuesto sin matarlas
const fill = new THREE.DirectionalLight(0xa8c0e0, 0.35);
fill.position.set(-6, 8, -6);
scene.add(fill);

// RIM (contraluz suave desde atrás) — separa el módulo del fondo gris oscuro
const rim = new THREE.DirectionalLight(0xffffff, 0.6);
rim.position.set(0, 6, -10);
scene.add(rim);

// ─── Floor ────────────────────────────────────────────────────────────────────
// Concreto pulido tipo loft industrial: matchea el lenguaje del HDRI peppermint.
// Roughness 0.65 + leve metalness 0.05 → refleja sutilmente el environment.
// Es el efecto "showroom Vitra" — el módulo se asienta en una superficie
// premium sin que el piso compita visualmente.

const _tl = new THREE.TextureLoader();
function _loadTex(url, srgb) {
  const t = _tl.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
  return t;
}

// Piso circular de pasto, 16m de diámetro. Espacio suficiente para que las
// sombras del módulo (9m de largo) caigan completas dentro del disco.
const FLOOR_RADIUS = 8;
const GRASS_REP = 6;            // tiles de pasto en el disco (densidad)
const gd = _loadTex('assets/suelo_pasto/aerial_grass_rock_diff_2k.jpg', true);
const ga = _loadTex('assets/suelo_pasto/aerial_grass_rock_arm_2k.jpg',  false);
const gn = _loadTex('assets/suelo_pasto/aerial_grass_rock_nor_dx_2k.jpg', false);
gd.repeat.set(GRASS_REP, GRASS_REP);
ga.repeat.set(GRASS_REP, GRASS_REP);
gn.repeat.set(GRASS_REP, GRASS_REP);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(FLOOR_RADIUS, 96),
  new THREE.MeshStandardMaterial({
    map: gd, roughnessMap: ga, metalnessMap: ga, normalMap: gn,
    normalScale: new THREE.Vector2(1, -1),
    roughness: 1.0,
    metalness: 0,
    envMapIntensity: 0.7,
  })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// subtle contact shadow under the module
const contactShadow = new THREE.Mesh(
  new THREE.CircleGeometry(5, 64),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .15, depthWrite: false })
);
contactShadow.rotation.x = -Math.PI / 2;
contactShadow.position.y = 0.005;
scene.add(contactShadow);

// ─── Entorno 3D dentro del GLB ───────────────────────────────────────────────
// La nave industrial está modelada en Blender con prefijo ENV_ y exportada en
// el mismo GLB. El handler en el traverse (más abajo) las identifica y las
// excluye del sistema de categorías + las taggea para iluminación/sombras.
//
// El floor disc y contact shadow tienen sentido cuando NO hay env (fallback).
// Cuando el GLB trae ENV_Galpon_*, los ocultamos automáticamente.
let _envDetected = false;
window.scene    = scene;
window.renderer = renderer;
window.camera   = camera;

// ─── Load helpers ─────────────────────────────────────────────────────────────

function setLoad(p, t) {
  document.getElementById('lof').style.width = p + '%';
  if (t) document.getElementById('lolb').textContent = t;
}

// ─── HDRI Environment + Background ───────────────────────────────────────────
// Estrategia "studio + context":
//  · environment = HDRI full strength → reflejos realistas en metales/vidrios
//  · background  = HDRI blurreado + atenuado → atmósfera sin distraer
//  · sun directional reducido → el HDRI ya carga buena parte del ambient
// Esto es lo que usan Vitra/USM/Kleusberg en sus configuradores.

setLoad(10, 'Cargando entorno...');

// ─── HDRI meadow_2 ───────────────────────────────────────────────────────────
// Pradera real 360° (cielo arriba + suelo de pasto abajo). Hace match natural
// con el floor disc de pasto. También provee IBL/reflejos para el módulo.
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();

new RGBELoader().load('assets/hdri/meadow_2_2k.hdr', (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  // SOLO como environment (IBL/reflejos): NO se ve como background.
  // environmentIntensity 1.3 → reflejos más vivos en metales/vidrios.
  scene.environment = pmrem.fromEquirectangular(hdr).texture;
  if ('environmentIntensity' in scene) scene.environmentIntensity = 1.3;
  hdr.dispose();
  pmrem.dispose();
});

// Background: gris oscuro neutro tipo "studio". Limpio, no compite con el módulo.
scene.background = new THREE.Color(0x1a1c20);

// Sol direccional alineado para sombras bonitas
const SUN_ELEVATION_DEG = 45;
const SUN_AZIMUTH_DEG   = 135;
const _phi   = THREE.MathUtils.degToRad(90 - SUN_ELEVATION_DEG);
const _theta = THREE.MathUtils.degToRad(SUN_AZIMUTH_DEG);
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, _phi, _theta);
sun.position.copy(sunDir).multiplyScalar(50);
sun.target.position.set(0, 0, 0);
scene.add(sun.target);
// La carga del modelo se dispara al final del script, después de que
// _currentModel / _loadModel estén declarados (sino: TDZ con `let`).

// ─── Material helpers ─────────────────────────────────────────────────────────

// Aluminio blanco para la puerta (matchea la referencia que pasó el cliente).
// Material standalone — no swappeable por el customizer.
function makePuertaMaterial() {
  return new THREE.MeshStandardMaterial({
    color:     0xeaeaea,
    roughness: 0.40,
    metalness: 0.55,
  });
}

// Busca el mesh del cielorraso por nombre y devuelve su Y inferior (la cara
// vista desde adentro). Si no lo encuentra, cae a una heurística del 70%
// del bbox total. Esto evita colocar las luces sobre la estructura externa.
function findInteriorCeilingY(model) {
  let y = null;
  model.traverse(o => {
    if (!o.isMesh) return;
    if (/cielorraso|cielo|ceiling/i.test(o.name)) {
      const b = new THREE.Box3().setFromObject(o);
      y = (y === null) ? b.min.y : Math.min(y, b.min.y);
    }
  });
  return y;
}

// Devuelve el bbox que solo incluye los muros (el "footprint" habitable),
// para que el centro y el largo de las luces no se desplacen por la
// estructura que sobresale arriba/abajo.
function findInteriorBox(model) {
  const box = new THREE.Box3();
  let found = false;
  model.traverse(o => {
    if (!o.isMesh) return;
    if (/muro|wall|piso|floor/i.test(o.name)) {
      box.expandByObject(o);
      found = true;
    }
  });
  return found ? box : new THREE.Box3().setFromObject(model);
}

// ─── Animación "Bajar/Subir estructura de techo" ─────────────────────────────
// La estructura del techo viene flotando sobre el módulo (estado "explotado"
// para mostrar el sistema constructivo). Esta animación la baja a su posición
// final apoyada sobre el techo. Toggle para volver a explotar.

let _structTop      = null;   // mesh de MW_EST_Estructura_Techo
let _structDeltaY   = 0;      // distancia (world units, ya escaladas) a bajar
let _structInitialY = 0;      // posición Y original (para volver a subir)
let _structLowered  = false;  // estado actual
let _structAnimating = false; // evita doble-click durante el tween

function _tweenY(obj, targetY, duration = 1400, onDone) {
  _structAnimating = true;
  const startY = obj.position.y;
  const t0 = performance.now();
  (function step() {
    const t = Math.min(1, (performance.now() - t0) / duration);
    // ease in-out cubic — natural para "drop" mecánico
    const e = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
    obj.position.y = startY + (targetY - startY) * e;
    if (t < 1) requestAnimationFrame(step);
    else { _structAnimating = false; if (onDone) onDone(); }
  })();
}

// ─── Animación "Exploded view de carpinterías" ──────────────────────────────
// Cuando el usuario clickea la tab "Carpintería", cada ventana/puerta se aleja
// PERPENDICULAR a su pared (no todas en la misma dirección). Esto genera un
// despiece arquitectónico real, como manual técnico de Vitra/Kleusberg.

const _carpMeshes = [];           // se llenan en el traverse del load
let _carpExploded  = false;
let _carpAnimating = false;

// Computa la dirección outward de cada mesh: vector desde el centro del modelo
// al centro del mesh, proyectado al eje horizontal dominante (X o Z).
// Se llama una vez después del load (cuando model bbox ya está estable).
function _computeCarpDirections(model) {
  const modelBox = new THREE.Box3().setFromObject(model);
  const modelCenter = modelBox.getCenter(new THREE.Vector3());
  _carpMeshes.forEach(m => {
    const mbox = new THREE.Box3().setFromObject(m);
    const mcenter = mbox.getCenter(new THREE.Vector3());
    const dx = mcenter.x - modelCenter.x;
    const dz = mcenter.z - modelCenter.z;
    // Eje dominante: si |dx|>|dz|, mover en X (pared corta este/oeste).
    // Sino, mover en Z (pared larga norte/sur).
    const dir = (Math.abs(dx) > Math.abs(dz))
      ? new THREE.Vector3(Math.sign(dx), 0, 0)
      : new THREE.Vector3(0, 0, Math.sign(dz));
    m.userData.outwardDir = dir;
  });
}

function _tweenCarpExploded(distance, duration = 800) {
  if (_carpAnimating || _carpMeshes.length === 0) return;
  _carpAnimating = true;
  const anims = _carpMeshes.map(m => {
    const dir = m.userData.outwardDir || new THREE.Vector3(0, 1, 0);
    const orig = m.userData.origPosition;
    return {
      mesh:   m,
      startPos: m.position.clone(),
      targetPos: new THREE.Vector3(
        orig.x + dir.x * distance,
        orig.y + dir.y * distance,
        orig.z + dir.z * distance,
      ),
    };
  });
  const t0 = performance.now();
  (function step() {
    const t = Math.min(1, (performance.now() - t0) / duration);
    const e = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
    anims.forEach(a => {
      a.mesh.position.lerpVectors(a.startPos, a.targetPos, e);
    });
    if (t < 1) requestAnimationFrame(step);
    else _carpAnimating = false;
  })();
}

window.toggleCarpExploded = function(exploded) {
  if (exploded === _carpExploded) return;
  _carpExploded = exploded;
  _tweenCarpExploded(exploded ? 2.0 : 0);   // 2 metros outward o vuelve a 0
};

window.toggleStructure = function() {
  if (!_structTop || _structAnimating) return;
  const target = _structLowered ? _structInitialY : (_structInitialY - _structDeltaY);
  _structLowered = !_structLowered;
  _tweenY(_structTop, target);
  const btn = document.getElementById('bAssem');
  if (btn) btn.textContent = _structLowered ? 'Subir estructura' : 'Bajar estructura';
};

// Luces interiores — posicionadas DEBAJO del cielorraso real, no del bbox total.
// Tag userData.isInterior por si después querés intensificarlas en modo Recorrer.
const _interiorLights = [];
function addInteriorLights(model) {
  // Remover anteriores (al recargar modelo)
  while (_interiorLights.length) {
    const l = _interiorLights.pop();
    scene.remove(l);
  }

  const intBox = findInteriorBox(model);
  const size   = intBox.getSize(new THREE.Vector3());
  const center = intBox.getCenter(new THREE.Vector3());

  // Cielorraso real (cara inferior). Si no se encuentra, fallback a 90% del alto interior.
  const ceilingY = findInteriorCeilingY(model) ?? (intBox.min.y + size.y * 0.9);
  const lightY   = ceilingY - 0.15;              // 15cm bajo el cielorraso

  // 2 luces a lo largo del eje X (largo del módulo)
  const ox = size.x * 0.28;
  for (const sign of [-1, 1]) {
    const lt = new THREE.PointLight(0xfff0d4, 12, 9, 1.8);
    lt.position.set(center.x + sign * ox, lightY, center.z);
    lt.castShadow = false;                       // perf
    lt.userData.isInterior = true;
    scene.add(lt);
    _interiorLights.push(lt);
  }

  // Log para verificar en consola que la altura es correcta
  console.log('[interior lights]', {
    ceilingY: ceilingY?.toFixed(3),
    lightY:   lightY.toFixed(3),
    count:    _interiorLights.length,
  });
}

// ─── GLB ─────────────────────────────────────────────────────────────────────

let _currentModel = null;

function _loadModel(url) {
  // eliminar modelo anterior
  if (_currentModel) { scene.remove(_currentModel); _currentModel = null; }
  CATS.forEach(c => { catMeshes[c.key] = []; });
  Object.keys(fixedMeshes).forEach(k => { fixedMeshes[k] = []; });

  setLoad(25, 'Cargando modelo...');

  const draco = new DRACOLoader();
  draco.setDecoderPath('https://unpkg.com/three@0.165.0/examples/jsm/libs/draco/gltf/');
  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(draco);
  gltfLoader.load(
    url,
    gltf => {
      setLoad(75, 'Procesando materiales...');
      const model = gltf.scene;
      _currentModel = model;

      // scale + center
      const b0 = new THREE.Box3().setFromObject(model);
      const s0 = new THREE.Vector3(); b0.getSize(s0);
      const maxD = Math.max(s0.x, s0.y, s0.z);
      const sf   = maxD > 100 ? (9 / maxD) * 0.001 : 9 / maxD;
      model.scale.setScalar(sf);

      const b1 = new THREE.Box3().setFromObject(model);
      const c1 = b1.getCenter(new THREE.Vector3());
      model.position.set(-c1.x, -b1.min.y, -c1.z);

      const b2 = new THREE.Box3().setFromObject(model);
      const s2 = new THREE.Vector3(); b2.getSize(s2);
      const footprint = Math.max(s2.x, s2.z);
      contactShadow.scale.set(footprint * .6 / 5, 1, footprint * .6 / 5);

      scene.add(model);
      model.updateWorldMatrix(true, true);

      // luces interiores calibradas al bounding box
      addInteriorLights(model);

      // Punto de aparición y datos para modo Recorrer.
      // - centro del módulo
      // - scaleFactor: para convertir metros reales → unidades de escena
      // - floorBox: bbox del PISO interior (no del modelo entero) → permite
      //   detectar cuándo la cámara entra al módulo y aplicar step up
      const bCenter = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
      let pisoMesh = null;
      model.traverse(m => {
        if (m.isMesh && /floor|piso/i.test(m.name) && !pisoMesh) pisoMesh = m;
      });
      const floorBox = pisoMesh ? new THREE.Box3().setFromObject(pisoMesh) : null;
      setFpsStart(bCenter, sf, floorBox);

      // assign materials
      model.traverse(child => {
        if (!child.isMesh) return;
        child.castShadow = child.receiveShadow = true;

        // Collect carp meshes para exploded view. Los nombres son ahora
        // MW_CARP_LargaSur / LargaNorte / CortaEste / CortaOeste tras separar por pared.
        // Cada uno se animará perpendicular a SU pared.
        if (/MW_CARP_|alum.de.cero|aberturas/i.test(child.name)) {
          if (!_carpMeshes.includes(child)) {
            child.userData.origPosition = child.position.clone();
            _carpMeshes.push(child);
          }
        }

        // ENV_*: piezas del entorno. NO entran al sistema de categorías,
        // mantienen el material del Blender (ya tienen PBR aplicado).
        // No tiran sombra (son contexto) pero sí reciben (el módulo proyecta sobre ellas).
        if (child.name.startsWith('ENV_')) {
          _envDetected = true;
          child.userData.isEnvironment = true;
          child.castShadow    = false;
          child.receiveShadow = true;
          return;
        }

        // Materiales especiales del GLB asignados por NOMBRE de material.
        // Tienen prioridad sobre el sistema de categorías (no swappeables).
        const mname = child.material?.name;

        if (mname === 'MAT_Vidrio') {
          // Reutilizamos el vidrio físico definido en materials.js (fixedMat)
          child.material   = fixedMat('vidrio');
          child.castShadow = false;
          return;
        }
        if (mname === 'MAT_Puerta_AluminioBlanco') {
          child.material = makePuertaMaterial();
          return;
        }

        // Paredes interiores: 4 sub-meshes con MAT_MurosInt_<wallId>.
        // Las tagueamos con userData.wallId para que el customizer pueda
        // aplicar materiales individuales por pared.
        if (mname && mname.startsWith('MAT_MurosInt_')) {
          const wallId = mname.replace('MAT_MurosInt_', '');
          child.userData.wallId = wallId;
          child.userData.origMat = child.material;
          // Cargar en la categoría INT_PARED para que el customizer las encuentre
          for (const cat of CATS) {
            if (cat.key === 'INT_PARED') {
              catMeshes[cat.key].push(child);
              break;
            }
          }
          return;
        }

        const n  = norm(child.name);
        const fm = fixedMat(n);
        if (fm) {
          child.material = fm;
          const fk = getFixedKey(n);
          if (fk) fixedMeshes[fk].push(child);
          return;
        }
        let hit = false;
        for (const cat of CATS) {
          if (typeof cat.match !== 'function') continue;   // safety: cats sin match (multi-wall)
          if (cat.match(n)) {
            child.userData.origMat = child.material;
            catMeshes[cat.key].push(child);
            hit = true;
            break;
          }
        }
        if (!hit) {
          console.log('[sin categoría]', child.name);
        }
      });

      // Si el GLB trae el entorno (ENV_*), ocultamos el piso disc + contact
      // shadow porque el galpón ya provee suelo. Si no, se mantienen como fallback.
      if (_envDetected) {
        floor.visible = false;
        contactShadow.visible = false;
        console.log('[ENV] Galpón detectado en GLB. Piso disc y contact shadow ocultos.');
      }

      // Computar dirección "outward" de cada carp mesh basada en su posición
      // relativa al centro del modelo (requiere model ya posicionado en escena).
      _computeCarpDirections(model);

      // ── Detectar la pieza superior de la estructura para la animación ──
      // De las 2 piezas de estructura (base + techo), la "techo" es la que
      // tiene el min.y más alto. El delta a bajar es la distancia entre su
      // base y el punto más alto del resto del modelo (= apoyado en el techo).
      const _structPieces = fixedMeshes['estructura'] || [];
      if (_structPieces.length >= 2) {
        _structTop = _structPieces.reduce((top, m) => {
          const yMin = new THREE.Box3().setFromObject(m).min.y;
          return (!top || yMin > new THREE.Box3().setFromObject(top).min.y) ? m : top;
        }, null);
        const topMinY = new THREE.Box3().setFromObject(_structTop).min.y;
        // Punto más alto del resto del modelo (el techo o muros)
        let maxOtherY = -Infinity;
        model.traverse(m => {
          if (!m.isMesh || _structPieces.includes(m)) return;
          const yMax = new THREE.Box3().setFromObject(m).max.y;
          if (yMax > maxOtherY) maxOtherY = yMax;
        });
        _structDeltaY   = Math.max(0, topMinY - maxOtherY);
        _structInitialY = _structTop.position.y;
        console.log('[estructura toggle] delta =', _structDeltaY.toFixed(3), 'm');
        const btn = document.getElementById('bAssem');
        if (btn) btn.disabled = false;
      }

      // fit orbit to model bounds
      const b3 = new THREE.Box3().setFromObject(model);
      const s3 = new THREE.Vector3(); b3.getSize(s3);
      setOrbitFromModel(
        new THREE.Vector3(0, s3.y * .4, 0),
        Math.max(s3.length() * 1.35, 10)
      );

      setLoad(100, 'Listo');
      setTimeout(() => document.getElementById('lo').classList.add('out'), 400);
    },
    xhr => { if (xhr.total) setLoad(25 + (xhr.loaded / xhr.total) * 50); },
    err => { console.error(err); document.getElementById('lolb').textContent = 'Error al cargar modelo'; }
  );
}

window.loadModel = _loadModel;

// Disparo inicial de carga (acá ya están todas las declaraciones inicializadas).
_loadModel('modulo_v01.glb');

// ─── UI & Controls ────────────────────────────────────────────────────────────

// Callback unificado: si viene wallId, se aplica solo a esa pared (multi-wall).
buildUI((catKey, idx, wallId) => {
  if (wallId) applyOptionToWall(catKey, wallId, idx);
  else        applyOption(catKey, idx);
});
buildFiltersUI();
initCamera(renderer.domElement, camera);

// ─── Resize ───────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  const w = vw.clientWidth, h = vw.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  _msaaTarget.setSize(w, h);   // mantener el MSAA buffer sincronizado
});

// ─── Render loop ─────────────────────────────────────────────────────────────

(function loop() {
  requestAnimationFrame(loop);
  updateCamera(camera);
  composer.render();    // pipeline completo: MSAA + SSAO + tone mapping
}());
