import * as THREE from 'three';
import { GLTFLoader   } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader  } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader   } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass     } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass       } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass     } from 'three/addons/postprocessing/OutputPass.js';

import { norm, CATS, catMeshes, fixedMeshes } from './config.js';
import { fixedMat, getFixedKey, applyOption, applyOptionToWall } from './materials.js';
import { buildUI }                            from './ui.js';
import { buildFiltersUI, applyFilter }        from './filters.js';
import { initCamera, updateCamera, setOrbitFromModel, setFpsStart, setOrbitPose } from './camera.js';

// ─── Renderer ─────────────────────────────────────────────────────────────────

const vw = document.getElementById('vw');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(vw.clientWidth, vw.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.outputColorSpace  = THREE.SRGBColorSpace;
renderer.toneMapping       = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;
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
ssao.kernelRadius = 0.75;
ssao.minDistance  = 0.001;
ssao.maxDistance  = 0.14;
composer.addPass(ssao);
composer.addPass(new OutputPass());

// ─── Lighting ────────────────────────────────────────────────────────────────

// ─── Iluminación estilo "studio product viz" ─────────────────────────────────
// HDRI (vía scene.environment) → ambient + reflejos suaves de la pradera.
// Sun → key light fuerte con sombras definidas.
// Fill → key suave del lado opuesto para no perder detalle en sombras.
// Rim → contraluz tenue para separar el módulo del fondo oscuro.
scene.add(new THREE.AmbientLight(0xffffff, 0.12));

// KEY (sol cálido) — sombras definidas, key light dominante
const sun = new THREE.DirectionalLight(0xfff1df, 1.65);
sun.position.set(-7, 12, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);            // shadow más nítida
sun.shadow.bias   = -0.00015;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 8;
sun.shadow.camera.near   =   0.5; sun.shadow.camera.far    =  80;
sun.shadow.camera.left   = -15;   sun.shadow.camera.right  =  15;
sun.shadow.camera.top    =  15;   sun.shadow.camera.bottom = -15;
scene.add(sun);

// FILL (azulado frío) — abre las sombras del lado opuesto sin matarlas
const fill = new THREE.DirectionalLight(0xb7c4d2, 0.55);
fill.position.set(-6, 8, -6);
scene.add(fill);

// RIM (contraluz suave desde atrás) — separa el módulo del fondo gris oscuro
const rim = new THREE.DirectionalLight(0xffffff, 0.35);
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

function makeSitePlane(w, d, mat, x, z, y = -0.012) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  return mesh;
}

function makeSiteBox(w, h, d, mat, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeFenceLine(group, axis, fixed, from, to, matPost, matRail) {
  const postGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.45, 10);
  const postCount = 9;
  for (let i = 0; i < postCount; i++) {
    const t = i / (postCount - 1);
    const p = from + (to - from) * t;
    const post = new THREE.Mesh(postGeo, matPost);
    post.position.set(axis === 'x' ? p : fixed, 0.72, axis === 'x' ? fixed : p);
    post.castShadow = true;
    group.add(post);
  }

  const len = Math.abs(to - from);
  const center = (from + to) * 0.5;
  [0.45, 0.88, 1.25].forEach(y => {
    const rail = axis === 'x'
      ? makeSiteBox(len, 0.035, 0.035, matRail, center, y, fixed)
      : makeSiteBox(0.035, 0.035, len, matRail, fixed, y, center);
    group.add(rail);
  });
}

function addLightPole(group, x, z, matDark, matGlow) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 3.2, 12), matDark);
  pole.position.set(x, 1.6, z);
  pole.castShadow = true;
  group.add(pole);

  const arm = makeSiteBox(1.0, 0.045, 0.045, matDark, x + 0.42, 3.15, z);
  group.add(arm);

  const lamp = makeSiteBox(0.32, 0.12, 0.22, matGlow, x + 0.9, 3.05, z);
  group.add(lamp);

  const point = new THREE.PointLight(0xfff0d6, 0.8, 8, 2);
  point.position.set(x + 0.9, 2.9, z);
  group.add(point);
}

function addScaleFigure(group, matDark) {
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.25, 14), matDark);
  body.position.set(-6.7, 0.78, 3.4);
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10), matDark);
  head.position.set(-6.7, 1.55, 3.4);
  head.castShadow = true;
  group.add(head);
}

function createIndustrialSiteEnvironment() {
  const group = new THREE.Group();
  group.name = 'MW_Procedural_Industrial_Site';

  const concreteD = _loadTex('assets/textures/piso_cemento/concrete_floor_worn_001_diff_2k.jpg', true);
  const concreteA = _loadTex('assets/textures/piso_cemento/concrete_floor_worn_001_arm_2k.jpg', false);
  const concreteN = _loadTex('assets/textures/piso_cemento/concrete_floor_worn_001_nor_dx_2k.jpg', false);
  concreteD.repeat.set(12, 8);
  concreteA.repeat.set(12, 8);
  concreteN.repeat.set(12, 8);

  const matConcrete = new THREE.MeshPhysicalMaterial({
    color: 0x777a75,
    map: concreteD,
    roughnessMap: concreteA,
    normalMap: concreteN,
    normalScale: new THREE.Vector2(0.18, -0.18),
    roughness: 0.62,
    metalness: 0.02,
    clearcoat: 0.14,
    clearcoatRoughness: 0.28,
    envMapIntensity: 0.85,
  });
  const matGravel = new THREE.MeshStandardMaterial({ color: 0x746f64, roughness: 0.96 });
  const matGrass = new THREE.MeshStandardMaterial({
    map: gd,
    roughnessMap: ga,
    normalMap: gn,
    normalScale: new THREE.Vector2(0.6, -0.6),
    roughness: 1,
  });
  const matShed = new THREE.MeshStandardMaterial({ color: 0xb8b1a5, roughness: 0.82 });
  const matShedDark = new THREE.MeshStandardMaterial({ color: 0x242b30, roughness: 0.72, metalness: 0.18 });
  const matFrame = new THREE.MeshStandardMaterial({ color: 0x1f2225, roughness: 0.62, metalness: 0.35 });
  const matLine = new THREE.MeshStandardMaterial({ color: 0xd4bf74, roughness: 0.8 });
  const matPuddle = new THREE.MeshPhysicalMaterial({
    color: 0x1f2528,
    roughness: 0.03,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    envMapIntensity: 1.35,
  });
  const matGlow = new THREE.MeshStandardMaterial({
    color: 0xfff2d0,
    emissive: 0xffe2a8,
    emissiveIntensity: 1.1,
    roughness: 0.35,
  });

  group.add(makeSitePlane(26, 16, matConcrete, 0, 0));
  group.add(makeSitePlane(26, 3.0, matGravel, 0, 8.8, -0.018));
  group.add(makeSitePlane(26, 3.0, matGravel, 0, -8.8, -0.018));
  group.add(makeSitePlane(3.0, 16, matGrass, -14.5, 0, -0.018));
  group.add(makeSitePlane(3.0, 16, matGrass, 14.5, 0, -0.018));

  [
    [-5.1, 4.5, 1.35, 0.38, 0.08],
    [4.2, 4.8, 1.7, 0.44, -0.05],
    [6.8, -2.9, 1.15, 0.34, 0.15],
    [-7.6, -4.7, 1.45, 0.4, -0.18],
  ].forEach(([x, z, sx, sz, rot]) => {
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 48), matPuddle);
    puddle.rotation.x = -Math.PI / 2;
    puddle.rotation.z = rot;
    puddle.position.set(x, 0.01, z);
    puddle.scale.set(sx, sz, 1);
    group.add(puddle);
  });

  // Nave de fondo: marco visual sin competir con el módulo.
  makeFenceLine(group, 'x', 7.7, -11.5, 11.5, matFrame, matFrame);

  addLightPole(group, -10.7, 6.7, matFrame, matGlow);
  addLightPole(group, 9.8, 6.6, matFrame, matGlow);
  addScaleFigure(group, matFrame);

  // Marcas discretas de playa de maniobra.
  [-4.5, -2.8, -1.1, 0.6].forEach(x => {
    group.add(makeSiteBox(0.055, 0.01, 2.8, matLine, x, 0.008, 5.8));
  });
  group.add(makeSiteBox(7.0, 0.01, 0.055, matLine, -1.95, 0.008, 4.4));

  group.traverse(o => {
    if (o.isMesh) o.matrixAutoUpdate = true;
  });
  return group;
}

function addSimplePallet(group, matWood, matDark, x, z, rot = 0) {
  const pallet = new THREE.Group();
  pallet.rotation.y = rot;
  pallet.position.set(x, 0, z);

  [-0.38, 0, 0.38].forEach(px => {
    pallet.add(makeSiteBox(0.08, 0.12, 0.72, matWood, px, 0.08, 0));
  });
  [-0.28, 0, 0.28].forEach(pz => {
    pallet.add(makeSiteBox(0.9, 0.045, 0.08, matWood, 0, 0.17, pz));
  });
  pallet.add(makeSiteBox(0.92, 0.035, 0.74, matDark, 0, 0.21, 0));
  group.add(pallet);
}

function addTechnicalPerson(group, matDark, x, z) {
  const person = new THREE.Group();
  person.position.set(x, 0, z);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.2, 16), matDark);
  body.position.y = 0.74;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), matDark);
  head.position.y = 1.52;
  head.castShadow = true;
  person.add(body, head);
  group.add(person);
}

function addServiceTruck(group, matBody, matDark, matGlass, x, z, rot = 0) {
  const truck = new THREE.Group();
  truck.position.set(x, 0, z);
  truck.rotation.y = rot;
  truck.add(makeSiteBox(2.7, 1.0, 1.25, matBody, 0, 0.55, 0));
  truck.add(makeSiteBox(1.05, 0.78, 1.2, matBody, -1.75, 0.63, 0));
  truck.add(makeSiteBox(0.62, 0.36, 1.22, matGlass, -2.18, 0.88, 0));
  [-1.95, -0.95, 0.95].forEach(px => {
    [-0.68, 0.68].forEach(pz => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.18, 18), matDark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(px, 0.24, pz);
      wheel.castShadow = true;
      truck.add(wheel);
    });
  });
  group.add(truck);
}

function createShowroomIndustrialEnvironment() {
  const group = new THREE.Group();
  group.name = 'MW_Showroom_Industrial_Premium';

  const concreteD = _loadTex('assets/textures/piso_cemento/concrete_floor_worn_001_diff_2k.jpg', true);
  const concreteA = _loadTex('assets/textures/piso_cemento/concrete_floor_worn_001_arm_2k.jpg', false);
  const concreteN = _loadTex('assets/textures/piso_cemento/concrete_floor_worn_001_nor_dx_2k.jpg', false);
  concreteD.repeat.set(24, 18);
  concreteA.repeat.set(24, 18);
  concreteN.repeat.set(24, 18);

  const matConcrete = new THREE.MeshPhysicalMaterial({
    color: 0x555958,
    map: concreteD,
    roughnessMap: concreteA,
    normalMap: concreteN,
    normalScale: new THREE.Vector2(0.11, -0.11),
    roughness: 0.57,
    metalness: 0.02,
    clearcoat: 0.22,
    clearcoatRoughness: 0.34,
    envMapIntensity: 0.92,
  });
  const matAsphalt = new THREE.MeshStandardMaterial({ color: 0x2f3332, roughness: 0.84 });
  const matShed = new THREE.MeshStandardMaterial({ color: 0x24282b, roughness: 0.78, metalness: 0.12 });
  const matShedFace = new THREE.MeshStandardMaterial({ color: 0x34383a, roughness: 0.82, metalness: 0.08 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x141719, roughness: 0.62, metalness: 0.32 });
  const matLine = new THREE.MeshStandardMaterial({ color: 0xd1b46b, roughness: 0.72 });
  const matWhiteLine = new THREE.MeshStandardMaterial({ color: 0xd8d3c6, roughness: 0.8 });
  const matWood = new THREE.MeshStandardMaterial({ color: 0x9b6a37, roughness: 0.78 });
  const matTruck = new THREE.MeshStandardMaterial({ color: 0x4f5557, roughness: 0.58, metalness: 0.12 });
  const matGlassDark = new THREE.MeshPhysicalMaterial({
    color: 0x1f2b30,
    roughness: 0.04,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    transparent: true,
    opacity: 0.78,
    envMapIntensity: 2.0,
  });
  const matPuddle = new THREE.MeshPhysicalMaterial({
    color: 0x101416,
    roughness: 0.035,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    envMapIntensity: 1.25,
  });

  group.add(makeSitePlane(92, 72, matConcrete, 0, 0, -0.025));
  group.add(makeSitePlane(92, 9, matAsphalt, 0, 19, -0.024));

  const shed = new THREE.Group();
  shed.position.set(0, 0, -22);
  shed.add(makeSiteBox(34, 4.3, 0.35, matShedFace, 0, 2.15, 0));
  shed.add(makeSiteBox(35, 0.35, 3.2, matShed, 0, 4.35, 0.45));
  [-14, -10, -6, -2, 2, 6, 10, 14].forEach(x => {
    shed.add(makeSiteBox(0.08, 4.2, 0.42, matDark, x, 2.12, -0.01));
  });
  [-8, 0, 8].forEach(x => {
    shed.add(makeSiteBox(5.2, 1.1, 0.08, matGlassDark, x, 2.75, 0.2));
  });
  group.add(shed);

  [-7.5, -5.4, -3.3, -1.2, 0.9, 3.0].forEach(x => {
    group.add(makeSiteBox(0.055, 0.012, 4.6, matLine, x, 0.006, 7.4));
  });
  group.add(makeSiteBox(11.7, 0.012, 0.055, matLine, -2.25, 0.006, 5.1));
  group.add(makeSiteBox(14, 0.012, 0.045, matWhiteLine, 0, 0.007, -6.2));
  group.add(makeSiteBox(0.045, 0.012, 8.5, matWhiteLine, -7.0, 0.007, -2.0));
  group.add(makeSiteBox(0.045, 0.012, 8.5, matWhiteLine, 7.0, 0.007, -2.0));

  [
    [-6.0, 3.6, 1.15, 0.22, 0.1],
    [5.5, 4.2, 1.35, 0.26, -0.08],
    [8.5, -5.0, 0.9, 0.18, 0.22],
  ].forEach(([x, z, sx, sz, rot]) => {
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 56), matPuddle);
    puddle.rotation.x = -Math.PI / 2;
    puddle.rotation.z = rot;
    puddle.position.set(x, 0.01, z);
    puddle.scale.set(sx, sz, 1);
    group.add(puddle);
  });

  addTechnicalPerson(group, matDark, -6.8, 3.2);
  addServiceTruck(group, matTruck, matDark, matGlassDark, 12.5, 9.2, -0.12);
  addSimplePallet(group, matWood, matDark, -8.4, 6.3, 0.15);
  addSimplePallet(group, matWood, matDark, -9.6, 6.9, -0.08);

  const secondaryMat = new THREE.MeshStandardMaterial({ color: 0x383d3e, roughness: 0.72, metalness: 0.08 });
  const secondaryTrim = new THREE.MeshStandardMaterial({ color: 0x121416, roughness: 0.62, metalness: 0.25 });
  [-13.2, 13.4].forEach((x, i) => {
    const aux = new THREE.Group();
    aux.position.set(x, 0, -11.2 - i * 1.5);
    aux.rotation.y = i ? -0.2 : 0.18;
    aux.add(makeSiteBox(5.2, 2.15, 2.05, secondaryMat, 0, 1.08, 0));
    aux.add(makeSiteBox(5.35, 0.12, 2.2, secondaryTrim, 0, 2.22, 0));
    aux.add(makeSiteBox(1.15, 0.85, 0.08, matGlassDark, -1.5, 1.3, 1.06));
    aux.add(makeSiteBox(1.15, 0.85, 0.08, matGlassDark, 1.55, 1.3, 1.06));
    group.add(aux);
  });

  makeFenceLine(group, 'x', 13.8, -18, 18, matDark, matDark);

  group.traverse(o => {
    if (o.isMesh) o.matrixAutoUpdate = true;
  });
  return group;
}

const siteEnvironment = createShowroomIndustrialEnvironment();
scene.add(siteEnvironment);
floor.visible = false;

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

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const interactiveMeshes = [];
let hoveredMesh = null;
let hoverRestore = null;
let explodedActive = false;
let explodedAnimating = false;
let roofHidden = false;

const COMPONENT_LABELS = {
  roof: ['Cubierta', 'Sistema superior configurable. Permite inspeccion sin techo y sobretecho tecnico.'],
  floor: ['Piso', 'Paquete de piso interior y terminacion seleccionada.'],
  floorStructure: ['Estructura de piso', 'Bastidor inferior de acero para apoyo, transporte e izaje.'],
  roofStructure: ['Estructura de techo', 'Bastidor superior y rigidizacion del modulo.'],
  exterior: ['Panel exterior', 'Envolvente industrializada con terminacion configurable.'],
  interior: ['Panel interior', 'Revestimiento interior configurable por pared.'],
  ceiling: ['Cielorraso', 'Plano interior superior con iluminacion integrada.'],
  carpentry: ['Carpinteria', 'Aberturas y marcos con comportamiento independiente en exploded view.'],
  services: ['Instalaciones', 'Componentes MEP visibles en modos tecnico e instalacion.'],
  furniture: ['Equipamiento', 'Mobiliario o equipamiento interior segun alcance.'],
  structure: ['Estructura', 'Perfiles de acero y componentes portantes del sistema modular.'],
  default: ['Componente', 'Elemento del modelo BIM del modulo.'],
};

function componentTypeFromName(n) {
  if (n.includes('cielorraso') || n.includes('ceiling')) return 'ceiling';
  if (n.includes('piso') || n.includes('floor')) {
    if (n.includes('estructura') || n.includes('bastidor') || n.includes('perfil')) return 'floorStructure';
    return 'floor';
  }
  if (n.includes('techo') || n.includes('roof') || n.includes('cubierta')) {
    if (n.includes('estructura') || n.includes('bastidor') || n.includes('perfil')) return 'roofStructure';
    return 'roof';
  }
  if (n.includes('ventana') || n.includes('puerta') || n.includes('carp') || n.includes('abertura') || n.includes('aluminio')) return 'carpentry';
  if (n.includes('muro') || n.includes('wall') || n.includes('pared')) {
    if (n.includes('int') || n.includes('interior')) return 'interior';
    return 'exterior';
  }
  if (n.includes('sanitario') || n.includes('led') || n.includes('luminaria') || n.includes('electrica') || n.includes('instalacion')) return 'services';
  if (n.includes('mobiliario') || n.includes('furniture') || n.includes('mesa') || n.includes('silla')) return 'furniture';
  if (n.includes('tubo') || n.includes('viga') || n.includes('ipn') || n.includes('columna') || n.includes('estructura') || n.includes('perfil') || n.includes('correa')) return 'structure';
  return 'default';
}

function registerInteractiveMesh(mesh, normalizedName) {
  const type = componentTypeFromName(normalizedName);
  mesh.userData.componentType = type;
  mesh.userData.basePosition = mesh.position.clone();
  interactiveMeshes.push(mesh);
}

function prepareExplodedParts(model) {
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  interactiveMeshes.forEach(mesh => {
    const mbox = new THREE.Box3().setFromObject(mesh);
    const mcenter = mbox.getCenter(new THREE.Vector3());
    const radial = new THREE.Vector3(mcenter.x - center.x, 0, mcenter.z - center.z);
    if (radial.lengthSq() < 0.0001) radial.set(1, 0, 0);
    radial.normalize();
    let offset;
    switch (mesh.userData.componentType) {
      case 'roof':
      case 'roofStructure':
      case 'ceiling':
        offset = new THREE.Vector3(radial.x * .2, 1.35, radial.z * .2);
        break;
      case 'floorStructure':
        offset = new THREE.Vector3(radial.x * .15, -.55, radial.z * .15);
        break;
      case 'floor':
        offset = new THREE.Vector3(radial.x * .2, -.28, radial.z * .2);
        break;
      case 'exterior':
        offset = radial.multiplyScalar(1.25);
        break;
      case 'interior':
        offset = radial.multiplyScalar(.72);
        offset.y = .18;
        break;
      case 'carpentry':
        offset = radial.multiplyScalar(1.65);
        offset.y = .12;
        break;
      case 'services':
        offset = new THREE.Vector3(radial.x * .52, .55, radial.z * .52);
        break;
      default:
        offset = radial.multiplyScalar(.38);
    }
    mesh.userData.explodedOffset = offset;
  });
}

function tweenExploded(active, duration = 980) {
  if (explodedAnimating) return;
  explodedAnimating = true;
  explodedActive = active;
  const anims = interactiveMeshes.map(mesh => {
    const base = mesh.userData.basePosition || mesh.position;
    const offset = mesh.userData.explodedOffset || new THREE.Vector3();
    return {
      mesh,
      start: mesh.position.clone(),
      target: active ? base.clone().add(offset) : base.clone(),
    };
  });
  const t0 = performance.now();
  (function step() {
    const t = Math.min(1, (performance.now() - t0) / duration);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    anims.forEach(a => a.mesh.position.lerpVectors(a.start, a.target, e));
    if (t < 1) requestAnimationFrame(step);
    else explodedAnimating = false;
  })();
}

function setRoofHidden(hidden) {
  roofHidden = hidden;
  (catMeshes.EXT_TECHO || []).forEach(mesh => { mesh.visible = !hidden; });
  (fixedMeshes.techoEstructural || []).forEach(mesh => { mesh.visible = !hidden; });
}

function showComponentInfo(mesh, persistent = false) {
  const el = document.getElementById('component-info');
  if (!el || !mesh) return;
  const [title, body] = COMPONENT_LABELS[mesh.userData.componentType] || COMPONENT_LABELS.default;
  el.innerHTML = `<strong>${title}</strong><span>${body}</span><span class="component-name">${mesh.name || 'Mesh sin nombre'}</span>`;
  el.classList.add('show');
  if (!persistent) {
    clearTimeout(showComponentInfo.timer);
    showComponentInfo.timer = setTimeout(() => el.classList.remove('show'), 1400);
  }
}

function clearHover() {
  if (hoveredMesh && hoverRestore) {
    if (Array.isArray(hoveredMesh.material)) {
      hoveredMesh.material.forEach((mat, i) => {
        mat.emissive?.copy(hoverRestore[i]?.emissive || new THREE.Color(0x000000));
      });
    } else {
      hoveredMesh.material.emissive?.copy(hoverRestore.emissive || new THREE.Color(0x000000));
    }
  }
  hoveredMesh = null;
  hoverRestore = null;
}

function setHover(mesh) {
  if (hoveredMesh === mesh) return;
  clearHover();
  hoveredMesh = mesh;
  if (!mesh) return;
  if (Array.isArray(mesh.material)) {
    hoverRestore = mesh.material.map(mat => ({ emissive: mat.emissive?.clone() }));
    mesh.material.forEach(mat => mat.emissive?.set(0x1d63ff));
  } else {
    hoverRestore = { emissive: mesh.material.emissive?.clone() };
    mesh.material.emissive?.set(0x1d63ff);
  }
}

function onPointerMove(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(interactiveMeshes, false).find(item => item.object.visible);
  setHover(hit?.object || null);
}

renderer.domElement.addEventListener('pointermove', onPointerMove);
renderer.domElement.addEventListener('pointerleave', clearHover);
renderer.domElement.addEventListener('click', () => {
  if (hoveredMesh) showComponentInfo(hoveredMesh, true);
});

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

new RGBELoader().load('assets/hdri/factory_yard_2k.hdr', (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  // SOLO como environment (IBL/reflejos): NO se ve como background.
  // Intensidad controlada: reflejos vivos sin quemar vidrios ni metales.
  scene.environment = pmrem.fromEquirectangular(hdr).texture;
  if ('environmentIntensity' in scene) scene.environmentIntensity = 0.95;
  hdr.dispose();
  pmrem.dispose();
});

// Background: gris oscuro neutro tipo "studio". Limpio, no compite con el módulo.
scene.background = new THREE.Color(0x202423);
scene.fog = new THREE.Fog(0x202423, 28, 82);

// Sol direccional alineado para sombras bonitas
const SUN_ELEVATION_DEG = 22;
const SUN_AZIMUTH_DEG   = 132;
const _phi   = THREE.MathUtils.degToRad(90 - SUN_ELEVATION_DEG);
const _theta = THREE.MathUtils.degToRad(SUN_AZIMUTH_DEG);
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, _phi, _theta);
sun.position.copy(sunDir).multiplyScalar(50);
sun.target.position.set(0, 0, 0);
scene.add(sun.target);

let _activeScenePreset = 'commercial';
let _activeLightMood = 'day';

const SCENE_PRESETS = {
  commercial: {
    target: new THREE.Vector3(0, 1.35, 0),
    radius: 11.6,
    theta: Math.PI * 0.23,
    phi: 0.96,
  },
  technical: {
    target: new THREE.Vector3(0, 1.85, 0),
    radius: 12.8,
    theta: Math.PI * 0.68,
    phi: 0.82,
  },
  logistics: {
    target: new THREE.Vector3(1.2, 1.6, 0.2),
    radius: 16.5,
    theta: Math.PI * 0.36,
    phi: 0.68,
  },
  structure: {
    target: new THREE.Vector3(0, 1.55, 0),
    radius: 12.2,
    theta: Math.PI * 0.12,
    phi: 0.78,
  },
  interior: {
    target: new THREE.Vector3(0, 1.35, 0),
    radius: 7.2,
    theta: Math.PI * 0.52,
    phi: 1.08,
  },
  install: {
    target: new THREE.Vector3(.8, 1.75, 0),
    radius: 14.4,
    theta: Math.PI * 0.82,
    phi: 0.75,
  },
  exploded: {
    target: new THREE.Vector3(0, 1.65, 0),
    radius: 13.8,
    theta: Math.PI * 0.2,
    phi: 0.86,
  },
  front: {
    target: new THREE.Vector3(0, 1.35, 0),
    radius: 10.8,
    theta: Math.PI * .5,
    phi: 1.05,
  },
  side: {
    target: new THREE.Vector3(0, 1.35, 0),
    radius: 11.2,
    theta: 0,
    phi: 1.0,
  },
  axo: {
    target: new THREE.Vector3(0, 1.35, 0),
    radius: 12,
    theta: Math.PI * .25,
    phi: .82,
  },
  plan: {
    target: new THREE.Vector3(0, 0, 0),
    radius: 12,
    theta: Math.PI * .25,
    phi: .08,
  },
};

const PRESET_FILTER = {
  commercial: 'full',
  technical: 'technical',
  logistics: 'logistics',
  structure: 'structure',
  interior: 'interior',
  install: 'install',
  exploded: 'technical',
};

function applyScenePreset(key, duration = 900) {
  const preset = SCENE_PRESETS[key] || SCENE_PRESETS.commercial;
  _activeScenePreset = key;
  setOrbitPose(preset, duration);
  applyFilter(PRESET_FILTER[key] || 'full');
  if (key === 'exploded') tweenExploded(true);
  else if (explodedActive) tweenExploded(false);
  setRoofHidden(key === 'interior');
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === key);
  });
}

window.setScenePreset = (key) => applyScenePreset(key);
window.setCameraView = (key) => {
  const preset = SCENE_PRESETS[key] || SCENE_PRESETS.axo;
  setOrbitPose(preset, 820);
};
window.toggleExplodedView = () => tweenExploded(!explodedActive);
window.toggleRoof = () => setRoofHidden(!roofHidden);

window.setLightingMood = function(key) {
  _activeLightMood = key;
  const night = key === 'night';
  scene.background = new THREE.Color(night ? 0x111417 : 0x202423);
  scene.fog = new THREE.Fog(night ? 0x111417 : 0x202423, night ? 22 : 28, night ? 68 : 82);
  renderer.toneMappingExposure = night ? 0.78 : 0.98;
  sun.intensity = night ? 0.25 : 1.65;
  fill.intensity = night ? 0.18 : 0.55;
  rim.intensity = night ? 0.7 : 0.35;
  if ('environmentIntensity' in scene) scene.environmentIntensity = night ? 0.55 : 0.95;
  document.querySelectorAll('[data-light]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.light === key);
  });
};
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
  interactiveMeshes.length = 0;
  _carpMeshes.length = 0;
  _envDetected = false;
  explodedActive = false;
  roofHidden = false;
  clearHover();

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
        const meshName = norm(child.name);
        registerInteractiveMesh(child, meshName);
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

        const n  = meshName;
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
        siteEnvironment.visible = false;
        console.log('[ENV] Galpón detectado en GLB. Piso disc y contact shadow ocultos.');
      }

      // Computar dirección "outward" de cada carp mesh basada en su posición
      // relativa al centro del modelo (requiere model ya posicionado en escena).
      _computeCarpDirections(model);
      prepareExplodedParts(model);

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
      applyScenePreset(_activeScenePreset, 0);

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
