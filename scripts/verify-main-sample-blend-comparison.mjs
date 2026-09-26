import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderWasm } from '../web/src/reference/comparison.js';

const root = 'web/public/reference/main-sample-blend/';
const floats = (path) => {
  const bytes = readFileSync(path);
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};
const manifest = JSON.parse(readFileSync(`${root}manifest.json`, 'utf8'));
manifest.sampleData = floats(`${root}${manifest.sample}`);
manifest.waveTargetData = floats(`${root}${manifest.waveTarget}`);
const input = floats(`${root}${manifest.input}`);
const wasmBytes = readFileSync('web/dist/manifold_filter.wasm');
for (const selected of manifest.cases) {
  selected.targetData = floats(`${root}${selected.target}`);
  const native = floats(`${root}${selected.output}`);
  const { instance: { exports: engine } } = await WebAssembly.instantiate(wasmBytes, {});
  const wasm = renderWasm(engine, 'main-sample-blend', manifest, input, selected);
  assert.equal(wasm.length, native.length);
  let max = 0, energy = 0;
  for (let index = 0; index < native.length; index++) {
    max = Math.max(max, Math.abs(native[index] - wasm[index]));
    energy += native[index] * native[index];
  }
  const rms = Math.sqrt(energy / native.length);
  console.log(`${selected.id}: max Δ ${max.toExponential(3)}, native RMS ${rms.toFixed(4)}`);
  assert.ok(max < 2e-4, `${selected.id} diverged`);
  assert.ok(rms > .005, `${selected.id} silent`);
  const cppMeter = floats(`${root}${selected.followerMeter}`);
  assert.equal(wasm.meters.length, cppMeter.length);
  const maxMeter = Math.max(...cppMeter.map((value, index) => Math.abs(value - wasm.meters[index])));
  assert.ok(maxMeter < 2e-4, `${selected.id} C++ follower mismatch ${maxMeter}`);
  if (selected.id === 'phrase-full') console.log(`Original C++ follower ↔ Wasm graph meter max Δ ${maxMeter.toExponential(3)}`);
}
