// Callback timing for the same slot scenarios as examples/bench_fx_slot.rs.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const module = await WebAssembly.compile(fs.readFileSync(path.join(root, 'web/public/manifold_filter.wasm')));
const callbacks = 512;
const warmup = 128;
const block = 128;

async function run(kind, visited) {
  const { exports: wasm } = await WebAssembly.instantiate(module, {});
  const required = (name, ...args) => {
    if (wasm[name](...args) !== 1) throw new Error(`${name} failed`);
  };
  required('manifold_graph_begin', 3, 2);
  required('manifold_graph_node', 1, 0, 0, 0);
  required('manifold_graph_node', 2, kind, 8, 1);
  required('manifold_graph_node', 3, 7, 0, 0);
  required('manifold_graph_edge', 1, 2, 0);
  required('manifold_graph_edge', 2, 3, 0);
  required('manifold_graph_initial_parameter', 2, 2, 0);
  required('manifold_graph_initial_parameter', 2, 3, 0.6);
  required('manifold_prepare', 48000, block);
  if (visited === 2) required('manifold_set_node_parameter', 2, 0, 0);
  if (visited === 21) {
    for (let effect = 0; effect < 21; effect++) required('manifold_set_node_parameter', 2, 0, effect);
  }
  required('manifold_set_node_parameter', 2, 0, 8);
  const memory = new Float32Array(wasm.memory.buffer);
  const input = wasm.manifold_input_ptr() / 4;
  const output = wasm.manifold_output_ptr() / 4;
  for (let frame = 0; frame < block; frame++) {
    memory[input + frame] = Math.sin(frame * Math.PI * 2 * 220 / 48000) * 0.2;
    memory[input + block + frame] = Math.sin(frame * Math.PI * 2 * 330 / 48000) * 0.17;
  }
  for (let index = 0; index < warmup; index++) required('manifold_process', block);
  const samples = [];
  let checksum = 0;
  for (let index = 0; index < callbacks; index++) {
    const start = process.hrtime.bigint();
    required('manifold_process', block);
    samples.push(Number(process.hrtime.bigint() - start) / 1000);
    checksum += memory[output];
  }
  samples.sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / callbacks;
  console.log(`${kind === 19 ? 'selected-only' : 'persistent'},${visited},${mean.toFixed(3)},${samples[callbacks / 2].toFixed(3)},${samples[Math.floor(callbacks * 95 / 100)].toFixed(3)},${samples.at(-1).toFixed(3)}`);
  if (!Number.isFinite(checksum)) throw new Error('Non-finite output');
}

console.log('mode,visited,mean_us,median_us,p95_us,max_us');
for (let repeat = 0; repeat < 3; repeat++) {
  for (const [kind, visited] of [[19, 1], [52, 1], [52, 2], [52, 21]]) {
    await run(kind, visited);
  }
}
