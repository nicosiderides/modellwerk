import { decodeFromUrl, encodeForUrl, unwrapConfiguration, wrapConfiguration, type SerializedConfiguration } from "../product-engine/serialization.ts";
import type { WarehouseConfig } from "./types.ts";

/**
 * Guardar / cargar configuraciones.
 * Formato versionado `mw.galpones.config` v1. Guardado inicial en localStorage
 * y codificación para URLs compartibles (?c=...).
 */

export const CONFIG_SCHEMA = "mw.galpones.config";
export const CONFIG_VERSION = 1;
const SAVED_KEY = "mw-galpones:saved:v1";

export type SerializedWarehouseConfig = SerializedConfiguration<WarehouseConfig>;

export type SavedEntry = { id: string; name: string; config: SerializedWarehouseConfig };

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function serializeConfig(config: WarehouseConfig, now = new Date()): SerializedWarehouseConfig {
  return wrapConfiguration(CONFIG_SCHEMA, CONFIG_VERSION, config, now);
}

export function deserializeConfig(value: unknown): WarehouseConfig | null {
  const wrapped = unwrapConfiguration<WarehouseConfig>(value, CONFIG_SCHEMA);
  if (!wrapped || wrapped.version > CONFIG_VERSION) return null;
  const data = wrapped.data;
  if (!data || typeof data.warehouse !== "string" || !data.dimensions) return null;
  return data;
}

export function readSaved(storage: StorageLike | null): SavedEntry[] {
  try {
    const list = JSON.parse(storage?.getItem(SAVED_KEY) ?? "[]") as SavedEntry[];
    return Array.isArray(list) ? list.filter((entry) => deserializeConfig(entry.config)) : [];
  } catch {
    return [];
  }
}

export function writeSaved(storage: StorageLike | null, entries: SavedEntry[]) {
  try {
    storage?.setItem(SAVED_KEY, JSON.stringify(entries.slice(0, 24)));
    return true;
  } catch {
    return false;
  }
}

export function saveConfig(storage: StorageLike | null, name: string, config: WarehouseConfig): SavedEntry[] {
  const entry: SavedEntry = { id: `${Date.now().toString(36)}`, name, config: serializeConfig(config) };
  const next = [entry, ...readSaved(storage)];
  writeSaved(storage, next);
  return next;
}

export function deleteSaved(storage: StorageLike | null, id: string): SavedEntry[] {
  const next = readSaved(storage).filter((entry) => entry.id !== id);
  writeSaved(storage, next);
  return next;
}

/** Código compacto para compartir por URL. */
export function configToShareCode(config: WarehouseConfig) {
  return encodeForUrl(serializeConfig(config));
}

export function configFromShareCode(code: string): WarehouseConfig | null {
  return deserializeConfig(decodeFromUrl(code));
}
