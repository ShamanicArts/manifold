// Exercise capture publication through the actual Rust/Wasm AudioWorklet adapter.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const messages = [];
let Processor;
globalThis.sampleRate = 48_000;
globalThis.currentFrame = 0;
globalThis.AudioWorkletProcessor = class {
  constructor() { this.port = { postMessage: (message) => messages.push(message), onmessage: null }; }
};
globalThis.registerProcessor = (_name, processor) => { Processor = processor; };
await import(pathToFileURL(resolve('web/src/audio/filter-processor.js')).href);
const graph = JSON.parse(readFileSync('projects/graph-workspace/live-sampler.json', 'utf8')).signal;
graph.initialParameters.find((item) => item.nodeId === 5 && item.id === 2).value = 1;
graph.initialParameters.find((item) => item.nodeId === 5 && item.id === 10).value = 0;
const processor = new Processor();
await processor.port.onmessage({ data: { type: 'init',
  wasmBytes: readFileSync('web/dist/manifold_filter.wasm'), graph,
  samples: [{ nodeId: 5, sourceRate: 48_000, stereo: new Float32Array(4096).fill(1) }],
} });
assert.deepEqual(messages.at(-1), { type: 'ready' });
const send = (data) => processor.port.onmessage({ data });
const render = (inputValue = 0) => {
  const input = new Float32Array(128).fill(inputValue);
  const left = new Float32Array(128), right = new Float32Array(128);
  processor.process([[input, input]], [[left, right]]);
  globalThis.currentFrame += 128;
  return [left, right];
};
await send({ type: 'capture-publish', requestId: 1, captureId: 6, instrumentId: 5 });
assert.deepEqual(messages.at(-1), { type: 'capture-published', requestId: 1, accepted: false });
await send({ type: 'event', nodeId: 4, kind: 0, channel: 0, note: 60, velocity: 127 });
assert.equal(render()[0][0], 1);
await send({ type: 'parameter-request', requestId: 2, nodeId: 6, id: 0, value: 1 });
assert.equal(messages.at(-1).accepted, true);
for (let block = 0; block < 4; block++) render(.25);
await send({ type: 'capture-publish', requestId: 3, captureId: 6, instrumentId: 5 });
assert.equal(messages.at(-1).accepted, false, 'recording ring cannot publish');
await send({ type: 'capture-publish-live', requestId: 8, captureId: 6, instrumentId: 5 });
assert.equal(messages.at(-1).accepted, true, 'current recording window publishes without stopping');
assert.equal(messages.at(-1).stereo.length, 1024);
assert.equal(messages.at(-1).stereo[0], .25);
await send({ type: 'event', nodeId: 4, kind: 0, channel: 0, note: 64, velocity: 127 });
assert.equal(render(.25)[0][0], 1.5, 'held note keeps original PCM; new note uses live capture');
await send({ type: 'capture-publish-live', requestId: 9, captureId: 6, instrumentId: 5 });
assert.equal(messages.at(-1).accepted, true, 'recording continues after publication');
assert.equal(messages.at(-1).stereo.length, 1280);
await send({ type: 'parameter-request', requestId: 4, nodeId: 6, id: 0, value: 0 });
assert.equal(messages.at(-1).accepted, true);
await send({ type: 'capture-request', nodeId: 6 });
assert.equal(messages.at(-1).type, 'capture');
assert.equal(messages.at(-1).stereo.length, 1280);
assert.equal(messages.at(-1).stereo[0], .25);
await send({ type: 'capture-publish', requestId: 5, captureId: 6, instrumentId: 5 });
assert.deepEqual(messages.at(-1), { type: 'capture-published', requestId: 5, accepted: true });
assert.equal(render()[0][0], 1.25, 'held original and live-capture notes retain their PCM');
await send({ type: 'event', nodeId: 4, kind: 0, channel: 0, note: 67, velocity: 127 });
assert.equal(render()[0][0], 1.5, 'new note uses stopped capture');
await send({ type: 'event', nodeId: 4, kind: 1, channel: 0, note: 60, velocity: 0 });
assert.ok(render()[0][0] > .5 && render()[0][0] < .6, 'published notes remain as old note releases');

const sideGraph = JSON.parse(readFileSync('projects/graph-workspace/sidechain-sampler.json', 'utf8')).signal;
const sideProcessor = new Processor();
await sideProcessor.port.onmessage({ data: { type: 'init',
  wasmBytes: readFileSync('web/dist/manifold_filter.wasm'), graph: sideGraph,
} });
assert.deepEqual(messages.at(-1), { type: 'ready' });
await sideProcessor.port.onmessage({ data: { type: 'parameter-request', requestId: 6,
  nodeId: 6, id: 0, value: 1 } });
assert.equal(messages.at(-1).accepted, true);
const main = new Float32Array(128).fill(.25);
const side = new Float32Array(128).fill(-.5);
const sideOut = [new Float32Array(128), new Float32Array(128)];
sideProcessor.process([[main, main], [side, side]], [sideOut]);
assert.ok(sideOut[0][0] < -.25, 'main and sidechain buses mix only at the authored sum');
await sideProcessor.port.onmessage({ data: { type: 'parameter-request', requestId: 7,
  nodeId: 6, id: 0, value: 0 } });
await sideProcessor.port.onmessage({ data: { type: 'capture-request', nodeId: 6 } });
assert.equal(messages.at(-1).stereo[0], -.5, 'capture reads the independent sidechain bus');
sideProcessor.process([[main, main]], [sideOut]);
assert.ok(sideOut[0][0] > 0 && sideOut[0][0] < .2, 'a disconnected sidechain reads silence');
console.log('Live sampler worklet: recording-window publication, continued recording, held source continuity, stopped-take gate, sidechain capture and silent fallback passed');
