import { CATS, catState, wallState, TEX, INT_WALL_LABELS } from './config.js';

let _onOptionClick = null;
let activeTab = CATS[0].key;

// Para categorías multi-pared: qué pared (o 'all') va a recibir el próximo cambio
let selectedWall = 'all';

// ─── Public ──────────────────────────────────────────────────────────────────

export function buildUI(onOptionClick) {
  _onOptionClick = onOptionClick;
  _buildTabs();
  renderOpts();
  _buildSidebar();
  updateSummary();
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function _buildTabs() {
  const el = document.getElementById('ctabs');
  el.innerHTML = '';
  CATS.forEach((cat, i) => {
    const b = document.createElement('button');
    b.className = 'ctab' + (cat.key === activeTab ? ' active' : '');
    b.dataset.key = cat.key;
    b.innerHTML =
      `<span class="ctab-num">${String(i + 1).padStart(2, '0')}</span>` +
      `<span class="ctab-label">${cat.label}</span>` +
      `<span class="ctab-cur" id="tabcur-${cat.key}">${catState[cat.key] !== null ? cat.opts[catState[cat.key]].name : '—'}</span>`;
    b.onclick = () => {
      const prevTab = activeTab;
      activeTab = cat.key;
      selectedWall = 'all';   // reset al cambiar de tab
      renderOpts();
      _updateTabs();

      // Exploded view de carpintería: cuando entrás a CARP, las ventanas + puerta
      // se elevan 2m. Al salir de CARP, vuelven a su posición.
      if (cat.key === 'CARP') window.toggleCarpExploded?.(true);
      else if (prevTab === 'CARP') window.toggleCarpExploded?.(false);
    };
    el.appendChild(b);
  });
}

function _updateTabs() {
  document.querySelectorAll('.ctab').forEach(b =>
    b.classList.toggle('active', b.dataset.key === activeTab)
  );
}

// ─── Swatches ─────────────────────────────────────────────────────────────────

function _swatchStyle(cat, opt) {
  if (cat.mode === 'color-only') {
    return { backgroundColor: opt.c };
  }
  const setKey = cat.mode === 'texture-swap' ? opt.texSet : cat.texSet;
  const url = TEX[setKey]?.d;
  if (!url) return { backgroundColor: opt.c };
  return {
    backgroundImage:  `url(${url})`,
    backgroundColor:  opt.c,
    backgroundBlendMode: 'multiply',
    backgroundSize:   'cover',
    backgroundPosition: 'center',
  };
}

function renderOpts() {
  const el = document.getElementById('copts');
  el.innerHTML = '';
  const cat = CATS.find(c => c.key === activeTab);

  // Contenedor de swatches
  const swatchRow = document.createElement('div');
  swatchRow.className = 'sw-row';
  cat.opts.forEach((opt, i) => {
    const sw = document.createElement('div');
    sw.className = 'sw' + (_isSwatchActive(cat, i) ? ' active' : '');
    Object.assign(sw.style, _swatchStyle(cat, opt));
    sw.onclick = () => {
      // Si es multiWall y hay una pared seleccionada, aplica solo a esa.
      // Si selectedWall === 'all' o la cat no es multi, aplica al cat completo.
      const wallId = (cat.multiWall && selectedWall !== 'all') ? selectedWall : null;
      _onOptionClick(cat.key, i, wallId);
    };
    sw.appendChild(_swatchOverlay(opt));
    swatchRow.appendChild(sw);
  });
  el.appendChild(swatchRow);

  // Widget floorplan SOLO para categorías multi-pared
  if (cat.multiWall) {
    el.appendChild(_buildFloorplanWidget(cat));
  }
}

function _swatchOverlay(opt) {
  const overlay = document.createElement('div');
  overlay.className = 'sw-overlay';
  overlay.textContent = opt.name;
  return overlay;
}

function _isSwatchActive(cat, i) {
  if (cat.multiWall) {
    // En multi-wall, "activo" significa: la pared seleccionada (o todas) usa esa opción
    if (selectedWall === 'all') {
      // todas activas → todas usan la misma
      const states = Object.values(wallState[cat.key] || {});
      return states.every(s => s === i);
    }
    return wallState[cat.key]?.[selectedWall] === i;
  }
  return catState[cat.key] === i;
}

// ─── Floorplan widget (KLEUSBERG style) ────────────────────────────────────────

function _buildFloorplanWidget(cat) {
  const wrap = document.createElement('div');
  wrap.className = 'fp-wrap';
  wrap.innerHTML = `
    <div class="fp-head">
      <span class="fp-title">Aplicar a:</span>
      <button class="fp-all-btn ${selectedWall === 'all' ? 'active' : ''}" data-wall="all">Todas las paredes</button>
    </div>
    <svg class="fp" viewBox="0 0 120 72" preserveAspectRatio="xMidYMid meet">
      <!-- piso (fondo) -->
      <rect x="10" y="10" width="100" height="52" fill="rgba(196,165,114,0.04)" stroke="rgba(196,165,114,0.15)" stroke-width="0.5"/>
      <!-- 4 paredes (líneas clickeables, hitbox grande invisible + línea visible) -->
      <g class="walls">
        ${_wallLine('LargaNorte', 10, 10, 110, 10)}
        ${_wallLine('LargaSur',   10, 62, 110, 62)}
        ${_wallLine('CortaOeste', 10, 10, 10, 62)}
        ${_wallLine('CortaEste', 110, 10, 110, 62)}
      </g>
      <text class="fp-center" x="60" y="40" text-anchor="middle">MW40</text>
    </svg>
    <div class="fp-status" id="fp-status">${_statusFor(cat)}</div>
  `;

  // Hooks
  wrap.querySelector('.fp-all-btn').onclick = () => _setSelectedWall(cat, 'all');
  wrap.querySelectorAll('.fp-wall').forEach(el => {
    el.onclick = () => _setSelectedWall(cat, el.dataset.wall);
  });

  _refreshFloorplanColors(wrap, cat);
  return wrap;
}

function _wallLine(id, x1, y1, x2, y2) {
  return `
    <g class="fp-wall" data-wall="${id}">
      <line class="fp-hit" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="transparent" stroke-width="10"/>
      <line class="fp-vis" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="2.5"/>
    </g>
  `;
}

function _setSelectedWall(cat, wallId) {
  selectedWall = wallId;
  renderOpts();   // re-render para actualizar swatches activos y widget
}

function _refreshFloorplanColors(wrap, cat) {
  // Colorear cada pared según la opción que tiene asignada actualmente
  cat.walls.forEach(wallId => {
    const stateIdx = wallState[cat.key]?.[wallId] ?? 0;
    const opt = cat.opts[stateIdx];
    const wallEl = wrap.querySelector(`.fp-wall[data-wall="${wallId}"]`);
    if (!wallEl) return;
    const vis = wallEl.querySelector('.fp-vis');
    vis.setAttribute('stroke', opt.c);
    wallEl.classList.toggle('selected', selectedWall === wallId);
  });
}

function _statusFor(cat) {
  if (selectedWall === 'all') {
    return 'Cambiar material → se aplica a las 4 paredes';
  }
  const lbl = INT_WALL_LABELS[selectedWall] || selectedWall;
  const stateIdx = wallState[cat.key]?.[selectedWall] ?? 0;
  return `<strong>${lbl}</strong> · actual: ${cat.opts[stateIdx].name}`;
}

// ─── Right sidebar ────────────────────────────────────────────────────────────

function _buildSidebar() {
  const container = document.getElementById('pr-specs');
  if (!container) return;
  container.innerHTML = CATS.map(cat =>
    `<div class="sr" id="spec-${cat.key}">` +
      `<span class="sk">${cat.label}</span>` +
      `<span class="sv" id="specval-${cat.key}">${catState[cat.key] !== null ? cat.opts[catState[cat.key]].name : '—'}</span>` +
    `</div>`
  ).join('');
}

function updateSummary() {
  CATS.forEach(cat => {
    const val = catState[cat.key] !== null ? cat.opts[catState[cat.key]].name : '—';
    const specEl = document.getElementById(`specval-${cat.key}`);
    if (specEl) specEl.textContent = val;
    const tabEl = document.getElementById(`tabcur-${cat.key}`);
    if (tabEl) tabEl.textContent = val;
  });
  const legacy = document.getElementById('cfgsum');
  if (legacy) {
    legacy.innerHTML = CATS.map(cat =>
      `${cat.label}: <span style="color:#c4a572">${catState[cat.key] !== null ? cat.opts[catState[cat.key]].name : '—'}</span>`
    ).join('<br>');
  }
}

// ─── Event bus listeners ───────────────────────────────────────────────────────

document.addEventListener('material-changed', e => {
  const { catKey } = e.detail;
  renderOpts();      // re-render para reflejar el nuevo estado
  updateSummary();
  const row = document.getElementById(`spec-${catKey}`);
  if (row) {
    row.classList.add('flash');
    setTimeout(() => row.classList.remove('flash'), 700);
  }
});

document.addEventListener('wall-changed', () => {
  renderOpts();      // un cambio de pared individual también requiere re-render
});

// ─── Global helpers ───────────────────────────────────────────────────────────

window.selectMod = el => {
  if (el.classList.contains('soon')) return;
  document.querySelectorAll('.mc').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  const glb = el.dataset.glb;
  if (glb && window.loadModel) window.loadModel(glb);
};
window.openCotizar = ()  => alert('Cotización — próximamente.\nContacto: contacto@modellwerk.com.ar');
