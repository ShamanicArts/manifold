// Two continuously recording sources, fixed input staging, and source handoff.
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
const graph = JSON.parse(readFileSync('projects/graph-workspace/retrospective-multisource.json', 'utf8')).signal;
const processor = new Processor();
const send = (data) => processor.port.onmessage({ data });
await send({ type: 'init', wasmBytes: readFileSync('web/dist/manifold_filter.wasm'), graph });
assert.deepEqual(messages.at(-1), { type: 'ready' });
const render = (main, sidechain) => {
  const mainBus = new Float32Array(128).fill(main);
  const sideBus = new Float32Array(128).fill(sidechain);
  const left = new Float32Array(128), right = new Float32Array(128);
  processor.process([[mainBus, mainBus], [sideBus, sideBus]], [[left, right]]);
  globalThis.currentFrame += 128;
  return left;
};
assert.equal(render(.25, -.25)[0], 0, 'both capture roots are silent until a note plays');
const capture = async (requestId, captureId, mainDuringCopy, sideDuringCopy) => {
  await send({ type: 'capture-publish-live', requestId, captureId, instrumentId: 5,
    windowSeconds: 128 / 48_000 });
  assert.equal(messages.at(-1).accepted, true);
  render(mainDuringCopy, sideDuringCopy);
  await send({ type: 'capture-stage-status', requestId, captureId });
  assert.equal(messages.at(-1).state, 2);
  assert.equal(messages.at(-1).frames, 128);
  await send({ type: 'capture-stage-chunk', requestId, captureId, offset: 0, frames: 128 });
  const stereo = messages.at(-1).stereo;
  await send({ type: 'capture-stage-commit', requestId, captureId, instrumentId: 5 });
  assert.equal(messages.at(-1).accepted, true);
  return stereo;
};
const main = await capture(1, 6, .5, -.5);
assert.equal(main[0], 1, 'Audio Input source is staged at ×4');
assert.equal(main.at(-2), 1);
await send({ type: 'event', nodeId: 4, kind: 0, channel: 0, note: 60, velocity: 127 });
assert.equal(render(.75, -.75)[0], .25, 'first note reads Audio Input while both rings keep recording');
const side = await capture(2, 10, 0, 0);
assert.equal(side[0], -3, 'Sidechain source is independent and staged at ×4');
assert.equal(side.at(-2), -3);
await send({ type: 'event', nodeId: 4, kind: 0, channel: 0, note: 64, velocity: 127 });
const mixed = render(0, 0)[0];
assert.ok(mixed < -.45 && mixed > -.55, `held input note keeps old PCM; new note uses sidechain: ${mixed}`);
console.log('Two-source sampler worklet: independent input/sidechain rings, ×4 staging, silent capture, held-note source continuity passed');
