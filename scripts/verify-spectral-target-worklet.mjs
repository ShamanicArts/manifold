import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const wasmBytes = readFileSync('web/dist/manifold_filter.wasm');
const { instance: { exports: wasm } } = await WebAssembly.instantiate(wasmBytes, {});
const manifest = JSON.parse(readFileSync('web/public/reference/temporal-partials/manifest.json', 'utf8'));
const selected = manifest.cases.find((item) => item.id === 'two-tone');
const bytes = readFileSync(`web/public/reference/temporal-partials/${selected.input}`);
const input = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
assert.equal(wasm.manifold_analysis_begin(selected.sourceFrames, manifest.sampleRate), 1);
new Float32Array(wasm.memory.buffer, wasm.manifold_analysis_ptr(), input.length).set(input);
assert.equal(wasm.manifold_analysis_run_temporal(selected.regionStart, selected.regionEnd, 12), 1);
const recipe = new Float32Array([1, 8, .2, .3, .35, 0, .5, .7, 2, .1, 2]);
function target(mode) {
  new Float32Array(wasm.memory.buffer, wasm.manifold_analysis_recipe_ptr(), 11).set(recipe);
  assert.equal(wasm.manifold_analysis_prepare_target(mode, .5, .6, .5), 1);
  const count = wasm.manifold_analysis_target_count();
  const fundamental = wasm.manifold_analysis_target_fundamental();
  const values = new Float32Array(wasm.memory.buffer, wasm.manifold_analysis_target_ptr(), count * 4).slice();
  return { nodeId: 2, fundamental, values };
}
const add = target(1);
const morph = target(2);
assert.ok(add.values.length > 0 && morph.values.length > add.values.length);

let Processor;
const messages = [];
globalThis.sampleRate = 48000;
globalThis.currentFrame = 0;
globalThis.AudioWorkletProcessor = class {
  constructor() { this.port = { postMessage: (message) => messages.push(message), onmessage: null }; }
};
globalThis.registerProcessor = (name, processor) => {
  assert.equal(name, 'manifold-project'); Processor = processor;
};
await import(pathToFileURL(resolve('web/src/audio/filter-processor.js')).href);
const project = JSON.parse(readFileSync('projects/sine-bank/project.json', 'utf8'));
const processor = new Processor();
await processor.port.onmessage({ data: { type: 'init', wasmBytes, graph: project.signal, partials: add } });
assert.deepEqual(messages.at(-1), { type: 'ready' });
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 2, id: 0, value: 220 } });
function render() {
  const left = new Float32Array(128), right = new Float32Array(128);
  processor.process([[]], [[left, right]]);
  globalThis.currentFrame += 128;
  return left;
}
for (let index = 0; index < 32; index++) render();
const addBlock = render();
const rms = (block) => Math.sqrt(block.reduce((sum, value) => sum + value * value, 0) / block.length);
assert.ok(rms(addBlock) > .01 && addBlock.every(Number.isFinite), 'prepared Add target sounds');
await processor.port.onmessage({ data: { type: 'partials', requestId: 1, ...morph } });
assert.deepEqual(messages.at(-1), { type: 'partials-applied', requestId: 1, accepted: true });
for (let index = 0; index < 32; index++) render();
const morphBlock = render();
assert.ok(rms(morphBlock) > .01 && morphBlock.every(Number.isFinite), 'prepared Morph target sounds');
const difference = Math.max(...morphBlock.map((value, index) => Math.abs(value - addBlock[index])));
assert.ok(difference > .01, 'Morph target changes the sound');
console.log(`Prepared Add and Morph AudioWorklet: RMS ${rms(addBlock).toFixed(3)} / ${rms(morphBlock).toFixed(3)}, changed sound`);
