import type { FactoryStation, StationId, Vec3 } from "../utils/sceneTypes";

const MODULE_FOOTPRINT: [number, number] = [12, 4.4];
const MODULE_CLEARANCE: [number, number] = [2.2, 1.8];

export const STATIONS: FactoryStation[] = [
  {
    id: "overview",
    step: "00",
    title: "Vista general",
    shortTitle: "General",
    eyebrow: "Bienvenida",
    description: "Lectura completa de la nave, el modulo habitable y las zonas de fabricacion.",
    productionZone: "Showroom central",
    camera: {
      position: [7.15, 2.3, 5.75],
      target: [0, 1.42, 0],
      minDistance: 5.7,
      maxDistance: 32,
      minPolarAngle: Math.PI * 0.08,
      maxPolarAngle: Math.PI * 0.49,
      transitionDuration: 1.35,
      controlMode: "orbit-free",
    },
    factoryPosition: [0, 0, 0],
    modulePose: {
      position: [0, 0.18, 0],
      rotationY: Math.PI,
      footprint: MODULE_FOOTPRINT,
      clearance: [2.8, 2.2],
    },
    materialKeys: [],
    productOptionKeys: ["moduleId", "use"],
    highlights: [],
    actions: ["Modelo habitable", "Uso del modulo", "Estado BIM activo"],
  },
  {
    id: "structure",
    step: "01",
    title: "Estructura",
    shortTitle: "Estructura",
    eyebrow: "Bastidor y perfileria",
    description: "Foco en chasis, estructura portante y logica de ensamble industrial.",
    productionZone: "Steel frame assembly",
    camera: {
      position: [-8.6, 3.15, 9.7],
      target: [0, 1.38, 0],
      minDistance: 5.8,
      maxDistance: 18,
      minPolarAngle: Math.PI * 0.1,
      maxPolarAngle: Math.PI * 0.48,
      transitionDuration: 1.15,
      controlMode: "orbit-limited",
    },
    factoryPosition: [-43, 0, -18],
    modulePose: {
      position: [-46, 0.18, -14.55],
      rotationY: Math.PI,
      footprint: MODULE_FOOTPRINT,
      clearance: MODULE_CLEARANCE,
      travelWaypoints: [[-16, 0.18, -14.55]],
    },
    materialKeys: [],
    productOptionKeys: ["structure", "structureColor"],
    highlights: ["structure"],
    actions: ["Soldadura de bastidor", "Viga central de refuerzo", "Control de tolerancias"],
  },
  {
    id: "floor",
    step: "02",
    title: "Piso",
    shortTitle: "Piso",
    eyebrow: "Paquete inferior",
    description: "Camara baja para evaluar terminacion, apoyo y paquete tecnico del piso.",
    productionZone: "Floor package",
    camera: {
      position: [-6.4, 2.2, 6.9],
      target: [0, 0.72, 0],
      minDistance: 4.2,
      maxDistance: 14,
      minPolarAngle: Math.PI * 0.12,
      maxPolarAngle: Math.PI * 0.49,
      transitionDuration: 1.05,
      controlMode: "orbit-limited",
    },
    factoryPosition: [-4, 0, -8.6],
    modulePose: {
      position: [-4, 0.18, -8.6],
      rotationY: Math.PI,
      footprint: MODULE_FOOTPRINT,
      clearance: MODULE_CLEARANCE,
    },
    materialKeys: ["PISO"],
    productOptionKeys: ["floorInsulation"],
    highlights: ["floor"],
    actions: ["Bastidor inferior", "Colocación de fenólicos", "Aislación y piso final"],
  },
  {
    id: "walls",
    step: "03",
    title: "Paredes",
    shortTitle: "Paredes",
    eyebrow: "Cerramientos",
    description: "Vista frontal para comparar el sistema de envolvente y su terminacion interior.",
    productionZone: "Wall panel fabrication",
    camera: {
      position: [0, 2.55, 8.7],
      target: [0, 1.42, 0],
      minDistance: 5.2,
      maxDistance: 16,
      minPolarAngle: Math.PI * 0.1,
      maxPolarAngle: Math.PI * 0.46,
      transitionDuration: 1.15,
      controlMode: "orbit-limited",
    },
    factoryPosition: [23, 0, -22],
    modulePose: {
      position: [16, 0.18, -8.6],
      rotationY: Math.PI,
      footprint: MODULE_FOOTPRINT,
      clearance: MODULE_CLEARANCE,
    },
    materialKeys: ["EXT_REV", "INT_PARED"],
    productOptionKeys: ["envelope"],
    highlights: ["walls"],
    actions: ["Armado de paneles", "Sellado de juntas", "Terminación interior"],
  },
  {
    id: "roof",
    step: "04",
    title: "Techo",
    shortTitle: "Techo",
    eyebrow: "Cubierta y cielorraso",
    description: "Vista diagonal superior para entender cubierta, cielorraso y aislacion futura.",
    productionZone: "Roof preparation",
    camera: {
      position: [6.6, 6.25, 6.35],
      target: [0, 1.42, 0],
      minDistance: 5.4,
      maxDistance: 18,
      minPolarAngle: Math.PI * 0.05,
      maxPolarAngle: Math.PI * 0.34,
      transitionDuration: 1.1,
      controlMode: "orbit-limited",
    },
    factoryPosition: [0, 0, -13.8],
    modulePose: {
      position: [34, 0.18, -8.6],
      rotationY: Math.PI,
      footprint: MODULE_FOOTPRINT,
      clearance: MODULE_CLEARANCE,
    },
    materialKeys: ["EXT_TECHO", "INT_CIEL"],
    productOptionKeys: ["roof", "installations"],
    highlights: ["roof"],
    actions: ["Preparación de cubierta", "Montaje de aislación", "Coordinación MEP superior"],
  },
  {
    id: "openings",
    step: "05",
    title: "Aberturas",
    shortTitle: "Aberturas",
    eyebrow: "Carpinterias",
    description: "Orbita limitada alrededor de ventanas, puertas y perfileria visible.",
    productionZone: "Window installation",
    camera: {
      position: [7.2, 3.05, 8.15],
      target: [0, 1.42, 0],
      minDistance: 5,
      maxDistance: 16,
      minPolarAngle: Math.PI * 0.11,
      maxPolarAngle: Math.PI * 0.45,
      transitionDuration: 1.0,
      controlMode: "orbit-limited",
    },
    factoryPosition: [45, 0, -17],
    modulePose: {
      position: [47, 0.18, -8.6],
      rotationY: Math.PI,
      footprint: MODULE_FOOTPRINT,
      clearance: [2.4, 1.8],
    },
    materialKeys: ["CARP"],
    productOptionKeys: ["openings"],
    highlights: ["openings"],
    actions: ["Presentación de marcos", "Montaje de aberturas", "Sellado y regulación"],
  },
  {
    id: "finishes",
    step: "06",
    title: "Terminaciones",
    shortTitle: "Terminaciones",
    eyebrow: "Control final y despacho",
    description: "Revision de materialidad, protecciones de transporte y entrega del modulo terminado.",
    productionZone: "Final inspection & dispatch",
    camera: {
      position: [7.2, 3.05, 8.15],
      target: [0, 1.42, 0],
      minDistance: 5.4,
      maxDistance: 17,
      minPolarAngle: Math.PI * 0.1,
      maxPolarAngle: Math.PI * 0.46,
      transitionDuration: 1.1,
      controlMode: "orbit-limited",
    },
    factoryPosition: [48, 0, 1],
    modulePose: {
      position: [-8, 0.18, 8.8],
      rotationY: Math.PI,
      footprint: MODULE_FOOTPRINT,
      clearance: MODULE_CLEARANCE,
      travelWaypoints: [[47, 0.18, 8.8]],
    },
    materialKeys: [],
    productOptionKeys: ["finish", "interiorFinish"],
    highlights: ["finishes"],
    actions: ["Pintura exterior", "Pintura interior", "Control final de acabado"],
  },
  {
    id: "review",
    step: "07",
    title: "Revision final",
    shortTitle: "Revision",
    eyebrow: "Entrega digital",
    description: "Hero final del modulo configurado, listo para recorrido libre o siguiente integracion.",
    productionZone: "Digital engineering",
    camera: {
      position: [-10.8, 3.65, 9.7],
      target: [0, 1.42, 0],
      minDistance: 6.6,
      maxDistance: 28,
      minPolarAngle: Math.PI * 0.08,
      maxPolarAngle: Math.PI * 0.48,
      transitionDuration: 1.25,
      controlMode: "orbit-free",
    },
    factoryPosition: [-31, 0, 20],
    modulePose: {
      position: [-34, 0.18, 8.8],
      rotationY: Math.PI,
      footprint: MODULE_FOOTPRINT,
      clearance: [2.8, 2.2],
    },
    materialKeys: ["PISO", "INT_PARED", "CARP"],
    productOptionKeys: [
      "moduleId",
      "use",
      "structure",
      "floorInsulation",
      "envelope",
      "roof",
      "installations",
      "openings",
      "finish",
      "interiorFinish",
    ],
    highlights: [],
    actions: ["Resumen", "Modo libre", "Preparado para exportar"],
  },
];

export const DEFAULT_STATION_ID: StationId = "overview";

export function getStationConfig(stationId: StationId) {
  return STATIONS.find((station) => station.id === stationId) ?? STATIONS[0];
}

export function getStationIndex(stationId: StationId) {
  return Math.max(0, STATIONS.findIndex((station) => station.id === stationId));
}

export function getStationModulePose(stationId: StationId) {
  return getStationConfig(stationId).modulePose;
}

function pushRoutePoint(points: Vec3[], point: Vec3) {
  const previous = points[points.length - 1];
  if (previous && previous[0] === point[0] && previous[2] === point[2]) return;
  points.push(point);
}

export function getModuleTravelPoints(fromStationId: StationId, toStationId: StationId) {
  const fromIndex = getStationIndex(fromStationId);
  const toIndex = getStationIndex(toStationId);
  const points: Vec3[] = [];

  if (fromIndex === toIndex) {
    pushRoutePoint(points, STATIONS[toIndex].modulePose.position);
    return points;
  }

  if (toIndex > fromIndex) {
    for (let index = fromIndex + 1; index <= toIndex; index += 1) {
      STATIONS[index].modulePose.travelWaypoints?.forEach((point) => pushRoutePoint(points, point));
      pushRoutePoint(points, STATIONS[index].modulePose.position);
    }
    return points;
  }

  for (let index = fromIndex; index > toIndex; index -= 1) {
    [...(STATIONS[index].modulePose.travelWaypoints ?? [])]
      .reverse()
      .forEach((point) => pushRoutePoint(points, point));
    pushRoutePoint(points, STATIONS[index - 1].modulePose.position);
  }

  return points;
}

export const MODULE_ROUTE_POINTS: Vec3[] = [
  STATIONS[0].modulePose.position,
  [-16, 0.18, -14.55],
  STATIONS[1].modulePose.position,
  STATIONS[2].modulePose.position,
  STATIONS[3].modulePose.position,
  STATIONS[4].modulePose.position,
  STATIONS[5].modulePose.position,
  [47, 0.18, 8.8],
  STATIONS[6].modulePose.position,
  STATIONS[7].modulePose.position,
];
