"use client";

import { Suspense, useEffect } from "react";
import { Billboard, useTexture } from "@react-three/drei";
import { Box3, SRGBColorSpace } from "three";
import { assetPath } from "@/components/environment/utils/assetPath";

/**
 * Referencia de escala humana (imagen del Visor 1.0) frente al acceso.
 * Los vehículos ahora son parte del entorno de cada producto (surroundings).
 */

const PERSON_IMAGE = "/people/factory-worker-scale.png";
const PERSON_HEIGHT = 1.79;
const PERSON_WIDTH = PERSON_HEIGHT * (528 / 1647);

function Person() {
  const texture = useTexture(assetPath(PERSON_IMAGE));
  useEffect(() => {
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
  }, [texture]);
  return (
    <Billboard follow lockX lockZ>
      <mesh position={[0, PERSON_HEIGHT / 2, 0]}>
        <planeGeometry args={[PERSON_WIDTH, PERSON_HEIGHT]} />
        <meshBasicMaterial map={texture} transparent alphaTest={0.06} depthWrite={false} toneMapped={false} />
      </mesh>
    </Billboard>
  );
}

export function ScaleReferences({ bounds, visible }: { bounds: Box3 | null; visible: boolean }) {
  if (!bounds || bounds.isEmpty() || !visible) return null;
  const front = bounds.min.z;
  const width = bounds.max.x - bounds.min.x;
  return (
    <group name="MW_SCALE_REFERENCES">
      <group position={[bounds.min.x + width * 0.36, 0.12, front - 1.1]}>
        <Suspense fallback={null}>
          <Person />
        </Suspense>
      </group>
      <group position={[bounds.min.x + width * 0.12, 0.12, front - 0.9]}>
        <Suspense fallback={null}>
          <Person />
        </Suspense>
      </group>
    </group>
  );
}

useTexture.preload(assetPath(PERSON_IMAGE));
