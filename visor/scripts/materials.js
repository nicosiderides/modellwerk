import * as THREE from 'three';
import { TEX, CATS, catState, catMeshes, wallState } from './config.js';

const tl = new THREE.TextureLoader();
const _cache = {};

function getTex(url, srgb) {
  if (!_cache[url]) {
    const t = tl.load(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
    _cache[url] = t;
  }
  return _cache[url];
}

function cloneTex(url, srgb) {
  const t = getTex(url, srgb).clone();
  t.needsUpdate = true;
  return t;
}

export function getFixedKey(n) {
  if (n.includes('vidrio')    || n.includes('glass')      || n.includes('cristal'))   return 'vidrio';
  if (n.includes('tubo')      || n.includes('viga')       || n.includes('ipn')        ||
      n.includes('columna')   || n.includes('estructura') || n.includes('perfil')     ||
      n.includes('correa')    || n.includes('cano'))                                   return 'estructura';
  if (n.includes('eps')       || n.includes('compriband') || n.includes('aislacion')) return 'eps';
  if (n.includes('sanitario') || n.includes('inodoro')    || n.includes('lavabo'))    return 'sanitario';
  if (n.includes('led')       || n.includes('luminaria'))                              return 'led';
  return null;
}

export function fixedMat(n) {
  if (n.includes('vidrio') || n.includes('glass') || n.includes('cristal'))
    return new THREE.MeshPhysicalMaterial({
      color:             0xffffff,
      transmission:      1.0,    // 100% claro
      roughness:         0.03,   // casi liso, micro-difusión natural
      metalness:         0,
      ior:               1.52,
      // thickness=0 → SIN distorsión refractiva. La geometría del vidrio
      // ya tiene ambos lados (12 caras/pane) así que no necesitamos SSR.
      thickness:         0,
      envMapIntensity:   1.2,    // mantiene reflejos del HDRI
      // FrontSide: cada cara de la geometría se rendea una sola vez.
      // DoubleSide acá hace que rendee la misma superficie 2 veces = fantasma.
      side:              THREE.FrontSide,
    });
  if (n.includes('tubo') || n.includes('viga') || n.includes('ipn') || n.includes('columna') || n.includes('estructura') || n.includes('perfil') || n.includes('correa') || n.includes('cano'))
    return new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: .78, metalness: .35 });
  if (n.includes('eps') || n.includes('compriband') || n.includes('aislacion'))
    return new THREE.MeshStandardMaterial({ color: 0xe0dbd0, roughness: .92, metalness: 0 });
  if (n.includes('sanitario') || n.includes('inodoro') || n.includes('lavabo'))
    return new THREE.MeshStandardMaterial({ color: 0xf8f8f8, roughness: .08, metalness: 0 });
  if (n.includes('led') || n.includes('luminaria'))
    return new THREE.MeshStandardMaterial({ color: 0xfff8e8, emissive: new THREE.Color(0xfff8e8), emissiveIntensity: .9, roughness: .4 });
  return null;
}

export function buildPBR(mesh, setKey, tintHex, overrides = {}) {
  const s = TEX[setKey];
  if (!s) return null;

  mesh.geometry.computeBoundingBox();
  const sz = new THREE.Vector3();
  mesh.geometry.boundingBox.getSize(sz);
  const ws = new THREE.Vector3();
  mesh.getWorldScale(ws);

  const sX = sz.x * Math.abs(ws.x), sY = sz.y * Math.abs(ws.y), sZ = sz.z * Math.abs(ws.z);
  const W = Math.max(sX, sZ), H = sY > 0.05 ? sY : W;

  // overrides.uvScale escala el repeat de la opción (>1 = más fino, <1 = más grueso)
  const uvScale = overrides.uvScale ?? 1;
  const rX = Math.max(0.4, (W / s.ws) * uvScale);
  const rY = Math.max(0.4, (H / s.ws) * uvScale);

  const d  = cloneTex(s.d, true);
  const a  = cloneTex(s.a, false);
  const nr = cloneTex(s.n, false);
  d.repeat.set(rX, rY); a.repeat.set(rX, rY); nr.repeat.set(rX, rY);

  // Rotación opcional del UV (ej: chapa vertical → 90°).
  // Filtramos valores no-finite (Math.PI/0 = Infinity, NaN, etc.)
  const safeRot = (v) => (typeof v === 'number' && isFinite(v)) ? v : null;
  const rot = safeRot(overrides.rotate) ?? safeRot(s.rotate) ?? 0;
  console.log('[buildPBR]', setKey, 'rotation =', rot.toFixed(3), 'rad =', (rot * 180 / Math.PI).toFixed(1) + '°');
  if (rot !== 0) {
    for (const t of [d, a, nr]) {
      t.center.set(0.5, 0.5);
      t.rotation = rot;
      t.matrixAutoUpdate = true;
      t.updateMatrix();           // forzar recompute de la matriz UV
      t.needsUpdate = true;
    }
  }

  // Convención de normalmap: _nor_gl_ (OpenGL, +Y up) vs _nor_dx_ (DirectX, -Y).
  // Three.js usa OpenGL como base; con DX hay que invertir Y vía normalScale.
  const isDX = /_nor_dx[_.]/i.test(s.n);
  const normalScale = new THREE.Vector2(1, isDX ? -1 : 1);

  const mat = new THREE.MeshStandardMaterial({
    map: d, roughnessMap: a, metalnessMap: a, normalMap: nr,
    normalScale,
  });
  if (tintHex && tintHex !== '#ffffff') mat.color.set(tintHex);
  return mat;
}

// Construye el material a partir de una opción de categoría. Centraliza la
// lógica para que applyOption y applyOptionToWall compartan código.
function _buildMatForOpt(mesh, cat, opt) {
  if (cat.mode === 'color-only') {
    return new THREE.MeshStandardMaterial({
      color:     opt.c,
      roughness: opt.roughness ?? 0.55,
      metalness: opt.metalness ?? 0.05,
    });
  }
  // texture-swap (o tint): si la opción NO tiene texSet (ej: aluminio puro
  // sin textura), usar material sólido con metalness/roughness por opción.
  const texSet = cat.mode === 'tint' ? cat.texSet : opt.texSet;
  if (!texSet) {
    return new THREE.MeshStandardMaterial({
      color:     opt.c,
      roughness: opt.roughness ?? 0.55,
      metalness: opt.metalness ?? 0.05,
    });
  }
  return buildPBR(mesh, texSet, opt.c, { uvScale: opt.uvScale, rotate: opt.rotate })
      || new THREE.MeshStandardMaterial({ color: opt.c, roughness: .65 });
}

export function applyOption(catKey, idx) {
  const cat = CATS.find(c => c.key === catKey);
  if (!cat) return;
  const opt = cat.opts[idx];
  catState[catKey] = idx;

  catMeshes[catKey].forEach(mesh => {
    mesh.material = _buildMatForOpt(mesh, cat, opt);
  });

  // Si la categoría es multi-pared, también sincronizamos el estado por-pared.
  if (cat.multiWall && wallState[catKey]) {
    Object.keys(wallState[catKey]).forEach(wallId => wallState[catKey][wallId] = idx);
  }

  document.dispatchEvent(new CustomEvent('material-changed', {
    detail: { catKey, idx, label: cat.label, optName: opt.name },
  }));
}

/** Aplica una opción a UNA pared específica (solo categorías multiWall). */
export function applyOptionToWall(catKey, wallId, idx) {
  const cat = CATS.find(c => c.key === catKey);
  if (!cat || !cat.multiWall) return;
  const opt = cat.opts[idx];

  // Encontrar la malla de esa pared (taggeada en viewer.js con userData.wallId)
  const mesh = catMeshes[catKey].find(m => m.userData.wallId === wallId);
  if (!mesh) return;
  mesh.material = _buildMatForOpt(mesh, cat, opt);

  wallState[catKey][wallId] = idx;
  document.dispatchEvent(new CustomEvent('wall-changed', {
    detail: { catKey, wallId, idx, optName: opt.name },
  }));
}
