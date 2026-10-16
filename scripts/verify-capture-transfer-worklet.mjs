// Export a stopped Rust loop take in chunks, then load it into a second Rust graph.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const messages = [];
let Processor;
globalThis.sampleRate = 48_000;
globalThis.currentFrame = 0;
globalThis.AudioWorkletProcessor = class {
  constructor() { this.port = { postMessage: (message) => messages.push(message), onmessage: null }; }
};
globalThis.registerProcessor = (_, processor) => { Processor = processor; };
await import(pathToFileURL(resolve('web/src/audio/filter-processor.js')).href);
const wasmBytes = readFileSync('web/dist/manifold_filter.wasm');
const capture = new Processor();
await capture.port.onmessage({ data: {
  type: 'init', wasmBytes,
  graph: {
    nodes: [{ id: 1, type: 'input.raw' }, { id: 2, type: 'loop-capture', a: 2, b: 1 }, { id: 3, type: 'output' }],
    connections: [{ from: 1, to: 2, inputPort: 0 }, { from: 2, to: 3, inputPort: 0 }],
  },
} });
assert.equal(messages.at(-1).type, 'ready');
await capture.port.onmessage({ data: { type: 'parameter', nodeId: 2, id: 0, value: 1 } });
const output = [[new Float32Array(128), new Float32Array(128)]];
for (let block = 0; block < 18; block++) {
  const left = new Float32Array(128).fill((block + 1) / 100);
  const right = new Float32Array(128).fill(-(block + 1) / 100);
  capture.process([[left, right]], output);
  globalThis.currentFrame += 128;
}
await capture.port.onmessage({ data: { type: 'capture-request', nodeId: 2 } });
assert.equal(messages.at(-1).type, 'capture-error');
await capture.port.onmessage({ data: { type: 'parameter', nodeId: 2, id: 0, value: 0 } });
await capture.port.onmessage({ data: { type: 'capture-request', nodeId: 2 } });
const take = messages.at(-1);
assert.equal(take.type, 'capture');
assert.equal(take.sourceRate, 48_000);
assert.equal(take.stereo.length, 2304 * 2);
assert.ok(Math.abs(take.stereo[0] - 0.01) < 1e-6);
assert.ok(Math.abs(take.stereo[1] + 0.01) < 1e-6);
assert.ok(Math.abs(take.stereo.at(-2) - 0.18) < 1e-6);
assert.ok(Math.abs(take.stereo.at(-1) + 0.18) < 1e-6);

const sampler = new Processor();
globalThis.currentFrame = 0;
await sampler.port.onmessage({ data: {
  type: 'init', wasmBytes,
  graph: {
    nodes: [{ id: 2, type: 'sample-instrument' }, { id: 3, type: 'output' }],
    connections: [{ from: 2, to: 3, inputPort: 0 }],
  },
  sample: { nodeId: 2, sourceRate: take.sourceRate, stereo: take.stereo },
} });
assert.equal(messages.at(-1).type, 'ready');
await sampler.port.onmessage({ data: { type: 'event', nodeId: 2, kind: 0, channel: 0, note: 60, velocity: 127 } });
sampler.process([], output);
globalThis.currentFrame += 128;
assert.ok(Math.abs(output[0][0][0] - 0.0025) < 1e-6);
assert.ok(Math.abs(output[0][1][0] + 0.0025) < 1e-6);
console.log('Capture transfer worklet: stopped 2304-frame stereo take exported across chunks and played by sampler');
