import { MW900 } from "./definition.ts";
import { activeModule, placements, neighborGraph } from "./assembly.ts";
import { wallLength, wallPanels } from "./geometry.ts";
import { validateModule } from "./validation.ts";
import type { Layout, ModuleInstance, Opening, Project, Quantity, Wall } from "./types.ts";

export function createModule(p: ReturnType<typeof placements>[number]): ModuleInstance {
  return {
    ...p,
    definitionId: MW900.id,
    walls: structuredClone(MW900.walls),
    openings: [],
    removedExternalFaces: [],
    floorMaterial: "floor-oak",
  };
}
export function createProject(): Project {
  return {
    schemaVersion: 1,
    definitionVersion: MW900.version,
    name: "Nuevo edificio modular",
    layout: "auto",
    levels: 1,
    rotation: 0,
    modules: placements(4, 1, "auto").map(createModule),
    rates: {},
  };
}
export function recompose(
  project: Project,
  count: number,
  levels: number,
  layout: Layout,
): Project {
  const old = new Map(project.modules.map((m) => [m.id, m]));
  return {
    ...project,
    layout,
    levels: Math.min(count, levels),
    modules: placements(count, levels, layout).map((p) =>
      old.has(p.id) ? { ...old.get(p.id)!, ...p } : createModule(p),
    ),
  };
}
export function updateModule(
  project: Project,
  id: string,
  change: (module: ModuleInstance) => ModuleInstance,
): Project {
  return {
    ...project,
    modules: project.modules.map((m) => {
      if (m.id !== id) return m;
      const next = change(m);
      const issues = validateModule(next);
      if (issues.length) throw new Error(issues[0].message);
      return next;
    }),
  };
}
export function putWall(project: Project, moduleId: string, wall: Wall): Project {
  return updateModule(project, moduleId, (m) => ({
    ...m,
    walls: m.walls.some((w) => w.id === wall.id)
      ? m.walls.map((w) => (w.id === wall.id ? wall : w))
      : [...m.walls, wall],
  }));
}
export function putOpening(project: Project, moduleId: string, opening: Opening): Project {
  return updateModule(project, moduleId, (m) => ({
    ...m,
    openings: m.openings.some((o) => o.id === opening.id)
      ? m.openings.map((o) => (o.id === opening.id ? opening : o))
      : [...m.openings, opening],
  }));
}
export function removeElement(project: Project, moduleId: string, elementId: string): Project {
  return updateModule(project, moduleId, (m) => {
    const wall = m.walls.find((w) => w.id === elementId);
    return {
      ...m,
      removedExternalFaces:
        wall?.kind === "external" && wall.face
          ? [...new Set([...m.removedExternalFaces, wall.face])]
          : m.removedExternalFaces,
      walls: wall?.kind === "external" ? m.walls : m.walls.filter((w) => w.id !== elementId),
      openings: m.openings.filter((o) => o.id !== elementId && o.wallId !== elementId),
    };
  });
}
export function quantities(project: Project): Quantity[] {
  const graph = neighborGraph(project.modules),
    area = MW900.dimensions.length * MW900.dimensions.width;
  let exterior = 0,
    interior = 0,
    length = 0,
    roof = 0,
    windows = 0,
    doors = 0;
  for (const m of project.modules) {
    const active = activeModule(m, graph[m.id]);
    if (!graph[m.id].above) roof += area;
    for (const w of active.walls) {
      const net = wallPanels(w, active.openings).reduce((s, p) => s + p.width * p.height, 0);
      if (w.kind === "internal") {
        interior += net;
        length += wallLength(w);
      } else exterior += net;
    }
    windows += active.openings.filter((o) => o.kind === "window").length;
    doors += active.openings.filter((o) => o.kind === "door").length;
  }
  return [
    { id: "structure", label: "Estructura MW900", unit: "ud", amount: project.modules.length },
    {
      id: "floor",
      label: "Piso · superficie bruta",
      unit: "m²",
      amount: area * project.modules.length,
    },
    { id: "roof", label: "Cubierta expuesta · proyección", unit: "m²", amount: roof },
    {
      id: "ceiling",
      label: "Cielorraso · superficie bruta",
      unit: "m²",
      amount: area * project.modules.length,
    },
    { id: "external", label: "Cerramiento exterior neto", unit: "m²", amount: exterior },
    { id: "internal", label: "Muros divisorios netos", unit: "m²", amount: interior },
    { id: "wall-length", label: "Longitud de divisores", unit: "m", amount: length },
    { id: "windows", label: "Ventanas", unit: "ud", amount: windows },
    { id: "doors", label: "Puertas", unit: "ud", amount: doors },
  ];
}
export function estimate(project: Project) {
  const lines = quantities(project)
    .filter((q) => q.id !== "wall-length")
    .map((q) => ({ ...q, rate: project.rates[q.id] ?? null }));
  const complete = lines.every((l) => l.amount === 0 || l.rate !== null);
  return {
    lines,
    complete,
    total: complete ? lines.reduce((sum, l) => sum + l.amount * (l.rate ?? 0), 0) : null,
  };
}
