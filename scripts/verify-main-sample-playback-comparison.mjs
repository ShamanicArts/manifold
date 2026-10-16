// Compare the original compiled sample player against native Rust and Wasm.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderWasm } from '../web/src/reference/comparison.js';

const root = 'web/public/reference/main-sample-playback/';
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
assert.equal(hashFiles([join(legacy, 'dsp/core/nodes/SampleRegionPlaybackNode.cpp')]), manifest.legacySourceSha256);
assert.equal(hashFiles(['tools/legacy-main-sample-playback-reference.cpp',
  'scripts/build-legacy-main-sample-playback-reference.sh']), manifest.referenceHarnessSha256);
assert.equal(hashFiles(['crates/manifold-core/src/sample_region.rs',
  'crates/manifold-core/src/graph.rs']), manifest.rustSourceSha256);
const wasmBytes = readFileSync('web/dist/manifold_filter.wasm');
assert.equal(createHash('sha256').update(wasmBytes).digest('hex'), manifest.wasmSha256);
manifest.sampleData = floats(`${root}${manifest.sample}`);
const input = floats(`${root}${manifest.input}`);
const results = [];

function measure(reference, candidate, scale = 1) {
  let max = 0, differenceEnergy = 0, referenceEnergy = 0;
  for (let index = 0; index < reference.length; index++) {
    const delta = reference[index] - candidate[index] * scale;
    max = Math.max(max, Math.abs(delta));
    differenceEnergy += delta * delta;
    referenceEnergy += reference[index] * reference[index];
  }
  return { max, rms: Math.sqrt(differenceEnergy / reference.length),
    referenceRms: Math.sqrt(referenceEnergy / reference.length) };
}

for (const selected of manifest.cases) {
  const original = floats(`${root}${selected.legacyOutput}`);
  const native = floats(`${root}${selected.output}`);
  const { instance: { exports: engine } } = await WebAssembly.instantiate(wasmBytes, {});
  const wasm = renderWasm(engine, 'sample-region', manifest, input, selected);
  assert.equal(original.length, native.length);
  assert.equal(native.length, wasm.length);
  const oldVsNative = measure(original, native, manifest.legacyCenterPanGain);
  const nativeVsWasm = measure(native, wasm);
  assert.ok(oldVsNative.max < 3e-8, `${selected.id}: original player / Rust region diverged`);
  assert.ok(nativeVsWasm.max < 1e-6, `${selected.id}: native / Wasm diverged`);
  assert.ok(oldVsNative.referenceRms > .01, `${selected.id}: silent reference`);
  results.push({ id: selected.id, oldVsNativeAfterCenterPan: oldVsNative, nativeVsWasm });
  console.log(`${selected.id}: old/Rust after center pan max ${oldVsNative.max.toExponential(3)}, RMS ${oldVsNative.rms.toExponential(3)}; native/Wasm max ${nativeVsWasm.max.toExponential(3)}`);
}
if (process.argv[2]) writeFileSync(process.argv[2], `${JSON.stringify({
  schemaVersion: 1, comparisonScope: manifest.scope,
  legacyCenterPanGain: manifest.legacyCenterPanGain, results,
}, null, 2)}\n`);
