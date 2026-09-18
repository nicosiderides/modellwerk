"use client";

import { useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import {
  AdditiveBlending,
  DoubleSide,
  LinearSRGBColorSpace,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  Vector2,
} from "three";
import { assetPath } from "../utils/assetPath";

export type FactoryMaterialSet = {
  polishedConcrete: MeshPhysicalMaterial;
  darkEpoxy: MeshPhysicalMaterial;
  whiteSteel: MeshStandardMaterial;
  graphiteSteel: MeshStandardMaterial;
  galvanizedSteel: MeshStandardMaterial;
  craneYellow: MeshStandardMaterial;
  safetyYellow: MeshStandardMaterial;
  aluminum: MeshStandardMaterial;
  rubber: MeshStandardMaterial;
  birchPlywood: MeshStandardMaterial;
  osb: MeshStandardMaterial;
  clt: MeshStandardMaterial;
  sipPanel: MeshStandardMaterial;
  wallWhite: MeshStandardMaterial;
  glass: MeshStandardMaterial;
  glassDark: MeshStandardMaterial;
  translucentRoof: MeshStandardMaterial;
  led: MeshStandardMaterial;
  warmLuminaire: MeshStandardMaterial;
  screen: MeshStandardMaterial;
  lineWhite: MeshStandardMaterial;
  lineYellow: MeshStandardMaterial;
  floorStencil: MeshStandardMaterial;
  scuff: MeshBasicMaterial;
  volumetric: MeshBasicMaterial;
  fireRed: MeshStandardMaterial;
};

type TextureBundle = {
  map: Texture;
  arm?: Texture;
  normal?: Texture;
};

const texturePaths = {
  concrete: {
    map: assetPath("/textures/piso_cemento/concrete_floor_worn_001_diff_2k.jpg"),
  },
  birch: {
    map: assetPath("/textures/wood_oak/oak_veneer_01_diff_1k.jpg"),
  },
  osb: {
    map: assetPath("/textures/pared_madera/raw_plank_wall_diff_2k.jpg"),
  },
  metal: {
    map: assetPath("/textures/ext_chapa_vert/corrugated_iron_02_diff_1k.jpg"),
  },
} as const;

function configureTexture(texture: Texture, repeat: [number, number], srgb: boolean, anisotropy: number) {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = anisotropy;
  texture.colorSpace = srgb ? SRGBColorSpace : LinearSRGBColorSpace;
  texture.needsUpdate = true;
}

function configureBundle(bundle: TextureBundle, repeat: [number, number], anisotropy: number) {
  configureTexture(bundle.map, repeat, true, anisotropy);
  if (bundle.arm) configureTexture(bundle.arm, repeat, false, anisotropy);
  if (bundle.normal) configureTexture(bundle.normal, repeat, false, anisotropy);
}

export function useFactoryMaterials(): FactoryMaterialSet {
  const maxSupportedAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  const textureAnisotropy = Math.min(maxSupportedAnisotropy, 4);

  const concrete = useTexture(texturePaths.concrete) as TextureBundle;
  const birch = useTexture(texturePaths.birch) as TextureBundle;
  const osb = useTexture(texturePaths.osb) as TextureBundle;
  const metal = useTexture(texturePaths.metal) as TextureBundle;

  return useMemo(() => {
    configureBundle(concrete, [38, 20], textureAnisotropy);
    configureBundle(birch, [6, 6], textureAnisotropy);
    configureBundle(osb, [5, 5], textureAnisotropy);
    configureBundle(metal, [16, 12], textureAnisotropy);

    const polishedConcrete = new MeshPhysicalMaterial({
      color: 0xb2afa8,
      map: concrete.map,
      ...(concrete.arm ? { roughnessMap: concrete.arm } : {}),
      ...(concrete.normal ? { normalMap: concrete.normal } : {}),
      normalScale: new Vector2(0.075, -0.075),
      roughness: 0.82,
      metalness: 0,
      clearcoat: 0.035,
      clearcoatRoughness: 0.84,
      envMapIntensity: 0.34,
    });

    return {
      polishedConcrete,
      darkEpoxy: new MeshPhysicalMaterial({
        color: 0x3d4140,
        roughness: 0.7,
        metalness: 0.01,
        clearcoat: 0.06,
        clearcoatRoughness: 0.7,
        envMapIntensity: 0.42,
      }),
      whiteSteel: new MeshStandardMaterial({
        color: 0xe6e5df,
        roughness: 0.48,
        metalness: 0.42,
        envMapIntensity: 0.7,
      }),
      graphiteSteel: new MeshStandardMaterial({
        color: 0x202428,
        roughness: 0.42,
        metalness: 0.62,
        envMapIntensity: 0.85,
      }),
      galvanizedSteel: new MeshStandardMaterial({
        color: 0x9ca3a6,
        map: metal.map,
        ...(metal.arm ? { roughnessMap: metal.arm, metalnessMap: metal.arm } : {}),
        ...(metal.normal ? { normalMap: metal.normal } : {}),
        roughness: 0.54,
        metalness: 0.74,
        envMapIntensity: 0.72,
      }),
      craneYellow: new MeshStandardMaterial({
        color: 0xd6a525,
        roughness: 0.42,
        metalness: 0.5,
        envMapIntensity: 0.75,
      }),
      safetyYellow: new MeshStandardMaterial({
        color: 0xf0c94e,
        roughness: 0.62,
        metalness: 0.05,
      }),
      aluminum: new MeshStandardMaterial({
        color: 0xc5c9c9,
        roughness: 0.28,
        metalness: 0.78,
        envMapIntensity: 1,
      }),
      rubber: new MeshStandardMaterial({
        color: 0x111315,
        roughness: 0.82,
        metalness: 0,
      }),
      birchPlywood: new MeshStandardMaterial({
        color: 0xd6ba8c,
        map: birch.map,
        ...(birch.arm ? { roughnessMap: birch.arm } : {}),
        ...(birch.normal ? { normalMap: birch.normal } : {}),
        roughness: 0.68,
        metalness: 0,
        envMapIntensity: 0.32,
      }),
      osb: new MeshStandardMaterial({
        color: 0xc1a26d,
        map: osb.map,
        ...(osb.arm ? { roughnessMap: osb.arm } : {}),
        ...(osb.normal ? { normalMap: osb.normal } : {}),
        normalScale: new Vector2(0.34, -0.34),
        roughness: 0.86,
      }),
      clt: new MeshStandardMaterial({
        color: 0xd8bd87,
        map: birch.map,
        ...(birch.arm ? { roughnessMap: birch.arm } : {}),
        ...(birch.normal ? { normalMap: birch.normal } : {}),
        roughness: 0.72,
      }),
      sipPanel: new MeshStandardMaterial({
        color: 0xf0eee8,
        roughness: 0.58,
        metalness: 0.02,
      }),
      wallWhite: new MeshStandardMaterial({
        color: 0xf2f0ea,
        roughness: 0.52,
        metalness: 0.02,
      }),
      glass: new MeshStandardMaterial({
        color: 0xdfeaf0,
        transparent: true,
        opacity: 0.38,
        roughness: 0.08,
        metalness: 0,
        envMapIntensity: 1.35,
        side: DoubleSide,
        depthWrite: false,
      }),
      glassDark: new MeshStandardMaterial({
        color: 0x26343a,
        transparent: true,
        opacity: 0.52,
        roughness: 0.1,
        metalness: 0,
        envMapIntensity: 1.45,
        side: DoubleSide,
        depthWrite: false,
      }),
      translucentRoof: new MeshStandardMaterial({
        color: 0xf4f6ef,
        transparent: true,
        opacity: 0.5,
        roughness: 0.32,
        metalness: 0,
        side: DoubleSide,
        envMapIntensity: 0.85,
      }),
      led: new MeshStandardMaterial({
        color: 0xfff3c1,
        emissive: 0xffd989,
        emissiveIntensity: 1.85,
        roughness: 0.26,
      }),
      warmLuminaire: new MeshStandardMaterial({
        color: 0xfff7e5,
        emissive: 0xffedd0,
        emissiveIntensity: 1.24,
        roughness: 0.2,
      }),
      screen: new MeshStandardMaterial({
        color: 0x8ec7de,
        emissive: 0x4ba6c8,
        emissiveIntensity: 0.8,
        roughness: 0.18,
      }),
      lineWhite: new MeshStandardMaterial({
        color: 0xe9e4d8,
        roughness: 0.76,
        metalness: 0,
      }),
      lineYellow: new MeshStandardMaterial({
        color: 0xd2a747,
        roughness: 0.72,
        metalness: 0,
      }),
      floorStencil: new MeshStandardMaterial({
        color: 0xd9d5ca,
        roughness: 0.82,
        metalness: 0,
      }),
      scuff: new MeshBasicMaterial({
        color: 0x17191a,
        transparent: true,
        opacity: 0.055,
        depthWrite: false,
      }),
      volumetric: new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.026,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
      fireRed: new MeshStandardMaterial({
        color: 0xc5382f,
        roughness: 0.42,
        metalness: 0.24,
      }),
    };
  }, [birch, concrete, metal, osb, textureAnisotropy]);
}
