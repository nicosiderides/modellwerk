export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Face = "north" | "south" | "east" | "west" | "above" | "below";
export type Layout = "auto" | "linear" | "compact";
export type Wall = {
  id: string;
  kind: "external" | "internal";
  face?: Face;
  start: Vec2;
  end: Vec2;
  thickness: number;
  height: number;
  material: string;
};
export type Opening = {
  id: string;
  wallId: string;
  kind: "door" | "window";
  position: number;
  width: number;
  height: number;
  sillHeight: number;
  direction: 1 | -1;
  hinge: "left" | "right";
  type: string;
};
export type ModuleDefinition = {
  id: string;
  version: string;
  dimensions: { length: number; width: number; height: number };
  coordinates: {
    floorDatum: number;
    ceilingDatum: number;
    structureDatum: number;
    blenderToWeb: string;
    origin: string;
  };
  walls: Wall[];
  sockets: Record<Face, Vec3>;
  structureUrl: string;
  structureParts: number;
  proposedLayers: {
    wallThickness: number;
    partitionThickness: number;
    floorBoard: number;
    floorFinish: number;
    ceilingBoard: number;
    roofPanel: number;
    ceilingVoid: number;
  };
  obstacles: { id: string; role: string; min: Vec3; max: Vec3 }[];
};
export type ModuleInstance = {
  id: string;
  definitionId: string;
  index: number;
  level: number;
  position: Vec3;
  walls: Wall[];
  openings: Opening[];
  removedExternalFaces: Face[];
  floorMaterial: string;
};
export type Project = {
  schemaVersion: 1;
  definitionVersion: string;
  name: string;
  layout: Layout;
  levels: number;
  rotation: number;
  modules: ModuleInstance[];
  rates: Record<string, number | null>;
};
export type Neighbors = Record<string, Partial<Record<Face, string>>>;
export type Issue = { code: string; message: string; moduleId?: string; elementId?: string };
export type Quantity = { id: string; label: string; unit: "m²" | "m" | "ud"; amount: number };
export type Selection = { moduleId: string; elementId?: string };
