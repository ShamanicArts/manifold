// Verify the live AudioWorklet maps both slew graph types into Rust/Wasm.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

let Processor;
globalThis.sampleRate = 48_000;
globalThis.AudioWorkletProcessor = class {
  constructor() { this.port = { postMessage: (message) => { this.lastMessage = message; }, onmessage: null }; }
};
globalThis.registerProcessor = (name, processor) => { assert.equal(name, 'manifold-project'); Processor = processor; };
await import(pathToFileURL(resolve('web/src/audio/filter-processor.js')).href);
const wasmBytes = readFileSync('web/dist/manifold_filter.wasm');
async function prepare(graph) {
  const processor = new Processor();
  await processor.port.onmessage({ data: { type: 'init', wasmBytes, graph } });
  assert.deepEqual(processor.lastMessage, { type: 'ready' });
  return processor;
}
const audio = await prepare({
  nodes: [{ id: 1, type: 'input.raw' }, { id: 2, type: 'slew-audio', a: 4, b: 2 }, { id: 3, type: 'output' }],
  connections: [{ from: 1, to: 2, inputPort: 0 }, { from: 2, to: 3, inputPort: 0 }],
});
const sourceLeft = Float32Array.from([1, 1, 0, 0]);
const sourceRight = Float32Array.from([-1, -1, 0, 0]);
const outLeft = new Float32Array(4);
const outRight = new Float32Array(4);
audio.process([[sourceLeft, sourceRight]], [[outLeft, outRight]]);
assert.deepEqual([...outLeft], [.25, .4375, .21875, .109375]);
assert.deepEqual([...outRight], [-.5, -.75, -.5625, -.421875]);

const cv = await prepare({
  nodes: [
    { id: 1, type: 'oscillator', a: 220, b: .3 }, { id: 2, type: 'lfo', a: 8 },
    { id: 3, type: 'slew-control', a: 180, b: 900 },
    { id: 4, type: 'modulated-gain', a: .6, b: .5 }, { id: 5, type: 'output' },
  ],
  connections: [
    { from: 1, to: 4, inputPort: 0 }, { from: 2, to: 3, inputPort: 0 },
    { from: 3, to: 4, inputPort: 1 }, { from: 4, to: 5, inputPort: 0 },
  ],
  initialParameters: [{ nodeId: 2, id: 0, value: 2 }],
});
const left = new Float32Array(128);
const right = new Float32Array(128);
cv.process([], [[left, right]]);
assert.ok(left.some((sample) => Math.abs(sample) > .01));
assert.deepEqual(left, right);
console.log('Slew worklet: legacy stereo slide and typed CV patch passed');
