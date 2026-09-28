import type { AssemblyModule, Conflict, Crane, ModuleState, Project, Schedule, ScheduledModule, SiteZone, Vec3 } from "./types.ts";
export { validateProject } from "./validation.ts";

export const SHIFT_MINUTES = 480;
export const PREPARATION_MINUTES = 10;
export const POSITIONING_MINUTES = 8;
export const CONNECTION_MINUTES = 6;
export const SERVICES_MINUTES = 8;
export const INSPECTION_MINUTES = 4;
export const TRUCK_RETURN_MINUTES = 90;
const POST_RELEASE = CONNECTION_MINUTES + SERVICES_MINUTES + INSPECTION_MINUTES;

export function getPickupPosition(project: Project): Vec3 {
  const zone = project.zones.find((entry) => entry.type.toUpperCase() === "UNLOADING");
  return zone ? [zone.position[0], zone.position[1] + 1.15, zone.position[2]] : [0, 1.15, 16];
}

function radius(a: Vec3, b: Vec3): number { return Math.hypot(a[0] - b[0], a[2] - b[2]); }
function cruiseHeight(project: Project): number {
  return Math.max(6, ...project.modules.map((assemblyModule) => assemblyModule.position[1] + assemblyModule.dimensions[1] + 2));
}
function craneCanReach(crane: Crane, assemblyModule: AssemblyModule, project: Project): boolean {
  return radius(crane.position, assemblyModule.position) <= crane.radius && radius(crane.position, getPickupPosition(project)) <= crane.radius && assemblyModule.weight <= crane.capacity && cruiseHeight(project) + assemblyModule.dimensions[1] + 2 <= crane.height;
}

/**
 * Deterministic resource-constrained serial generation. Dependencies are released
 * at structural fixation; the same crew remains assigned through final inspection.
 * Truck assignment denotes successive trips, not two full-size modules on one load.
 * All times are elapsed WORKING minutes; a shift is 08:00–16:00, no night shift.
 */
export function buildSchedule(project: Project): Schedule {
  const modules = new Map(project.modules.map((assemblyModule) => [assemblyModule.id, assemblyModule]));
  const trucks = new Map(project.trucks.map((truck) => [truck.id, truck]));
  const crews = new Set(project.crews.map((crew) => crew.id));
  const craneReady = new Map(project.cranes.map((crane) => [crane.id, 0]));
  const crewReady = new Map(project.crews.map((crew) => [crew.id, 0]));
  const truckReady = new Map(project.trucks.map((truck) => [truck.id, truck.arrival]));
  const scheduled = new Map<string, ScheduledModule>();
  const items: ScheduledModule[] = [];
  let unloadingReady = 0;

  for (const id of project.sequence) {
    const assemblyModule = modules.get(id);
    if (!assemblyModule || scheduled.has(id) || !crews.has(assemblyModule.crewId) || !trucks.has(assemblyModule.truckId) || !project.cranes.length) continue;
    if (assemblyModule.dependencies.some((dependency) => !scheduled.has(dependency))) continue;
    const dependencyReady = Math.max(0, ...assemblyModule.dependencies.map((dependency) => scheduled.get(dependency)!.release));
    const candidates = project.cranes.filter((crane) => craneCanReach(crane, assemblyModule, project));
    // Preserve a reviewable schedule when geometry is infeasible; analyzePlan flags it.
    const crane = (candidates.length ? candidates : project.cranes).reduce((best, next) => (craneReady.get(next.id) ?? 0) < (craneReady.get(best.id) ?? 0) ? next : best);
    let start = Math.max(dependencyReady, craneReady.get(crane.id) ?? 0, crewReady.get(assemblyModule.crewId) ?? 0, truckReady.get(assemblyModule.truckId) ?? 0, unloadingReady);
    const occupied = PREPARATION_MINUTES + assemblyModule.liftMinutes + POSITIONING_MINUTES + assemblyModule.fixMinutes;
    // Never strand a suspended assemblyModule at the end of a shift.
    if (occupied <= SHIFT_MINUTES && start % SHIFT_MINUTES + occupied > SHIFT_MINUTES) start = Math.ceil(start / SHIFT_MINUTES) * SHIFT_MINUTES;
    const liftStart = start + PREPARATION_MINUTES;
    const positionStart = liftStart + assemblyModule.liftMinutes;
    const fixStart = positionStart + POSITIONING_MINUTES;
    const release = fixStart + assemblyModule.fixMinutes;
    const item: ScheduledModule = { moduleId: id, craneId: crane.id, arrival: start, start, liftStart, positionStart, fixStart, release, end: release + POST_RELEASE };
    items.push(item);
    scheduled.set(id, item);
    craneReady.set(crane.id, release);
    crewReady.set(assemblyModule.crewId, item.end);
    truckReady.set(assemblyModule.truckId, positionStart + TRUCK_RETURN_MINUTES);
    // Only one truck can occupy the unloading apron, including three minutes to clear it.
    unloadingReady = positionStart + 3;
  }
  return { items, duration: Math.max(0, ...items.map((item) => item.end)), craneMinutes: items.reduce((total, item) => total + item.release - item.start, 0) };
}

export function getModuleState(item: ScheduledModule | undefined, time: number): ModuleState {
  if (!item) return "NOT READY";
  if (time < item.arrival - 35) return "NOT READY";
  if (time < item.arrival - 20) return "READY";
  if (time < item.arrival) return "IN TRANSIT";
  if (time < item.liftStart) return "ON SITE";
  if (time < item.positionStart) return "LIFTING";
  if (time < item.fixStart) return "POSITIONING";
  if (time < item.release) return "FIXING";
  if (time < item.release + CONNECTION_MINUTES) return "INSTALLED";
  if (time < item.release + CONNECTION_MINUTES + SERVICES_MINUTES) return "CONNECTED";
  if (time < item.end) return "INSPECTED";
  return "COMPLETED";
}

function mix(a: Vec3, b: Vec3, fraction: number): Vec3 {
  const t = Math.max(0, Math.min(1, fraction));
  const eased = t * t * (3 - 2 * t);
  return [a[0] + (b[0] - a[0]) * eased, a[1] + (b[1] - a[1]) * eased, a[2] + (b[2] - a[2]) * eased];
}

/** Pure time sampling supports scrubbing and reverse playback without simulation drift. */
export function getModulePosition(assemblyModule: AssemblyModule, item: ScheduledModule | undefined, time: number, project: Project): Vec3 {
  const state = getModuleState(item, time);
  if (!item || state === "NOT READY" || state === "READY") return [...assemblyModule.position];
  const pickup = getPickupPosition(project);
  if (state === "IN TRANSIT") return mix([pickup[0], pickup[1], pickup[2] + 22], pickup, (time - item.arrival + 20) / 20);
  if (state === "ON SITE") return pickup;
  const raisedPickup: Vec3 = [pickup[0], cruiseHeight(project), pickup[2]];
  const raisedTarget: Vec3 = [assemblyModule.position[0], raisedPickup[1], assemblyModule.position[2]];
  if (state === "LIFTING") {
    const t = (time - item.liftStart) / (item.positionStart - item.liftStart);
    return t < 0.4 ? mix(pickup, raisedPickup, t / 0.4) : mix(raisedPickup, raisedTarget, (t - 0.4) / 0.6);
  }
  if (state === "POSITIONING") return mix(raisedTarget, assemblyModule.position, (time - item.positionStart) / (item.fixStart - item.positionStart));
  return [...assemblyModule.position];
}

/** Move one item before another; the result is atomic and always remains a permutation. */
export function moveInSequence(project: Project, moduleId: string, beforeId: string): { project: Project; error?: string } {
  const moduleIds = new Set(project.modules.map((assemblyModule) => assemblyModule.id));
  if (project.sequence.length !== moduleIds.size || new Set(project.sequence).size !== moduleIds.size || project.sequence.some((id) => !moduleIds.has(id))) return { project, error: "La secuencia debe contener cada módulo exactamente una vez." };
  if (!moduleIds.has(moduleId) || (beforeId !== "" && !moduleIds.has(beforeId))) return { project, error: "El módulo de origen o destino no existe." };
  if (moduleId === beforeId) return { project };
  const sequence = project.sequence.filter((id) => id !== moduleId);
  sequence.splice(beforeId === "" ? sequence.length : sequence.indexOf(beforeId), 0, moduleId);
  const order = new Map(sequence.map((id, index) => [id, index]));
  const blocked = project.modules.find((assemblyModule) => assemblyModule.dependencies.some((dependency) => !order.has(dependency) || order.get(dependency)! >= order.get(assemblyModule.id)!));
  if (blocked) return { project, error: `${blocked.id} requiere fijar primero ${blocked.dependencies.join(", ")}.` };
  return { project: { ...project, sequence } };
}

/** Greedy topological ordering: lower storeys, available resources, then short travel. */
export function autoPlan(project: Project): Project {
  const pending = new Map(project.modules.map((assemblyModule) => [assemblyModule.id, assemblyModule]));
  const allModules = new Map(pending);
  const sequence: string[] = [];
  const placed = new Set<string>();
  let previous = getPickupPosition(project);
  let partial: Schedule = { items: [], duration: 0, craneMinutes: 0 };
  while (pending.size) {
    const available = [...pending.values()].filter((assemblyModule) => assemblyModule.dependencies.every((dependency) => placed.has(dependency)));
    if (!available.length) return project; // A cycle/missing reference is explained by analyzePlan.
    const craneReady = new Map(project.cranes.map((crane) => [crane.id, 0]));
    const truckReady = new Map(project.trucks.map((truck) => [truck.id, truck.arrival]));
    const crewReady = new Map(project.crews.map((crew) => [crew.id, 0]));
    const released = new Map<string, number>();
    let unloadingReady = 0;
    for (const item of partial.items) {
      const assigned = allModules.get(item.moduleId)!;
      craneReady.set(item.craneId, Math.max(craneReady.get(item.craneId) ?? 0, item.release));
      truckReady.set(assigned.truckId, Math.max(truckReady.get(assigned.truckId) ?? 0, item.positionStart + TRUCK_RETURN_MINUTES));
      crewReady.set(assigned.crewId, Math.max(crewReady.get(assigned.crewId) ?? 0, item.end));
      released.set(item.moduleId, item.release);
      unloadingReady = Math.max(unloadingReady, item.positionStart + 3);
    }
    const scores = new Map(available.map((candidate) => {
      const reachable = project.cranes.filter((crane) => craneCanReach(crane, candidate, project));
      const cranes = reachable.length ? reachable : project.cranes;
      const craneAvailability = cranes.length ? Math.min(...cranes.map((crane) => craneReady.get(crane.id) ?? 0)) : 0;
      let start = Math.max(craneAvailability, unloadingReady, truckReady.get(candidate.truckId) ?? 0, crewReady.get(candidate.crewId) ?? 0, ...candidate.dependencies.map((id) => released.get(id) ?? 0));
      const occupied = PREPARATION_MINUTES + candidate.liftMinutes + POSITIONING_MINUTES + candidate.fixMinutes;
      if (occupied <= SHIFT_MINUTES && start % SHIFT_MINUTES + occupied > SHIFT_MINUTES) start = Math.ceil(start / SHIFT_MINUTES) * SHIFT_MINUTES;
      // One metre of travel weighs 0.25 scheduling minutes. Avoid long transport
      // waits before making small distance savings; this is a heuristic, not a solver.
      return [candidate.id, start + occupied + radius(previous, candidate.position) * 0.25] as const;
    }));
    available.sort((a, b) => a.level - b.level || scores.get(a.id)! - scores.get(b.id)! || a.id.localeCompare(b.id));
    const selected = available[0];
    sequence.push(selected.id);
    placed.add(selected.id);
    pending.delete(selected.id);
    previous = selected.position;
    partial = buildSchedule({ ...project, sequence });
  }
  const proposed = { ...project, sequence };
  const existingSchedule = buildSchedule(project);
  // Keep an already valid plan when the greedy proposal would take longer.
  // Full coverage also excludes duplicate, incomplete or dependency-inverted sequences.
  if (existingSchedule.items.length === project.modules.length && existingSchedule.duration < partial.duration) return project;
  return proposed;
}

function normalizedType(zone: SiteZone): string { return zone.type.trim().toUpperCase().replaceAll("_", " "); }
function inZone(point: Vec3, zone: SiteZone, margin = 0): boolean {
  return Math.abs(point[0] - zone.position[0]) <= zone.size[0] / 2 + margin && Math.abs(point[2] - zone.position[2]) <= zone.size[1] / 2 + margin;
}
function inModuleFootprint(point: Vec3, assemblyModule: AssemblyModule, margin = 0): boolean {
  const rotation = assemblyModule.rotation * Math.PI / 180;
  const dx = point[0] - assemblyModule.position[0]; const dz = point[2] - assemblyModule.position[2];
  const localX = Math.cos(rotation) * dx - Math.sin(rotation) * dz;
  const localZ = Math.sin(rotation) * dx + Math.cos(rotation) * dz;
  return Math.abs(localX) <= assemblyModule.dimensions[0] / 2 + margin && Math.abs(localZ) <= assemblyModule.dimensions[2] / 2 + margin;
}
function crossesZone(from: Vec3, to: Vec3, zone: SiteZone, margin: number): boolean {
  // Slab test against an expanded X/Z rectangle; continuous, not coarse sampled.
  let enter = 0;
  let exit = 1;
  for (const axis of [0, 2] as const) {
    const half = zone.size[axis === 0 ? 0 : 1] / 2 + margin;
    const delta = to[axis] - from[axis];
    const minimum = zone.position[axis] - half;
    const maximum = zone.position[axis] + half;
    if (Math.abs(delta) < 1e-9) { if (from[axis] < minimum || from[axis] > maximum) return false; continue; }
    const a = (minimum - from[axis]) / delta;
    const b = (maximum - from[axis]) / delta;
    enter = Math.max(enter, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
    if (enter > exit) return false;
  }
  return true;
}

function hasCycle(project: Project): boolean {
  const modules = new Map(project.modules.map((assemblyModule) => [assemblyModule.id, assemblyModule]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id) || !modules.has(id)) return false;
    visiting.add(id);
    if (modules.get(id)!.dependencies.some(visit)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return project.modules.some((assemblyModule) => visit(assemblyModule.id));
}

export function analyzePlan(project: Project, schedule: Schedule = buildSchedule(project)): Conflict[] {
  const conflicts: Conflict[] = [];
  const add = (id: string, message: string, moduleId?: string, severity: "warning" | "error" = "error") => conflicts.push({ id, message, moduleId, severity });
  const modules = new Map(project.modules.map((assemblyModule) => [assemblyModule.id, assemblyModule]));
  const scheduled = new Map(schedule.items.map((item) => [item.moduleId, item]));
  const order = new Map(project.sequence.map((id, index) => [id, index]));
  const pickup = getPickupPosition(project);
  if (hasCycle(project)) add("dependency-cycle", "Existe un ciclo de dependencias. Corregirlo antes de programar.");
  if (project.sequence.length !== modules.size || new Set(project.sequence).size !== modules.size || project.sequence.some((id) => !modules.has(id))) add("sequence-permutation", "La secuencia debe incluir cada módulo exactamente una vez.");
  if (!project.cranes.length) add("missing-crane", "El proyecto no tiene una grúa asignada.");
  for (const assemblyModule of project.modules) {
    const item = scheduled.get(assemblyModule.id);
    for (const dependency of assemblyModule.dependencies) {
      if (!modules.has(dependency)) add(`dependency-missing-${assemblyModule.id}-${dependency}`, `${assemblyModule.id}: la dependencia ${dependency} no existe.`, assemblyModule.id);
      else if ((order.get(dependency) ?? Infinity) >= (order.get(assemblyModule.id) ?? -1)) add(`dependency-order-${assemblyModule.id}-${dependency}`, `${assemblyModule.id} debe montarse después de ${dependency}.`, assemblyModule.id);
      else if (item && scheduled.has(dependency) && scheduled.get(dependency)!.release > item.start) add(`dependency-time-${assemblyModule.id}-${dependency}`, `${assemblyModule.id} comienza antes de fijar ${dependency}.`, assemblyModule.id);
    }
    if (!project.trucks.some((truck) => truck.id === assemblyModule.truckId && truck.moduleIds.includes(assemblyModule.id))) add(`truck-${assemblyModule.id}`, `${assemblyModule.id}: asignación de camión inconsistente.`, assemblyModule.id);
    if (!project.crews.some((crew) => crew.id === assemblyModule.crewId)) add(`crew-${assemblyModule.id}`, `${assemblyModule.id}: falta una cuadrilla válida.`, assemblyModule.id);
    if (!item) add(`unscheduled-${assemblyModule.id}`, `${assemblyModule.id} no pudo programarse; revisar recursos y predecesores.`, assemblyModule.id);
    if (assemblyModule.level > 0 && !assemblyModule.dependencies.some((id) => { const support = modules.get(id); return support && support.level < assemblyModule.level && inModuleFootprint(assemblyModule.position, support) && Math.abs(support.position[1] + support.dimensions[1] - assemblyModule.position[1]) < 0.15; })) add(`support-${assemblyModule.id}`, `${assemblyModule.id}: no se identificó un módulo inferior de apoyo a la cota correcta entre sus dependencias.`, assemblyModule.id, "warning");
    const crane = project.cranes.find((entry) => entry.id === item?.craneId) ?? project.cranes[0];
    if (crane) {
      const destinationRadius = radius(crane.position, assemblyModule.position);
      const pickupRadius = radius(crane.position, pickup);
      if (destinationRadius > crane.radius) add(`radius-${assemblyModule.id}`, `${assemblyModule.id}: destino a ${destinationRadius.toFixed(1)} m, fuera del radio de ${crane.radius} m.`, assemblyModule.id);
      if (pickupRadius > crane.radius) add(`pickup-radius-${assemblyModule.id}`, `${assemblyModule.id}: descarga a ${pickupRadius.toFixed(1)} m, fuera del radio de ${crane.radius} m.`, assemblyModule.id);
      if (assemblyModule.weight > crane.capacity) add(`capacity-${assemblyModule.id}`, `${assemblyModule.id}: ${assemblyModule.weight.toFixed(1)} t supera la capacidad configurada de ${crane.capacity.toFixed(1)} t.`, assemblyModule.id);
      if (cruiseHeight(project) + assemblyModule.dimensions[1] + 2 > crane.height) add(`height-${assemblyModule.id}`, `${assemblyModule.id}: altura insuficiente para la trayectoria y 2 m de aparejos.`, assemblyModule.id);
      if (Math.max(destinationRadius, pickupRadius) > crane.radius * 0.9 && Math.max(destinationRadius, pickupRadius) <= crane.radius) add(`radius-margin-${assemblyModule.id}`, `${assemblyModule.id}: izaje dentro del último 10 % del radio configurado.`, assemblyModule.id, "warning");
    }
    if (item && item.release - item.start > SHIFT_MINUTES) add(`long-operation-${assemblyModule.id}`, `${assemblyModule.id}: el izaje y fijación superan una jornada de 8 horas.`, assemblyModule.id);
    for (const zone of project.zones) {
      const type = normalizedType(zone);
      if (["NO CRANE", "PEDESTRIAN", "EXCAVATION", "OVERHEAD LINE", "SECURITY ZONE", "RESTRICTED"].includes(type) && crossesZone(pickup, assemblyModule.position, zone, Math.hypot(assemblyModule.dimensions[0], assemblyModule.dimensions[2]) / 2)) add(`path-${assemblyModule.id}-${zone.id}`, `${assemblyModule.id}: la envolvente de izaje cruza «${zone.name}».`, assemblyModule.id, type === "PEDESTRIAN" ? "warning" : "error");
    }
  }
  for (const crane of project.cranes) for (const zone of project.zones) {
    if (["NO CRANE", "EXCAVATION", "UNDERGROUND SERVICE", "OVERHEAD LINE", "SECURITY ZONE"].includes(normalizedType(zone)) && inZone(crane.position, zone, 3)) add(`crane-zone-${crane.id}-${zone.id}`, `${crane.name}: apoyos o giro inicial próximos a «${zone.name}» (margen preliminar 3 m).`);
  }
  for (const crane of project.cranes) for (const assemblyModule of project.modules) {
    if (assemblyModule.level === 0 && inModuleFootprint(crane.position, assemblyModule, 3)) add(`crane-building-${crane.id}-${assemblyModule.id}`, `${crane.name}: los apoyos invaden la implantación prevista de ${assemblyModule.id}.`, assemblyModule.id);
  }
  for (const storage of project.zones.filter((zone) => normalizedType(zone) === "STORAGE")) for (const restriction of project.zones.filter((zone) => normalizedType(zone) === "NO STORAGE")) {
    if (Math.abs(storage.position[0] - restriction.position[0]) < (storage.size[0] + restriction.size[0]) / 2 && Math.abs(storage.position[2] - restriction.position[2]) < (storage.size[1] + restriction.size[1]) / 2) add(`storage-zone-${storage.id}-${restriction.id}`, `El acopio «${storage.name}» invade «${restriction.name}».`);
  }
  const overlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd;
  for (let i = 0; i < schedule.items.length; i++) for (let j = i + 1; j < schedule.items.length; j++) {
    const a = schedule.items[i]; const b = schedule.items[j];
    const am = modules.get(a.moduleId); const bm = modules.get(b.moduleId);
    if (!am || !bm) continue;
    if (a.craneId === b.craneId && overlap(a.start, a.release, b.start, b.release)) add(`crane-overlap-${a.moduleId}-${b.moduleId}`, `${a.moduleId} y ${b.moduleId} requieren la misma grúa simultáneamente.`, b.moduleId);
    if (am.crewId === bm.crewId && overlap(a.start, a.end, b.start, b.end)) add(`crew-overlap-${a.moduleId}-${b.moduleId}`, `${a.moduleId} y ${b.moduleId} superponen la cuadrilla ${am.crewId}.`, b.moduleId);
    if (am.truckId === bm.truckId && overlap(a.arrival, a.positionStart + TRUCK_RETURN_MINUTES, b.arrival, b.positionStart + TRUCK_RETURN_MINUTES)) add(`truck-overlap-${a.moduleId}-${b.moduleId}`, `${a.moduleId} y ${b.moduleId} no dejan tiempo al siguiente viaje de ${am.truckId}.`, b.moduleId);
  }
  return conflicts;
}

export function formatTime(minutes: number): string {
  const value = Math.max(0, Math.floor(Number.isFinite(minutes) ? minutes : 0));
  const day = Math.floor(value / SHIFT_MINUTES) + 1;
  const clock = 8 * 60 + value % SHIFT_MINUTES;
  return `${day > 1 ? `D${day} · ` : ""}${String(Math.floor(clock / 60)).padStart(2, "0")}:${String(clock % 60).padStart(2, "0")}`;
}

export function getStats(project: Project, schedule: Schedule, time: number) {
  const installed = schedule.items.filter((item) => time >= item.release).length;
  const completed = schedule.items.filter((item) => time >= item.end).length;
  return { modules: project.modules.length, installed, completed, pending: project.modules.length - installed, progress: project.modules.length ? Math.round(installed / project.modules.length * 100) : 0, trucks: project.trucks.length, lifts: schedule.items.length, craneHours: schedule.craneMinutes / 60, duration: schedule.duration, days: schedule.duration / SHIFT_MINUTES, crews: project.crews.length, utilization: schedule.duration && project.cranes.length ? schedule.craneMinutes / (schedule.duration * project.cranes.length) * 100 : 0 };
}
