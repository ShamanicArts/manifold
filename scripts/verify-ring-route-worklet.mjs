// Exercise the browser's prepared audio route through the real Rust/Wasm worklet.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { captureControlPatchState, parseControlPatchState } from '../web/src/state/control-patch.js';

let Processor;
globalThis.sampleRate = 48_000;
globalThis.currentFrame = 0;
globalThis.AudioWorkletProcessor = class {
  constructor() { this.port = { postMessage: (message) => { this.lastMessage = message; }, onmessage: null }; }
};
globalThis.registerProcessor = (name, processor) => { assert.equal(name, 'manifold-project'); Processor = processor; };
await import(pathToFileURL(resolve('web/src/audio/filter-processor.js')).href);

const project = JSON.parse(readFileSync('projects/ring-modulator/project.json', 'utf8'));
const wasmBytes = readFileSync('web/dist/manifold_filter.wasm');
async function prepare() {
  const processor = new Processor();
  await processor.port.onmessage({ data: { type: 'init', wasmBytes, graph: project.signal } });
  assert.deepEqual(processor.lastMessage, { type: 'ready' });
  return processor;
}
async function route(processor, requestId, from) {
  await processor.port.onmessage({ data: { type: 'route', requestId, to: 2, port: 1, from } });
  assert.deepEqual(processor.lastMessage, { type: 'route-applied', requestId, accepted: true });
}
function block(processor) {
  const carrier = new Float32Array(128).fill(0.5);
  const left = new Float32Array(128);
  const right = new Float32Array(128);
  assert.equal(processor.process([[carrier, carrier]], [[left, right]]), true);
  globalThis.currentFrame += 128;
  return [left, right];
}

const switched = await prepare();
const internal = await prepare();
assert.deepEqual(block(switched), block(internal));
await route(switched, 1, 1);
for (const channel of block(switched)) {
  assert.ok(channel.every((sample) => Math.abs(sample - 0.25) < 1e-6));
}
await switched.port.onmessage({ data: { type: 'route', requestId: 2, to: 2, port: 1, from: 2 } });
assert.deepEqual(switched.lastMessage, { type: 'route-applied', requestId: 2, accepted: false });
await route(switched, 3, null);
assert.deepEqual(block(switched), block(internal));

const values = new Map(project.parameters.map((parameter) => [parameter.id, parameter.default]));
project.signal.connections.push({ from: 1, to: 2, inputPort: 1 });
const saved = captureControlPatchState(project, values);
assert.equal(saved.routes[0].from, 1);
assert.deepEqual(parseControlPatchState(saved, project), saved);
console.log('Ring audio route: live input, rejected cycle, oscillator resume, and patch state passed');
