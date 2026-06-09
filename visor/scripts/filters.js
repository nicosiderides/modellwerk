import { CATS, catMeshes, fixedMeshes } from './config.js';

const ALL_CATS = ['EXT_REV', 'EXT_TECHO', 'INT_PARED', 'INT_CIEL', 'PISO', 'CARP'];
const ALL_FIXED = ['estructura', 'pisoEstructural', 'techoEstructural', 'vidrio', 'eps', 'sanitario', 'led', 'mobiliario'];

const FILTERS = [
  { key: 'full', label: 'Completo', show: { cats: ALL_CATS, fixed: ALL_FIXED } },
  { key: 'no-roof', label: 'Sin techo', show: { cats: ['EXT_REV', 'INT_PARED', 'PISO', 'CARP'], fixed: ['estructura', 'pisoEstructural', 'vidrio', 'eps', 'sanitario', 'led', 'mobiliario'] } },
  { key: 'interior', label: 'Interior', show: { cats: ['INT_PARED', 'INT_CIEL', 'PISO', 'CARP'], fixed: ['pisoEstructural', 'vidrio', 'sanitario', 'led', 'mobiliario'] } },
  { key: 'structure', label: 'Estructura', show: { cats: [], fixed: ['estructura', 'pisoEstructural', 'techoEstructural'] } },
  { key: 'technical', label: 'Tecnico', show: { cats: ALL_CATS, fixed: ALL_FIXED }, transparent: ['EXT_REV', 'EXT_TECHO'] },
  { key: 'logistics', label: 'Logistica', show: { cats: ['EXT_REV', 'EXT_TECHO', 'CARP'], fixed: ['estructura', 'pisoEstructural', 'techoEstructural', 'vidrio'] } },
  { key: 'install', label: 'Montaje', show: { cats: ['EXT_REV', 'EXT_TECHO', 'PISO', 'CARP'], fixed: ['estructura', 'pisoEstructural', 'techoEstructural', 'vidrio', 'eps'] }, transparent: ['EXT_REV'] },
];

let activeFilter = 'full';

export function applyFilter(key) {
  const f = FILTERS.find(item => item.key === key);
  if (!f) return;
  activeFilter = key;

  CATS.forEach(cat => {
    const visible = f.show.cats.includes(cat.key);
    const transparent = f.transparent?.includes(cat.key);
    catMeshes[cat.key].forEach(mesh => {
      mesh.visible = visible;
      if (Array.isArray(mesh.material)) return;
      if (visible && transparent) {
        mesh.material.transparent = true;
        mesh.material.opacity = 0.16;
      } else if (visible) {
        mesh.material.transparent = false;
        mesh.material.opacity = 1;
      }
    });
  });

  Object.entries(fixedMeshes).forEach(([group, meshes]) => {
    const visible = f.show.fixed.includes(group);
    meshes.forEach(mesh => { mesh.visible = visible; });
  });

  updateFilterButtons(key);
}

export function buildFiltersUI() {
  const el = document.getElementById('filters');
  if (!el) return;
  el.innerHTML = '';

  FILTERS.forEach(f => {
    const btn = document.createElement('button');
    btn.className = 'fbtn' + (f.key === activeFilter ? ' active' : '');
    btn.dataset.key = f.key;
    btn.textContent = f.label;
    btn.onclick = () => applyFilter(f.key);
    el.appendChild(btn);
  });
}

function updateFilterButtons(key) {
  document.querySelectorAll('.fbtn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.key === key)
  );
}

window.applyFilter = applyFilter;
