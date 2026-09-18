import type { ModuleMaterialKey, ModuleMaterialSelection } from "../utils/sceneTypes";

export type ModuleMaterialOption = {
  id: string;
  name: string;
  color: string;
  texture?: string;
  material: "wood" | "paint" | "metal" | "concrete" | "floor";
  tag: string;
  summary: string;
  advantages: string[];
  tradeoffs: string[];
  bestFor: string;
};

export type ModuleMaterialCategory = {
  key: ModuleMaterialKey;
  label: string;
  shortLabel: string;
  options: ModuleMaterialOption[];
};

export const MODULE_MATERIAL_CATEGORIES: ModuleMaterialCategory[] = [
  {
    key: "EXT_TECHO",
    label: "Cubierta",
    shortLabel: "Techo",
    options: [
      {
        id: "trapezoidal-sheet",
        name: "Chapa trapezoidal T101",
        color: "#34383b",
        texture: "/textures/ext_chapa_vert/corrugated_iron_02_diff_1k.jpg",
        material: "metal",
        tag: "Ágil",
        summary: "Cubierta liviana de acero prepintado, muy difundida en fabricación modular.",
        advantages: ["Montaje rápido", "Bajo peso", "Mantenimiento simple"],
        tradeoffs: ["Necesita aislación complementaria", "La lluvia exige control acústico"],
        bestFor: "Obradores, depósitos y módulos de entrega rápida.",
      },
      {
        id: "pir-roof-panel",
        name: "Panel sándwich PIR",
        color: "#d8d8d3",
        texture: "/textures/ext_chapa_vert/corrugated_iron_02_diff_1k.jpg",
        material: "metal",
        tag: "Térmico",
        summary: "Dos caras metálicas con núcleo PIR que resuelven cubierta y aislación en una pieza.",
        advantages: ["Muy buena aislación con poco espesor", "Montaje en seco", "Terminación interior limpia"],
        tradeoffs: ["Mayor inversión inicial", "Las juntas deben ejecutarse con precisión"],
        bestFor: "Vivienda, oficinas y usos con climatización permanente.",
      },
      {
        id: "standing-seam-sheet",
        name: "Chapa junta alzada",
        color: "#4f5659",
        texture: "/textures/ext_chapa_vert/corrugated_iron_02_diff_1k.jpg",
        material: "metal",
        tag: "Premium",
        summary: "Sistema continuo de plegados elevados con una lectura arquitectónica más limpia.",
        advantages: ["Excelente escurrimiento", "Pocas fijaciones expuestas", "Imagen contemporánea"],
        tradeoffs: ["Mano de obra especializada", "Costo superior a la chapa trapezoidal"],
        bestFor: "Showrooms, hospitality y módulos de alta gama.",
      },
    ],
  },
  {
    key: "EXT_REV",
    label: "Revestimiento",
    shortLabel: "Exterior",
    options: [
      {
        id: "pir-microprofile",
        name: "Panel PIR micronervado",
        color: "#f1f0e9",
        material: "metal",
        tag: "Eficiente",
        summary: "Panel industrial autoportante que integra piel exterior, núcleo térmico y cara interior.",
        advantages: ["Pocos componentes", "Hermeticidad alta", "Obra limpia y rápida"],
        tradeoffs: ["Modulación condicionada por el panel", "Reparaciones localizadas más visibles"],
        bestFor: "Series repetitivas y edificios con plazo exigente.",
      },
      {
        id: "thermowood-horizontal",
        name: "Madera termotratada",
        color: "#b78355",
        texture: "/textures/ext_madera_horiz/wood_planks_diff_1k.jpg",
        material: "wood",
        tag: "Natural",
        summary: "Revestimiento ventilado de madera estabilizada para una envolvente cálida y renovable.",
        advantages: ["Gran valor percibido", "Bajo peso", "Fachada ventilada reparable"],
        tradeoffs: ["Requiere detalle hidrófugo", "El color evoluciona si no se mantiene"],
        bestFor: "Vivienda, turismo y espacios comerciales.",
      },
      {
        id: "corrugated-sheet",
        name: "Chapa sinusoidal vertical",
        color: "#b9bec0",
        texture: "/textures/ext_chapa_vert/corrugated_iron_02_diff_1k.jpg",
        material: "metal",
        tag: "Robusto",
        summary: "Piel metálica durable, económica y de mantenimiento muy bajo.",
        advantages: ["Alta durabilidad", "Recambio sencillo", "Amplia carta de colores"],
        tradeoffs: ["Necesita subestructura", "Puede amplificar puentes térmicos mal resueltos"],
        bestFor: "Oficinas industriales, obradores y logística.",
      },
      {
        id: "fiber-cement-siding",
        name: "Siding vertical 35 cm",
        color: "#d7d2c6",
        material: "concrete",
        tag: "Bajo mantenimiento",
        summary: "Tablas cementicias para fachada ventilada con buena estabilidad frente a intemperie.",
        advantages: ["Resiste humedad y rayos UV", "No se pudre", "Imagen residencial"],
        tradeoffs: ["Más peso que la chapa", "Exige cortes y fijaciones correctas"],
        bestFor: "Vivienda permanente, educación y salud.",
      },
    ],
  },
  {
    key: "INT_PARED",
    label: "Interior",
    shortLabel: "Interior",
    options: [
      {
        id: "gypsum-standard",
        name: "Placa de yeso estándar",
        color: "#e8e6e0",
        texture: "/textures/int_pintura/painted_plaster_wall_diff_1k.jpg",
        material: "paint",
        tag: "Versátil",
        summary: "Terminación interior seca, lisa y fácil de reparar o repintar.",
        advantages: ["Costo controlado", "Terminación continua", "Instalaciones accesibles"],
        tradeoffs: ["No es la opción para humedad directa", "Requiere refuerzos para cargas altas"],
        bestFor: "Dormitorios, oficinas y áreas secas.",
      },
      {
        id: "gypsum-rh",
        name: "Placa RH antihumedad",
        color: "#dce5d9",
        texture: "/textures/int_pintura/painted_plaster_wall_diff_1k.jpg",
        material: "paint",
        tag: "Húmedos",
        summary: "Placa aditivada para reducir absorción superficial en ambientes interiores húmedos.",
        advantages: ["Apta para baños y cocinas", "Lista para pintar o revestir", "Montaje en seco"],
        tradeoffs: ["No reemplaza la impermeabilización", "Mayor costo que la placa estándar"],
        bestFor: "Baños, cocinas, lavaderos y vestuarios.",
      },
      {
        id: "gypsum-impact",
        name: "Placa alta resistencia",
        color: "#d8d3c7",
        texture: "/textures/int_pintura/painted_plaster_wall_diff_1k.jpg",
        material: "paint",
        tag: "Intensivo",
        summary: "Placa de alta densidad con mejor respuesta a golpes, fijaciones y uso cotidiano.",
        advantages: ["Admite cargas mayores", "Mejor resistencia a impactos", "Aporta desempeño acústico"],
        tradeoffs: ["Más pesada", "Precio superior"],
        bestFor: "Aulas, pasillos, salud y viviendas de uso intenso.",
      },
      {
        id: "osb-visible",
        name: "OSB sellado visto",
        color: "#c49b63",
        material: "wood",
        tag: "Táctil",
        summary: "Panel estructural de virutas orientadas usado como terminación expresiva y resistente.",
        advantages: ["Buena base de fijación", "Rápido de montar", "Reduce capas si se deja visto"],
        tradeoffs: ["Debe sellarse correctamente", "La estética es más industrial"],
        bestFor: "Workspaces, retail y módulos de lenguaje industrial.",
      },
    ],
  },
  {
    key: "INT_CIEL",
    label: "Cielorraso",
    shortLabel: "Cielo",
    options: [
      {
        id: "painted-gypsum-ceiling",
        name: "Yeso pintado",
        color: "#f5f5f0",
        texture: "/textures/int_pintura/painted_plaster_wall_diff_1k.jpg",
        material: "paint",
        tag: "Continuo",
        summary: "Cielorraso liso con juntas tomadas y acabado de pintura.",
        advantages: ["Imagen limpia", "Fácil integración de luminarias", "Reparable"],
        tradeoffs: ["Acceso a instalaciones más lento", "Sensible a filtraciones"],
        bestFor: "Vivienda, oficinas y hospitalidad.",
      },
      {
        id: "timber-slats",
        name: "Listones acústicos",
        color: "#caa376",
        texture: "/textures/wood_oak/oak_veneer_01_diff_1k.jpg",
        material: "wood",
        tag: "Acústico",
        summary: "Listones de madera sobre absorbente para dar calidez y controlar reverberación.",
        advantages: ["Mejora acústica", "Alto valor visual", "Registrable por sectores"],
        tradeoffs: ["Mayor costo", "Necesita coordinación con luminarias y MEP"],
        bestFor: "Aulas, salas de reunión y hospitality.",
      },
      {
        id: "pvc-sanitary-ceiling",
        name: "PVC sanitario",
        color: "#e8e9e5",
        material: "paint",
        tag: "Lavable",
        summary: "Tablillas livianas de superficie lavable para áreas con alta exigencia de higiene.",
        advantages: ["Resiste humedad", "Limpieza simple", "Montaje rápido"],
        tradeoffs: ["Menor percepción premium", "Debe verificarse reacción al fuego"],
        bestFor: "Sanitarios, vestuarios y módulos de servicio.",
      },
    ],
  },
  {
    key: "PISO",
    label: "Piso modulo",
    shortLabel: "Piso",
    options: [
      {
        id: "lvt-oak-floor",
        name: "Vinílico LVT roble",
        color: "#a77c57",
        texture: "/textures/piso_madera/wood_shutter_diff_2k.jpg",
        material: "floor",
        tag: "Equilibrado",
        summary: "Piso vinílico en tablas: cálido a la vista, liviano y compatible con obra seca.",
        advantages: ["Bajo espesor", "Confort al pisar", "Recambio por piezas"],
        tradeoffs: ["La base debe quedar muy plana", "Puede marcarse con cargas puntuales"],
        bestFor: "Vivienda, oficinas y hospitality.",
      },
      {
        id: "spc-floor",
        name: "SPC sistema click",
        color: "#8f755f",
        texture: "/textures/piso_madera/wood_shutter_diff_2k.jpg",
        material: "floor",
        tag: "Resistente",
        summary: "Tablas vinílicas rígidas con encastre, estables y rápidas de instalar.",
        advantages: ["Buena estabilidad", "Instalación flotante", "Tolera uso intenso"],
        tradeoffs: ["Más rígido y sonoro", "Requiere manta y juntas perimetrales"],
        bestFor: "Oficinas, aulas y vivienda de alquiler.",
      },
      {
        id: "microcement",
        name: "Microcemento",
        color: "#888888",
        texture: "/textures/piso_cemento/concrete_floor_worn_001_diff_2k.jpg",
        material: "concrete",
        tag: "Monolítico",
        summary: "Revestimiento continuo de pocos milímetros con estética mineral.",
        advantages: ["Sin juntas visibles", "Aspecto contemporáneo", "Bajo espesor"],
        tradeoffs: ["Depende mucho del aplicador", "Puede fisurar si la base se mueve"],
        bestFor: "Showrooms, retail y vivienda contemporánea.",
      },
      {
        id: "homogeneous-vinyl-floor",
        name: "Vinílico homogéneo",
        color: "#757b78",
        material: "floor",
        tag: "Sanitario",
        summary: "Rollo vinílico soldable con superficie continua y limpieza controlada.",
        advantages: ["Higiénico", "Alta resistencia al tránsito", "Zócalo sanitario posible"],
        tradeoffs: ["Colocación especializada", "Base perfectamente lisa"],
        bestFor: "Salud, laboratorios, educación y cocinas.",
      },
    ],
  },
  {
    key: "CARP",
    label: "Color carpinteria",
    shortLabel: "Color",
    options: [
      {
        id: "black-aluminum",
        name: "Aluminio negro",
        color: "#222222",
        material: "metal",
        tag: "Contemporáneo",
        summary: "Terminación oscura que recorta las aberturas y disimula herrajes.",
        advantages: ["Imagen premium", "Combina con madera y chapa", "Mantenimiento bajo"],
        tradeoffs: ["Toma más temperatura al sol", "Las rayas claras se notan"],
        bestFor: "Vivienda, oficinas y retail.",
      },
      {
        id: "white-aluminum",
        name: "Aluminio blanco",
        color: "#eeeeea",
        material: "metal",
        tag: "Luminoso",
        summary: "Acabado neutro que integra la carpintería a paredes y cielorrasos claros.",
        advantages: ["Aporta luminosidad", "Lectura residencial", "Amplia disponibilidad"],
        tradeoffs: ["La suciedad se ve antes", "Menor contraste arquitectónico"],
        bestFor: "Salud, educación y vivienda.",
      },
    ],
  },
];

export const DEFAULT_MODULE_MATERIALS: ModuleMaterialSelection = {
  EXT_TECHO: 0,
  EXT_REV: 2,
  INT_PARED: 0,
  INT_CIEL: 0,
  PISO: 0,
  CARP: 0,
};

export function getModuleMaterialOption(selection: ModuleMaterialSelection, key: ModuleMaterialKey) {
  const category = MODULE_MATERIAL_CATEGORIES.find((item) => item.key === key);
  if (!category) return null;
  return category.options[selection[key]] ?? category.options[0] ?? null;
}
