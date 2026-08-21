import type { Vec3, WorkZone } from "./sceneTypes";

export const FACTORY_DIMENSIONS = {
  length: 120,
  width: 60,
  height: 15,
  halfLength: 60,
  halfWidth: 30,
} as const;

export const MODULE_SLOT = {
  name: "ModuleSlot",
  size: 25,
  halfSize: 12.5,
  center: [0, 0, 0] as Vec3,
  ledOffset: 12.84,
  integrationHeight: 0,
} as const;

export const CAMERA_HEIGHT = 1.7;

export const CAMERA_PRESETS = {
  orbit: {
    position: [31, 5.9, 18] as Vec3,
    target: [0, 1.55, 0] as Vec3,
  },
  walk: {
    position: [-23, CAMERA_HEIGHT, 19] as Vec3,
    target: [-7, CAMERA_HEIGHT, 7] as Vec3,
  },
  fly: {
    position: [-42, 11.2, 28] as Vec3,
    target: [0, 2.2, 0] as Vec3,
  },
} as const;

export const CAMERA_BOUNDS = {
  minX: -57,
  maxX: 57,
  minZ: -27,
  maxZ: 27,
  minY: CAMERA_HEIGHT,
  maxY: 13.4,
} as const;

export const WORK_ZONES: WorkZone[] = [
  {
    id: "steel",
    label: "Steel frame assembly",
    station: "01",
    position: [-43, 0, -18],
    size: [24, 13],
    accent: "yellow",
  },
  {
    id: "robotic",
    label: "Robotic welding",
    station: "02",
    position: [-22, 0, -21],
    size: [15, 10],
    accent: "yellow",
  },
  {
    id: "panels",
    label: "Wall panel fabrication",
    station: "03",
    position: [23, 0, -22],
    size: [20, 10],
    accent: "white",
  },
  {
    id: "windows",
    label: "Window installation",
    station: "04",
    position: [45, 0, -17],
    size: [18, 12],
    accent: "white",
  },
  {
    id: "warehouse",
    label: "Material warehouse",
    station: "05",
    position: [45, 0, 18],
    size: [20, 18],
    accent: "yellow",
  },
  {
    id: "bathroom",
    label: "Bathroom module preparation",
    station: "06",
    position: [24, 0, 21],
    size: [17, 12],
    accent: "white",
  },
  {
    id: "furniture",
    label: "Furniture staging",
    station: "07",
    position: [4, 0, 23],
    size: [17, 10],
    accent: "graphite",
  },
  {
    id: "quality",
    label: "Quality Control",
    station: "08",
    position: [-13, 0, 23],
    size: [14, 10],
    accent: "white",
  },
  {
    id: "engineering",
    label: "Digital engineering zone",
    station: "09",
    position: [-31, 0, 20],
    size: [18, 12],
    accent: "graphite",
  },
  {
    id: "cnc",
    label: "CNC area",
    station: "10",
    position: [-50, 0, 15],
    size: [17, 14],
    accent: "yellow",
  },
  {
    id: "packaging",
    label: "Packaging",
    station: "11",
    position: [26, 0, 2],
    size: [15, 16],
    accent: "graphite",
  },
  {
    id: "loading",
    label: "Loading preparation",
    station: "12",
    position: [48, 0, 1],
    size: [18, 18],
    accent: "yellow",
  },
];

export const STRUCTURAL_BAY_X = [
  -55, -45, -35, -25, -15, -5, 5, 15, 25, 35, 45, 55,
];

export const ROOF_PURLIN_Z = [-26, -22, -18, -14, -10, -6, 6, 10, 14, 18, 22, 26];

export const FORKLIFT_LANES = {
  north: -13.9,
  south: 13.9,
  east: 13.9,
  west: -13.9,
} as const;
