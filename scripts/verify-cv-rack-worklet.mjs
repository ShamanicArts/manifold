// Exercise the live authored CV graph and bounded per-stage meter requests.
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
  assert.equal(meter.active, true);
  assert.ok(Number.isFinite(meter.values[0]));
  assert.ok(meter.values[0] >= (nodeId === 8 ? 0 : -1));
  assert.ok(meter.values[0] <= (nodeId === 8 ? 2 : 1));
}
for (const [requestId, port] of [[1, 0], [2, 1]]) {
  await processor.port.onmessage({ data: { type: 'route', requestId, to: 7, port, from: null } });
  assert.deepEqual(messages.at(-1), { type: 'route-applied', requestId, accepted: true });
}
for (let block = 0; block < 8; block++) processor.process([], [[new Float32Array(128), new Float32Array(128)]]);
await processor.port.onmessage({ data: { type: 'meter-request', nodeId: 4, count: 1 } });
assert.equal(messages.at(-1).active, false);
assert.ok(Math.abs(processor.engine.manifold_get_node_meter(7, 0) - .1) < 1e-6);
assert.ok(Math.abs(processor.engine.manifold_get_node_meter(8, 0) - .65) < .001);
await processor.port.onmessage({ data: { type: 'route', requestId: 3, to: 7, port: 0, from: 1 } });
assert.deepEqual(messages.at(-1), { type: 'route-applied', requestId: 3, accepted: false });
await processor.port.onmessage({ data: { type: 'route', requestId: 4, to: 7, port: 0, from: 2 } });
assert.deepEqual(messages.at(-1), { type: 'route-applied', requestId: 4, accepted: true });
let changed = false;
for (let block = 0; block < 24; block++) {
  processor.process([], [[new Float32Array(128), new Float32Array(128)]]);
  changed ||= Math.abs(processor.engine.manifold_get_node_meter(7, 0) - .1) > .05;
}
assert.ok(changed);
await processor.port.onmessage({ data: { type: 'route', requestId: 5, to: 8, port: 0, from: 7 } });
assert.deepEqual(messages.at(-1), { type: 'route-applied', requestId: 5, accepted: false });
let requestId = 6;
for (const port of project.patch.inputs) {
  for (const [source] of port.sources) {
    await processor.port.onmessage({ data: { type: 'route', requestId, to: port.to, port: port.inputPort, from: source } });
    assert.deepEqual(messages.at(-1), { type: 'route-applied', requestId, accepted: true }, `${port.label} ← ${source}`);
    requestId++;
  }
}
console.log('CV rack worklet: audible typed patch, bounded meters, and live route changes passed');
