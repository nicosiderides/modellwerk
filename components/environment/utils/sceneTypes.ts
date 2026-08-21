export type Vec3 = [number, number, number];
export type EulerTuple = [number, number, number];

export type NavigationMode = "orbit" | "walk" | "fly";
export type RenderQuality = "auto" | "performance" | "balanced" | "high" | "ultra";

export type ProductOptionKey =
  | "use"
  | "structure"
  | "structureColor"
  | "floorInsulation"
  | "envelope"
  | "openings"
  | "roof"
  | "installations"
  | "finish"
  | "interiorFinish";

export type ModuleViewMode =
  | "full"
  | "no-roof"
  | "interior"
  | "structure"
  | "structure-floor"
  | "technical"
  | "install";

export type StationId =
  | "overview"
  | "structure"
  | "floor"
  | "walls"
  | "roof"
  | "openings"
  | "finishes"
  | "review";

export type StationControlMode = "orbit-free" | "orbit-limited" | "guided-pan";

export type ModuleHighlightGroup =
  | "structure"
  | "floor"
  | "walls"
  | "roof"
  | "openings"
  | "finishes";

export type ModuleMaterialKey =
  | "EXT_TECHO"
  | "EXT_REV"
  | "INT_PARED"
  | "INT_CIEL"
  | "PISO"
  | "CARP";

export type ModuleMaterialSelection = Record<ModuleMaterialKey, number>;

export type StationCameraConfig = {
  position: Vec3;
  target: Vec3;
  minDistance: number;
  maxDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  transitionDuration: number;
  controlMode: StationControlMode;
};

export type ModuleStationPose = {
  position: Vec3;
  rotationY: number;
  footprint: [number, number];
  clearance: [number, number];
  cameraTarget?: Vec3;
  travelWaypoints?: Vec3[];
};

export type FactoryStation = {
  id: StationId;
  step: string;
  title: string;
  shortTitle: string;
  eyebrow: string;
  description: string;
  productionZone: string;
  camera: StationCameraConfig;
  factoryPosition: Vec3;
  modulePose: ModuleStationPose;
  materialKeys: ModuleMaterialKey[];
  productOptionKeys: Array<ProductOptionKey | "moduleId">;
  highlights: ModuleHighlightGroup[];
  actions: string[];
};

export type WorkZoneKind =
  | "steel"
  | "panels"
  | "windows"
  | "bathroom"
  | "furniture"
  | "warehouse"
  | "loading"
  | "cnc"
  | "robotic"
  | "packaging"
  | "quality"
  | "engineering";

export type WorkZone = {
  id: WorkZoneKind;
  label: string;
  station: string;
  position: Vec3;
  size: [number, number];
  accent: "yellow" | "white" | "graphite";
};
