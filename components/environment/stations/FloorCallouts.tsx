"use client";

import { Html, Line } from "@react-three/drei";
import type { StationId, Vec3 } from "../utils/sceneTypes";

const FLOOR_LAYERS: Array<{ anchor: Vec3; label: Vec3; title: string; detail: string }> = [
  { anchor: [-2.45, 0.28, 0.72], label: [-4.05, 1.02, 0.98], title: "Terminacion", detail: "Material configurable" },
  { anchor: [-1.1, 0.08, 0.66], label: [-4.05, 0.34, 0.98], title: "Placa estructural", detail: "Soporte continuo" },
  { anchor: [1.1, 0.02, 0.62], label: [4.05, 1.02, 0.98], title: "Aislacion", detail: "Paquete termico" },
  { anchor: [2.45, -0.08, 0.56], label: [4.05, 0.34, 0.98], title: "Bastidor base", detail: "Estructura portante" },
];

export function FloorCallouts({ activeStationId }: { activeStationId: StationId }) {
  if (activeStationId !== "floor") return null;

  return (
    <group name="FloorTechnicalCallouts">
      {FLOOR_LAYERS.map((layer) => {
        const elbow: Vec3 = [layer.label[0] * 0.78, layer.label[1], layer.label[2]];
        return (
          <group key={layer.title}>
            <mesh position={layer.anchor}>
              <sphereGeometry args={[0.045, 10, 10]} />
              <meshBasicMaterial color="#e2b25b" toneMapped={false} />
            </mesh>
            <Line points={[layer.anchor, elbow, layer.label]} color="#d9b66f" lineWidth={0.5} transparent opacity={0.68} depthTest={false} />
            <Html position={layer.label} center distanceFactor={10} zIndexRange={[12, 0]}>
              <div className="structure-callout floor-callout">
                <span>{layer.title}</span>
                <small>{layer.detail}</small>
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
