"use client";

import { useEffect, useMemo } from "react";
import { MeshStandardMaterial } from "three";
import type { StationId } from "../utils/sceneTypes";

type MobileAssemblyPlatformProps = {
  activeStationId: StationId;
  moduleDimensions: { length: number; width: number; height: number };
};

export function MobileAssemblyPlatform({
  activeStationId,
  moduleDimensions,
}: MobileAssemblyPlatformProps) {
  const platformLength = Math.max(5.2, moduleDimensions.length + 1.2);
  const platformWidth = Math.max(2.8, moduleDimensions.width + 0.75);
  const wheelX = platformLength / 2 - 0.75;
  const wheelZ = platformWidth / 2 - 0.31;
  const bumperX = platformLength / 2 - 0.12;
  const bumperZ = platformWidth / 2 - 0.13;
  const wheelPositions: Array<[number, number, number]> = [
    [-wheelX, 0, -wheelZ],
    [-wheelX, 0, wheelZ],
    [wheelX, 0, -wheelZ],
    [wheelX, 0, wheelZ],
  ];
  const bumperPositions: Array<[number, number, number]> = [
    [-bumperX, 0.14, -bumperZ],
    [-bumperX, 0.14, bumperZ],
    [bumperX, 0.14, -bumperZ],
    [bumperX, 0.14, bumperZ],
  ];
  const materials = useMemo(
    () => ({
      deck: new MeshStandardMaterial({
        color: 0x202427,
        roughness: 0.48,
        metalness: 0.62,
        envMapIntensity: 0.76,
      }),
      rail: new MeshStandardMaterial({
        color: 0x343a3e,
        roughness: 0.42,
        metalness: 0.7,
        envMapIntensity: 0.82,
      }),
      rubber: new MeshStandardMaterial({
        color: 0x111315,
        roughness: 0.9,
        metalness: 0,
      }),
      safety: new MeshStandardMaterial({
        color: 0xd2a747,
        roughness: 0.48,
        metalness: 0.42,
      }),
      led: new MeshStandardMaterial({
        color: 0xffe4a0,
        emissive: 0xd49c36,
        emissiveIntensity: 1.15,
        roughness: 0.3,
      }),
    }),
    []
  );

  useEffect(
    () => () => {
      Object.values(materials).forEach((material) => material.dispose());
    },
    [materials]
  );

  // The frame is welded directly on the fixed steel table. The transfer cart
  // joins the module only when it leaves that cell for the floor station.
  if (activeStationId === "overview" || activeStationId === "structure") return null;

  return (
    <group name="MobileAssemblyPlatform">
      <mesh material={materials.deck} position={[0, 0.08, 0]} castShadow receiveShadow>
        <boxGeometry args={[platformLength, 0.16, platformWidth]} />
      </mesh>

      {[-1, 1].map((side) => {
        const z = side * (platformWidth / 2 - 0.21);
        return (
          <mesh key={`side-rail-${z}`} material={materials.rail} position={[0, 0.2, z]} castShadow>
            <boxGeometry args={[platformLength - 0.48, 0.16, 0.12]} />
          </mesh>
        );
      })}
      {[-1, 1].map((side) => {
        const x = side * (platformLength / 2 - 0.36);
        return (
          <mesh key={`end-rail-${x}`} material={materials.rail} position={[x, 0.2, 0]} castShadow>
            <boxGeometry args={[0.12, 0.16, platformWidth - 0.56]} />
          </mesh>
        );
      })}

      {wheelPositions.map((position, index) => (
        <group key={`caster-${index}`} position={position}>
          <mesh material={materials.rail} position={[0, 0.02, 0]} castShadow>
            <boxGeometry args={[0.38, 0.2, 0.18]} />
          </mesh>
          <mesh
            material={materials.rubber}
            position={[0, -0.02, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
          >
            <cylinderGeometry args={[0.16, 0.16, 0.18, 18]} />
          </mesh>
          <mesh
            material={materials.rail}
            position={[0, -0.02, 0]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[0.055, 0.055, 0.2, 12]} />
          </mesh>
        </group>
      ))}

      {bumperPositions.map((position, index) => (
        <mesh key={`bumper-${index}`} material={materials.safety} position={position} castShadow>
          <boxGeometry args={[0.22, 0.2, 0.22]} />
        </mesh>
      ))}

      {[-1, 1].map((side) => (
        <mesh
          key={`platform-led-${side}`}
          material={materials.led}
          position={[0, 0.1, side * (platformWidth / 2 + 0.006)]}
          castShadow={false}
        >
          <boxGeometry args={[Math.min(4.8, platformLength * 0.36), 0.035, 0.025]} />
        </mesh>
      ))}
    </group>
  );
}
