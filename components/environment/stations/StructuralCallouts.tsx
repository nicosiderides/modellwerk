"use client";

import { Html, Line } from "@react-three/drei";
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
  const active = activeStationId === "structure";

  return (
    <group name="StructuralTechnicalCallouts" visible={active}>
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
          <Html
            position={callout.label}
            center
            distanceFactor={10}
            zIndexRange={[12, 0]}
            style={{ display: active ? "block" : "none" }}
          >
            <div className="structure-callout">
              <span>{callout.title}</span>
              <small>{callout.detail}</small>
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}
