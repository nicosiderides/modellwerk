"use client";

import { Billboard, Text, useTexture } from "@react-three/drei";
import { useEffect } from "react";
import { SRGBColorSpace } from "three";
import { assetPath } from "../utils/assetPath";

const HUMAN_HEIGHT = 1.75;
const IMAGE_WIDTH = 528;
const IMAGE_HEIGHT = 1647;
const IMAGE_PLANE_HEIGHT = 1.79;
const IMAGE_PLANE_WIDTH = IMAGE_PLANE_HEIGHT * (IMAGE_WIDTH / IMAGE_HEIGHT);

export function HumanScaleReference() {
  const texture = useTexture(assetPath("/people/factory-worker-scale.png"));

  useEffect(() => {
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
  }, [texture]);

  return (
    <group name="HumanScaleReference" position={[3.55, 0, -1.55]}>
      <mesh
        position={[0.08, 0.012, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[0.56, 0.22, 1]}
        receiveShadow={false}
      >
        <circleGeometry args={[0.5, 32]} />
        <meshBasicMaterial
          color="#111514"
          transparent
          opacity={0.2}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <Billboard follow lockX lockZ>
        <mesh position={[0.08, IMAGE_PLANE_HEIGHT / 2, 0]} castShadow={false} receiveShadow={false}>
          <planeGeometry args={[IMAGE_PLANE_WIDTH, IMAGE_PLANE_HEIGHT]} />
          <meshBasicMaterial
            map={texture}
            transparent
            alphaTest={0.06}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>

        <mesh position={[-0.36, HUMAN_HEIGHT / 2, 0.01]}>
          <boxGeometry args={[0.012, HUMAN_HEIGHT, 0.012]} />
          <meshBasicMaterial color="#e2b25b" toneMapped={false} />
        </mesh>
        {[0, HUMAN_HEIGHT / 2, HUMAN_HEIGHT].map((height) => (
          <mesh key={height} position={[-0.36, height, 0.012]}>
            <boxGeometry args={[height === HUMAN_HEIGHT / 2 ? 0.1 : 0.16, 0.012, 0.012]} />
            <meshBasicMaterial color="#e2b25b" toneMapped={false} />
          </mesh>
        ))}
        <Text
          position={[-0.36, HUMAN_HEIGHT + 0.12, 0.02]}
          fontSize={0.115}
          letterSpacing={0.035}
          anchorX="center"
          anchorY="bottom"
          color="#fff2d3"
          outlineWidth={0.008}
          outlineColor="#111514"
          material-toneMapped={false}
        >
          1,75 m
        </Text>
      </Billboard>
    </group>
  );
}

useTexture.preload(assetPath("/people/factory-worker-scale.png"));
