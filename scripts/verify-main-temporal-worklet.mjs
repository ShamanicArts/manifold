// Exercise the complete prepared-table upload and per-voice render adapter.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const messages = [];
let Processor;
globalThis.sampleRate = 48_000;
globalThis.currentFrame = 0;
globalThis.AudioWorkletProcessor = class {
  constructor() { this.port = { postMessage: (message) => messages.push(message), onmessage: null }; }
};
globalThis.registerProcessor = (_name, processor) => { Processor = processor; };
await import(pathToFileURL(resolve('web/src/audio/filter-processor.js')).href);
const project = JSON.parse(readFileSync('projects/main-voice-bank/project.json', 'utf8'));
const wasmBytes = readFileSync('web/dist/manifold_filter.wasm');
const sample = new Float32Array(48_000 * 2).fill(0.5);
async function start() {
  const processor = new Processor();
  await processor.port.onmessage({ data: {
    type: 'init', wasmBytes, graph: project.signal,
    sample: { nodeId: 2, sourceRate: 48_000, stereo: sample },
    partials: [project.partials, { ...project.extraPartials[0], values: [1, 1, 0, 0] }],
  } });
  assert.deepEqual(messages.at(-1), { type: 'ready' });
  for (const [id, value] of [[1, 1], [6, 5], [7, 1], [11, .001], [12, .001], [13, 1]]) {
    await processor.port.onmessage({ data: { type: 'parameter', nodeId: 2, id, value } });
  }
  return processor;
}
const moving = await start();
const staticBank = await start();
const frames = 256, stride = 130;
const table = new Float32Array(frames * stride);
for (let index = 0; index < frames; index++) {
  const offset = index * stride;
  table[offset] = 1;
  table[offset + 1] = 1;
  table[offset + 2] = index < frames / 2 ? 1 : 4;
  table[offset + 3] = 1;
}
await moving.port.onmessage({ data: { type: 'temporal-targets', nodeId: 2, frames, values: table } });
assert.deepEqual(messages.at(-1), { type: 'temporal-applied', requestId: undefined, accepted: true });
await moving.port.onmessage({ data: { type: 'temporal-speed', nodeId: 2, speed: 1 } });
const invalid = table.slice();
invalid[3] = -1;
await moving.port.onmessage({ data: { type: 'temporal-targets', nodeId: 2, frames, values: invalid } });
assert.equal(messages.at(-1).accepted, false);
for (const processor of [moving, staticBank]) {
  await processor.port.onmessage({ data: { type: 'event', nodeId: 2, kind: 0,
    channel: 0, note: 60, velocity: 127 } });
}
const movingLeft = new Float32Array(128), movingRight = new Float32Array(128);
const staticLeft = new Float32Array(128), staticRight = new Float32Array(128);
let peakDifference = 0;
for (let block = 0; block < 205; block++) {
  if (block === 80) {
    for (const processor of [moving, staticBank]) {
      await processor.port.onmessage({ data: { type: 'event', nodeId: 2, kind: 0,
        channel: 0, note: 60, velocity: 127 } });
    }
  }
  moving.process([], [[movingLeft, movingRight]]);
  staticBank.process([], [[staticLeft, staticRight]]);
  if (block > 190) {
    for (let index = 0; index < 128; index++) {
      peakDifference = Math.max(peakDifference, Math.abs(movingLeft[index] - staticLeft[index]));
    }
  }
  globalThis.currentFrame += 128;
}
assert.ok(movingLeft.every(Number.isFinite) && movingRight.every(Number.isFinite));
assert.ok(peakDifference > .05, `temporal bank did not move: ${peakDifference}`);
await moving.port.onmessage({ data: { type: 'temporal-clear', nodeId: 2 } });
assert.equal(messages.at(-1).accepted, true);
const rawBank = await start();
const rawSource = await start();
const rawBytes = readFileSync('web/public/reference/main-temporal-rhythmic/rust-temporal-frames.f32');
const packed = new Float32Array(rawBytes.buffer.slice(rawBytes.byteOffset,
  rawBytes.byteOffset + rawBytes.byteLength));
const recipe = new Float32Array([.6, .5, 0, 0, 0, 0, .5, .5, 1, 2]);
await rawBank.port.onmessage({ data: { type: 'temporal-frames', nodeId: 2,
  frames: packed[0], packed, recipe } });
assert.equal(messages.at(-1).accepted, true);
const malformed = packed.slice();
malformed[1 + 131] = malformed[1];
await rawBank.port.onmessage({ data: { type: 'temporal-frames', nodeId: 2,
  frames: malformed[0], packed: malformed, recipe } });
assert.equal(messages.at(-1).accepted, false);
for (const processor of [rawBank, rawSource]) {
  await processor.port.onmessage({ data: { type: 'event', nodeId: 2, kind: 0,
    channel: 0, note: 60, velocity: 127 } });
}
let rawDifference = 0;
for (let block = 0; block < 145; block++) {
  rawBank.process([], [[movingLeft, movingRight]]);
  rawSource.process([], [[staticLeft, staticRight]]);
  if (block > 100) {
    for (let index = 0; index < 128; index++) {
      rawDifference = Math.max(rawDifference,
        Math.abs(movingLeft[index] - staticLeft[index]));
    }
  }
  globalThis.currentFrame += 128;
}
assert.ok(rawDifference > .01, `raw-frame source did not move: ${rawDifference}`);
console.log(`Main temporal worklet: prepared and raw uploads, rejected replacement preserved, staggered voices, live motion (prepared Δ ${peakDifference.toFixed(3)}, raw Δ ${rawDifference.toFixed(3)}), clear passed`);
