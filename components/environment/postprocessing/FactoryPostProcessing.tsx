"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  HalfFloatType,
  LinearSRGBColorSpace,
  Vector2,
  WebGLRenderTarget,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import { SSRPass } from "three/examples/jsm/postprocessing/SSRPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { VignetteShader } from "three/examples/jsm/shaders/VignetteShader.js";
import type { RenderQuality } from "../utils/sceneTypes";

type FactoryPostProcessingProps = {
  quality: RenderQuality;
};

type PostStack = {
  composer: EffectComposer;
  ssr?: SSRPass;
  ssao?: SSAOPass;
  bloom?: UnrealBloomPass;
  smaa?: SMAAPass;
  vignette?: ShaderPass;
  renderTarget: WebGLRenderTarget;
};

function disposeStack(stack: PostStack | null) {
  if (!stack) return;
  stack.composer.dispose();
  stack.ssr?.dispose();
  stack.ssao?.dispose();
  stack.bloom?.dispose();
  stack.smaa?.dispose();
  stack.vignette?.dispose();
  stack.renderTarget.dispose();
}

function UltraPostProcessing() {
  const stackRef = useRef<PostStack | null>(null);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  useEffect(() => {
    const postPixelRatio = Math.min(gl.getPixelRatio(), 1.25);
    const renderTarget = new WebGLRenderTarget(size.width, size.height, {
      samples: gl.capabilities.isWebGL2 ? 2 : 0,
      type: HalfFloatType,
      colorSpace: LinearSRGBColorSpace,
    });

    const composer = new EffectComposer(gl, renderTarget);
    composer.setPixelRatio(postPixelRatio);
    composer.setSize(size.width, size.height);

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const ssr = new SSRPass({
      renderer: gl,
      scene,
      camera,
      width: Math.max(1, Math.floor(size.width)),
      height: Math.max(1, Math.floor(size.height)),
      selects: null,
      groundReflector: null,
    });
    ssr.opacity = 0.1;
    ssr.maxDistance = 24;
    ssr.thickness = 0.028;
    ssr.blur = true;
    ssr.resolutionScale = 0.42;
    ssr.distanceAttenuation = true;
    ssr.fresnel = true;
    ssr.bouncing = false;
    composer.addPass(ssr);

    const ssao = new SSAOPass(
      scene,
      camera,
      Math.floor(size.width * 0.5),
      Math.floor(size.height * 0.5),
      18
    );
    ssao.kernelRadius = 0.48;
    ssao.minDistance = 0.002;
    ssao.maxDistance = 0.1;

    const bloom = new UnrealBloomPass(
      new Vector2(size.width, size.height),
      0.052,
      0.18,
      0.9
    );

    const smaa = new SMAAPass();
    smaa.setSize(size.width * postPixelRatio, size.height * postPixelRatio);

    const vignette = new ShaderPass(VignetteShader);
    vignette.uniforms.offset.value = 0.92;
    vignette.uniforms.darkness.value = 0.24;

    composer.addPass(ssao);
    composer.addPass(bloom);
    composer.addPass(smaa);
    composer.addPass(vignette);
    composer.addPass(new OutputPass());

    stackRef.current = {
      composer,
      ssr,
      ssao,
      bloom,
      smaa,
      vignette,
      renderTarget,
    };

    return () => {
      disposeStack(stackRef.current);
      stackRef.current = null;
    };
  }, [camera, gl, scene, size.height, size.width]);

  useEffect(() => {
    const stack = stackRef.current;
    if (!stack) return;

    const postPixelRatio = Math.min(gl.getPixelRatio(), 1.25);
    stack.composer.setPixelRatio(postPixelRatio);
    stack.composer.setSize(size.width, size.height);
    stack.ssr?.setSize(size.width, size.height);
    stack.ssao?.setSize(Math.floor(size.width * 0.5), Math.floor(size.height * 0.5));
    stack.bloom?.setSize(size.width, size.height);
    stack.smaa?.setSize(size.width * postPixelRatio, size.height * postPixelRatio);
  }, [gl, size.height, size.width]);

  useFrame((_, delta) => {
    stackRef.current?.composer.render(delta);
  }, 1);

  return null;
}

export function FactoryPostProcessing({ quality }: FactoryPostProcessingProps) {
  return quality === "ultra" ? <UltraPostProcessing /> : null;
}
