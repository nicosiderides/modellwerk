import * as THREE from 'three';

// ─── State ────────────────────────────────────────────────────────────────────

const EYE_HEIGHT_M    = 1.70;   // altura de ojos en METROS reales
const WALK_SPEED_M    = 0.06;   // metros por frame (~3.6 km/h, ritmo paseo)
// Estos valores se convierten a unidades de escena vía _scaleFactor

let mode       = 'orbit';
let fpsLocked  = false;
let yaw        = 0, pitch = 0;
const keys     = {};

let orbitTheta  = Math.PI / 5;
let orbitPhi    = Math.PI / 3.5;
let orbitRadius = 14;
const orbitTarget = new THREE.Vector3(0, 1.2, 0);
let orbitTween = null;

// Centro del modelo para el reposicionamiento al entrar en Recorrer.
// viewer.js lo setea via setFpsStart() después de cargar el GLB.
const fpsStart = new THREE.Vector3(0, 1.7, 0);
let fpsNeedsReset = false;     // se levanta al entrar en fps; updateCamera lo aplica en el sig. frame

// Factor de escala del modelo (Three.js scaled units por metro real).
// viewer.js lo provee para convertir metros → unidades de escena.
let _scaleFactor = 1;
// Bbox del piso interior (en unidades de escena). Si la cámara está dentro
// del footprint en XZ → se aplica step up (cámara más alta por subir el piso).
let _floorBox = null;

let oDrag = false, oLast = { x: 0, y: 0 };

// reusable vectors to avoid per-frame allocation
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

let _el = null; // renderer.domElement, set by initCamera()
let _camera = null; // se setea en initCamera para poder reposicionar desde setMode

// ─── Public ───────────────────────────────────────────────────────────────────

export function initCamera(rendererEl, camera) {
  _el = rendererEl;
  _camera = camera ?? null;

  // Orbital drag
  _el.addEventListener('mousedown', e => {
    if (mode === 'orbit') { oDrag = true; oLast = { x: e.clientX, y: e.clientY }; }
  });
  window.addEventListener('mousemove', e => {
    if (!oDrag || mode !== 'orbit') return;
    orbitTheta -= (e.clientX - oLast.x) * .005;
    orbitPhi    = Math.max(.08, Math.min(Math.PI * .46, orbitPhi + (e.clientY - oLast.y) * .005));
    oLast = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('mouseup', () => oDrag = false);

  // Zoom
  _el.addEventListener('wheel', e => {
    if (mode === 'orbit') orbitRadius = Math.max(2, Math.min(40, orbitRadius + e.deltaY * .014));
  }, { passive: true });

  // FPS — activate pointer lock on click
  _el.addEventListener('click', () => {
    if (mode === 'fps' && !fpsLocked) _el.requestPointerLock();
  });

  // Pointer lock state.
  // Si el usuario presionó ESC mientras estaba en fps, salimos automáticamente
  // a modo órbita (sino quedaba "trabado" sin poder mirar ni moverse).
  document.addEventListener('pointerlockchange', () => {
    const wasLocked = fpsLocked;
    fpsLocked = !!document.pointerLockElement;
    document.getElementById('ch').classList.toggle('active', fpsLocked && mode === 'fps');
    if (wasLocked && !fpsLocked && mode === 'fps') {
      window.setMode('orbit');
    }
  });

  // FPS look
  document.addEventListener('mousemove', e => {
    if (!fpsLocked || mode !== 'fps') return;
    yaw   -= e.movementX * .002;
    pitch  = Math.max(-.75, Math.min(.75, pitch - e.movementY * .002));
  });

  // WASD
  document.addEventListener('keydown', e => keys[e.code] = true);
  document.addEventListener('keyup',   e => keys[e.code] = false);
}

/** Called by viewer.js after the model loads to fit the orbit to the model bounds. */
export function setOrbitFromModel(target, radius) {
  orbitTarget.copy(target);
  orbitRadius = radius;
}

export function setOrbitPose({ target, radius, theta, phi }, duration = 900) {
  mode = 'orbit';
  if (_el && document.pointerLockElement === _el) document.exitPointerLock();
  fpsLocked = false;
  document.getElementById('bOrb')?.classList.toggle('active', true);
  document.getElementById('bFps')?.classList.toggle('active', false);
  document.getElementById('cust')?.classList.toggle('hidden', false);
  document.getElementById('ch')?.classList.remove('active');

  orbitTween = {
    start: performance.now(),
    duration,
    fromTarget: orbitTarget.clone(),
    toTarget: target ? target.clone() : orbitTarget.clone(),
    fromRadius: orbitRadius,
    toRadius: radius ?? orbitRadius,
    fromTheta: orbitTheta,
    toTheta: theta ?? orbitTheta,
    fromPhi: orbitPhi,
    toPhi: phi ?? orbitPhi,
  };
}

/**
 * Punto de aparición al entrar en modo Recorrer.
 * @param {THREE.Vector3} centerVec3  Centro del módulo en unidades de escena
 * @param {number}        scaleFactor Three.js units por metro real
 * @param {THREE.Box3}    floorBox    Bbox del piso interior (para step up)
 */
export function setFpsStart(centerVec3, scaleFactor = 1, floorBox = null) {
  fpsStart.copy(centerVec3);
  _scaleFactor = scaleFactor;
  _floorBox = floorBox;
  // Y de spawn: arriba del piso interior + 1.70m, todo en unidades de escena
  const floorTopY = floorBox ? floorBox.max.y : 0;
  fpsStart.y = floorTopY + EYE_HEIGHT_M * _scaleFactor;
}

// Devuelve la Y del "suelo" en la posición XZ actual.
// Si la cámara está dentro del footprint del piso interior → piso interior
// (= step up al entrar al módulo). Sino → suelo exterior (y=0).
function _groundYAt(x, z) {
  if (!_floorBox) return 0;
  const inside =
    x >= _floorBox.min.x && x <= _floorBox.max.x &&
    z >= _floorBox.min.z && z <= _floorBox.max.z;
  return inside ? _floorBox.max.y : 0;
}

/** Called every frame from the render loop in viewer.js. */
export function updateCamera(camera) {
  if (mode === 'orbit') {
    if (orbitTween) {
      const t = Math.min(1, (performance.now() - orbitTween.start) / orbitTween.duration);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      orbitTarget.lerpVectors(orbitTween.fromTarget, orbitTween.toTarget, e);
      orbitRadius = THREE.MathUtils.lerp(orbitTween.fromRadius, orbitTween.toRadius, e);
      orbitTheta = THREE.MathUtils.lerp(orbitTween.fromTheta, orbitTween.toTheta, e);
      orbitPhi = THREE.MathUtils.lerp(orbitTween.fromPhi, orbitTween.toPhi, e);
      if (t >= 1) orbitTween = null;
    }

    const x = orbitTarget.x + orbitRadius * Math.sin(orbitPhi) * Math.sin(orbitTheta);
    const y = orbitTarget.y + orbitRadius * Math.cos(orbitPhi);
    const z = orbitTarget.z + orbitRadius * Math.sin(orbitPhi) * Math.cos(orbitTheta);
    camera.position.set(x, y, z);
    camera.lookAt(orbitTarget);
    return;
  }

  // ── Modo FPS / Recorrer ─────────────────────────────────────────────────────

  // Reposicionamiento al entrar (cámara puede haber quedado lejos del módulo
  // por la órbita previa). Se hace en el primer frame del modo fps.
  if (fpsNeedsReset) {
    camera.position.copy(fpsStart);
    yaw = 0; pitch = 0;             // mira hacia -Z (interior del módulo)
    fpsNeedsReset = false;
  }

  _e.set(pitch, yaw, 0, 'YXZ');
  camera.quaternion.setFromEuler(_e);

  // Movimiento WASD solo cuando el cursor está capturado.
  // Velocidad en metros/frame, convertida a unidades de escena.
  const speed = WALK_SPEED_M * _scaleFactor;
  if (fpsLocked) {
    _f.set(0, 0, -1).applyQuaternion(camera.quaternion); _f.y = 0; _f.normalize();
    _r.set(1, 0,  0).applyQuaternion(camera.quaternion); _r.y = 0; _r.normalize();
    if (keys['KeyW'] || keys['ArrowUp'])    camera.position.addScaledVector(_f,  speed);
    if (keys['KeyS'] || keys['ArrowDown'])  camera.position.addScaledVector(_f, -speed);
    if (keys['KeyA'] || keys['ArrowLeft'])  camera.position.addScaledVector(_r, -speed);
    if (keys['KeyD'] || keys['ArrowRight']) camera.position.addScaledVector(_r,  speed);
  }

  // Altura = piso (interior o exterior según posición XZ) + 1.70m.
  // Esto produce el "step up" notorio al cruzar al interior del módulo.
  const groundY = _groundYAt(camera.position.x, camera.position.z);
  camera.position.y = groundY + EYE_HEIGHT_M * _scaleFactor;
}

// ─── Mode toggle (llamado desde los botones del HTML) ─────────────────────────

window.setMode = function(m) {
  if (m === mode) return;
  mode = m;
  document.getElementById('bOrb').classList.toggle('active', m === 'orbit');
  document.getElementById('bFps').classList.toggle('active', m === 'fps');
  document.getElementById('cust').classList.toggle('hidden', m === 'fps');

  const fh = document.getElementById('fh');
  if (m === 'fps') {
    fpsNeedsReset = true;          // updateCamera reposiciona en el sig. frame
    fh.classList.add('visible');
    setTimeout(() => fh.classList.remove('visible'), 3500);
    // requestPointerLock requiere user gesture — el click sobre el botón cuenta
    if (_el && document.pointerLockElement !== _el) _el.requestPointerLock();
  } else {
    fpsLocked = false;
    if (document.pointerLockElement) document.exitPointerLock();
    document.getElementById('ch').classList.remove('active');
  }
};
