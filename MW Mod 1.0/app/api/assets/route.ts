import { env } from 'cloudflare:workers';
import {
  authorize,
  database,
  failure,
  HttpError,
  insertRecord,
  readLimited,
} from '@/lib/storage';
import { diagnoseGLB, diagnoseIFC } from '@/lib/model-diagnostics';
import type { Asset } from '@/lib/domain';
const MAX = 10 * 1024 * 1024;
export async function POST(req: Request) {
  try {
    const owner = authorize(req, true);
    if (Number(req.headers.get('content-length') || 0) > MAX + 10000)
      throw new HttpError('El límite del piloto es 10 MB por archivo.', 413);
    const bounded = await readLimited(req, MAX + 10000);
    const form = await new Response(bounded, { headers: { 'Content-Type': req.headers.get('content-type') || '' } }).formData(),
      file = form.get('file');
    if (!(file instanceof File) || !file.size || file.size > MAX)
      throw new HttpError('Elegí un archivo IFC o GLB de hasta 10 MB.');
    const kind = file.name.split('.').pop()?.toLowerCase();
    if (kind !== 'ifc' && kind !== 'glb')
      throw new HttpError('Solo se aceptan archivos .ifc y .glb.');
    const buffer = await file.arrayBuffer();
    const report =
      kind === 'ifc'
        ? diagnoseIFC(new TextDecoder().decode(buffer))
        : diagnoseGLB(buffer);
    const asset: Asset = {
      id: crypto.randomUUID(),
      name: file.name.slice(0, 150),
      kind,
      bytes: file.size,
      createdAt: new Date().toISOString(),
      report,
    };
    const bucket = env.FILES;
    if (!bucket)
      throw new HttpError(
        'El almacenamiento de archivos no está disponible.',
        503,
      );
    const key = `${encodeURIComponent(owner)}/${asset.id}`;
    await bucket.put(key, buffer, {
      httpMetadata: {
        contentType:
          kind === 'glb' ? 'model/gltf-binary' : 'application/octet-stream',
      },
    });
    try {
      await insertRecord(owner, asset.id, 'asset', asset);
    } catch (e) {
      await bucket.delete(key);
      throw e;
    }
    return Response.json({ asset }, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
export async function GET(req: Request) {
  try {
    const owner = authorize(req),
      id = new URL(req.url).searchParams.get('id');
    if (!id) throw new HttpError('Falta el archivo.');
    const db = await database();
    const record = await db
      .prepare(
        "SELECT id FROM mw_records WHERE owner=? AND id=? AND kind='asset'",
      )
      .bind(owner, id)
      .first();
    if (!record) throw new HttpError('Archivo no encontrado.', 404);
    const object = await env.FILES.get(`${encodeURIComponent(owner)}/${id}`);
    if (!object) throw new HttpError('Archivo no disponible.', 404);
    return new Response(object.body, {
      headers: {
        'Content-Type':
          object.httpMetadata?.contentType || 'application/octet-stream',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    return failure(e);
  }
}
