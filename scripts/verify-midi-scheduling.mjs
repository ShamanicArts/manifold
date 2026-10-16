import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { midiFrame } from '../web/src/audio/midi-timing.js';

const context = {
  sampleRate: 48_000,
  currentTime: 2.008,
  getOutputTimestamp: () => ({ contextTime: 2, performanceTime: 1000 }),
};
assert.equal(midiFrame(context, 1002, 1003), Math.round(2.014 * 48_000));
assert.equal(midiFrame(context, 900, 1003), Math.round((2.008 + 256 / 48_000) * 48_000));
assert.equal(midiFrame({ ...context, getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 0 }) },
  1002, 1003), Math.round(2.019 * 48_000));

let Processor;
const sandbox = {
  currentFrame: 0,
  sampleRate: 48_000,
  AudioWorkletProcessor: class {
    constructor() { this.port = { postMessage() {} }; }
  },
  registerProcessor: (_name, constructor) => { Processor = constructor; },
  Float32Array,
  Float64Array,
  Uint32Array,
  Uint8Array,
  WebAssembly,
};
const source = readFileSync(new URL('../web/src/audio/filter-processor.js', import.meta.url), 'utf8');
runInNewContext(source, sandbox);
const processor = new Processor();
const pushed = [];
processor.engine = {
  manifold_event_push: (...args) => { pushed.push(args); return 1; },
  manifold_process: () => 1,
};
processor.inputView = new Float32Array(4096);
processor.outputView = new Float32Array(4096);
const output = [[new Float32Array(128), new Float32Array(128)]];
const message = (data) => processor.port.onmessage({ data: { type: 'event', nodeId: 1,
  kind: 0, channel: 0, note: 60, velocity: 100, ...data } });
await message({ frame: 140, note: 60 });
await message({ frame: 134, note: 61 });
await message({ frame: 140, note: 62 });
processor.process([], output);
assert.equal(pushed.length, 0);
sandbox.currentFrame = 128;
processor.process([], output);
assert.deepEqual(pushed.map((event) => [event[1], event[4]]), [[6, 61], [12, 60], [12, 62]]);
assert.equal(processor.pendingCount, 0);

sandbox.currentFrame = 256;
await message({ frame: 200, note: 63 });
processor.process([], output);
assert.deepEqual(pushed.at(-1).slice(1, 5), [0, 0, 0, 63]);

const beforeFlush = pushed.length;
await message({ frame: 300, nodeId: 2, note: 65 });
await message({ frame: 400, note: 64 });
await message({ kind: 2, note: 0, velocity: 0 });
processor.process([], output);
assert.deepEqual(pushed.slice(beforeFlush).map((event) => [event[0], event[1], event[2], event[4]]),
  [[1, 0, 2, 0], [2, 44, 0, 65]]);
assert.equal(processor.pendingCount, 0);
assert.ok(!pushed.some((event) => event[4] === 64));
console.log('MIDI timestamp mapping, block offsets, order, late clamp, and scoped all-notes-off flush passed');
