import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MW900 } from "./definition.ts";
import { activeModule, footprint, neighborGraph, occupied, snapCandidate } from "./assembly.ts";
import {
  createProject,
  estimate,
  putOpening,
  putWall,
  quantities,
  recompose,
  removeElement,
} from "./engine.ts";
import { wallPanels } from "./geometry.ts";
import { validateOpening, validateProject } from "./validation.ts";
import { parseProject, serializeProject } from "./persistence.ts";
import type { Opening, Wall } from "./types.ts";

const divider: Wall = {
  id: "divisor-1",
  kind: "internal",
  start: [0, -1.3],
  end: [0, 1.3],
  thickness: 0.08,
  height: 2.378,
  material: "panel-light",
};
const door: Opening = {
  id: "door-1",
  wallId: divider.id,
  kind: "door",
  width: 0.9,
  height: 2.1,
  position: 0.2,
  sillHeight: 0,
  hinge: "left",
  direction: 1,
  type: "single",
};
const window: Opening = {
  id: "window-1",
  wallId: "north",
  kind: "window",
  width: 1.2,
  height: 1.2,
  position: 0.2,
  sillHeight: 0.9,
  hinge: "left",
  direction: 1,
  type: "fixed",
};

test("four MW900 meet on measured faces and form a reciprocal connected graph", () => {
  const p = createProject();
  assert.equal(footprint(p.modules), 108);
  const g = neighborGraph(p.modules);
  assert.equal(
    Object.values(g).reduce((n, v) => n + Object.keys(v).length, 0),
    6,
  );
  assert.deepEqual(snapCandidate(p.modules[0], "south"), p.modules[1].position);
  assert.equal(occupied(p.modules[0].position, p.modules), true);
  assert.equal(occupied(snapCandidate(p.modules.at(-1)!, "south"), p.modules), false);
  assert.equal(validateProject(p).length, 0);
  assert.equal(
    p.modules.reduce((sum, module) => sum + activeModule(module, g[module.id]).walls.length, 0),
    10,
  );
});
test("shared walls disappear automatically and manual facade deletion persists", () => {
  let p = createProject();
  const graph = neighborGraph(p.modules);
  assert.equal(
    activeModule(p.modules[0], graph[p.modules[0].id]).walls.some((w) => w.id === "south"),
    false,
  );
  p = putOpening(p, "module-1", window);
  p = removeElement(p, "module-1", "north");
  assert.equal(p.modules[0].walls.length, 4);
  assert.deepEqual(p.modules[0].removedExternalFaces, ["north"]);
  assert.equal(p.modules[0].openings.length, 0);
  const single = recompose(p, 1, 1, "auto");
  assert.equal(activeModule(single.modules[0], {}).walls.length, 3);
  assert.deepEqual(parseProject(serializeProject(single)), single);
});
test("uneven levels retain common grid and the product limit of 10 modules", () => {
  for (let count = 1; count <= 10; count++)
    for (const levels of [1, 2, 3])
      for (const layout of ["auto", "linear", "compact"] as const) {
        const p = recompose(createProject(), count, levels, layout);
        const g = neighborGraph(p.modules);
        assert.equal(p.modules.length, count);
        for (const m of p.modules)
          if (m.level > 0) assert.ok(g[m.id].below, `${count}/${levels}/${layout}/${m.id}`);
        assert.equal(new Set(p.modules.map((m) => m.position.join("/"))).size, count);
      }
  assert.equal(recompose(createProject(), 200, 1, "auto").modules.length, 10);
});
test("instance editing is independent, hosted, reversible through serialization, and persistent through recomposition", () => {
  let p = putWall(createProject(), "module-1", divider);
  p = putOpening(p, "module-1", door);
  p = putOpening(p, "module-1", window);
  assert.equal(p.modules[1].openings.length, 0);
  assert.equal(p.modules[1].walls.length, 4);
  const moved = {
    ...divider,
    start: [0.5, -1.3] as [number, number],
    end: [0.5, 1.3] as [number, number],
  };
  p = putWall(p, "module-1", moved);
  assert.equal(p.modules[0].openings[0].wallId, divider.id);
  const restored = parseProject(serializeProject(p));
  assert.deepEqual(restored, p);
  assert.deepEqual(recompose(p, 8, 2, "compact").modules[0].walls, p.modules[0].walls);
  assert.equal(removeElement(p, "module-1", divider.id).modules[0].openings.length, 1);
});
test("bounds, NaN, columns, duplicate openings and shrink-with-host conflicts are rejected atomically", () => {
  let p = putWall(createProject(), "module-1", divider);
  p = putOpening(p, "module-1", door);
  p = putOpening(p, "module-1", window);
  assert.throws(() => putOpening(p, "module-1", { ...window, width: 20 }));
  assert.throws(() => putOpening(p, "module-1", { ...window, position: NaN }));
  assert.throws(() => putOpening(p, "module-1", { ...window, id: "duplicate", position: 0.3 }));
  assert.throws(() => putOpening(p, "module-1", { ...window, position: 2.5 }));
  assert.throws(() => putWall(p, "module-1", { ...divider, end: [0, -0.5] }));
  assert.equal(p.modules[0].openings[0].width, 0.9);
});
test("end braces are conservative obstacles and valid long-facade bay stays available", () => {
  const east = MW900.walls.find((w) => w.id === "east")!,
    north = MW900.walls.find((w) => w.id === "north")!;
  assert.ok(
    validateOpening({ ...window, wallId: "east" }, east, []).some(
      (i) => i.code === "structure-conflict",
    ),
  );
  assert.equal(validateOpening(window, north, []).length, 0);
});
test("wall panels subtract real openings, including stacked holes", () => {
  const wall = MW900.walls[0];
  const openings = [window, { ...window, id: "upper", sillHeight: 1.8, height: 0.4 }];
  const low = { ...window, sillHeight: 0.2, height: 0.4 };
  const panels = wallPanels(wall, [low, openings[1]]);
  assert.ok(
    Math.abs(panels.reduce((n, p) => n + p.width * p.height, 0) - (8.68 * 2.378 - 0.96)) < 1e-8,
  );
});
test("quantities count visible facade, exposed roof and openings; absent prices remain unknown", () => {
  let p = putWall(createProject(), "module-1", divider);
  p = putOpening(p, "module-1", door);
  p = putOpening(p, "module-1", window);
  const q = quantities(p);
  assert.equal(q.find((q) => q.id === "windows")!.amount, 1);
  assert.equal(q.find((q) => q.id === "doors")!.amount, 1);
  assert.equal(estimate(p).total, null);
  p = { ...p, rates: Object.fromEntries(q.map((q) => [q.id, 10])) };
  assert.ok(estimate(p).total! > 0);
  assert.equal(quantities(recompose(p, 4, 2, "auto")).find((q) => q.id === "roof")!.amount, 54);
});
test("import rejects invalid shape, incompatible versions, orphaned hosts, and unsupported stacks", () => {
  const p = createProject();
  assert.throws(() => parseProject("{}"));
  assert.throws(() => parseProject(JSON.stringify({ ...p, definitionVersion: "future" })));
  assert.throws(() =>
    parseProject(JSON.stringify({ ...p, modules: [{ ...p.modules[0], walls: null }] })),
  );
  assert.throws(() =>
    parseProject(JSON.stringify({ ...p, modules: [{ ...p.modules[0], openings: [door] }] })),
  );
  assert.throws(() =>
    parseProject(
      JSON.stringify({ ...p, modules: [{ ...p.modules[0], level: 1, position: [0, 2.8, 0] }] }),
    ),
  );
  assert.throws(() =>
    parseProject(
      JSON.stringify({ ...p, modules: [{ ...p.modules[0], removedExternalFaces: ["above"] }] }),
    ),
  );
});
test("published definition and application source are byte-identical", () => {
  assert.equal(
    readFileSync(new URL("./mw900.json", import.meta.url), "utf8"),
    readFileSync(
      new URL("../../public/models/mw900/configurable/definition.json", import.meta.url),
      "utf8",
    ),
  );
});
