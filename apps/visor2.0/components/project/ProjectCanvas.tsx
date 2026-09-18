"use client";
import { Component, Suspense, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  Bounds,
  Edges,
  Grid,
  Html,
  Line,
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
  useBounds,
} from "@react-three/drei";
import { ACESFilmicToneMapping, Group, PCFShadowMap, Vector3 } from "three";
import { MW900, FACE_LABELS } from "../../core/building/definition";
import { activeModule, neighborGraph } from "../../core/building/assembly";
import { gridPoint, wallDistance } from "../../core/building/geometry";
import type {
  ModuleInstance,
  Project,
  Selection,
  Vec2,
  Vec3,
  Wall,
} from "../../core/building/types";
import { ModuleEnvelope, Structure } from "./BuildingGeometry";

export type EditTool = "select" | "wall" | "window" | "door";
export type CanvasProps = {
  project: Project;
  selection: Selection;
  editing: boolean;
  cameraView: "perspective" | "top";
  view: "full" | "cut" | "structure";
  level: number;
  gridVisible: boolean;
  connectionsVisible: boolean;
  snapPreview?: { position: Vec3; valid: boolean };
  resetToken: number;
  tool: EditTool;
  onSelect: (moduleId: string, elementId?: string) => void;
  onEnter: (id: string) => void;
  onDrawWall: (start: Vec2, end: Vec2) => void;
  onPlaceOpening: (wall: Wall, position: number) => void;
  onMoveElement: (value: number) => void;
};
function Fit({
  signature,
  top,
  target,
}: {
  signature: string;
  top: boolean;
  target: RefObject<Group | null>;
}) {
  const bounds = useBounds();
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      bounds.refresh(target.current ?? undefined);
      if (top) {
        const center = bounds.getSize().center;
        camera.position.set(center.x, center.y + 100, center.z);
        camera.up.set(0, 0, -1);
        camera.lookAt(center);
        camera.updateMatrixWorld();
      }
      bounds.reset().clip().fit();
    });
    return () => cancelAnimationFrame(id);
  }, [bounds, camera, signature, target, top]);
  return null;
}
class SceneBoundary extends Component<{ children: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <Html center>
        <div className="scene-error">
          No se pudo cargar el modelo MW900.
          <button onClick={() => window.location.reload()}>Reintentar</button>
        </div>
      </Html>
    ) : (
      this.props.children
    );
  }
}
function DraftSurface({
  module,
  tool,
  onDrawWall,
}: {
  module: ModuleInstance;
  tool: EditTool;
  onDrawWall: CanvasProps["onDrawWall"];
}) {
  const ref = useRef<Group>(null),
    [start, setStart] = useState<Vec2 | null>(null),
    [end, setEnd] = useState<Vec2 | null>(null);
  const point = (e: ThreeEvent<MouseEvent | PointerEvent>): Vec2 => {
    const p = ref.current!.worldToLocal(e.point.clone());
    return gridPoint([p.x, p.z]);
  };
  const constrain = (p: Vec2): Vec2 =>
    !start
      ? p
      : Math.abs(p[0] - start[0]) >= Math.abs(p[1] - start[1])
        ? [p[0], start[1]]
        : [start[0], p[1]];
  if (tool !== "wall") return null;
  return (
    <group ref={ref} position={module.position}>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, MW900.coordinates.floorDatum + 0.015, 0]}
        onClick={(e) => {
          e.stopPropagation();
          const p = constrain(point(e));
          if (start) {
            onDrawWall(start, p);
            setStart(null);
            setEnd(null);
          } else {
            setStart(p);
            setEnd(p);
          }
        }}
        onPointerMove={(e) => {
          e.stopPropagation();
          if (start) setEnd(constrain(point(e)));
        }}
      >
        <planeGeometry args={[MW900.dimensions.length, MW900.dimensions.width]} />
        <meshBasicMaterial transparent opacity={0.06} color="#e4bd50" depthWrite={false} />
      </mesh>
      {start && end && (
        <>
          <Line
            points={[
              [start[0], 0.27, start[1]],
              [end[0], 0.27, end[1]],
            ]}
            color="#f0c54e"
            lineWidth={4}
          />
          <Html position={[end[0], 0.5, end[1]]}>
            <div className="element-world-label">
              {Math.round(Math.hypot(end[0] - start[0], end[1] - start[1]) * 1000)} mm · segundo
              punto
            </div>
          </Html>
        </>
      )}
    </group>
  );
}
function PositionHandle({
  module,
  selection,
  onMove,
}: {
  module: ModuleInstance;
  selection: Selection;
  onMove: CanvasProps["onMoveElement"];
}) {
  const opening = module.openings.find((o) => o.id === selection.elementId);
  const wall = module.walls.find((w) => w.id === (opening?.wallId ?? selection.elementId));
  if (!wall || (!opening && wall.kind !== "internal")) return null;
  const along = Math.abs(wall.end[0] - wall.start[0]) > 0.0001;
  const value = opening?.position ?? (along ? wall.start[1] : wall.start[0]);
  const min = opening ? 0.05 : along ? -1.2 : -4.2;
  const max = opening
    ? Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]) - opening.width - 0.05
    : along
      ? 1.2
      : 4.2;
  return (
    <Html
      position={[module.position[0], module.position[1] + 3.2, module.position[2]]}
      center
      zIndexRange={[15, 10]}
    >
      <div className="position-handle" onPointerDown={(e) => e.stopPropagation()}>
        <span>
          ↔ {opening ? "Posición en el muro" : "Desplazar divisor"} · {Math.round(value * 1000)} mm
        </span>
        <input
          aria-label="Desplazador gráfico"
          type="range"
          min={min}
          max={max}
          step={0.05}
          value={value}
          onChange={(e) => onMove(Number(e.target.value))}
        />
      </div>
    </Html>
  );
}

function ContextModule({
  module,
  adjacent,
  top,
}: {
  module: ModuleInstance;
  adjacent: boolean;
  top: boolean;
}) {
  const d = MW900.dimensions;
  return (
    <group position={module.position}>
      {adjacent && (
        <Html
          position={[0, top ? MW900.coordinates.floorDatum + 0.08 : d.height + 0.12, 0]}
          center
          zIndexRange={[7, 0]}
        >
          <div className="context-module-label" aria-hidden="true">
            M{String(module.index + 1).padStart(2, "0")} · CONTEXTO
          </div>
        </Html>
      )}
    </group>
  );
}

function Stage(props: CanvasProps) {
  const { project, selection, editing, cameraView, view, level, tool } = props;
  const top = cameraView === "top";
  const focusRef = useRef<Group>(null);
  const selected = project.modules.find((m) => m.id === selection.moduleId) ?? project.modules[0];
  const modules = useMemo(
    () =>
      editing
        ? [selected]
        : top
          ? project.modules.filter((m) => m.level === level)
          : project.modules,
    [editing, selected, top, project.modules, level],
  );
  const graph = useMemo(() => neighborGraph(project.modules), [project.modules]);
  const adjacentIds = useMemo(
    () => new Set(Object.values(graph[selected.id]).filter((id): id is string => !!id)),
    [graph, selected.id],
  );
  const contextModules = useMemo(
    () =>
      editing
        ? project.modules.filter(
            (module) => module.id !== selected.id && (!top || module.level === selected.level),
          )
        : [],
    [editing, project.modules, selected.id, selected.level, top],
  );
  const cut = top || editing;
  const cutY = cut
    ? (top ? level : selected.level) * MW900.dimensions.height + MW900.coordinates.floorDatum + 1.2
    : null;
  const signature =
    modules.map((m) => m.position.join("/")).join("|") +
    project.rotation +
    props.resetToken +
    editing +
    level;
  const hostClick = (module: ModuleInstance, wall: Wall, e: ThreeEvent<MouseEvent>) => {
    if (!editing || !["door", "window"].includes(tool)) {
      props.onSelect(module.id, wall.id);
      return;
    }
    const point = e.point
      .clone()
      .applyAxisAngle(new Vector3(0, 1, 0), -project.rotation)
      .sub(new Vector3(...module.position));
    props.onPlaceOpening(wall, Math.round(wallDistance(wall, [point.x, point.z]) / 0.05) * 0.05);
  };
  return (
    <>
      <color attach="background" args={["#1b2022"]} />
      {top ? (
        <OrthographicCamera
          makeDefault
          position={[selected.position[0], 100, selected.position[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
          up={[0, 0, -1]}
          near={0.01}
          far={1000}
          zoom={30}
        />
      ) : (
        <PerspectiveCamera makeDefault position={[20, 16, 22]} fov={40} near={0.05} far={1500} />
      )}
      <hemisphereLight args={["#f4f5ef", "#333a3b", 2.2]} />
      <directionalLight
        position={[12, 24, 15]}
        intensity={3.2}
        castShadow={!top}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.025}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
      />
      <directionalLight position={[-16, 8, -12]} intensity={1.6} color="#b4c7d2" />
      <mesh position={[0, -0.08, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[2000, 2000]} />
        <meshStandardMaterial color="#232a2c" roughness={1} />
      </mesh>
      {props.gridVisible && (
        <Grid
          position={[0, top ? level * MW900.dimensions.height - 0.02 : -0.02, 0]}
          infiniteGrid
          cellSize={1}
          sectionSize={3}
          cellColor="#475052"
          sectionColor="#647171"
          fadeDistance={120}
          fadeStrength={1.5}
          cellThickness={0.45}
          sectionThickness={0.7}
        />
      )}
      <Bounds margin={top ? 1.3 : 1.45} maxDuration={0.5}>
        <Fit signature={signature} top={top} target={focusRef} />
        <group rotation-y={project.rotation}>
          {contextModules.length > 0 && (
            <Suspense fallback={null}>
              <SceneBoundary>
                <Structure
                  modules={contextModules}
                  cut={top ? cutY : null}
                  select={props.onSelect}
                  enter={props.onEnter}
                  halftone
                />
              </SceneBoundary>
            </Suspense>
          )}
          {contextModules.map((module) => (
            <ModuleEnvelope
              key={`halftone-${module.id}`}
              module={activeModule(module, graph[module.id])}
              selection={selection}
              select={props.onSelect}
              enter={props.onEnter}
              view="full"
              plan={top}
              editing={false}
              halftone
            />
          ))}
          {contextModules.map((module) => (
            <ContextModule
              key={`context-${module.id}`}
              module={module}
              adjacent={adjacentIds.has(module.id)}
              top={top}
            />
          ))}
          <group ref={focusRef}>
            <Suspense
              fallback={
                <Html center>
                  <div className="element-world-label">Cargando estructura MW900…</div>
                </Html>
              }
            >
              <SceneBoundary>
                <Structure
                  modules={modules}
                  cut={cutY}
                  select={props.onSelect}
                  enter={props.onEnter}
                />
              </SceneBoundary>
            </Suspense>
            {modules.map((m) => (
              <ModuleEnvelope
                key={m.id}
                module={activeModule(m, graph[m.id])}
                selection={selection}
                select={props.onSelect}
                enter={props.onEnter}
                view={view}
                plan={top}
                editing={editing}
                onHostClick={(wall, e) => hostClick(m, wall, e)}
              />
            ))}
            {editing && (
              <DraftSurface
                key={`${selected.id}-${tool}`}
                module={selected}
                tool={tool}
                onDrawWall={props.onDrawWall}
              />
            )}
          </group>
          {props.connectionsVisible &&
            !editing &&
            modules.flatMap((m) =>
              Object.entries(graph[m.id])
                .filter(([, id]) => m.id.localeCompare(id!) < 0)
                .map(([face, id]) => {
                  const target = modules.find((n) => n.id === id);
                  if (!target) return null;
                  const a = new Vector3(...m.position),
                    b = new Vector3(...target.position),
                    center = a.clone().add(b).multiplyScalar(0.5);
                  center.y += 0.27;
                  return (
                    <group key={`${m.id}-${id}`}>
                      <Line
                        points={[
                          [a.x, a.y + 0.28, a.z],
                          [b.x, b.y + 0.28, b.z],
                        ]}
                        color="#8bcbac"
                        lineWidth={1.5}
                        dashed
                        dashSize={0.15}
                        gapSize={0.09}
                      />
                      <Html position={center} center>
                        <div className="connection-label">
                          ● M{m.index + 1} ↔ M{target.index + 1} ·{" "}
                          {FACE_LABELS[face as keyof typeof FACE_LABELS]}
                        </div>
                      </Html>
                    </group>
                  );
                }),
            )}
        </group>
      </Bounds>
      {!editing && props.connectionsVisible && props.snapPreview && (
        <group rotation-y={project.rotation}>
          <group position={props.snapPreview.position}>
            <mesh position={[0, MW900.dimensions.height / 2, 0]} raycast={() => null}>
              <boxGeometry
                args={[MW900.dimensions.length, MW900.dimensions.height, MW900.dimensions.width]}
              />
              <meshBasicMaterial
                color={props.snapPreview.valid ? "#82cdb0" : "#d88b73"}
                transparent
                opacity={0.08}
                depthWrite={false}
              />
              <Edges color={props.snapPreview.valid ? "#82cdb0" : "#d88b73"} raycast={() => null} />
            </mesh>
            <Html position={[0, MW900.dimensions.height + 0.25, 0]} center>
              <div className="connection-label">
                {props.snapPreview.valid ? "● Conexión disponible" : "Cara ocupada / sin apoyo"}
              </div>
            </Html>
          </group>
        </group>
      )}
      {editing && tool === "select" && (
        <group rotation-y={project.rotation}>
          <PositionHandle module={selected} selection={selection} onMove={props.onMoveElement} />
        </group>
      )}
      <OrbitControls
        key={cameraView}
        makeDefault
        enableRotate={!top && tool !== "wall"}
        enablePan={tool !== "wall"}
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={0}
        maxPolarAngle={top ? Math.PI : Math.PI / 2.02}
        minDistance={2}
        maxDistance={1000}
        minZoom={0.5}
        maxZoom={250}
      />
    </>
  );
}
export default function ProjectCanvas(props: CanvasProps) {
  return (
    <div className="project-canvas" aria-label="Edificio modular MW900 interactivo">
      <Canvas
        frameloop="demand"
        shadows={{ type: PCFShadowMap }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1;
          gl.localClippingEnabled = true;
        }}
      >
        <Stage {...props} />
      </Canvas>
    </div>
  );
}
