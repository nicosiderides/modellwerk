"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Material, PointLight } from "three";
import type { FactoryMaterialSet } from "../materials/useFactoryMaterials";
import { BeamBetween } from "../utils/BeamBetween";
import { InstancedBoxes, type BoxInstance } from "../utils/InstancedBoxes";
import type { EulerTuple, StationId, Vec3 } from "../utils/sceneTypes";

type FactoryPropsProps = {
  materials: FactoryMaterialSet;
  activeStationId?: StationId;
};

type MeshBoxProps = {
  material: Material;
  position: Vec3;
  scale: Vec3;
  rotation?: EulerTuple;
  name?: string;
  castShadow?: boolean;
  receiveShadow?: boolean;
};

function MeshBox({
  material,
  position,
  scale,
  rotation = [0, 0, 0],
  name,
  castShadow = true,
  receiveShadow = true,
}: MeshBoxProps) {
  return (
    <mesh
      name={name}
      material={material}
      position={position}
      rotation={rotation}
      scale={scale}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
}

function Wheel({ material, position }: { material: Material; position: Vec3 }) {
  return (
    <mesh material={material} position={position} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[0.34, 0.34, 0.22, 24]} />
    </mesh>
  );
}

function Pallet({ materials, position, rotation = 0 }: FactoryPropsProps & { position: Vec3; rotation?: number }) {
  const slats = useMemo<BoxInstance[]>(
    () => [
      { position: [-0.52, 0.1, 0], scale: [0.12, 0.18, 1.08] },
      { position: [0, 0.1, 0], scale: [0.12, 0.18, 1.08] },
      { position: [0.52, 0.1, 0], scale: [0.12, 0.18, 1.08] },
      { position: [0, 0.24, -0.42], scale: [1.35, 0.08, 0.14] },
      { position: [0, 0.24, 0], scale: [1.35, 0.08, 0.14] },
      { position: [0, 0.24, 0.42], scale: [1.35, 0.08, 0.14] },
    ],
    []
  );

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <InstancedBoxes items={slats} material={materials.birchPlywood} />
    </group>
  );
}

function PanelStack({
  materials,
  position,
  rotation = 0,
  material,
  count = 8,
  size = [4.8, 0.11, 1.35],
}: FactoryPropsProps & {
  position: Vec3;
  rotation?: number;
  material: Material;
  count?: number;
  size?: Vec3;
}) {
  const panels = useMemo<BoxInstance[]>(
    () =>
      Array.from({ length: count }, (_, index) => ({
        position: [0, 0.38 + index * (size[1] + 0.035), 0] as Vec3,
        scale: size,
      })),
    [count, size]
  );

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <Pallet materials={materials} position={[0, 0, 0]} />
      <InstancedBoxes items={panels} material={material} />
    </group>
  );
}

function Forklift({
  materials,
  position,
  rotation = 0,
}: FactoryPropsProps & { position: Vec3; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]} name="ElectricForklift">
      <MeshBox material={materials.craneYellow} position={[0, 0.55, 0]} scale={[1.45, 0.78, 1.25]} />
      <MeshBox material={materials.graphiteSteel} position={[-0.52, 1.18, 0]} scale={[0.82, 0.9, 1.05]} />
      <MeshBox material={materials.graphiteSteel} position={[0.92, 1.08, 0]} scale={[0.14, 1.8, 1.02]} />
      <MeshBox material={materials.graphiteSteel} position={[1.24, 0.72, -0.32]} scale={[1.9, 0.08, 0.1]} />
      <MeshBox material={materials.graphiteSteel} position={[1.24, 0.72, 0.32]} scale={[1.9, 0.08, 0.1]} />
      <MeshBox material={materials.glassDark} position={[-0.52, 1.46, -0.54]} scale={[0.56, 0.58, 0.04]} castShadow={false} />
      <Wheel material={materials.rubber} position={[-0.46, 0.32, -0.66]} />
      <Wheel material={materials.rubber} position={[-0.46, 0.32, 0.66]} />
      <Wheel material={materials.rubber} position={[0.58, 0.3, -0.66]} />
      <Wheel material={materials.rubber} position={[0.58, 0.3, 0.66]} />
    </group>
  );
}

function RoboticArm({
  materials,
  position,
  rotation = 0,
}: FactoryPropsProps & { position: Vec3; rotation?: number }) {
  const joints: Vec3[] = [
    [0, 0.72, 0],
    [0.08, 1.34, 0],
    [0.72, 2.05, 0.04],
    [1.48, 1.92, 0.08],
    [1.92, 1.3, 0.06],
    [2.18, 1.08, 0.03],
  ];

  return (
    <group position={position} rotation={[0, rotation, 0]} name="RoboticWeldingArm">
      <mesh material={materials.graphiteSteel} position={[0, 0.12, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.58, 0.68, 0.24, 28]} />
      </mesh>
      <mesh material={materials.craneYellow} position={[0, 0.43, 0]} castShadow>
        <cylinderGeometry args={[0.36, 0.43, 0.55, 24]} />
      </mesh>
      {joints.slice(0, -1).map((joint, index) => (
        <BeamBetween
          key={`arm-link-${index}`}
          from={joint}
          to={joints[index + 1]}
          radius={index < 2 ? 0.21 : index < 4 ? 0.16 : 0.095}
          radialSegments={18}
          material={materials.craneYellow}
        />
      ))}
      {joints.slice(0, -1).map((joint, index) => (
        <mesh key={`arm-joint-${index}`} material={materials.graphiteSteel} position={joint} castShadow>
          <sphereGeometry args={[index < 2 ? 0.27 : 0.2, 20, 14]} />
        </mesh>
      ))}
      <MeshBox material={materials.graphiteSteel} position={[2.2, 1.04, 0.03]} scale={[0.36, 0.16, 0.14]} rotation={[0, 0, -0.62]} />
      <BeamBetween from={[0.05, 1.49, 0.22]} to={[1.55, 2.08, 0.24]} radius={0.025} radialSegments={8} material={materials.rubber} />
      <BeamBetween from={[1.55, 2.08, 0.24]} to={[2.17, 1.16, 0.16]} radius={0.025} radialSegments={8} material={materials.rubber} />
    </group>
  );
}

function WeldingArc({ position }: { position: Vec3 }) {
  const sparks = useRef<Group>(null);
  const light = useRef<PointLight>(null);

  useFrame(({ clock }) => {
    const phase = clock.elapsedTime * 7.5;
    if (light.current) light.current.intensity = 1.3 + Math.sin(phase * 3.7) * 0.8;
    sparks.current?.children.forEach((spark, index) => {
      const age = (phase * 0.18 + index * 0.137) % 1;
      const angle = index * 2.399;
      spark.position.set(
        Math.cos(angle) * age * 0.42,
        0.04 - age * age * 0.5,
        Math.sin(angle) * age * 0.42
      );
      spark.scale.setScalar(1 - age * 0.72);
    });
  });

  return (
    <group position={position} name="ActiveWeldingArc">
      <pointLight ref={light} color="#80d9ff" intensity={1.5} distance={5.5} decay={2} />
      <mesh>
        <sphereGeometry args={[0.055, 12, 8]} />
        <meshBasicMaterial color="#dff8ff" toneMapped={false} />
      </mesh>
      <group ref={sparks}>
        {Array.from({ length: 14 }, (_, index) => (
          <mesh key={index}>
            <sphereGeometry args={[0.014, 6, 4]} />
            <meshBasicMaterial color={index % 3 ? "#ffbf50" : "#e8f8ff"} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function GasCylinder({
  materials,
  position,
  color,
}: FactoryPropsProps & { position: Vec3; color: "red" | "yellow" }) {
  const shell = color === "red" ? materials.fireRed : materials.craneYellow;
  return (
    <group position={position} name="ShieldingGasCylinder">
      <mesh material={shell} position={[0, 0.54, 0]} castShadow>
        <cylinderGeometry args={[0.17, 0.19, 0.9, 18]} />
      </mesh>
      <mesh material={shell} position={[0, 1, 0]} castShadow>
        <sphereGeometry args={[0.17, 18, 10]} />
      </mesh>
      <MeshBox material={materials.graphiteSteel} position={[0, 1.16, 0]} scale={[0.14, 0.16, 0.14]} />
    </group>
  );
}

function SteelFrameAssembly({ materials, activeStationId }: FactoryPropsProps) {
  const profiles = useMemo<BoxInstance[]>(
    () => [
      { position: [-46, 0.52, -17.8], scale: [12.2, 0.14, 0.14] },
      { position: [-46, 0.79, -17.45], scale: [11.8, 0.14, 0.14] },
      { position: [-46, 1.06, -17.1], scale: [10.9, 0.14, 0.14] },
      { position: [-52.5, 0.58, -20.9], scale: [8.4, 0.12, 0.12], rotation: [0, 0.04, 0] },
      { position: [-39.5, 0.58, -20.9], scale: [8.4, 0.12, 0.12], rotation: [0, -0.04, 0] },
    ],
    []
  );
  const fixtureTable = useMemo<BoxInstance[]>(
    () => [
      { position: [-46, 0.72, -14.55], scale: [14.6, 0.18, 5.5] },
      { position: [-52.45, 0.35, -16.85], scale: [0.18, 0.72, 0.18] },
      { position: [-39.55, 0.35, -16.85], scale: [0.18, 0.72, 0.18] },
      { position: [-52.45, 0.35, -12.25], scale: [0.18, 0.72, 0.18] },
      { position: [-39.55, 0.35, -12.25], scale: [0.18, 0.72, 0.18] },
      { position: [-46, 0.84, -14.55], scale: [14.15, 0.05, 5.05] },
    ],
    []
  );
  const safetyCell = useMemo<BoxInstance[]>(
    () => {
      const items: BoxInstance[] = [];
      for (let x = -56; x <= -36; x += 2.5) {
        items.push({ position: [x, 1.3, -22.8], scale: [0.075, 2.6, 0.075] });
      }
      for (let z = -22.8; z <= -11.8; z += 2.2) {
        items.push(
          { position: [-56.2, 1.3, z], scale: [0.075, 2.6, 0.075] },
          { position: [-35.8, 1.3, z], scale: [0.075, 2.6, 0.075] }
        );
      }
      items.push(
        { position: [-46, 0.12, -22.8], scale: [20.4, 0.11, 0.11] },
        { position: [-46, 2.55, -22.8], scale: [20.4, 0.12, 0.12] },
        { position: [-56.2, 0.12, -17.3], scale: [0.11, 0.11, 11.2] },
        { position: [-35.8, 0.12, -17.3], scale: [0.11, 0.11, 11.2] },
        { position: [-56.2, 2.55, -17.35], scale: [0.12, 0.12, 11.0] },
        { position: [-35.8, 2.55, -17.35], scale: [0.12, 0.12, 11.0] }
      );
      return items;
    },
    []
  );
  const galvanizedStock = useMemo<BoxInstance[]>(
    () =>
      Array.from({ length: 18 }, (_, index) => ({
        position: [
          -50.1,
          0.23 + Math.floor(index / 6) * 0.19,
          -19.65 + (index % 6) * 0.16,
        ] as Vec3,
        scale: [6.2, 0.12, 0.12] as Vec3,
      })),
    []
  );
  const blackSteelStock = useMemo<BoxInstance[]>(
    () =>
      Array.from({ length: 18 }, (_, index) => ({
        position: [
          -41.9,
          0.23 + Math.floor(index / 6) * 0.19,
          -19.65 + (index % 6) * 0.16,
        ] as Vec3,
        scale: [6.2, 0.12, 0.12] as Vec3,
      })),
    []
  );
  const stockCradles = useMemo<BoxInstance[]>(
    () => [
      { position: [-52.5, 0.1, -19.25], scale: [0.18, 0.2, 1.35] },
      { position: [-47.7, 0.1, -19.25], scale: [0.18, 0.2, 1.35] },
      { position: [-44.3, 0.1, -19.25], scale: [0.18, 0.2, 1.35] },
      { position: [-39.5, 0.1, -19.25], scale: [0.18, 0.2, 1.35] },
    ],
    []
  );

  return (
    <group name="SteelFrameAssembly">
      <InstancedBoxes items={fixtureTable} material={materials.graphiteSteel} />
      <InstancedBoxes items={profiles} material={materials.galvanizedSteel} />
      <InstancedBoxes items={safetyCell} material={materials.safetyYellow} />
      <InstancedBoxes items={stockCradles} material={materials.graphiteSteel} />
      <InstancedBoxes items={galvanizedStock} material={materials.galvanizedSteel} />
      <InstancedBoxes items={blackSteelStock} material={materials.graphiteSteel} />
      <RoboticArm materials={materials} position={[-53.4, 0, -13.2]} rotation={-0.28} />
      <RoboticArm materials={materials} position={[-38.6, 0, -16.1]} rotation={Math.PI * 0.88} />
      {activeStationId === "structure" && (
        <>
          <WeldingArc position={[-51.15, 1.03, -13.83]} />
          <WeldingArc position={[-40.6, 1.03, -15.45]} />
        </>
      )}
      <group position={[-54.3, 0, -18.8]}>
        <GasCylinder materials={materials} position={[0, 0, 0]} color="red" />
        <GasCylinder materials={materials} position={[0.48, 0, 0]} color="yellow" />
        <MeshBox material={materials.graphiteSteel} position={[0.24, 0.55, 0.2]} scale={[0.78, 1.2, 0.08]} />
      </group>
      <MeshBox material={materials.graphiteSteel} position={[-34.75, 1.05, -17.4]} scale={[0.9, 1.65, 0.72]} />
      <MeshBox material={materials.screen} position={[-34.7, 1.35, -17.02]} scale={[0.62, 0.48, 0.035]} castShadow={false} />
    </group>
  );
}

function FloorPackagePreparation({ materials }: FactoryPropsProps) {
  const benches = useMemo<BoxInstance[]>(
    () => [
      { position: [-4.2, 0.48, -14.1], scale: [6.4, 0.18, 2.3] },
      { position: [-6.9, 0.23, -15.05], scale: [0.18, 0.48, 0.18] },
      { position: [-1.5, 0.23, -15.05], scale: [0.18, 0.48, 0.18] },
      { position: [-6.9, 0.23, -13.15], scale: [0.18, 0.48, 0.18] },
      { position: [-1.5, 0.23, -13.15], scale: [0.18, 0.48, 0.18] },
      { position: [-10.2, 0.82, -13.8], scale: [2.4, 1.45, 0.18] },
    ],
    []
  );

  return (
    <group name="FloorPackagePreparation">
      <InstancedBoxes items={benches} material={materials.graphiteSteel} />
      <PanelStack
        materials={materials}
        position={[0.4, 0, -14.15]}
        material={materials.birchPlywood}
        rotation={-0.04}
        count={14}
        size={[3.2, 0.075, 1.22]}
      />
      <PanelStack
        materials={materials}
        position={[-9.2, 0, -10.9]}
        material={materials.sipPanel}
        rotation={Math.PI / 2}
        count={7}
        size={[2.25, 0.09, 1.05]}
      />
      <MeshBox material={materials.craneYellow} position={[-10.08, 1.22, -13.67]} scale={[1.7, 0.1, 0.08]} />
    </group>
  );
}

function PanelFabrication({ materials }: FactoryPropsProps) {
  const benches = useMemo<BoxInstance[]>(
    () => [
      { position: [20, 0.58, -22.8], scale: [8.5, 0.28, 2.2] },
      { position: [29, 0.58, -22.2], scale: [8.5, 0.28, 2.2] },
      { position: [22, 1.02, -19.4], scale: [6.2, 0.14, 0.18] },
      { position: [27.5, 1.02, -25.4], scale: [6.2, 0.14, 0.18] },
    ],
    []
  );

  return (
    <group name="WallPanelFabrication">
      <InstancedBoxes items={benches} material={materials.graphiteSteel} />
      <PanelStack materials={materials} position={[19, 0, -18.2]} material={materials.sipPanel} rotation={0.05} />
      <PanelStack materials={materials} position={[29.5, 0, -18.4]} material={materials.osb} rotation={-0.04} count={7} />
      <PanelStack materials={materials} position={[35.5, 0, -24.4]} material={materials.clt} rotation={Math.PI / 2} count={6} />
      <MeshBox material={materials.graphiteSteel} position={[14.2, 1.45, -14.2]} scale={[0.18, 2.7, 4.2]} />
      <MeshBox material={materials.sipPanel} position={[14.45, 1.5, -14.2]} scale={[0.11, 2.45, 3.65]} rotation={[0, 0.04, 0]} />
      <MeshBox material={materials.graphiteSteel} position={[18.1, 0.72, -13.65]} scale={[3.2, 1.25, 0.16]} />
    </group>
  );
}

function RoofPackagePreparation({ materials }: FactoryPropsProps) {
  const roofTable = useMemo<BoxInstance[]>(
    () => [
      { position: [34.2, 0.58, -14.25], scale: [7.4, 0.24, 2.4] },
      { position: [31.05, 0.28, -15.15], scale: [0.18, 0.58, 0.18] },
      { position: [37.35, 0.28, -15.15], scale: [0.18, 0.58, 0.18] },
      { position: [31.05, 0.28, -13.35], scale: [0.18, 0.58, 0.18] },
      { position: [37.35, 0.28, -13.35], scale: [0.18, 0.58, 0.18] },
      { position: [29.3, 1.05, -13.7], scale: [0.16, 1.9, 3.7] },
    ],
    []
  );

  return (
    <group name="RoofPackagePreparation">
      <InstancedBoxes items={roofTable} material={materials.graphiteSteel} />
      <PanelStack
        materials={materials}
        position={[40.2, 0, -14.1]}
        material={materials.aluminum}
        rotation={0.04}
        count={7}
        size={[3.4, 0.08, 1.18]}
      />
      <PanelStack
        materials={materials}
        position={[29.55, 0, -18.2]}
        material={materials.sipPanel}
        rotation={Math.PI / 2}
        count={6}
        size={[2.8, 0.1, 1.12]}
      />
    </group>
  );
}

function GlazingStation({ materials }: FactoryPropsProps) {
  const glassPanes = useMemo<BoxInstance[]>(
    () =>
      Array.from({ length: 7 }, (_, index) => ({
        position: [0, 1.45 + index * 0.02, -0.78 + index * 0.25] as Vec3,
        scale: [0.08, 2.7, 3.2],
        rotation: [0, 0.16, 0] as EulerTuple,
      })),
    []
  );

  return (
    <group name="WindowInstallation" position={[45.2, 0, -17.5]} rotation={[0, -0.1, 0]}>
      <MeshBox material={materials.graphiteSteel} position={[0, 1.35, 0]} scale={[0.18, 2.6, 4.4]} />
      <InstancedBoxes items={glassPanes} material={materials.glassDark} castShadow={false} receiveShadow={false} />
    </group>
  );
}

function Warehouse({ materials }: FactoryPropsProps) {
  const racks = useMemo<BoxInstance[]>(
    () => {
      const items: BoxInstance[] = [];
      for (let x = 38; x <= 54; x += 5.2) {
        for (let z = 14; z <= 25; z += 5.4) {
          items.push({ position: [x, 1.1, z], scale: [0.18, 2.2, 4.8] });
          items.push({ position: [x + 2.8, 1.1, z], scale: [0.18, 2.2, 4.8] });
          items.push({ position: [x + 1.4, 0.72, z], scale: [3.1, 0.12, 4.8] });
          items.push({ position: [x + 1.4, 1.55, z], scale: [3.1, 0.12, 4.8] });
          items.push({ position: [x + 1.4, 2.35, z], scale: [3.1, 0.12, 4.8] });
        }
      }
      return items;
    },
    []
  );

  return (
    <group name="MaterialWarehouse">
      <InstancedBoxes items={racks} material={materials.graphiteSteel} />
      <PanelStack materials={materials} position={[39, 0, 16]} material={materials.osb} rotation={0.1} count={8} />
      <PanelStack materials={materials} position={[51, 0, 22]} material={materials.clt} rotation={-0.05} count={10} />
      <Forklift materials={materials} position={[52.6, 0, 6.9]} rotation={Math.PI * 0.95} />
    </group>
  );
}

function BathroomPreparation({ materials }: FactoryPropsProps) {
  return (
    <group name="BathroomModulePreparation" position={[24.3, 0, 21.2]} rotation={[0, -0.08, 0]}>
      <Pallet materials={materials} position={[-4.5, 0, 0]} rotation={0.1} />
      <MeshBox material={materials.wallWhite} position={[-4.5, 0.68, 0]} scale={[2.2, 0.16, 3.4]} />
      <MeshBox material={materials.glass} position={[-5.42, 1.75, -0.4]} scale={[0.08, 2.2, 1.5]} castShadow={false} />
      <mesh material={materials.wallWhite} position={[-3.8, 0.55, 0.8]} castShadow>
        <cylinderGeometry args={[0.32, 0.24, 0.46, 24]} />
      </mesh>
      <mesh material={materials.wallWhite} position={[-3.8, 0.98, 0.8]} castShadow>
        <sphereGeometry args={[0.32, 20, 12]} />
      </mesh>
      <MeshBox material={materials.wallWhite} position={[1.0, 0.85, 0.2]} scale={[2.4, 1.2, 1.2]} />
      <MeshBox material={materials.glass} position={[1, 1.55, -0.48]} scale={[2.2, 1.45, 0.04]} castShadow={false} />
      <PanelStack materials={materials} position={[4.8, 0, 1.6]} material={materials.sipPanel} count={5} size={[2.7, 0.1, 1.1]} />
    </group>
  );
}

function FurnitureStaging({ materials }: FactoryPropsProps) {
  const furniture = useMemo<BoxInstance[]>(
    () => [
      { position: [1, 0.45, 23], scale: [2.3, 0.16, 0.9] },
      { position: [1, 0.82, 22.65], scale: [2.2, 0.12, 0.14] },
      { position: [4.4, 0.55, 22.5], scale: [1.1, 0.14, 1.1] },
      { position: [6.2, 0.55, 22.5], scale: [1.1, 0.14, 1.1] },
      { position: [5.3, 1.05, 22.5], scale: [2.2, 0.18, 0.12] },
      { position: [8.8, 0.7, 24.2], scale: [2.6, 1.2, 0.38] },
    ],
    []
  );

  return (
    <group name="FurnitureStaging">
      <InstancedBoxes items={furniture} material={materials.birchPlywood} />
      <PanelStack materials={materials} position={[-1.4, 0, 20.6]} material={materials.birchPlywood} rotation={0.05} count={5} size={[3.1, 0.11, 1.0]} />
    </group>
  );
}

function CncArea({ materials }: FactoryPropsProps) {
  return (
    <group name="CncArea" position={[-50, 0, 15]} rotation={[0, 0.08, 0]}>
      <MeshBox material={materials.wallWhite} position={[0, 0.85, 0]} scale={[7.4, 1.55, 2.6]} />
      <MeshBox material={materials.graphiteSteel} position={[0, 1.52, -0.02]} scale={[6.9, 0.18, 2.2]} />
      <MeshBox material={materials.screen} position={[-4.1, 1.45, -1.45]} scale={[0.08, 0.62, 0.86]} castShadow={false} />
      <PanelStack materials={materials} position={[0, 0, 4.5]} material={materials.clt} rotation={0.12} count={10} />
    </group>
  );
}

function DigitalEngineeringZone({ materials }: FactoryPropsProps) {
  return (
    <group name="DigitalEngineeringZone" position={[-31, 0, 20]} rotation={[0, 0.16, 0]}>
      <MeshBox material={materials.graphiteSteel} position={[0, 0.7, 0]} scale={[4.6, 1.1, 2.0]} />
      <MeshBox material={materials.screen} position={[0, 1.28, -0.1]} scale={[4.25, 0.05, 1.65]} castShadow={false} />
      <MeshBox material={materials.screen} position={[-2.8, 1.7, -0.82]} scale={[1.05, 0.06, 0.68]} rotation={[0.22, 0, 0]} castShadow={false} />
      <MeshBox material={materials.screen} position={[2.8, 1.7, -0.82]} scale={[1.05, 0.06, 0.68]} rotation={[0.22, 0, 0]} castShadow={false} />
    </group>
  );
}

function PackagingAndLoading({ materials }: FactoryPropsProps) {
  const crates = useMemo<BoxInstance[]>(
    () => [
      { position: [24, 0.55, -1.8], scale: [3.4, 0.7, 1.4] },
      { position: [28, 0.55, -1.8], scale: [3.4, 0.7, 1.4] },
      { position: [31.8, 0.55, 2.8], scale: [3.0, 0.7, 1.4] },
      { position: [46, 0.6, -3], scale: [5.8, 0.78, 2.2] },
      { position: [52, 0.6, -2.8], scale: [5.8, 0.78, 2.2] },
      { position: [46, 1.45, 3.6], scale: [6.2, 0.16, 2.8] },
      { position: [52, 1.45, 3.6], scale: [6.2, 0.16, 2.8] },
    ],
    []
  );

  return (
    <group name="PackagingAndLoading">
      <InstancedBoxes items={crates} material={materials.osb} />
      <MeshBox material={materials.graphiteSteel} position={[27.2, 0.8, 5.2]} scale={[7.8, 1.2, 0.22]} />
      <MeshBox material={materials.wallWhite} position={[27.2, 1.55, 5.08]} scale={[7.6, 0.08, 0.08]} />
      <Forklift materials={materials} position={[55.2, 0, 8.4]} rotation={Math.PI * 0.58} />
    </group>
  );
}

function QualityControl({ materials }: FactoryPropsProps) {
  return (
    <group name="QualityControl" position={[-13.2, 0, 23.3]} rotation={[0, -0.06, 0]}>
      <MeshBox material={materials.wallWhite} position={[0, 1.8, 0]} scale={[0.2, 3.6, 5.4]} />
      <MeshBox material={materials.graphiteSteel} position={[0, 3.6, 0]} scale={[5.2, 0.2, 5.4]} />
      <MeshBox material={materials.screen} position={[-2.4, 1.25, -2.45]} scale={[0.08, 0.82, 1.1]} castShadow={false} />
      <PanelStack materials={materials} position={[3.8, 0, 1.6]} material={materials.sipPanel} rotation={Math.PI / 2} count={5} />
    </group>
  );
}

function CantileverStorageRacks({ materials }: FactoryPropsProps) {
  const rackFrames = useMemo<BoxInstance[]>(() => {
    const items: BoxInstance[] = [];
    const bays = [
      { xs: [8, 14, 20], z: -26.2, direction: 1 },
      { xs: [34, 40, 46], z: -26.2, direction: 1 },
      { xs: [-50, -44, -38], z: 26.2, direction: -1 },
      { xs: [-26, -20, -14], z: 26.2, direction: -1 },
    ];

    bays.forEach(({ xs, z, direction }) => {
      xs.forEach((x) => {
        items.push(
          { position: [x, 2.25, z], scale: [0.22, 4.5, 0.24] },
          { position: [x, 0.1, z + direction * 0.75], scale: [0.5, 0.2, 1.75] }
        );
        [1.05, 2.05, 3.05].forEach((y) => {
          items.push({ position: [x, y, z + direction * 0.78], scale: [0.2, 0.14, 1.65] });
        });
      });
      const centerX = (xs[0] + xs[xs.length - 1]) * 0.5;
      items.push(
        { position: [centerX, 4.38, z], scale: [12.3, 0.15, 0.18] },
        { position: [centerX, 0.18, z], scale: [12.3, 0.18, 0.22] }
      );
    });

    return items;
  }, []);
  const storedProfiles = useMemo<BoxInstance[]>(
    () => [
      ...[1.18, 2.18, 3.18].flatMap((y, level) => [
        { position: [14, y, -25.35 + level * 0.08] as Vec3, scale: [11.2, 0.14, 0.16] as Vec3 },
        { position: [40, y, -25.35 + level * 0.08] as Vec3, scale: [11.2, 0.14, 0.16] as Vec3 },
        { position: [-44, y, 25.35 - level * 0.08] as Vec3, scale: [11.2, 0.14, 0.16] as Vec3 },
        { position: [-20, y, 25.35 - level * 0.08] as Vec3, scale: [11.2, 0.14, 0.16] as Vec3 },
      ]),
    ],
    []
  );

  return (
    <group name="CantileverProfileStorage">
      <InstancedBoxes items={rackFrames} material={materials.graphiteSteel} />
      <InstancedBoxes items={storedProfiles} material={materials.galvanizedSteel} />
    </group>
  );
}

function SafetyEquipment({ materials }: FactoryPropsProps) {
  const cabinets = useMemo<BoxInstance[]>(
    () => [
      { position: [-57.8, 1.15, -21], scale: [0.22, 1.8, 0.9] },
      { position: [57.8, 1.15, 16], scale: [0.22, 1.8, 0.9] },
      { position: [18, 1.0, -28.5], scale: [0.9, 1.6, 0.22] },
      { position: [-11, 1.0, 28.5], scale: [0.9, 1.6, 0.22] },
    ],
    []
  );

  return (
    <group name="SafetyEquipment">
      <InstancedBoxes items={cabinets} material={materials.aluminum} />
      {[
        [-58, 0.6, -18],
        [-58, 0.6, 18],
        [58, 0.6, -18],
        [58, 0.6, 18],
      ].map((position, index) => (
        <mesh key={index} material={materials.fireRed} position={position as Vec3} castShadow>
          <cylinderGeometry args={[0.12, 0.14, 0.82, 16]} />
        </mesh>
      ))}
    </group>
  );
}

export function FactoryProps({ materials, activeStationId }: FactoryPropsProps) {
  return (
    <group name="FactoryProductionZones">
      <SteelFrameAssembly materials={materials} activeStationId={activeStationId} />
      <FloorPackagePreparation materials={materials} />
      <PanelFabrication materials={materials} />
      <RoofPackagePreparation materials={materials} />
      <GlazingStation materials={materials} />
      <Warehouse materials={materials} />
      <BathroomPreparation materials={materials} />
      <FurnitureStaging materials={materials} />
      <CncArea materials={materials} />
      <DigitalEngineeringZone materials={materials} />
      <PackagingAndLoading materials={materials} />
      <QualityControl materials={materials} />
      <CantileverStorageRacks materials={materials} />
      <SafetyEquipment materials={materials} />
    </group>
  );
}
