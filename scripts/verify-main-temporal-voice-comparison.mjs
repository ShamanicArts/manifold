// Re-render the analyzed temporal Main table in Wasm and compare to native Rust.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { renderWasm } from '../web/src/reference/comparison.js';

const sourceVariant = process.env.MANIFOLD_TEMPORAL_SOURCE ?? 'harmonic';
assert.ok(['harmonic', 'rhythmic'].includes(sourceVariant), 'Unknown temporal source variant');
const root = `web/public/reference/main-temporal-${sourceVariant === 'harmonic' ? 'voice' : 'rhythmic'}/`;
const floats = (name) => {
  const bytes = readFileSync(`${root}${name}`);
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};
const hash = (names) => {
  const digest = createHash('sha256');
  for (const name of names) digest.update(readFileSync(name));
  return digest.digest('hex');
};
const manifest = JSON.parse(readFileSync(`${root}manifest.json`, 'utf8'));
assert.equal(manifest.sourceVariant, sourceVariant);
assert.equal(hash([
  'crates/manifold-core/src/main_voice_bank.rs', 'crates/manifold-core/src/sample_analysis.rs',
  'crates/manifold-core/src/sine_bank.rs', 'crates/manifold-core/src/graph.rs',
  'crates/manifold-core/examples/render_main_voice_bank.rs',
  'scripts/generate-main-temporal-voice-reference.mjs',
]), manifest.sourceSha256);
assert.equal(hash([
  'tools/legacy-main-add-morph-voice-reference.cpp', 'tools/legacy-temporal-partials-reference.cpp',
  '../my-plugin/dsp/core/nodes/SineBankNode.cpp', '../my-plugin/dsp/core/nodes/SampleRegionPlaybackNode.cpp',
  '../my-plugin/dsp/core/nodes/TemporalPartialData.h', '../my-plugin/dsp/core/nodes/PartialsExtractor.h',
]), manifest.legacySourceSha256);
const wasmBytes = readFileSync('web/dist/manifold_filter.wasm');
assert.equal(createHash('sha256').update(wasmBytes).digest('hex'), manifest.wasmSha256);
manifest.sampleData = floats(manifest.sample);
const input = floats(manifest.input);
const outputs = new Map(), originalOutputs = new Map(), results = [];
for (const selected of manifest.cases) {
  selected.temporalTable = floats(selected.temporalFile);
  const native = floats(selected.output);
  const { instance: { exports: engine } } = await WebAssembly.instantiate(wasmBytes, {});
  const wasm = renderWasm(engine, 'main-voice-bank', manifest, input, selected);
  assert.equal(native.length, wasm.length);
  let max = 0, errorEnergy = 0, signalEnergy = 0;
  for (let index = 0; index < native.length; index++) {
    const difference = native[index] - wasm[index];
    max = Math.max(max, Math.abs(difference));
    errorEnergy += difference * difference;
    signalEnergy += native[index] * native[index];
  }
  const rms = Math.sqrt(errorEnergy / native.length);
  const signalRms = Math.sqrt(signalEnergy / native.length);
  assert.ok(signalRms > .005, `${selected.id}: output was silent`);
  assert.ok(max < 1e-6, `${selected.id}: native/Wasm max ${max}`);
  outputs.set(selected.id, native);
  const row = { id: selected.id, nativeVsWasm: { max, rms, signalRms } };
  if (selected.legacyOutput) {
    const original = floats(selected.legacyOutput);
    originalOutputs.set(selected.id, original);
    assert.equal(original.length, native.length);
    const start = 4096 * manifest.channels;
    let oldMax = 0, oldErrorEnergy = 0, oldSignalEnergy = 0, onsetMax = 0;
    for (let index = 0; index < original.length; index++) {
      const delta = original[index] - native[index];
      if (index < start) onsetMax = Math.max(onsetMax, Math.abs(delta));
      else {
        oldMax = Math.max(oldMax, Math.abs(delta));
        oldErrorEnergy += delta * delta;
        oldSignalEnergy += original[index] * original[index];
      }
    }
    const settledRms = Math.sqrt(oldErrorEnergy / (original.length - start));
    const oldSignalRms = Math.sqrt(oldSignalEnergy / (original.length - start));
    const parity = oldMax < .0007 && settledRms < .0002;
    if (sourceVariant === 'rhythmic' && !selected.id.endsWith('-static')) {
      // This source intentionally exposes the remaining interpolation gap.
      // Keep its measured limit separate from the harmonic parity gate.
      assert.ok(oldMax > .01 && oldMax < .03,
        `${selected.id}: rhythmic gap changed; inspect the original and prepared frames`);
      assert.ok(settledRms < .007, `${selected.id}: rhythmic RMS gap widened`);
      assert.equal(parity, false, `${selected.id}: update the parity claim if the gap closes`);
    } else {
      assert.ok(parity, `${selected.id}: old/Rust settled max ${oldMax}, RMS ${settledRms}`);
    }
    assert.ok(oldSignalRms > .05, `${selected.id}: original route silent`);
    assert.ok(onsetMax > (sourceVariant === 'rhythmic' ? .001 : .005),
      `${selected.id}: old UI envelope distinction missing`);
    row.settledOldVsNative = { max: oldMax, rms: settledRms, referenceRms: oldSignalRms, parity };
    row.onsetOldVsNative = { max: onsetMax };
    console.log(`${selected.id}: old/Rust settled max ${oldMax.toExponential(3)}, RMS ${settledRms.toExponential(3)}; onset ${onsetMax.toExponential(3)}; native/Wasm max ${max.toExponential(3)}`);
  } else {
    console.log(`${selected.id}: native/Wasm max ${max.toExponential(3)}, RMS ${rms.toExponential(3)}, signal RMS ${signalRms.toFixed(4)}`);
  }
  results.push(row);
}
for (const name of ['add', 'morph']) {
  const staticOutput = outputs.get(`${name}-static`);
  const followOutput = outputs.get(`${name}-follow`);
  const fastOutput = outputs.get(`${name}-fast`);
  const offset = 16_384 * 2;
  const peak = (candidate) => {
    let result = 0;
    for (let index = offset; index < candidate.length; index++) {
      result = Math.max(result, Math.abs(candidate[index] - staticOutput[index]));
    }
    return result;
  };
  assert.ok(peak(followOutput) > .01, `${name}: following did not change the sound`);
  assert.ok(peak(fastOutput) > .01, `${name}: fast following did not change the sound`);
  const oldStatic = originalOutputs.get(`old-${name}-static`);
  for (const motion of ['follow', 'fast']) {
    const oldMoving = originalOutputs.get(`old-${name}-${motion}`);
    let oldPeak = 0;
    for (let index = offset; index < oldMoving.length; index++) {
      oldPeak = Math.max(oldPeak, Math.abs(oldMoving[index] - oldStatic[index]));
    }
    assert.ok(oldPeak > .01, `${name}: original ${motion} did not move`);
  }
}
if (process.argv[2]) writeFileSync(process.argv[2], `${JSON.stringify({
  schemaVersion: 1, scope: manifest.scope, results,
}, null, 2)}\n`);
console.log(`Main temporal ${sourceVariant}: six two-voice native/Wasm renders and six original C++ routes checked${sourceVariant === 'rhythmic' ? '; moving-route parity remains open' : ''}`);
