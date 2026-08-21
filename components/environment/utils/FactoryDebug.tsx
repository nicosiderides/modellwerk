"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Leva, useControls } from "leva";
import { Fog } from "three";

const debugEnabled = process.env.NEXT_PUBLIC_FACTORY_DEBUG === "true";

export function FactoryLevaPanel() {
  return <Leva hidden={!debugEnabled} collapsed />;
}

export function FactoryDebugControls() {
  const renderer = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  const controls = useControls(
    "Factory",
    {
      exposure: { value: 1.08, min: 0.55, max: 1.55, step: 0.01 },
      fogNear: { value: 54, min: 10, max: 110, step: 1 },
      fogFar: { value: 146, min: 70, max: 220, step: 1 },
    },
    { collapsed: true }
  );

  useEffect(() => {
    if (!debugEnabled) return;
    renderer.toneMappingExposure = controls.exposure;
    scene.fog = new Fog(0xc9c4b8, controls.fogNear, controls.fogFar);
  }, [controls.exposure, controls.fogFar, controls.fogNear, renderer, scene]);

  return null;
}
