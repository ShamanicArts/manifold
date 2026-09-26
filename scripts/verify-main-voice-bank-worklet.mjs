// Browser-side contract for the prepared Main voice bank and shared sample.
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
globalThis.registerProcessor = (_name, processor) => { Processor = processor; };
await import(pathToFileURL(resolve('web/src/audio/filter-processor.js')).href);
const processor = new Processor();
const graph = {
  nodes: [{ id: 2, type: 'main-voice-bank', a: 9 }, { id: 3, type: 'output' }],
  connections: [{ from: 2, to: 3, inputPort: 0 }],
};
await processor.port.onmessage({ data: {
  type: 'init', wasmBytes: readFileSync('web/dist/manifold_filter.wasm'), graph,
  sample: { nodeId: 2, sourceRate: 48_000, stereo: new Float32Array(48_000 * 2).fill(0.5) },
} });
assert.deepEqual(messages.at(-1), { type: 'ready' });
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 2, id: 1, value: 1 } });
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 2, id: 11, value: 0.001 } });
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 2, id: 14, value: 0.001 } });
for (const note of [60, 64, 67]) {
  await processor.port.onmessage({ data: { type: 'event', nodeId: 2, kind: 0, channel: 0, note, velocity: 100 } });
}
const left = new Float32Array(128);
const right = new Float32Array(128);
processor.process([], [[left, right]]);
globalThis.currentFrame += 128;
assert.ok(left[127] > 0.05 && right[127] > 0.05);
await processor.port.onmessage({ data: { type: 'meter-request', nodeId: 2, count: 9 } });
assert.equal(messages.at(-1).values[0], 3);
await processor.port.onmessage({ data: { type: 'event', nodeId: 2, kind: 1, channel: 0, note: 64 } });
processor.process([], [[left, right]]);
globalThis.currentFrame += 128;
await processor.port.onmessage({ data: { type: 'meter-request', nodeId: 2, count: 9 } });
assert.equal(messages.at(-1).values[0], 2);
assert.ok(left[127] > 0.02);
await processor.port.onmessage({ data: { type: 'event', nodeId: 2, kind: 2 } });
processor.process([], [[left, right]]);
assert.ok(left.every((sample) => sample === 0));
console.log('Main voice bank worklet: shared sample, chord, release, panic, nine-value meter passed');
