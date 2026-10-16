import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const base = 'web/public/reference/phase-vocoder/';
const manifest = JSON.parse(readFileSync(`${base}manifest.json`, 'utf8'));
const floats = (file) => {
  const bytes = readFileSync(`${base}${file}`);
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};
const input = floats(manifest.input);
const wasmBytes = readFileSync('web/public/manifold_filter.wasm');
const reports = [];
const rms = (values) => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
const difference = (a, b) => {
  let max = 0, sum = 0;
  for (let index = 0; index < a.length; index++) {
    const delta = a[index] - b[index];
    max = Math.max(max, Math.abs(delta));
    sum += delta * delta;
  }
  return { max, rms: Math.sqrt(sum / a.length) };
};
const stereoError = (stereo) => {
  let sum = 0, count = 0;
  for (let frame = 4096; frame < stereo.length / 2; frame++) {
    const delta = stereo[frame * 2 + 1] - stereo[frame * 2] * .9;
    sum += delta * delta; count++;
  }
  return Math.sqrt(sum / count);
};
for (const selected of manifest.cases) {
  const cpp = floats(selected.output);
  const native = floats(selected.rustOutput);
  const { instance: { exports: wasm } } = await WebAssembly.instantiate(wasmBytes, {});
  assert.equal(wasm.manifold_graph_begin(3, 2), 1);
  for (const [id, kind] of [[1, 0], [2, 62], [3, 7]]) assert.equal(wasm.manifold_graph_node(id, kind, 0, 0), 1);
  assert.equal(wasm.manifold_graph_edge(1, 2, 0), 1);
  assert.equal(wasm.manifold_graph_edge(2, 3, 0), 1);
  selected.before.forEach((value, id) => assert.equal(wasm.manifold_graph_initial_parameter(2, id, value), 1));
  assert.equal(wasm.manifold_prepare(manifest.sampleRate, selected.blockSize), 1);
  const block = selected.blockSize;
  const inView = new Float32Array(wasm.memory.buffer, wasm.manifold_input_ptr(), block * 2);
  const outView = new Float32Array(wasm.memory.buffer, wasm.manifold_output_ptr(), block * 2);
  const rendered = new Float32Array(input.length);
  for (let offset = 0; offset < manifest.frames; offset += block) {
    const count = Math.min(block, manifest.frames - offset);
    for (let frame = 0; frame < count; frame++) {
      inView[frame] = input[(offset + frame) * 2];
      inView[block + frame] = input[(offset + frame) * 2 + 1];
    }
    assert.equal(wasm.manifold_process(count), 1);
    for (let frame = 0; frame < count; frame++) {
      rendered[(offset + frame) * 2] = outView[frame];
      rendered[(offset + frame) * 2 + 1] = outView[block + frame];
    }
  }
  assert.ok(rendered.every(Number.isFinite));
  const nativeWasm = difference(native, rendered);
  const cppNative = difference(cpp, native);
  assert.ok(nativeWasm.max < 2e-4, `${selected.id} Rust/Wasm mismatch ${nativeWasm.max}`);
  if (!selected.id.startsWith('hq')) assert.ok(cppNative.max < 1e-4, `${selected.id} C++ mismatch ${cppNative.max}`);
  const report = { id: selected.id, cppNative, nativeWasm,
    cppStereoError: stereoError(cpp), rustStereoError: stereoError(native),
    cppRms: rms(cpp), rustRms: rms(native) };
  reports.push(report);
  console.log(`${selected.id}: C++/Rust ${cppNative.max.toExponential(2)}, Rust/Wasm ${nativeWasm.max.toExponential(2)}, stereo ${report.cppStereoError.toExponential(2)} → ${report.rustStereoError.toExponential(2)}`);
}
const hqUp = reports.find((entry) => entry.id === 'hq-up');
assert.ok(hqUp.cppStereoError > .01 && hqUp.rustStereoError < 1e-4,
  'HQ stereo cursor correction must be measurable');
const report = `${JSON.stringify({ sourceSha256: manifest.sourceSha256, cases: reports }, null, 2)}\n`;
writeFileSync('artifacts/reviews/checkpoint-109-phase-vocoder-comparison.json', report);
writeFileSync(`${base}comparison.json`, report);
