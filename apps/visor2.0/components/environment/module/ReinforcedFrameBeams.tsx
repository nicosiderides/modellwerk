"use client";

import { useEffect, useMemo } from "react";
import { MeshStandardMaterial } from "three";

function getStructureFinish(structureColor: string) {
  if (structureColor === "white") {
    return { color: 0xe4e2dc, roughness: 0.58, metalness: 0.5 };
  }
  if (structureColor === "galvanized") {
    return { color: 0x9fa6a7, roughness: 0.5, metalness: 0.72 };
  }
  return { color: 0x202225, roughness: 0.7, metalness: 0.46 };
}

export function ReinforcedFrameBeams({
  enabled,
  structureColor,
}: {
  enabled: boolean;
  structureColor: string;
}) {
  const material = useMemo(() => {
    const finish = getStructureFinish(structureColor);
    return new MeshStandardMaterial({
      ...finish,
      envMapIntensity: 0.72,
    });
  }, [structureColor]);

  useEffect(() => () => material.dispose(), [material]);

  if (!enabled) return null;

  return (
    <group name="ReinforcedLongitudinalBeams">
      <mesh material={material} position={[0, 0.13, 0]} castShadow>
        <boxGeometry args={[5.82, 0.12, 0.12]} />
      </mesh>
      <mesh material={material} position={[0, 2.69, 0]} castShadow>
        <boxGeometry args={[5.82, 0.12, 0.12]} />
      </mesh>
    </group>
  );
}
