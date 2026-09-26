// Re-render the analyzed temporal Main table in Wasm and compare to native Rust.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { renderWasm } from '../web/src/reference/comparison.js';

const root = 'web/public/reference/main-temporal-voice/';
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
assert.equal(hash([
  'crates/manifold-core/src/main_voice_bank.rs', 'crates/manifold-core/src/sample_analysis.rs',
  'crates/manifold-core/src/sine_bank.rs', 'crates/manifold-core/src/graph.rs',
  'crates/manifold-core/examples/render_main_voice_bank.rs',
  'scripts/generate-main-temporal-voice-reference.mjs',
]), manifest.sourceSha256);
const wasmBytes = readFileSync('web/dist/manifold_filter.wasm');
assert.equal(createHash('sha256').update(wasmBytes).digest('hex'), manifest.wasmSha256);
manifest.sampleData = floats(manifest.sample);
const input = floats(manifest.input);
const outputs = new Map(), results = [];
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
  results.push({ id: selected.id, nativeVsWasm: { max, rms, signalRms } });
  console.log(`${selected.id}: native/Wasm max ${max.toExponential(3)}, RMS ${rms.toExponential(3)}, signal RMS ${signalRms.toFixed(4)}`);
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
}
if (process.argv[2]) writeFileSync(process.argv[2], `${JSON.stringify({
  schemaVersion: 1, scope: manifest.scope, results,
}, null, 2)}\n`);
console.log('Main temporal bank: six native/Wasm renders and audible motion controls passed');
