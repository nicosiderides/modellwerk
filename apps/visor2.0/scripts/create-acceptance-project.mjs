import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createProject, putWall, putOpening } from "../core/building/engine.ts";
import { MW900 } from "../core/building/definition.ts";
import { serializeProject } from "../core/building/persistence.ts";
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(appRoot, "..");
let project = createProject();
project.name = "MW900 · Edificio de referencia";
project = putWall(project, "module-1", {
  id: "divisor-reference",
  kind: "internal",
  start: [0.5, -1.3],
  end: [0.5, 1.3],
  thickness: MW900.proposedLayers.partitionThickness,
  height: MW900.coordinates.ceilingDatum - MW900.coordinates.floorDatum,
  material: "panel-light",
});
project = putOpening(project, "module-1", {
  id: "door-reference",
  wallId: "divisor-reference",
  kind: "door",
  position: 0.1,
  width: 0.9,
  height: 2.1,
  sillHeight: 0,
  hinge: "left",
  direction: 1,
  type: "single",
});
project = putOpening(project, "module-1", {
  id: "window-reference",
  wallId: "north",
  kind: "window",
  position: 0.5,
  width: 1.5,
  height: 1,
  sillHeight: 0.9,
  hinge: "left",
  direction: 1,
  type: "fixed",
});
mkdirSync(resolve(workspaceRoot, "outputs/mw900"), { recursive: true });
writeFileSync(
  resolve(workspaceRoot, "outputs/mw900/acceptance-project.json"),
  serializeProject(project),
);
writeFileSync(
  resolve(appRoot, "public/models/mw900/configurable/example-project.json"),
  serializeProject(project),
);
console.log("Created MW900 acceptance project: four modules, one edited independently.");
