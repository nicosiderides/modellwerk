/**
 * MW Land — tipos compartidos del "cerebro" (sin pantallas).
 *
 * Todo valor normativo viaja con su fuente: de dónde sale y qué tan seguro es.
 * Nunca se muestra un número sin decir si es dato oficial, interpretación,
 * estimación, carga del usuario o si falta.
 */

/** Tipos de edificio de la primera etapa. */
export type BuildingTypeId = "vivienda" | "departamentos" | "oficinas" | "galpon";

/**
 * Qué tan seguro es un valor:
 * - dato: viene tal cual de la capa oficial (Mapas Córdoba / IDECOR).
 * - interpretado: se dedujo de un texto oficial (hay que confirmarlo).
 * - estimado: se calculó con datos del catastro (por ejemplo, el ancho de la calle).
 * - cargado: lo escribió el usuario.
 * - falta: no hay dato; queda "a verificar".
 */
export type SourceKind = "dato" | "interpretado" | "estimado" | "cargado" | "falta";

export type Source = { kind: SourceKind; text: string; url?: string };

export type Sourced<T> = { value: T | null; source: Source };

/** Retiro en altura: a partir de cierta altura la fachada se retira. */
export type UpperSetback = {
  /** Altura (m) a partir de la cual rige. */
  from: number;
  /** Distancia del retiro (m). */
  dist: number;
  /** Desde dónde se mide: la línea de edificación o el eje de la calle. */
  ref: "linea" | "eje";
};

/** Parámetros normativos de un lote para un grupo de uso. Valores en metros, factores 0–1. */
export type LandRules = {
  fos: Sourced<number>;
  fot: Sourced<number>;
  /** Altura máxima. `unlimited` = la zona no la limita. */
  maxHeight: Sourced<number> & { unlimited?: boolean };
  /** Altura sobre la línea de edificación (antes del retiro en altura). */
  heightAtLine: Sourced<number>;
  upperSetback: Sourced<UpperSetback>;
  /** La zona exige plano límite a 45° (no se dibuja: a verificar con el gráfico oficial). */
  plane45: boolean;
  maxFloors: Sourced<number>;
  setbackFront: Sourced<number>;
  setbackSide: Sourced<number>;
  /** En cuántos laterales rige el retiro lateral. */
  sideCount: 0 | 1 | 2;
  setbackBack: Sourced<number>;
  /** El retiro de fondo no rige en lotes de esquina. */
  backExceptCorner: boolean;
  /** m² de lote por cada unidad funcional (densidad). */
  areaPerUnit: Sourced<number>;
};

export type RuleKey = "fos" | "fot" | "maxHeight" | "heightAtLine" | "maxFloors" | "setbackFront" | "setbackSide" | "setbackBack" | "areaPerUnit";

/** Grupo de uso: algunas zonas cambian retiros según sea residencial o industrial. */
export type UseGroup = "residencial" | "industrial";

export type UseStatus = "si" | "condicionado" | "no" | "verificar";

export type UseVerdict = { status: UseStatus; text: string; source: Source };

/** Zona normativa del lote interpretada para MW Land. */
export type LandZone = {
  /** Perfil o zona (ej. "D", "C3", "IV"). */
  perfil: string;
  label: string;
  /** Carácter urbanístico (texto oficial, abreviado para mostrar). */
  caracter: string;
  /** Restricción a la actividad industrial (texto oficial). */
  industria: string;
  /** Patrón de uso del suelo de la Ord. 8133. */
  patron: string | null;
  /** Área particular o con norma propia: la capa no trae parámetros. */
  special: boolean;
  /** Ordenanza de origen. */
  ordinance: string;
  /** Enlace al gráfico oficial del perfil (si hay). */
  chart: string | null;
  /** Reglas por grupo de uso. */
  rules: Record<UseGroup, LandRules>;
  uses: Record<BuildingTypeId, UseVerdict>;
  notes: string[];
};

/** Centro de manzana según la capa de la Ord. 8256. */
export type BlockCenter = {
  kind: "tipica" | "no-exigible" | "otra";
  /** Texto oficial (modalidad). */
  label: string;
  source: Source;
};

/** Protección patrimonial en el lote. */
export type Heritage = { label: string; detail: string }[];
