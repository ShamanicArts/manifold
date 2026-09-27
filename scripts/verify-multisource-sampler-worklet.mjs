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
for (let block = 0; block < 3; block++) render(.25, -.25);
const capture = async (requestId, captureId, mainDuringCopy, sideDuringCopy) => {
  await send({ type: 'capture-publish-live', requestId, captureId, instrumentId: 5,
    windowSeconds: 512 / 48_000 });
  assert.equal(messages.at(-1).accepted, true);
  render(mainDuringCopy, sideDuringCopy);
  await send({ type: 'capture-stage-status', requestId, captureId });
  assert.equal(messages.at(-1).state, 2);
  assert.equal(messages.at(-1).frames, 512);
  await send({ type: 'capture-stage-chunk', requestId, captureId, offset: 0, frames: 512 });
  const stereo = messages.at(-1).stereo;
  await send({ type: 'capture-stage-commit-bounded', requestId, captureId, instrumentId: 5 });
  assert.equal(messages.at(-1).type, 'capture-stage-commit-started');
  for (let block = 0; block < 3; block++) {
    render(mainDuringCopy, sideDuringCopy);
    await send({ type: 'capture-stage-commit-status', requestId });
    if (messages.at(-1).state === 2) break;
  }
  assert.equal(messages.at(-1).state, 2);
  await send({ type: 'capture-stage-commit-final', requestId });
  assert.equal(messages.at(-1).accepted, true);
  return stereo;
};
const main = await capture(1, 6, .5, -.5);
assert.equal(main[0], 1, 'Audio Input source is staged at ×4');
assert.equal(main.at(-2), 1);
await send({ type: 'event', nodeId: 4, kind: 0, channel: 0, note: 60, velocity: 127 });
assert.equal(render(.75, -.75)[0], .25, 'first note reads Audio Input while both rings keep recording');
for (let block = 0; block < 4; block++) render(.75, -.75);
const side = await capture(2, 10, 0, 0);
assert.equal(side[0], -3, 'Sidechain source is independent and staged at ×4');
assert.equal(side.at(-2), -3);
await send({ type: 'event', nodeId: 4, kind: 0, channel: 0, note: 64, velocity: 127 });
const mixed = render(0, 0)[0];
assert.ok(mixed < -.45 && mixed > -.55, `held input note keeps old PCM; new note uses sidechain: ${mixed}`);
await send({ type: 'capture-publish-live', requestId: 3, captureId: 6, instrumentId: 5,
  windowBars: .0625, tempoBpm: 120 });
assert.equal(messages.at(-1).accepted, true, 'bar request starts staging');
for (let block = 0; block < 64; block++) {
  render(0, 0);
  await send({ type: 'capture-stage-status', requestId: 3, captureId: 6 });
  if (messages.at(-1).state === 2) break;
}
assert.equal(messages.at(-1).state, 2);
assert.equal(messages.at(-1).frames, 6000, '1/16 bar at 120 BPM and 48 kHz is 6000 frames');
await send({ type: 'capture-stage-commit-bounded', requestId: 3, captureId: 6, instrumentId: 5 });
assert.equal(messages.at(-1).type, 'capture-stage-commit-started');
await send({ type: 'capture-stage-commit-final', requestId: 3 });
assert.equal(messages.at(-1).accepted, false, 'an early final message is rejected');
assert.equal(processor.captureCommit.phase, 'copying', 'a premature message does not discard the active copy');
render(0, 0);
assert.equal(processor.captureCommit.phase, 'copying');
await send({ type: 'capture-stage-cancel', captureId: 6 });
assert.equal(processor.captureCommit, null, 'cancel clears an unfinished prepared source');
assert.equal(processor.engine.manifold_capture_stage_status(6), 0);
await send({ type: 'capture-publish-live', requestId: 4, captureId: 6, instrumentId: 5,
  windowBars: 16, tempoBpm: 120 });
assert.equal(messages.at(-1).accepted, false, '32-second request exceeds the 30-second authored ring');
console.log('Two-source sampler worklet: independent rings, ×4 staging, held-note continuity, Rust bar frames and ring limit passed');
