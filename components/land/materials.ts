import { Color, DoubleSide, MeshStandardMaterial } from "three";
import type { ModelCategory } from "@/core/product-engine/types";
import { surfaceNormalMap, type SurfacePattern } from "@/components/product-viewer/materials/proceduralTextures";
import type { MaterialResolver } from "@/components/product-viewer/types";
import type { LandMaterialKey } from "@/core/land/kit/builder";
import type { LandConfig, LandSpec } from "@/core/land/design/types";

/**
 * Materiales web de los edificios de MW Land. Los colores y terminaciones
 * salen de la customización (envelope.json): nada fijo en el código.
 */

type Spec = { color: string; metalness: number; roughness: number; pattern?: SurfacePattern; normalScale?: number; transparent?: boolean; opacity?: number; doubleSide?: boolean; envMapIntensity?: number };

const FALLBACK: Partial<Record<ModelCategory, LandMaterialKey>> = {
  foundations: "plinth",
  structure: "slab",
  columns: "concrete",
  rafters: "concrete",
  walls: "wallMain",
  windows: "glass",
  purlins: "frame",
  doors: "door",
  roof: "roof",
  canopy: "slab",
  gutters: "railing",
  equipment: "core",
  girts: "fin",
  skylights: "solar",
  bracing: "pergola",
};

const shade = (hex: string, k: number) => `#${new Color(hex).multiplyScalar(k).getHexString()}`;

export function landMaterialSpecs(spec: LandSpec, cfg: LandConfig): Record<LandMaterialKey, Spec> {
  const env = spec.envelope;
  const color = (id: string, list = env.colors) => list.find((c) => c.id === id)?.hex ?? "#d9d4c9";
  const facade = env.facades.find((f) => f.id === cfg.facade) ?? env.facades[0];
  const main = facade.look.color ?? color(cfg.facadeColor);
  const accent = color(cfg.accentColor);
  const frame = color(cfg.frameColor, env.frames);
  const curtain = facade.id === "muro-cortina";
  return {
    plinth: { color: "#8f8b82", metalness: 0, roughness: 0.95, pattern: "slab", normalScale: 0.5 },
    slab: { color: "#c7c2b8", metalness: 0, roughness: 0.9, pattern: "slab", normalScale: 0.4 },
    concrete: { color: "#b3aea5", metalness: 0, roughness: 0.88, pattern: "precast", normalScale: 0.4 },
    steel: { color: "#4b5257", metalness: 0.6, roughness: 0.45 },
    wallMain: curtain ? { color: shade(color(cfg.facadeColor), 0.6), metalness: 0.5, roughness: 0.35 } : { color: main, metalness: 0, roughness: facade.look.roughness, pattern: facade.look.pattern, normalScale: facade.look.pattern === "precast" ? 0.7 : 0.25 },
    wallSide: { color: shade(main, 0.88), metalness: 0, roughness: 0.92, pattern: "smooth", normalScale: 0.2 },
    wallAccent: { color: accent, metalness: 0.05, roughness: 0.8 },
    glass: { color: "#8fa9b5", metalness: 0.6, roughness: 0.06, transparent: true, opacity: curtain ? 0.55 : 0.45, envMapIntensity: 1.6 },
    frame: { color: frame, metalness: 0.55, roughness: 0.4 },
    railing: { color: "#b8ccd4", metalness: 0.3, roughness: 0.08, transparent: true, opacity: 0.35, doubleSide: true },
    roof: { color: "#8c8a85", metalness: 0.1, roughness: 0.85 },
    core: { color: shade(main, 0.92), metalness: 0, roughness: 0.9 },
    door: { color: cfg.type === "vivienda" ? "#6b4a32" : shade(accent, 1.1), metalness: cfg.type === "vivienda" ? 0 : 0.35, roughness: 0.55 },
    deck: { color: "#9c7b5b", metalness: 0, roughness: 0.8 },
    fin: { color: frame, metalness: 0.6, roughness: 0.35 },
    solar: { color: "#1d2a3a", metalness: 0.5, roughness: 0.2 },
    water: { color: "#4fa3c7", metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.85 },
    pergola: { color: "#3a3f43", metalness: 0.5, roughness: 0.45 },
  };
}

export const landMaterialVersion = (cfg: LandConfig) => [cfg.facade, cfg.facadeColor, cfg.accentColor, cfg.frameColor, cfg.type].join("|");

export class LandMaterialLibrary {
  private readonly materials = new Map<string, MeshStandardMaterial>();
  private readonly patterns = new Map<string, SurfacePattern | undefined>();

  update(specs: Record<string, Spec>) {
    for (const [key, s] of Object.entries(specs)) {
      let m = this.materials.get(key);
      if (!m) {
        m = new MeshStandardMaterial({ name: `land:${key}` });
        this.materials.set(key, m);
      }
      m.color.set(s.color);
      m.metalness = s.metalness;
      m.roughness = s.roughness;
      m.transparent = Boolean(s.transparent);
      m.opacity = s.opacity ?? 1;
      m.depthWrite = !s.transparent;
      m.side = s.doubleSide ? DoubleSide : m.side;
      m.envMapIntensity = s.envMapIntensity ?? 1;
      if (this.patterns.get(key) !== s.pattern) {
        m.normalMap?.dispose();
        m.normalMap = s.pattern ? surfaceNormalMap(s.pattern) : null;
        this.patterns.set(key, s.pattern);
      }
      if (m.normalMap) m.normalScale.set(s.normalScale ?? 1, s.normalScale ?? 1);
      m.needsUpdate = true;
    }
  }

  resolve: MaterialResolver = (materialKey, category) => (materialKey && this.materials.get(materialKey)) || this.materials.get(FALLBACK[category] ?? "slab") || undefined;
}

/** Explosión por categoría: cuánto sube y cuánto se abre cada grupo de piezas. */
export const LAND_EXPLODE = {
  foundations: { up: -1.5, out: 0 },
  structure: { up: 1.2, out: 0 },
  columns: { up: 0.4, out: 0 },
  rafters: { up: 0.9, out: 0 },
  walls: { up: 0.6, out: 2.2 },
  windows: { up: 0.6, out: 3 },
  purlins: { up: 0.6, out: 3 },
  doors: { up: 0.4, out: 3.2 },
  roof: { up: 3, out: 0 },
  canopy: { up: 1, out: 1.5 },
  gutters: { up: 1, out: 2.5 },
  equipment: { up: 4, out: 0 },
  girts: { up: 0.8, out: 3.8 },
  skylights: { up: 4.5, out: 0 },
  bracing: { up: 0.6, out: 2 },
} as const;
