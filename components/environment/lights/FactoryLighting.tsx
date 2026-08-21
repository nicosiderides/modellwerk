"use client";

import { useMemo } from "react";
import { Environment } from "@react-three/drei";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import type { FactoryMaterialSet } from "../materials/useFactoryMaterials";
import { assetPath } from "../utils/assetPath";
import { InstancedBoxes, type BoxInstance } from "../utils/InstancedBoxes";
import type { RenderQuality, StationId } from "../utils/sceneTypes";
import { getStationConfig } from "../stations/stationsConfig";

type FactoryLightingProps = {
  activeStationId: StationId;
  guidedMode: boolean;
  materials: FactoryMaterialSet;
  quality: RenderQuality;
};

type FactoryLightingMaterialsProps = {
  materials: FactoryMaterialSet;
};

const SKYLIGHT_STRIPS = [
  { z: -5.4, width: 112, depth: 3.2, intensity: 1.08 },
  { z: 0, width: 112, depth: 4, intensity: 0.96 },
  { z: 5.4, width: 112, depth: 3.2, intensity: 1.02 },
] as const;

function createPendantFixtures(): BoxInstance[] {
  const fixtures: BoxInstance[] = [];
  for (let x = -50; x <= 50; x += 12.5) {
    [-18, -9, 9, 18].forEach((z) => {
      fixtures.push({ position: [x, 10.45, z], scale: [2.5, 0.14, 1.05] });
    });
  }
  return fixtures;
}

function createCableTrays(): BoxInstance[] {
  return [
    { position: [0, 10.9, -20.6], scale: [116, 0.12, 0.42] },
    { position: [0, 10.9, 20.6], scale: [116, 0.12, 0.42] },
    { position: [0, 10.72, -20.6], scale: [116, 0.07, 0.08] },
    { position: [0, 10.72, 20.6], scale: [116, 0.07, 0.08] },
    { position: [-28, 10.45, 0], scale: [0.34, 0.1, 51] },
    { position: [28, 10.45, 0], scale: [0.34, 0.1, 51] },
  ];
}

function createPendantCords(): BoxInstance[] {
  const cords: BoxInstance[] = [];
  for (let x = -50; x <= 50; x += 12.5) {
    [-18, -9, 9, 18].forEach((z) => {
      cords.push({ position: [x, 11.62, z], scale: [0.035, 2.28, 0.035] });
    });
  }
  return cords;
}

function PendantLights({ materials }: FactoryLightingMaterialsProps) {
  const fixtures = useMemo(createPendantFixtures, []);
  const cords = useMemo(createPendantCords, []);
  const trays = useMemo(createCableTrays, []);
  const lightPositions = useMemo(
    () => [
      [-44, 10, -16],
      [-18, 10, -17],
      [18, 10, -17],
      [44, 10, -16],
      [-44, 10, 16],
      [-18, 10, 17],
      [18, 10, 17],
      [44, 10, 16],
    ],
    []
  );

  return (
    <group name="IndustrialPendantLighting">
      <InstancedBoxes items={fixtures} material={materials.warmLuminaire} castShadow={false} receiveShadow={false} />
      <InstancedBoxes items={cords} material={materials.graphiteSteel} castShadow={false} receiveShadow={false} />
      <InstancedBoxes items={trays} material={materials.graphiteSteel} />
      {lightPositions.map((position, index) => (
        <pointLight
          key={index}
          position={position as [number, number, number]}
          color="#fff2df"
          intensity={0.42}
          distance={17}
          decay={2}
          castShadow={false}
        />
      ))}
    </group>
  );
}

function VolumetricSkylightApproximation({ materials }: FactoryLightingMaterialsProps) {
  return (
    <group name="SubtleVolumetricSkylightApproximation">
      {[-38, 0, 38].map((x) =>
        SKYLIGHT_STRIPS.map((strip) => (
          <mesh
            key={`${x}_${strip.z}`}
            material={materials.volumetric}
            position={[x, 8.4, strip.z]}
            rotation={[0, 0, Math.PI / 2]}
            scale={[8.2, 0.72, 13.5]}
            castShadow={false}
            receiveShadow={false}
            renderOrder={2}
          >
            <planeGeometry args={[1, 1, 1, 1]} />
          </mesh>
        ))
      )}
    </group>
  );
}

export function FactoryLighting({ activeStationId, guidedMode, materials, quality }: FactoryLightingProps) {
  useMemo(() => RectAreaLightUniformsLib.init(), []);
  const activeStation = getStationConfig(activeStationId);
  const [stationX, , stationZ] = activeStation.modulePose.position;
  const showStationFocus = guidedMode && activeStationId !== "overview" && activeStationId !== "review";
  const performance = quality === "performance";
  const ultra = quality === "ultra";
  const heroWidth = showStationFocus ? 13 : 19;
  const heroDepth = showStationFocus ? 7 : 10;

  return (
    <>
      <Environment files={assetPath("/hdr/factory_yard_2k.hdr")} background={false} environmentIntensity={performance ? 0.34 : 0.41} />
      <ambientLight color="#f8f5ee" intensity={performance ? 0.095 : 0.065} />
      <hemisphereLight args={["#f9f4ea", "#8f887b", performance ? 0.2 : 0.16]} />
      <directionalLight
        name="LargeSkylightSun"
        position={[30, 30, -17]}
        intensity={performance ? 1.18 : 1.46}
        color="#fff7eb"
        castShadow={!performance}
        shadow-mapSize={ultra ? [2048, 2048] : [1024, 1024]}
        shadow-bias={-0.000035}
        shadow-normalBias={0.055}
        shadow-camera-near={8}
        shadow-camera-far={92}
        shadow-camera-left={-64}
        shadow-camera-right={64}
        shadow-camera-top={42}
        shadow-camera-bottom={-42}
      />
      {SKYLIGHT_STRIPS.map((strip) => (
        <rectAreaLight
          key={strip.z}
          position={[0, 13.82, strip.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          width={strip.width}
          height={strip.depth}
          intensity={strip.intensity * (performance ? 0.72 : 0.9)}
          color="#f7fbff"
        />
      ))}
      <rectAreaLight position={[0, 7.2, -27.4]} rotation={[0, 0, 0]} width={54} height={7} intensity={0.28} color="#fff0d6" />
      <rectAreaLight
        position={[stationX, 7.85, stationZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        width={heroWidth}
        height={heroDepth}
        intensity={performance ? 0.58 : 0.92}
        color="#ffe4b2"
      />
      <pointLight
        position={[stationX - 4.8, 4.2, stationZ + 4.4]}
        color="#f7c568"
        intensity={performance ? 0.28 : 0.42}
        distance={18}
        decay={2}
        castShadow={false}
      />
      <pointLight
        position={[stationX + 5.4, 3.4, stationZ - 4.8]}
        color="#dbeaf0"
        intensity={performance ? 0.12 : 0.22}
        distance={16}
        decay={2}
        castShadow={false}
      />
      <PendantLights materials={materials} />
      <VolumetricSkylightApproximation materials={materials} />
    </>
  );
}
