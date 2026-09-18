import { MW900, MATERIALS } from "./definition.ts";
import { validateProject } from "./validation.ts";
import type { Project } from "./types.ts";

export const STORAGE_KEY = "modellwerk.visor2.project.v1";
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const vector = (v: unknown, n: number) => Array.isArray(v) && v.length === n && v.every(finite);
export function parseProject(text: string): Project {
  if (text.length > 5_000_000) throw new Error("El archivo supera el límite de 5 MB.");
  const p: unknown = JSON.parse(text);
  const fail = () => {
    throw new Error("Archivo de proyecto inválido o incompatible con MW900.");
  };
  if (
    !record(p) ||
    p.schemaVersion !== 1 ||
    p.definitionVersion !== MW900.version ||
    typeof p.name !== "string" ||
    p.name.length > 120 ||
    !["auto", "linear", "compact"].includes(String(p.layout)) ||
    !finite(p.rotation) ||
    !Number.isInteger(p.levels) ||
    Number(p.levels) < 1 ||
    Number(p.levels) > 3 ||
    !Array.isArray(p.modules) ||
    p.modules.length < 1 ||
    p.modules.length > 10 ||
    !record(p.rates)
  )
    return fail();
  for (const rate of Object.values(p.rates))
    if (rate !== null && (!finite(rate) || rate < 0 || rate > 1e9)) return fail();
  for (const m of p.modules) {
    if (
      !record(m) ||
      typeof m.id !== "string" ||
      m.definitionId !== MW900.id ||
      !Number.isInteger(m.index) ||
      !Number.isInteger(m.level) ||
      Number(m.level) < 0 ||
      Number(m.level) > 2 ||
      !vector(m.position, 3) ||
      !Array.isArray(m.walls) ||
      m.walls.length > 100 ||
      !Array.isArray(m.openings) ||
      m.openings.length > 100 ||
      !["floor-oak", "floor-concrete"].includes(String(m.floorMaterial))
    )
      return fail();
    delete m.spaces;
    const removed = m.removedExternalFaces ?? [];
    if (
      !Array.isArray(removed) ||
      new Set(removed).size !== removed.length ||
      removed.some((face) => !["north", "south", "east", "west"].includes(String(face)))
    )
      return fail();
    m.removedExternalFaces = removed;
    if (Math.abs((m.position as number[])[1] - Number(m.level) * MW900.dimensions.height) > 0.0001)
      return fail();
    for (const w of m.walls)
      if (
        !record(w) ||
        typeof w.id !== "string" ||
        !["external", "internal"].includes(String(w.kind)) ||
        !vector(w.start, 2) ||
        !vector(w.end, 2) ||
        !finite(w.height) ||
        !finite(w.thickness) ||
        !Object.hasOwn(MATERIALS, String(w.material))
      )
        return fail();
    for (const base of MW900.walls) {
      const w = m.walls.find((w: Record<string, unknown>) => w.id === base.id);
      if (
        !w ||
        w.kind !== "external" ||
        w.face !== base.face ||
        JSON.stringify(w.start) !== JSON.stringify(base.start) ||
        JSON.stringify(w.end) !== JSON.stringify(base.end) ||
        w.height !== base.height ||
        w.thickness !== base.thickness
      )
        return fail();
    }
    for (const o of m.openings)
      if (
        !record(o) ||
        typeof o.id !== "string" ||
        typeof o.wallId !== "string" ||
        !["door", "window"].includes(String(o.kind)) ||
        !["left", "right"].includes(String(o.hinge)) ||
        ![1, -1].includes(Number(o.direction)) ||
        !["fixed", "sliding", "single"].includes(String(o.type)) ||
        ![o.position, o.width, o.height, o.sillHeight].every(finite)
      )
        return fail();
  }
  const project = p as unknown as Project;
  const issues = validateProject(project);
  if (issues.length) throw new Error(issues[0].message);
  return project;
}
export function serializeProject(project: Project) {
  return JSON.stringify(project, null, 2);
}
