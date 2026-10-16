// Compare an assembled original C++ Main wave route with native Rust and Wasm.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderWasm } from '../web/src/reference/comparison.js';

const root = 'web/public/reference/main-wave-voice/';
const legacy = process.env.MANIFOLD_LEGACY_DIR ?? '../my-plugin';
const floats = (path) => {
  const bytes = readFileSync(path);
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};
const manifest = JSON.parse(readFileSync(`${root}manifest.json`, 'utf8'));
const hashFiles = (files) => {
  const hash = createHash('sha256');
  for (const file of files) hash.update(readFileSync(file));
  return hash.digest('hex');
};
assert.equal(hashFiles(['OscillatorNode.cpp', 'CrossfaderNode.cpp', 'MixerNode.cpp']
  .map((file) => join(legacy, 'dsp/core/nodes', file))), manifest.legacySourceSha256);
assert.equal(hashFiles(['tools/legacy-main-wave-voice-reference.cpp',
  'scripts/build-legacy-main-wave-voice-reference.sh']), manifest.referenceHarnessSha256);
assert.equal(hashFiles(['crates/manifold-core/src/main_voice_bank.rs',
  'crates/manifold-core/src/oscillator.rs', 'crates/manifold-core/src/graph.rs']), manifest.rustSourceSha256);
manifest.sampleData = floats(`${root}${manifest.sample}`);
const input = floats(`${root}${manifest.input}`);
const wasmBytes = readFileSync('web/dist/manifold_filter.wasm');
assert.equal(createHash('sha256').update(wasmBytes).digest('hex'), manifest.wasmSha256);
const start = manifest.settledStartFrame * manifest.channels;
const results = [];

const measure = (reference, candidate, offset = 0) => {
  let max = 0, sum = 0, energy = 0;
  for (let index = offset; index < reference.length; index++) {
    const delta = reference[index] - candidate[index];
    max = Math.max(max, Math.abs(delta));
    sum += delta * delta;
    energy += reference[index] * reference[index];
  }
  return { max, rms: Math.sqrt(sum / (reference.length - offset)),
    referenceRms: Math.sqrt(energy / (reference.length - offset)) };
};

for (const selected of manifest.cases) {
  const legacy = floats(`${root}${selected.legacyOutput}`);
  const native = floats(`${root}${selected.output}`);
  const { instance: { exports: engine } } = await WebAssembly.instantiate(wasmBytes, {});
  const wasm = renderWasm(engine, 'main-voice-bank', manifest, input, selected);
  assert.equal(legacy.length, native.length);
  assert.equal(wasm.length, native.length);
  const oldVsNative = measure(legacy, native, start);
  const nativeVsWasm = measure(native, wasm);
  const onset = measure(legacy.subarray(0, start), native.subarray(0, start));
  assert.ok(oldVsNative.max < 1e-5, `${selected.id}: settled C++ / Rust route diverged`);
  assert.ok(nativeVsWasm.max < 1e-6, `${selected.id}: native / Wasm diverged`);
  assert.ok(onset.max > 1e-4, `${selected.id}: old UI envelope boundary unexpectedly disappeared`);
  assert.ok(oldVsNative.referenceRms > .01, `${selected.id}: silent reference`);
  results.push({ id: selected.id, settledOldVsNative: oldVsNative,
    nativeVsWasm, onsetOldVsNative: onset });
  console.log(`${selected.id}: settled old/Rust max ${oldVsNative.max.toExponential(3)}, RMS ${oldVsNative.rms.toExponential(3)}; native/Wasm max ${nativeVsWasm.max.toExponential(3)}; onset max ${onset.max.toExponential(3)}`);
}
if (process.argv[2]) writeFileSync(process.argv[2], `${JSON.stringify({
  schemaVersion: 1, settledStartFrame: manifest.settledStartFrame,
  comparisonScope: manifest.scope, results,
}, null, 2)}\n`);
