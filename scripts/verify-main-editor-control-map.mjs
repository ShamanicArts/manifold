import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mainEditorAction } from '../web/src/audio/main-editor-control-map.js';

const project = JSON.parse(await readFile(new URL('../projects/main-looper/project.json', import.meta.url)));
const map = message => mainEditorAction(message, project);
for (const [name, id] of Object.entries(project.controls)) {
  assert.deepEqual(map({ type: 'control', id, value: 1 }), { kind: 'parameter', id, value: 1 }, name);
}
assert.deepEqual(map({ type: 'layer-control', layer: 2, id: project.layerControls.volume, value: 0.4 }),
  { kind: 'parameter', id: 32, value: 0.4 });
assert.deepEqual(map({ type: 'synth-parameter', id: project.synthParameters.output, value: 0.6 }),
  { kind: 'parameter', id: 271, value: 0.6 });
assert.deepEqual(map({ type: 'lfo-slot-active', slot: 1, active: 1 }),
  { kind: 'parameter', id: 539, value: 1 });
assert.deepEqual(map({ type: 'modulation-route', slot: 1, id: 1, value: 22 }),
  { kind: 'parameter', id: 534, value: 22 });
for (const [type, base] of Object.entries({
  'atv-parameter': 640, 'slew-parameter': 672, 'sample-hold-parameter': 704,
  'compare-parameter': 736, 'cv-mix-parameter': 768, 'range-parameter': 800,
  'scale-quantizer-parameter': 832, 'transpose-parameter': 864,
  'note-filter-parameter': 896, 'velocity-mapper-parameter': 928,
  'arpeggiator-parameter': 960,
})) {
  assert.deepEqual(map({ type, id: 0, value: 1 }), { kind: 'parameter', id: base, value: 1 }, type);
}
assert.deepEqual(map({ type: 'command', id: project.commands.record, value: 0 }),
  { kind: 'command', id: 0, value: 0 });
assert.deepEqual(map({ type: 'sample-capture', source: 0, bars: 0.5 }),
  { kind: 'sample', action: 'retro', source: 0, bars: 0.5 });
assert.deepEqual(map({ type: 'sample-free-start', source: 4 }),
  { kind: 'sample', action: 'free-start', source: 4 });
assert.deepEqual(map({ type: 'sample-free-stop' }),
  { kind: 'sample', action: 'free-stop' });
assert.equal(map({ type: 'sample-capture', source: 5, bars: 1 }), null);
assert.equal(map({ type: 'layer-control', layer: 4, id: 0, value: 1 }), null);
assert.equal(map({ type: 'synth-parameter', id: 15, value: Number.NaN }), null);
console.log('Original Main widget messages map to authored native host IDs.');
