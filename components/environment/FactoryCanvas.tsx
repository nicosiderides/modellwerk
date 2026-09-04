"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  AdaptiveDpr,
  Html,
  KeyboardControls,
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
        <img src={assetPath("/brand/mw-lockup-light.svg?v=3")} alt="MODELLWERK" />
        <span>Cargando geometria</span>
      </div>
    </Html>
  );
}

function CanvasLoadingOverlay({ coreReady, onExitStart }: { coreReady: boolean; onExitStart: () => void }) {
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
      ready={coreReady}
      onExitStart={onExitStart}
    />
  );
}

function SceneReadyCoordinator({ onReady }: { onReady: () => void }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const warmedRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useFrame(() => {
    if (warmedRef.current || !scene.environment) return;
    warmedRef.current = true;
    const startedAt = performance.now();

    // Drei's <Preload all /> performs six cube-camera renders. One render from
    // the actual entry camera is enough to initialize geometry and shadow/depth
    // variants; the extra cube capture is redundant with the authored HDR.
    gl.compile(scene, camera, scene);
    gl.render(scene, camera);

    if (new URLSearchParams(window.location.search).get("perf") === "1") {
      console.info("[MW perf] shader-warmup", JSON.stringify({
        durationMs: Number((performance.now() - startedAt).toFixed(1)),
        programs: gl.info.programs?.length ?? 0,
      }));
    }

    const previous = scene.onAfterRender;
    const handleAfterRender: typeof scene.onAfterRender = (...args) => {
      previous.apply(scene, args);
      if (scene.onAfterRender === handleAfterRender) scene.onAfterRender = previous;
      cleanupRef.current = null;
      queueMicrotask(onReady);
    };
    scene.onAfterRender = handleAfterRender;
    cleanupRef.current = () => {
      if (scene.onAfterRender === handleAfterRender) scene.onAfterRender = previous;
    };
  });

  useLayoutEffect(() => () => cleanupRef.current?.(), []);

  return null;
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
  const [coreReady, setCoreReady] = useState(false);
  const coreReadyReportedRef = useRef(false);
  const markCoreReady = useCallback(() => {
    if (coreReadyReportedRef.current) return;
    coreReadyReportedRef.current = true;
    setCoreReady(true);

    if (new URLSearchParams(window.location.search).get("perf") === "1") {
      const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      console.info("[MW perf] core-ready", JSON.stringify({
        atMs: Number(performance.now().toFixed(1)),
        resources: resources.length,
        encodedBytes: resources.reduce((total, resource) => total + resource.encodedBodySize, 0),
        transferBytes: resources.reduce((total, resource) => total + resource.transferSize, 0),
      }));
    }
  }, []);
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
      <CanvasLoadingOverlay coreReady={coreReady} onExitStart={onExperienceStart} />
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
            <SceneReadyCoordinator onReady={markCoreReady} />
          </Suspense>
        </Canvas>
      </KeyboardControls>
    </div>
  );
}
