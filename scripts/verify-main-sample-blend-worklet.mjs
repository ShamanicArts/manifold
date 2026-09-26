import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parameterRoutes } from '../web/src/audio/parameter-routing.js';

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
assert.equal(analysis.manifold_analysis_prepare_wave_target(1, 8, 0, 0, .5), 1);
const waveCount = analysis.manifold_analysis_target_count();
const wavePrepared = { nodeId: 13, fundamental: 1,
  values: new Float32Array(analysis.memory.buffer, analysis.manifold_analysis_target_ptr(), waveCount * 4).slice() };
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
  sample: { nodeId: 2, sourceRate, stereo }, partials: [prepared, wavePrepared] } });
assert.deepEqual(messages.at(-1), { type: 'ready' });
const parameters = new Map(project.parameters.map((parameter) => [parameter.id, parameter]));
const parameterValues = new Map(project.parameters.map((parameter) => [parameter.id, parameter.default]));
async function publishParameter(id, value) {
  parameterValues.set(id, value);
  const updates = parameterRoutes(parameters, parameterValues, id);
  if (updates.length) await processor.port.onmessage({ data: { type: 'parameter-batch', updates } });
  const directionalId = parameters.get(id).directionalParameterId;
  if (directionalId != null) await processor.port.onmessage({ data: { type: 'directional-parameter', id: directionalId, value } });
  const pitchId = parameters.get(id).pitchParameterId;
  if (pitchId != null) await processor.port.onmessage({ data: { type: 'pitch-parameter', id: pitchId, value } });
  return updates;
}
for (const parameter of project.parameters) await publishParameter(parameter.id, parameter.default);
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
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 15, id: 0, value: .5 } });
const lowSampleStage = settle();
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 15, id: 0, value: 1.5 } });
const highSampleStage = settle();
assert.ok(rms(highSampleStage) > rms(lowSampleStage) * 2,
  'sample gain stage must change the live voice level');
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 15, id: 0, value: 1 } });
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
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 14, id: 0, value: -1 } });
const additiveWave = settle();
assert.ok(rms(additiveWave) > .01, `wave-derived additive source must sound (RMS ${rms(additiveWave)})`);
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 14, id: 0, value: 0 } });
const additiveCentre = settle();
assert.ok(rms(additiveCentre) > .01, 'wave/source additive centre must sound');
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 14, id: 0, value: 1 } });
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 8, id: 0, value: 1 } });
const contoured = settle();
await processor.port.onmessage({ data: { type: 'meter-request', nodeId: 8, count: 1 } });
const phraseGain = messages.at(-1).values[0];
assert.ok(phraseGain > 1.5 && phraseGain <= 3, `sample phrase gain ${phraseGain}`);
assert.ok(rms(contoured) > rms(additiveOnly) * 1.5, 'sample envelope must shape additive level');
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 8, id: 0, value: 0 } });
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 12, id: 0, value: 1 } });
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 4, id: 65, value: 0 } });
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 4, id: 66, value: 1 } });
const linkedBase = settle();
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 4, id: 65, value: 1 } });
const linkedAdd = settle();
assert.ok(rms(linkedBase) > .01 && rms(linkedAdd) > .01, 'both linked depth endpoints must sound');
assert.ok(Math.max(...linkedBase.map((value, index) => Math.abs(value - linkedAdd[index]))) > .02,
  'linked depth must switch the audible branch');
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 4, id: 66, value: 0 } });
const restoredIndependent = settle();
assert.ok(rms(restoredIndependent) > .01, 'independent gains must resume after unlinking');
const linkedRoutes = await publishParameter(22, 1);
assert.deepEqual(linkedRoutes, [
  { nodeId: 11, id: 2, value: .5 }, { nodeId: 15, id: 0, value: 1 },
  { nodeId: 13, id: 1, value: 1 }, { nodeId: 3, id: 1, value: 1 },
]);
assert.deepEqual(await publishParameter(20, .25), [], 'manual gain stays saved while amplitude link is active');
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 4, id: 1, value: 1 } });
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 4, id: 2, value: 0 } });
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 12, id: 0, value: 1 } });
await publishParameter(21, .25);
const linkedSampleQuiet = settle();
await publishParameter(21, .75);
const linkedSampleLoud = settle();
assert.ok(rms(linkedSampleLoud) > rms(linkedSampleQuiet) * 2,
  'one linked voice amplitude must change the sample path');
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 12, id: 0, value: -1 } });
await publishParameter(21, .15);
const linkedWaveQuiet = settle();
await publishParameter(21, .45);
const linkedWaveLoud = settle();
assert.ok(rms(linkedWaveLoud) > rms(linkedWaveQuiet) * 2,
  'one linked voice amplitude must change the oscillator path');
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 4, id: 1, value: 0 } });
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 4, id: 2, value: 1 } });
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 14, id: 0, value: 1 } });
await publishParameter(21, .15);
const linkedAddQuiet = settle();
await publishParameter(21, .45);
const linkedAddLoud = settle();
assert.ok(rms(linkedAddLoud) > rms(linkedAddQuiet) * 2,
  'one linked voice amplitude must change the prepared Add path');
const restoredRoutes = await publishParameter(22, 0);
assert.deepEqual(restoredRoutes, [
  { nodeId: 3, id: 1, value: .5 }, { nodeId: 13, id: 1, value: .5 },
  { nodeId: 11, id: 2, value: 0 }, { nodeId: 15, id: 0, value: .25 },
]);
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 11, id: 1, value: 330 } });
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 11, id: 2, value: .5 } });
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 12, id: 0, value: -1 } });
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 4, id: 1, value: 1 } });
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 4, id: 2, value: 0 } });
const freeSyncWave = settle();
await publishParameter(23, 1);
const sampleSyncedWave = settle();
assert.ok(Math.max(...freeSyncWave.map((value, index) => Math.abs(value - sampleSyncedWave[index]))) > .02,
  'raw sample zero crossings must audibly reset the wave oscillator');
await publishParameter(23, 0);
const normalizedPosition = async () => {
  await processor.port.onmessage({ data: { type: 'meter-request', nodeId: 2, count: 1 } });
  return messages.at(-1).values[0];
};
await publishParameter(16, -1);
const normalDirectionWave = settle();
await publishParameter(18, .8);
await publishParameter(25, 1);
await publishParameter(26, 1);
await publishParameter(24, 2);
const fmDirectionWave = settle();
assert.ok(Math.max(...normalDirectionWave.map((value, index) => Math.abs(value - fmDirectionWave[index]))) > .02,
  'Rust FM block motion must audibly move oscillator pitch');
await processor.port.onmessage({ data: { type: 'meter-request', nodeId: 11, count: 3 } });
assert.ok(Math.abs(messages.at(-1).values[0] - 330) > .5,
  'Rust FM block motion must set a non-base oscillator frequency target');
await publishParameter(16, 1);
await publishParameter(26, 0);
let changedSpeed = false;
for (let block = 0; block < 8; block++) {
  const before = await normalizedPosition();
  render();
  const after = await normalizedPosition();
  changedSpeed ||= Math.abs(after - before - 128 / (sourceRate - 1)) > .00015;
}
assert.ok(changedSpeed, 'Rust FM block motion must move the sample cursor at a non-base speed');
await publishParameter(24, 3);
await publishParameter(27, 1);
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 2, id: 7, value: 1 } });
const retriggerPositions = [];
for (let block = 0; block < 8; block++) {
  render();
  retriggerPositions.push(await normalizedPosition());
}
assert.ok(retriggerPositions.some((position, index) => index && position < retriggerPositions[index - 1]),
  'Rust Sync mode must retrigger the sample at a phase wrap');
await publishParameter(27, 0);
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 2, id: 7, value: 1 } });
const playPositions = [];
for (let block = 0; block < 8; block++) {
  render();
  playPositions.push(await normalizedPosition());
}
assert.ok(playPositions.every((position, index) => !index || position > playPositions[index - 1]),
  'Sync play must leave the sample cursor running');
await publishParameter(23, 1);
render();
await processor.port.onmessage({ data: { type: 'meter-request', nodeId: 11, count: 3 } });
assert.equal(messages.at(-1).values[2], 0, 'sample-facing Sync suppresses manual hard sync');
await publishParameter(24, 0);
render();
await processor.port.onmessage({ data: { type: 'meter-request', nodeId: 11, count: 3 } });
assert.equal(messages.at(-1).values[2], 1, 'normal mode restores the saved manual hard sync');
await publishParameter(23, 0);
await publishParameter(13, 330);
await publishParameter(16, -1);
const manualNoteWave = settle();
await publishParameter(29, 69);
await publishParameter(30, 2);
await publishParameter(31, 12);
await publishParameter(32, 0);
await publishParameter(28, 1);
const mappedNoteWave = settle();
assert.ok(Math.max(...manualNoteWave.map((value, index) => Math.abs(value - mappedNoteWave[index]))) > .02,
  'mapped Main pitch must audibly move the wave');
await processor.port.onmessage({ data: { type: 'meter-request', nodeId: 11, count: 1 } });
assert.ok(Math.abs(messages.at(-1).values[0] - 660) < .01, 'both keytrack moves the wave by one octave');
await publishParameter(30, 1);
await publishParameter(32, 2);
render();
await processor.port.onmessage({ data: { type: 'meter-request', nodeId: 11, count: 1 } });
assert.ok(Math.abs(messages.at(-1).values[0] - 440) < .01, 'sample keytrack locks wave to the root note');
await processor.port.onmessage({ data: { type: 'meter-request', nodeId: 6, count: 4 } });
assert.equal(messages.at(-1).values[0], 1, 'HQ chooses the second vocoder mode');
assert.ok(Math.abs(messages.at(-1).values[1] - 7.01955) < .001, 'vocoder receives the mapped shift');
assert.equal(messages.at(-1).values[3], 1, 'mapped vocoder branch is wet');
await publishParameter(7, -3);
await publishParameter(9, .25);
await publishParameter(28, 0);
render();
await processor.port.onmessage({ data: { type: 'meter-request', nodeId: 6, count: 4 } });
assert.equal(messages.at(-1).values[1], -3, 'manual vocoder shift returns after unlinking');
assert.equal(messages.at(-1).values[3], .25, 'manual vocoder mix returns after unlinking');
console.log(`Main sample blend worklet: one source → ${count} Morph and ${waveCount} wave partials; sample ${rms(sampleOnly).toFixed(3)}, base wave ${rms(waveOnly).toFixed(3)}, additive wave ${rms(additiveWave).toFixed(3)}, linked base/add ${rms(linkedBase).toFixed(3)}/${rms(linkedAdd).toFixed(3)} RMS; FM/Sync and note/keytrack/vocoder routing checked`);
