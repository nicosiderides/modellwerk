import type { ModelCategory } from "./types.ts";

/**
 * Convención de nombres de nodos GLB.
 *
 *   <CODIGO>_<CATEGORIA>[_<CALIFICADOR>...]
 *
 *   GP03_COLUMNS_A-03          columna del eje A, pórtico 3
 *   WH01_STRUCTURE_COLUMNS     (forma corta del pedido original)
 *   GP03_ROOF_N-05             chapa de cubierta, faldón norte, módulo 5
 *
 * El nombre es sólo un respaldo: la fuente principal es la metadata externa
 * (`elementId` en glTF extras + `metadata.json`). Nunca dependemos únicamente
 * del nombre del mesh, porque los exportadores lo renombran con facilidad.
 */

const TOKEN_TO_CATEGORY: Record<string, ModelCategory> = {
  STRUCTURE: "structure",
  COLUMNS: "columns",
  COLUMN: "columns",
  RAFTERS: "rafters",
  RAFTER: "rafters",
  TRUSS: "rafters",
  TRUSSES: "rafters",
  PURLINS: "purlins",
  PURLIN: "purlins",
  BRACING: "bracing",
  GIRTS: "girts",
  GIRT: "girts",
  ROOF: "roof",
  WALLS: "walls",
  WALL: "walls",
  DOORS: "doors",
  DOOR: "doors",
  WINDOWS: "windows",
  WINDOW: "windows",
  SKYLIGHTS: "skylights",
  SKYLIGHT: "skylights",
  GUTTERS: "gutters",
  GUTTER: "gutters",
  FOUNDATIONS: "foundations",
  FOUNDATION: "foundations",
  SLAB: "foundations",
  CANOPY: "canopy",
  EQUIPMENT: "equipment",
  CRANE: "equipment",
};

const CATEGORY_TO_TOKEN: Record<ModelCategory, string> = {
  structure: "STRUCTURE",
  columns: "COLUMNS",
  rafters: "RAFTERS",
  purlins: "PURLINS",
  bracing: "BRACING",
  girts: "GIRTS",
  roof: "ROOF",
  walls: "WALLS",
  doors: "DOORS",
  windows: "WINDOWS",
  skylights: "SKYLIGHTS",
  gutters: "GUTTERS",
  foundations: "FOUNDATIONS",
  canopy: "CANOPY",
  equipment: "EQUIPMENT",
};

/** Construye un nombre de nodo según la convención. */
export function buildNodeName(code: string, category: ModelCategory, qualifier?: string) {
  const base = `${code.toUpperCase()}_${CATEGORY_TO_TOKEN[category]}`;
  return qualifier ? `${base}_${qualifier}` : base;
}

export type ParsedNodeName = {
  code: string;
  category: ModelCategory;
  qualifier?: string;
};

/**
 * Interpreta un nombre de nodo. Busca el token de categoría más específico
 * (STRUCTURE_COLUMNS → columns). Devuelve null si no respeta la convención.
 */
export function parseNodeName(name: string | undefined | null): ParsedNodeName | null {
  if (!name) return null;
  // GLTFLoader sanea nombres (espacios → _, puntos eliminados); tolerar ambos.
  const parts = name.trim().split(/[_\s]+/).filter(Boolean);
  if (parts.length < 2) return null;
  const code = parts[0];
  let category: ModelCategory | null = null;
  let lastCategoryIndex = -1;
  for (let i = 1; i < parts.length; i += 1) {
    const match = TOKEN_TO_CATEGORY[parts[i].toUpperCase()];
    if (!match) break;
    category = match;
    lastCategoryIndex = i;
  }
  if (!category) return null;
  const qualifier = parts.slice(lastCategoryIndex + 1).join("_") || undefined;
  return { code, category, qualifier };
}
