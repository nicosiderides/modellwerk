import type { ModelMetadataDocument } from "../../product-engine/types.ts";
import type { BuildingPlan, FloorPlan } from "../design/plan.ts";
import type { LandConfig, LandSpec } from "../design/types.ts";
import type { Rect } from "../design/usable.ts";
import { BoxGeometry, BufferGeometry, IcosahedronGeometry, Matrix4 } from "three";
import { unitsOnFloor } from "../design/units.ts";
import { box, LandBuilder, type LandMaterialKey } from "./builder.ts";

/**
 * Generadores de vivienda, departamentos y oficinas con el kit estándar.
 *
 * Criterio (igual que los galpones): todo sale de una grilla de estructura
 * (módulo del tipo), las piezas se repiten por módulo y por piso, las
 * aberturas quedan alineadas a la grilla y nada se superpone. Crecen sumando
 * módulos y pisos, no deformándose.
 */

export type SiteInfo = {
  /** Rectángulo edificable de planta baja (para patios, galería, pileta). */
  usable: Rect;
  /** Laterales sobre medianera (muro ciego). */
  party: { left: boolean; right: boolean };
};

export type GeneratedLand = { root: LandBuilder["root"]; metadata: ModelMetadataDocument; stats: { elements: number; meshes: number; triangles: number } };

type Opening = { kind: "window" | "store" | "door" | "garage" | "none"; width: number; height: number; sill: number };
type Side = "front" | "back" | "left" | "right";

const WALL = 0.2;
const PARAPET = 1.0;
const levelName = (i: number) => (i === 0 ? "Planta baja" : `Piso ${i}`);
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Posiciones de ejes de estructura entre a y b con un módulo dado (cantidad entera de módulos). */
export function gridLines(a: number, b: number, module: number) {
  const n = Math.max(1, Math.round((b - a) / module));
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
}

/** Diferencia de rectángulos alineados: lo que queda de a sin b (hasta 4 piezas). */
function rectMinus(a: Rect, b: Rect): Rect[] {
  const out: Rect[] = [];
  const zb0 = Math.max(a.z0, b.z0);
  const zb1 = Math.min(a.z1, b.z1);
  if (b.z0 > a.z0 + 0.05) out.push({ x0: a.x0, x1: a.x1, z0: a.z0, z1: Math.min(b.z0, a.z1) });
  if (b.z1 < a.z1 - 0.05) out.push({ x0: a.x0, x1: a.x1, z0: Math.max(b.z1, a.z0), z1: a.z1 });
  if (zb1 > zb0) {
    if (b.x0 > a.x0 + 0.05) out.push({ x0: a.x0, x1: Math.min(b.x0, a.x1), z0: zb0, z1: zb1 });
    if (b.x1 < a.x1 - 0.05) out.push({ x0: Math.max(b.x1, a.x0), x1: a.x1, z0: zb0, z1: zb1 });
  }
  return out.filter((r) => r.x1 - r.x0 > 0.2 && r.z1 - r.z0 > 0.2);
}

/**
 * Accesos vehiculares (en coordenadas del lote): la cochera de la vivienda
 * y la entrada al portón de cocheras o rampa al subsuelo de departamentos y oficinas.
 */
export function driveRects(spec: LandSpec, cfg: LandConfig, plan: BuildingPlan, site: SiteInfo): Rect[] {
  const r0 = plan.floors[0]?.rect;
  if (!r0) return [];
  const U = site.usable;
  const lineZ = Math.min(0, U.z0);
  const out: Rect[] = [];
  if (cfg.type === "vivienda" && cfg.options.cochera) {
    const gapL = r0.x0 - U.x0;
    const gapR = U.x1 - r0.x1;
    if (Math.max(gapL, gapR) >= 2.8) {
      const x0 = gapL >= gapR ? U.x0 + 0.1 : r0.x1 + 0.1;
      const x1 = gapL >= gapR ? r0.x0 - 0.1 : U.x1 - 0.1;
      out.push({ x0, x1, z0: lineZ, z1: Math.min(r0.z1, r0.z0 + 5.5) });
    }
  }
  const garage = (cfg.type === "departamentos" || cfg.type === "oficinas") && (cfg.options.cocheras || cfg.options.subsuelo);
  if (garage && r0.z0 - lineZ > 0.5) {
    const col = (spec.structure.systems.find((x) => x.id === cfg.structure) ?? spec.structure.systems[0]).column;
    const xs0 = gridLines(r0.x0, r0.x1, spec.building.grid.module);
    out.push({ x0: xs0[0] + col / 2, x1: Math.min(xs0[1] - col / 2, xs0[0] + col / 2 + 3.2), z0: lineZ, z1: r0.z0 });
  }
  return out;
}

/** Dónde estacionar un auto de referencia (se muestra con "Escala"). */
export function carSpots(spec: LandSpec, cfg: LandConfig, plan: BuildingPlan, site: SiteInfo): { x: number; z: number; rotation: number }[] {
  return driveRects(spec, cfg, plan, site)
    .filter((d) => d.x1 - d.x0 >= 2 && d.z1 - d.z0 >= 4.6)
    .map((d) => ({ x: (d.x0 + d.x1) / 2, z: d.z1 - 2.6, rotation: 0 }));
}

export function createLandBuilding(spec: LandSpec, cfg: LandConfig, plan: BuildingPlan, site: SiteInfo): GeneratedLand {
  const b = spec.building;
  const B = new LandBuilder(b.code);
  const structure = spec.structure.systems.find((s) => s.id === cfg.structure) ?? spec.structure.systems[0];
  const facade = spec.envelope.facades.find((f) => f.id === cfg.facade) ?? spec.envelope.facades[0];
  const glazing = spec.envelope.glazing.find((g) => g.id === cfg.glazing) ?? spec.envelope.glazing[0];
  const curtain = facade.id === "muro-cortina";
  const col = structure.column;
  const slabT = b.slab;
  const gridModule = b.grid.module;
  const floors = plan.floors;
  if (!floors.length || !plan.rect) return { root: B.root, metadata: B.document(`${b.code}-vacio`, b.name), stats: B.stats() };
  const isDeptos = cfg.type === "departamentos";
  const isOffice = cfg.type === "oficinas";
  const isHouse = cfg.type === "vivienda";
  const balconies = isDeptos && cfg.options.balcones;
  const fins = isOffice && cfg.options.parasoles;
  /** Retranqueo de la fachada de frente en los pisos (balcón o parasoles quedan adentro del volumen). */
  const frontRecess = (f: FloorPlan) => (f.index > 0 && balconies ? 1.2 : f.index > 0 && fins ? 0.6 : 0);
  const top = floors[floors.length - 1].base + floors[floors.length - 1].height;
  const mat = facade.name;
  /** Portón de cocheras en el primer módulo del frente (cocheras en planta baja o rampa al subsuelo). */
  const garageBay = (isDeptos || isOffice) && (Boolean(cfg.options.cocheras) || Boolean(cfg.options.subsuelo));

  /* ── platea ── */
  const r0 = floors[0].rect;
  B.add({ category: "foundations", key: "PLATEA", label: "Platea de fundación", family: "Platea de hormigón armado", material: "Hormigón H-25", parameters: { superficie_m2: r2((r0.x1 - r0.x0) * (r0.z1 - r0.z0)) } }, [{ geometry: [box(r0.x0 - 0.1, -0.35, r0.z0 - 0.1, r0.x1 + 0.1, 0.02, r0.z1 + 0.1)], materialKey: "plinth" }]);

  floors.forEach((f, fi) => {
    const r = f.rect;
    const level = levelName(f.index);
    const y0 = f.index === 0 ? 0.02 : f.base + slabT;
    const y1 = f.base + f.height;
    const xs = gridLines(r.x0, r.x1, gridModule);
    const zs = gridLines(r.z0, r.z1, gridModule);

    /* losa de este piso + terrazas que deja el retiro en altura */
    if (f.index > 0) {
      B.add({ category: "structure", key: `LOSA-${f.index}`, label: `Losa ${level.toLowerCase()}`, family: "Losa maciza de hormigón", type: `${slabT * 100} cm`, material: "Hormigón H-30", level, parameters: { superficie_m2: r2(f.area) } }, [{ geometry: [box(r.x0, f.base, r.z0, r.x1, f.base + slabT, r.z1)], materialKey: "slab" }]);
      const prev = floors[fi - 1].rect;
      const terraces = rectMinus(prev, r);
      if (terraces.length) {
        const geo = terraces.map((t) => box(t.x0, f.base, t.z0, t.x1, f.base + slabT, t.z1));
        const rails: BufferGeometry[] = [];
        if (r.z0 > prev.z0 + 0.3) rails.push(box(prev.x0, f.base + slabT, prev.z0, prev.x1, f.base + slabT + 1.0, prev.z0 + 0.04));
        B.add({ category: "roof", key: `TERRAZA-${f.index}`, label: `Terraza sobre ${levelName(f.index - 1).toLowerCase()}`, family: "Terraza transitable", material: "Losa con membrana y piso cerámico", level }, [{ geometry: geo, materialKey: "roof" }]);
        if (rails.length) B.add({ category: "gutters", key: `BARANDA-T${f.index}`, label: `Baranda de terraza ${level.toLowerCase()}`, family: "Baranda de vidrio laminado", material: "Vidrio 5+5", level }, [{ geometry: rails, materialKey: "railing" }]);
      }
    }

    /* columnas */
    const cols: BufferGeometry[] = [];
    for (const x of xs)
      for (const z of zs) {
        const cx = Math.min(r.x1 - col / 2, Math.max(r.x0 + col / 2, x));
        const cz = Math.min(r.z1 - col / 2, Math.max(r.z0 + col / 2, z));
        cols.push(box(cx - col / 2, y0, cz - col / 2, cx + col / 2, y1, cz + col / 2));
      }
    B.add({ category: "columns", key: `COL-${f.index}`, label: `Columnas ${level.toLowerCase()}`, family: structure.name, type: `${Math.round(col * 100)} × ${Math.round(col * 100)} cm`, material: structure.id === "steel" || structure.id === "metalica" ? "Acero" : "Hormigón armado", level, parameters: { cantidad: cols.length, modulo_m: gridModule } }, [{ geometry: cols, materialKey: structure.id === "steel" || structure.id === "metalica" || structure.id === "madera" ? "steel" : "concrete" }]);

    /* vigas perimetrales (borde de losa visible en fachada) */
    const beamH = 0.45;
    if (!curtain) {
      const beams = [box(r.x0, y1 - beamH, r.z0, r.x1, y1, r.z0 + WALL), box(r.x0, y1 - beamH, r.z1 - WALL, r.x1, y1, r.z1)];
      B.add({ category: "rafters", key: `VIGA-${f.index}`, label: `Vigas de borde ${level.toLowerCase()}`, family: "Viga de hormigón", material: "Hormigón armado", level }, [{ geometry: beams, materialKey: "concrete" }]);
    }

    /* fachadas */
    const sides: Side[] = ["front", "back", "left", "right"];
    for (const side of sides) {
      const party = (side === "left" && site.party.left && Math.abs(r.x0 - site.usable.x0) < 0.4) || (side === "right" && site.party.right && Math.abs(r.x1 - site.usable.x1) < 0.4);
      const along = side === "front" || side === "back" ? xs : zs;
      const recess = side === "front" ? frontRecess(f) : 0;
      const fixed = side === "front" ? r.z0 + recess : side === "back" ? r.z1 : side === "left" ? r.x0 : r.x1;
      const dir = side === "front" || side === "left" ? 1 : -1;
      const walls: BufferGeometry[] = [];
      const glass: BufferGeometry[] = [];
      const frames: BufferGeometry[] = [];
      const doors: BufferGeometry[] = [];
      const clear = y1 - y0 - (curtain ? 0 : beamH);
      const center = Math.floor((along.length - 1) / 2);
      for (let i = 0; i + 1 < along.length; i += 1) {
        const a0 = along[i];
        const a1 = along[i + 1];
        const bay = a1 - a0;
        let open: Opening;
        if (party) open = { kind: "none", width: 0, height: 0, sill: 0 };
        else if (f.index === 0 && side === "front" && (isDeptos || isOffice) && garageBay && i === 0 && bay >= 3) open = { kind: "garage", width: Math.min(3, bay - col - 0.2), height: 2.4, sill: 0 };
        else if (f.index === 0 && side === "front" && isOffice && cfg.options.locales && i !== center) open = { kind: "store", width: bay - col - 0.1, height: clear - 0.05, sill: 0 };
        else if (f.index === 0 && side === "front" && isDeptos && cfg.options.local && i === along.length - 2 && i !== center) open = { kind: "store", width: bay - col - 0.1, height: clear - 0.05, sill: 0 };
        else if (f.index === 0 && side === "front" && i === center) open = { kind: "door", width: isHouse ? 1.0 : 1.6, height: 2.2, sill: 0 };
        else if (curtain && !party) open = { kind: "store", width: bay - col - 0.05, height: clear - 0.05, sill: 0 };
        else {
          const h = glazing.ratio >= 0.8 ? clear - 0.1 : glazing.ratio >= 0.6 ? Math.min(2.2, clear - 0.15) : 1.5;
          const sill = glazing.ratio >= 0.8 ? 0.05 : glazing.ratio >= 0.6 ? 0.1 : Math.min(0.9, clear - h - 0.15);
          open = { kind: "window", width: Math.max(0.6, (bay - col) * Math.min(0.92, glazing.ratio + 0.2)), height: h, sill };
        }
        const span = (u0: number, u1: number, v0: number, v1: number, depth0: number, depth1: number) =>
          side === "front" || side === "back"
            ? box(u0, v0, fixed + dir * depth0, u1, v1, fixed + dir * depth1)
            : box(fixed + dir * depth0, v0, u0, fixed + dir * depth1, v1, u1);
        const wallTop = y1 - (curtain ? 0 : beamH);
        if (open.kind === "none" || open.width <= 0.1) {
          walls.push(span(a0, a1, y0, wallTop, 0, WALL));
          continue;
        }
        // Huecos del módulo: uno centrado o, si se eligió, dos ventanas por módulo (cada una centrada en su mitad).
        const holes: [number, number][] = [];
        if (open.kind === "window" && cfg.windowsPerBay === 2 && bay >= 3.2) {
          const half = bay / 2;
          const w = Math.max(0.6, (half - col / 2 - 0.25) * Math.min(0.92, glazing.ratio + 0.2));
          for (const c of [a0 + half / 2 + col / 4, a0 + half * 1.5 - col / 4]) holes.push([c - w / 2, c + w / 2]);
        } else {
          const m0 = a0 + (bay - open.width) / 2;
          holes.push([m0, m0 + open.width]);
        }
        const v0 = y0 + open.sill;
        const v1 = Math.min(wallTop - 0.02, v0 + open.height);
        // muro alrededor de los huecos
        let cursor = a0;
        for (const [m0, m1] of holes) {
          if (m0 - cursor > 0.02) walls.push(span(cursor, m0, y0, wallTop, 0, WALL));
          if (v0 - y0 > 0.02) walls.push(span(m0, m1, y0, v0, 0, WALL));
          if (wallTop - v1 > 0.02) walls.push(span(m0, m1, v1, wallTop, 0, WALL));
          cursor = m1;
        }
        if (a1 - cursor > 0.02) walls.push(span(cursor, a1, y0, wallTop, 0, WALL));
        // carpintería
        const fw = 0.06;
        for (const [m0, m1] of holes) {
          const ow = m1 - m0;
          frames.push(span(m0, m0 + fw, v0, v1, 0.05, 0.13), span(m1 - fw, m1, v0, v1, 0.05, 0.13), span(m0, m1, v0, v0 + fw, 0.05, 0.13), span(m0, m1, v1 - fw, v1, 0.05, 0.13));
          if (open.kind === "store" || ow > 2.4) {
            const n = Math.max(1, Math.round(ow / 1.5));
            for (let k = 1; k < n; k += 1) frames.push(span(m0 + (ow * k) / n - fw / 2, m0 + (ow * k) / n + fw / 2, v0, v1, 0.05, 0.13));
          }
          if (open.kind === "garage") doors.push(span(m0 + fw, m1 - fw, v0, v1 - fw, 0.07, 0.11));
          else if (open.kind === "door" && isHouse) doors.push(span(m0 + fw, m1 - fw, v0, v1 - fw, 0.07, 0.11));
          else glass.push(span(m0 + fw, m1 - fw, v0 + fw, v1 - fw, 0.085, 0.095));
        }
      }
      const label = { front: "frente", back: "contrafrente", left: "lateral izquierdo", right: "lateral derecho" }[side];
      const wallKey: LandMaterialKey = party ? "wallSide" : "wallMain";
      B.add({ category: "walls", key: `MURO-${side.toUpperCase()}-${f.index}`, label: `${party ? "Medianera" : "Fachada"} ${label}, ${level.toLowerCase()}`, family: party ? "Muro medianero" : curtain ? "Antepecho de muro cortina" : mat, material: party ? "Mampostería revocada" : mat, level }, [{ geometry: walls, materialKey: wallKey }]);
      B.add({ category: "windows", key: `VIDRIO-${side.toUpperCase()}-${f.index}`, label: `Vidrios ${label}, ${level.toLowerCase()}`, family: curtain ? "Muro cortina DVH" : "Ventana de aluminio con DVH", material: "Vidrio DVH 4/9/4", level }, [{ geometry: glass, materialKey: "glass" }]);
      B.add({ category: "purlins", key: `MARCO-${side.toUpperCase()}-${f.index}`, label: `Carpinterías ${label}, ${level.toLowerCase()}`, family: "Perfilería de aluminio", material: "Aluminio anodizado", level }, [{ geometry: frames, materialKey: "frame" }]);
      B.add({ category: "doors", key: `PUERTA-${side.toUpperCase()}-${f.index}`, label: `Puertas y portones ${label}`, family: isHouse ? "Puerta de entrada" : "Portón de cochera", material: isHouse ? "Madera maciza" : "Chapa prepintada", level }, [{ geometry: doors, materialKey: "door" }]);
    }

    /* tabiques entre unidades (se ven por las ventanas y en el corte por piso) */
    const nUnits = unitsOnFloor(spec, cfg, f);
    if (nUnits > 1) {
      const t = 0.12;
      const inner = { x0: r.x0 + WALL, x1: r.x1 - WALL, z0: r.z0 + frontRecess(f) + WALL, z1: r.z1 - WALL };
      const depth = inner.z1 - inner.z0;
      const rows = nUnits >= 4 && depth >= 14 ? 2 : 1;
      const cols = Math.ceil(nUnits / rows);
      const hTop = y1 - 0.3;
      const geo: BufferGeometry[] = [];
      const zm = (inner.z0 + inner.z1) / 2;
      const bands: [number, number][] = rows === 2 ? [[inner.z0, zm - 0.7], [zm + 0.7, inner.z1]] : [[inner.z0, inner.z1]];
      if (rows === 2) geo.push(box(inner.x0, y0, zm - 0.7 - t / 2, inner.x1, hTop, zm - 0.7 + t / 2), box(inner.x0, y0, zm + 0.7 - t / 2, inner.x1, hTop, zm + 0.7 + t / 2));
      for (const [z0, z1] of bands) {
        const n = rows === 2 && z0 > zm ? nUnits - cols : cols;
        for (let k = 1; k < Math.max(1, n); k += 1) {
          const x = inner.x0 + ((inner.x1 - inner.x0) * k) / n;
          geo.push(box(x - t / 2, y0, z0, x + t / 2, hTop, z1));
        }
      }
      if (geo.length) B.add({ category: "walls", key: `TABIQUES-${f.index}`, label: `Tabiques entre unidades, ${level.toLowerCase()}`, family: "Tabique divisorio", type: `${nUnits} unidades`, material: "Placa de yeso con aislación acústica", level, parameters: { unidades: nUnits } }, [{ geometry: geo, materialKey: "partition" }]);
    }

    /* balcones: baranda sobre la línea de fachada, la fachada va retirada 1,20 m */
    if (frontRecess(f) > 0 && balconies) {
      B.add({ category: "gutters", key: `BALCON-${f.index}`, label: `Baranda de balcón ${level.toLowerCase()}`, family: "Baranda de vidrio laminado con pasamanos", material: "Vidrio 5+5 y acero inoxidable", level }, [
        { geometry: [box(r.x0 + 0.1, y0, r.z0, r.x1 - 0.1, y0 + 1.0, r.z0 + 0.03)], materialKey: "railing" },
        { geometry: [box(r.x0 + 0.1, y0 + 1.0, r.z0 - 0.01, r.x1 - 0.1, y0 + 1.05, r.z0 + 0.05)], materialKey: "frame" },
      ]);
      // tabiques que separan balcones por módulo
      const walls = xs.slice(1, -1).map((x) => box(x - 0.08, y0, r.z0, x + 0.08, y1 - 0.45, r.z0 + 1.2));
      B.add({ category: "canopy", key: `BALCON-TAB-${f.index}`, label: `Separadores de balcón ${level.toLowerCase()}`, family: "Tabique de hormigón", material: "Hormigón visto", level }, [{ geometry: walls, materialKey: "wallAccent" }]);
    }
    if (frontRecess(f) > 0 && fins) {
      const n = Math.max(2, Math.round((r.x1 - r.x0) / 0.9));
      const geo = Array.from({ length: n + 1 }, (_, k) => r.x0 + 0.1 + ((r.x1 - r.x0 - 0.2) * k) / n).map((x) => box(x - 0.03, y0, r.z0 + 0.02, x + 0.03, y1, r.z0 + 0.5));
      B.add({ category: "girts", key: `PARASOL-${f.index}`, label: `Parasoles ${level.toLowerCase()}`, family: "Lamas verticales de aluminio", material: "Aluminio anodizado", level }, [{ geometry: geo, materialKey: "fin" }]);
    }
  });

  /* ── cubierta ── */
  const last = floors[floors.length - 1];
  const rl = last.rect;
  const pitched = isHouse && cfg.roof === "inclinada";
  if (pitched) {
    const rise = Math.min(1.6, (rl.z1 - rl.z0) * 0.12);
    const len = Math.hypot(rl.z1 - rl.z0 + 0.8, rise);
    const plate = box(rl.x0 - 0.4, -0.06, -len / 2, rl.x1 + 0.4, 0.06, len / 2);
    plate.applyMatrix4(new Matrix4().makeRotationX(-Math.atan2(rise, rl.z1 - rl.z0 + 0.8)));
    plate.translate(0, top + rise / 2 + 0.1, (rl.z0 + rl.z1) / 2);
    const gable = [box(rl.x0, top, rl.z0, rl.x0 + WALL, top + rise * 0.55, rl.z1), box(rl.x1 - WALL, top, rl.z0, rl.x1, top + rise * 0.55, rl.z1)];
    B.add({ category: "roof", key: "CUBIERTA", label: "Techo inclinado", family: "Cubierta de chapa a un agua", material: "Chapa prepintada con aislación", level: "Cubierta" }, [{ geometry: [plate], materialKey: "roof" }]);
    B.add({ category: "walls", key: "CARGAS", label: "Cargas laterales del techo", family: "Mampostería", material: mat, level: "Cubierta" }, [{ geometry: gable, materialKey: "wallMain" }]);
    B.add({ category: "structure", key: "LOSA-TECHO", label: "Losa de techo", family: "Losa", material: "Hormigón armado", level: "Cubierta" }, [{ geometry: [box(rl.x0, top, rl.z0, rl.x1, top + slabT, rl.z1)], materialKey: "slab" }]);
  } else {
    B.add({ category: "roof", key: "AZOTEA", label: "Azotea", family: "Cubierta plana", material: "Losa con aislación y membrana", level: "Cubierta", parameters: { superficie_m2: r2(last.area) } }, [{ geometry: [box(rl.x0, top, rl.z0, rl.x1, top + slabT, rl.z1)], materialKey: "roof" }]);
    const p = 0.15;
    const yP0 = top + slabT;
    const yP1 = yP0 + PARAPET;
    B.add({ category: "roof", key: "PARAPETO", label: "Parapetos de azotea", family: "Parapeto de mampostería", material: mat, level: "Cubierta" }, [
      { geometry: [box(rl.x0, yP0, rl.z0, rl.x1, yP1, rl.z0 + p), box(rl.x0, yP0, rl.z1 - p, rl.x1, yP1, rl.z1), box(rl.x0, yP0, rl.z0 + p, rl.x0 + p, yP1, rl.z1 - p), box(rl.x1 - p, yP0, rl.z0 + p, rl.x1, yP1, rl.z1 - p)], materialKey: "wallAccent" },
    ]);
  }

  /* ── núcleo de escalera y ascensor ── */
  if ((isDeptos || isOffice) && (floors.length >= 3 || cfg.options.ascensor)) {
    const cw = Math.min(3.4, (r0.x1 - r0.x0) * 0.4);
    const cd = Math.min(6, (r0.z1 - r0.z0) * 0.3);
    const cx = (rl.x0 + rl.x1) / 2;
    const cz1 = Math.min(rl.z1, r0.z1) - 0.2;
    const coreTop = top + (cfg.options.ascensor ? 2.8 : 2.4);
    B.add({ category: "equipment", key: "NUCLEO", label: cfg.options.ascensor ? "Núcleo de escalera y ascensor" : "Núcleo de escalera", family: "Núcleo de hormigón", material: "Hormigón armado", level: "Todos los niveles", parameters: { ascensor: Boolean(cfg.options.ascensor) } }, [{ geometry: [box(cx - cw / 2, 0.02, cz1 - cd, cx + cw / 2, coreTop, cz1)], materialKey: "core" }]);
  }

  /* ── exteriores y opciones ── */
  const U = site.usable;
  if (isHouse && cfg.options.galeria && U.z1 - r0.z1 > 1.8) {
    const d = Math.min(3, U.z1 - r0.z1 - 0.2);
    const h = Math.min(2.8, floors[0].height);
    B.add({ category: "canopy", key: "GALERIA", label: "Galería", family: "Galería con estructura metálica", material: "Acero y cubierta liviana", level: "Planta baja" }, [
      { geometry: [box(r0.x0, h, r0.z1, r0.x1, h + 0.12, r0.z1 + d)], materialKey: "roof" },
      { geometry: [box(r0.x0 + 0.1, 0.02, r0.z1 + d - 0.2, r0.x0 + 0.22, h, r0.z1 + d - 0.08), box(r0.x1 - 0.22, 0.02, r0.z1 + d - 0.2, r0.x1 - 0.1, h, r0.z1 + d - 0.08)], materialKey: "steel" },
      { geometry: [box(r0.x0, 0.02, r0.z1, r0.x1, 0.12, r0.z1 + d)], materialKey: "deck" },
    ]);
  }
  if (isHouse && cfg.options.cochera) {
    const gapL = r0.x0 - U.x0;
    const gapR = U.x1 - r0.x1;
    const gap = Math.max(gapL, gapR);
    if (gap >= 2.8) {
      const x0 = gapL >= gapR ? U.x0 + 0.1 : r0.x1 + 0.1;
      const x1 = gapL >= gapR ? r0.x0 - 0.1 : U.x1 - 0.1;
      const z0 = r0.z0;
      const z1 = Math.min(r0.z1, r0.z0 + 5.5);
      const posts = [box(x0, 0.02, z0, x0 + 0.1, 2.4, z0 + 0.1), box(x1 - 0.1, 0.02, z0, x1, 2.4, z0 + 0.1), box(x0, 0.02, z1 - 0.1, x0 + 0.1, 2.4, z1), box(x1 - 0.1, 0.02, z1 - 0.1, x1, 2.4, z1)];
      const slats = Array.from({ length: Math.max(3, Math.round((z1 - z0) / 0.5)) }, (_, k) => z0 + ((z1 - z0) * (k + 0.5)) / Math.max(3, Math.round((z1 - z0) / 0.5))).map((z) => box(x0, 2.4, z - 0.03, x1, 2.5, z + 0.03));
      B.add({ category: "bracing", key: "COCHERA", label: "Cochera cubierta", family: "Pérgola metálica", material: "Acero y policarbonato", level: "Planta baja" }, [{ geometry: [...posts, ...slats], materialKey: "pergola" }]);
    }
  }
  if (isHouse && cfg.options.pileta && U.z1 - r0.z1 > 6) {
    const z0 = r0.z1 + (cfg.options.galeria ? 3.6 : 1.5);
    const z1 = Math.min(U.z1 - 0.8, z0 + 3.5);
    const w = Math.min(7, r0.x1 - r0.x0 - 1);
    const x0 = (r0.x0 + r0.x1) / 2 - w / 2;
    if (z1 - z0 > 2) {
      B.add({ category: "bracing", key: "PILETA", label: "Pileta", family: "Pileta de hormigón", material: "Hormigón y venecitas", level: "Exterior" }, [
        { geometry: [box(x0 - 0.6, 0.0, z0 - 0.6, x0 + w + 0.6, 0.06, z1 + 0.6)], materialKey: "deck" },
        { geometry: [box(x0, 0.0, z0, x0 + w, 0.08, z1)], materialKey: "water" },
      ]);
    }
  }
  if (cfg.options.solar && !pitched) {
    const n = 6;
    const geo = Array.from({ length: n }, (_, k) => {
      const x = rl.x0 + 0.8 + k * 1.15;
      return x + 1.0 < rl.x1 - 0.5 ? box(x, top + slabT + 0.3, rl.z1 - 3.2, x + 1.0, top + slabT + 0.36, rl.z1 - 1.5) : null;
    }).filter((g): g is BufferGeometry => g !== null);
    B.add({ category: "skylights", key: "SOLAR", label: "Paneles solares", family: "Paneles fotovoltaicos", material: "Silicio monocristalino", level: "Cubierta" }, [{ geometry: geo, materialKey: "solar" }]);
  }
  if ((isDeptos && cfg.options.amenities) || (isOffice && cfg.options.terraza) || (isHouse && cfg.options.terraza && !pitched)) {
    const w = Math.min(8, rl.x1 - rl.x0 - 1.5);
    const z0 = rl.z0 + 1.2;
    const parts: { geometry: BufferGeometry[]; materialKey: LandMaterialKey }[] = [{ geometry: [box(rl.x0 + 0.4, top + slabT, z0, rl.x0 + 0.4 + w, top + slabT + 0.05, z0 + Math.min(6, rl.z1 - z0 - 1))], materialKey: "deck" }];
    if (isDeptos) parts.push({ geometry: [box(rl.x0 + 0.8, top + slabT + 0.05, z0 + 0.6, rl.x0 + 0.8 + Math.min(5, w - 0.8), top + slabT + 0.1, z0 + 3)], materialKey: "water" });
    B.add({ category: "canopy", key: "AZOTEA-USO", label: isDeptos ? "Amenities en la azotea" : "Terraza", family: "Deck y equipamiento", material: "Deck de madera", level: "Cubierta" }, parts);
  }

  /* ── entorno: accesos, parquizado y subsuelo ── */
  const lineZ = Math.min(0, U.z0);
  const doorX = (() => {
    const xs0 = gridLines(r0.x0, r0.x1, gridModule);
    const c = Math.floor((xs0.length - 1) / 2);
    return (xs0[c] + xs0[c + 1]) / 2;
  })();
  if (r0.z0 - lineZ > 0.8) {
    // Vereda de acceso desde la línea municipal hasta la puerta.
    B.add({ category: "bracing", key: "VEREDA-ACCESO", label: "Vereda de acceso", family: "Solado de hormigón peinado", material: "Hormigón peinado", level: "Exterior" }, [{ geometry: [box(doorX - 0.7, 0.0, lineZ, doorX + 0.7, 0.05, r0.z0)], materialKey: "paving" }]);
  }
  const drive: BufferGeometry[] = driveRects(spec, cfg, plan, site).map((d) => box(d.x0, 0.0, d.z0, d.x1, 0.04, d.z1));
  if (drive.length) B.add({ category: "bracing", key: "ACCESO-VEHICULAR", label: "Acceso vehicular", family: "Solado de hormigón", material: "Hormigón H-21", level: "Exterior" }, [{ geometry: drive, materialKey: "paving" }]);
  if (cfg.options.parquizado) {
    // Césped en lo libre del lugar edificable y árboles cada ~5 m donde hay lugar.
    const free = rectMinus(U, r0).filter((p) => p.x1 - p.x0 > 1 && p.z1 - p.z0 > 1);
    const lawn = free.map((p) => box(p.x0, 0.0, p.z0, p.x1, 0.03, p.z1));
    if (r0.z0 - lineZ > 1.5) lawn.push(box(U.x0, 0.0, lineZ, U.x1, 0.03, Math.max(lineZ + 0.1, U.z0)));
    const trunks: BufferGeometry[] = [];
    const crowns: BufferGeometry[] = [];
    // Lugares ocupados por galería, pileta, cochera y accesos: ahí no van árboles.
    const busy: Rect[] = drive.map((g) => {
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      return { x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z };
    });
    if (isHouse && cfg.options.galeria) busy.push({ x0: r0.x0, x1: r0.x1, z0: r0.z1, z1: r0.z1 + 3 });
    if (isHouse && cfg.options.pileta) {
      const z0 = r0.z1 + (cfg.options.galeria ? 3.6 : 1.5);
      const w = Math.min(7, r0.x1 - r0.x0 - 1);
      busy.push({ x0: (r0.x0 + r0.x1) / 2 - w / 2 - 0.6, x1: (r0.x0 + r0.x1) / 2 + w / 2 + 0.6, z0: z0 - 0.6, z1: z0 + 4.1 });
    }
    busy.push({ x0: doorX - 0.7, x1: doorX + 0.7, z0: lineZ, z1: r0.z0 });
    const isBusy = (x: number, z: number) => busy.some((b) => x > b.x0 - 1.3 && x < b.x1 + 1.3 && z > b.z0 - 1.3 && z < b.z1 + 1.3);
    for (const p of free) {
      if (p.x1 - p.x0 < 3 || p.z1 - p.z0 < 3) continue;
      const nx = Math.max(1, Math.floor((p.x1 - p.x0) / 5));
      const nz = Math.max(1, Math.floor((p.z1 - p.z0) / 5));
      for (let i = 0; i < nx; i += 1)
        for (let k = 0; k < nz; k += 1) {
          if (trunks.length >= 14) break;
          const x = p.x0 + ((p.x1 - p.x0) * (i + 0.5)) / nx;
          const z = p.z0 + ((p.z1 - p.z0) * (k + 0.5)) / nz;
          if (isBusy(x, z)) continue;
          const hgt = 3.4 + ((i * 7 + k * 3) % 4) * 0.35;
          trunks.push(new BoxGeometry(0.18, hgt * 0.55, 0.18).translate(x, (hgt * 0.55) / 2, z));
          crowns.push(new IcosahedronGeometry(1.1 + ((i + k) % 3) * 0.2, 1).scale(1, 1.15, 1).translate(x, hgt * 0.72, z));
        }
    }
    B.add({ category: "bracing", key: "PARQUIZADO", label: "Parquizado y árboles", family: "Césped y arbolado", material: "Césped y especies de mediano porte", level: "Exterior", parameters: { arboles: trunks.length } }, [
      { geometry: lawn, materialKey: "grass" },
      ...(trunks.length ? [{ geometry: trunks, materialKey: "trunk" as LandMaterialKey }, { geometry: crowns, materialKey: "foliage" as LandMaterialKey }] : []),
    ]);
  }
  if ((isDeptos || isOffice) && cfg.options.subsuelo) {
    const depthB = 3.0;
    B.add({ category: "foundations", key: "SUBSUELO", label: "Subsuelo de cocheras", family: "Subsuelo de hormigón armado", material: "Hormigón armado", level: "Subsuelo", parameters: { superficie_m2: r2((r0.x1 - r0.x0) * (r0.z1 - r0.z0)), cocheras: Math.floor(((r0.x1 - r0.x0) * (r0.z1 - r0.z0)) / 28) } }, [
      { geometry: [box(r0.x0, -depthB - 0.35, r0.z0, r0.x1, -depthB, r0.z1), box(r0.x0, -depthB, r0.z0, r0.x0 + WALL, -0.35, r0.z1), box(r0.x1 - WALL, -depthB, r0.z0, r0.x1, -0.35, r0.z1), box(r0.x0, -depthB, r0.z1 - WALL, r0.x1, -0.35, r0.z1)], materialKey: "concrete" },
    ]);
  }

  return { root: B.root, metadata: B.document(`${b.code}-${Math.round(plan.built)}m2`, `${b.name} · ${floors.length} plantas`), stats: B.stats() };
}
