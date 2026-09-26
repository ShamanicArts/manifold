import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bytes = readFileSync('web/public/manifold_filter.wasm');
const { instance: { exports: wasm } } = await WebAssembly.instantiate(bytes, {});
function analyze(stereo, rate, start, end, limit) {
  assert.equal(wasm.manifold_analysis_begin(stereo.length / 2, rate), 1);
  const pointer = wasm.manifold_analysis_ptr();
  new Float32Array(wasm.memory.buffer, pointer, stereo.length).set(stereo);
  assert.equal(wasm.manifold_analysis_run_temporal(start, end, limit), 1);
  const count = wasm.manifold_analysis_temporal_count();
  const frames = Array.from({ length: count }, (_, index) => {
    const partialCount = wasm.manifold_analysis_temporal_frame_field(index, 5);
    assert.ok(Number.isInteger(partialCount) && partialCount <= 32);
    const ptr = wasm.manifold_analysis_temporal_partials_ptr(index);
    const partials = new Float32Array(wasm.memory.buffer, ptr, partialCount * 4).slice();
    assert.ok(partials.every(Number.isFinite));
    return { position: wasm.manifold_analysis_temporal_frame_field(index, 0),
      sourceStart: wasm.manifold_analysis_temporal_frame_field(index, 1),
      rms: wasm.manifold_analysis_temporal_frame_field(index, 2),
      fundamental: wasm.manifold_analysis_temporal_frame_field(index, 4), partials };
  });
  return { mode: wasm.manifold_analysis_temporal_meta(6),
    fundamental: wasm.manifold_analysis_temporal_meta(4),
    confidence: wasm.manifold_analysis_temporal_meta(5),
    region: [wasm.manifold_analysis_temporal_meta(2), wasm.manifold_analysis_temporal_meta(3)],
    frames };
}

const rate = 48000;
const tone = new Float32Array(rate * 2);
for (let index = 0; index < rate; index++) {
  const time = index / rate;
  const sample = .5 * Math.sin(2 * Math.PI * 220 * time) + .2 * Math.sin(2 * Math.PI * 440 * time);
  tone[index * 2] = sample;
  tone[index * 2 + 1] = sample * .9;
}
const pitched = analyze(tone, rate, 4096, rate - 4096, 12);
assert.equal(pitched.mode, 0);
assert.deepEqual(pitched.region, [4096, rate - 4096]);
assert.ok(Math.abs(pitched.fundamental - 220) < 3);
assert.equal(pitched.frames.length, 12);
assert.ok(pitched.frames.every((frame) => frame.sourceStart >= 4096 && frame.sourceStart < rate - 4096));
assert.ok(pitched.frames.some((frame) => Array.from(frame.partials).some((value, index) => index % 4 === 0 && Math.abs(value - 440) < 12)));

let seed = 0x9e3779b9;
const noise = new Float32Array(rate * 2);
for (let index = 0; index < rate; index++) {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  const sample = (seed >>> 0) / 0xffffffff * .4 - .2;
  noise[index * 2] = sample;
  noise[index * 2 + 1] = sample;
}
const unpitched = analyze(noise, rate, 0, rate, 8);
assert.equal(unpitched.mode, 1);
assert.ok(unpitched.frames.some((frame) => frame.partials.length > 0));

const silence = analyze(new Float32Array(8192 * 2), rate, 0, 8192, 4);
assert.ok(silence.frames.every((frame) => frame.partials.length === 0));
console.log(`Temporal Wasm: ${pitched.frames.length} pitched frames at ${pitched.fundamental.toFixed(2)} Hz; ${unpitched.frames.length} peak frames; silence empty`);
