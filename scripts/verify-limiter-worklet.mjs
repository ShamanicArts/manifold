// Smoke check for the live AudioWorklet ABI without a browser compositor.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const messages = [];
let Processor;
globalThis.sampleRate = 48_000;
globalThis.AudioWorkletProcessor = class {
  constructor() {
    this.port = { postMessage: (message) => messages.push(message), onmessage: null };
  }
};
globalThis.registerProcessor = (name, processor) => {
  assert.equal(name, 'manifold-project');
  Processor = processor;
};
await import(pathToFileURL(resolve('web/src/audio/filter-processor.js')).href);
const processor = new Processor();
const wasmBytes = readFileSync('web/dist/manifold_filter.wasm');
const graph = {
  nodes: [
    { id: 1, type: 'input.raw' },
    { id: 2, type: 'limiter', a: -18, b: 60 },
    { id: 3, type: 'output' },
  ],
  connections: [{ from: 1, to: 2, inputPort: 0 }, { from: 2, to: 3, inputPort: 0 }],
};
await processor.port.onmessage({ data: { type: 'init', wasmBytes, graph } });
assert.deepEqual(messages.at(-1), { type: 'ready' });
const left = new Float32Array(128).fill(0.5);
const right = new Float32Array(128).fill(0.4);
const outLeft = new Float32Array(128);
const outRight = new Float32Array(128);
processor.process([[left, right]], [[outLeft, outRight]]);
assert.ok(outLeft[127] < left[127]);
assert.ok(outRight[127] < right[127]);
await processor.port.onmessage({ data: { type: 'meter-request', nodeId: 2, count: 1 } });
const meter = messages.at(-1);
assert.equal(meter.type, 'meters');
assert.ok(meter.values[0] > 0);
console.log('Limiter worklet', outLeft[127].toFixed(4), outRight[127].toFixed(4), meter.values[0].toFixed(2), 'dB');
