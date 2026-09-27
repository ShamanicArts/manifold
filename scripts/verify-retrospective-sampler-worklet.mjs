// Exercise the authored always-on retrospective sampler through Rust/Wasm.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

let Processor;
const messages = [];
globalThis.sampleRate = 48_000;
globalThis.currentFrame = 0;
globalThis.AudioWorkletProcessor = class {
  constructor() { this.port = { postMessage: (message) => messages.push(message), onmessage: null }; }
};
globalThis.registerProcessor = (_name, processor) => { Processor = processor; };
await import(pathToFileURL(resolve('web/src/audio/filter-processor.js')).href);
const graph = JSON.parse(readFileSync('projects/graph-workspace/retrospective-sampler.json', 'utf8')).signal;
const processor = new Processor();
const send = (data) => processor.port.onmessage({ data });
await send({ type: 'init', wasmBytes: readFileSync('web/dist/manifold_filter.wasm'), graph });
assert.deepEqual(messages.at(-1), { type: 'ready' });
const render = (value) => {
  const input = new Float32Array(128).fill(value);
  const left = new Float32Array(128), right = new Float32Array(128);
  processor.process([[input, input]], [[left, right]]);
  globalThis.currentFrame += 128;
  return left;
};
assert.equal(render(.25)[0], 0, 'silent sink keeps always-on capture reachable without monitoring input');
const capture = async (requestId, seconds, inputDuringCopy) => {
  await send({ type: 'capture-publish-live', requestId, captureId: 6, instrumentId: 5, windowSeconds: seconds });
  assert.deepEqual(messages.at(-1), { type: 'capture-stage-started', requestId, accepted: true });
  render(inputDuringCopy);
  await send({ type: 'capture-stage-status', requestId, captureId: 6 });
  assert.equal(messages.at(-1).state, 2);
  const frames = messages.at(-1).frames;
  await send({ type: 'capture-stage-chunk', requestId, captureId: 6, offset: 0, frames });
  const stereo = messages.at(-1).stereo;
  await send({ type: 'capture-stage-commit', requestId, captureId: 6, instrumentId: 5 });
  assert.equal(messages.at(-1).accepted, true);
  return stereo;
};
const early = await capture(1, .01, .5);
assert.equal(early.length, 960);
assert.equal(early[0], 0, 'missing earlier history is silence');
assert.equal(early[351 * 2], 0);
assert.equal(early[352 * 2], .25);
assert.equal(early.at(-2), .25, 'new input during staging does not enter the requested window');
const latest = await capture(2, 128 / 48_000, .75);
assert.equal(latest.length, 256);
assert.equal(latest[0], .5);
assert.equal(latest.at(-2), .5);
await send({ type: 'event', nodeId: 4, kind: 0, channel: 0, note: 60, velocity: 127 });
const heard = render(0)[0];
assert.ok(heard > .12 && heard < .13, `new note must use the latest retrospective sample: ${heard}`);
console.log('Retrospective sampler worklet: always-on capture, silent output route, early zero padding, fixed recent window and new-note audio passed');
