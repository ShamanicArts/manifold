import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addNode, captureGraphProject, deriveGraphHostBindings, parseGraphBundle } from '../src/graph/topology.js';

const fixture = JSON.parse(readFileSync(new URL('../../projects/graph-workspace/sidechain-sampler.json', import.meta.url)));

test('older browser projects acquire deterministic fixed slots and retain them after an edit', () => {
  const imported = parseGraphBundle(fixture);
  const gain = imported.hostBindings.find((binding) => binding.nodeId === 9 && binding.id === 0);
  assert.equal(gain.slot, 21);
  const edited = addNode(imported.signal, 'gain');
  const bindings = deriveGraphHostBindings(edited, imported.hostBindings);
  assert.deepEqual(bindings.find((binding) => binding.nodeId === 9 && binding.id === 0), gain);
  const bundle = captureGraphProject(edited, [], [], [], bindings);
  assert.deepEqual(parseGraphBundle(bundle).hostBindings, bindings);
});

test('invalid or conflicting fixed slot bindings are rejected before import', () => {
  const document = captureGraphProject(fixture.signal);
  document.hostBindings = [{ slot: 7, nodeId: 9, id: 0 }, { slot: 7, nodeId: 5, id: 0 }];
  assert.throws(() => parseGraphBundle(document), /Invalid host binding/);
});
