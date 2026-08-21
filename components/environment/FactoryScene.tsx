"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Color, Fog } from "three";
import ModuleSlot from "./ModuleSlot";
import { CameraRig } from "./cameras/CameraRig";
import { FactoryShell } from "./factory/FactoryShell";
import { FloorSystem } from "./factory/FloorSystem";
import { FactoryLighting } from "./lights/FactoryLighting";
import { useFactoryMaterials } from "./materials/useFactoryMaterials";
import { FactoryPostProcessing } from "./postprocessing/FactoryPostProcessing";
import { FactoryProps } from "./props/FactoryProps";
import { AssetPipelineWarmup } from "./utils/AssetPipelineWarmup";
import type {
  ModuleMaterialSelection,
  ModuleViewMode,
  NavigationMode,
  RenderQuality,
  StationId,
} from "./utils/sceneTypes";
import { FactoryDebugControls } from "./utils/FactoryDebug";

type FactorySceneProps = {
  activeStationId: StationId;
  guidedMode: boolean;
  mode: NavigationMode;
  moduleDimensions: { length: number; width: number; height: number };
  moduleModelPath: string;
  moduleMaterials: ModuleMaterialSelection;
  structureColor: string;
  structureVariant: string;
  exteriorFinishColor: string;
  interiorFinishColor: string;
  quality: RenderQuality;
  viewMode: ModuleViewMode;
  experienceStarted: boolean;
};

export function FactoryScene({
  activeStationId,
  guidedMode,
  mode,
  moduleDimensions,
  moduleModelPath,
  moduleMaterials,
  structureColor,
  structureVariant,
  exteriorFinishColor,
  interiorFinishColor,
  quality,
  viewMode,
  experienceStarted,
}: FactorySceneProps) {
  const scene = useThree((state) => state.scene);
  const materials = useFactoryMaterials();

  useEffect(() => {
    scene.background = new Color(0xc9c4b8);
    scene.fog = new Fog(0xc9c4b8, 54, 146);
  }, [scene]);

  return (
    <>
      <AssetPipelineWarmup />
      <FactoryLighting activeStationId={activeStationId} guidedMode={guidedMode} materials={materials} quality={quality} />
      <FloorSystem activeStationId={activeStationId} materials={materials} />
      <FactoryShell materials={materials} />
      <FactoryProps activeStationId={activeStationId} materials={materials} />
      <ModuleSlot
        activeStationId={activeStationId}
        moduleDimensions={moduleDimensions}
        materialSelection={moduleMaterials}
        structureColor={structureColor}
        structureVariant={structureVariant}
        exteriorFinishColor={exteriorFinishColor}
        interiorFinishColor={interiorFinishColor}
        moduleModelPath={moduleModelPath}
        quality={quality}
        viewMode={viewMode}
      />
      <CameraRig
        activeStationId={activeStationId}
        guidedMode={guidedMode}
        mode={mode}
        moduleDimensions={moduleDimensions}
        experienceStarted={experienceStarted}
      />
      <FactoryDebugControls />
      <FactoryPostProcessing quality={quality} />
    </>
  );
}
