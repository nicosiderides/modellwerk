import assert from 'node:assert/strict';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const origin = 'http://localhost:3100';
const marker = `QA-${crypto.randomUUID()}`;
const createdIds = [];
const assertions = [];
const config = {
  product: 'office',
  quantity: 1,
  envelope: 'pir80',
  finish: 'chalk',
  glazing: 'standard',
  layout: 'linear',
};
async function post(body, expected = 200, headers = {}) {
  const r = await fetch(`${origin}/api/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, ...headers },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  assert.equal(r.status, expected, text);
  return r.headers.get('content-type')?.includes('json')
    ? JSON.parse(text)
    : { error: text };
}
async function findDatabases(dir) {
  const result = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) result.push(...(await findDatabases(p)));
    else if (e.name.endsWith('.sqlite') && !e.name.startsWith('metadata'))
      result.push(p);
  }
  return result;
}
try {
  const initial = await fetch(`${origin}/api/workspace`);
  assert.equal(initial.status, 200);
  const before = await initial.json();
  assert.ok(before.projects.length >= 3);
  assertions.push('Persistent workspace loads');
  const created = await post(
    {
      action: 'create',
      name: marker,
      client: 'QA ephemeral fixture',
      location: 'Local test',
      configuration: config,
    },
    201,
  );
  const id = created.projectId;
  createdIds.push(id);
  const loaded = await (await fetch(`${origin}/api/workspace`)).json();
  assert.ok(loaded.projects.some((p) => p.id === id));
  assertions.push('Created project survives a new request');
  await post(
    {
      action: 'create',
      name: 'Invalid',
      client: 'QA',
      location: 'Local',
      configuration: { ...config, quantity: 0 },
    },
    400,
  );
  assertions.push('Server rejects invalid configuration');
  await post({ action: 'save', id, revision: 0, configuration: config }, 409);
  assertions.push('Stale revisions cannot overwrite a project');
  const qresult = await post({ action: 'quote', id, revision: 1 });
  const q = qresult.workspace.quotes.find((q) => q.projectId === id);
  assert.equal(q.evaluation.total, 1840000);
  createdIds.push(q.id);
  const saved = await post({
    action: 'save',
    id,
    revision: 1,
    configuration: { ...config, quantity: 3, envelope: 'pir100' },
  });
  assert.equal(saved.workspace.projects.find((p) => p.id === id).revision, 2);
  assert.equal(
    saved.workspace.quotes.find((x) => x.id === q.id).evaluation.total,
    1840000,
  );
  assertions.push('Quote snapshot remains fixed after a configuration change');
  const checked = await post({
    action: 'check',
    id,
    revision: 2,
    step: 'documents',
    checked: true,
  });
  assert.equal(
    checked.workspace.projects.find((p) => p.id === id).checks.documents,
    true,
  );
  const revised = await post({
    action: 'save',
    id,
    revision: 2,
    configuration: { ...config, quantity: 4 },
  });
  assert.deepEqual(
    revised.workspace.projects.find((p) => p.id === id).checks,
    {},
  );
  assertions.push('Configuration revisions reset learning progress');
  await post({ action: 'save', id, revision: 3, configuration: config }, 403, {
    Origin: 'https://untrusted.example',
  });
  assertions.push('Cross-origin mutation rejected');
  const invalid = await fetch(`${origin}/api/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'null',
  });
  assert.equal(invalid.status, 400);
  const big = await fetch(`${origin}/api/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x: 'x'.repeat(65000) }),
  });
  assert.equal(big.status, 413);
  assertions.push('Malformed and oversized payloads rejected');
  const form = new FormData();
  form.set('file', new File(['not a GLB'], 'invalid.glb'));
  const upload = await fetch(`${origin}/api/assets`, {
    method: 'POST',
    body: form,
  });
  assert.equal(upload.status, 400);
  assertions.push('Malformed model rejected before storage');
  const unknown = await fetch(`${origin}/api/assets?id=nonexistent`);
  assert.equal(unknown.status, 404);
  assertions.push('Unknown asset never serves arbitrary bytes');
} finally {
  await cleanup();
}
async function cleanup() {
  // Delete only the exact records produced by this test. Never reset the user database.
  const dbRoot = path.resolve('.wrangler/state/v3/d1');
  for (const filename of await findDatabases(dbRoot)) {
    if (!filename.startsWith(dbRoot + path.sep))
      throw new Error('Unsafe cleanup path');
    const db = new DatabaseSync(filename);
    try {
      const exists = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='mw_records'",
        )
        .get();
      if (!exists) continue;
      const projects = db
        .prepare(
          "SELECT owner,id FROM mw_records WHERE kind='project' AND json_extract(payload,'$.name')=?",
        )
        .all(marker);
      for (const p of projects) {
        db.prepare(
          "DELETE FROM mw_records WHERE owner=? AND kind='quote' AND json_extract(payload,'$.projectId')=?",
        ).run(p.owner, p.id);
        db.prepare(
          "DELETE FROM mw_records WHERE owner=? AND kind='activity' AND instr(json_extract(payload,'$.message'),?)>0",
        ).run(p.owner, marker);
        db.prepare(
          "DELETE FROM mw_records WHERE owner=? AND id=? AND kind='project'",
        ).run(p.owner, p.id);
      }
    } finally {
      db.close();
    }
  }
  await mkdir('.verification', { recursive: true });
  await writeFile(
    '.verification/integration-results.json',
    JSON.stringify(
      { date: new Date().toISOString(), assertions, fixtureCleaned: true },
      null,
      2,
    ),
  );
}
console.log(
  `${assertions.length} integration checks passed. Test records removed.`,
);
