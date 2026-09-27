// Exercise decoded-file publication through the actual Rust/Wasm worklet adapter.
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
graph.initialParameters.find((entry) => entry.nodeId === 5 && entry.id === 2).value = 1;
graph.initialParameters.find((entry) => entry.nodeId === 5 && entry.id === 10).value = 0;
const processor = new Processor();
await processor.port.onmessage({ data: { type: 'init',
  wasmBytes: readFileSync('web/dist/manifold_filter.wasm'), graph,
  samples: [{ nodeId: 5, sourceRate: 48_000, stereo: new Float32Array(8192).fill(.25) }],
} });
assert.deepEqual(messages.at(-1), { type: 'ready' });
const send = (data) => processor.port.onmessage({ data });
const render = () => {
  const out = [new Float32Array(128), new Float32Array(128)];
  processor.process([[]], [out]);
  globalThis.currentFrame += 128;
  return out[0][0];
};
const note = (pitch) => send({ type: 'event', nodeId: 4, kind: 0, channel: 0, note: pitch, velocity: 127 });
await note(60);
assert.equal(render(), .25);

const replace = async (requestId, stereo) => {
  await send({ type: 'sample-replace-begin', requestId, nodeId: 5, sourceRate: 48_000, stereo });
  assert.deepEqual(messages.at(-1), { type: 'sample-replace-started', requestId });
  let steps = 0;
  while (true) {
    assert.equal(render(), .25, 'held note uses the old sample during bounded upload');
    await send({ type: 'sample-replace-step', requestId });
    const progress = messages.at(-1);
    assert.equal(progress.type, 'sample-replace-progress');
    steps++;
    if (progress.done) break;
  }
  await send({ type: 'sample-replace-commit', requestId });
  return steps;
};
const steps = await replace(1, new Float32Array(20_000).fill(-.5));
assert.equal(steps, 3);
assert.deepEqual(messages.at(-1), { type: 'sample-replaced', requestId: 1, accepted: true });
assert.equal(render(), .25, 'publication leaves held note on the old sample');
await note(64);
assert.equal(render(), -.25, 'new note uses replacement PCM');

await send({ type: 'sample-replace-begin', requestId: 2, nodeId: 5, sourceRate: 48_000,
  stereo: new Float32Array(20_000).fill(.75) });
assert.equal(messages.at(-1).type, 'sample-replace-started');
await send({ type: 'sample-replace-step', requestId: 2 });
assert.equal(messages.at(-1).done, false);
assert.equal(render(), -.25, 'partial upload cannot change audible PCM');
await send({ type: 'sample-replace-cancel', requestId: 2 });
assert.equal(render(), -.25);

await send({ type: 'sample-replace-begin', requestId: 3, nodeId: 5, sourceRate: 48_000,
  stereo: new Float32Array(8192).fill(Number.NaN) });
assert.equal(messages.at(-1).type, 'sample-replace-started');
await send({ type: 'sample-replace-step', requestId: 3 });
assert.deepEqual(messages.at(-1), { type: 'sample-replaced', requestId: 3,
  accepted: false, message: 'Error: Decoded sample contains invalid PCM.' });
await note(67);
assert.equal(render(), -.75, 'rejected sample leaves prior source in place');
await send({ type: 'sample-replace-begin', requestId: 4, nodeId: 6, sourceRate: 48_000,
  stereo: new Float32Array(8192).fill(1) });
assert.equal(messages.at(-1).accepted, false, 'non-instrument nodes reject replacement');
console.log('Live sample replacement worklet: bounded upload, held notes, cancellation, rejection, and new-note source passed');
