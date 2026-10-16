// Exercise the live worklet ABI, including the 33-value meter request.
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
  nodes: [{ id: 1, type: 'input.raw' }, { id: 2, type: 'fft-spectrum', a: 0, b: -72 }, { id: 3, type: 'output' }],
  connections: [{ from: 1, to: 2, inputPort: 0 }, { from: 2, to: 3, inputPort: 0 }],
};
await processor.port.onmessage({ data: { type: 'init', wasmBytes: readFileSync('web/dist/manifold_filter.wasm'), graph } });
assert.deepEqual(messages.at(-1), { type: 'ready' });
for (let block = 0; block < 32; block++) {
  const left = Float32Array.from({ length: 128 }, (_, frame) =>
    .4 * Math.sin(2 * Math.PI * 440 * (block * 128 + frame) / sampleRate));
  const right = Float32Array.from(left, (sample) => sample * .7);
  const outLeft = new Float32Array(128);
  const outRight = new Float32Array(128);
  processor.process([[left, right]], [[outLeft, outRight]]);
  assert.deepEqual(outLeft, left);
  assert.deepEqual(outRight, right);
}
await processor.port.onmessage({ data: { type: 'meter-request', nodeId: 2, count: 33 } });
const meter = messages.at(-1);
assert.equal(meter.type, 'meters');
assert.equal(meter.values.length, 33);
assert.ok(meter.values.slice(0, 32).every((value) => Number.isFinite(value) && value >= 0 && value <= 1));
assert.ok(Math.abs(meter.values[32] - 440) < 5);
console.log('FFT worklet: stereo passthrough, 32 bounded bands, and 440 Hz peak passed');
