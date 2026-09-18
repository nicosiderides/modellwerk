import { FACES, MW900 } from "./definition.ts";
import { EPS } from "./geometry.ts";
import type { Face, Layout, ModuleInstance, Neighbors, Vec3 } from "./types.ts";

export const EXTERNAL_FACES: Face[] = ["north", "south", "east", "west"];

export function activeModule(module: ModuleInstance, neighbors: Partial<Record<Face, string>>) {
  const walls = module.walls.filter(
    (wall) =>
      wall.kind === "internal" ||
      (!!wall.face &&
        !neighbors[wall.face] &&
        !(module.removedExternalFaces ?? []).includes(wall.face)),
  );
  const hosts = new Set(walls.map((wall) => wall.id));
  return {
    ...module,
    walls,
    openings: module.openings.filter((opening) => hosts.has(opening.wallId)),
  };
}

export function placements(count: number, levels: number, layout: Layout) {
  const n = Math.max(1, Math.min(10, Math.round(count)));
  const l = Math.min(n, Math.max(1, Math.min(3, Math.round(levels))));
  const baseCount = Math.ceil(n / l);
  const d = MW900.dimensions;
  // Linear joins long sides. Compact optimizes actual metre dimensions.
  const columns =
    layout === "linear" ? 1 : Math.max(1, Math.round(Math.sqrt((baseCount * d.width) / d.length)));
  const rows = Math.ceil(baseCount / columns);
  const result: { id: string; index: number; level: number; position: Vec3 }[] = [];
  let index = 0;
  for (let level = 0; level < l; level++) {
    const levelCount = Math.floor(n / l) + (level < n % l ? 1 : 0);
    for (let cell = 0; cell < levelCount; cell++) {
      result.push({
        id: `module-${index + 1}`,
        index,
        level,
        position: [
          ((cell % columns) - (columns - 1) / 2) * d.length,
          level * d.height,
          (Math.floor(cell / columns) - (rows - 1) / 2) * d.width,
        ],
      });
      index++;
    }
  }
  return result;
}
const opposite: Record<Face, Face> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
  above: "below",
  below: "above",
};
export function neighborGraph(modules: Pick<ModuleInstance, "id" | "position">[]): Neighbors {
  const key = (p: number[]) => p.map((v) => Math.round(v / EPS)).join("/");
  const byPosition = new Map(modules.map((m) => [key(m.position), m.id]));
  return Object.fromEntries(
    modules.map((m) => [
      m.id,
      Object.fromEntries(
        FACES.flatMap((face) => {
          const socket = MW900.sockets[face],
            other = MW900.sockets[opposite[face]];
          const target = m.position.map((v, i) => v + socket[i] - other[i]);
          const id = byPosition.get(key(target));
          return id ? [[face, id]] : [];
        }),
      ),
    ]),
  );
}
export function snapCandidate(anchor: ModuleInstance, face: Face): Vec3 {
  return anchor.position.map(
    (v, i) => v + MW900.sockets[face][i] - MW900.sockets[opposite[face]][i],
  ) as Vec3;
}
export function occupied(position: Vec3, modules: ModuleInstance[], excludeId?: string) {
  const d = MW900.dimensions,
    sizes = [d.length, d.height, d.width];
  return modules.some(
    (m) =>
      m.id !== excludeId && position.every((v, i) => Math.abs(v - m.position[i]) < sizes[i] - EPS),
  );
}
export function footprint(modules: ModuleInstance[]) {
  return (
    new Set(modules.map((m) => `${m.position[0]}/${m.position[2]}`)).size *
    MW900.dimensions.length *
    MW900.dimensions.width
  );
}
