import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultConfiguration,
  evaluate,
  validateConfiguration,
} from '../lib/domain.ts';
import { diagnoseIFC, diagnoseGLB } from '../lib/model-diagnostics.ts';

await test('Prices use integer cents and include each configured option per module', () => {
  const result = evaluate({
    ...defaultConfiguration(),
    quantity: 3,
    envelope: 'pir100',
    finish: 'sage',
    glazing: 'dvh',
  });
  assert.equal(result.total, 6642000);
  assert.equal(result.area, 54);
  assert.equal(result.status, 'estimate');
  assert.ok(result.lines.every((l) => Number.isInteger(l.total)));
});
await test('Untrusted quantities and unknown catalog selections cannot be quoted', () => {
  for (const quantity of [0, -1, 1.5, 13, Infinity, NaN, '3'])
    assert.throws(() =>
      validateConfiguration({ ...defaultConfiguration(), quantity }),
    );
  assert.throws(() =>
    validateConfiguration({ ...defaultConfiguration(), finish: 'unlisted' }),
  );
  assert.throws(() =>
    validateConfiguration({
      ...defaultConfiguration(),
      product: 'arbitrary-ifc',
    }),
  );
});
await test('Unsatisfied illustrative rules block quoting but preserve a readable draft', () => {
  assert.equal(
    evaluate({ ...defaultConfiguration('care'), glazing: 'standard' }).status,
    'invalid',
  );
  assert.equal(
    evaluate({ ...defaultConfiguration(), layout: 'courtyard', quantity: 2 })
      .status,
    'invalid',
  );
  assert.equal(
    evaluate({ ...defaultConfiguration(), layout: 'courtyard', quantity: 3 })
      .status,
    'estimate',
  );
});
await test('A saved quote snapshot does not follow later configuration changes', () => {
  const configuration = defaultConfiguration();
  const snapshot = structuredClone({
    configuration,
    evaluation: evaluate(configuration),
  });
  configuration.quantity = 5;
  configuration.finish = 'graphite';
  assert.equal(snapshot.configuration.quantity, 1);
  assert.equal(snapshot.evaluation.total, 1840000);
  assert.notEqual(evaluate(configuration).total, snapshot.evaluation.total);
});
await test('IFC diagnostics distinguish basic syntax from engineering validation', () => {
  const report = diagnoseIFC(
    "ISO-10303-21;\nHEADER;FILE_SCHEMA(('IFC4'));ENDSEC;DATA;#1=IFCMATERIAL('Steel',$,$);#2=IFCWALL('id',$,'Wall',$,$,$,$,$,$);ENDSEC;END-ISO-10303-21;",
  );
  assert.equal(report.schema, 'IFC4');
  assert.equal(report.entities, 2);
  assert.equal(report.materials, 1);
  assert.ok(report.warnings.some((w) => w.includes('no certifica')));
  assert.throws(() => diagnoseIFC('this is not an IFC'));
  assert.throws(() => diagnoseIFC("ISO-10303-21;FILE_SCHEMA(('IFC4'));"));
});
function glb(json: object) {
  const raw = new TextEncoder().encode(JSON.stringify(json));
  const length = Math.ceil(raw.length / 4) * 4;
  const buffer = new ArrayBuffer(20 + length);
  const bytes = new Uint8Array(buffer);
  bytes.fill(32, 20);
  bytes.set(raw, 20);
  const view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, buffer.byteLength, true);
  view.setUint32(12, length, true);
  view.setUint32(16, 0x4e4f534a, true);
  return buffer;
}
await test('GLB import refuses malformed containers and external asset references', () => {
  assert.equal(
    diagnoseGLB(
      glb({ asset: { version: '2.0' }, nodes: [{}], materials: [{}] }),
    ).entities,
    1,
  );
  assert.throws(() => diagnoseGLB(new ArrayBuffer(3)));
  assert.throws(() =>
    diagnoseGLB(
      glb({
        asset: { version: '2.0' },
        images: [{ uri: 'https://external.example/image.png' }],
      }),
    ),
  );
  assert.throws(() =>
    diagnoseGLB(
      glb({ asset: { version: '2.0' }, buffers: [{ uri: '../private.bin' }] }),
    ),
  );
});
