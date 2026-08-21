"use client";

import { Billboard, Float, Text } from "@react-three/drei";
import type { StationId } from "../utils/sceneTypes";
import { STATIONS } from "./stationsConfig";

type StationGuideMarkersProps = {
  activeStationId: StationId;
};

export function StationGuideMarkers({ activeStationId }: StationGuideMarkersProps) {
  return (
    <group name="GuidedFactoryStationMarkers">
      {STATIONS.filter((station) => station.id !== "overview").map((station) => {
        const active = station.id === activeStationId;
        const [x, , z] = station.modulePose.position;
        const height = station.id === "structure" ? 5.65 : 5.05;

        return (
          <Float
            key={station.id}
            position={[x, height, z]}
            speed={active ? 0.7 : 0.35}
            rotationIntensity={active ? 0.025 : 0}
            floatIntensity={active ? 0.13 : 0.035}
            floatingRange={[-0.035, 0.035]}
          >
            <Billboard
              follow
              lockX={false}
              lockY={false}
              lockZ={false}
            >
              <mesh position={[0, 0, -0.012]} castShadow={false} receiveShadow={false}>
                <planeGeometry args={[active ? 3.65 : 2.45, active ? 0.86 : 0.48]} />
                <meshBasicMaterial
                  color={active ? "#13242a" : "#1c262a"}
                  transparent
                  opacity={active ? 0.86 : 0.34}
                  depthWrite={false}
                  toneMapped={false}
                />
              </mesh>

              {active && (
                <>
                  <mesh position={[0, 0.42, 0.002]}>
                    <boxGeometry args={[3.65, 0.022, 0.018]} />
                    <meshBasicMaterial color="#f1bd4e" toneMapped={false} />
                  </mesh>
                  <mesh position={[-1.81, 0, 0.002]}>
                    <boxGeometry args={[0.025, 0.86, 0.018]} />
                    <meshBasicMaterial color="#f1bd4e" toneMapped={false} />
                  </mesh>
                  <mesh position={[1.81, 0, 0.002]}>
                    <boxGeometry args={[0.025, 0.86, 0.018]} />
                    <meshBasicMaterial color="#6fd8ee" transparent opacity={0.56} toneMapped={false} />
                  </mesh>
                  <mesh position={[0, -0.39, 0.002]}>
                    <boxGeometry args={[2.9, 0.012, 0.018]} />
                    <meshBasicMaterial color="#6fd8ee" transparent opacity={0.42} toneMapped={false} />
                  </mesh>
                  <Text
                    position={[-1.46, 0.21, 0.025]}
                    fontSize={0.095}
                    letterSpacing={0.12}
                    anchorX="left"
                    anchorY="middle"
                    color="#76d8e9"
                    material-toneMapped={false}
                  >
                    {`ESTACIÓN  ${station.step}`}
                  </Text>
                  <Text
                    position={[-1.46, -0.08, 0.028]}
                    fontSize={0.265}
                    letterSpacing={0.055}
                    anchorX="left"
                    anchorY="middle"
                    color="#fff2cd"
                    material-toneMapped={false}
                  >
                    {station.shortTitle.toUpperCase()}
                  </Text>
                  <Text
                    position={[1.46, -0.25, 0.025]}
                    fontSize={0.065}
                    letterSpacing={0.1}
                    anchorX="right"
                    anchorY="middle"
                    color="#d6a84f"
                    material-toneMapped={false}
                  >
                    CELDA ACTIVA  /  MW
                  </Text>
                </>
              )}

              {!active && (
                <Text
                  position={[0, 0, 0.018]}
                  fontSize={0.105}
                  letterSpacing={0.08}
                  anchorX="center"
                  anchorY="middle"
                  color="#9aacb0"
                  material-toneMapped={false}
                >
                  {station.shortTitle.toUpperCase()}
                </Text>
              )}
            </Billboard>
          </Float>
        );
      })}
    </group>
  );
}
