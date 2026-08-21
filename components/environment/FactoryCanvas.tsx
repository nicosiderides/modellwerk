"use client";

import { Suspense, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  AdaptiveDpr,
  Html,
  KeyboardControls,
  Preload,
  useProgress,
} from "@react-three/drei";
import {
  ACESFilmicToneMapping,
  ColorManagement,
  PCFShadowMap,
  SRGBColorSpace,
} from "three";
import { FactoryScene } from "./FactoryScene";
import ModellwerkLoader from "./ModellwerkLoader";
import { factoryKeyboardMap } from "./hooks/keyboardMap";
import { assetPath } from "./utils/assetPath";
import { CAMERA_PRESETS } from "./utils/sceneConstants";
import type {
  ModuleMaterialSelection,
  ModuleViewMode,
  NavigationMode,
  RenderQuality,
  StationId,
} from "./utils/sceneTypes";

type FactoryCanvasProps = {
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
  onExperienceStart: () => void;
};

function ToneMappingController({ quality }: { quality: RenderQuality }) {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    gl.toneMapping = ACESFilmicToneMapping;
    gl.toneMappingExposure = quality === "performance" ? 0.96 : quality === "ultra" ? 1.04 : 1;
  }, [gl, quality]);

  return null;
}

function SceneFallback() {
  return (
    <Html center>
      <div className="loading-lockup">
        <img src={assetPath("/brand/mw-lockup-light.svg")} alt="MODELLWERK" />
        <span>Cargando geometria</span>
      </div>
    </Html>
  );
}

function CanvasLoadingOverlay({ onExitStart }: { onExitStart: () => void }) {
  const { active, errors, item, loaded, progress, total } = useProgress();
  return (
    <ModellwerkLoader
      variant="assets"
      active={active}
      item={item}
      loaded={loaded}
      progress={progress}
      total={total}
      hasError={errors.length > 0}
      onExitStart={onExitStart}
    />
  );
}

export default function FactoryCanvas({
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
  onExperienceStart,
}: FactoryCanvasProps) {
  const dpr: [number, number] =
    quality === "ultra"
      ? [1, 1.55]
      : quality === "high"
        ? [0.95, 1.35]
        : quality === "balanced" || quality === "auto"
          ? [0.85, 1.2]
          : [0.72, 1];
  const performanceMin = quality === "ultra" ? 0.62 : quality === "high" ? 0.54 : 0.45;
  const shadowsEnabled = quality !== "performance";

  return (
    <div className="factory-canvas">
      <CanvasLoadingOverlay onExitStart={onExperienceStart} />
      <KeyboardControls map={factoryKeyboardMap}>
        <Canvas
          shadows={shadowsEnabled ? { type: PCFShadowMap } : false}
          dpr={dpr}
          camera={{
            position: CAMERA_PRESETS.orbit.position,
            fov: 44,
            near: 0.08,
            far: 220,
          }}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
            stencil: false,
            depth: true,
          }}
          performance={{ min: performanceMin, debounce: 500 }}
          onCreated={({ gl }) => {
            ColorManagement.enabled = true;
            gl.outputColorSpace = SRGBColorSpace;
            gl.toneMapping = ACESFilmicToneMapping;
            gl.toneMappingExposure = quality === "performance" ? 1 : 1.08;
            gl.shadowMap.enabled = shadowsEnabled;
            gl.shadowMap.type = PCFShadowMap;
          }}
        >
          <Suspense fallback={<SceneFallback />}>
            <ToneMappingController quality={quality} />
            <AdaptiveDpr pixelated={false} />
            <FactoryScene
              activeStationId={activeStationId}
              guidedMode={guidedMode}
              mode={mode}
              moduleDimensions={moduleDimensions}
              moduleModelPath={moduleModelPath}
              moduleMaterials={moduleMaterials}
              structureColor={structureColor}
              structureVariant={structureVariant}
              exteriorFinishColor={exteriorFinishColor}
              interiorFinishColor={interiorFinishColor}
              quality={quality}
              viewMode={viewMode}
              experienceStarted={experienceStarted}
            />
            <Preload all />
          </Suspense>
        </Canvas>
      </KeyboardControls>
    </div>
  );
}
