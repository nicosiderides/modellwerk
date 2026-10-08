"use client";

import { Suspense, useEffect, useMemo } from "react";
import { Billboard, useTexture } from "@react-three/drei";
import { Box3, MeshStandardMaterial, SRGBColorSpace, Vector3 } from "three";
import { assetPath } from "@/components/environment/utils/assetPath";

/**
 * Referencias de escala: persona, camión, auto y autoelevador.
 * Volumetrías simples (no seleccionables) ubicadas frente al acceso.
 * La persona reutiliza la imagen de escala humana del Visor 1.0.
 */

const PERSON_IMAGE = "/people/factory-worker-scale.png";
const PERSON_HEIGHT = 1.79;
const PERSON_WIDTH = PERSON_HEIGHT * (528 / 1647);

function usePalette() {
  return useMemo(
    () => ({
      body: new MeshStandardMaterial({ color: "#e8e6e0", roughness: 0.45, metalness: 0.2 }),
      cab: new MeshStandardMaterial({ color: "#2f4a5e", roughness: 0.4, metalness: 0.35 }),
      dark: new MeshStandardMaterial({ color: "#1d2124", roughness: 0.8 }),
      glass: new MeshStandardMaterial({ color: "#6f8691", roughness: 0.1, metalness: 0.4 }),
      car: new MeshStandardMaterial({ color: "#7a1f1f", roughness: 0.35, metalness: 0.45 }),
      forklift: new MeshStandardMaterial({ color: "#d39b1d", roughness: 0.5, metalness: 0.2 }),
    }),
    []
  );
}

function Wheel({ position, radius = 0.5, width = 0.3, material }: { position: [number, number, number]; radius?: number; width?: number; material: MeshStandardMaterial }) {
  return (
    <mesh position={position} rotation={[0, 0, Math.PI / 2]} castShadow material={material}>
      <cylinderGeometry args={[radius, radius, width, 14]} />
    </mesh>
  );
}

function Truck({ palette }: { palette: ReturnType<typeof usePalette> }) {
  // Camión con caja de 8,5 m (largo en Z, frente hacia -Z)
  return (
    <group>
      <mesh position={[0, 2.25, 1.2]} castShadow receiveShadow material={palette.body}>
        <boxGeometry args={[2.5, 2.9, 7.2]} />
      </mesh>
      <mesh position={[0, 0.85, 1.2]} castShadow material={palette.dark}>
        <boxGeometry args={[2.2, 0.35, 7.6]} />
      </mesh>
      <mesh position={[0, 1.65, -3.35]} castShadow material={palette.cab}>
        <boxGeometry args={[2.45, 2.2, 1.9]} />
      </mesh>
      <mesh position={[0, 2.15, -4.32]} material={palette.glass}>
        <boxGeometry args={[2.2, 0.9, 0.05]} />
      </mesh>
      {[-3.3, 2.6, 4.0].flatMap((z) => [-1.05, 1.05].map((x) => <Wheel key={`${x}${z}`} position={[x, 0.5, z]} material={palette.dark} />))}
    </group>
  );
}

function Car({ palette }: { palette: ReturnType<typeof usePalette> }) {
  return (
    <group>
      <mesh position={[0, 0.62, 0]} castShadow receiveShadow material={palette.car}>
        <boxGeometry args={[1.8, 0.7, 4.5]} />
      </mesh>
      <mesh position={[0, 1.18, 0.2]} castShadow material={palette.glass}>
        <boxGeometry args={[1.6, 0.5, 2.3]} />
      </mesh>
      {[-1.4, 1.4].flatMap((z) => [-0.85, 0.85].map((x) => <Wheel key={`${x}${z}`} position={[x, 0.33, z]} radius={0.33} width={0.22} material={palette.dark} />))}
    </group>
  );
}

function Forklift({ palette }: { palette: ReturnType<typeof usePalette> }) {
  return (
    <group>
      <mesh position={[0, 0.75, 0.2]} castShadow material={palette.forklift}>
        <boxGeometry args={[1.15, 0.9, 1.9]} />
      </mesh>
      <mesh position={[0, 1.75, 0.45]} castShadow material={palette.dark}>
        <boxGeometry args={[1.05, 0.06, 1.2]} />
      </mesh>
      {[-0.48, 0.48].map((x) => (
        <mesh key={x} position={[x, 1.25, 0.95]} material={palette.dark}>
          <boxGeometry args={[0.05, 1.0, 0.05]} />
        </mesh>
      ))}
      <mesh position={[0, 1.4, -0.95]} castShadow material={palette.dark}>
        <boxGeometry args={[0.9, 2.6, 0.12]} />
      </mesh>
      {[-0.3, 0.3].map((x) => (
        <mesh key={x} position={[x, 0.12, -1.6]} material={palette.dark}>
          <boxGeometry args={[0.12, 0.05, 1.2]} />
        </mesh>
      ))}
      {[-0.55, 0.65].flatMap((z) => [-0.55, 0.55].map((x) => <Wheel key={`${x}${z}`} position={[x, 0.3, z]} radius={0.3} width={0.2} material={palette.dark} />))}
    </group>
  );
}

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
  const palette = usePalette();
  if (!bounds || bounds.isEmpty() || !visible) return null;
  const size = bounds.getSize(new Vector3());
  const front = bounds.min.z;
  return (
    <group name="MW_SCALE_REFERENCES">
      <group position={[size.x * 0.18, 0, front - 9.5]}>
        <Truck palette={palette} />
      </group>
      <group position={[-size.x * 0.32, 0, front - 6]} rotation={[0, 0.35, 0]}>
        <Car palette={palette} />
      </group>
      <group position={[-size.x * 0.04, 0, front - 4]} rotation={[0, Math.PI * 0.85, 0]}>
        <Forklift palette={palette} />
      </group>
      <group position={[-size.x * 0.12, 0, front - 2.6]}>
        <Suspense fallback={null}>
          <Person />
        </Suspense>
      </group>
    </group>
  );
}

useTexture.preload(assetPath(PERSON_IMAGE));
