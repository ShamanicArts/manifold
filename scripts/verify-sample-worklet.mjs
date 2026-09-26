// Verify sample upload and note-triggered playback through the actual worklet adapter.
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
  nodes: [{ id: 2, type: 'sample-region' }, { id: 3, type: 'output' }],
  connections: [{ from: 2, to: 3, inputPort: 0 }],
};
const stereo = new Float32Array([.5, -.5, .25, -.25, 0, 0, -.25, .25]);
await processor.port.onmessage({ data: {
  type: 'init', wasmBytes: readFileSync('web/dist/manifold_filter.wasm'), graph,
  sample: { nodeId: 2, sourceRate: 48_000, stereo },
} });
assert.deepEqual(messages.at(-1), { type: 'ready' });
await processor.port.onmessage({ data: { type: 'event', nodeId: 2, kind: 0, note: 60, velocity: 100 } });
const outLeft = new Float32Array(128);
const outRight = new Float32Array(128);
processor.process([], [[outLeft, outRight]]);
assert.deepEqual([...outLeft.slice(0, 8)], [.5, .25, 0, -.25, .5, .25, 0, -.25]);
assert.deepEqual([...outRight.slice(0, 4)], [-.5, -.25, 0, .25]);
console.log('Sample region worklet: upload, note trigger, stereo loop passed');
