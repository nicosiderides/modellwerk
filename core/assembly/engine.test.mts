import assert from "node:assert/strict";
import test from "node:test";
import { createDemoProject } from "./demo.ts";
import { analyzePlan, autoPlan, buildSchedule, formatTime, getModulePosition, getModuleState, moveInSequence, TRUCK_RETURN_MINUTES, validateProject } from "./engine.ts";
import type { ModuleState, Project } from "./types.ts";

function smallProject(): Project {
  const project = createDemoProject();
  project.modules = project.modules.slice(0, 3).map((assemblyModule) => ({ ...assemblyModule, dependencies: [] }));
  project.sequence = project.modules.map((assemblyModule) => assemblyModule.id);
  project.trucks = project.trucks.slice(0, 3).map((truck) => ({ ...truck, moduleIds: truck.moduleIds.slice(0, 1), arrival: 0 }));
  return project;
}

test("demo roundtrip validates 24 modules, 12 trucks with two successive deliveries", () => {
  const project: Project = JSON.parse(JSON.stringify(createDemoProject()));
  assert.deepEqual(validateProject(project), { valid: true, errors: [] });
  assert.equal(project.modules.length, 24);
  assert.equal(project.trucks.length, 12);
  assert.ok(project.trucks.every((truck) => truck.moduleIds.length === 2));
  const schedule = buildSchedule(project);
  assert.equal(schedule.items.length, 24);
  assert.ok(schedule.duration > 1000);
  assert.deepEqual(analyzePlan(project, schedule), []);
});

test("schedule holds crane through fixation and crews through inspection", () => {
  const project = createDemoProject();
  const schedule = buildSchedule(project);
  for (const item of schedule.items) {
    assert.ok(item.start <= item.liftStart && item.liftStart < item.positionStart && item.positionStart < item.fixStart && item.fixStart < item.release && item.release < item.end);
    const assemblyModule = project.modules.find((entry) => entry.id === item.moduleId)!;
    assert.equal(item.release - item.fixStart, assemblyModule.fixMinutes);
    for (const dependency of assemblyModule.dependencies) assert.ok(schedule.items.find((entry) => entry.moduleId === dependency)!.release <= item.start);
    assert.ok(item.start % 480 + item.release - item.start <= 480);
  }
  for (const crew of project.crews) {
    const items = schedule.items.filter((item) => project.modules.find((assemblyModule) => assemblyModule.id === item.moduleId)!.crewId === crew.id);
    for (let i = 1; i < items.length; i++) assert.ok(items[i].start >= items[i - 1].end);
  }
  for (let i = 1; i < schedule.items.length; i++) assert.ok(schedule.items[i].start >= schedule.items[i - 1].release);
});

test("truck availability includes a return trip; it never delivers two modules simultaneously", () => {
  const project = smallProject();
  for (const assemblyModule of project.modules) assemblyModule.truckId = "T01";
  project.trucks = [{ id: "T01", name: "Camión único", moduleIds: project.sequence, arrival: 70 }];
  const items = buildSchedule(project).items;
  assert.equal(items[0].arrival, 70);
  for (let i = 1; i < items.length; i++) assert.ok(items[i].arrival >= items[i - 1].positionStart + TRUCK_RETURN_MINUTES);
});

test("two cranes can overlap fixation without double booking the unloading apron", () => {
  const project = smallProject();
  project.cranes.push({ ...project.cranes[0], id: "C02", position: [16, 0, 11] });
  const [a, b] = buildSchedule(project).items;
  assert.notEqual(a.craneId, b.craneId);
  assert.ok(b.start >= a.positionStart + 3);
  assert.ok(b.start < a.release);
  assert.deepEqual(analyzePlan(project), []);
});

test("reordering checks all dependencies atomically and preserves original data", () => {
  const project = createDemoProject();
  const sequence = [...project.sequence];
  const invalid = moveInSequence(project, "M13", "M01");
  assert.ok(invalid.error);
  assert.equal(invalid.project, project);
  assert.deepEqual(project.sequence, sequence);
  const valid = moveInSequence(project, "M03", "M01");
  assert.equal(valid.error, undefined);
  assert.equal(valid.project.sequence[0], "M03");
  assert.deepEqual(new Set(valid.project.sequence), new Set(sequence));
  assert.deepEqual(project.sequence, sequence);
});

test("reordering rejects unknown IDs, duplicates and missing sequence entries", () => {
  const project = createDemoProject();
  assert.ok(moveInSequence(project, "UNKNOWN", "M01").error);
  assert.ok(moveInSequence(project, "M01", "UNKNOWN").error);
  project.sequence[1] = "M01";
  assert.ok(moveInSequence(project, "M03", "M01").error);
});

test("auto plan is deterministic, preserves IDs, places lower levels before upper levels", () => {
  const project = createDemoProject();
  const planned = autoPlan(project);
  assert.deepEqual(planned, autoPlan(project));
  assert.equal(new Set(planned.sequence).size, project.modules.length);
  assert.ok(planned.sequence.slice(0, 12).every((id) => project.modules.find((assemblyModule) => assemblyModule.id === id)!.level === 0));
  assert.deepEqual(analyzePlan(planned), []);
  assert.ok(buildSchedule(planned).duration <= buildSchedule(project).duration);
});

test("auto plan accounts for a late truck before choosing the geometrically nearest module", () => {
  const project = smallProject();
  project.sequence = ["M03", "M01", "M02"];
  project.trucks[2].arrival = 200;
  const planned = autoPlan(project);
  assert.notEqual(planned.sequence[0], "M03");
  assert.ok(buildSchedule(planned).duration < buildSchedule(project).duration);
  assert.deepEqual(analyzePlan(planned), []);
});

test("dependency cycles are rejected by import and surfaced without scheduling deadlock", () => {
  const project = smallProject();
  project.modules[0].dependencies = ["M02"];
  project.modules[1].dependencies = ["M01"];
  assert.equal(validateProject(project).valid, false);
  assert.ok(analyzePlan(project).some((conflict) => conflict.id === "dependency-cycle"));
  assert.equal(autoPlan(project), project);
  assert.equal(buildSchedule(project).items.length, 1);
});

test("manual dependency inversion cannot schedule unsupported modules", () => {
  const project = createDemoProject();
  project.sequence = ["M13", ...project.sequence.filter((id) => id !== "M13")];
  assert.ok(!buildSchedule(project).items.some((item) => item.moduleId === "M13"));
  assert.ok(analyzePlan(project).some((conflict) => conflict.id === "dependency-order-M13-M01"));
});

test("all requested states have deterministic boundaries and reverse time works", () => {
  const project = smallProject();
  project.trucks[0].arrival = 60;
  const item = buildSchedule(project).items[0];
  const states: [number, ModuleState][] = [
    [item.arrival - 36, "NOT READY"], [item.arrival - 35, "READY"], [item.arrival - 20, "IN TRANSIT"],
    [item.arrival, "ON SITE"], [item.liftStart, "LIFTING"], [item.positionStart, "POSITIONING"],
    [item.fixStart, "FIXING"], [item.release, "INSTALLED"], [item.release + 6, "CONNECTED"],
    [item.release + 14, "INSPECTED"], [item.end, "COMPLETED"],
  ];
  for (const [time, expected] of states) assert.equal(getModuleState(item, time), expected);
  for (const [time, expected] of [...states].reverse()) assert.equal(getModuleState(item, time), expected);
  assert.equal(getModuleState(undefined, 1000), "NOT READY");
});

test("position remains continuous through lift, translation, placement and fixation", () => {
  const project = smallProject();
  const assemblyModule = project.modules[0];
  const item = buildSchedule(project).items[0];
  for (const boundary of [item.liftStart, item.positionStart, item.fixStart]) {
    const before = getModulePosition(assemblyModule, item, boundary - 0.0001, project);
    const after = getModulePosition(assemblyModule, item, boundary, project);
    assert.ok(Math.hypot(...before.map((value, index) => value - after[index])) < 0.001);
  }
  assert.deepEqual(getModulePosition(assemblyModule, item, item.end, project), assemblyModule.position);
  assert.deepEqual(getModulePosition(assemblyModule, undefined, 100, project), assemblyModule.position);
});

test("crane radius validates both pickup and final destination", () => {
  const project = smallProject();
  project.cranes[0].position = [...project.modules[0].position];
  project.cranes[0].radius = 2;
  let conflicts = analyzePlan(project);
  assert.ok(conflicts.some((conflict) => conflict.id === "pickup-radius-M01"));
  assert.ok(!conflicts.some((conflict) => conflict.id === "radius-M01"));
  project.cranes[0].position = [0, 0, 16];
  conflicts = analyzePlan(project);
  assert.ok(conflicts.some((conflict) => conflict.id === "radius-M01"));
  assert.ok(!conflicts.some((conflict) => conflict.id === "pickup-radius-M01"));
});

test("capacity, hook clearance, exclusion crossings and crane support constraints are flagged", () => {
  const project = smallProject();
  project.cranes[0].capacity = 2;
  project.cranes[0].height = 4;
  project.zones.push({ id: "RESTRICTED", name: "Línea eléctrica", type: "OVERHEAD LINE", position: [0, 0, 9], size: [20, 1] });
  project.zones.push({ id: "PIT", name: "Excavación", type: "EXCAVATION", position: [15, 0, 10], size: [2, 2] });
  const conflicts = analyzePlan(project);
  for (const id of ["capacity-M01", "height-M01", "path-M01-RESTRICTED", "crane-zone-C01-PIT"]) assert.ok(conflicts.some((conflict) => conflict.id === id), id);
});

test("analyzer independently finds manual impossible crew/crane/truck overlaps", () => {
  const project = smallProject();
  project.modules[1].truckId = project.modules[0].truckId;
  project.modules[1].crewId = project.modules[0].crewId;
  const schedule = buildSchedule(project);
  schedule.items[1] = { ...schedule.items[0], moduleId: "M02" };
  const conflicts = analyzePlan(project, schedule);
  assert.ok(conflicts.some((conflict) => conflict.id === "crew-overlap-M01-M02"));
  assert.ok(conflicts.some((conflict) => conflict.id === "crane-overlap-M01-M02"));
  assert.ok(conflicts.some((conflict) => conflict.id === "truck-overlap-M01-M02"));
});

test("crane outriggers cannot occupy the building and storage respects exclusion zones", () => {
  const project = smallProject();
  project.cranes[0].position = [...project.modules[0].position];
  project.zones.push({ id: "NO-STORAGE", name: "Prohibido acopiar", type: "NO_STORAGE", position: [-16, 0, 5], size: [4, 4] });
  const conflicts = analyzePlan(project);
  assert.ok(conflicts.some((conflict) => conflict.id === "crane-building-C01-M01"));
  assert.ok(conflicts.some((conflict) => conflict.id === "storage-zone-Z-STORAGE-NO-STORAGE"));
});

test("a nearby lower module is not incorrectly treated as vertical support", () => {
  const project = createDemoProject();
  project.modules[12].dependencies = ["M03"];
  assert.ok(analyzePlan(project).some((conflict) => conflict.id === "support-M13"));
});

test("time labels use eight-hour working shifts, not a wrapped single clock", () => {
  assert.equal(formatTime(0), "08:00");
  assert.equal(formatTime(479), "15:59");
  assert.equal(formatTime(480), "D2 · 08:00");
  assert.equal(formatTime(1020), "D3 · 09:00");
  assert.equal(formatTime(-10), "08:00");
});

test("import rejects malformed data, numeric coercion, missing references and oversized arrays", () => {
  assert.equal(validateProject(null).valid, false);
  assert.equal(validateProject({}).valid, false);
  const mutations: ((project: Project) => void)[] = [
    (project) => { project.modules[0].position[1] = NaN; },
    (project) => { project.modules[0].weight = Infinity; },
    (project) => { project.modules[0].dimensions[0] = 0; },
    (project) => { project.modules[0].truckId = "missing"; },
    (project) => { project.modules[0].crewId = "missing"; },
    (project) => { project.modules[0].dependencies = ["missing"]; },
    (project) => { project.modules[0].id = "M02"; },
    (project) => { project.trucks[0].moduleIds = []; },
    (project) => { project.sequence[0] = "unknown"; },
    (project) => { project.sequence.pop(); },
    (project) => { project.cranes[0].radius = -1; },
    (project) => { project.modules = Array.from({ length: 257 }, () => project.modules[0]); },
  ];
  for (const mutate of mutations) { const project = createDemoProject(); mutate(project); assert.equal(validateProject(project).valid, false); }
});
