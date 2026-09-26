// Exercise the live authored CV graph and bounded per-stage meter requests.
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
globalThis.registerProcessor = (name, processor) => { assert.equal(name, 'manifold-project'); Processor = processor; };
await import(pathToFileURL(resolve('web/src/audio/filter-processor.js')).href);
const project = JSON.parse(readFileSync('projects/cv-rack/project.json', 'utf8'));
const processor = new Processor();
await processor.port.onmessage({ data: {
  type: 'init', wasmBytes: readFileSync('web/dist/manifold_filter.wasm'), graph: project.signal,
} });
assert.deepEqual(messages.at(-1), { type: 'ready' });
let audible = false;
for (let block = 0; block < 96; block++) {
  const left = new Float32Array(128);
  const right = new Float32Array(128);
  processor.process([], [[left, right]]);
  audible ||= left.some((sample) => Math.abs(sample) > .01);
  assert.deepEqual(left, right);
}
assert.ok(audible);
for (const nodeId of [4, 5, 7, 8]) {
  await processor.port.onmessage({ data: { type: 'meter-request', nodeId, count: 1 } });
  const meter = messages.at(-1);
  assert.equal(meter.type, 'meters');
  assert.equal(meter.nodeId, nodeId);
  assert.ok(Number.isFinite(meter.values[0]));
  assert.ok(meter.values[0] >= (nodeId === 8 ? 0 : -1));
  assert.ok(meter.values[0] <= (nodeId === 8 ? 2 : 1));
}
console.log('CV rack worklet: audible typed patch and four bounded stage meters passed');
