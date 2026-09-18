import { env } from 'cloudflare:workers';
import { seedProjects, type Workspace, type Project } from './domain';
export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function authorize(req: Request, mutating = false) {
  const owner =
    req.headers.get('oai-authenticated-user-id') ||
    (process.env.NODE_ENV === 'development' ? 'mw-local-pilot' : null);
  if (!owner)
    throw new HttpError(
      'Iniciá sesión para acceder a este espacio privado.',
      401,
    );
  if (mutating) {
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin)
      throw new HttpError('Origen no permitido.', 403);
  }
  return owner;
}
export async function database() {
  const db = env.DB;
  if (!db)
    throw new HttpError(
      'No se pudo conectar con el almacenamiento. Tus cambios no se guardaron.',
      503,
    );
  await db.batch([
    db.prepare(
      'CREATE TABLE IF NOT EXISTS mw_records (owner TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, payload TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (owner,id))',
    ),
    db.prepare(
      'CREATE INDEX IF NOT EXISTS mw_owner_kind ON mw_records(owner,kind)',
    ),
  ]);
  return db;
}
export async function getWorkspace(owner: string): Promise<Workspace> {
  const db = await database();
  const seed = seedProjects();
  const now = new Date().toISOString();
  await db.batch([
    ...seed.map((p) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO mw_records(owner,id,kind,revision,payload,updated_at) SELECT ?,?,'project',?,?,? WHERE NOT EXISTS (SELECT 1 FROM mw_records WHERE owner=? AND id='initialized')",
        )
        .bind(owner, p.id, p.revision, JSON.stringify(p), now, owner),
    ),
    db
      .prepare(
        "INSERT OR IGNORE INTO mw_records(owner,id,kind,revision,payload,updated_at) VALUES(?,'initialized','meta',1,'{}',?)",
      )
      .bind(owner, now),
  ]);
  const result = await db
    .prepare(
      "SELECT kind,payload FROM mw_records WHERE owner=? AND kind IN ('project','quote','asset','activity') ORDER BY updated_at DESC",
    )
    .bind(owner)
    .all<{ kind: string; payload: string }>();
  const parsed = (kind: string) =>
    result.results
      .filter((r) => r.kind === kind)
      .map((r) => JSON.parse(r.payload));
  return {
    projects: parsed('project'),
    quotes: parsed('quote'),
    assets: parsed('asset'),
    activity: parsed('activity').slice(0, 20),
  };
}
export async function getProject(owner: string, id: string) {
  const db = await database();
  const row = await db
    .prepare(
      "SELECT payload FROM mw_records WHERE owner=? AND id=? AND kind='project'",
    )
    .bind(owner, id)
    .first<{ payload: string }>();
  if (!row) throw new HttpError('El proyecto no existe en este espacio.', 404);
  return JSON.parse(row.payload) as Project;
}
export async function insertRecord(
  owner: string,
  id: string,
  kind: string,
  payload: unknown,
) {
  const db = await database();
  await db
    .prepare(
      'INSERT INTO mw_records(owner,id,kind,revision,payload,updated_at) VALUES(?,?,?,1,?,?)',
    )
    .bind(owner, id, kind, JSON.stringify(payload), new Date().toISOString())
    .run();
}
export function failure(e: unknown) {
  return Response.json(
    {
      error:
        e instanceof Error
          ? e.message
          : 'Ocurrió un error. Intentá nuevamente.',
    },
    { status: e instanceof HttpError ? e.status : 400 },
  );
}
export async function readLimited(req: Request, limit: number) {
  if (Number(req.headers.get('content-length') || 0) > limit) throw new HttpError('La solicitud excede el tamaño permitido.', 413);
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError('La solicitud está vacía.');
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; length += value.byteLength; if (length > limit) { await reader.cancel(); throw new HttpError('La solicitud excede el tamaño permitido.', 413); } chunks.push(value); }
  const buffer = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  return buffer;
}
export async function body(req: Request) {
  const text = new TextDecoder().decode(await readLimited(req, 64000));
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError('La solicitud debe ser un objeto.');
  return value as Record<string,unknown>;
}
