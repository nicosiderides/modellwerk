import { placements } from "../../core/building/assembly";
import { MW900 } from "../../core/building/definition";
export type ProjectLayoutMode = "auto" | "linear" | "compact";
export type ModuleDimensions = { length: number; width: number; height: number };
export type ProjectModulePlacement = {
  id: string;
  index: number;
  level: number;
  position: [number, number, number];
};
export type ProjectBounds = { width: number; depth: number; height: number };
/** Compatibility adapter: composition is owned by the building engine. */
export function composeProject(
  count: number,
  levels: number,
  mode: ProjectLayoutMode,
  dimensions: ModuleDimensions,
): ProjectModulePlacement[] {
  if (
    Object.keys(MW900.dimensions).some(
      (key) =>
        dimensions[key as keyof ModuleDimensions] !==
        MW900.dimensions[key as keyof ModuleDimensions],
    )
  )
    throw new Error("Visor 2.0 currently supports the measured MW900 definition only.");
  return placements(count, levels, mode);
}
export function getProjectBounds(
  items: ProjectModulePlacement[],
  dimensions: ModuleDimensions,
): ProjectBounds {
  if (!items.length) return { width: 0, depth: 0, height: 0 };
  const extent = (axis: number) =>
    Math.max(...items.map((p) => p.position[axis])) -
    Math.min(...items.map((p) => p.position[axis]));
  return {
    width: extent(0) + dimensions.length,
    depth: extent(2) + dimensions.width,
    height: extent(1) + dimensions.height,
  };
}
