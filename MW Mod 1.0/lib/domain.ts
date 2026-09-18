export const CATALOG_VERSION = 'mw-pilot-1.0';
export const PRICE_VERSION = 'usd-demo-2026-08';
export type Configuration = {
  product: string;
  quantity: number;
  envelope: string;
  finish: string;
  glazing: string;
  layout: string;
};
export type Project = {
  id: string;
  name: string;
  client: string;
  location: string;
  revision: number;
  configuration: Configuration;
  createdAt: string;
  updatedAt: string;
  checks: Record<string, boolean>;
};
export type Quote = {
  id: string;
  projectId: string;
  projectName: string;
  client: string;
  revision: number;
  createdAt: string;
  configuration: Configuration;
  evaluation: Evaluation;
};
export type Asset = {
  id: string;
  name: string;
  kind: string;
  bytes: number;
  createdAt: string;
  report: {
    schema: string;
    entities: number;
    materials: number;
    warnings: string[];
  };
};
export type Activity = { id: string; message: string; createdAt: string };
export type Workspace = {
  projects: Project[];
  quotes: Quote[];
  assets: Asset[];
  activity: Activity[];
};
export const products = [
  {
    id: 'office',
    name: 'MW Office',
    code: 'MW-O18',
    description: 'Espacios para trabajar',
    area: 18,
    length: 6,
    base: 1840000,
    image: '/images/oficina.webp',
    category: 'Trabajo',
    detail:
      'Un sistema flexible de oficinas. Combina espacios de trabajo, reuniones y áreas de apoyo.',
  },
  {
    id: 'care',
    name: 'MW Care',
    code: 'MW-C18',
    description: 'Infraestructura para cuidar',
    area: 18,
    length: 6,
    base: 2480000,
    image: '/images/salud.webp',
    category: 'Equipamiento',
    detail:
      'Un punto de partida para espacios de atención. Requiere revisión sanitaria y técnica específica.',
  },
  {
    id: 'living',
    name: 'MW Living',
    code: 'MW-L27',
    description: 'Una forma flexible de habitar',
    area: 27,
    length: 9,
    base: 2960000,
    image: '/images/living.webp',
    category: 'Vivienda',
    detail:
      'Una familia de módulos habitables con terminaciones y cerramientos configurables.',
  },
];
export const options = {
  envelope: [
    {
      id: 'pir80',
      label: 'Panel PIR · 80 mm',
      description: 'Cerramiento base del catálogo piloto',
      price: 0,
    },
    {
      id: 'pir100',
      label: 'Panel PIR · 100 mm',
      description: 'Mayor espesor de aislación',
      price: 185000,
    },
  ],
  finish: [
    { id: 'chalk', label: 'Caliza', color: '#e6e4d9', price: 0 },
    { id: 'sage', label: 'Salvia', color: '#80917d', price: 64000 },
    { id: 'graphite', label: 'Grafito', color: '#4a504d', price: 88000 },
  ],
  glazing: [
    {
      id: 'standard',
      label: 'Carpintería estándar',
      description: 'Paquete de aberturas base',
      price: 0,
    },
    {
      id: 'dvh',
      label: 'Doble vidriado',
      description: 'Paquete de aberturas con DVH',
      price: 125000,
    },
  ],
  layout: [
    { id: 'linear', label: 'Lineal' },
    { id: 'courtyard', label: 'Patio abierto' },
  ],
};
export const assemblySteps = [
  {
    id: 'documents',
    name: 'Revisión documental',
    detail:
      'Identificá el módulo y la revisión de referencia. En producción real, verificá que todos los documentos estén liberados por el responsable técnico.',
    group: 'structure',
  },
  {
    id: 'parts',
    name: 'Identificación de componentes',
    detail:
      'Ubicá los conjuntos del modelo y compará sus identificadores con la lista de referencia. Este piloto no contiene un despiece de fabricación validado.',
    group: 'structure',
  },
  {
    id: 'envelope',
    name: 'Lectura de la envolvente',
    detail:
      'Explorá los paneles y las aberturas. Registrá dudas de compatibilidad antes de usar información en una orden real.',
    group: 'walls',
  },
  {
    id: 'review',
    name: 'Control y cierre del recorrido',
    detail:
      'Revisá las observaciones y la documentación faltante. Completar este recorrido no autoriza fabricación ni certifica calidad.',
    group: 'all',
  },
];
export function defaultConfiguration(product = 'office'): Configuration {
  return {
    product,
    quantity: 1,
    envelope: 'pir80',
    finish: 'chalk',
    glazing: product === 'care' ? 'dvh' : 'standard',
    layout: 'linear',
  };
}
export function validateConfiguration(raw: unknown): Configuration {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Configuración inválida.');
  const v = raw as Record<string, unknown>;
  if (!products.some((p) => p.id === v.product))
    throw new Error('El sistema no existe.');
  if (
    !Number.isInteger(v.quantity) ||
    Number(v.quantity) < 1 ||
    Number(v.quantity) > 12
  )
    throw new Error('La cantidad debe ser un entero entre 1 y 12.');
  for (const key of ['envelope', 'finish', 'glazing', 'layout'] as const)
    if (!options[key].some((o) => o.id === v[key]))
      throw new Error(`Opción inválida: ${key}.`);
  return {
    product: String(v.product),
    quantity: Number(v.quantity),
    envelope: String(v.envelope),
    finish: String(v.finish),
    glazing: String(v.glazing),
    layout: String(v.layout),
  };
}
export type Evaluation = {
  total: number;
  area: number;
  catalogVersion: string;
  priceVersion: string;
  lines: { label: string; unit: number; quantity: number; total: number }[];
  warnings: string[];
  errors: string[];
  status: 'estimate' | 'invalid';
};
export function evaluate(raw: Configuration): Evaluation {
  const c = validateConfiguration(raw);
  const p = products.find((p) => p.id === c.product)!;
  const lines = [
    {
      label: `${p.name} · módulo base`,
      unit: p.base,
      quantity: c.quantity,
      total: p.base * c.quantity,
    },
    ...(['envelope', 'finish', 'glazing'] as const).map((k) => {
      const o = options[k].find((o) => o.id === c[k])!;
      return {
        label: o.label,
        unit: o.price,
        quantity: c.quantity,
        total: o.price * c.quantity,
      };
    }),
  ];
  const errors: string[] = [];
  if (c.product === 'care' && c.glazing !== 'dvh')
    errors.push(
      'Regla de ejemplo: MW Care requiere el paquete de doble vidriado. No es una validación normativa.',
    );
  if (c.layout === 'courtyard' && c.quantity < 3)
    errors.push('La disposición en patio requiere al menos 3 módulos.');
  return {
    total: lines.reduce((s, l) => s + l.total, 0),
    area: p.area * c.quantity,
    lines,
    errors,
    warnings: [
      'Precios de demostración. No incluyen impuestos, transporte, fundaciones ni montaje.',
      'Modelo conceptual. Cantidades, uniones y documentación requieren validación de ingeniería.',
    ],
    status: errors.length ? 'invalid' : 'estimate',
    catalogVersion: CATALOG_VERSION,
    priceVersion: PRICE_VERSION,
  };
}
export function money(cents: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
export function dateLabel(date: string) {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(date));
}
export function cleanText(value: unknown, label: string, max = 100): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new Error(`${label}: ingresá entre 1 y ${max} caracteres.`);
  return value.trim();
}
export function seedProjects(): Project[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'demo-campus',
      name: 'Campus Norte',
      client: 'Cliente de ejemplo · Oficinas',
      location: 'Córdoba, Argentina',
      revision: 1,
      configuration: { ...defaultConfiguration(), quantity: 6 },
      createdAt: now,
      updatedAt: now,
      checks: {},
    },
    {
      id: 'demo-care',
      name: 'Punto de atención',
      client: 'Cliente de ejemplo · Salud',
      location: 'Rosario, Argentina',
      revision: 1,
      configuration: {
        ...defaultConfiguration('care'),
        quantity: 3,
        finish: 'sage',
      },
      createdAt: now,
      updatedAt: now,
      checks: {},
    },
    {
      id: 'demo-living',
      name: 'Refugio del bosque',
      client: 'Cliente de ejemplo · Vivienda',
      location: 'Sierras de Córdoba',
      revision: 1,
      configuration: {
        ...defaultConfiguration('living'),
        quantity: 2,
        finish: 'graphite',
        glazing: 'dvh',
      },
      createdAt: now,
      updatedAt: now,
      checks: {},
    },
  ];
}
