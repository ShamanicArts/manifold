import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const wasm = await readFile(new URL('../web/public/manifold_filter.wasm', import.meta.url));
const contract = JSON.parse(await readFile(new URL('../projects/main-looper/project.json', import.meta.url)));
const ids = contract.synthParameters;
const { instance } = await WebAssembly.instantiate(wasm, {});
const e = instance.exports;
assert.equal(e.manifold_looper_prepare(8_000, 128), 1);
const input = new Float32Array(e.memory.buffer, e.manifold_looper_input_ptr(), 256);
const output = new Float32Array(e.memory.buffer, e.manifold_looper_output_ptr(), 256);
function block(value) {
  input.fill(value);
  assert.equal(e.manifold_looper_process(128), 1);
  return output[0];
}
globalThis.AudioWorkletProcessor = class {};
globalThis.registerProcessor = () => {};
const { captureStripBins } = await import('../web/src/audio/main-looper-processor.js');
for (let i = 0; i < 4; i++) block(.8);
for (let i = 0; i < 4; i++) block(0);
const captureBins = captureStripBins(contract.segments, 8, 16_000, 240_000,
  e.manifold_looper_status(contract.status.capturedFrames, 0));
const capturePeaks = captureBins.map(bin => bin ? e.manifold_looper_peak(0, 1, ...bin) : 0);
assert.ok(capturePeaks[0] > .79 && capturePeaks.at(-1) < .001,
  `the newest strip must run from older audio on the left to newer silence on the right: ${capturePeaks}`);
const nextStripBins = captureStripBins(contract.segments, 7, 16_000, 240_000,
  e.manifold_looper_status(contract.status.capturedFrames, 0));
const nextStripPeaks = nextStripBins.map(bin => bin ? e.manifold_looper_peak(0, 1, ...bin) : 0);
assert.ok(nextStripPeaks[0] < .001 && nextStripPeaks.at(-1) > .79,
  `audio crossing into an older strip must start at its right edge: ${nextStripPeaks}`);
for (let i = 0; i < 4; i++) block(0);
const progressedBins = captureStripBins(contract.segments, 7, 16_000, 240_000,
  e.manifold_looper_status(contract.status.capturedFrames, 0));
const progressedPeaks = progressedBins.map(bin => bin ? e.manifold_looper_peak(0, 1, ...bin) : 0);
assert.ok(progressedPeaks.at(-1) < .001 && progressedPeaks.at(-3) > .79,
  `the same audio must travel left within its strip as it ages: ${progressedPeaks}`);
assert.equal(e.manifold_looper_command(0, 0), 1);
for (let i = 0; i < 125; i++) block(.25);
assert.equal(e.manifold_looper_command(1, 0), 1);
assert.equal(e.manifold_looper_status(10, 0), 1); // one bar
assert.ok(Math.abs(e.manifold_looper_status(0, 0) - 120) < .001);
for (let i = 0; i < 20; i++) block(0);
assert.ok(Math.abs(block(0) - .25) < .001);
assert.equal(e.manifold_looper_control(0, 1), 1);
for (let i = 0; i < 125; i++) block(.1);
assert.equal(e.manifold_looper_command(7, .25), 1);
for (let i = 0; i < 20; i++) block(0);
assert.equal(e.manifold_looper_status(8, 1), 4_000);
assert.ok(block(0) > .25);
assert.equal(e.manifold_looper_command(5, 0), 1); // clear the earlier dry-input loops
for (let i = 0; i < 20; i++) block(0);
assert.equal(e.manifold_looper_synth_parameter(ids.waveform, 0), 1); // original wave branch, sine
assert.equal(e.manifold_looper_synth_parameter(ids.blend, -1), 1); // wave only; no sample loaded
for (const [id, value] of [[ids.attack, .1], [ids.decay, .2], [ids.sustain, .7], [ids.release, .4]]) {
  assert.equal(e.manifold_looper_synth_parameter(id, value), 1);
}
assert.equal(e.manifold_looper_synth_note(0, 60, 100), 1);
block(0);
const attackStartPeak = Math.max(...Array.from(output.subarray(0, 128), Math.abs));
for (let i = 0; i < 8; i++) block(0);
const attackLaterPeak = Math.max(...Array.from(output.subarray(0, 128), Math.abs));
assert.ok(attackLaterPeak > attackStartPeak * 2, `ADSR attack: ${attackStartPeak} to ${attackLaterPeak}`);
let synthPeak = 0;
for (let i = 0; i < 20; i++) synthPeak = Math.max(synthPeak, Math.abs(block(0)));
assert.ok(synthPeak > .001, `synth output peak ${synthPeak}`);
assert.equal(e.manifold_looper_synth_note(1, 60, 0), 1);
assert.equal(e.manifold_looper_control(0, 2), 1); // L2 receives the synth send
assert.equal(e.manifold_looper_command(7, .0625), 1);
for (let i = 0; i < 20; i++) block(0);
assert.equal(e.manifold_looper_status(8, 2), 1_000);
assert.ok(e.manifold_looper_peak(2, 0, 0, 1_000) > .001);
assert.equal(e.manifold_looper_status(8, 0), 0);
assert.equal(e.manifold_looper_command(5, 0), 1);
assert.equal(e.manifold_looper_synth_note(2, 0, 0), 1);
for (let i = 0; i < 16; i++) block(.35);
const capturedFrames = e.manifold_looper_sample_capture(0, .0625);
assert.equal(capturedFrames, 1_000);
while (e.manifold_looper_sample_progress() < capturedFrames) block(0);
assert.equal(e.manifold_looper_sample_publish_begin(), capturedFrames);
for (let offset = 0; offset < capturedFrames; offset += 128) {
  assert.equal(e.manifold_looper_sample_publish_chunk(offset, Math.min(128, capturedFrames - offset)), 1);
}
assert.equal(e.manifold_looper_sample_publish_finish(), 1);
assert.equal(e.manifold_looper_synth_sample_frames(), 1_000);
assert.ok(Math.abs(e.manifold_looper_synth_sample_peak(0, 1_000) - .35) < 1e-5);
assert.equal(e.manifold_looper_synth_sample_export_chunk(0, 1_000), 1_000);
assert.equal(e.manifold_looper_synth_sample_import_begin(1_000), 1);
assert.equal(e.manifold_looper_synth_sample_import_chunk(0, 1_000), 1);
assert.equal(e.manifold_looper_synth_sample_import_finish(), 1);
assert.ok(Math.abs(e.manifold_looper_synth_sample_peak(0, 1_000) - .35) < 1e-5);
assert.equal(e.manifold_looper_synth_parameter(ids.sampleXfade, .25), 1);
assert.equal(e.manifold_looper_synth_parameter(ids.blend, 1), 1);
assert.equal(e.manifold_looper_synth_note(0, 60, 100), 1);
let samplePeak = 0;
for (let i = 0; i < 4; i++) samplePeak = Math.max(samplePeak, Math.abs(block(0)));
assert.ok(samplePeak > .001, `live sample output peak ${samplePeak}`);
assert.equal(e.manifold_looper_synth_note(2, 0, 0), 1);
assert.equal(e.manifold_looper_command(5, 0), 1);
assert.equal(e.manifold_looper_control(0, 0), 1);
for (let i = 0; i < 12; i++) block(.22);
assert.equal(e.manifold_looper_command(6, .0625), 1);
assert.equal(e.manifold_looper_layer_control(0, 0, 2), 1);
for (let i = 0; i < 20; i++) block(0);
assert.equal(e.manifold_looper_sample_capture(1, .0625), 1_000);
while (e.manifold_looper_sample_progress() < 1_000) block(0);
assert.equal(e.manifold_looper_sample_publish_begin(), 1_000);
for (let offset = 0; offset < 1_000; offset += 128) {
  assert.equal(e.manifold_looper_sample_publish_chunk(offset, Math.min(128, 1_000 - offset)), 1);
}
assert.equal(e.manifold_looper_sample_publish_finish(), 1);
assert.ok(Math.abs(e.manifold_looper_synth_sample_peak(0, 1_000) - .22) < 1e-5);
assert.equal(e.manifold_looper_command(5, 0), 1);
assert.equal(e.manifold_looper_synth_note(0, 60, 100), 1);
let layerSamplePeak = 0;
for (let i = 0; i < 4; i++) layerSamplePeak = Math.max(layerSamplePeak, Math.abs(block(0)));
assert.ok(layerSamplePeak > .005, `L1 sample output peak ${layerSamplePeak}`);
assert.equal(e.manifold_looper_synth_note(2, 0, 0), 1);
for (let i = 0; i < 8; i++) block(.33);
assert.equal(e.manifold_looper_sample_free_start(0), 1);
for (let i = 0; i < 6; i++) block(.48);
assert.equal(e.manifold_looper_sample_free_elapsed(), 768);
assert.equal(e.manifold_looper_sample_free_finish(), 768);
while (e.manifold_looper_sample_progress() < 768) block(0);
assert.equal(e.manifold_looper_sample_publish_begin(), 768);
for (let offset = 0; offset < 768; offset += 128) {
  assert.equal(e.manifold_looper_sample_publish_chunk(offset, 128), 1);
}
assert.equal(e.manifold_looper_sample_publish_finish(), 1);
assert.equal(e.manifold_looper_synth_note(0, 60, 100), 1);
let freeSamplePeak = 0;
for (let i = 0; i < 4; i++) freeSamplePeak = Math.max(freeSamplePeak, Math.abs(block(0)));
assert.ok(freeSamplePeak > .005, `Free sample output peak ${freeSamplePeak}`);
assert.equal(e.manifold_looper_command(5, 0), 1);
assert.equal(e.manifold_looper_synth_note(2, 0, 0), 1);
assert.equal(e.manifold_looper_synth_parameter(ids.blend, -1), 1);
assert.equal(e.manifold_looper_synth_parameter(ids.waveform, 2), 1);
assert.equal(e.manifold_looper_synth_parameter(ids.filterCutoff, 80), 1);
assert.equal(e.manifold_looper_synth_parameter(ids.filterMode, 0), 1);
assert.equal(e.manifold_looper_synth_note(0, 96, 100), 1);
let lowpassLevel = 0;
for (let index = 0; index < 100; index++) {
  block(0);
  if (index >= 80) lowpassLevel += output.subarray(0, 128).reduce((sum, sample) => sum + Math.abs(sample), 0);
}
assert.equal(e.manifold_looper_synth_parameter(ids.filterMode, 2), 1);
let highpassLevel = 0;
for (let index = 0; index < 80; index++) {
  block(0);
  if (index >= 60) highpassLevel += output.subarray(0, 128).reduce((sum, sample) => sum + Math.abs(sample), 0);
}
assert.ok(highpassLevel > lowpassLevel * 5, `Main SVF: lowpass ${lowpassLevel}, highpass ${highpassLevel}`);
assert.equal(e.manifold_looper_synth_parameter(ids.filterCutoff, 16000), 1);
const eq = contract.eqParameters;
assert.equal(e.manifold_looper_synth_parameter(eq.base + 1, 3), 1);
assert.equal(e.manifold_looper_synth_parameter(eq.base + 2, 120), 1);
assert.equal(e.manifold_looper_synth_parameter(eq.base, 1), 1);
for (let index = 0; index < 40; index++) block(0);
assert.ok(e.manifold_looper_eq_response(2000) < -10, `Main EQ low-pass: ${e.manifold_looper_eq_response(2000)} dB`);
assert.equal(e.manifold_looper_synth_parameter(eq.base, 0), 1);
block(0);
assert.ok(Math.abs(e.manifold_looper_eq_response(2000)) < .01);
assert.equal(e.manifold_looper_synth_parameter(ids.filterMode, 0), 1);
const fx = contract.fxParameters;
function sustainedLevel() {
  let level = 0;
  for (let index = 0; index < 80; index++) {
    block(0);
    if (index >= 60) level += output.subarray(0, 128).reduce((sum, sample) => sum + Math.abs(sample), 0);
  }
  return level;
}
const dryFxLevel = sustainedLevel();
for (const base of [fx.fx1Base, fx.fx2Base]) {
  assert.equal(e.manifold_looper_synth_parameter(base, 5), 1); // original FilterNode
  assert.equal(e.manifold_looper_synth_parameter(base + fx.firstParamOffset, 0), 1);
  assert.equal(e.manifold_looper_synth_parameter(base + fx.mixOffset, 1), 1);
}
const twoFxLevel = sustainedLevel();
assert.ok(dryFxLevel > twoFxLevel * 5, `Main two FX slots: ${dryFxLevel} / ${twoFxLevel}`);
for (const base of [fx.fx1Base, fx.fx2Base]) assert.equal(e.manifold_looper_synth_parameter(base + fx.mixOffset, 0), 1);
assert.equal(e.manifold_looper_synth_note(2, 0, 0), 1);
assert.equal(e.manifold_looper_synth_parameter(ids.filterMode, 0), 1);
assert.equal(e.manifold_looper_synth_parameter(ids.filterCutoff, 3_200), 1);
assert.equal(e.manifold_looper_lfo_parameter(contract.modulation.lfoParameters.shape, 3), 1);
assert.equal(e.manifold_looper_lfo_parameter(contract.modulation.lfoParameters.rate, 1), 1);
assert.equal(e.manifold_looper_lfo_gate(0, 1), 1);
assert.equal(e.manifold_looper_lfo_gate(0, 0), 1);
assert.equal(e.manifold_looper_modulation_route(contract.modulation.routeParameters.target, 22), 1);
assert.equal(e.manifold_looper_modulation_route(contract.modulation.routeParameters.amount, -.2), 1);
assert.equal(e.manifold_looper_modulation_route(contract.modulation.routeParameters.enabled, 1), 1);
assert.equal(e.manifold_looper_synth_note(0, 96, 100), 1);
let cutEnergy = 0, openEnergy = 0;
for (let index = 0; index < 31; index++) {
  block(0);
  if (index > 25) cutEnergy += output.subarray(0, 128).reduce((sum, sample) => sum + Math.abs(sample), 0);
}
const cutEffective = e.manifold_looper_lfo_status(5);
for (let index = 0; index < 31; index++) {
  block(0);
  if (index > 25) openEnergy += output.subarray(0, 128).reduce((sum, sample) => sum + Math.abs(sample), 0);
}
const openEffective = e.manifold_looper_lfo_status(5);
assert.ok(openEffective > cutEffective + 2_000, `Main modulation cutoff ${cutEffective} to ${openEffective}`);
assert.ok(openEnergy > cutEnergy * 1.5, `Main modulation audio ${cutEnergy} to ${openEnergy}`);
assert.equal(e.manifold_looper_modulation_route(contract.modulation.routeParameters.enabled, 0), 1);
block(0);
assert.equal(e.manifold_looper_lfo_status(5), 3_200);
assert.equal(e.manifold_looper_synth_sample_clear(), 1);
assert.equal(e.manifold_looper_synth_sample_frames(), 0);
console.log(`Main LFO route: Filter cutoff ${cutEffective.toFixed(0)} → ${openEffective.toFixed(0)} Hz, sounding energy ${cutEnergy.toFixed(2)} → ${openEnergy.toFixed(2)}.`);
assert.equal(e.manifold_looper_synth_note(2, 0, 0), 1);
assert.equal(e.manifold_looper_synth_parameter(ids.blend, -1), 1);
assert.equal(e.manifold_looper_synth_parameter(ids.waveform, 2), 1);
assert.equal(e.manifold_looper_synth_parameter(ids.filterCutoff, 16_000), 1);
assert.equal(e.manifold_looper_synth_parameter(fx.fx1Base + fx.mixOffset, .5), 1);
assert.equal(e.manifold_looper_lfo_slot_active(1, 1), 1);
assert.equal(e.manifold_looper_lfo_slot_parameter(1, contract.modulation.lfoParameters.shape, 3), 1);
assert.equal(e.manifold_looper_lfo_slot_parameter(1, contract.modulation.lfoParameters.rate, 1), 1);
assert.equal(e.manifold_looper_lfo_slot_gate(1, 0, 1), 1);
assert.equal(e.manifold_looper_lfo_slot_gate(1, 0, 0), 1);
assert.equal(e.manifold_looper_modulation_slot_route(1, contract.modulation.routeParameters.target, 129), 1);
assert.equal(e.manifold_looper_modulation_slot_route(1, contract.modulation.routeParameters.amount, 1), 1);
assert.equal(e.manifold_looper_modulation_slot_route(1, contract.modulation.routeParameters.enabled, 1), 1);
assert.equal(e.manifold_looper_synth_note(0, 96, 100), 1);
let wetEnergy = 0, dryEnergy = 0;
for (let index = 0; index < 31; index++) {
  block(0);
  if (index > 25) wetEnergy += output.subarray(0, 128).reduce((sum, sample) => sum + Math.abs(sample), 0);
}
const wetMix = e.manifold_looper_lfo_slot_status(1, 7);
for (let index = 0; index < 31; index++) {
  block(0);
  if (index > 25) dryEnergy += output.subarray(0, 128).reduce((sum, sample) => sum + Math.abs(sample), 0);
}
const dryMix = e.manifold_looper_lfo_slot_status(1, 7);
assert.ok(wetMix > .99 && dryMix < .01, `FX1 mix route ${wetMix} → ${dryMix}`);
assert.ok(dryEnergy > wetEnergy * 2, `FX1 audio route ${wetEnergy} → ${dryEnergy}`);
assert.equal(e.manifold_looper_lfo_slot_active(1, 0), 1);
block(0);
assert.ok(Math.abs(e.manifold_looper_lfo_slot_status(0, 7) - .5) < .001);
assert.equal(e.manifold_looper_synth_parameter(fx.fx2Base + fx.mixOffset, .5), 1);
assert.equal(e.manifold_looper_lfo_slot_active(2, 1), 1);
assert.equal(e.manifold_looper_lfo_slot_parameter(2, contract.modulation.lfoParameters.shape, 3), 1);
assert.equal(e.manifold_looper_modulation_slot_route(2, contract.modulation.routeParameters.target, 137), 1);
assert.equal(e.manifold_looper_modulation_slot_route(2, contract.modulation.routeParameters.amount, 1), 1);
assert.equal(e.manifold_looper_modulation_slot_route(2, contract.modulation.routeParameters.enabled, 1), 1);
block(0);
assert.equal(e.manifold_looper_lfo_slot_status(2, 8), 1);
assert.equal(e.manifold_looper_lfo_slot_active(2, 0), 1);
block(0);
assert.ok(Math.abs(e.manifold_looper_lfo_slot_status(0, 8) - .5) < .001);
assert.equal(e.manifold_looper_lfo_slot_active(contract.modulation.maxLfos, 1), 0);
console.log(`Main second LFO route: FX1 mix ${wetMix.toFixed(2)} → ${dryMix.toFixed(2)}, sounding energy ${wetEnergy.toFixed(2)} → ${dryEnergy.toFixed(2)}.`);
assert.equal(e.manifold_looper_lfo_parameter(contract.modulation.lfoParameters.rate, .01), 1);
assert.equal(e.manifold_looper_lfo_gate(0, 1), 1);
assert.equal(e.manifold_looper_lfo_gate(0, 0), 1);
assert.equal(e.manifold_looper_atv_parameter(contract.modulation.atvParameters.sourceSlot, 0), 1);
assert.equal(e.manifold_looper_atv_parameter(contract.modulation.atvParameters.sourcePort, 0), 1);
assert.equal(e.manifold_looper_atv_parameter(contract.modulation.atvParameters.bias, 0), 1);
assert.equal(e.manifold_looper_atv_parameter(contract.modulation.atvParameters.amount, -1), 1);
assert.equal(e.manifold_looper_modulation_route(contract.modulation.routeParameters.source, 4), 1);
assert.equal(e.manifold_looper_modulation_route(contract.modulation.routeParameters.target, 129), 1);
assert.equal(e.manifold_looper_modulation_route(contract.modulation.routeParameters.amount, 1), 1);
assert.equal(e.manifold_looper_modulation_route(contract.modulation.routeParameters.mode, 1), 1);
assert.equal(e.manifold_looper_modulation_route(contract.modulation.routeParameters.enabled, 1), 1);
const atvDryEnergy = sustainedLevel();
assert.equal(e.manifold_looper_atv_status(0), 1);
assert.equal(e.manifold_looper_atv_status(1), -1);
assert.equal(e.manifold_looper_lfo_status(7), 0);
assert.equal(e.manifold_looper_atv_parameter(contract.modulation.atvParameters.amount, 1), 1);
const atvWetEnergy = sustainedLevel();
assert.equal(e.manifold_looper_atv_status(1), 1);
assert.equal(e.manifold_looper_lfo_status(7), 1);
assert.ok(atvDryEnergy > atvWetEnergy * 2,
  `ATV → FX1 mix must change audio: ${atvDryEnergy} / ${atvWetEnergy}`);
console.log(`Main ATV / Bias route: OUT -1 → +1, FX1 mix 0 → 1, sounding energy ${atvDryEnergy.toFixed(2)} → ${atvWetEnergy.toFixed(2)}.`);
const slew = contract.modulation.slewParameters;
assert.equal(e.manifold_looper_atv_parameter(contract.modulation.atvParameters.amount, 0), 1);
assert.equal(e.manifold_looper_atv_parameter(contract.modulation.atvParameters.bias, 0), 1);
assert.equal(e.manifold_looper_slew_parameter(slew.source, 16), 1);
block(0); // zero the default instant Slew before measuring its rise
assert.equal(e.manifold_looper_slew_status(1), 0);
assert.equal(e.manifold_looper_atv_parameter(contract.modulation.atvParameters.bias, 1), 1);
for (const [id, value] of [[slew.riseMs, 1000], [slew.fallMs, 1000], [slew.shape, 0], [slew.source, 16]]) {
  assert.equal(e.manifold_looper_slew_parameter(id, value), 1);
}
assert.equal(e.manifold_looper_modulation_route(contract.modulation.routeParameters.source, 5), 1);
block(0);
assert.equal(e.manifold_looper_slew_status(0), 1);
assert.ok(Math.abs(e.manifold_looper_slew_status(1) - .016) < 1e-6);
assert.ok(Math.abs(e.manifold_looper_lfo_status(7) - .508) < 1e-6);
const slewEarlyEnergy = sustainedLevel();
for (let index = 0; index < 90; index++) block(0);
const slewLateEnergy = sustainedLevel();
assert.ok(e.manifold_looper_slew_status(1) > .8);
assert.ok(slewEarlyEnergy > slewLateEnergy * 1.2,
  `Slew → FX1 mix must change sounding audio over time: ${slewEarlyEnergy} / ${slewLateEnergy}`);
assert.equal(e.manifold_looper_atv_parameter(contract.modulation.atvParameters.bias, -1), 1);
const beforeFall = e.manifold_looper_slew_status(1);
block(0);
assert.equal(e.manifold_looper_slew_status(0), -1);
assert.ok(e.manifold_looper_slew_status(1) < beforeFall);
assert.equal(e.manifold_looper_slew_parameter(slew.source, -1), 0);
assert.equal(e.manifold_looper_slew_parameter(slew.source, 17), 0);
console.log(`Main Slew route: OUT ${(.016).toFixed(3)} → ${beforeFall.toFixed(3)}, sounding energy ${slewEarlyEnergy.toFixed(2)} → ${slewLateEnergy.toFixed(2)}.`);
const hold = contract.modulation.sampleHoldParameters;
assert.equal(e.manifold_looper_atv_parameter(contract.modulation.atvParameters.bias, .75), 1);
for (const [id, value] of [[hold.mode, 0], [hold.source, 16], [hold.triggerSource, 4],
  [hold.manualGate, 0], [hold.held, 0], [hold.triggerHigh, 0]]) {
  assert.equal(e.manifold_looper_sample_hold_parameter(id, value), 1);
}
assert.equal(e.manifold_looper_modulation_route(contract.modulation.routeParameters.source, 6), 1);
block(0);
assert.equal(e.manifold_looper_sample_hold_status(2), 0);
assert.equal(e.manifold_looper_sample_hold_parameter(hold.manualGate, 1), 1);
block(0);
assert.equal(e.manifold_looper_sample_hold_status(2), .75);
assert.equal(e.manifold_looper_lfo_status(7), .875);
const heldHighEnergy = sustainedLevel();
assert.equal(e.manifold_looper_atv_parameter(contract.modulation.atvParameters.bias, -.4), 1);
block(0);
assert.ok(Math.abs(e.manifold_looper_sample_hold_status(0) + .4) < 1e-6);
assert.equal(e.manifold_looper_sample_hold_status(2), .75);
assert.equal(e.manifold_looper_sample_hold_parameter(hold.manualGate, 0), 1);
block(0);
assert.equal(e.manifold_looper_sample_hold_parameter(hold.manualGate, 1), 1);
block(0);
assert.ok(Math.abs(e.manifold_looper_sample_hold_status(2) + .4) < 1e-6);
assert.ok(Math.abs(e.manifold_looper_lfo_status(7) - .3) < 1e-6);
const heldLowEnergy = sustainedLevel();
assert.ok(heldLowEnergy > heldHighEnergy * 1.4,
  `Sample Hold → FX1 mix must change audio: ${heldHighEnergy} / ${heldLowEnergy}`);
assert.equal(e.manifold_looper_modulation_route(contract.modulation.routeParameters.source, 7), 1);
block(0);
assert.ok(Math.abs(e.manifold_looper_lfo_status(7) - .7) < 1e-6);
assert.equal(e.manifold_looper_sample_hold_parameter(hold.mode, 1), 1);
assert.equal(e.manifold_looper_atv_parameter(contract.modulation.atvParameters.bias, .2), 1);
block(0);
assert.ok(Math.abs(e.manifold_looper_sample_hold_status(2) - .2) < 1e-6);
assert.equal(e.manifold_looper_sample_hold_parameter(hold.mode, 2), 1);
assert.equal(e.manifold_looper_sample_hold_parameter(hold.manualGate, 0), 1);
block(0);
assert.equal(e.manifold_looper_atv_parameter(contract.modulation.atvParameters.bias, .6), 1);
assert.equal(e.manifold_looper_sample_hold_parameter(hold.manualGate, 1), 1);
block(0);
assert.ok(Math.abs(e.manifold_looper_sample_hold_status(2) - 2 / 3) < 1e-6);
assert.equal(e.manifold_looper_sample_hold_parameter(hold.held, .25), 1);
assert.equal(e.manifold_looper_sample_hold_parameter(hold.triggerHigh, 1), 1);
block(0);
assert.equal(e.manifold_looper_sample_hold_status(2), .25);
assert.equal(e.manifold_looper_sample_hold_parameter(hold.source, 18), 0);
console.log(`Main Sample Hold route: FX1 mix 0.875 → 0.300, sounding energy ${heldHighEnergy.toFixed(2)} → ${heldLowEnergy.toFixed(2)}.`);
const compare = contract.modulation.compareParameters;
assert.equal(e.manifold_looper_atv_parameter(contract.modulation.atvParameters.bias, -.2), 1);
for (const [id, value] of [[compare.direction, 0], [compare.threshold, 0],
  [compare.hysteresis, .05], [compare.source, 16], [compare.gate, 0], [compare.pulseRemaining, 0]]) {
  assert.equal(e.manifold_looper_compare_parameter(id, value), 1);
}
assert.equal(e.manifold_looper_modulation_route(contract.modulation.routeParameters.source, 8), 1);
block(0);
assert.equal(e.manifold_looper_compare_status(1), 0);
assert.equal(e.manifold_looper_lfo_status(7), 0);
const compareDryEnergy = sustainedLevel();
assert.equal(e.manifold_looper_atv_parameter(contract.modulation.atvParameters.bias, .2), 1);
block(0);
assert.equal(e.manifold_looper_compare_status(1), 1);
assert.equal(e.manifold_looper_compare_status(2), 1);
assert.equal(e.manifold_looper_lfo_status(7), 1);
const compareWetEnergy = sustainedLevel();
assert.ok(compareDryEnergy > compareWetEnergy * 1.2,
  `Compare GATE → FX1 mix must change sounding audio: ${compareDryEnergy} / ${compareWetEnergy}`);
assert.equal(e.manifold_looper_compare_parameter(compare.direction, 2), 1);
assert.equal(e.manifold_looper_modulation_route(contract.modulation.routeParameters.source, 9), 1);
assert.equal(e.manifold_looper_atv_parameter(contract.modulation.atvParameters.bias, -.2), 1);
block(0);
assert.equal(e.manifold_looper_compare_status(1), 0);
assert.equal(e.manifold_looper_compare_status(2), 1);
assert.equal(e.manifold_looper_lfo_status(7), 1);
block(0);
assert.equal(e.manifold_looper_compare_status(2), 1);
block(0);
assert.equal(e.manifold_looper_compare_status(2), 0);
assert.equal(e.manifold_looper_lfo_status(7), 0);
assert.equal(e.manifold_looper_compare_parameter(compare.gate, 1), 1);
assert.equal(e.manifold_looper_compare_parameter(compare.pulseRemaining, 2), 1);
assert.equal(e.manifold_looper_compare_status(3), 2);
assert.equal(e.manifold_looper_compare_parameter(compare.source, 20), 0);
console.log(`Main Compare route: GATE 0 → 1, sounding energy ${compareDryEnergy.toFixed(2)} → ${compareWetEnergy.toFixed(2)}; both-edge TRIG persists two ticks.`);
const cvMix = contract.modulation.cvMixParameters;
assert.equal(e.manifold_looper_atv_parameter(contract.modulation.atvParameters.bias, .8), 1);
assert.equal(e.manifold_looper_sample_hold_parameter(hold.held, -.4), 1);
assert.equal(e.manifold_looper_sample_hold_parameter(hold.triggerHigh, 1), 1);
assert.equal(e.manifold_looper_compare_parameter(compare.direction, 0), 1);
assert.equal(e.manifold_looper_compare_parameter(compare.source, 16), 1);
assert.equal(e.manifold_looper_compare_parameter(compare.gate, 0), 1);
for (const [id, value] of [[cvMix.level1, .5], [cvMix.level2, .25], [cvMix.level3, 0],
  [cvMix.level4, .25], [cvMix.offset, .1], [cvMix.source1, 16], [cvMix.source2, 18],
  [cvMix.source3, 20], [cvMix.source4, 19]]) {
  assert.equal(e.manifold_looper_cv_mix_parameter(id, value), 1);
}
assert.equal(e.manifold_looper_modulation_route(contract.modulation.routeParameters.source, 10), 1);
block(0);
assert.ok(Math.abs(e.manifold_looper_cv_mix_status(0) - .8) < 1e-6);
assert.ok(Math.abs(e.manifold_looper_cv_mix_status(1) + .4) < 1e-6);
assert.equal(e.manifold_looper_cv_mix_status(2), 1);
assert.ok(Math.abs(e.manifold_looper_cv_mix_status(3) - .4) < 1e-6);
assert.ok(Math.abs(e.manifold_looper_cv_mix_status(4) - .5) < 1e-6);
assert.ok(Math.abs(e.manifold_looper_lfo_status(7) - .75) < 1e-6);
const cvMixOutEnergy = sustainedLevel();
assert.equal(e.manifold_looper_modulation_route(contract.modulation.routeParameters.source, 11), 1);
block(0);
assert.ok(Math.abs(e.manifold_looper_cv_mix_status(5) + .5) < 1e-6);
assert.ok(Math.abs(e.manifold_looper_lfo_status(7) - .25) < 1e-6);
const cvMixInvEnergy = sustainedLevel();
assert.ok(cvMixInvEnergy > cvMixOutEnergy * 1.3,
  `CV Mix OUT/INV → FX1 mix must change audio: ${cvMixOutEnergy} / ${cvMixInvEnergy}`);
assert.equal(e.manifold_looper_cv_mix_parameter(cvMix.source4, 22), 0);
console.log(`Main CV Mix route: OUT +0.50 / INV -0.50, FX1 mix 0.75 → 0.25, sounding energy ${cvMixOutEnergy.toFixed(2)} → ${cvMixInvEnergy.toFixed(2)}.`);
const { instance: transientInstance } = await WebAssembly.instantiate(wasm, {});
const transient = transientInstance.exports;
assert.equal(transient.manifold_looper_prepare(8_000, 128), 1);
const transientInput = new Float32Array(transient.memory.buffer, transient.manifold_looper_input_ptr(), 256);
transientInput[100 * 2] = .9;
transientInput[100 * 2 + 1] = .9;
assert.equal(transient.manifold_looper_process(128), 1);
assert.ok(transient.manifold_looper_peak(0, 1, 0, 4096) > .89);
transientInput.fill(0);
for (let index = 0; index < 63; index++) assert.equal(transient.manifold_looper_process(128), 1);
const transientBins = captureStripBins(contract.segments, 4, 16_000, 240_000, 8192);
const transientPeaks = transientBins.map(bin => bin ? transient.manifold_looper_peak(0, 1, ...bin) : 0);
assert.ok(transientPeaks[63] > .89 && transientPeaks[62] === 0,
  `one-frame transient should remain in the older 1-bar strip's right-side bin: ${transientPeaks}`);
console.log('Main looper Wasm: First Loop, retrospective dry input, ADSR, SVF, two FX slots, EQ response, synth-to-layer capture, Retro/Free Sample voices, LFO rack, ATV / Bias, Slew, Sample Hold, Compare and CV Mix routing passed');
