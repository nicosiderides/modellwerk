import { CATS, catMeshes, fixedMeshes } from './config.js';

// ─── Definición de vistas ─────────────────────────────────────────────────────

const FILTERS = [
  {
    key:   'full',
    label: 'Completo',
    show:  { cats: ['EXT_REV','EXT_TECHO','INT_PARED','INT_CIEL','PISO','CARP'], fixed: ['estructura','vidrio','eps','sanitario','led'] },
  },
  {
    key:   'no-roof',
    label: 'Sin techo',
    show:  { cats: ['EXT_REV','INT_PARED','INT_CIEL','PISO','CARP'], fixed: ['estructura','vidrio','eps','sanitario','led'] },
  },
  {
    key:   'interior',
    label: 'Interior',
    show:  { cats: ['INT_PARED','INT_CIEL','PISO','CARP'], fixed: ['estructura','vidrio','sanitario','led'] },
  },
  {
    key:   'structure',
    label: 'Estructura',
    show:  { cats: [], fixed: ['estructura'] },
  },
  {
    key:   'technical',
    label: 'Técnico',
    show:  { cats: ['EXT_REV','EXT_TECHO','INT_PARED','INT_CIEL','PISO','CARP'], fixed: ['estructura','vidrio','eps','sanitario','led'] },
    transparent: ['EXT_REV', 'EXT_TECHO'],
  },
];

let activeFilter = 'full';

// ─── Aplicar un filtro ────────────────────────────────────────────────────────

function applyFilter(key) {
  const f = FILTERS.find(f => f.key === key);
  if (!f) return;
  activeFilter = key;

  // categorías
  CATS.forEach(cat => {
    const visible = f.show.cats.includes(cat.key);
    const transparent = f.transparent?.includes(cat.key);
    catMeshes[cat.key].forEach(mesh => {
      mesh.visible = visible;
      if (visible && transparent) {
        mesh.material.transparent = true;
        mesh.material.opacity = 0.12;
      } else if (visible) {
        mesh.material.transparent = false;
        mesh.material.opacity = 1;
      }
    });
  });

  // meshes fijos
  Object.entries(fixedMeshes).forEach(([group, meshes]) => {
    const visible = f.show.fixed.includes(group);
    meshes.forEach(mesh => { mesh.visible = visible; });
  });

  updateFilterButtons(key);
}

// ─── UI ───────────────────────────────────────────────────────────────────────

export function buildFiltersUI() {
  const el = document.getElementById('filters');
  if (!el) return;

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
