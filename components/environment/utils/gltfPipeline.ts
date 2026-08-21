import type { WebGLRenderer } from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { assetPath } from "./assetPath";

export type ConfiguredGltfPipeline = {
  loader: GLTFLoader;
  dispose: () => void;
};

export function createConfiguredGltfPipeline(renderer: WebGLRenderer): ConfiguredGltfPipeline {
  const draco = new DRACOLoader();
  draco.setDecoderPath(assetPath("/draco/"));
  draco.preload();

  const ktx2 = new KTX2Loader();
  ktx2.setTranscoderPath(assetPath("/basis/"));
  ktx2.detectSupport(renderer);

  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  loader.setKTX2Loader(ktx2);
  loader.setMeshoptDecoder(MeshoptDecoder);

  return {
    loader,
    dispose: () => {
      draco.dispose();
      ktx2.dispose();
    },
  };
}
