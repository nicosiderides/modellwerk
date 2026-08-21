"use client";

import { Billboard, Line, Text } from "@react-three/drei";
import type { StationId, Vec3 } from "../utils/sceneTypes";

type StructuralCallout = {
  id: string;
  anchor: Vec3;
  elbow: Vec3;
  label: Vec3;
  title: string;
  detail: string;
};

const CALLOUTS: StructuralCallout[] = [
  { id: "upper", anchor: [-1.35, 2.68, 0.72], elbow: [-2.75, 3.16, 1.02], label: [-3.45, 3.16, 1.02], title: "Parrilla superior", detail: "Vigas bajo cubierta" },
  { id: "vertical", anchor: [2.88, 1.52, 1.02], elbow: [3.48, 1.95, 1.28], label: [4.18, 1.95, 1.28], title: "Columnas", detail: "Soportes de esquina" },
  { id: "floor", anchor: [-1.35, 0.13, -0.74], elbow: [-2.75, 0.62, -1.02], label: [-3.45, 0.62, -1.02], title: "Parrilla inferior", detail: "Bastidor bajo piso" },
];

export function StructuralCallouts({ activeStationId }: { activeStationId: StationId }) {
  if (activeStationId !== "structure") return null;

  return (
    <group name="StructuralTechnicalCallouts">
      {CALLOUTS.map((callout) => (
        <group key={callout.id}>
          <mesh position={callout.anchor}>
              <sphereGeometry args={[0.05, 12, 12]} />
            <meshBasicMaterial color="#e2b25b" toneMapped={false} />
          </mesh>
          <Line
            points={[callout.anchor, callout.elbow, callout.label]}
            color="#d9b66f"
            lineWidth={0.55}
            transparent
            opacity={0.72}
            depthTest={false}
          />
          <Billboard position={callout.label} follow>
            <mesh position={[0, 0, -0.01]} renderOrder={20}>
              <planeGeometry args={[1.72, 0.52]} />
              <meshBasicMaterial
                color="#111619"
                transparent
                opacity={0.9}
                depthTest={false}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
            <mesh position={[-0.84, 0, 0.005]} renderOrder={21}>
              <boxGeometry args={[0.035, 0.52, 0.012]} />
              <meshBasicMaterial color="#dfad4e" depthTest={false} toneMapped={false} />
            </mesh>
            <Text
              position={[-0.73, 0.1, 0.018]}
              fontSize={0.13}
              letterSpacing={0.035}
              anchorX="left"
              anchorY="middle"
              color="#fff2d3"
              material-depthTest={false}
              material-toneMapped={false}
              renderOrder={22}
            >
              {callout.title.toUpperCase()}
            </Text>
            <Text
              position={[-0.73, -0.12, 0.018]}
              fontSize={0.085}
              letterSpacing={0.015}
              anchorX="left"
              anchorY="middle"
              color="#9eaaa9"
              material-depthTest={false}
              material-toneMapped={false}
              renderOrder={22}
            >
              {callout.detail}
            </Text>
          </Billboard>
        </group>
      ))}
    </group>
  );
}
