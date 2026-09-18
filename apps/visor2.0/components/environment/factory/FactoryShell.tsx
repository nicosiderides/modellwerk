"use client";

import { useMemo } from "react";
import { Text } from "@react-three/drei";
import type { FactoryMaterialSet } from "../materials/useFactoryMaterials";
import {
  FACTORY_DIMENSIONS,
  ROOF_PURLIN_Z,
  STRUCTURAL_BAY_X,
} from "../utils/sceneConstants";
import { BeamBetween } from "../utils/BeamBetween";
import { InstancedBoxes, type BoxInstance } from "../utils/InstancedBoxes";
import type { Vec3 } from "../utils/sceneTypes";

type FactoryShellProps = {
  materials: FactoryMaterialSet;
};

const roofApexY = 13.86;
const roofEaveY = 11.56;
const roofHalfSpan = 28.2;

function roofYAtZ(z: number) {
  return roofApexY - (Math.abs(z) / roofHalfSpan) * (roofApexY - roofEaveY);
}

function createColumns(): BoxInstance[] {
  return STRUCTURAL_BAY_X.flatMap((x) => [
    { position: [x, 6, -28.2], scale: [0.46, 12, 0.46] },
    { position: [x, 6, 28.2], scale: [0.46, 12, 0.46] },
  ]);
}

function createRoofPurlins(): BoxInstance[] {
  return ROOF_PURLIN_Z.map((z) => ({
    position: [0, 14.08, z],
    scale: [116, 0.14, 0.14],
  }));
}

function createRoofPanels() {
  const roofY = 14.32;
  const skylightY = 14.39;

  const opaque: BoxInstance[] = [
    { position: [0, roofY, -27], scale: [118, 0.16, 6] },
    { position: [0, roofY, -21], scale: [118, 0.16, 6] },
    { position: [0, roofY, -15], scale: [118, 0.16, 6] },
    { position: [0, roofY, -9.5], scale: [118, 0.16, 5] },
    { position: [0, roofY, -2.9], scale: [118, 0.16, 1.8] },
    { position: [0, roofY, 2.9], scale: [118, 0.16, 1.8] },
    { position: [0, roofY, 9.5], scale: [118, 0.16, 5] },
    { position: [0, roofY, 15], scale: [118, 0.16, 6] },
    { position: [0, roofY, 21], scale: [118, 0.16, 6] },
    { position: [0, roofY, 27], scale: [118, 0.16, 6] },
  ];

  const translucent: BoxInstance[] = [
    { position: [0, skylightY, -5.4], scale: [118, 0.08, 3.2] },
    { position: [0, skylightY, 0], scale: [118, 0.08, 4] },
    { position: [0, skylightY, 5.4], scale: [118, 0.08, 3.2] },
  ];

  const joints: BoxInstance[] = [
    ...[-24, -18, -12, -7, -3.8, -2, 2, 3.8, 7, 12, 18, 24].map((z) => ({
      position: [0, skylightY + 0.055, z] as Vec3,
      scale: [118, 0.09, 0.08] as Vec3,
    })),
    ...STRUCTURAL_BAY_X.map((x) => ({
      position: [x, skylightY + 0.07, 0] as Vec3,
      scale: [0.08, 0.08, 58.2] as Vec3,
    })),
  ];

  return { opaque, translucent, joints };
}

function createRoofFullWebBeams() {
  const rows = [-20, -11.5, 0, 11.5, 20];
  const web: BoxInstance[] = [];
  const flanges: BoxInstance[] = [];

  rows.forEach((z) => {
    const y = roofYAtZ(z) - 0.32;
    web.push({ position: [0, y, z], scale: [116, 0.58, 0.09] });
    flanges.push(
      { position: [0, y + 0.33, z], scale: [116, 0.08, 0.42] },
      { position: [0, y - 0.33, z], scale: [116, 0.08, 0.42] }
    );
  });

  flanges.push(
    { position: [0, roofApexY + 0.1, -1.72], scale: [116, 0.1, 0.24] },
    { position: [0, roofApexY + 0.1, 1.72], scale: [116, 0.1, 0.24] }
  );

  return { web, flanges };
}

function createUpperEnvelope() {
  const opaque: BoxInstance[] = [
    { position: [0, 9.55, -30.18], scale: [118, 0.9, 0.16] },
    { position: [0, 12.92, -30.18], scale: [118, 2.58, 0.16] },
    { position: [0, 9.55, 30.18], scale: [118, 0.9, 0.16] },
    { position: [0, 12.92, 30.18], scale: [118, 2.58, 0.16] },
    { position: [-60.18, 9.55, 0], scale: [0.16, 0.9, 58.4] },
    { position: [-60.18, 12.92, 0], scale: [0.16, 2.58, 58.4] },
    { position: [60.18, 9.55, 0], scale: [0.16, 0.9, 58.4] },
    { position: [60.18, 12.92, 0], scale: [0.16, 2.58, 58.4] },
  ];

  const translucent: BoxInstance[] = [
    { position: [0, 10.55, -30.24], scale: [118, 1.08, 0.08] },
    { position: [0, 10.55, 30.24], scale: [118, 1.08, 0.08] },
    { position: [-60.24, 10.55, 0], scale: [0.08, 1.08, 58.4] },
    { position: [60.24, 10.55, 0], scale: [0.08, 1.08, 58.4] },
  ];

  const frames: BoxInstance[] = [
    { position: [0, 9.1, -30.22], scale: [118, 0.12, 0.12] },
    { position: [0, 10.0, -30.26], scale: [118, 0.1, 0.12] },
    { position: [0, 11.1, -30.26], scale: [118, 0.1, 0.12] },
    { position: [0, 11.62, -30.22], scale: [118, 0.12, 0.12] },
    { position: [0, 9.1, 30.22], scale: [118, 0.12, 0.12] },
    { position: [0, 10.0, 30.26], scale: [118, 0.1, 0.12] },
    { position: [0, 11.1, 30.26], scale: [118, 0.1, 0.12] },
    { position: [0, 11.62, 30.22], scale: [118, 0.12, 0.12] },
    { position: [-60.22, 9.1, 0], scale: [0.12, 0.12, 58.4] },
    { position: [-60.26, 10.0, 0], scale: [0.12, 0.1, 58.4] },
    { position: [-60.26, 11.1, 0], scale: [0.12, 0.1, 58.4] },
    { position: [-60.22, 11.62, 0], scale: [0.12, 0.12, 58.4] },
    { position: [60.22, 9.1, 0], scale: [0.12, 0.12, 58.4] },
    { position: [60.26, 10.0, 0], scale: [0.12, 0.1, 58.4] },
    { position: [60.26, 11.1, 0], scale: [0.12, 0.1, 58.4] },
    { position: [60.22, 11.62, 0], scale: [0.12, 0.12, 58.4] },
    { position: [0, 14.18, -30.24], scale: [118, 0.16, 0.22] },
    { position: [0, 14.18, 30.24], scale: [118, 0.16, 0.22] },
    { position: [-60.24, 14.18, 0], scale: [0.22, 0.16, 58.4] },
    { position: [60.24, 14.18, 0], scale: [0.22, 0.16, 58.4] },
  ];

  STRUCTURAL_BAY_X.forEach((x) => {
    frames.push(
      { position: [x, 10.36, -30.25], scale: [0.1, 2.45, 0.12] },
      { position: [x, 10.36, 30.25], scale: [0.1, 2.45, 0.12] }
    );
  });

  for (let z = -24; z <= 24; z += 8) {
    frames.push(
      { position: [-60.25, 10.36, z], scale: [0.12, 2.45, 0.1] },
      { position: [60.25, 10.36, z], scale: [0.12, 2.45, 0.1] }
    );
  }

  return { opaque, translucent, frames };
}

function createWallPanels(): BoxInstance[] {
  return [
    { position: [0, 4.5, -30.2], scale: [118, 9, 0.18] },
    { position: [0, 4.5, 30.2], scale: [118, 9, 0.18] },
    { position: [-60.2, 4.5, 0], scale: [0.18, 9, 60] },
    { position: [60.2, 4.5, 0], scale: [0.18, 9, 60] },
  ];
}

function createCurtainWallGlass(): BoxInstance[] {
  const panes: BoxInstance[] = [];
  for (let x = -54; x <= 54; x += 6) {
    panes.push({ position: [x, 6.8, -30.08], scale: [5.2, 4.4, 0.06] });
    panes.push({ position: [x, 6.8, 30.08], scale: [5.2, 4.4, 0.06] });
  }

  for (let z = -24; z <= 24; z += 6) {
    panes.push({ position: [-60.08, 6.8, z], scale: [0.06, 4.4, 5.2] });
    panes.push({ position: [60.08, 6.8, z], scale: [0.06, 4.4, 5.2] });
  }

  return panes;
}

function createOfficeFrames(): BoxInstance[] {
  const frames: BoxInstance[] = [];

  for (let x = -54; x <= -6; x += 4) {
    frames.push({ position: [x, 2.4, -27.1], scale: [0.08, 4.8, 0.1] });
    frames.push({ position: [x, 6.7, -27.1], scale: [0.08, 4.2, 0.1] });
  }

  for (let y = 0.2; y <= 8.6; y += 2.2) {
    frames.push({ position: [-30, y, -27.1], scale: [51.5, 0.08, 0.1] });
  }

  return frames;
}

function createRails(x0: number, x1: number, z: number, y: number): BoxInstance[] {
  const length = Math.abs(x1 - x0);
  const center = (x0 + x1) * 0.5;
  return [
    { position: [center, y, z], scale: [length, 0.08, 0.08] },
    { position: [center, y + 0.52, z], scale: [length, 0.08, 0.08] },
    { position: [x0, y + 0.26, z], scale: [0.08, 0.56, 0.08] },
    { position: [x1, y + 0.26, z], scale: [0.08, 0.56, 0.08] },
  ];
}

function createVisitorWalkway(): BoxInstance[] {
  const walkway: BoxInstance[] = [
    { position: [-30, 4.15, -26.1], scale: [54, 0.22, 2.2] },
    { position: [-30, 4.85, -24.85], scale: [54, 0.08, 0.08] },
    { position: [-30, 5.55, -24.85], scale: [54, 0.08, 0.08] },
    { position: [-30, 5.94, -24.85], scale: [54, 0.11, 0.11] },
  ];

  for (let x = -56; x <= -4; x += 3) {
    walkway.push({ position: [x, 5.2, -24.85], scale: [0.07, 1.5, 0.07] });
  }

  return walkway;
}

function TrussSet({ materials }: FactoryShellProps) {
  const beams = useMemo(() => {
    const items: Array<{ from: Vec3; to: Vec3; name: string }> = [];

    STRUCTURAL_BAY_X.forEach((x) => {
      items.push({ from: [x, 11.6, -28.2], to: [x, 13.85, 0], name: `TrussNorth_${x}` });
      items.push({ from: [x, 13.85, 0], to: [x, 11.6, 28.2], name: `TrussSouth_${x}` });
      items.push({ from: [x, 12.25, -20], to: [x, 13.55, -8], name: `TrussDiagN_${x}` });
      items.push({ from: [x, 13.55, 8], to: [x, 12.25, 20], name: `TrussDiagS_${x}` });
    });

    return items;
  }, []);

  return (
    <group name="LargeSpanTrusses">
      {beams.map((beam) => (
        <BeamBetween
          key={beam.name}
          name={beam.name}
          from={beam.from}
          to={beam.to}
          material={materials.graphiteSteel}
          radius={0.055}
          radialSegments={8}
        />
      ))}
    </group>
  );
}

function BridgeCranes({ materials }: FactoryShellProps) {
  const craneBeams = useMemo<BoxInstance[]>(
    () => [
      { position: [-17, 11.85, 0], scale: [0.9, 0.66, 52] },
      { position: [27, 11.85, 0], scale: [0.9, 0.66, 52] },
      { position: [-17, 11.25, -6], scale: [1.6, 0.48, 1.2] },
      { position: [27, 11.25, 7], scale: [1.6, 0.48, 1.2] },
      { position: [-17, 9.8, -6], scale: [0.12, 2.5, 0.12] },
      { position: [27, 9.8, 7], scale: [0.12, 2.5, 0.12] },
      { position: [-17, 8.45, -6], scale: [0.55, 0.24, 0.55] },
      { position: [27, 8.45, 7], scale: [0.55, 0.24, 0.55] },
    ],
    []
  );

  const rails = useMemo<BoxInstance[]>(
    () => [
      { position: [0, 12.25, -24.4], scale: [116, 0.42, 0.32] },
      { position: [0, 12.25, 24.4], scale: [116, 0.42, 0.32] },
    ],
    []
  );

  return (
    <group name="BridgeCranes">
      <InstancedBoxes items={rails} material={materials.graphiteSteel} />
      <InstancedBoxes items={craneBeams.slice(0, 2)} material={materials.craneYellow} />
      <InstancedBoxes items={craneBeams.slice(2)} material={materials.graphiteSteel} />
      <Text
        position={[-17.04, 12.27, -18.4]}
        rotation={[0, 0, 0]}
        fontSize={0.58}
        letterSpacing={0.08}
        anchorX="center"
        anchorY="middle"
        material={materials.wallWhite}
      >
        MODELLWERK 5t
      </Text>
    </group>
  );
}

function BuildingServices({ materials }: FactoryShellProps) {
  const hvac = useMemo<BoxInstance[]>(
    () => [
      { position: [0, 10.15, -12.5], scale: [112, 0.82, 1.05] },
      { position: [0, 10.15, 12.5], scale: [112, 0.82, 1.05] },
      { position: [-34, 9.9, 0], scale: [0.9, 0.72, 24] },
      { position: [34, 9.9, 0], scale: [0.9, 0.72, 24] },
    ],
    []
  );
  const dampers = useMemo<BoxInstance[]>(
    () => [
      { position: [-44, 9.55, -12.5], scale: [2.2, 0.14, 1.2] },
      { position: [-18, 9.55, -12.5], scale: [2.2, 0.14, 1.2] },
      { position: [18, 9.55, -12.5], scale: [2.2, 0.14, 1.2] },
      { position: [44, 9.55, -12.5], scale: [2.2, 0.14, 1.2] },
      { position: [-44, 9.55, 12.5], scale: [2.2, 0.14, 1.2] },
      { position: [-18, 9.55, 12.5], scale: [2.2, 0.14, 1.2] },
      { position: [18, 9.55, 12.5], scale: [2.2, 0.14, 1.2] },
      { position: [44, 9.55, 12.5], scale: [2.2, 0.14, 1.2] },
    ],
    []
  );
  const sprinklers = useMemo<BoxInstance[]>(
    () => {
      const items: BoxInstance[] = [];
      for (let x = -50; x <= 50; x += 10) {
        [-18, -6, 6, 18].forEach((z) => {
          items.push({ position: [x, 9.82, z], scale: [0.08, 0.65, 0.08] });
          items.push({ position: [x, 9.47, z], scale: [0.4, 0.035, 0.4] });
        });
      }
      return items;
    },
    []
  );
  const pipeRuns = useMemo(
    () => [
      { from: [-56, 10.55, -18] as Vec3, to: [56, 10.55, -18] as Vec3, name: "FirePipeNorth" },
      { from: [-56, 10.55, 18] as Vec3, to: [56, 10.55, 18] as Vec3, name: "FirePipeSouth" },
      { from: [-34, 10.55, -18] as Vec3, to: [-34, 10.55, 18] as Vec3, name: "FirePipeBranchWest" },
      { from: [0, 10.55, -18] as Vec3, to: [0, 10.55, 18] as Vec3, name: "FirePipeBranchCenter" },
      { from: [34, 10.55, -18] as Vec3, to: [34, 10.55, 18] as Vec3, name: "FirePipeBranchEast" },
    ],
    []
  );

  return (
    <group name="CeilingServices">
      <InstancedBoxes items={hvac} material={materials.galvanizedSteel} />
      <InstancedBoxes items={dampers} material={materials.aluminum} />
      {pipeRuns.map((pipe) => (
        <BeamBetween
          key={pipe.name}
          name={pipe.name}
          from={pipe.from}
          to={pipe.to}
          material={materials.fireRed}
          radius={0.045}
          radialSegments={10}
        />
      ))}
      <InstancedBoxes items={sprinklers} material={materials.fireRed} />
    </group>
  );
}

function ManagementOffices({ materials }: FactoryShellProps) {
  const officeGlass = useMemo<BoxInstance[]>(
    () => [
      { position: [-30, 2.6, -26.92], scale: [50, 4.2, 0.05] },
      { position: [-30, 6.9, -26.92], scale: [50, 3.8, 0.05] },
      { position: [-55.2, 3.0, -23.8], scale: [0.05, 4.6, 6.2] },
      { position: [-4.8, 3.0, -23.8], scale: [0.05, 4.6, 6.2] },
    ],
    []
  );
  const frames = useMemo(createOfficeFrames, []);
  const floors = useMemo<BoxInstance[]>(
    () => [
      { position: [-30, 0.1, -24.2], scale: [52, 0.18, 5.8] },
      { position: [-30, 4.45, -24.2], scale: [52, 0.2, 5.8] },
      { position: [-30, 8.7, -24.2], scale: [52, 0.16, 5.8] },
    ],
    []
  );
  const walkway = useMemo(createVisitorWalkway, []);

  return (
    <group name="GlassManagementOffices">
      <InstancedBoxes items={floors} material={materials.birchPlywood} />
      <InstancedBoxes items={officeGlass} material={materials.glass} castShadow={false} receiveShadow={false} />
      <InstancedBoxes items={frames} material={materials.graphiteSteel} />
      <InstancedBoxes items={walkway} material={materials.graphiteSteel} />
      <mesh
        name="FullWidthWeldingScreen"
        position={[-46, 2.65, -21.7]}
        castShadow
        receiveShadow
        material={materials.wallWhite}
      >
        <boxGeometry args={[15.4, 3.8, 0.14]} />
      </mesh>
      <mesh position={[-20, 6.65, -21.7]} castShadow receiveShadow material={materials.wallWhite}>
        <boxGeometry args={[10, 3.1, 0.12]} />
      </mesh>
    </group>
  );
}

export function FactoryShell({ materials }: FactoryShellProps) {
  const columns = useMemo(createColumns, []);
  const purlins = useMemo(createRoofPurlins, []);
  const roof = useMemo(createRoofPanels, []);
  const roofFullWebBeams = useMemo(createRoofFullWebBeams, []);
  const walls = useMemo(createWallPanels, []);
  const glass = useMemo(createCurtainWallGlass, []);
  const upperEnvelope = useMemo(createUpperEnvelope, []);
  const safetyRails = useMemo(
    () => [
      ...createRails(-56, -5, -24.9, 4.55),
      ...createRails(18, 55, 24.7, 1.1),
      ...createRails(37, 55, -25.1, 1.1),
    ],
    []
  );

  return (
    <group name="FactoryShell">
      <InstancedBoxes name="PortalFrameColumns" items={columns} material={materials.whiteSteel} />
      <InstancedBoxes name="RoofPurlins" items={purlins} material={materials.graphiteSteel} />
      <InstancedBoxes name="RoofFullWebBeamWebs" items={roofFullWebBeams.web} material={materials.graphiteSteel} />
      <InstancedBoxes name="RoofFullWebBeamFlanges" items={roofFullWebBeams.flanges} material={materials.graphiteSteel} />
      <InstancedBoxes name="OpaqueRoofPanels" items={roof.opaque} material={materials.wallWhite} receiveShadow={false} />
      <InstancedBoxes
        name="TranslucentSkylightPanels"
        items={roof.translucent}
        material={materials.translucentRoof}
        castShadow={false}
        receiveShadow={false}
      />
      <InstancedBoxes
        name="RoofPanelClosureJoints"
        items={roof.joints}
        material={materials.graphiteSteel}
        castShadow={false}
        receiveShadow={false}
      />
      <InstancedBoxes name="FactoryWallPanels" items={walls} material={materials.wallWhite} receiveShadow />
      <InstancedBoxes
        name="UpperOpaqueEnvelopeClosures"
        items={upperEnvelope.opaque}
        material={materials.wallWhite}
        receiveShadow
      />
      <InstancedBoxes
        name="UpperTranslucentEnvelopePanels"
        items={upperEnvelope.translucent}
        material={materials.glassDark}
        castShadow={false}
        receiveShadow={false}
      />
      <InstancedBoxes
        name="UpperEnvelopeMullions"
        items={upperEnvelope.frames}
        material={materials.graphiteSteel}
        castShadow={false}
        receiveShadow={false}
      />
      <InstancedBoxes
        name="IndustrialCurtainWall"
        items={glass}
        material={materials.glass}
        castShadow={false}
        receiveShadow={false}
      />
      <InstancedBoxes name="VisitorAndSafetyRails" items={safetyRails} material={materials.graphiteSteel} />

      <TrussSet materials={materials} />
      <ManagementOffices materials={materials} />
      <BridgeCranes materials={materials} />
      <BuildingServices materials={materials} />

      <Text
        name="FarWallBrand"
        position={[FACTORY_DIMENSIONS.halfLength - 0.34, 6.1, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        fontSize={2.4}
        letterSpacing={0.06}
        anchorX="center"
        anchorY="middle"
        material={materials.graphiteSteel}
      >
        MODELLWERK
      </Text>
    </group>
  );
}
