import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureGraphProject, parseGraphBundle } from '../src/graph/topology.js';

const authored = JSON.parse(readFileSync(new URL(
  '../../projects/graph-workspace/authored-rack-module-host-sample.json', import.meta.url)));

test('Graph workbench opens and saves the authored shared Sample resource without duplicating PCM', () => {
  const bundle = parseGraphBundle(authored);
  assert.equal(bundle.assets.length, 1);
  assert.equal(bundle.sampleBindings.length, 7);
  assert.equal(bundle.signal.nodes.length, 68);
  assert.deepEqual(bundle.signal.captureSources, [
    { id: 0, nodeId: 65, name: 'Rack Sample input', kind: 'input' },
    { id: 1, nodeId: 68, name: 'Rack Sample sidechain', kind: 'sidechain' },
  ]);
  const saved = captureGraphProject(bundle.signal, bundle.assets, bundle.targets, bundle.temporal,
    bundle.hostBindings, bundle.endpoints, bundle.controls, bundle.instances, bundle.sampleBindings);
  assert.deepEqual(saved.sampleBindings, authored.sampleBindings);
  assert.equal(saved.assets.length, 1);
  assert.equal(saved.assets[0].pcmF32Base64, authored.assets[0].pcmF32Base64);
  assert.deepEqual(parseGraphBundle(saved).sampleBindings, bundle.sampleBindings);
});

test('Graph workbench rejects invalid shared Sample bindings', () => {
  for (const invalid of [
    [{ sourceNodeId: 39, nodeId: 39 }],
    [{ sourceNodeId: 39, nodeId: 60 }, { sourceNodeId: 39, nodeId: 60 }],
    [{ sourceNodeId: 39, nodeId: 64 }],
    [{ sourceNodeId: 40, nodeId: 60 }],
  ]) {
    assert.throws(() => parseGraphBundle({ ...authored, sampleBindings: invalid }),
      /Invalid graph sample binding/);
  }
});
