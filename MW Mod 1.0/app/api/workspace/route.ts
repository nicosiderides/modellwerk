import {
  authorize,
  body,
  database,
  failure,
  getProject,
  getWorkspace,
  HttpError,
  insertRecord,
} from '@/lib/storage';
import {
  assemblySteps,
  cleanText,
  evaluate,
  validateConfiguration,
  type Project,
  type Quote,
} from '@/lib/domain';
export async function GET(req: Request) {
  try {
    return Response.json(await getWorkspace(authorize(req)), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const owner = authorize(req, true),
      b = await body(req),
      now = new Date().toISOString();
    let message = '';
    if (b.action === 'create') {
      const p: Project = {
        id: crypto.randomUUID(),
        name: cleanText(b.name, 'Nombre'),
        client: cleanText(b.client, 'Cliente'),
        location: cleanText(b.location, 'Ubicación'),
        configuration: validateConfiguration(b.configuration),
        revision: 1,
        createdAt: now,
        updatedAt: now,
        checks: {},
      };
      await insertRecord(owner, p.id, 'project', p);
      message = `Se creó ${p.name}.`;
      await insertRecord(owner, crypto.randomUUID(), 'activity', {
        id: crypto.randomUUID(),
        message,
        createdAt: now,
      });
      return Response.json(
        { workspace: await getWorkspace(owner), projectId: p.id },
        { status: 201 },
      );
    }
    const id = cleanText(b.id, 'Proyecto'),
      p = await getProject(owner, id);
    if (b.revision !== p.revision)
      throw new HttpError(
        'Hay una revisión más nueva. Recargá el proyecto antes de guardar.',
        409,
      );
    const db = await database();
    if (b.action === 'save') {
      const next = {
        ...p,
        configuration: validateConfiguration(b.configuration),
        revision: p.revision + 1,
        updatedAt: now,
        checks: {},
      };
      const result = await db
        .prepare(
          "UPDATE mw_records SET payload=?,revision=?,updated_at=? WHERE owner=? AND id=? AND revision=? AND kind='project'",
        )
        .bind(JSON.stringify(next), next.revision, now, owner, id, p.revision)
        .run();
      if (!result.meta.changes)
        throw new HttpError(
          'Otra sesión cambió este proyecto. Recargá para continuar.',
          409,
        );
      message = `${p.name} · Se guardó la revisión R${String(next.revision).padStart(2, '0')}.`;
    } else if (b.action === 'quote') {
      const evaluation = evaluate(p.configuration);
      if (evaluation.errors.length)
        throw new HttpError(evaluation.errors.join(' '));
      const quote: Quote = {
        id: crypto.randomUUID(),
        projectId: id,
        projectName: p.name,
        client: p.client,
        revision: p.revision,
        createdAt: now,
        configuration: p.configuration,
        evaluation,
      };
      const result = await db
        .prepare(
          "INSERT INTO mw_records(owner,id,kind,revision,payload,updated_at) SELECT ?,?,'quote',1,?,? WHERE EXISTS(SELECT 1 FROM mw_records WHERE owner=? AND id=? AND revision=?)",
        )
        .bind(
          owner,
          quote.id,
          JSON.stringify(quote),
          now,
          owner,
          id,
          p.revision,
        )
        .run();
      if (!result.meta.changes)
        throw new HttpError(
          'La configuración cambió. Volvé a generar la estimación.',
          409,
        );
      message = `${p.name} · Estimación de R${String(p.revision).padStart(2, '0')} guardada.`;
    } else if (b.action === 'check') {
      if (
        typeof b.step !== 'string' ||
        !assemblySteps.some((s) => s.id === b.step) ||
        typeof b.checked !== 'boolean'
      )
        throw new HttpError('Paso de aprendizaje inválido.');
      const next = {
        ...p,
        checks: { ...p.checks, [b.step]: b.checked },
        updatedAt: now,
      };
      const result = await db
        .prepare(
          'UPDATE mw_records SET payload=?,updated_at=? WHERE owner=? AND id=? AND revision=? AND payload=?',
        )
        .bind(
          JSON.stringify(next),
          now,
          owner,
          id,
          p.revision,
          JSON.stringify(p),
        )
        .run();
      if (!result.meta.changes)
        throw new HttpError(
          'El recorrido cambió en otra sesión. Recargá para continuar.',
          409,
        );
      message = `${p.name} · Recorrido didáctico actualizado (sin liberación de fabricación).`;
    } else throw new HttpError('Acción no disponible.');
    await insertRecord(owner, crypto.randomUUID(), 'activity', {
      id: crypto.randomUUID(),
      message,
      createdAt: now,
    });
    return Response.json({ workspace: await getWorkspace(owner) });
  } catch (e) {
    return failure(e);
  }
}
