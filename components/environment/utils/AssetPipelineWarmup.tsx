"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { createConfiguredGltfPipeline } from "./gltfPipeline";

export function AssetPipelineWarmup() {
  const renderer = useThree((state) => state.gl);

  useEffect(() => {
    const pipeline = createConfiguredGltfPipeline(renderer);
    return () => pipeline.dispose();
  }, [renderer]);

  return null;
}
