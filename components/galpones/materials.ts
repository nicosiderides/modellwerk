import { Color, DoubleSide, MeshStandardMaterial, type Material } from "three";
import type { ModelCategory } from "@/core/product-engine/types";
import type { SheetFinish, WarehouseConfig, WarehouseDefinition } from "@/core/galpones/types";
import { surfaceNormalMap, type SurfacePattern } from "@/components/product-viewer/materials/proceduralTextures";
import type { MaterialResolver } from "@/components/product-viewer/types";

/**
 * Librería de materiales web del galpón.
 *
 * Los materiales de autoría (Revit, IFC, procedural) se reemplazan por esta
 * librería PBR según `materialKey` (extras / metadata) o, si falta, según la
 * categoría semántica. Colores y terminaciones vienen de la configuración,
 * que a su vez los toma de envelope.json / structure.json (nada hardcodeado).
 */

type Spec = {
  color: string;
  metalness: number;
  roughness: number;
  pattern?: SurfacePattern;
  normalScale?: number;
  transparent?: boolean;
  opacity?: number;
  doubleSide?: boolean;
  envMapIntensity?: number;
};

const CATEGORY_FALLBACK: Record<ModelCategory, string> = {
  structure: "structure",
  columns: "structure",
  rafters: "structure",
  bracing: "bracing",
  purlins: "secondary",
  girts: "secondary",
  roof: "roofSheet",
  walls: "wallSheet",
  doors: "sectionalDoor",
  windows: "glass",
  skylights: "skylight",
  gutters: "gutter",
  foundations: "slab",
  canopy: "canopyRoof",
  equipment: "crane",
};

const roofPattern: Record<SheetFinish, SurfacePattern> = {
  trapezoidal: "trapezoidal",
  sandwich: "sandwichRoof",
  standingSeam: "standingSeam",
  precastSheet: "trapezoidal",
};

const wallPattern: Record<SheetFinish, SurfacePattern> = {
  trapezoidal: "trapezoidal",
  sandwich: "sandwichWall",
  standingSeam: "standingSeam",
  precastSheet: "trapezoidal",
};

function shade(hex: string, factor: number) {
  return `#${new Color(hex).multiplyScalar(factor).getHexString()}`;
}

export function materialSpecs(config: WarehouseConfig, definition: WarehouseDefinition): Record<string, Spec> {
  const env = definition.envelope;
  const color = (id: string) => env.colors.find((c) => c.id === id)?.hex ?? "#c4c6c3";
  const roof = env.roof.find((o) => o.id === config.envelope.roof) ?? env.roof[0];
  const walls = env.walls.find((o) => o.id === config.envelope.walls) ?? env.walls[0];
  const finish = definition.structure.finishes.find((f) => f.id === config.structureFinish);
  const galvanized = finish?.id === "galvanized";
  const roofColor = color(config.envelope.roofColor);
  const wallColor = color(config.envelope.wallColor);
  return {
    structure: { color: finish?.hex ?? "#5d666d", metalness: galvanized ? 0.78 : 0.45, roughness: galvanized ? 0.38 : 0.5 },
    secondary: { color: "#a9afb2", metalness: 0.75, roughness: 0.4 },
    bracing: { color: "#6b7277", metalness: 0.6, roughness: 0.45 },
    roofSheet: { color: roofColor, metalness: 0.4, roughness: 0.48, pattern: roofPattern[roof.finish], normalScale: 0.9 },
    canopyRoof: { color: roofColor, metalness: 0.4, roughness: 0.48, pattern: "trapezoidal", normalScale: 0.9 },
    wallSheet: { color: wallColor, metalness: 0.32, roughness: 0.52, pattern: wallPattern[walls.finish], normalScale: 0.85 },
    precast: { color: "#b6b1a6", metalness: 0, roughness: 0.92, pattern: "precast", normalScale: 0.6 },
    slab: { color: "#aaa69d", metalness: 0, roughness: 0.95, pattern: "slab", normalScale: 0.5 },
    footing: { color: "#8f8b82", metalness: 0, roughness: 0.95 },
    skylight: { color: "#f3f7f5", metalness: 0, roughness: 0.25, transparent: true, opacity: 0.55, doubleSide: true },
    sectionalDoor: { color: shade(wallColor, 1.05), metalness: 0.35, roughness: 0.45, pattern: "sectionalDoor", normalScale: 0.9 },
    personDoor: { color: "#495055", metalness: 0.4, roughness: 0.5 },
    trim: { color: "#3a4043", metalness: 0.5, roughness: 0.45 },
    glass: { color: "#8fa9b5", metalness: 0.6, roughness: 0.06, transparent: true, opacity: 0.42, envMapIntensity: 1.6 },
    gutter: { color: shade(roofColor, 0.92), metalness: 0.5, roughness: 0.4 },
    crane: { color: "#d4a020", metalness: 0.35, roughness: 0.5 },
  };
}

/** Clave estable para saber cuándo reasignar materiales. */
export function materialVersion(config: WarehouseConfig) {
  const e = config.envelope;
  return `${config.structureFinish}|${e.roof}|${e.walls}|${e.roofColor}|${e.wallColor}`;
}

export class WarehouseMaterialLibrary {
  private readonly materials = new Map<string, MeshStandardMaterial>();
  private readonly patterns = new Map<string, SurfacePattern | undefined>();

  update(specs: Record<string, Spec>) {
    for (const [key, spec] of Object.entries(specs)) {
      let material = this.materials.get(key);
      if (!material) {
        material = new MeshStandardMaterial({ name: `mw:${key}` });
        this.materials.set(key, material);
      }
      material.color.set(spec.color);
      material.metalness = spec.metalness;
      material.roughness = spec.roughness;
      material.transparent = Boolean(spec.transparent);
      material.opacity = spec.opacity ?? 1;
      material.depthWrite = !spec.transparent;
      material.side = spec.doubleSide ? DoubleSide : material.side;
      material.envMapIntensity = spec.envMapIntensity ?? 1;
      if (this.patterns.get(key) !== spec.pattern) {
        material.normalMap?.dispose();
        material.normalMap = spec.pattern ? surfaceNormalMap(spec.pattern) : null;
        this.patterns.set(key, spec.pattern);
      }
      if (material.normalMap) material.normalScale.set(spec.normalScale ?? 1, spec.normalScale ?? 1);
      material.needsUpdate = true;
    }
  }

  resolve: MaterialResolver = (materialKey, category) => {
    return (materialKey && this.materials.get(materialKey)) || this.materials.get(CATEGORY_FALLBACK[category]) || undefined;
  };

  get(key: string): Material | undefined {
    return this.materials.get(key);
  }
}
