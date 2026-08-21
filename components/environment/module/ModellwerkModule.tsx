"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useGLTF, useTexture } from "@react-three/drei";
import {
  Box3,
  BufferAttribute,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  LinearSRGBColorSpace,
  Material,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
} from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { assetPath } from "../utils/assetPath";
import type {
  ModuleHighlightGroup,
  ModuleMaterialKey,
  ModuleMaterialSelection,
  ModuleViewMode,
  RenderQuality,
  StationId,
} from "../utils/sceneTypes";
import { getStationConfig } from "../stations/stationsConfig";
import { getModuleMaterialOption } from "./moduleOptions";

const DEFAULT_MODULE_MODEL_URL = assetPath("/models/modulo_v01.glb");
const CM4000_MODULE_MODEL_URL = assetPath("/models/cm-4000-cv/full.glb");
const MWG9_MODULE_MODEL_URL = assetPath("/models/mw-g9/full.glb");
const MW900_MODULE_MODEL_URL = assetPath("/models/mw900/v002/structure.glb");
const DRACO_DECODER_PATH = assetPath("/draco/");
const MODULE_SURFACE_MATERIALS = new Set([
  "MAT_Piso_MaderaRoble",
  "MAT_Zocalos_Roble",
  "MAT_MurosExt_Madera",
  "MAT_Cielorraso_Pintura",
  "MAT_Techo_ChapaGalv",
]);

type ModellwerkModuleProps = {
  activeStationId: StationId;
  materialSelection: ModuleMaterialSelection;
  structureColor: string;
  exteriorFinishColor: string;
  interiorFinishColor: string;
  moduleModelPath: string;
  quality: RenderQuality;
  viewMode: ModuleViewMode;
};

type TextureBundle = {
  map: Texture;
  arm?: Texture;
  normal?: Texture;
};

type ModuleMaterialSet = Record<ModuleMaterialKey, MeshStandardMaterial> & {
  glass: MeshStandardMaterial;
  structure: MeshStandardMaterial;
  connection: MeshStandardMaterial;
  hardware: MeshStandardMaterial;
  sanitary: MeshStandardMaterial;
  led: MeshStandardMaterial;
  aluminumDoor: MeshStandardMaterial;
};

const texturePaths = {
  extWood: {
    map: assetPath("/textures/ext_madera_horiz/wood_planks_diff_1k.jpg"),
    arm: assetPath("/textures/ext_madera_horiz/wood_planks_arm_1k.jpg"),
    normal: assetPath("/textures/ext_madera_horiz/wood_planks_nor_gl_1k.jpg"),
  },
  sheet: {
    map: assetPath("/textures/ext_chapa_vert/corrugated_iron_02_diff_1k.jpg"),
    arm: assetPath("/textures/ext_chapa_vert/corrugated_iron_02_arm_1k.jpg"),
    normal: assetPath("/textures/ext_chapa_vert/corrugated_iron_02_nor_gl_1k.jpg"),
  },
  paint: {
    map: assetPath("/textures/int_pintura/painted_plaster_wall_diff_1k.jpg"),
    arm: assetPath("/textures/int_pintura/painted_plaster_wall_arm_1k.jpg"),
    normal: assetPath("/textures/int_pintura/painted_plaster_wall_nor_gl_1k.jpg"),
  },
  oak: {
    map: assetPath("/textures/wood_oak/oak_veneer_01_diff_1k.jpg"),
    arm: assetPath("/textures/wood_oak/oak_veneer_01_arm_1k.jpg"),
    normal: assetPath("/textures/wood_oak/oak_veneer_01_nor_gl_1k.jpg"),
  },
  woodFloor: {
    map: assetPath("/textures/piso_madera/wood_shutter_diff_2k.jpg"),
    arm: assetPath("/textures/piso_madera/wood_shutter_arm_2k.jpg"),
    normal: assetPath("/textures/piso_madera/wood_shutter_nor_dx_2k.jpg"),
  },
  concrete: {
    map: assetPath("/textures/piso_cemento/concrete_floor_worn_001_diff_2k.jpg"),
    arm: assetPath("/textures/piso_cemento/concrete_floor_worn_001_arm_2k.jpg"),
    normal: assetPath("/textures/piso_cemento/concrete_floor_worn_001_nor_dx_2k.jpg"),
  },
} as const;

function createProceduralSurface(kind: "micro-rib" | "corrugated" | "siding" | "osb") {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");

  if (!context) return new CanvasTexture(canvas);

  if (kind === "micro-rib") {
    context.fillStyle = "#f4f3ed";
    context.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 14) {
      context.fillStyle = "rgba(78, 83, 84, 0.18)";
      context.fillRect(x, 0, 2, 256);
      context.fillStyle = "rgba(255, 255, 255, 0.72)";
      context.fillRect(x + 2, 0, 2, 256);
    }
  } else if (kind === "corrugated") {
    context.fillStyle = "#e4e6e3";
    context.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 24) {
      const gradient = context.createLinearGradient(x, 0, x + 24, 0);
      gradient.addColorStop(0, "#aeb4b3");
      gradient.addColorStop(0.18, "#d6d9d7");
      gradient.addColorStop(0.48, "#f7f7f3");
      gradient.addColorStop(0.78, "#c7ccca");
      gradient.addColorStop(1, "#9da4a4");
      context.fillStyle = gradient;
      context.fillRect(x, 0, 24, 256);
    }
  } else if (kind === "siding") {
    context.fillStyle = "#efede6";
    context.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 64) {
      context.fillStyle = "rgba(62, 64, 62, 0.3)";
      context.fillRect(x, 0, 4, 256);
      context.fillStyle = "rgba(255, 255, 255, 0.55)";
      context.fillRect(x + 4, 0, 3, 256);
    }
  } else {
    context.fillStyle = "#c89e68";
    context.fillRect(0, 0, 256, 256);
    let seed = 1847;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const fleckColors = ["#8c633d", "#e0bc83", "#a87848", "#f0d29a", "#6f4d32"];
    for (let index = 0; index < 520; index += 1) {
      const x = random() * 256;
      const y = random() * 256;
      const length = 3 + random() * 13;
      const thickness = 0.8 + random() * 2.4;
      context.save();
      context.translate(x, y);
      context.rotate((random() - 0.5) * 1.25);
      context.fillStyle = fleckColors[Math.floor(random() * fleckColors.length)];
      context.globalAlpha = 0.46 + random() * 0.44;
      context.fillRect(-length / 2, -thickness / 2, length, thickness);
      context.restore();
    }
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

function configureBundle(bundle: TextureBundle, repeat: [number, number], normalY = 1) {
  bundle.map.wrapS = RepeatWrapping;
  bundle.map.wrapT = RepeatWrapping;
  bundle.map.repeat.set(...repeat);
  bundle.map.colorSpace = SRGBColorSpace;
  bundle.map.needsUpdate = true;

  if (bundle.arm) {
    bundle.arm.wrapS = RepeatWrapping;
    bundle.arm.wrapT = RepeatWrapping;
    bundle.arm.repeat.set(...repeat);
    bundle.arm.colorSpace = LinearSRGBColorSpace;
    bundle.arm.needsUpdate = true;
  }

  if (bundle.normal) {
    bundle.normal.wrapS = RepeatWrapping;
    bundle.normal.wrapT = RepeatWrapping;
    bundle.normal.repeat.set(...repeat);
    bundle.normal.colorSpace = LinearSRGBColorSpace;
    bundle.normal.userData.normalY = normalY;
    bundle.normal.needsUpdate = true;
  }
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[_\-.]/g, " ");
}

function normalizeMaterialName(value: string) {
  return value.trim();
}

function getMeshDescriptor(mesh: Mesh) {
  return [
    mesh.name,
    mesh.userData.revitCategory,
    mesh.userData.revitFamily,
    mesh.userData.revitType,
    mesh.userData.mw_category,
    mesh.userData.mw_role,
    mesh.userData.mw_profile,
    mesh.userData.mw_package,
    mesh.userData.mw_connection_family,
    mesh.userData.mw_sku,
  ]
    .filter((value) => typeof value === "string" && value.length > 0)
    .join(" ");
}

function buildTexturedMaterial(
  color: string,
  bundle: TextureBundle,
  {
    roughness,
    metalness,
    envMapIntensity,
    normalScale = 0.55,
  }: {
    roughness: number;
    metalness: number;
    envMapIntensity: number;
    normalScale?: number;
  }
) {
  const normalY = typeof bundle.normal?.userData.normalY === "number" ? bundle.normal.userData.normalY : 1;
  const material = new MeshStandardMaterial({
    color,
    map: bundle.map,
    normalScale: new Vector2(normalScale, normalScale * normalY),
    roughness,
    metalness,
    envMapIntensity,
  });

  if (bundle.arm) {
    material.roughnessMap = bundle.arm;
  }

  if (bundle.normal) {
    material.normalMap = bundle.normal;
  }

  if (metalness > 0 && bundle.arm) {
    material.metalnessMap = bundle.arm;
  }

  return material;
}

function useModuleMaterials(
  selection: ModuleMaterialSelection,
  structureColor: string,
  exteriorFinishColor: string,
  interiorFinishColor: string
): ModuleMaterialSet {
  const extWood = useTexture(texturePaths.extWood) as TextureBundle;
  const sheet = useTexture(texturePaths.sheet) as TextureBundle;
  const paint = useTexture(texturePaths.paint) as TextureBundle;
  const oak = useTexture(texturePaths.oak) as TextureBundle;
  const woodFloor = useTexture(texturePaths.woodFloor) as TextureBundle;
  const concrete = useTexture(texturePaths.concrete) as TextureBundle;
  const procedural = useMemo(
    () => ({
      microProfile: { map: createProceduralSurface("micro-rib") } as TextureBundle,
      corrugated: { map: createProceduralSurface("corrugated") } as TextureBundle,
      siding: { map: createProceduralSurface("siding") } as TextureBundle,
      osb: { map: createProceduralSurface("osb") } as TextureBundle,
    }),
    []
  );

  return useMemo(() => {
    configureBundle(extWood, [0.72, 0.72]);
    configureBundle(sheet, [0.86, 0.86]);
    configureBundle(paint, [0.5, 0.5]);
    configureBundle(oak, [0.85, 0.85]);
    configureBundle(woodFloor, [0.72, 0.72], -1);
    configureBundle(concrete, [0.62, 0.62], -1);
    configureBundle(procedural.microProfile, [1, 1]);
    configureBundle(procedural.corrugated, [1.15, 1]);
    configureBundle(procedural.siding, [0.72, 0.72]);
    configureBundle(procedural.osb, [0.72, 0.72]);

    const pickBundle = (key: ModuleMaterialKey) => {
      const option = getModuleMaterialOption(selection, key);
      if (option?.id === "pir-microprofile" || option?.id === "pir-roof-panel") return procedural.microProfile;
      if (option?.id === "corrugated-sheet") return procedural.corrugated;
      if (option?.id === "fiber-cement-siding") return procedural.siding;
      if (option?.id === "osb-visible") return procedural.osb;
      if (option?.id.includes("sheet") || option?.id.includes("aluminum")) return sheet;
      if (option?.id.includes("microcement") || option?.id.includes("homogeneous")) return concrete;
      if (option?.id.includes("floor")) return woodFloor;
      if (
        option?.id.includes("paint") ||
        option?.id.includes("ceiling") ||
        option?.id.includes("gypsum") ||
        option?.id.includes("sanitary")
      ) {
        return paint;
      }
      if (option?.id.includes("oak") || option?.id.includes("slats")) return oak;
      return extWood;
    };

    const make = (key: ModuleMaterialKey) => {
      const option = getModuleMaterialOption(selection, key);
      const baseColor = option?.color ?? "#ffffff";
      const shouldTintExterior = key === "EXT_REV" && option?.material !== "wood";
      const shouldTintInterior = key === "INT_PARED" && option?.material === "paint";
      const color = shouldTintExterior || shouldTintInterior
        ? `#${new Color(baseColor)
            .multiply(new Color(shouldTintExterior ? exteriorFinishColor : interiorFinishColor))
            .getHexString()}`
        : baseColor;
      const proceduralColor = option?.id === "osb-visible" ? "#ffffff" : color;
      if (option?.material === "metal") {
        if (key === "CARP") {
          const blackCarpentry = option.id === "black-aluminum";
          return new MeshStandardMaterial({
            color: blackCarpentry ? 0x050607 : color,
            roughness: blackCarpentry ? 0.64 : 0.42,
            metalness: blackCarpentry ? 0.32 : 0.58,
            envMapIntensity: blackCarpentry ? 0.22 : 0.54,
          });
        }
        return buildTexturedMaterial(proceduralColor, pickBundle(key), {
          roughness: option?.id === "corrugated-sheet" ? 0.42 : 0.54,
          metalness: option?.id === "corrugated-sheet" ? 0.62 : 0.48,
          envMapIntensity: 0.58,
          normalScale: option?.id === "corrugated-sheet" ? 0.48 : 0.18,
        });
      }

      if (option?.material === "concrete") {
        return buildTexturedMaterial(proceduralColor, pickBundle(key), {
          roughness: 0.78,
          metalness: 0,
          envMapIntensity: 0.36,
          normalScale: 0.06,
        });
      }

      return buildTexturedMaterial(proceduralColor, pickBundle(key), {
        roughness: option?.material === "paint" ? 0.68 : 0.76,
        metalness: 0,
        envMapIntensity: option?.material === "paint" ? 0.24 : 0.32,
        normalScale: option?.material === "paint" ? 0.06 : 0.12,
      });
    };

    const structureFinish =
      structureColor === "white"
        ? { color: 0xe4e2dc, roughness: 0.58, metalness: 0.5, envMapIntensity: 0.76 }
        : structureColor === "galvanized"
          ? { color: 0x9fa6a7, roughness: 0.5, metalness: 0.72, envMapIntensity: 0.86 }
          : { color: 0x202225, roughness: 0.7, metalness: 0.46, envMapIntensity: 0.68 };

    return {
      EXT_TECHO: make("EXT_TECHO"),
      EXT_REV: make("EXT_REV"),
      INT_PARED: make("INT_PARED"),
      INT_CIEL: make("INT_CIEL"),
      PISO: make("PISO"),
      CARP: make("CARP"),
      glass: new MeshStandardMaterial({
        color: 0x273a42,
        transparent: true,
        opacity: 0.66,
        roughness: 0.08,
        metalness: 0,
        envMapIntensity: 1.35,
        depthWrite: false,
        side: DoubleSide,
      }),
      structure: new MeshStandardMaterial({
        color: structureFinish.color,
        roughness: structureFinish.roughness,
        metalness: structureFinish.metalness,
        envMapIntensity: structureFinish.envMapIntensity,
      }),
      connection: new MeshStandardMaterial({
        color: 0xd9470e,
        roughness: 0.42,
        metalness: 0.62,
        envMapIntensity: 0.82,
      }),
      hardware: new MeshStandardMaterial({
        color: 0x111315,
        roughness: 0.36,
        metalness: 0.82,
        envMapIntensity: 0.58,
      }),
      sanitary: new MeshStandardMaterial({
        color: 0xf7f7f4,
        roughness: 0.18,
        metalness: 0,
        envMapIntensity: 0.45,
      }),
      led: new MeshStandardMaterial({
        color: 0xfff8e8,
        emissive: 0xfff1cf,
        emissiveIntensity: 1.1,
        roughness: 0.42,
      }),
      aluminumDoor: new MeshStandardMaterial({
        color: 0xe7e4dc,
        roughness: 0.38,
        metalness: 0.5,
        envMapIntensity: 0.7,
      }),
    };
  }, [concrete, exteriorFinishColor, extWood, interiorFinishColor, oak, paint, procedural, selection, sheet, structureColor, woodFloor]);
}

function getMaterialForSource(meshName: string, materialName: string, materials: ModuleMaterialSet): Material {
  const exactMaterial = normalizeMaterialName(materialName);
  if (exactMaterial === "MAT_MW900_MWLOCK_COPPER") return materials.connection;
  if (exactMaterial === "MAT_MW900_HARDWARE") return materials.hardware;
  if (
    exactMaterial === "MAT_MW900_PRIMARY_GRAPHITE" ||
    exactMaterial === "MAT_MW900_SECONDARY_STEEL" ||
    exactMaterial === "MAT_MW900_BRACING"
  ) {
    return materials.structure;
  }
  if (exactMaterial === "MAT_Piso_MaderaRoble") return materials.PISO;
  if (exactMaterial === "MAT_Zocalos_Roble") return materials.PISO;
  if (exactMaterial === "MAT_MurosExt_Madera") return materials.EXT_REV;
  if (exactMaterial.startsWith("MAT_MurosInt_")) return materials.INT_PARED;
  if (exactMaterial === "MAT_Aberturas_AluminioNegro") return materials.CARP;
  if (exactMaterial === "MAT_Vidrio") return materials.glass;
  if (exactMaterial === "MAT_Cielorraso_Pintura") return materials.INT_CIEL;
  if (exactMaterial === "MAT_Techo_ChapaGalv") return materials.EXT_TECHO;
  if (exactMaterial === "MAT_Estructura_AceroNegro") return materials.structure;
  if (exactMaterial === "MAT_Puerta_AluminioBlanco") return materials.aluminumDoor;

  const name = normalizeName(`${meshName} ${materialName}`);

  if (name.includes("vidrio") || name.includes("glass") || name.includes("cristal")) return materials.glass;
  if (name.includes("puerta alum")) return materials.aluminumDoor;
  if (name.includes("sanitario") || name.includes("inodoro") || name.includes("lavabo")) return materials.sanitary;
  if (name.includes("led") || name.includes("luminaria")) return materials.led;

  if (
    name.includes("tubo") ||
    name.includes("viga") ||
    name.includes("ipn") ||
    name.includes("columna") ||
    name.includes("estructura") ||
    name.includes("bastidor") ||
    name.includes("perfil") ||
    name.includes("correa") ||
    name.includes("cano")
  ) {
    return materials.structure;
  }

  if (name.includes("interior wall") || name.includes("int muro")) {
    return materials.INT_PARED;
  }

  if (name.includes("cielorraso") || name.includes("ceiling")) return materials.INT_CIEL;
  if (name.includes("ventana") || name.includes("carp") || name.includes("aluminio") || name.includes("abertura")) {
    return materials.CARP;
  }
  if (name.includes("piso") || name.includes("floor")) return materials.PISO;
  if (name.includes("techo") || name.includes("roof") || name.includes("cubierta")) return materials.EXT_TECHO;
  if (name.includes("muro") || name.includes("wall") || name.includes("panel") || name.includes("ext")) {
    return materials.EXT_REV;
  }

  return materials.EXT_REV;
}

function getModuleHighlightGroup(meshName: string, materialName: string): ModuleHighlightGroup {
  const exactMaterial = normalizeMaterialName(materialName);
  const name = normalizeName(`${meshName} ${materialName}`);

  if (exactMaterial === "MAT_Estructura_AceroNegro") return "structure";
  if (
    name.includes("tubo") ||
    name.includes("viga") ||
    name.includes("ipn") ||
    name.includes("columna") ||
    name.includes("estructura") ||
    name.includes("bastidor") ||
    name.includes("perfil") ||
    name.includes("correa")
  ) {
    return "structure";
  }

  if (exactMaterial === "MAT_Piso_MaderaRoble" || exactMaterial === "MAT_Zocalos_Roble") return "floor";
  if (name.includes("piso") || name.includes("floor") || name.includes("zocalo")) return "floor";

  if (exactMaterial === "MAT_Techo_ChapaGalv" || exactMaterial === "MAT_Cielorraso_Pintura") return "roof";
  if (name.includes("techo") || name.includes("roof") || name.includes("cubierta") || name.includes("cielorraso")) {
    return "roof";
  }

  if (
    exactMaterial === "MAT_Aberturas_AluminioNegro" ||
    exactMaterial === "MAT_Vidrio" ||
    exactMaterial === "MAT_Puerta_AluminioBlanco"
  ) {
    return "openings";
  }
  if (
    name.includes("vidrio") ||
    name.includes("glass") ||
    name.includes("ventana") ||
    name.includes("puerta") ||
    name.includes("carp") ||
    name.includes("abertura")
  ) {
    return "openings";
  }

  if (exactMaterial === "MAT_MurosExt_Madera" || exactMaterial.startsWith("MAT_MurosInt_")) return "walls";
  if (name.includes("muro") || name.includes("wall") || name.includes("panel")) return "walls";

  return "finishes";
}

function applyStationTreatment(
  material: Material,
  group: ModuleHighlightGroup,
  activeGroups: Set<ModuleHighlightGroup>,
  variantCache: Map<string, Material>
) {
  if (activeGroups.size === 0) return material;

  const focused = activeGroups.has(group);
  if (!focused) return material;

  const activeKey = Array.from(activeGroups).sort().join("|");
  const cacheKey = `${material.uuid}:${activeKey}:${group}:focus`;
  const cached = variantCache.get(cacheKey);
  if (cached) return cached;

  const clone = material.clone();
  clone.userData.stationClone = true;

  if ("emissive" in clone && clone instanceof MeshStandardMaterial) {
    clone.emissive = new Color(group === "openings" ? 0x050607 : 0xd2a747);
    clone.emissiveIntensity = group === "openings" ? 0.008 : 0.055;
  }

  if ("envMapIntensity" in clone && typeof clone.envMapIntensity === "number") {
    clone.envMapIntensity = group === "openings"
      ? Math.min(clone.envMapIntensity + 0.04, 2.4)
      : Math.min(clone.envMapIntensity + 0.18, 2.4);
  }

  variantCache.set(cacheKey, clone);
  return clone;
}

function disposeStationClone(material: Material | Material[], disposed = new Set<string>()) {
  const materials = Array.isArray(material) ? material : [material];
  materials.forEach((item) => {
    if (!item.userData.stationClone || disposed.has(item.uuid)) return;
    disposed.add(item.uuid);
    item.dispose();
  });
}

function getMeshMaterials(
  mesh: Mesh,
  materials: ModuleMaterialSet,
  activeGroups: Set<ModuleHighlightGroup>,
  variantCache: Map<string, Material>
): Material | Material[] {
  const sourceNames = getSourceMaterialNames(mesh);
  const meshDescriptor = getMeshDescriptor(mesh);

  if (sourceNames.length > 1) {
    return sourceNames.map((materialName) => {
      const material = getMaterialForSource(meshDescriptor, materialName, materials);
      const group = getModuleHighlightGroup(meshDescriptor, materialName);
      return applyStationTreatment(material, group, activeGroups, variantCache);
    });
  }

  const materialName = sourceNames[0] ?? "";
  const material = getMaterialForSource(meshDescriptor, materialName, materials);
  const group = getModuleHighlightGroup(meshDescriptor, materialName);
  return applyStationTreatment(material, group, activeGroups, variantCache);
}

function getSourceMaterialNames(mesh: Mesh) {
  if (Array.isArray(mesh.userData.sourceMaterialNames)) {
    return mesh.userData.sourceMaterialNames as string[];
  }

  return (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
    .map((material) => material?.name ?? "")
    .filter(Boolean);
}

function preserveSourceMaterialNames(mesh: Mesh) {
  if (Array.isArray(mesh.userData.sourceMaterialNames)) return;
  mesh.userData.sourceMaterialNames = (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
    .map((material) => material?.name ?? "")
    .filter(Boolean);
}

function getPrimaryHighlightGroup(mesh: Mesh): ModuleHighlightGroup {
  const sourceNames = getSourceMaterialNames(mesh);
  return getModuleHighlightGroup(getMeshDescriptor(mesh), sourceNames[0] ?? "");
}

function applyViewMode(mesh: Mesh, group: ModuleHighlightGroup, viewMode: ModuleViewMode) {
  if (viewMode === "full" || viewMode === "technical") {
    mesh.visible = true;
    return;
  }

  if (viewMode === "no-roof") {
    mesh.visible = group !== "roof";
    return;
  }

  if (viewMode === "structure") {
    mesh.visible = group === "structure";
    return;
  }

  if (viewMode === "structure-floor") {
    mesh.visible = group === "structure" || group === "floor";
    return;
  }

  if (viewMode === "interior") {
    mesh.visible = group !== "roof" && group !== "structure";
    return;
  }

  if (viewMode === "install") {
    mesh.visible = group === "structure" || group === "floor" || group === "roof" || group === "openings";
    return;
  }

  mesh.visible = true;
}

const BUILD_STAGE_BY_GROUP: Record<ModuleHighlightGroup, number> = {
  structure: 1,
  floor: 2,
  walls: 3,
  roof: 4,
  openings: 5,
  finishes: 6,
};

const BUILD_STAGE_BY_STATION: Record<StationId, number> = {
  overview: 6,
  structure: 1,
  floor: 2,
  walls: 3,
  roof: 4,
  openings: 5,
  finishes: 6,
  review: 6,
};

function applyConstructionStage(
  mesh: Mesh,
  group: ModuleHighlightGroup,
  activeStationId: StationId,
  viewMode: ModuleViewMode
) {
  if (activeStationId === "overview" || activeStationId === "review") {
    applyViewMode(mesh, group, viewMode);
    return;
  }

  mesh.visible = BUILD_STAGE_BY_GROUP[group] <= BUILD_STAGE_BY_STATION[activeStationId];
}

function isConfigurableSurface(mesh: Mesh) {
  return getSourceMaterialNames(mesh).some(
    (name) => MODULE_SURFACE_MATERIALS.has(name) || name.startsWith("MAT_MurosInt_")
  );
}

function snapNormal(normal: Vector3) {
  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);

  if (ay >= ax && ay >= az) return new Vector3(0, Math.sign(normal.y) || 1, 0);
  if (ax >= az) return new Vector3(Math.sign(normal.x) || 1, 0, 0);
  return new Vector3(0, 0, Math.sign(normal.z) || 1);
}

function rewriteArchitecturalSurfaceGeometry(mesh: Mesh) {
  if (mesh.userData.architecturalSurfaceRewritten) return;
  if (!isConfigurableSurface(mesh)) return;

  const sourceGeometry = mesh.geometry;
  const geometry = sourceGeometry.index ? sourceGeometry.toNonIndexed() : sourceGeometry.clone();
  const position = geometry.getAttribute("position");
  if (!position) return;

  if (!geometry.getAttribute("normal")) {
    geometry.computeVertexNormals();
  }

  const normal = geometry.getAttribute("normal");
  const box = new Box3();
  for (let index = 0; index < position.count; index += 1) {
    box.expandByPoint(new Vector3(position.getX(index), position.getY(index), position.getZ(index)));
  }
  const uvs = new Float32Array(position.count * 2);
  const snappedNormals = new Float32Array(position.count * 3);
  const currentNormal = new Vector3();

  for (let index = 0; index < position.count; index += 1) {
    currentNormal.fromBufferAttribute(normal, index);
    const snapped = snapNormal(currentNormal);
    snappedNormals[index * 3] = snapped.x;
    snappedNormals[index * 3 + 1] = snapped.y;
    snappedNormals[index * 3 + 2] = snapped.z;

    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const ax = Math.abs(snapped.x);
    const ay = Math.abs(snapped.y);
    const az = Math.abs(snapped.z);

    if (ay >= ax && ay >= az) {
      uvs[index * 2] = x - box.min.x;
      uvs[index * 2 + 1] = z - box.min.z;
    } else if (ax >= az) {
      uvs[index * 2] = z - box.min.z;
      uvs[index * 2 + 1] = y - box.min.y;
    } else {
      uvs[index * 2] = x - box.min.x;
      uvs[index * 2 + 1] = y - box.min.y;
    }
  }

  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.setAttribute("normal", new BufferAttribute(snappedNormals, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  mesh.geometry = geometry;
  mesh.userData.architecturalSurfaceRewritten = true;
}

export function ModellwerkModule({
  activeStationId,
  materialSelection,
  structureColor,
  exteriorFinishColor,
  interiorFinishColor,
  moduleModelPath,
  quality,
  viewMode,
}: ModellwerkModuleProps) {
  const moduleModelUrl = assetPath(moduleModelPath);
  const gltf = useGLTF(moduleModelUrl, DRACO_DECODER_PATH, true) as { scene: Group };
  const moduleScene = useMemo(() => cloneSkeleton(gltf.scene), [gltf.scene]);
  const materials = useModuleMaterials(
    materialSelection,
    structureColor,
    exteriorFinishColor,
    interiorFinishColor
  );
  const stationMaterialVariantsRef = useRef(new Map<string, Material>());
  const activeGroups = useMemo(
    () => new Set(getStationConfig(activeStationId).highlights),
    [activeStationId]
  );
  const moduleMeshes = useMemo(() => {
    const meshes: Mesh[] = [];

    moduleScene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      meshes.push(object);
    });

    return meshes;
  }, [moduleScene]);
  const moduleModelTransform = useMemo(() => {
    const bounds = new Box3();
    const meshBounds = new Box3();
    const center = new Vector3();

    moduleScene.updateMatrixWorld(true);
    moduleMeshes.forEach((object) => {
      if (object.name.startsWith("ENV_")) return;
      meshBounds.setFromObject(object);
      bounds.union(meshBounds);
    });

    if (bounds.isEmpty()) {
      return {
        position: [0, 0, 0] as [number, number, number],
        rotationY: 0,
      };
    }

    bounds.getCenter(center);
    const needsFactoryAxisAlignment = moduleModelPath === "/models/mw-g9/full.glb";

    return {
      position: needsFactoryAxisAlignment
        ? [-center.z, -bounds.min.y, center.x] as [number, number, number]
        : [-center.x, -bounds.min.y, -center.z] as [number, number, number],
      rotationY: needsFactoryAxisAlignment ? Math.PI / 2 : 0,
    };
  }, [moduleMeshes, moduleModelPath, moduleScene]);

  useLayoutEffect(() => {
    moduleMeshes.forEach((object) => {
      if (object.name.startsWith("ENV_")) {
        object.visible = false;
        return;
      }

      preserveSourceMaterialNames(object);
      object.userData.moduleHighlightGroup = getPrimaryHighlightGroup(object);
      object.receiveShadow = false;
      object.frustumCulled = true;
      rewriteArchitecturalSurfaceGeometry(object);
    });
  }, [moduleMeshes]);

  useEffect(() => {
    moduleMeshes.forEach((object) => {
      if (object.name.startsWith("ENV_")) return;
      object.castShadow = quality !== "performance";
    });
  }, [moduleMeshes, quality]);

  useEffect(() => {
    moduleMeshes.forEach((object) => {
      if (object.name.startsWith("ENV_")) return;
      const group = object.userData.moduleHighlightGroup as ModuleHighlightGroup;
      applyConstructionStage(object, group, activeStationId, viewMode);
      object.material = getMeshMaterials(object, materials, activeGroups, stationMaterialVariantsRef.current);
    });
  }, [activeGroups, activeStationId, materials, moduleMeshes, viewMode]);

  useEffect(() => {
    const stationMaterialVariants = stationMaterialVariantsRef.current;

    return () => {
      const disposed = new Set<string>();
      stationMaterialVariants.forEach((material) => disposeStationClone(material, disposed));
      moduleScene.traverse((object) => {
        if (object instanceof Mesh) disposeStationClone(object.material, disposed);
      });
      stationMaterialVariants.clear();
    };
  }, [moduleScene]);

  return (
    <group
      name="ModellwerkModuleVisualizer"
      position={moduleModelTransform.position}
      rotation-y={moduleModelTransform.rotationY}
    >
      <primitive object={moduleScene} />
    </group>
  );
}

useGLTF.preload(DEFAULT_MODULE_MODEL_URL, DRACO_DECODER_PATH, true);
useGLTF.preload(CM4000_MODULE_MODEL_URL, DRACO_DECODER_PATH, true);
useGLTF.preload(MWG9_MODULE_MODEL_URL, DRACO_DECODER_PATH, true);
useGLTF.preload(MW900_MODULE_MODEL_URL, DRACO_DECODER_PATH, true);
