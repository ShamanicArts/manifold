// Verify one sample upload feeds multiple note voices and bounded voice meters.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const messages = [];
let Processor;
globalThis.sampleRate = 48_000;
globalThis.AudioWorkletProcessor = class {
  constructor() { this.port = { postMessage: (message) => messages.push(message), onmessage: null }; }
};
globalThis.registerProcessor = (name, processor) => {
  assert.equal(name, 'manifold-project');
  Processor = processor;
};
await import(pathToFileURL(resolve('web/src/audio/filter-processor.js')).href);
const processor = new Processor();
const graph = {
  nodes: [{ id: 2, type: 'sample-instrument' }, { id: 3, type: 'output' }],
  connections: [{ from: 2, to: 3, inputPort: 0 }],
};
await processor.port.onmessage({ data: {
  type: 'init', wasmBytes: readFileSync('web/dist/manifold_filter.wasm'), graph,
  sample: { nodeId: 2, sourceRate: 48_000, stereo: new Float32Array(16).fill(1) },
} });
assert.deepEqual(messages.at(-1), { type: 'ready' });
for (const note of [60, 72]) {
  await processor.port.onmessage({ data: { type: 'event', nodeId: 2, kind: 0, channel: 0, note, velocity: 127 } });
}
const left = new Float32Array(128);
const right = new Float32Array(128);
processor.process([], [[left, right]]);
assert.equal(left[0], 0.5);
assert.equal(right[0], 0.5);
await processor.port.onmessage({ data: { type: 'meter-request', nodeId: 2, count: 9 } });
const meter = messages.at(-1);
assert.equal(meter.type, 'meters');
assert.equal(meter.values.length, 9);
assert.equal(meter.values[0], 2);
assert.deepEqual(meter.values.slice(3), Array(6).fill(-1));
await processor.port.onmessage({ data: { type: 'event', nodeId: 2, kind: 1, channel: 0, note: 60 } });
processor.process([], [[left, right]]);
assert.equal(left[0], 0.25);
console.log('Sample instrument worklet: shared upload, two notes, note off, nine-value meter passed');
