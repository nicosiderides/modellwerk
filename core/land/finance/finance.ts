/**
 * Simulación de inversión de MW Land. Todo en dólares; los pesos se muestran
 * con el tipo de cambio que carga el usuario. Cada entrada dice si es dato
 * real, estimado (demo), pendiente o cargado por el usuario: nunca se presenta
 * un valor de demostración como real.
 */

export type ValueStatus = "real" | "demo" | "pending" | "cargado";
export type Input = { value: number | null; status: ValueStatus; note: string };

export type FinanceMode = "venta" | "alquiler";

/** Precio por m² vendible o por unidad (departamento, oficina). */
export type PriceBasis = "m2" | "unidad";

export type FinanceInputs = {
  mode: FinanceMode;
  basis: PriceBasis;
  /** Precio del terreno (USD, total). */
  land: Input;
  /** Costo de obra por m² cubierto (USD). */
  costPerM2: Input;
  /** Extras de la customización (USD, total). */
  extras: Input;
  /** Otros costos: demolición, conexiones, etc. (USD, total). */
  other: Input;
  /** Honorarios profesionales (% del costo de obra). */
  feesPct: Input;
  /** Impuestos, sellos y derechos de construcción (% del costo de obra). */
  taxesPct: Input;
  /** Imprevistos (% del costo de obra). */
  contingencyPct: Input;
  /** Comisión de venta (% de las ventas). */
  commissionPct: Input;
  /** Precio de venta por m² vendible (USD). */
  salePerM2: Input;
  /** Alquiler mensual por m² vendible (USD). */
  rentPerM2Month: Input;
  /** Precio de venta por unidad (USD). */
  salePerUnit: Input;
  /** Alquiler mensual por unidad (USD). */
  rentPerUnitMonth: Input;
  /** Vacancia (% del año). */
  vacancyPct: Input;
  /** Gastos del propietario (% del alquiler). */
  opexPct: Input;
  buildMonths: Input;
  /** Meses de venta después de terminar la obra. */
  saleMonths: Input;
  /** Pesos por dólar (sólo para mostrar en pesos). */
  fx: Input;
};

export type FinanceArea = { built: number; sellable: number; lotArea: number; units?: number };

export type FinanceResult = {
  landCost: number;
  hardCost: number;
  extras: number;
  other: number;
  fees: number;
  taxes: number;
  contingency: number;
  investment: number;
  revenue: number;
  commission: number;
  netRevenue: number;
  profit: number;
  margin: number;
  roi: number;
  /** Tasa interna de retorno anual (flujo mensual simple). */
  irr: number | null;
  months: number;
  /** Venta: meses hasta recuperar; alquiler: años. */
  payback: number | null;
  paybackUnit: "meses" | "años";
  /** Precio mínimo de venta por m² para no perder. */
  breakEvenPerM2: number;
  /** Precio mínimo por unidad (si hay más de una). */
  breakEvenPerUnit: number | null;
  /** Alquiler: renta neta anual. */
  noi: number | null;
  yield: number | null;
  /** Hay entradas pendientes (sin valor): el resultado es parcial. */
  pending: string[];
  demo: string[];
};

const v = (i: Input) => i.value ?? 0;

export type FinanceKey = keyof Omit<FinanceInputs, "mode" | "basis">;

export const LABELS: Record<FinanceKey, string> = {
  land: "Terreno",
  costPerM2: "Costo de obra por m²",
  extras: "Extras elegidos",
  other: "Otros costos",
  feesPct: "Honorarios",
  taxesPct: "Impuestos y derechos",
  contingencyPct: "Imprevistos",
  commissionPct: "Comisión de venta",
  salePerM2: "Venta por m²",
  rentPerM2Month: "Alquiler por m² por mes",
  salePerUnit: "Venta por unidad",
  rentPerUnitMonth: "Alquiler por unidad por mes",
  vacancyPct: "Vacancia",
  opexPct: "Gastos del propietario",
  buildMonths: "Plazo de obra",
  saleMonths: "Plazo de venta",
  fx: "Tipo de cambio",
};

/** TIR mensual por bisección; devuelve la tasa anual equivalente. */
export function irrAnnual(flows: number[]): number | null {
  const npv = (r: number) => flows.reduce((s, f, i) => s + f / (1 + r) ** i, 0);
  let lo = -0.99;
  let hi = 1;
  let flo = npv(lo);
  const fhi = npv(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-6) return (1 + mid) ** 12 - 1;
    if (flo * fm < 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return (1 + (lo + hi) / 2) ** 12 - 1;
}

export function simulate(inputs: FinanceInputs, area: FinanceArea): FinanceResult {
  const pending: string[] = [];
  const demo: string[] = [];
  const perUnit = inputs.basis === "unidad" && (area.units ?? 0) > 0;
  const units = area.units ?? 0;
  const relevant: FinanceKey[] = ["land", "costPerM2", "extras", "other", "feesPct", "taxesPct", "contingencyPct", "buildMonths", ...(inputs.mode === "venta" ? ([perUnit ? "salePerUnit" : "salePerM2", "commissionPct", "saleMonths"] as const) : ([perUnit ? "rentPerUnitMonth" : "rentPerM2Month", "vacancyPct", "opexPct"] as const))];
  for (const k of relevant) {
    const i = inputs[k];
    if (i.value === null) pending.push(LABELS[k]);
    else if (i.status === "demo") demo.push(LABELS[k]);
  }
  const landCost = v(inputs.land);
  const hardCost = v(inputs.costPerM2) * area.built;
  const extras = v(inputs.extras);
  const other = v(inputs.other);
  const base = hardCost + extras;
  const fees = (base * v(inputs.feesPct)) / 100;
  const taxes = (base * v(inputs.taxesPct)) / 100;
  const contingency = (base * v(inputs.contingencyPct)) / 100;
  const investment = landCost + base + other + fees + taxes + contingency;
  const buildMonths = Math.max(1, Math.round(v(inputs.buildMonths)));

  if (inputs.mode === "venta") {
    const revenue = perUnit ? units * v(inputs.salePerUnit) : area.sellable * v(inputs.salePerM2);
    const commission = (revenue * v(inputs.commissionPct)) / 100;
    const netRevenue = revenue - commission;
    const profit = netRevenue - investment;
    const saleMonths = Math.max(1, Math.round(v(inputs.saleMonths)));
    const months = buildMonths + saleMonths;
    // Flujo: terreno al inicio, obra pareja durante el plazo, ventas parejas después.
    const flows = new Array(months + 1).fill(0);
    flows[0] -= landCost + other;
    for (let m = 1; m <= buildMonths; m += 1) flows[m] -= (investment - landCost - other) / buildMonths;
    for (let m = buildMonths + 1; m <= months; m += 1) flows[m] += netRevenue / saleMonths;
    const breakEvenPerM2 = area.sellable > 0 ? investment / (area.sellable * (1 - v(inputs.commissionPct) / 100)) : 0;
    const breakEvenPerUnit = units > 1 ? investment / (units * (1 - v(inputs.commissionPct) / 100)) : null;
    return { landCost, hardCost, extras, other, fees, taxes, contingency, investment, revenue, commission, netRevenue, profit, margin: revenue > 0 ? profit / revenue : 0, roi: investment > 0 ? profit / investment : 0, irr: investment > 0 ? irrAnnual(flows) : null, months, payback: profit >= 0 ? months : null, paybackUnit: "meses", breakEvenPerM2, breakEvenPerUnit, noi: null, yield: null, pending, demo };
  }

  const gross = (perUnit ? units * v(inputs.rentPerUnitMonth) : area.sellable * v(inputs.rentPerM2Month)) * 12;
  const noi = gross * (1 - v(inputs.vacancyPct) / 100) * (1 - v(inputs.opexPct) / 100);
  const years = 20;
  const flows = new Array(buildMonths + years * 12 + 1).fill(0);
  flows[0] -= landCost + other;
  for (let m = 1; m <= buildMonths; m += 1) flows[m] -= (investment - landCost - other) / buildMonths;
  for (let m = buildMonths + 1; m < flows.length; m += 1) flows[m] += noi / 12;
  const breakEvenPerM2 = area.sellable > 0 ? investment / area.sellable : 0;
  const breakEvenPerUnit = units > 1 ? investment / units : null;
  return {
    landCost,
    hardCost,
    extras,
    other,
    fees,
    taxes,
    contingency,
    investment,
    revenue: gross,
    commission: 0,
    netRevenue: noi,
    profit: noi * years - investment,
    margin: gross > 0 ? noi / gross : 0,
    roi: investment > 0 ? noi / investment : 0,
    irr: investment > 0 ? irrAnnual(flows) : null,
    months: buildMonths,
    payback: noi > 0 ? investment / noi : null,
    paybackUnit: "años",
    breakEvenPerM2,
    breakEvenPerUnit,
    noi,
    yield: investment > 0 ? noi / investment : null,
    pending,
    demo,
  };
}

/** "¿Qué pasa si…?": resultado moviendo una variable un porcentaje. */
export type SensitivityRow = { label: string; delta: number; profit: number; irr: number | null };

export function sensitivity(inputs: FinanceInputs, area: FinanceArea): SensitivityRow[] {
  const perUnit = inputs.basis === "unidad" && (area.units ?? 0) > 0;
  const price: FinanceKey = inputs.mode === "venta" ? (perUnit ? "salePerUnit" : "salePerM2") : perUnit ? "rentPerUnitMonth" : "rentPerM2Month";
  const scale = (key: FinanceKey, k: number): FinanceInputs => {
    const i = inputs[key] as Input;
    return { ...inputs, [key]: { ...i, value: i.value === null ? null : i.value * k } };
  };
  const rows: SensitivityRow[] = [];
  for (const d of [-0.2, -0.1, 0.1, 0.2]) {
    const r = simulate(scale(price, 1 + d), area);
    rows.push({ label: inputs.mode === "venta" ? "Precio de venta" : "Alquiler", delta: d, profit: r.profit, irr: r.irr });
  }
  for (const d of [-0.1, 0.1, 0.2]) {
    const r = simulate(scale("costPerM2", 1 + d), area);
    rows.push({ label: "Costo de obra", delta: d, profit: r.profit, irr: r.irr });
  }
  for (const extra of [6, 12]) {
    const r = simulate({ ...inputs, buildMonths: { ...inputs.buildMonths, value: v(inputs.buildMonths) + extra } }, area);
    rows.push({ label: `Obra ${extra} meses más larga`, delta: extra, profit: r.profit, irr: r.irr });
  }
  return rows;
}

/** Entradas por defecto (marcadas como demo o pendientes). */
export function defaultInputs(p: { costPerM2: number; salePerM2: number; rentPerM2Month: number; buildMonths: number; land: number | null; extras: number; note: string; sellable?: number; units?: number }): FinanceInputs {
  const demo = (value: number, note = p.note): Input => ({ value, status: "demo", note });
  const perUnitArea = p.units && p.units > 0 && p.sellable ? p.sellable / p.units : 0;
  return {
    mode: "venta",
    basis: "m2",
    salePerUnit: demo(Math.round((p.salePerM2 * perUnitArea) / 1000) * 1000, "Estimado demo: venta por m² × superficie promedio de cada unidad. Cargá el precio real por unidad."),
    rentPerUnitMonth: demo(Math.round((p.rentPerM2Month * perUnitArea) / 10) * 10, "Estimado demo: alquiler por m² × superficie promedio de cada unidad. Cargá el valor real."),
    land: p.land === null ? { value: null, status: "pending", note: "Cargá el precio del terreno (publicación, boleto o tasación)." } : demo(p.land, "Estimado demo: superficie del lote × valor de referencia por m² de tierra. Cargá el precio real."),
    costPerM2: demo(p.costPerM2),
    extras: { value: p.extras, status: "demo", note: "Suma de las opciones elegidas en la customización (valores demo)." },
    other: { value: 0, status: "cargado", note: "Demolición, conexiones, mensura, etc. Cargalo si corresponde." },
    feesPct: demo(8, "Referencia demo de honorarios (proyecto y dirección)."),
    taxesPct: demo(6, "Referencia demo: sellos, derechos de construcción y tasas."),
    contingencyPct: demo(5, "Reserva para imprevistos."),
    commissionPct: demo(3, "Comisión inmobiliaria de referencia."),
    salePerM2: demo(p.salePerM2),
    rentPerM2Month: demo(p.rentPerM2Month),
    vacancyPct: demo(5, "Referencia demo."),
    opexPct: demo(15, "Expensas, mantenimiento e impuestos a cargo del propietario (referencia)."),
    buildMonths: demo(p.buildMonths, "Plazo de obra de referencia para el tipo."),
    saleMonths: demo(6, "Meses para vender después de terminar (referencia)."),
    fx: { value: null, status: "pending", note: "Cargá el tipo de cambio para ver los montos en pesos." },
  };
}
