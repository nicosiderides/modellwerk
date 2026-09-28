import type { AssemblyModule, Project } from "./types.ts";

export function createDemoProject(): Project {
  const modules: AssemblyModule[] = Array.from({ length: 24 }, (_, index) => {
    const level = Math.floor(index / 12);
    const slot = index % 12;
    const row = Math.floor(slot / 2);
    const column = slot % 2;
    const id = `M${String(index + 1).padStart(2, "0")}`;
    const previous = `M${String(index).padStart(2, "0")}`;
    const support = `M${String(slot + 1).padStart(2, "0")}`;
    const wetModule = slot === 4 || slot === 5;
    return {
      id,
      name: `${wetModule ? "Servicios" : "Habitación"} ${String(index + 1).padStart(2, "0")}`,
      type: wetModule ? "MW900 Services" : "MW900 Bedroom",
      position: [column === 0 ? -4.65 : 4.65, level * 2.8, row * 3.1 - 7.75],
      rotation: 0,
      level,
      weight: wetModule ? 9.2 : Number((7.6 + (slot % 3) * 0.2).toFixed(1)),
      dimensions: [9, 2.8, 3],
      centerOfGravity: [wetModule ? 0.3 : 0, 1.4, 0],
      liftMinutes: wetModule ? 14 : 12,
      fixMinutes: level ? 16 : 14,
      connections: ["4 apoyos estructurales", "Unión lateral", "MEP", "Sellado"],
      dependencies: level === 1 ? [support, ...(column === 1 ? [previous] : [])] : column === 1 ? [previous] : [],
      truckId: `T${String(slot + 1).padStart(2, "0")}`,
      crewId: column === 0 ? "S01" : "S02",
      notes: level === 1 ? "Izar después de fijar el módulo de apoyo. Verificar unión vertical." : "Verificar replanteo, apoyos y nivelación antes de liberar la grúa.",
    };
  });
  return {
    id: "mw-campamento-24",
    name: "Campamento modular",
    system: "MW900",
    modules,
    cranes: [{ id: "C01", name: "Grúa 01 · telescópica", position: [15, 0, 10], radius: 32, capacity: 12, height: 22 }],
    trucks: Array.from({ length: 12 }, (_, index) => ({
      id: `T${String(index + 1).padStart(2, "0")}`,
      name: `Camión ${String(index + 1).padStart(2, "0")}`,
      moduleIds: [modules[index].id, modules[index + 12].id],
      arrival: index * 40,
    })),
    crews: [{ id: "S01", name: "Estructura 01", type: "STRUCTURE CREW" }, { id: "S02", name: "Estructura 02", type: "STRUCTURE CREW" }],
    zones: [
      { id: "Z-ACCESS", name: "Ingreso / egreso", type: "ACCESS", position: [0, 0, 30], size: [9, 16] },
      { id: "Z-UNLOAD", name: "Descarga", type: "UNLOADING", position: [0, 0, 16], size: [12, 7] },
      { id: "Z-WAIT", name: "Espera de camiones", type: "WAITING", position: [-15, 0, 21], size: [11, 9] },
      { id: "Z-STORAGE", name: "Acopio temporal", type: "STORAGE", position: [-16, 0, 5], size: [10, 10] },
      { id: "Z-RESTRICTED", name: "Área restringida", type: "NO CRANE", position: [24, 0, -11], size: [7, 10] },
    ],
    sequence: modules.map((module) => module.id),
  };
}
