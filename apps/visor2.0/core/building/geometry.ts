import type { Opening, Vec2, Wall } from "./types.ts";

export const EPS = 0.0001;
export const wallLength = (wall: Wall) =>
  Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
export const isLongitudinal = (wall: Wall) => Math.abs(wall.end[0] - wall.start[0]) > EPS;
export const gridPoint = (p: Vec2): Vec2 => p.map((v) => Math.round(v / 0.05) * 0.05) as Vec2;
export function wallPoint(wall: Wall, distance: number): Vec2 {
  const length = wallLength(wall);
  return [
    wall.start[0] + ((wall.end[0] - wall.start[0]) * distance) / length,
    wall.start[1] + ((wall.end[1] - wall.start[1]) * distance) / length,
  ];
}
export function wallDistance(wall: Wall, point: Vec2) {
  const length = wallLength(wall);
  return (
    ((point[0] - wall.start[0]) * (wall.end[0] - wall.start[0]) +
      (point[1] - wall.start[1]) * (wall.end[1] - wall.start[1])) /
    length
  );
}

// Exact rectangular decomposition, shared by rendering and net area takeoff.
// It supports openings above one another without merging their empty space.
export function wallPanels(wall: Wall, openings: Opening[], cutHeight = wall.height) {
  const h = Math.min(cutHeight, wall.height);
  const hosted = openings.filter((o) => o.wallId === wall.id);
  const xs = [
    ...new Set([0, wallLength(wall), ...hosted.flatMap((o) => [o.position, o.position + o.width])]),
  ].sort((a, b) => a - b);
  const panels: { x: number; y: number; width: number; height: number }[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const x = xs[i],
      end = xs[i + 1],
      mid = (x + end) / 2;
    const holes = hosted
      .filter((o) => mid > o.position && mid < o.position + o.width)
      .map((o) => [o.sillHeight, Math.min(h, o.sillHeight + o.height)])
      .filter((o) => o[0] < h)
      .sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    for (const [bottom, top] of holes) {
      if (bottom > cursor + EPS)
        panels.push({ x, y: cursor, width: end - x, height: bottom - cursor });
      cursor = Math.max(cursor, top);
    }
    if (cursor < h - EPS) panels.push({ x, y: cursor, width: end - x, height: h - cursor });
  }
  return panels.filter((p) => p.width > EPS && p.height > EPS);
}
