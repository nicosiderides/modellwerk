import { CATS, catState, wallState, TEX, INT_WALL_LABELS } from './config.js';
import { MODULES, OPTION_GROUPS, TECHNICAL_SPEC } from './data/modules.js';
import { getState, setConfigValue, resetConfig, subscribe } from './store/configuratorStore.js';
import { calculateQuote, getModule, getOption } from './utils/pricing.js';
import { formatUSD, formatNumber } from './utils/formatters.js';

let _onOptionClick = null;
let activeTab = CATS[0].key;
let selectedWall = 'all';
let activePanel = 'summary';

const QUOTE_EMAIL = 'modellwerkar@gmail.com';

export function buildUI(onOptionClick) {
  _onOptionClick = onOptionClick;
  _buildTabs();
  renderOpts();
  _bindShellActions();
  subscribe(renderConfigurator);
  updateSummary();
}

function _buildTabs() {
  const el = document.getElementById('ctabs');
  if (!el) return;
  el.innerHTML = '';
  CATS.forEach((cat, i) => {
    const b = document.createElement('button');
    b.className = 'ctab' + (cat.key === activeTab ? ' active' : '');
    b.dataset.key = cat.key;
    b.innerHTML = `
      <span class="ctab-num">${String(i + 1).padStart(2, '0')}</span>
      <span class="ctab-label">${cat.label}</span>
      <span class="ctab-cur" id="tabcur-${cat.key}">${_catValue(cat)}</span>
    `;
    b.onclick = () => {
      const prevTab = activeTab;
      activeTab = cat.key;
      selectedWall = 'all';
      renderOpts();
      _updateTabs();
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

function _swatchStyle(cat, opt) {
  if (cat.mode === 'color-only') return { backgroundColor: opt.c };
  const setKey = cat.mode === 'texture-swap' ? opt.texSet : cat.texSet;
  const url = TEX[setKey]?.d;
  if (!url) return { backgroundColor: opt.c };
  return {
    backgroundImage: `url(${url})`,
    backgroundColor: opt.c,
    backgroundBlendMode: 'multiply',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
}

function renderOpts() {
  const el = document.getElementById('copts');
  if (!el) return;
  el.innerHTML = '';
  const cat = CATS.find(c => c.key === activeTab);
  if (!cat) return;

  const swatchRow = document.createElement('div');
  swatchRow.className = 'sw-row';
  cat.opts.forEach((opt, i) => {
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'sw' + (_isSwatchActive(cat, i) ? ' active' : '');
    sw.setAttribute('aria-label', `${cat.label}: ${opt.name}`);
    Object.assign(sw.style, _swatchStyle(cat, opt));
    sw.onclick = () => {
      const wallId = (cat.multiWall && selectedWall !== 'all') ? selectedWall : null;
      _onOptionClick(cat.key, i, wallId);
    };
    sw.appendChild(_swatchOverlay(opt));
    swatchRow.appendChild(sw);
  });
  el.appendChild(swatchRow);

  if (cat.multiWall) el.appendChild(_buildFloorplanWidget(cat));
}

function _swatchOverlay(opt) {
  const overlay = document.createElement('span');
  overlay.className = 'sw-overlay';
  overlay.textContent = opt.name;
  return overlay;
}

function _isSwatchActive(cat, i) {
  if (cat.multiWall) {
    if (selectedWall === 'all') {
      const states = Object.values(wallState[cat.key] || {});
      return states.length ? states.every(s => s === i) : false;
    }
    return wallState[cat.key]?.[selectedWall] === i;
  }
  return catState[cat.key] === i;
}

function _buildFloorplanWidget(cat) {
  const wrap = document.createElement('div');
  wrap.className = 'fp-wrap';
  wrap.innerHTML = `
    <div class="fp-head">
      <span class="fp-title">Aplicar a</span>
      <button class="fp-all-btn ${selectedWall === 'all' ? 'active' : ''}" data-wall="all">Todas</button>
    </div>
    <svg class="fp" viewBox="0 0 120 72" preserveAspectRatio="xMidYMid meet">
      <rect x="10" y="10" width="100" height="52" fill="rgba(196,165,114,0.04)" stroke="rgba(196,165,114,0.15)" stroke-width="0.5"/>
      <g class="walls">
        ${_wallLine('LargaNorte', 10, 10, 110, 10)}
        ${_wallLine('LargaSur', 10, 62, 110, 62)}
        ${_wallLine('CortaOeste', 10, 10, 10, 62)}
        ${_wallLine('CortaEste', 110, 10, 110, 62)}
      </g>
      <text class="fp-center" x="60" y="40" text-anchor="middle">MW40</text>
    </svg>
    <div class="fp-status" id="fp-status">${_statusFor(cat)}</div>
  `;
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
  renderOpts();
}

function _refreshFloorplanColors(wrap, cat) {
  cat.walls.forEach(wallId => {
    const stateIdx = wallState[cat.key]?.[wallId] ?? 0;
    const opt = cat.opts[stateIdx];
    const wallEl = wrap.querySelector(`.fp-wall[data-wall="${wallId}"]`);
    if (!wallEl) return;
    wallEl.querySelector('.fp-vis').setAttribute('stroke', opt.c);
    wallEl.classList.toggle('selected', selectedWall === wallId);
  });
}

function _statusFor(cat) {
  if (selectedWall === 'all') return 'Cambio simultaneo en las 4 paredes interiores';
  const lbl = INT_WALL_LABELS[selectedWall] || selectedWall;
  const stateIdx = wallState[cat.key]?.[selectedWall] ?? 0;
  return `<strong>${lbl}</strong> - ${cat.opts[stateIdx].name}`;
}

function renderConfigurator(config) {
  const quote = calculateQuote(config);
  _renderModules(config);
  _renderOptionGroups(config);
  _renderCurrentConfig(config, quote);
  _renderRightPanel(config, quote);
  _renderQuoteModal(config, quote);
}

function _renderModules(config) {
  const el = document.getElementById('module-selector');
  if (!el) return;
  el.innerHTML = MODULES.map(module => `
    <button class="module-card ${module.id === config.moduleId ? 'active' : ''} ${module.available ? '' : 'soon'}" data-module="${module.id}" ${module.available ? '' : 'disabled'}>
      <span class="module-drawing"></span>
      <span class="module-copy">
        <strong>${module.name}</strong>
        <small>${module.dimensions.length.toFixed(2)} x ${module.dimensions.width.toFixed(2)} x ${module.dimensions.height.toFixed(2)} m</small>
      </span>
      <span class="module-state">${module.available ? (module.id === config.moduleId ? 'Activo' : 'Elegir') : 'Prox.'}</span>
    </button>
  `).join('');
  el.querySelectorAll('[data-module]').forEach(btn => {
    btn.onclick = () => {
      const module = MODULES.find(item => item.id === btn.dataset.module);
      if (!module?.available) return;
      setConfigValue('moduleId', module.id);
      if (module.glb) window.loadModel?.(module.glb);
      _toast(`${module.name} cargado`);
    };
  });
}

function _renderOptionGroups(config) {
  const el = document.getElementById('configurator-options');
  if (!el) return;
  el.innerHTML = OPTION_GROUPS.map(group => `
    <section class="config-group">
      <div class="config-group-head">
        <span>${group.label}</span>
        <small>${group.description}</small>
      </div>
      <div class="option-list">
        ${group.options.map(option => `
          <button class="option-pill ${config[group.key] === option.id ? 'active' : ''}" data-group="${group.key}" data-option="${option.id}">
            <span>${option.label}</span>
            <small>${option.price ? _signedUSD(option.price) : 'Incluido'}</small>
          </button>
        `).join('')}
      </div>
    </section>
  `).join('');

  el.querySelectorAll('[data-group][data-option]').forEach(btn => {
    btn.onclick = () => {
      setConfigValue(btn.dataset.group, btn.dataset.option);
      const option = getOption(btn.dataset.group, btn.dataset.option);
      if (btn.dataset.group === 'roof' && option?.viewMode) window.applyFilter?.(option.viewMode);
      _toast(`${option?.label || 'Opcion'} aplicado`);
    };
  });
}

function _renderCurrentConfig(config, quote) {
  const el = document.getElementById('current-config');
  if (!el) return;
  const module = getModule(config);
  el.innerHTML = `
    <div class="progress-card">
      <div class="progress-head">
        <span>Configuracion</span>
        <strong>${quote.progress}%</strong>
      </div>
      <div class="progress-track"><span style="width:${quote.progress}%"></span></div>
      <small>Estado: ${quote.complexity} - ${quote.modulesCount} modulo${quote.modulesCount > 1 ? 's' : ''}</small>
    </div>
    <div class="mini-spec">
      <span>Modulo</span><strong>${module.name} ${module.series}</strong>
      <span>Uso</span><strong>${getOption('use', config.use)?.label}</strong>
      <span>Entrega</span><strong>${getOption('delivery', config.delivery)?.label}</strong>
      <span>Superficie</span><strong>${formatNumber(quote.area, ' m2')}</strong>
    </div>
  `;
}

function _renderRightPanel(config, quote) {
  _renderRightTabs();
  const el = document.getElementById('right-panel-content');
  if (!el) return;
  const panels = {
    summary: _summaryMarkup(config, quote),
    technical: _technicalMarkup(config, quote),
    materials: _materialsMarkup(),
    price: _priceMarkup(quote),
    logistics: _logisticsMarkup(quote),
    docs: _docsMarkup(),
  };
  el.innerHTML = panels[activePanel] || panels.summary;
}

function _renderRightTabs() {
  const el = document.getElementById('right-tabs');
  if (!el) return;
  const tabs = [
    ['summary', 'Resumen'],
    ['technical', 'Tecnica'],
    ['materials', 'Materiales'],
    ['price', 'Precio'],
    ['logistics', 'Logistica'],
    ['docs', 'Docs'],
  ];
  el.innerHTML = tabs.map(([key, label]) => `
    <button class="${activePanel === key ? 'active' : ''}" data-panel="${key}">${label}</button>
  `).join('');
  el.querySelectorAll('[data-panel]').forEach(btn => {
    btn.onclick = () => {
      activePanel = btn.dataset.panel;
      _renderRightPanel(getState(), calculateQuote(getState()));
    };
  });
}

function _summaryMarkup(config, quote) {
  const module = quote.module;
  return `
    <div class="hero-spec">
      <p class="kicker">Serie ${module.series}</p>
      <h2>${module.name}</h2>
      <p>Modulo habitable industrializado con configuracion comercial y tecnica lista para evolucionar a BIM.</p>
    </div>
    ${_metricGrid([
      ['Largo', `${module.dimensions.length.toFixed(2)} m`],
      ['Ancho', `${module.dimensions.width.toFixed(2)} m`],
      ['Altura libre', `${module.dimensions.height.toFixed(2)} m`],
      ['Superficie', `${quote.area} m2`],
      ['Peso estimado', module.weight],
      ['Estado', `${quote.progress}%`],
    ])}
    <div class="panel-actions">
      <button class="btnp" onclick="openCotizar()">Solicitar cotizacion formal</button>
      <button class="btns" onclick="downloadConfig()">Guardar configuracion</button>
      <button class="btns" onclick="shareProject()">Compartir proyecto</button>
    </div>
  `;
}

function _technicalMarkup(config, quote) {
  return `
    <div class="data-list">
      ${_row('Sistema constructivo', TECHNICAL_SPEC.system)}
      ${_row('Cerramiento', getOption('envelope', config.envelope)?.label)}
      ${_row('Aislacion', TECHNICAL_SPEC.insulation)}
      ${_row('Carpinterias', getOption('openings', config.openings)?.label)}
      ${_row('Instalaciones', getOption('installations', config.installations)?.label)}
      ${_row('Plazo fabricacion', quote.leadTime)}
      ${_row('Plazo montaje', quote.assemblyTime)}
      ${_row('Nivel de entrega', getOption('delivery', config.delivery)?.label)}
    </div>
  `;
}

function _materialsMarkup() {
  return `
    <div class="data-list" id="pr-specs">
      ${CATS.map(cat => _row(cat.label, _catValue(cat))).join('')}
    </div>
  `;
}

function _priceMarkup(quote) {
  return `
    <div class="price-card">
      <span>Precio orientativo</span>
      <strong><small>USD</small> ${formatNumber(quote.total)}</strong>
      <em>Sujeto a ingenieria final, ubicacion y alcance contractual.</em>
    </div>
    ${_metricGrid([
      ['Base', formatUSD(quote.base)],
      ['Adicionales', formatUSD(quote.optionTotal)],
      ['Precio / m2', formatUSD(quote.pricePerM2)],
      ['Superficie', `${quote.area} m2`],
    ])}
    <div class="breakdown">
      ${quote.breakdown.map(item => `
        <div><span>${item.label}</span><strong>${item.amount ? formatUSD(item.amount) : 'Incluido'}</strong></div>
      `).join('')}
    </div>
  `;
}

function _logisticsMarkup(quote) {
  return `
    <div class="data-list">
      ${_row('Compatibilidad', 'Transporte carreton / izaje por grua')}
      ${_row('Huella', `${quote.module.dimensions.length.toFixed(2)} x ${quote.module.dimensions.width.toFixed(2)} m por modulo`)}
      ${_row('Peso estimado', quote.module.weight)}
      ${_row('Cantidad', `${quote.modulesCount} modulo${quote.modulesCount > 1 ? 's' : ''}`)}
      ${_row('Montaje', quote.assemblyTime)}
    </div>
  `;
}

function _docsMarkup() {
  return `
    <div class="doc-list">
      ${TECHNICAL_SPEC.documentation.map(doc => `<span>${doc}</span>`).join('')}
    </div>
    <div class="panel-actions">
      <a class="btns as-link" href="../descargas/ficha-tecnica-mw40-demo.html" download>Descargar ficha tecnica</a>
      <button class="btns" onclick="captureImage()">Capturar imagen</button>
    </div>
  `;
}

function _metricGrid(items) {
  return `<div class="metric-grid">${items.map(([k, v]) => `<div><span>${k}</span><strong>${v}</strong></div>`).join('')}</div>`;
}

function _row(k, v) {
  return `<div class="sr"><span class="sk">${k}</span><span class="sv">${v || '-'}</span></div>`;
}

function updateSummary() {
  CATS.forEach(cat => {
    const val = _catValue(cat);
    const tabEl = document.getElementById(`tabcur-${cat.key}`);
    if (tabEl) tabEl.textContent = val;
  });
  renderConfigurator(getState());
}

function _catValue(cat) {
  if (cat.multiWall) {
    const states = Object.values(wallState[cat.key] || {});
    if (states.length && states.every(s => s === states[0])) return cat.opts[states[0]]?.name || '-';
    return 'Por pared';
  }
  return catState[cat.key] !== null ? cat.opts[catState[cat.key]].name : '-';
}

function _quoteData() {
  const config = getState();
  const quote = calculateQuote(config);
  return {
    module: quote.module.name,
    series: quote.module.series,
    dimensions: `${quote.module.dimensions.length} x ${quote.module.dimensions.width} x ${quote.module.dimensions.height} m`,
    area: `${quote.area} m2`,
    estimatedPrice: formatUSD(quote.total),
    pricePerM2: formatUSD(quote.pricePerM2),
    leadTime: quote.leadTime,
    generatedAt: new Date().toISOString(),
    configuration: OPTION_GROUPS.map(group => ({
      key: group.key,
      label: group.label,
      value: getOption(group.key, config[group.key])?.label || '-',
    })),
    materials: CATS.map(cat => ({ key: cat.key, label: cat.label, value: _catValue(cat) })),
  };
}

function _quoteText(extra = {}) {
  const d = _quoteData();
  const lines = [
    'MODELLWERK - Solicitud de cotizacion',
    '',
    `Modulo: ${d.module} / Serie ${d.series}`,
    `Dimensiones: ${d.dimensions}`,
    `Superficie: ${d.area}`,
    `Precio orientativo: ${d.estimatedPrice}`,
    `Precio por m2: ${d.pricePerM2}`,
    `Plazo estimado: ${d.leadTime}`,
    '',
    'Configuracion:',
    ...d.configuration.map(s => `- ${s.label}: ${s.value}`),
    '',
    'Materiales:',
    ...d.materials.map(s => `- ${s.label}: ${s.value}`),
  ];
  if (extra.name) lines.push('', `Nombre / estudio: ${extra.name}`);
  if (extra.email) lines.push(`Email: ${extra.email}`);
  if (extra.notes) lines.push('', `Comentario: ${extra.notes}`);
  return lines.join('\n');
}

function _renderQuoteModal(config, quote) {
  const summary = document.getElementById('quote-summary');
  if (summary) {
    summary.innerHTML = `
      <div><strong>Modulo:</strong> ${quote.module.name} ${quote.module.series}</div>
      <div><strong>Superficie:</strong> ${quote.area} m2</div>
      <div><strong>Precio:</strong> ${formatUSD(quote.total)}</div>
      <div><strong>Entrega:</strong> ${getOption('delivery', config.delivery)?.label}</div>
    `;
  }
  const price = document.getElementById('qm-price');
  if (price) price.textContent = formatUSD(quote.total);
}

function _download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function _bindShellActions() {
  if (_bindShellActions.done) return;
  _bindShellActions.done = true;

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      window.closeCotizar?.();
      document.body.classList.remove('presentation-mode');
    }
  });
}

function _toast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(_toast.timer);
  _toast.timer = setTimeout(() => el.classList.remove('show'), 2200);
}

function _signedUSD(value) {
  return `${value > 0 ? '+' : ''}${formatUSD(value)}`;
}

document.addEventListener('material-changed', e => {
  const { catKey, optName } = e.detail;
  renderOpts();
  updateSummary();
  const row = document.getElementById(`spec-${catKey}`);
  if (row) {
    row.classList.add('flash');
    setTimeout(() => row.classList.remove('flash'), 700);
  }
  _toast(`${optName} seleccionado`);
});

document.addEventListener('wall-changed', () => {
  renderOpts();
  updateSummary();
  _toast('Pared interior actualizada');
});

window.selectMod = el => {
  const moduleId = el?.dataset?.module || el?.dataset?.moduleId;
  const module = MODULES.find(item => item.id === moduleId);
  if (!module?.available) return;
  setConfigValue('moduleId', module.id);
  if (module.glb) window.loadModel?.(module.glb);
};

window.openCotizar = () => {
  renderConfigurator(getState());
  const modal = document.getElementById('quote-modal');
  modal?.classList.add('open');
  modal?.setAttribute('aria-hidden', 'false');
  document.getElementById('quote-name')?.focus();
};

window.closeCotizar = () => {
  const modal = document.getElementById('quote-modal');
  modal?.classList.remove('open');
  modal?.setAttribute('aria-hidden', 'true');
};

window.downloadConfig = () => {
  _download('modellwerk-configuracion.json', JSON.stringify(_quoteData(), null, 2), 'application/json');
  _toast('Configuracion guardada');
};

window.copyQuoteSummary = async () => {
  const text = _quoteText({
    name: document.getElementById('quote-name')?.value.trim(),
    email: document.getElementById('quote-email')?.value.trim(),
    notes: document.getElementById('quote-notes')?.value.trim(),
  });
  try {
    await navigator.clipboard.writeText(text);
    _toast('Resumen copiado');
  } catch {
    _download('modellwerk-resumen.txt', text, 'text/plain');
  }
};

window.shareProject = () => {
  const text = _quoteText();
  if (navigator.share) navigator.share({ title: 'Configuracion MODELLWERK', text });
  else window.copyQuoteSummary?.();
};

window.sendQuoteEmail = () => {
  const text = _quoteText({
    name: document.getElementById('quote-name')?.value.trim(),
    email: document.getElementById('quote-email')?.value.trim(),
    notes: document.getElementById('quote-notes')?.value.trim(),
  });
  window.location.href = `mailto:${QUOTE_EMAIL}?subject=${encodeURIComponent('Cotizacion MODELLWERK - configuracion guardada')}&body=${encodeURIComponent(text)}`;
};

window.resetConfiguration = () => {
  resetConfig();
  window.applyFilter?.('full');
  window.setScenePreset?.('commercial');
  _toast('Configuracion reiniciada');
};

window.togglePanel = side => {
  document.body.classList.toggle(`${side}-collapsed`);
};

window.togglePresentation = () => {
  document.body.classList.toggle('presentation-mode');
  window.dispatchEvent(new Event('resize'));
};

window.captureImage = () => {
  const canvas = document.querySelector('#vw canvas');
  if (!canvas) return;
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = 'modellwerk-configuracion.png';
  a.click();
};
