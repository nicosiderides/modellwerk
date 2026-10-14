import { MANEUVER_FACTOR, presetById, vehicleById, type RuleKey, type RuleSource } from "./lotRules.ts";
import { area, pavedAreaInLot, planSite, type SitePlan } from "./sitePlan.ts";
import type { WarehouseConfig, WarehouseDefinition } from "./types.ts";

/**
 * Verificación de implantación: normativa del lote + funcionamiento logístico.
 * Devuelve una lista tipo semáforo. Cada ítem dice qué se midió, contra qué
 * valor y de dónde sale ese valor (verificado o supuesto a confirmar).
 */

export type CheckStatus = "ok" | "warn" | "fail" | "info";
export type SiteCheck = {
  id: string;
  group: "Lote y normativa" | "Logística";
  label: string;
  status: CheckStatus;
  detail: string;
  source?: RuleSource;
};

export type SiteVerification = {
  plan: SitePlan;
  checks: SiteCheck[];
  summary: { ok: number; warn: number; fail: number };
  lot: { width: number; depth: number; area: number; front: number; left: number } | null;
  metrics: { covered: number; fos: number; fot: number; paved: number; green: number } | null;
};

const f1 = (v: number, d = 1) => v.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
const m2 = (v: number) => `${Math.round(v).toLocaleString("es-AR")} m²`;
const pct = (v: number) => `${Math.round(v * 100)} %`;

export function verifySite(config: WarehouseConfig, definition: WarehouseDefinition): SiteVerification {
  const plan = planSite(config, definition);
  const { lot, lay } = plan;
  const rules = lot.rules;
  const preset = presetById(lot.preset);
  const zone = lot.preset === "cordoba-zona" ? lot.location?.zone ?? null : null;
  const src = (k: RuleKey): RuleSource | undefined => {
    // Lote ubicado en el mapa: la fuente es la zona de la normativa (si el valor no se cambió).
    const fromZone = zone?.sources[k];
    if (fromZone && zone && zone.rules[k] === rules[k]) return fromZone;
    const fromPreset = preset.sources[k];
    const base = preset.rules[k];
    // Si el usuario cambió el valor, la fuente pasa a ser "dato cargado".
    if (fromPreset && base === rules[k]) return fromPreset;
    if (rules[k] !== null) return { text: "Valor cargado en la configuración", verified: false };
    return undefined;
  };
  const checks: SiteCheck[] = [];
  const push = (c: SiteCheck) => checks.push(c);
  const vehicle = vehicleById(lot.vehicle);
  const VL = vehicle.length;

  let lotInfo: SiteVerification["lot"] = null;
  let metrics: SiteVerification["metrics"] = null;

  if (plan.lotRect && plan.clear) {
    const L = plan.lotRect;
    const width = L.x1 - L.x0;
    const depth = L.z1 - L.z0;
    const lotArea = width * depth;
    lotInfo = { width, depth, area: lotArea, front: plan.clear.front, left: plan.clear.west };
    const covered = area(plan.footprint) + (plan.canopy ? area(plan.canopy) : 0);
    const paved = pavedAreaInLot(plan);
    const green = Math.max(0, lotArea - area(plan.footprint) - paved);
    metrics = { covered, fos: covered / lotArea, fot: covered / lotArea, paved, green };

    /* ── Lote y normativa ── */
    if (rules.minArea !== null) {
      push({ id: "lot-area", group: "Lote y normativa", label: "Superficie del lote", status: lotArea >= rules.minArea ? "ok" : "fail", detail: `${m2(lotArea)} · mínimo ${m2(rules.minArea)}`, source: src("minArea") });
    } else push({ id: "lot-area", group: "Lote y normativa", label: "Superficie del lote", status: "info", detail: `${m2(lotArea)} (${f1(width)} × ${f1(depth)} m)` });
    if (rules.minFront !== null) push({ id: "lot-front", group: "Lote y normativa", label: "Frente del lote", status: width >= rules.minFront ? "ok" : "fail", detail: `${f1(width)} m · mínimo ${f1(rules.minFront)} m`, source: src("minFront") });

    const fits = plan.clear.front >= 0 && plan.clear.back >= 0 && plan.clear.west >= 0 && plan.clear.east >= 0;
    push({
      id: "fits",
      group: "Lote y normativa",
      label: "Galpón dentro del lote",
      status: fits ? "ok" : "fail",
      detail: fits ? `Libre: frente ${f1(plan.clear.front)} · fondo ${f1(plan.clear.back)} · oeste ${f1(plan.clear.west)} · este ${f1(plan.clear.east)} m` : "El galpón sobrepasa algún lindero",
    });
    const sb = (id: string, label: string, value: number, need: number | null, key: RuleKey) => {
      if (need === null) return;
      push({ id, group: "Lote y normativa", label, status: value + 1e-6 >= need ? "ok" : "fail", detail: `${f1(value)} m · mínimo ${f1(need)} m`, source: src(key) });
    };
    sb("sb-front", "Retiro de frente", plan.clear.front, rules.setbackFront, "setbackFront");
    if (plan.sideSetback.count === 2) {
      sb("sb-west", "Retiro lateral oeste", plan.clear.west, rules.setbackSide, "setbackSide");
      sb("sb-east", "Retiro lateral este", plan.clear.east, rules.setbackSide, "setbackSide");
    } else if (plan.sideSetback.count === 1) {
      // Retiro en un solo lateral: alcanza con que uno de los dos lados lo cumpla.
      sb("sb-side", "Retiro lateral (un lado)", Math.max(plan.clear.west, plan.clear.east), rules.setbackSide, "setbackSide");
    }
    sb("sb-back", "Retiro de fondo", plan.clear.back, rules.setbackBack, "setbackBack");
    if (plan.canopy && rules.setbackFront !== null) {
      const intrudes = -plan.canopy.z0 - plan.oz;
      const free = plan.clear.front - intrudes;
      if (free < rules.setbackFront) push({ id: "sb-canopy", group: "Lote y normativa", label: "Marquesina dentro del retiro", status: "warn", detail: `Vuela ${f1(intrudes)} m sobre el retiro de frente: confirmar si el reglamento admite aleros o marquesinas.`, source: src("setbackFront") });
    }
    if (rules.fos !== null) push({ id: "fos", group: "Lote y normativa", label: "FOS (ocupación del suelo)", status: metrics.fos <= rules.fos + 1e-6 ? "ok" : "fail", detail: `${pct(metrics.fos)} · máximo ${pct(rules.fos)} (incluye marquesina)`, source: src("fos") });
    if (rules.fot !== null) push({ id: "fot", group: "Lote y normativa", label: "FOT (ocupación total)", status: metrics.fot <= rules.fot + 1e-6 ? "ok" : "fail", detail: `${f1(metrics.fot, 2)} · máximo ${f1(rules.fot, 2)} (una sola planta)`, source: src("fot") });
    if (rules.maxHeight !== null) push({ id: "height", group: "Lote y normativa", label: "Altura máxima", status: lay.ridge <= rules.maxHeight + 1e-6 ? "ok" : "fail", detail: `Cumbrera ${f1(lay.ridge, 2)} m · máximo ${f1(rules.maxHeight, 2)} m`, source: src("maxHeight") });
    else push({ id: "height", group: "Lote y normativa", label: "Altura máxima", status: "info", detail: `Cumbrera ${f1(lay.ridge, 2)} m · sin límite en la normativa cargada`, source: preset.sources.maxHeight });
    if (rules.forestOfFree !== null && rules.forestThreshold !== null) {
      if (lotArea >= rules.forestThreshold) {
        const freeNonBuildable = lotArea * (1 - (rules.fos ?? 0));
        const need = rules.forestOfFree * freeNonBuildable;
        push({
          id: "forest",
          group: "Lote y normativa",
          label: "Superficie forestada",
          status: green >= need ? "ok" : "warn",
          detail: `Verde ${m2(green)} · requerido ${m2(need)} (${pct(rules.forestOfFree)} de la superficie libre no edificable)`,
          source: src("forestOfFree"),
        });
      } else push({ id: "forest", group: "Lote y normativa", label: "Superficie forestada", status: "info", detail: `No aplica: el lote tiene menos de ${m2(rules.forestThreshold)}`, source: src("forestThreshold") });
    }

    /* ── Logística ── */
    const doorSides: { id: string; label: string; count: number; clear: number }[] = [
      { id: "front", label: "frente", count: plan.doors.front.length, clear: plan.clear.front },
      { id: "east", label: "lateral este", count: plan.doors.side.length, clear: plan.clear.east },
      { id: "back", label: "contrafrente", count: plan.doors.back.length, clear: plan.clear.back - (plan.parking?.side === "back" ? plan.parking.depth : 0) },
    ];
    for (const d of doorSides) {
      if (!d.count) continue;
      const inLot = d.clear + 0.01 >= VL + 1;
      push({
        id: `truck-${d.id}`,
        group: "Logística",
        label: `Camión en portón del ${d.label} dentro del lote`,
        status: inLot ? "ok" : "fail",
        detail: inLot ? `Libre ${f1(d.clear)} m para un vehículo de ${f1(VL, 2)} m` : `El camión sobresale ${f1(VL + 1 - d.clear)} m del lote: la carga y descarga debe hacerse dentro del predio`,
        source: { text: "Código de Edificación de Córdoba: el lugar de carga y descarga es un espacio del predio", url: "https://documentos.cordoba.gob.ar/MUNCBA/AreasGob/Desurb/CodigodeEdificacion.pdf", verified: true },
      });
      const need = VL * MANEUVER_FACTOR;
      push({
        id: `maneuver-${d.id}`,
        group: "Logística",
        label: `Maniobra a 90° frente a portones (${d.label})`,
        status: d.clear + 0.01 >= need ? "ok" : d.clear >= VL * 1.4 ? "warn" : "fail",
        detail: d.clear + 0.01 >= need ? `${f1(d.clear)} m libres · se recomiendan ${f1(need)} m` : `${f1(d.clear)} m libres · se recomiendan ${f1(need)} m para entrar de culata en una sola maniobra`,
        source: { text: `Criterio práctico de diseño: ≈ ${MANEUVER_FACTOR} × largo del vehículo (no es normativa)`, verified: false, kind: "criterio" },
      });
    }
    push({ id: "vehicle", group: "Logística", label: "Vehículo de diseño", status: "info", detail: vehicle.name, source: vehicle.source });

    if (plan.site.parking > 0) {
      const fitted = plan.parking?.stalls.length ?? 0;
      push({
        id: "parking",
        group: "Logística",
        label: "Estacionamiento",
        status: fitted >= plan.site.parking ? "ok" : fitted > 0 ? "warn" : "fail",
        detail: fitted >= plan.site.parking ? `${fitted} cocheras dentro del lote` : `Entran ${fitted} de ${plan.site.parking} cocheras pedidas`,
      });
      if (plan.parking?.side === "back" && !plan.driveways.length) push({ id: "parking-access", group: "Logística", label: "Acceso al estacionamiento del fondo", status: "fail", detail: "No hay lugar en el lateral oeste para un camino de 6,50 m." });
    }
    if (lot.corner !== "none" && rules.accessFromCorner !== null) {
      const truckGate = plan.gates[0];
      if (truckGate) {
        const dist = lot.corner === "east" ? L.x1 - truckGate.x1 : truckGate.x0 - L.x0;
        push({ id: "corner", group: "Logística", label: "Ingreso vehicular lejos de la esquina", status: dist >= rules.accessFromCorner ? "ok" : "fail", detail: `${f1(dist)} m a la esquina · mínimo ${f1(rules.accessFromCorner)} m`, source: src("accessFromCorner") });
      }
    }
    if (plan.gates.length) {
      const g = plan.gates[0];
      push({ id: "gate", group: "Logística", label: "Portón de ingreso de camiones", status: "info", detail: `${f1(g.x1 - g.x0)} m de ancho sobre la línea municipal` });
    }
  }

  const summary = { ok: checks.filter((c) => c.status === "ok").length, warn: checks.filter((c) => c.status === "warn").length, fail: checks.filter((c) => c.status === "fail").length };
  return { plan, checks, summary, lot: lotInfo, metrics };
}
