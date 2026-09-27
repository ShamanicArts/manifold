// Compare compiled original Main fixed-spectrum Add/Morph nodes with Rust and Wasm.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderWasm } from '../web/src/reference/comparison.js';

const root = 'web/public/reference/main-add-morph-voice/';
const legacy = process.env.MANIFOLD_LEGACY_DIR ?? '../my-plugin';
const hashFiles = (files) => {
  const hash = createHash('sha256');
  for (const file of files) hash.update(readFileSync(file));
  return hash.digest('hex');
};
const floats = (path) => {
  const bytes = readFileSync(path);
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};
const manifest = JSON.parse(readFileSync(`${root}manifest.json`, 'utf8'));
assert.equal(hashFiles(['SampleRegionPlaybackNode.cpp', 'OscillatorNode.cpp', 'SineBankNode.cpp',
  'GainNode.cpp', 'CrossfaderNode.cpp', 'MixerNode.cpp'].map((file) => join(legacy, 'dsp/core/nodes', file))), manifest.legacySourceSha256);
assert.equal(hashFiles(['tools/legacy-main-add-morph-voice-reference.cpp',
  'scripts/build-legacy-main-add-morph-voice-reference.sh']), manifest.referenceHarnessSha256);
assert.equal(hashFiles([...['main_voice_bank.rs', 'sample_region.rs', 'oscillator.rs', 'wave_add_oscillator.rs', 'sine_bank.rs', 'graph.rs',
  'spectral_targets.rs'].map((file) => join('crates/manifold-core/src', file)),
  'crates/manifold-core/examples/emit_main_wave_recipe.rs',
  'crates/manifold-core/examples/emit_main_add_source_recipe.rs',
  'crates/manifold-core/examples/emit_main_morph_source_recipe.rs']), manifest.rustSourceSha256);
const wasmBytes = readFileSync('web/dist/manifold_filter.wasm');
assert.equal(createHash('sha256').update(wasmBytes).digest('hex'), manifest.wasmSha256);
manifest.sampleData = floats(`${root}${manifest.sample}`);
const input = floats(`${root}${manifest.input}`);
const start = manifest.settledStartFrame * manifest.channels;
const results = [];

function measure(reference, candidate, offset = 0) {
  let max = 0, errorEnergy = 0, referenceEnergy = 0;
  for (let index = offset; index < reference.length; index++) {
    const delta = reference[index] - candidate[index];
    max = Math.max(max, Math.abs(delta));
    errorEnergy += delta * delta;
    referenceEnergy += reference[index] * reference[index];
  }
  const count = reference.length - offset;
  return { max, rms: Math.sqrt(errorEnergy / count),
    referenceRms: Math.sqrt(referenceEnergy / count) };
}

for (const selected of manifest.cases) {
  const original = floats(`${root}${selected.legacyOutput}`);
  const native = floats(`${root}${selected.output}`);
  const { instance: { exports: engine } } = await WebAssembly.instantiate(wasmBytes, {});
  const wasm = renderWasm(engine, 'main-voice-bank', manifest, input, selected);
  assert.equal(original.length, native.length);
  assert.equal(native.length, wasm.length);
  const oldVsNative = measure(original, native, start);
  const nativeVsWasm = measure(native, wasm);
  const onset = measure(original.subarray(0, start), native.subarray(0, start));
  assert.ok(oldVsNative.max < 5e-6, `${selected.id}: settled original / Rust route diverged`);
  assert.ok(nativeVsWasm.max < 1e-6, `${selected.id}: native / Wasm diverged`);
  assert.ok(onset.max > 1e-4, `${selected.id}: old UI envelope boundary unexpectedly disappeared`);
  assert.ok(oldVsNative.referenceRms > .01, `${selected.id}: silent reference`);
  results.push({ id: selected.id, settledOldVsNative: oldVsNative,
    nativeVsWasm, onsetOldVsNative: onset });
  console.log(`${selected.id}: settled old/Rust max ${oldVsNative.max.toExponential(3)}, RMS ${oldVsNative.rms.toExponential(3)}; native/Wasm max ${nativeVsWasm.max.toExponential(3)}; onset max ${onset.max.toExponential(3)}`);
}
const pulseNarrow = floats(`${root}add-driven-pulse-narrow-rust.f32`);
const pulseHalf = floats(`${root}add-driven-pulse-half-rust.f32`);
const bright = floats(`${root}add-driven-bright-rust.f32`);
const saw = floats(`${root}add-driven-saw-rust.f32`);
assert.ok(measure(pulseNarrow, pulseHalf).max > .05,
  'Changing driven pulse width did not affect the assembled voice');
assert.ok(measure(saw, bright).max > .01,
  'Changing driven waveform did not affect the assembled voice');
const different = (a, b) => measure(
  floats(`${root}${a}-rust.f32`), floats(`${root}${b}-rust.f32`), start,
).max;
assert.ok(different('add-neutral', 'add-stretch') > .2,
  'Add stretch did not move the settled source spectrum');
assert.ok(different('add-neutral', 'add-tilt-bright') > .04
  && different('add-tilt-bright', 'add-tilt-dark') > .08,
  'Add tilt modes did not change the settled source spectrum');
assert.ok(different('morph-linear-quarter', 'morph-cosine-quarter') > .01
  && different('morph-cosine-quarter', 'morph-equal-quarter') > .01,
  'Morph curve did not change the settled voice');
assert.ok(different('morph-depth-low', 'morph-depth-full') > .1,
  'Morph frequency depth did not change the settled voice');
if (process.argv[2]) writeFileSync(process.argv[2], `${JSON.stringify({
  schemaVersion: 1, settledStartFrame: manifest.settledStartFrame,
  comparisonScope: manifest.scope, results,
}, null, 2)}\n`);
