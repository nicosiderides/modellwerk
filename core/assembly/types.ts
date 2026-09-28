/** Coordinates are metres: X horizontal, Y up, Z horizontal. Module position is its base centre. */
export type Vec3 = [number, number, number];
export type ModuleState =
  | "NOT READY" | "READY" | "IN TRANSIT" | "ON SITE" | "LIFTING"
  | "POSITIONING" | "FIXING" | "INSTALLED" | "CONNECTED" | "INSPECTED" | "COMPLETED";
export interface AssemblyModule {
  id: string;
  name: string;
  type: string;
  position: Vec3;
  /** Rotation about Y in degrees. */
  rotation: number;
  /** Zero-based storey. */
  level: number;
  /** Metric tonnes. */
  weight: number;
  /** Width X, height Y, depth Z, in metres. */
  dimensions: Vec3;
  /** Local offset from the module base centre, in metres. */
  centerOfGravity: Vec3;
  liftMinutes: number;
  fixMinutes: number;
  connections: string[];
  dependencies: string[];
  truckId: string;
  crewId: string;
  notes: string;
}
export interface Crane {
  id: string;
  name: string;
  position: Vec3;
  radius: number;
  /** Simplified planning capacity in tonnes, not a load chart. */
  capacity: number;
  height: number;
}
export interface Truck {
  id: string;
  name: string;
  /** Assigned deliveries, one full-size module per successive trip. */
  moduleIds: string[];
  /** Earliest availability, working minutes from day 1 at 08:00. */
  arrival: number;
}
export interface Crew { id: string; name: string; type: string }
export interface SiteZone { id: string; name: string; type: string; position: Vec3; size: [number, number] }
export interface Project {
  id: string;
  name: string;
  system: string;
  modules: AssemblyModule[];
  cranes: Crane[];
  trucks: Truck[];
  crews: Crew[];
  zones: SiteZone[];
  sequence: string[];
}
export interface ScheduledModule {
  moduleId: string;
  /** Work starts with rigging; the crane is held through release. */
  start: number;
  arrival: number;
  liftStart: number;
  positionStart: number;
  fixStart: number;
  release: number;
  end: number;
  craneId: string;
}
export interface Schedule { items: ScheduledModule[]; duration: number; craneMinutes: number }
export interface Conflict { id: string; moduleId?: string; severity: "warning" | "error"; message: string }
