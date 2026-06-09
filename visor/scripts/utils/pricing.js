import { MODULES, OPTION_GROUPS } from '../data/modules.js';

const CATEGORY_MAP = {
  structure: ['layout', 'delivery'],
  envelope: ['envelope', 'roof'],
  openings: ['openings'],
  interior: ['interior', 'use'],
  installations: ['installations'],
  logistics: ['layout'],
  assembly: ['delivery'],
};

export function getModule(config) {
  return MODULES.find(module => module.id === config.moduleId) || MODULES[1];
}

export function getOption(groupKey, optionId) {
  const group = OPTION_GROUPS.find(item => item.key === groupKey);
  return group?.options.find(item => item.id === optionId) || group?.options[0] || null;
}

export function calculateQuote(config) {
  const module = getModule(config);
  const selected = OPTION_GROUPS.map(group => ({
    group,
    option: getOption(group.key, config[group.key]),
  })).filter(item => item.option);

  const optionTotal = selected.reduce((sum, item) => sum + (item.option.price || 0), 0);
  const modulesCount = getOption('layout', config.layout)?.modules || 1;
  const area = module.area * modulesCount;
  const base = module.basePrice * modulesCount;
  const total = base + optionTotal;

  const breakdown = Object.entries(CATEGORY_MAP).map(([key, groups]) => ({
    key,
    label: {
      structure: 'Estructura',
      envelope: 'Cerramiento',
      openings: 'Carpinterias',
      interior: 'Interior',
      installations: 'Instalaciones',
      logistics: 'Logistica',
      assembly: 'Montaje',
    }[key],
    amount: groups.reduce((sum, groupKey) => {
      const option = getOption(groupKey, config[groupKey]);
      return sum + Math.max(0, option?.price || 0);
    }, 0),
  }));

  const delivery = getOption('delivery', config.delivery);
  const progress = Math.round((delivery?.completion || 78) * 0.65 + selected.length / OPTION_GROUPS.length * 35);
  const complexity = optionTotal > 18000 ? 'Alta' : optionTotal > 8000 ? 'Media' : 'Controlada';

  return {
    module,
    selected,
    modulesCount,
    area,
    base,
    optionTotal,
    total,
    pricePerM2: total / area,
    breakdown,
    progress: Math.min(100, progress),
    complexity,
    leadTime: module.leadTime,
    assemblyTime: module.assemblyTime,
  };
}
