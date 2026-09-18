"use client";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Html, Line, useGLTF } from "@react-three/drei";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  Mesh,
  Plane,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ThreeEvent } from "@react-three/fiber";
import { MW900, MATERIALS } from "../../core/building/definition";
import { wallLength, wallPanels, wallPoint } from "../../core/building/geometry";
import type { ModuleInstance, Opening, Selection, Wall } from "../../core/building/types";
import { assetPath } from "../environment/utils/assetPath";

const unitBox = new BoxGeometry(1, 1, 1);
export const floorDatum = MW900.coordinates.floorDatum;
export type PickElement = (moduleId: string, elementId?: string) => void;
export function Structure({
  modules,
  cut,
  select,
  enter,
  halftone = false,
}: {
  modules: ModuleInstance[];
  cut: number | null;
  select: PickElement;
  enter: (id: string) => void;
  halftone?: boolean;
}) {
  const gltf = useGLTF(assetPath(MW900.structureUrl));
  const ref = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => {
    const parts: BufferGeometry[] = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      for (const key of Object.keys(g.attributes))
        if (!["position", "normal"].includes(key)) g.deleteAttribute(key);
      if (!g.attributes.normal) g.computeVertexNormals();
      const color = new Color(
        o.userData.mw_role === "fastener"
          ? "#859091"
          : o.userData.mw_category === "CONNECTIONS"
            ? "#626d6e"
            : "#414c51",
      );
      const colors = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) {
        colors[i] = color.r;
        colors[i + 1] = color.g;
        colors[i + 2] = color.b;
      }
      g.setAttribute("color", new BufferAttribute(colors, 3));
      parts.push(g);
    });
    const merged = mergeGeometries(parts)!;
    parts.forEach((p) => p.dispose());
    return merged;
  }, [gltf.scene]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new Matrix4();
    modules.forEach((m, i) => mesh.setMatrixAt(i, matrix.makeTranslation(...m.position)));
    mesh.count = modules.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
  }, [modules]);
  const planes = useMemo(
    () => (cut === null ? [] : [new Plane(new Vector3(0, -1, 0), cut)]),
    [cut],
  );
  const pick = (e: ThreeEvent<MouseEvent>, double = false) => {
    if (halftone || e.instanceId === undefined) return;
    e.stopPropagation();
    const id = modules[e.instanceId]?.id;
    if (id) {
      select(id);
      if (double) enter(id);
    }
  };
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, undefined, 10]}
      castShadow={!halftone && cut === null}
      receiveShadow={!halftone}
      raycast={halftone ? () => null : undefined}
      renderOrder={halftone ? -2 : 0}
      onClick={(e) => pick(e)}
      onDoubleClick={(e) => pick(e, true)}
    >
      {halftone ? (
        <meshBasicMaterial
          color="#aab8b6"
          transparent
          opacity={0.24}
          depthWrite={false}
          clippingPlanes={planes}
        />
      ) : (
        <meshStandardMaterial
          vertexColors
          roughness={0.66}
          metalness={0.3}
          clippingPlanes={planes}
        />
      )}
    </instancedMesh>
  );
}
function Solid({
  position,
  size,
  color,
  selected = false,
  halftone = false,
  ...props
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  selected?: boolean;
  halftone?: boolean;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  return (
    <mesh
      geometry={unitBox}
      position={position}
      scale={size}
      castShadow={!halftone}
      receiveShadow={!halftone}
      raycast={halftone ? () => null : undefined}
      {...props}
    >
      {halftone ? (
        <meshBasicMaterial color="#9fb0ae" transparent opacity={0.14} depthWrite={false} />
      ) : (
        <meshStandardMaterial color={selected ? "#d9b252" : color} roughness={0.8} />
      )}
    </mesh>
  );
}
export function OpeningGeometry({
  wall,
  opening,
  selected,
  onSelect,
  plan,
  halftone = false,
}: {
  wall: Wall;
  opening: Opening;
  selected: boolean;
  onSelect: () => void;
  plan: boolean;
  halftone?: boolean;
}) {
  const o = opening,
    start = wallPoint(wall, o.position);
  const angle = -Math.atan2(wall.end[1] - wall.start[1], wall.end[0] - wall.start[0]);
  const color = selected ? "#ecc353" : "#343d42",
    frame = 0.04;
  const points = Array.from({ length: 25 }, (_, i) => {
    const t = ((i / 24) * Math.PI) / 2;
    return [
      o.hinge === "left" ? Math.cos(t) * o.width : o.width - Math.cos(t) * o.width,
      0.025,
      Math.sin(t) * o.width * o.direction,
    ] as [number, number, number];
  });
  return (
    <group
      position={[start[0], floorDatum + o.sillHeight, start[1]]}
      rotation-y={angle}
      onClick={(e) => {
        if (halftone) return;
        e.stopPropagation();
        onSelect();
      }}
      name={o.id}
      userData={{ mw_id: o.id, mw_host: wall.id, mw_category: o.kind }}
    >
      {[frame / 2, o.width - frame / 2].map((x) => (
        <Solid
          key={x}
          position={[x, o.height / 2, 0]}
          size={[frame, o.height, wall.thickness + 0.035]}
          color={color}
          halftone={halftone}
        />
      ))}
      <Solid
        position={[o.width / 2, o.height - frame / 2, 0]}
        size={[o.width, frame, wall.thickness + 0.035]}
        color={color}
        halftone={halftone}
      />
      {o.kind === "window" ? (
        <>
          <Solid
            position={[o.width / 2, frame / 2, 0]}
            size={[o.width, frame, wall.thickness + 0.035]}
            color={color}
            halftone={halftone}
          />
          {o.type === "sliding" && (
            <Solid
              position={[o.width / 2, o.height / 2, 0]}
              size={[frame, o.height, 0.055]}
              color={color}
              halftone={halftone}
            />
          )}
          <mesh
            position={[o.width / 2, o.height / 2, 0]}
            geometry={unitBox}
            scale={[o.width - frame * 2, o.height - frame * 2, 0.012]}
            raycast={halftone ? () => null : undefined}
          >
            {halftone ? (
              <meshBasicMaterial color="#9fb0ae" transparent opacity={0.12} depthWrite={false} />
            ) : (
              <meshStandardMaterial
                color={selected ? "#e3c976" : "#86b7c2"}
                transparent
                opacity={0.38}
                roughness={0.2}
                metalness={0.25}
                depthWrite={false}
              />
            )}
          </mesh>
          {plan && (
            <Line
              points={[
                [0, 0.03, 0],
                [o.width, 0.03, 0],
              ]}
              color="#73a9b8"
              lineWidth={3}
            />
          )}
        </>
      ) : (
        <>
          <group
            position={[o.hinge === "left" ? 0 : o.width, 0, 0]}
            rotation-y={(-o.direction * (o.hinge === "left" ? 1 : -1) * Math.PI) / 2}
          >
            <Solid
              position={[
                ((o.hinge === "left" ? 1 : -1) * o.width) / 2,
                plan ? 0.035 : o.height / 2,
                0,
              ]}
              size={[o.width, plan ? 0.04 : o.height, 0.035]}
              color={selected ? "#e2b94e" : "#ac9c80"}
              halftone={halftone}
            />
          </group>
          <Line
            points={points}
            color={selected ? "#e4b745" : "#9eaaac"}
            lineWidth={1}
            dashed
            dashSize={0.09}
            gapSize={0.045}
          />
        </>
      )}
      {selected && (
        <Html position={[o.width / 2, plan ? 0.15 : o.height + 0.18, 0]} center>
          <div className="element-world-label">
            {o.kind === "window" ? "V" : "P"} · {Math.round(o.width * 1000)} ×{" "}
            {Math.round(o.height * 1000)} mm
          </div>
        </Html>
      )}
    </group>
  );
}
export const WallGeometry = memo(function WallGeometry({
  wall,
  module,
  selection,
  select,
  cut,
  plan,
  onHostClick,
  halftone = false,
}: {
  wall: Wall;
  module: ModuleInstance;
  selection: Selection;
  select: PickElement;
  cut: boolean;
  plan: boolean;
  onHostClick?: (wall: Wall, e: ThreeEvent<MouseEvent>) => void;
  halftone?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const panels = useMemo(
    () => wallPanels(wall, module.openings, cut ? 1.2 : wall.height),
    [wall, module.openings, cut],
  );
  const selected = !halftone && selection.moduleId === module.id && selection.elementId === wall.id;
  const color = MATERIALS[wall.material as keyof typeof MATERIALS]?.color ?? "#ced0c9";
  const angle = -Math.atan2(wall.end[1] - wall.start[1], wall.end[0] - wall.start[0]);
  return (
    <group>
      <group
        position={[wall.start[0], floorDatum, wall.start[1]]}
        rotation-y={angle}
        name={wall.id}
        userData={{ mw_id: wall.id, mw_category: wall.kind, mw_material: wall.material }}
        onPointerOver={(e) => {
          if (halftone) return;
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => !halftone && setHovered(false)}
        onClick={(e) => {
          if (halftone) return;
          e.stopPropagation();
          if (onHostClick) onHostClick(wall, e);
          else select(module.id, wall.id);
        }}
      >
        {panels.map((p, i) => (
          <Solid
            key={i}
            position={[p.x + p.width / 2, p.y + p.height / 2, 0]}
            size={[p.width, p.height, wall.thickness]}
            color={hovered ? "#bbc9c7" : color}
            selected={selected}
            halftone={halftone}
          />
        ))}
        {cut &&
          panels
            .filter((p) => Math.abs(p.y + p.height - 1.2) < 0.001)
            .map((p, i) => (
              <Solid
                key={"cap" + i}
                position={[p.x + p.width / 2, 1.203, 0]}
                size={[p.width, 0.006, wall.thickness]}
                color={selected ? "#e3b647" : "#566360"}
                halftone={halftone}
              />
            ))}
      </group>
      {module.openings
        .filter((o) => o.wallId === wall.id)
        .map((o) => (
          <OpeningGeometry
            key={o.id}
            wall={wall}
            opening={o}
            selected={selection.moduleId === module.id && selection.elementId === o.id}
            onSelect={() => select(module.id, o.id)}
            plan={plan}
            halftone={halftone}
          />
        ))}
      {selected && (
        <Html
          position={[
            (wall.start[0] + wall.end[0]) / 2,
            cut ? 1.65 : wall.height + 0.45,
            (wall.start[1] + wall.end[1]) / 2,
          ]}
          center
        >
          <div className="element-world-label">Muro · {Math.round(wallLength(wall) * 1000)} mm</div>
        </Html>
      )}
    </group>
  );
});
export const ModuleEnvelope = memo(function ModuleEnvelope({
  module,
  selection,
  select,
  enter,
  view,
  plan,
  editing,
  onHostClick,
  halftone = false,
}: {
  module: ModuleInstance;
  selection: Selection;
  select: PickElement;
  enter: (id: string) => void;
  view: "full" | "cut" | "structure";
  plan: boolean;
  editing: boolean;
  onHostClick?: (wall: Wall, e: ThreeEvent<MouseEvent>) => void;
  halftone?: boolean;
}) {
  const d = MW900.dimensions,
    selected = !halftone && selection.moduleId === module.id;
  const cut = plan || editing || view === "cut";
  const color = MATERIALS[module.floorMaterial as keyof typeof MATERIALS]?.color ?? "#aa9373";
  const ix = Math.abs(MW900.walls[0].start[0]) * 2 + MW900.proposedLayers.wallThickness,
    iz = Math.abs(MW900.walls[0].start[1]) * 2 + MW900.proposedLayers.wallThickness;
  return (
    <group
      position={module.position}
      onDoubleClick={(e) => {
        if (halftone) return;
        e.stopPropagation();
        enter(module.id);
      }}
    >
      {view !== "structure" && (
        <>
          <Solid
            position={[
              0,
              floorDatum - MW900.proposedLayers.floorFinish - MW900.proposedLayers.floorBoard / 2,
              0,
            ]}
            size={[ix, MW900.proposedLayers.floorBoard, iz]}
            color="#756751"
            halftone={halftone}
          />
          <Solid
            position={[0, floorDatum - MW900.proposedLayers.floorFinish / 2, 0]}
            size={[ix, MW900.proposedLayers.floorFinish, iz]}
            color={color}
            halftone={halftone}
            onClick={(e) => {
              if (halftone) return;
              e.stopPropagation();
              select(module.id);
            }}
          />
          {module.walls.map((w) => (
            <WallGeometry
              key={w.id}
              wall={w}
              module={module}
              selection={selection}
              select={select}
              cut={cut}
              plan={plan}
              onHostClick={onHostClick}
              halftone={halftone}
            />
          ))}
          {!cut && (
            <>
              <Solid
                position={[
                  0,
                  MW900.coordinates.ceilingDatum + MW900.proposedLayers.ceilingBoard / 2,
                  0,
                ]}
                size={[ix, MW900.proposedLayers.ceilingBoard, iz]}
                color="#d8dcd5"
                halftone={halftone}
              />
              <Solid
                position={[0, d.height - MW900.proposedLayers.roofPanel / 2, 0]}
                size={[ix, MW900.proposedLayers.roofPanel, iz]}
                color="#697679"
                halftone={halftone}
              />
            </>
          )}
        </>
      )}
      {selected && (
        <Line
          points={[
            [-d.length / 2, 0.025, -d.width / 2],
            [d.length / 2, 0.025, -d.width / 2],
            [d.length / 2, 0.025, d.width / 2],
            [-d.length / 2, 0.025, d.width / 2],
            [-d.length / 2, 0.025, -d.width / 2],
          ]}
          color="#e5b946"
          lineWidth={2}
        />
      )}
      {!halftone && (
        <Html
          position={[0, cut ? floorDatum + 0.03 : d.height + 0.12, 0]}
          center
          zIndexRange={[9, 0]}
        >
          <button
            className={selected ? "module-badge selected" : "module-badge"}
            onClick={() => select(module.id)}
            onDoubleClick={() => enter(module.id)}
            aria-label={`Seleccionar M${String(module.index + 1).padStart(2, "0")}`}
          >
            <b>M{String(module.index + 1).padStart(2, "0")}</b>
            <span>{d.length * d.width} m²</span>
          </button>
        </Html>
      )}
    </group>
  );
});
