import type { Project } from "./types.ts";

type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 200;
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const stringList = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 256 && value.every(isText);
const vector = (value: unknown, length: number): value is number[] => Array.isArray(value) && value.length === length && value.every((item) => isNumber(item) && Math.abs(item) <= 100000);

/** Validate untrusted JSON before it enters a store or the geometry/scheduling engine. */
export function validateProject(value: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const fail = (message: string) => { if (errors.length < 60) errors.push(message); };
  if (!isRecord(value)) return { valid: false, errors: ["El archivo debe contener un objeto de proyecto JSON."] };
  for (const field of ["id", "name", "system"] as const) if (!isText(value[field])) fail(`Proyecto: «${field}» debe ser un texto no vacío de hasta 200 caracteres.`);
  const limits = { modules: [1, 256], cranes: [1, 16], trucks: [1, 256], crews: [1, 128], zones: [0, 128] } as const;
  for (const [field, [minimum, maximum]] of Object.entries(limits)) {
    const list = value[field];
    if (!Array.isArray(list) || list.length < minimum || list.length > maximum) fail(`«${field}» debe contener entre ${minimum} y ${maximum} elementos.`);
    else {
      const ids = new Set<string>();
      for (const [index, entry] of list.entries()) {
        if (!isRecord(entry)) { fail(`${field}[${index}]: se esperaba un objeto.`); continue; }
        if (!isText(entry.id)) fail(`${field}[${index}]: ID no válido.`);
        else if (ids.has(entry.id)) fail(`${field}: ID duplicado «${entry.id}».`);
        else ids.add(entry.id);
        if (!isText(entry.name)) fail(`${field}[${index}]: falta un nombre válido.`);
      }
    }
  }
  if (errors.length) return { valid: false, errors };

  const modules = value.modules as RecordValue[];
  const cranes = value.cranes as RecordValue[];
  const trucks = value.trucks as RecordValue[];
  const crews = value.crews as RecordValue[];
  const zones = value.zones as RecordValue[];
  const moduleIds = new Set(modules.map((assemblyModule) => assemblyModule.id as string));
  const truckIds = new Set(trucks.map((truck) => truck.id as string));
  const crewIds = new Set(crews.map((crew) => crew.id as string));
  for (const assemblyModule of modules) {
    const id = assemblyModule.id as string;
    for (const field of ["type", "truckId", "crewId"] as const) if (!isText(assemblyModule[field])) fail(`${id}: falta «${field}».`);
    if (!vector(assemblyModule.position, 3)) fail(`${id}: posición debe ser [x, y, z] con números finitos.`);
    if (!vector(assemblyModule.centerOfGravity, 3)) fail(`${id}: centro de gravedad debe ser [x, y, z] con números finitos.`);
    if (!vector(assemblyModule.dimensions, 3) || assemblyModule.dimensions.some((number) => number <= 0 || number > 100)) fail(`${id}: dimensiones deben ser tres números positivos de hasta 100 m.`);
    if (!isNumber(assemblyModule.rotation) || Math.abs(assemblyModule.rotation) > 36000) fail(`${id}: orientación no válida.`);
    if (!isNumber(assemblyModule.level) || !Number.isInteger(assemblyModule.level) || assemblyModule.level < 0 || assemblyModule.level > 100) fail(`${id}: nivel debe ser un entero entre 0 y 100.`);
    for (const field of ["weight", "liftMinutes", "fixMinutes"] as const) if (!isNumber(assemblyModule[field]) || assemblyModule[field] <= 0 || assemblyModule[field] > 10000) fail(`${id}: «${field}» debe ser positivo y finito (máximo 10000).`);
    if (typeof assemblyModule.notes !== "string" || assemblyModule.notes.length > 10000) fail(`${id}: observaciones deben ser texto de hasta 10000 caracteres.`);
    if (!stringList(assemblyModule.connections)) fail(`${id}: conexiones deben ser una lista de textos.`);
    if (!stringList(assemblyModule.dependencies)) fail(`${id}: dependencias deben ser una lista de IDs.`);
    else {
      if (new Set(assemblyModule.dependencies).size !== assemblyModule.dependencies.length) fail(`${id}: dependencias duplicadas.`);
      for (const dependency of assemblyModule.dependencies) {
        if (!moduleIds.has(dependency)) fail(`${id}: la dependencia «${dependency}» no existe.`);
        if (dependency === id) fail(`${id}: un módulo no puede depender de sí mismo.`);
      }
    }
    if (!truckIds.has(assemblyModule.truckId as string)) fail(`${id}: el camión «${String(assemblyModule.truckId)}» no existe.`);
    if (!crewIds.has(assemblyModule.crewId as string)) fail(`${id}: la cuadrilla «${String(assemblyModule.crewId)}» no existe.`);
  }
  for (const crane of cranes) {
    if (!vector(crane.position, 3)) fail(`${crane.id}: posición de grúa no válida.`);
    for (const field of ["radius", "capacity", "height"] as const) if (!isNumber(crane[field]) || crane[field] <= 0 || crane[field] > 10000) fail(`${crane.id}: «${field}» debe ser positivo y finito.`);
  }
  for (const truck of trucks) {
    if (!isNumber(truck.arrival) || truck.arrival < 0 || truck.arrival > 1000000) fail(`${truck.id}: llegada debe ser minutos positivos o cero (máximo 1000000).`);
    if (!stringList(truck.moduleIds)) fail(`${truck.id}: moduleIds debe ser una lista de IDs.`);
    else {
      if (new Set(truck.moduleIds).size !== truck.moduleIds.length) fail(`${truck.id}: un módulo está repetido en sus entregas.`);
      for (const id of truck.moduleIds) {
        if (!moduleIds.has(id)) fail(`${truck.id}: el módulo «${id}» no existe.`);
        else if (modules.find((assemblyModule) => assemblyModule.id === id)?.truckId !== truck.id) fail(`${truck.id}: «${id}» está asignado a otro camión.`);
      }
    }
  }
  for (const assemblyModule of modules) {
    const truck = trucks.find((entry) => entry.id === assemblyModule.truckId);
    if (truck && Array.isArray(truck.moduleIds) && !truck.moduleIds.includes(assemblyModule.id)) fail(`${assemblyModule.id}: falta en las entregas de ${String(assemblyModule.truckId)}.`);
  }
  for (const crew of crews) if (!isText(crew.type)) fail(`${crew.id}: falta tipo de cuadrilla.`);
  for (const zone of zones) {
    if (!isText(zone.type)) fail(`${zone.id}: falta tipo de zona.`);
    if (!vector(zone.position, 3)) fail(`${zone.id}: posición de zona no válida.`);
    if (!vector(zone.size, 2) || zone.size.some((number) => number <= 0 || number > 10000)) fail(`${zone.id}: tamaño debe ser [ancho, profundidad] positivo.`);
  }
  if (!stringList(value.sequence) || value.sequence.length !== modules.length || new Set(value.sequence).size !== modules.length || value.sequence.some((id) => !moduleIds.has(id))) fail("La secuencia debe contener todos los IDs de módulos, exactamente una vez.");
  if (errors.length) return { valid: false, errors };

  const project = value as unknown as Project;
  const graph = new Map(project.modules.map((assemblyModule) => [assemblyModule.id, assemblyModule.dependencies]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (done.has(id)) return false;
    visiting.add(id);
    if (graph.get(id)!.some(visit)) return true;
    visiting.delete(id);
    done.add(id);
    return false;
  };
  if (project.modules.some((assemblyModule) => visit(assemblyModule.id))) fail("Las dependencias contienen un ciclo. Corregirlo antes de importar.");
  return { valid: errors.length === 0, errors };
}
