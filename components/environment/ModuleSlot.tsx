"use client";

import { type ReactNode, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, MathUtils } from "three";
import { MODULE_SLOT } from "./utils/sceneConstants";
import type { ModuleMaterialSelection, ModuleViewMode, RenderQuality, StationId } from "./utils/sceneTypes";
import { MobileAssemblyPlatform } from "./module/MobileAssemblyPlatform";
import { ModuleTechnicalPlatform } from "./module/ModuleTechnicalPlatform";
import { ModellwerkModule } from "./module/ModellwerkModule";
import { ModuleConveyorRig } from "./module/ModuleConveyorRig";
import { StructuralCallouts } from "./stations/StructuralCallouts";
import { FloorCallouts } from "./stations/FloorCallouts";
import { ReinforcedFrameBeams } from "./module/ReinforcedFrameBeams";

export const MODULE_SLOT_CENTER = MODULE_SLOT.center;
export const MODULE_SLOT_SIZE = MODULE_SLOT.size;

function ModulePayload({
  activeStationId,
  children,
}: {
  activeStationId: StationId;
  children: ReactNode;
}) {
  const groupRef = useRef<Group>(null);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const targetY = activeStationId === "structure" ? 0.67 : 0.17;
    groupRef.current.position.y = MathUtils.damp(groupRef.current.position.y, targetY, 7, delta);
  });

  return <group ref={groupRef}>{children}</group>;
}

export default function ModuleSlot({
  activeStationId,
  moduleDimensions,
  materialSelection,
  structureColor,
  structureVariant,
  exteriorFinishColor,
  interiorFinishColor,
  moduleModelPath,
  quality,
  viewMode,
}: {
  activeStationId: StationId;
  moduleDimensions: { length: number; width: number; height: number };
  materialSelection: ModuleMaterialSelection;
  structureColor: string;
  structureVariant: string;
  exteriorFinishColor: string;
  interiorFinishColor: string;
  moduleModelPath: string;
  quality: RenderQuality;
  viewMode: ModuleViewMode;
}) {
  const usesAuthoredStructuralKit = moduleModelPath.startsWith("/models/mw900/");

  return (
    <group name={MODULE_SLOT.name} position={MODULE_SLOT.center}>
      <ModuleConveyorRig activeStationId={activeStationId}>
        <ModuleTechnicalPlatform
          activeStationId={activeStationId}
          moduleDimensions={moduleDimensions}
        />
        <MobileAssemblyPlatform
          activeStationId={activeStationId}
          moduleDimensions={moduleDimensions}
        />
        <ModulePayload activeStationId={activeStationId}>
          <ModellwerkModule
            activeStationId={activeStationId}
            materialSelection={materialSelection}
            structureColor={structureColor}
            exteriorFinishColor={exteriorFinishColor}
            interiorFinishColor={interiorFinishColor}
            moduleModelPath={moduleModelPath}
            quality={quality}
            viewMode={viewMode}
          />
          <ReinforcedFrameBeams
            enabled={structureVariant === "reinforced" && !usesAuthoredStructuralKit}
            structureColor={structureColor}
          />
          <StructuralCallouts activeStationId={activeStationId} />
          <FloorCallouts activeStationId={activeStationId} />
        </ModulePayload>
      </ModuleConveyorRig>
    </group>
  );
}
