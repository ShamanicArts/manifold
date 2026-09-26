import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const wasmBytes = readFileSync('web/dist/manifold_filter.wasm');
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(wasmBytes);
const replies = [];
globalThis.self = { postMessage: (message, transfer) => replies.push({ message, transfer }) };
const workerName = readdirSync('web/dist/assets').find((name) => name.startsWith('sample-analysis-worker-') && name.endsWith('.js'));
assert.ok(workerName);
await import(pathToFileURL(resolve('web/dist/assets', workerName)).href);
const rate = 48000;
const stereo = new Float32Array(rate * 2);
for (let frame = 0; frame < rate; frame++) {
  const sample = .5 * Math.sin(2 * Math.PI * 220 * frame / rate)
    + .2 * Math.sin(2 * Math.PI * 440 * frame / rate);
  stereo[frame * 2] = sample;
  stereo[frame * 2 + 1] = sample * .9;
}
await self.onmessage({ data: { id: 7, sourceRate: rate, stereo,
  temporal: { regionStart: 4096, regionEnd: rate - 4096, maxFrames: 12 } } });
const { message, transfer } = replies.at(-1);
assert.equal(message.type, 'result');
assert.equal(message.id, 7);
assert.equal(message.temporal.version, 1);
assert.equal(message.temporal.mode, 'harmonic-projection');
assert.equal(message.temporal.frames.length, 12);
assert.ok(Math.abs(message.temporal.fundamental - 220) < 3);
assert.equal(transfer.length, 14);
assert.ok(message.temporal.globalValues.length <= 128);
assert.ok(message.temporal.globalValues.every(Number.isFinite));
assert.ok(message.temporal.frames.every((frame) => frame.values.length <= 128
  && frame.values.every(Number.isFinite)));
assert.equal(message.temporal.regionStart, 4096);
assert.equal(message.temporal.regionEnd, rate - 4096);

const recipe = new Float32Array([1, 8, .2, .3, .35, 0, .5, .7, 2, .1, 2]);
await self.onmessage({ data: { type: 'prepare-target', id: 71, sourceId: 7,
  mode: 1, position: .5, smooth: .6, contrast: .5, recipe } });
const add = replies.at(-1).message;
assert.equal(add.type, 'target');
assert.equal(add.id, 71);
assert.equal(add.fundamental, 1);
assert.ok(add.values.length > 0 && add.values.length <= 128 && add.values.every(Number.isFinite));
assert.equal(replies.at(-1).transfer.length, 1);
await self.onmessage({ data: { type: 'prepare-target', id: 72, sourceId: 7,
  mode: 2, position: .5, smooth: .6, contrast: .5, recipe } });
assert.equal(replies.at(-1).message.type, 'target');
assert.ok(replies.at(-1).message.values.length >= add.values.length);
await self.onmessage({ data: { type: 'prepare-target', id: 73, sourceId: 999,
  mode: 1, position: .5, smooth: .6, contrast: .5, recipe } });
assert.equal(replies.at(-1).message.type, 'error');

await self.onmessage({ data: { id: 8, sourceRate: rate, stereo } });
assert.equal(replies.at(-1).message.type, 'result');
assert.equal(replies.at(-1).message.temporal, null);
assert.equal(replies.at(-1).transfer.length, 1);
globalThis.fetch = originalFetch;
console.log('Temporal worker: frames, Add/Morph targets, stale-source rejection, and summary mode passed');
