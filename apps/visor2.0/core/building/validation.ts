import { MW900 } from "./definition.ts";
import { EPS, isLongitudinal, wallLength, wallPoint } from "./geometry.ts";
import { EXTERNAL_FACES, neighborGraph, occupied } from "./assembly.ts";
import type { Issue, ModuleInstance, Opening, Project, Wall } from "./types.ts";

export function validateWall(wall: Wall): Issue[] {
  const issues: Issue[] = [];
  const issue = (code: string, message: string) =>
    issues.push({ code, message, elementId: wall.id });
  const values = [...wall.start, ...wall.end, wall.height, wall.thickness];
  if (values.some((v) => !Number.isFinite(v))) {
    issue("number", "Todas las dimensiones deben ser números finitos.");
    return issues;
  }
  if (
    wallLength(wall) < 0.3 ||
    wall.thickness < 0.04 ||
    wall.thickness > 0.3 ||
    wall.height < 0.3 ||
    wall.height > MW900.coordinates.ceilingDatum - MW900.coordinates.floorDatum + EPS
  )
    issue("wall-size", "Revisá longitud, espesor y altura del muro.");
  if (Math.abs(wall.end[0] - wall.start[0]) > EPS && Math.abs(wall.end[1] - wall.start[1]) > EPS)
    issue("orthogonal", "Los muros deben seguir los ejes del módulo.");
  if (wall.kind === "internal") {
    const ext = MW900.walls;
    const x =
      Math.max(...ext.flatMap((w) => [Math.abs(w.start[0]), Math.abs(w.end[0])])) -
      MW900.proposedLayers.wallThickness / 2;
    const z =
      Math.max(...ext.flatMap((w) => [Math.abs(w.start[1]), Math.abs(w.end[1])])) -
      MW900.proposedLayers.wallThickness / 2;
    const along = isLongitudinal(wall);
    if (
      [wall.start, wall.end].some(
        (p) =>
          Math.abs(p[0]) + (along ? 0 : wall.thickness / 2) > x + EPS ||
          Math.abs(p[1]) + (along ? wall.thickness / 2 : 0) > z + EPS,
      )
    )
      issue("wall-boundary", "El muro debe quedar dentro del espacio interior.");
  }
  return issues;
}
export function validateOpening(opening: Opening, wall: Wall, others: Opening[]): Issue[] {
  const issues: Issue[] = [];
  const issue = (code: string, message: string) =>
    issues.push({ code, message, elementId: opening.id });
  if (
    [opening.position, opening.width, opening.height, opening.sillHeight].some(
      (v) => !Number.isFinite(v),
    )
  ) {
    issue("number", "Las dimensiones deben ser números finitos.");
    return issues;
  }
  if (
    opening.width < 0.2 ||
    opening.height < 0.2 ||
    opening.position < 0.05 - EPS ||
    opening.position + opening.width > wallLength(wall) - 0.05 + EPS ||
    opening.sillHeight < 0 ||
    opening.sillHeight + opening.height > wall.height - 0.05 + EPS
  )
    issue("opening-boundary", "La abertura excede el muro o sus márgenes de 50 mm.");
  if (opening.kind === "door" && opening.sillHeight !== 0)
    issue("door-sill", "La puerta debe comenzar en el piso terminado.");
  for (const o of others.filter((o) => o.id !== opening.id && o.wallId === wall.id)) {
    if (
      opening.position < o.position + o.width + 0.05 - EPS &&
      opening.position + opening.width > o.position - 0.05 + EPS &&
      opening.sillHeight < o.sillHeight + o.height + 0.05 - EPS &&
      opening.sillHeight + opening.height > o.sillHeight - 0.05 + EPS
    )
      issue("opening-overlap", "La abertura invade otra abertura o su separación mínima.");
  }
  // Project source structure onto host facade, including columns and end braces.
  if (wall.kind === "external") {
    const a = wallPoint(wall, opening.position),
      b = wallPoint(wall, opening.position + opening.width);
    const along = isLongitudinal(wall),
      axis = along ? 0 : 2,
      normal = along ? 2 : 0,
      host = along ? a[1] : a[0];
    const low = Math.min(along ? a[0] : a[1], along ? b[0] : b[1]),
      high = Math.max(along ? a[0] : a[1], along ? b[0] : b[1]);
    for (const o of MW900.obstacles) {
      if (Math.abs((o.min[normal] + o.max[normal]) / 2 - host) > 0.25) continue;
      if (
        low < o.max[axis] + 0.02 &&
        high > o.min[axis] - 0.02 &&
        opening.sillHeight + MW900.coordinates.floorDatum < o.max[1] - EPS &&
        opening.sillHeight + opening.height + MW900.coordinates.floorDatum > o.min[1] + EPS
      ) {
        issue(
          "structure-conflict",
          `Conflicto estructural: ${o.id}. Desplazá o reducí la abertura.`,
        );
        break;
      }
    }
  }
  return issues;
}
export function validateModule(module: ModuleInstance): Issue[] {
  const ids = new Set<string>();
  const issues: Issue[] = [];
  if (
    !Array.isArray(module.removedExternalFaces) ||
    new Set(module.removedExternalFaces).size !== module.removedExternalFaces.length ||
    module.removedExternalFaces.some((face) => !EXTERNAL_FACES.includes(face))
  )
    issues.push({ code: "removed-faces", message: "La lista de muros eliminados es inválida." });
  for (const wall of module.walls) {
    if (ids.has(wall.id))
      issues.push({ code: "duplicate", message: "Identificador de muro repetido." });
    ids.add(wall.id);
    issues.push(...validateWall(wall));
  }
  const internal = module.walls.filter((w) => w.kind === "internal");
  for (let i = 0; i < internal.length; i++)
    for (let j = i + 1; j < internal.length; j++) {
      const a = internal[i],
        b = internal[j],
        along = isLongitudinal(a);
      if (along !== isLongitudinal(b)) continue;
      const axis = along ? 0 : 1,
        normal = along ? 1 : 0;
      if (
        Math.abs(a.start[normal] - b.start[normal]) < (a.thickness + b.thickness) / 2 - EPS &&
        Math.min(Math.max(a.start[axis], a.end[axis]), Math.max(b.start[axis], b.end[axis])) >
          Math.max(Math.min(a.start[axis], a.end[axis]), Math.min(b.start[axis], b.end[axis])) + EPS
      )
        issues.push({
          code: "wall-overlap",
          message: "El divisor se solapa con otro muro interior.",
          elementId: b.id,
        });
    }
  for (const opening of module.openings) {
    if (ids.has(opening.id))
      issues.push({ code: "duplicate", message: "Identificador de abertura repetido." });
    ids.add(opening.id);
    const wall = module.walls.find((w) => w.id === opening.wallId);
    if (!wall)
      issues.push({
        code: "host",
        message: "La abertura necesita un muro anfitrión.",
        elementId: opening.id,
      });
    else issues.push(...validateOpening(opening, wall, module.openings));
  }
  return issues.map((i) => ({ ...i, moduleId: module.id }));
}
export function validateProject(project: Project): Issue[] {
  const graph = neighborGraph(project.modules);
  const issues = project.modules.flatMap(validateModule);
  const ids = new Set<string>();
  for (const m of project.modules) {
    if (ids.has(m.id))
      issues.push({ code: "duplicate-module", message: "Identificador de módulo repetido." });
    ids.add(m.id);
    if (m.position.some((v) => !Number.isFinite(v)) || m.position[1] < 0)
      issues.push({ code: "position", message: "Posición de módulo inválida.", moduleId: m.id });
    if (occupied(m.position, project.modules, m.id))
      issues.push({ code: "module-overlap", message: "Dos módulos se solapan.", moduleId: m.id });
    if (m.level > 0 && !graph[m.id].below)
      issues.push({
        code: "support",
        message: "El módulo superior necesita apoyo completo.",
        moduleId: m.id,
      });
  }
  return issues;
}
