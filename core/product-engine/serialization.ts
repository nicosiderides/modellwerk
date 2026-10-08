/**
 * Serialización genérica de configuraciones de producto.
 * Envoltorio versionado + codificación base64url para URLs compartibles.
 */

export type SerializedConfiguration<T> = {
  schema: string;
  version: number;
  savedAt: string;
  data: T;
};

export function wrapConfiguration<T>(schema: string, version: number, data: T, now = new Date()): SerializedConfiguration<T> {
  return { schema, version, savedAt: now.toISOString(), data };
}

export function unwrapConfiguration<T>(value: unknown, schema: string): SerializedConfiguration<T> | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SerializedConfiguration<T>>;
  if (candidate.schema !== schema || typeof candidate.version !== "number" || !candidate.data) return null;
  return candidate as SerializedConfiguration<T>;
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** JSON → base64url (seguro para query strings). */
export function encodeForUrl(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** base64url → JSON. Devuelve null si el texto no es válido. */
export function decodeFromUrl<T = unknown>(value: string): T | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(new TextDecoder().decode(fromBase64(padded))) as T;
  } catch {
    return null;
  }
}
