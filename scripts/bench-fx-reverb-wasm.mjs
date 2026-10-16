// Measure a prepared host FX Reverb block and a return-to-Reverb switch.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const module = await WebAssembly.compile(fs.readFileSync(path.join(root, 'web/public/manifold_filter.wasm')));
const callbacks = 512;
const warmup = 128;
const block = 128;

function summary(values) {
  const sorted = values.toSorted((a, b) => a - b);
  return {
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    median: sorted[sorted.length >> 1],
    p95: sorted[Math.floor(sorted.length * .95)],
    max: sorted.at(-1),
  };
}

for (let repeat = 0; repeat < 3; repeat++) {
  const { exports: wasm } = await WebAssembly.instantiate(module, {});
  const required = (name, ...args) => {
    if (wasm[name](...args) !== 1) throw new Error(`${name} failed`);
  };
  required('manifold_graph_begin', 3, 2);
  required('manifold_graph_node', 1, 0, 0, 0);
  required('manifold_graph_node', 2, 53, 7, 1);
  required('manifold_graph_node', 3, 7, 0, 0);
  required('manifold_graph_edge', 1, 2, 0);
  required('manifold_graph_edge', 2, 3, 0);
  required('manifold_graph_initial_parameter', 2, 2, .5);
  required('manifold_graph_initial_parameter', 2, 3, .4);
  required('manifold_prepare', 48000, block);
  const memory = new Float32Array(wasm.memory.buffer);
  const input = wasm.manifold_input_ptr() / 4;
  for (let frame = 0; frame < block; frame++) {
    memory[input + frame] = .2 * Math.sin(frame * 220 * Math.PI * 2 / 48000);
    memory[input + block + frame] = .17 * Math.sin(frame * 330 * Math.PI * 2 / 48000);
  }
  for (let index = 0; index < warmup; index++) required('manifold_process', block);
  const blockTimes = [];
  for (let index = 0; index < callbacks; index++) {
    const start = process.hrtime.bigint();
    required('manifold_process', block);
    blockTimes.push(Number(process.hrtime.bigint() - start) / 1000);
  }
  const switchTimes = [];
  for (let index = 0; index < callbacks; index++) {
    required('manifold_set_node_parameter', 2, 0, 8);
    const start = process.hrtime.bigint();
    required('manifold_set_node_parameter', 2, 0, 7);
    switchTimes.push(Number(process.hrtime.bigint() - start) / 1000);
  }
  console.log(JSON.stringify({ repeat, blockMicros: summary(blockTimes), switchMicros: summary(switchTimes) }));
}
