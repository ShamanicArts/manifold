import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const wasm = await readFile(new URL('../web/public/manifold_filter.wasm', import.meta.url));
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
assert.equal(e.manifold_looper_synth_parameter(0, 0), 1); // original wave branch, sine
assert.equal(e.manifold_looper_synth_parameter(1, -1), 1); // wave only; no sample loaded
assert.equal(e.manifold_looper_synth_note(0, 60, 100), 1);
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
assert.equal(e.manifold_looper_synth_parameter(20, .25), 1);
assert.equal(e.manifold_looper_synth_parameter(1, 1), 1);
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
assert.ok(layerSamplePeak > .01, `L1 sample output peak ${layerSamplePeak}`);
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
assert.ok(freeSamplePeak > .01, `Free sample output peak ${freeSamplePeak}`);
console.log('Main looper Wasm: First Loop, retrospective dry input, Rust synth-to-layer capture, and Retro/Free Sample voices passed');
