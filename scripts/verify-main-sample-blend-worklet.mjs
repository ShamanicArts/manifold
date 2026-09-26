import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const project = JSON.parse(readFileSync('projects/main-sample-blend/project.json', 'utf8'));
const wasmBytes = readFileSync('web/dist/manifold_filter.wasm');
const sourceRate = 48_000;
const stereo = new Float32Array(sourceRate * 2);
for (let frame = 0; frame < sourceRate; frame++) {
  const sample = .35 * Math.sin(2 * Math.PI * 220 * frame / sourceRate)
    + .12 * Math.sin(2 * Math.PI * 440 * frame / sourceRate);
  stereo[frame * 2] = sample;
  stereo[frame * 2 + 1] = sample * .9;
}
const { instance: { exports: analysis } } = await WebAssembly.instantiate(wasmBytes, {});
assert.equal(analysis.manifold_analysis_begin(sourceRate, sourceRate), 1);
new Float32Array(analysis.memory.buffer, analysis.manifold_analysis_ptr(), stereo.length).set(stereo);
assert.equal(analysis.manifold_analysis_run_temporal(0, sourceRate, 128), 1);
new Float32Array(analysis.memory.buffer, analysis.manifold_analysis_recipe_ptr(), 11)
  .set([1, 8, .2, .3, .35, 0, .5, .7, 2, .1, 2]);
assert.equal(analysis.manifold_analysis_prepare_target(2, .5, .6, .5), 1);
const count = analysis.manifold_analysis_target_count();
assert.ok(count > 0 && count <= 32);
const prepared = { nodeId: 3, fundamental: analysis.manifold_analysis_target_fundamental(),
  values: new Float32Array(analysis.memory.buffer, analysis.manifold_analysis_target_ptr(), count * 4).slice() };
let Processor;
const messages = [];
globalThis.sampleRate = sourceRate;
globalThis.currentFrame = 0;
globalThis.AudioWorkletProcessor = class {
  constructor() { this.port = { postMessage: (message) => messages.push(message), onmessage: null }; }
};
globalThis.registerProcessor = (name, processor) => {
  assert.equal(name, 'manifold-project'); Processor = processor;
};
await import(pathToFileURL(resolve('web/src/audio/filter-processor.js')).href);

const processor = new Processor();
await processor.port.onmessage({ data: { type: 'init', wasmBytes, graph: project.signal,
  sample: { nodeId: 2, sourceRate, stereo }, partials: prepared } });
assert.deepEqual(messages.at(-1), { type: 'ready' });
for (const parameter of project.parameters) {
  await processor.port.onmessage({ data: { type: 'parameter', nodeId: parameter.nodeId,
    id: parameter.nodeParameterId, value: parameter.default } });
}
function render() {
  const left = new Float32Array(128), right = new Float32Array(128);
  processor.process([[]], [[left, right]]);
  globalThis.currentFrame += 128;
  assert.ok(left.every(Number.isFinite) && right.every(Number.isFinite));
  return left;
}
function settle() { for (let block = 0; block < 40; block++) render(); return render(); }
const rms = (block) => Math.sqrt(block.reduce((sum, value) => sum + value * value, 0) / block.length);
const both = settle();
assert.ok(rms(both) > .01, 'composed graph must sound');
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 4, id: 2, value: 0 } });
const sampleOnly = settle();
assert.ok(rms(sampleOnly) > .01, 'sample branch must sound alone');
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 11, id: 2, value: .35 } });
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 12, id: 0, value: -1 } });
const waveOnly = settle();
assert.ok(rms(waveOnly) > .02, 'base wave must sound alone');
assert.ok(Math.max(...sampleOnly.map((value, index) => Math.abs(value - waveOnly[index]))) > .02,
  'base crossfade must change the audible signal');
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 12, id: 0, value: 0 } });
const waveSample = settle();
assert.ok(rms(waveSample) > .02, 'centre blend must sound');
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 4, id: 1, value: 0 } });
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 4, id: 2, value: 1 } });
const additiveOnly = settle();
assert.ok(rms(additiveOnly) > .01, 'Sine bank branch must sound alone');
const difference = Math.max(...sampleOnly.map((value, index) => Math.abs(value - additiveOnly[index])));
assert.ok(difference > .01, 'branches must differ');
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 8, id: 0, value: 1 } });
const contoured = settle();
await processor.port.onmessage({ data: { type: 'meter-request', nodeId: 8, count: 1 } });
const phraseGain = messages.at(-1).values[0];
assert.ok(phraseGain > 1.5 && phraseGain <= 3, `sample phrase gain ${phraseGain}`);
assert.ok(rms(contoured) > rms(additiveOnly) * 1.5, 'sample envelope must shape additive level');
console.log(`Main sample blend worklet: one source → ${count} Morph partials; sample ${rms(sampleOnly).toFixed(3)}, wave ${rms(waveOnly).toFixed(3)}, centre ${rms(waveSample).toFixed(3)}, bank ${rms(additiveOnly).toFixed(3)} RMS`);
