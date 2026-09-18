"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { Text } from "@react-three/drei";
import {
  CircleGeometry,
  Euler,
  InstancedMesh,
  Material,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from "three";
import type { FactoryMaterialSet } from "../materials/useFactoryMaterials";
import {
  getStationIndex,
  MODULE_ROUTE_POINTS,
  STATIONS,
} from "../stations/stationsConfig";
import { MODULE_SLOT } from "../utils/sceneConstants";
import type { BoxInstance } from "../utils/InstancedBoxes";
import type { EulerTuple, ModuleStationPose, StationId, Vec3 } from "../utils/sceneTypes";

type FloorSystemProps = {
  activeStationId: StationId;
  materials: FactoryMaterialSet;
};

type FloorMark = BoxInstance & {
  material: "yellow" | "white" | "dark" | "led";
};

const floorY = 0.002;
const floorStripRotation = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
const floorUp = new Vector3(0, 1, 0);

function box(position: Vec3, scale: Vec3, material: FloorMark["material"], rotation?: EulerTuple): FloorMark {
  return { position, scale, material, rotation };
}

function rotateLocalOffset(center: Vec3, offsetX: number, offsetZ: number, y: number, rotationY: number): Vec3 {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);

  return [
    center[0] + offsetX * cos + offsetZ * sin,
    y,
    center[2] - offsetX * sin + offsetZ * cos,
  ];
}

function orientedBox(
  center: Vec3,
  offsetX: number,
  offsetZ: number,
  scale: Vec3,
  rotationY: number,
  material: FloorMark["material"]
) {
  return box(
    rotateLocalOffset(center, offsetX, offsetZ, floorY, rotationY),
    scale,
    material,
    [0, rotationY, 0]
  );
}

function moduleBayOutline(pose: ModuleStationPose, material: FloorMark["material"]): FloorMark[] {
  const [footprintLength, footprintDepth] = pose.footprint;
  const [clearanceLength, clearanceDepth] = pose.clearance;
  const width = footprintLength + clearanceLength * 2;
  const depth = footprintDepth + clearanceDepth * 2;
  const line = 0.13;

  return [
    orientedBox(pose.position, 0, -depth / 2, [width, 0.018, line], pose.rotationY, material),
    orientedBox(pose.position, 0, depth / 2, [width, 0.018, line], pose.rotationY, material),
    orientedBox(pose.position, -width / 2, 0, [line, 0.018, depth], pose.rotationY, material),
    orientedBox(pose.position, width / 2, 0, [line, 0.018, depth], pose.rotationY, material),
  ];
}

function createExpansionJoints(): BoxInstance[] {
  const joints: BoxInstance[] = [];

  for (let x = -50; x <= 50; x += 10) {
    joints.push({ position: [x, 0.001, 0], scale: [0.025, 0.001, 60] });
  }

  for (let z = -20; z <= 20; z += 10) {
    joints.push({ position: [0, 0.001, z], scale: [120, 0.001, 0.025] });
  }

  return joints;
}

function createAisleGuides(): FloorMark[] {
  const marks: FloorMark[] = [];

  // Logistics lanes: paired amber boundaries plus a dashed center line.
  [-18.2, 18.2].forEach((centerZ) => {
    [-2.05, 2.05].forEach((offset) => {
      marks.push(box([0, floorY, centerZ + offset], [112, 0.001, 0.1], "yellow"));
    });
    for (let x = -53; x <= 53; x += 5.2) {
      marks.push(box([x, floorY, centerZ], [2.7, 0.001, 0.075], "yellow"));
    }
  });

  // Protected pedestrian spine through the center of the factory.
  [-1.15, 1.15].forEach((z) => {
    marks.push(box([0, floorY, z], [112, 0.001, 0.085], "white"));
  });
  [-42, -16, 10, 36].forEach((crossingX) => {
    for (let x = crossingX - 1.2; x <= crossingX + 1.2; x += 0.48) {
      marks.push(box([x, floorY, 0], [0.22, 0.001, 2.08], "white"));
    }
  });

  return marks;
}

function createDashedRoute(points: Vec3[]): FloorMark[] {
  const marks: FloorMark[] = [];
  const dashLength = 1.15;
  const gap = 0.72;

  points.slice(1).forEach((point, index) => {
    const start = points[index];
    const dx = point[0] - start[0];
    const dz = point[2] - start[2];
    const length = Math.hypot(dx, dz);
    if (length < 0.08) return;

    const angle = Math.atan2(dz, dx);
    const steps = Math.floor(length / (dashLength + gap));
    for (let step = 0; step <= steps; step += 1) {
      const distance = Math.min(length, step * (dashLength + gap) + dashLength / 2);
      marks.push(
        box(
          [
            start[0] + Math.cos(angle) * distance,
            floorY,
            start[2] + Math.sin(angle) * distance,
          ],
          [Math.min(dashLength, length), 0.001, 0.13],
          "yellow",
          [0, -angle, 0]
        )
      );
    }
  });

  return marks;
}

function createFloorMarks(activeStationId: StationId) {
  const marks: FloorMark[] = [];
  marks.push(...createAisleGuides());
  marks.push(...createDashedRoute(MODULE_ROUTE_POINTS));

  if (activeStationId === "overview") {
    marks.push(...moduleBayOutline(STATIONS[0].modulePose, "led"));
  }

  const activeIndex = getStationIndex(activeStationId);
  STATIONS.filter((station) => station.id !== "overview").forEach((station) => {
    const stationIndex = getStationIndex(station.id);
    const material =
      station.id === activeStationId
        ? "led"
        : stationIndex < activeIndex
          ? "white"
          : "dark";
    marks.push(...moduleBayOutline(station.modulePose, material));
  });

  return marks;
}

function createFloorOverlayMaterial(material: Material, polygonOffsetUnits: number, opacity = material.opacity) {
  const overlayMaterial = material.clone();
  overlayMaterial.transparent = true;
  overlayMaterial.opacity = opacity;
  overlayMaterial.depthWrite = false;
  overlayMaterial.polygonOffset = true;
  overlayMaterial.polygonOffsetFactor = polygonOffsetUnits;
  overlayMaterial.polygonOffsetUnits = polygonOffsetUnits;
  return overlayMaterial;
}

function FloorStrips({
  name,
  items,
  lift = 0,
  material,
  renderOrder,
}: {
  name: string;
  items: BoxInstance[];
  lift?: number;
  material: Material;
  renderOrder: number;
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new PlaneGeometry(1, 1), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const matrix = new Matrix4();
    const position = new Vector3();
    const scale = new Vector3();
    const yawRotation = new Quaternion();
    const quaternion = new Quaternion();

    items.forEach((item, index) => {
      position.fromArray(item.position);
      position.y += lift;
      scale.set(item.scale[0], item.scale[2], 1);
      yawRotation.setFromAxisAngle(floorUp, item.rotation?.[1] ?? 0);
      quaternion.copy(yawRotation).multiply(floorStripRotation);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, lift]);

  return (
    <instancedMesh
      ref={meshRef}
      name={name}
      args={[geometry, material, items.length]}
      castShadow={false}
      receiveShadow={false}
      frustumCulled
      renderOrder={renderOrder}
    />
  );
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ScuffDecals({ materials }: { materials: FactoryMaterialSet }) {
  const meshRef = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new CircleGeometry(1, 18), []);
  const decals = useMemo(() => {
    const random = mulberry32(1969);
    const values: Array<{ position: Vec3; scale: Vec3; rotation: number }> = [];

    while (values.length < 64) {
      const x = -57 + random() * 114;
      const z = -27 + random() * 54;
      if (Math.abs(x) < MODULE_SLOT.halfSize && Math.abs(z) < MODULE_SLOT.halfSize) continue;

      values.push({
        position: [x, 0.009, z],
        scale: [0.5 + random() * 2.6, 0.18 + random() * 0.8, 1],
        rotation: random() * Math.PI,
      });
    }

    return values;
  }, []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const matrix = new Matrix4();
    const position = new Vector3();
    const scale = new Vector3();
    const rotation = new Euler();
    const quaternion = new Quaternion();

    decals.forEach((item, index) => {
      position.fromArray(item.position);
      scale.fromArray(item.scale);
      rotation.set(-Math.PI / 2, 0, item.rotation);
      quaternion.setFromEuler(rotation);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [decals]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, materials.scuff, decals.length]}
      receiveShadow={false}
      castShadow={false}
      frustumCulled
      renderOrder={2}
    />
  );
}

export function FloorSystem({ activeStationId, materials }: FloorSystemProps) {
  const expansionJoints = useMemo(createExpansionJoints, []);
  const floorMarks = useMemo(() => createFloorMarks(activeStationId), [activeStationId]);

  const yellowMarks = floorMarks.filter((mark) => mark.material === "yellow");
  const whiteMarks = floorMarks.filter((mark) => mark.material === "white");
  const darkMarks = floorMarks.filter((mark) => mark.material === "dark");
  const ledMarks = floorMarks.filter((mark) => mark.material === "led");
  const floorOverlayMaterials = useMemo(
    () => ({
      darkEpoxy: createFloorOverlayMaterial(materials.darkEpoxy, -1, 0.1),
      lineYellow: createFloorOverlayMaterial(materials.lineYellow, -2),
      lineWhite: createFloorOverlayMaterial(materials.lineWhite, -3),
      led: createFloorOverlayMaterial(materials.led, -4),
    }),
    [materials.darkEpoxy, materials.led, materials.lineWhite, materials.lineYellow]
  );

  return (
    <group name="FactoryFloorSystem">
      <mesh
        name="PolishedConcreteFloor"
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.008, 0]}
        receiveShadow
      >
        <planeGeometry args={[120, 60, 48, 24]} />
        <primitive attach="material" object={materials.polishedConcrete} />
      </mesh>

      <ScuffDecals materials={materials} />

      <FloorStrips
        name="ExpansionJoints"
        items={expansionJoints}
        material={floorOverlayMaterials.darkEpoxy}
        renderOrder={1}
      />
      <FloorStrips
        name="YellowCirculationLines"
        items={yellowMarks}
        lift={0.001}
        material={floorOverlayMaterials.lineYellow}
        renderOrder={4}
      />
      <FloorStrips
        name="FutureStationLines"
        items={darkMarks}
        lift={0.0006}
        material={floorOverlayMaterials.darkEpoxy}
        renderOrder={3}
      />
      <FloorStrips
        name="WhiteSafetyLines"
        items={whiteMarks}
        lift={0.001}
        material={floorOverlayMaterials.lineWhite}
        renderOrder={5}
      />
      <FloorStrips
        name="ModuleSlotLedPerimeter"
        items={ledMarks}
        lift={0.0015}
        material={floorOverlayMaterials.led}
        renderOrder={6}
      />

      {STATIONS.filter((station) => station.id !== "overview").map((station) => {
        const [length, depth] = station.modulePose.footprint;
        const [clearanceX, clearanceZ] = station.modulePose.clearance;
        const active = station.id === activeStationId;
        return (
          <Text
            key={station.id}
            name={`PaintedStationNumber_${station.step}`}
            position={[
              station.modulePose.position[0] - length / 2 - clearanceX + 0.85,
              0.004,
              station.modulePose.position[2] - depth / 2 - clearanceZ + 0.72,
            ]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.72}
            letterSpacing={0.08}
            anchorX="left"
            anchorY="middle"
            color={active ? "#d7ad55" : "#d7d3c9"}
            material-depthWrite={false}
            material-polygonOffset
            material-polygonOffsetFactor={-2}
            material-polygonOffsetUnits={-2}
          >
            {station.step}
          </Text>
        );
      })}

      {[
        { label: "MONTACARGAS", position: [-53, 0.006, -18.2] as Vec3, color: "#d2a747" },
        { label: "RUTA AGV / MODULO", position: [-53, 0.006, -3.15] as Vec3, color: "#d2a747" },
        { label: "SENDERO PEATONAL", position: [-53, 0.006, 0] as Vec3, color: "#e9e4d8" },
      ].map((mark) => (
        <Text
          key={mark.label}
          position={mark.position}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.5}
          letterSpacing={0.11}
          anchorX="left"
          anchorY="middle"
          color={mark.color}
          material-depthWrite={false}
          material-polygonOffset
          material-polygonOffsetFactor={-2}
          material-polygonOffsetUnits={-2}
        >
          {mark.label}
        </Text>
      ))}

    </group>
  );
}
