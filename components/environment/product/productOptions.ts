import type { ProductOptionKey } from "../utils/sceneTypes";

export type ProductModuleId = "MW40" | "MW50" | "CM4000" | "MWG9" | "MW900";

export type ProductModule = {
  id: ProductModuleId;
  name: string;
  series: string;
  available: boolean;
  dimensions: { length: number; width: number; height: number };
  area: number;
  basePrice: number;
  weight: string;
  leadTime: string;
  assemblyTime: string;
  modelPath: string;
  modelVersion?: string;
  visualPackage?: "full" | "structure";
  manifestPath?: string;
  bomPath?: string;
  designStatus?: "product" | "concept-not-engineered";
  priceOnRequest?: boolean;
};

export type ProductOption = {
  id: string;
  label: string;
  price: number;
  family?: "aluminum" | "pvc";
  swatch?: string;
  technical?: string;
  completion?: number;
  tag?: string;
  summary?: string;
  advantages?: string[];
  tradeoffs?: string[];
  bestFor?: string;
};

export type ProductOptionGroup = {
  key: ProductOptionKey;
  label: string;
  shortLabel: string;
  description: string;
  options: ProductOption[];
};

export type ProductConfiguration = {
  moduleId: ProductModuleId;
} & Record<ProductOptionKey, string>;

export const PRODUCT_MODULES: ProductModule[] = [
  {
    id: "MW40",
    name: "MW40",
    series: "Habitable",
    available: true,
    dimensions: { length: 6, width: 3, height: 2.8 },
    area: 18,
    basePrice: 34000,
    weight: "3.8 tn",
    leadTime: "3-5 semanas",
    assemblyTime: "1 jornada",
    modelPath: "/models/modulo_v01.glb",
  },
  {
    id: "MW50",
    name: "MW50",
    series: "Habitable",
    available: true,
    dimensions: { length: 6.05, width: 2.43, height: 2.83 },
    area: 14.7,
    basePrice: 42000,
    weight: "5.6 tn",
    leadTime: "4-6 semanas",
    assemblyTime: "1-2 jornadas",
    modelPath: "/models/modulo_v01.glb",
  },
  {
    id: "CM4000",
    name: "CM 4000 CV",
    series: "Comercial",
    available: true,
    dimensions: { length: 4, width: 2.06, height: 2.56 },
    area: 8.2,
    basePrice: 0,
    weight: "A confirmar",
    leadTime: "A cotizar",
    assemblyTime: "A confirmar",
    modelPath: "/models/cm-4000-cv/full.glb",
    priceOnRequest: true,
  },
  {
    id: "MWG9",
    name: "MW G9",
    series: "G9",
    available: true,
    dimensions: { length: 11.17, width: 3.46, height: 4.3 },
    area: 38.7,
    basePrice: 0,
    weight: "A confirmar",
    leadTime: "A cotizar",
    assemblyTime: "A confirmar",
    modelPath: "/models/mw-g9/full.glb",
    priceOnRequest: true,
  },
  {
    id: "MW900",
    name: "MW900",
    series: "MW-LOCK",
    available: true,
    dimensions: { length: 9, width: 3, height: 2.8 },
    area: 27,
    basePrice: 0,
    weight: "En ingeniería",
    leadTime: "Prototipo",
    assemblyTime: "A validar",
    modelPath: "/models/mw900/v002/structure.glb",
    modelVersion: "v002",
    visualPackage: "structure",
    manifestPath: "/models/mw900/v002/manifest.json",
    bomPath: "/models/mw900/v002/bom.json",
    designStatus: "concept-not-engineered",
    priceOnRequest: true,
  },
];

export const PRODUCT_OPTION_GROUPS: ProductOptionGroup[] = [
  {
    key: "use",
    label: "Uso",
    shortLabel: "Uso",
    description: "Programa principal del modulo.",
    options: [
      { id: "housing", label: "Vivienda", price: 1800, technical: "Base habitable con prevision sanitaria." },
      { id: "office", label: "Oficina", price: 1200, technical: "Layout flexible, datos y climatizacion previstos." },
      { id: "health", label: "Salud", price: 5200, technical: "Superficies lavables e instalaciones reforzadas." },
      { id: "classroom", label: "Aula", price: 2400, technical: "Uso educativo con alta ocupacion." },
      { id: "site", label: "Obrador", price: 0, technical: "Configuracion resistente para obra." },
    ],
  },
  {
    key: "structure",
    label: "Estructura",
    shortLabel: "Estructura",
    description: "Sistema resistente del bastidor y perfileria.",
    options: [
      {
        id: "standard",
        label: "Steel frame galvanizado",
        price: 0,
        completion: 78,
        tag: "Estándar",
        summary: "Perfiles conformados en frío: precisos, livianos y eficientes para series modulares.",
        advantages: ["Excelente relación peso-resistencia", "Uniones secas y repetibles", "Protección anticorrosiva de fábrica"],
        tradeoffs: ["Exige resolver puentes térmicos", "Las cargas puntuales deben coordinarse"],
        bestFor: "Vivienda, oficinas y módulos transportables.",
      },
      {
        id: "reinforced",
        label: "Bastidor reforzado",
        price: 3600,
        completion: 82,
        tag: "Alta carga",
        summary: "Mayor sección y rigidización para traslado frecuente, apilado o luces más exigentes.",
        advantages: ["Más reserva estructural", "Mejor respuesta en izaje", "Admite equipamiento pesado"],
        tradeoffs: ["Más peso propio", "Mayor costo y huella material"],
        bestFor: "Minería, petróleo, apilado y relocaciones frecuentes.",
      },
      {
        id: "marine",
        label: "Protección ambiente severo",
        price: 5200,
        completion: 84,
        tag: "Corrosión",
        summary: "Sistema reforzado con esquema anticorrosivo específico para atmósferas agresivas.",
        advantages: ["Mayor vida útil exterior", "Menos mantenimiento", "Protege zonas de corte y soldadura"],
        tradeoffs: ["Proceso y control adicionales", "Plazo de fabricación mayor"],
        bestFor: "Costa, industria química y ambientes de alta humedad.",
      },
    ],
  },
  {
    key: "structureColor",
    label: "Pintura",
    shortLabel: "Color",
    description: "Terminacion protectora de la perfileria estructural.",
    options: [
      { id: "black", label: "Negro", price: 0, technical: "Esmalte industrial grafito." },
      { id: "white", label: "Blanco", price: 450, technical: "Esmalte industrial blanco." },
      { id: "galvanized", label: "Galvanizado visto", price: 620, technical: "Proteccion metalica sin pintura de acabado." },
    ],
  },
  {
    key: "floorInsulation",
    label: "Piso",
    shortLabel: "Aislacion",
    description: "Paquete inferior del modulo.",
    options: [
      {
        id: "insulated",
        label: "Lana mineral 80 mm",
        price: 1800,
        tag: "Acústico + fuego",
        summary: "Aislación fibrosa no combustible alojada entre perfiles del bastidor inferior.",
        advantages: ["Muy buen desempeño acústico", "Alta seguridad frente al fuego", "Tolera pequeñas irregularidades"],
        tradeoffs: ["Debe mantenerse seca", "Necesita barrera de viento bien ejecutada"],
        bestFor: "Vivienda, aulas, salud y oficinas.",
      },
      {
        id: "pir-floor",
        label: "PIR rígido 60 mm",
        price: 2300,
        tag: "Máximo térmico",
        summary: "Placa rígida de alto rendimiento térmico con espesor contenido.",
        advantages: ["Gran aislación por centímetro", "Bajo peso", "No se asienta dentro de la cámara"],
        tradeoffs: ["Menor aporte acústico", "Los encuentros requieren cortes precisos"],
        bestFor: "Climas extremos y módulos con altura crítica.",
      },
      {
        id: "standard",
        label: "Cámara técnica sin aislante",
        price: 0,
        tag: "Base",
        summary: "Paquete de piso estructural sin aislación térmica incorporada.",
        advantages: ["Menor inversión", "Montaje simple", "Útil para espacios no climatizados"],
        tradeoffs: ["Menor confort térmico y acústico", "Mayor consumo si se climatiza"],
        bestFor: "Depósitos, talleres y uso transitorio.",
      },
    ],
  },
  {
    key: "envelope",
    label: "Paredes",
    shortLabel: "Paneles",
    description: "Sistema constructivo completo de la envolvente.",
    options: [
      {
        id: "pir-50",
        label: "Panel PIR 50 mm",
        price: 0,
        tag: "Compacto",
        summary: "Panel sándwich liviano que integra ambas caras y aislación.",
        advantages: ["Muy rápido de montar", "Buen rendimiento con poco espesor", "Pocas capas y juntas"],
        tradeoffs: ["Desempeño acústico moderado", "Menor flexibilidad para instalaciones embutidas"],
        bestFor: "Oficinas, obradores y climas templados.",
      },
      {
        id: "pir-80",
        label: "Panel PIR 80 mm",
        price: 2400,
        tag: "Recomendado",
        summary: "Más espesor aislante para mejorar confort y demanda energética.",
        advantages: ["Mejor transmitancia térmica", "Continúa siendo liviano", "Montaje industrial rápido"],
        tradeoffs: ["Mayor costo", "Aumenta espesor de encuentros y remates"],
        bestFor: "Vivienda permanente y climatización intensiva.",
      },
      {
        id: "multilayer-wool",
        label: "Steel frame + lana mineral",
        price: 3300,
        tag: "Acústico",
        summary: "Muro multicapa con placa estructural, membranas, lana mineral y terminación interior.",
        advantages: ["Muy buen control acústico", "Capas reparables", "Facilita instalaciones"],
        tradeoffs: ["Más operaciones de montaje", "Mayor espesor total"],
        bestFor: "Aulas, vivienda, salud y salas de reunión.",
      },
      {
        id: "sip-100",
        label: "Panel SIP 100 mm",
        price: 3900,
        tag: "Integral",
        summary: "Panel estructural aislado de 100 mm que integra placas resistentes y núcleo térmico.",
        advantages: ["Rigidez de panel", "Montaje muy rápido", "Buen desempeño térmico"],
        tradeoffs: ["Las instalaciones requieren previsión", "Encuentros y sellos deben coordinarse"],
        bestFor: "Vivienda, aulas y programas de montaje acelerado.",
      },
    ],
  },
  {
    key: "roof",
    label: "Cubierta",
    shortLabel: "Cubierta",
    description: "Sistema superior del modulo.",
    options: [
      {
        id: "single-sheet",
        label: "Chapa trapezoidal",
        price: 0,
        tag: "Ágil",
        summary: "Cubierta metálica liviana que requiere completar aislación y cielorraso por separado.",
        advantages: ["Bajo costo", "Recambio sencillo", "Montaje muy rápido"],
        tradeoffs: ["Condensación y ruido si se detalla mal", "Más capas complementarias"],
        bestFor: "Talleres, depósitos y programas transitorios.",
      },
      {
        id: "sandwich",
        label: "Panel sándwich PIR",
        price: 2600,
        tag: "Recomendado",
        summary: "Cubierta industrial aislada que cierra el paquete térmico en una sola operación.",
        advantages: ["Buen control térmico", "Reduce puentes y tiempos", "Cara interior terminada"],
        tradeoffs: ["Mayor inversión", "Juntas y sellos determinan el resultado"],
        bestFor: "Vivienda, oficinas y módulos climatizados.",
      },
      {
        id: "standing-seam",
        label: "Junta alzada + manta",
        price: 3900,
        tag: "Premium",
        summary: "Cubierta de fijación oculta sobre paquete aislado y cámara ventilada.",
        advantages: ["Imagen limpia", "Muy buen escurrimiento", "Durabilidad alta"],
        tradeoffs: ["Ejecución especializada", "Más componentes"],
        bestFor: "Turismo, vivienda premium y showrooms.",
      },
    ],
  },
  {
    key: "installations",
    label: "MEP",
    shortLabel: "MEP",
    description: "Paquete electrico y previsiones tecnicas.",
    options: [
      { id: "basic", label: "Electrica basica", price: 0 },
      { id: "data", label: "Electrica + datos", price: 1600 },
      { id: "solar-ready", label: "Prevision solar", price: 2700 },
    ],
  },
  {
    key: "openings",
    label: "Aberturas",
    shortLabel: "Sistema",
    description: "Material, línea y color de las carpinterías.",
    options: [
      {
        id: "modena",
        label: "Aluar Módena + DVH",
        price: 0,
        family: "aluminum",
        tag: "Equilibrada",
        summary: "Línea de aluminio muy difundida, de mantenimiento bajo y buena disponibilidad.",
        advantages: ["Repuestos y talleres disponibles", "Tipologías versátiles", "Costo controlado"],
        tradeoffs: ["Prestación media", "El resultado depende del vidrio y la ejecución"],
        bestFor: "Vivienda, oficinas y módulos estándar.",
      },
      {
        id: "a30",
        label: "Aluar A30 New + DVH",
        price: 2400,
        family: "aluminum",
        tag: "Alta prestación",
        summary: "Sistema de mayores secciones y posibilidades constructivas para aberturas más exigentes.",
        advantages: ["Mejor hermeticidad potencial", "Admite paños mayores", "Amplia variedad tipológica"],
        tradeoffs: ["Mayor costo", "Más peso y sección visual"],
        bestFor: "Vivienda premium, salud y fachadas expuestas.",
      },
      {
        id: "pvc-tecnocom",
        label: "PVC Tecnocom 2000 + DVH",
        price: 3200,
        family: "pvc",
        tag: "Térmico",
        summary: "Carpintería de PVC multicámara, hermética y de mantenimiento muy bajo.",
        advantages: ["Reduce puentes térmicos", "Muy buena hermeticidad", "Mantenimiento simple"],
        tradeoffs: ["Perfiles visualmente más anchos", "Oferta y color dependen del proveedor"],
        bestFor: "Climas fríos o cálidos extremos y vivienda eficiente.",
      },
      {
        id: "pvc-rehau",
        label: "PVC REHAU Euro-Design + DVH",
        price: 4100,
        family: "pvc",
        tag: "Alta prestación",
        summary: "Sistema de PVC multicámara de alta hermeticidad para envolventes exigentes.",
        advantages: ["Muy baja transmitancia", "Cierre hermético", "Buen aislamiento acústico"],
        tradeoffs: ["Mayor inversión", "Necesita proveedor especializado"],
        bestFor: "Vivienda eficiente, salud y climas rigurosos.",
      },
    ],
  },
  {
    key: "finish",
    label: "Pintura exterior",
    shortLabel: "Exterior",
    description: "Color final para superficies exteriores pintables.",
    options: [
      {
        id: "exterior-white",
        label: "Blanco técnico",
        price: 0,
        swatch: "#e9e8e1",
        tag: "Base",
        summary: "Acabado blanco neutro, luminoso y compatible con la imagen industrial del panel.",
        advantages: ["Reduce absorción solar", "Imagen limpia", "Fácil de combinar"],
        tradeoffs: ["La suciedad se percibe antes", "Requiere limpieza periódica"],
        bestFor: "Vivienda, salud, educación y oficinas.",
      },
      {
        id: "exterior-graphite",
        label: "Negro grafito",
        price: 680,
        swatch: "#35383a",
        tag: "Contemporáneo",
        summary: "Acabado oscuro que recorta el volumen y enfatiza carpinterías y juntas.",
        advantages: ["Imagen sobria", "Unifica remates", "Buen contraste"],
        tradeoffs: ["Mayor temperatura superficial", "Marca polvo claro"],
        bestFor: "Oficinas, retail y vivienda contemporánea.",
      },
      {
        id: "exterior-sand",
        label: "Arena",
        price: 680,
        swatch: "#b9ad94",
        tag: "Cálido",
        summary: "Tono mineral medio que suaviza la lectura industrial del módulo.",
        advantages: ["Integra paisaje y madera", "Disimula polvo", "Imagen residencial"],
        tradeoffs: ["Debe coordinarse con sellos", "Puede variar entre partidas"],
        bestFor: "Turismo, vivienda y entornos naturales.",
      },
      {
        id: "exterior-oxide",
        label: "Rojo óxido",
        price: 760,
        swatch: "#7d4134",
        tag: "Identidad",
        summary: "Color terroso de alta presencia para piezas de marca o implantaciones rurales.",
        advantages: ["Carácter definido", "Combina con grafito", "Buena lectura a distancia"],
        tradeoffs: ["Color protagonista", "Requiere muestra previa"],
        bestFor: "Retail, turismo y equipamiento institucional.",
      },
    ],
  },
  {
    key: "interiorFinish",
    label: "Pintura interior",
    shortLabel: "Interior",
    description: "Paleta base para paramentos y cielorraso interior.",
    options: [
      {
        id: "interior-white",
        label: "Blanco cálido",
        price: 0,
        swatch: "#f0eee6",
        tag: "Base",
        summary: "Blanco suave que amplía visualmente el interior sin producir un contraste frío.",
        advantages: ["Máxima luminosidad", "Paleta flexible", "Fácil mantenimiento"],
        tradeoffs: ["Marca roces", "Puede requerir retoques"],
        bestFor: "Cualquier programa interior.",
      },
      {
        id: "interior-greige",
        label: "Greige claro",
        price: 420,
        swatch: "#c9c3b7",
        tag: "Neutro",
        summary: "Gris beige de baja saturación para un interior sereno y menos clínico.",
        advantages: ["Disimula uso cotidiano", "Combina con madera", "Lectura residencial"],
        tradeoffs: ["Reduce levemente la reflectancia", "Conviene validar con luz real"],
        bestFor: "Vivienda, oficinas y hospitality.",
      },
      {
        id: "interior-sage",
        label: "Verde salvia",
        price: 520,
        swatch: "#a9b0a0",
        tag: "Calmo",
        summary: "Acento desaturado para interiores de descanso, aprendizaje o atención.",
        advantages: ["Identidad sutil", "Buen vínculo con madera", "Ambiente sereno"],
        tradeoffs: ["No es totalmente neutro", "Usar con iluminación cálida"],
        bestFor: "Vivienda, salud, educación y turismo.",
      },
    ],
  },
];

export const DEFAULT_PRODUCT_CONFIGURATION: ProductConfiguration = {
  moduleId: "MW50",
  use: "office",
  structure: "standard",
  structureColor: "black",
  floorInsulation: "insulated",
  envelope: "pir-80",
  openings: "modena",
  roof: "single-sheet",
  installations: "basic",
  finish: "exterior-graphite",
  interiorFinish: "interior-white",
};

export function getProductModule(configuration: ProductConfiguration) {
  return PRODUCT_MODULES.find((item) => item.id === configuration.moduleId) ?? PRODUCT_MODULES[1];
}

export function getProductOption(groupKey: ProductOptionKey, optionId: string) {
  const group = PRODUCT_OPTION_GROUPS.find((item) => item.key === groupKey);
  return group?.options.find((option) => option.id === optionId) ?? group?.options[0] ?? null;
}

export function getProductOptionGroup(groupKey: ProductOptionKey) {
  return PRODUCT_OPTION_GROUPS.find((group) => group.key === groupKey) ?? null;
}

export function formatUsd(value: number) {
  return `USD ${Math.round(value).toLocaleString("en-US")}`;
}
