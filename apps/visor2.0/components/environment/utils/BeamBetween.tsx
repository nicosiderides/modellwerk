"use client";

import { useMemo } from "react";
import { Material, Quaternion, Vector3 } from "three";
import type { Vec3 } from "./sceneTypes";

const up = new Vector3(0, 1, 0);

type BeamBetweenProps = {
  from: Vec3;
  to: Vec3;
  radius?: number;
  radialSegments?: number;
  material: Material;
  name?: string;
};

export function BeamBetween({
  from,
  to,
  radius = 0.065,
  radialSegments = 8,
  material,
  name,
}: BeamBetweenProps) {
  const transform = useMemo(() => {
    const a = new Vector3(...from);
    const b = new Vector3(...to);
    const direction = b.clone().sub(a);
    const length = direction.length();
    const midpoint = a.clone().add(b).multiplyScalar(0.5);
    const quaternion = new Quaternion().setFromUnitVectors(up, direction.normalize());

    return { midpoint, quaternion, length };
  }, [from, to]);

  return (
    <mesh
      name={name}
      position={transform.midpoint}
      quaternion={transform.quaternion}
      material={material}
      castShadow
      receiveShadow
    >
      <cylinderGeometry args={[radius, radius, transform.length, radialSegments]} />
    </mesh>
  );
}
