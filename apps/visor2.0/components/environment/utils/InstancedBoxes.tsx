"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  Euler,
  InstancedMesh,
  Material,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";
import type { EulerTuple, Vec3 } from "./sceneTypes";

export type BoxInstance = {
  position: Vec3;
  scale: Vec3;
  rotation?: EulerTuple;
};

type InstancedBoxesProps = {
  name?: string;
  items: BoxInstance[];
  material: Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
  frustumCulled?: boolean;
};

const matrix = new Matrix4();
const position = new Vector3();
const scale = new Vector3();
const rotation = new Euler();
const quaternion = new Quaternion();

export function InstancedBoxes({
  name,
  items,
  material,
  castShadow = true,
  receiveShadow = true,
  frustumCulled = true,
}: InstancedBoxesProps) {
  const meshRef = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    items.forEach((item, index) => {
      position.fromArray(item.position);
      scale.fromArray(item.scale);
      rotation.set(...(item.rotation ?? [0, 0, 0]));
      quaternion.setFromEuler(rotation);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);

  return (
    <instancedMesh
      ref={meshRef}
      name={name}
      args={[geometry, material, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      frustumCulled={frustumCulled}
    />
  );
}
