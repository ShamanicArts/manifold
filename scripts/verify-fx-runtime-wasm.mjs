// Compare graph kind 53 with the old C++ FX branch runtime switch capture.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const reference = fs.readFileSync(path.join(root, 'target/legacy-reference/fx-runtime-switch.f32'));
const input = fs.readFileSync(path.join(root, 'web/public/reference/standalone-fx-routing/input.f32'));
if (reference.length !== 32768 * 2 * 4 || input.length !== reference.length) {
  throw new Error('Run python3 scripts/probe-fx-runtime-switch.py and node scripts/make-fx-routing-fixture.mjs first.');
}
const { instance } = await WebAssembly.instantiate(fs.readFileSync(path.join(root, 'web/public/manifold_filter.wasm')), {});
const wasm = instance.exports;
const required = (name, ...args) => {
  if (wasm[name](...args) !== 1) throw new Error(`${name} failed for ${args.join(', ')}`);
};
required('manifold_graph_begin', 3, 2);
required('manifold_graph_node', 1, 0, 0, 0);
required('manifold_graph_node', 2, 53, 8, 1);
required('manifold_graph_node', 3, 7, 0, 0);
required('manifold_graph_edge', 1, 2, 0);
required('manifold_graph_edge', 2, 3, 0);
required('manifold_graph_initial_parameter', 2, 2, 0);
required('manifold_graph_initial_parameter', 2, 3, 0.6);
required('manifold_prepare', 48000, 128);
const inputPtr = wasm.manifold_input_ptr() / 4;
const outputPtr = wasm.manifold_output_ptr() / 4;
const ranges = [[0, 8192], [8192, 16384], [16384, 32768]];
const parts = ranges.map(([begin, end]) => ({ begin, end, max: 0, sumSquares: 0 }));
const samples = {};
for (let offset = 0; offset < 32768; offset += 128) {
  if (offset === 8192) required('manifold_set_node_parameter', 2, 0, 0);
  if (offset === 16384) required('manifold_set_node_parameter', 2, 0, 8);
  const memory = new Float32Array(wasm.memory.buffer);
  for (let frame = 0; frame < 128; frame++) {
    for (let channel = 0; channel < 2; channel++) {
      memory[inputPtr + channel * 128 + frame] = input.readFloatLE(((offset + frame) * 2 + channel) * 4);
    }
  }
  required('manifold_process', 128);
  const part = parts.find(({begin, end}) => offset >= begin && offset < end);
  for (let frame = 0; frame < 128; frame++) {
    for (let channel = 0; channel < 2; channel++) {
      const index = (offset + frame) * 2 + channel;
      const old = reference.readFloatLE(index * 4);
      const current = memory[outputPtr + channel * 128 + frame];
      const delta = Math.abs(old - current);
      part.max = Math.max(part.max, delta);
      part.sumSquares += delta * delta;
      if (channel === 0 && [8192, 16384, 17180].includes(offset + frame)) {
        samples[offset + frame] = {cpp: old, wasm: current};
      }
    }
  }
}
const segments = Object.fromEntries(parts.map(({begin, end, max, sumSquares}, index) => [
  ['beforeChorus', 'chorus', 'returnedDelay'][index],
  {max, rms: Math.sqrt(sumSquares / ((end - begin) * 2))},
]));
const report = {reference: 'Old C++ scalar FX branch GraphRuntime swaps versus Rust/Wasm host-switch graph kind 53',
  frames: 32768, sampleRate: 48000, blockSize: 128, segments, boundaryLeft: samples};
fs.writeFileSync(path.join(root, 'artifacts/reviews/checkpoint-82-wasm-metrics.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (Math.max(...Object.values(segments).map(({max}) => max)) > 2e-6) process.exitCode = 1;
