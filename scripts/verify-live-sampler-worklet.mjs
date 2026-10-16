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
const publishLive = async (requestId) => {
  await send({ type: 'capture-publish-live', requestId, captureId: 6, instrumentId: 5 });
  assert.deepEqual(messages.at(-1), { type: 'capture-stage-started', requestId, accepted: true });
  let status;
  for (let block = 0; block < 100; block++) {
    await send({ type: 'capture-stage-status', requestId, captureId: 6 });
    status = messages.at(-1);
    if (status.state === 2) break;
    assert.equal(status.state, 1);
    render(.25);
  }
  assert.equal(status.state, 2, 'bounded capture reaches ready state');
  const stereo = new Float32Array(status.frames * 2);
  for (let offset = 0; offset < status.frames;) {
    const frames = Math.min(16_384, status.frames - offset);
    await send({ type: 'capture-stage-chunk', requestId, captureId: 6, offset, frames });
    const chunk = messages.at(-1);
    assert.equal(chunk.type, 'capture-stage-chunk');
    stereo.set(chunk.stereo, offset * 2);
    offset += frames;
  }
  await send({ type: 'capture-stage-commit', requestId, captureId: 6, instrumentId: 5 });
  assert.equal(messages.at(-1).accepted, true);
  return stereo;
};
await send({ type: 'capture-publish', requestId: 1, captureId: 6, instrumentId: 5 });
assert.deepEqual(messages.at(-1), { type: 'capture-published', requestId: 1, accepted: false });
await send({ type: 'capture-publish-live', requestId: 10, captureId: 6, instrumentId: 5 });
assert.deepEqual(messages.at(-1), { type: 'capture-stage-started', requestId: 10, accepted: false });
await send({ type: 'event', nodeId: 4, kind: 0, channel: 0, note: 60, velocity: 127 });
assert.equal(render()[0][0], 1);
await send({ type: 'parameter-request', requestId: 2, nodeId: 6, id: 0, value: 1 });
assert.equal(messages.at(-1).accepted, true);
for (let block = 0; block < 4; block++) render(.25);
await send({ type: 'capture-publish', requestId: 3, captureId: 6, instrumentId: 5 });
assert.equal(messages.at(-1).accepted, false, 'recording ring cannot publish');
const firstWindow = await publishLive(8);
assert.equal(firstWindow.length, 1024);
assert.equal(firstWindow[0], .25);
await send({ type: 'event', nodeId: 4, kind: 0, channel: 0, note: 64, velocity: 127 });
assert.equal(render(.25)[0][0], 1.5, 'held note keeps original PCM; new note uses live capture');
const secondWindow = await publishLive(9);
assert.equal(secondWindow.length, 1536, 'recording continues after publication');
await send({ type: 'parameter-request', requestId: 4, nodeId: 6, id: 0, value: 0 });
assert.equal(messages.at(-1).accepted, true);
await send({ type: 'capture-request', nodeId: 6 });
assert.equal(messages.at(-1).type, 'capture');
assert.equal(messages.at(-1).stereo.length, 1792);
assert.equal(messages.at(-1).stereo[0], .25);
await send({ type: 'capture-publish', requestId: 5, captureId: 6, instrumentId: 5 });
assert.deepEqual(messages.at(-1), { type: 'capture-published', requestId: 5, accepted: true });
assert.equal(render()[0][0], 1.25, 'held original and live-capture notes retain their PCM');
await send({ type: 'event', nodeId: 4, kind: 0, channel: 0, note: 67, velocity: 127 });
assert.ok(render()[0][0] > 1.5 && render()[0][0] < 1.6, 'new note uses stopped capture');
await send({ type: 'event', nodeId: 4, kind: 1, channel: 0, note: 60, velocity: 0 });
const afterRelease = render()[0][0];
assert.ok(afterRelease >= .5 && afterRelease < .7, `published notes remain as old note releases: ${afterRelease}`);

const wrappedProcessor = new Processor();
await wrappedProcessor.port.onmessage({ data: { type: 'init',
  wasmBytes: readFileSync('web/dist/manifold_filter.wasm'), graph,
} });
await wrappedProcessor.port.onmessage({ data: { type: 'parameter-request', requestId: 11, nodeId: 6, id: 0, value: 1 } });
const wrappedOutput = [new Float32Array(128), new Float32Array(128)];
const renderWrapped = (value) => {
  const input = new Float32Array(128).fill(value);
  wrappedProcessor.process([[input, input]], [wrappedOutput]);
};
for (let block = 0; block < 754; block++) renderWrapped(block / 1000);
await wrappedProcessor.port.onmessage({ data: { type: 'capture-publish-live', requestId: 12, captureId: 6, instrumentId: 5 } });
assert.equal(messages.at(-1).accepted, true);
for (let block = 0; block < 60; block++) renderWrapped(-.5);
await wrappedProcessor.port.onmessage({ data: { type: 'capture-stage-status', requestId: 12, captureId: 6 } });
assert.equal(messages.at(-1).state, 2);
assert.equal(messages.at(-1).frames, 96_000);
const frozen = new Float32Array(192_000);
for (let offset = 0; offset < 96_000; offset += 16_384) {
  await wrappedProcessor.port.onmessage({ data: { type: 'capture-stage-chunk', requestId: 12,
    captureId: 6, offset, frames: Math.min(16_384, 96_000 - offset) } });
  frozen.set(messages.at(-1).stereo, offset * 2);
}
assert.ok(Math.abs(frozen[0] - .004) < 1e-7, 'frozen window starts at the oldest wrapped block');
assert.ok(Math.abs(frozen[745 * 128 * 2] - .749) < 1e-7, 'middle of frozen window keeps its request-time input');
assert.ok(Math.abs(frozen.at(-2) - .753) < 1e-7, 'frozen window ends at the newest request-time block');
await wrappedProcessor.port.onmessage({ data: { type: 'capture-stage-commit', requestId: 12, captureId: 6, instrumentId: 5 } });
assert.equal(messages.at(-1).accepted, true);

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
