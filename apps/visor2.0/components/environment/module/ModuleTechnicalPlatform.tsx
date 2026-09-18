"use client";

import { useEffect, useMemo } from "react";
import { MeshStandardMaterial } from "three";
import type { StationId } from "../utils/sceneTypes";

type ModuleTechnicalPlatformProps = {
  activeStationId: StationId;
  moduleDimensions: { length: number; width: number; height: number };
};

export function ModuleTechnicalPlatform({
  activeStationId,
  moduleDimensions,
}: ModuleTechnicalPlatformProps) {
  const platformLength = moduleDimensions.length + 2.75;
  const platformWidth = moduleDimensions.width + 1.4;
  const gridXSteps = Math.max(2, Math.floor((platformLength - 1.4) / 2));
  const gridZSteps = Math.max(2, Math.floor((platformWidth - 0.8) / 1.2));
  const gridX = Array.from({ length: gridXSteps * 2 + 1 }, (_, index) => index - gridXSteps);
  const gridZ = Array.from(
    { length: gridZSteps * 2 + 1 },
    (_, index) => (index - gridZSteps) * 0.6
  );
  const cornerX = platformLength / 2 - 0.16;
  const cornerZ = platformWidth / 2 - 0.08;
  const corners: Array<[number, number]> = [
    [-cornerX, -cornerZ],
    [-cornerX, cornerZ],
    [cornerX, -cornerZ],
    [cornerX, cornerZ],
  ];
  const materials = useMemo(
    () => ({
      base: new MeshStandardMaterial({
        color: 0x171a1b,
        roughness: 0.72,
        metalness: 0.3,
      }),
      line: new MeshStandardMaterial({
        color: 0x687078,
        roughness: 0.62,
        metalness: 0.45,
        transparent: true,
        opacity: 0.38,
      }),
      accent: new MeshStandardMaterial({
        color: 0xc89b3c,
        emissive: 0x6d4a16,
        emissiveIntensity: 0.5,
        roughness: 0.55,
        metalness: 0.34,
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

  if (activeStationId !== "overview") return null;

  return (
    <group name="ModuleTechnicalPlatform" position={[0, 0.01, 0]}>
      <mesh material={materials.base} position={[0, 0.035, 0]} receiveShadow>
        <boxGeometry args={[platformLength, 0.07, platformWidth]} />
      </mesh>

      {gridX.map((x) => (
        <mesh key={`grid-x-${x}`} material={materials.line} position={[x, 0.076, 0]}>
          <boxGeometry args={[0.012, 0.008, platformWidth - 0.46]} />
        </mesh>
      ))}
      {gridZ.map((z) => (
        <mesh key={`grid-z-${z}`} material={materials.line} position={[0, 0.077, z]}>
          <boxGeometry args={[platformLength - 0.48, 0.008, 0.012]} />
        </mesh>
      ))}

      <mesh material={materials.accent} position={[0, 0.08, platformWidth / 2 - 0.18]}>
        <boxGeometry args={[Math.min(4.8, moduleDimensions.length * 0.4), 0.016, 0.028]} />
      </mesh>
      <mesh material={materials.line} position={[0, 0.08, -(platformWidth / 2 - 0.18)]}>
        <boxGeometry args={[Math.max(3.6, platformLength - 3.1), 0.012, 0.02]} />
      </mesh>

      {corners.map(([x, z], index) => (
        <group key={`locator-${index}`} position={[x, 0.09, z]} rotation={[0, index > 1 ? Math.PI : 0, 0]}>
          <mesh material={materials.accent} position={[0.14, 0, 0]}>
            <boxGeometry args={[0.28, 0.025, 0.035]} />
          </mesh>
          <mesh material={materials.accent} position={[0, 0, 0.14]}>
            <boxGeometry args={[0.035, 0.025, 0.28]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
