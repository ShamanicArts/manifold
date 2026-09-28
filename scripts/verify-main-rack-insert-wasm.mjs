// Exercise the same startup ABI used by Main's browser AudioWorklet, with
// an authored post-voice rack insert inside the real Wasm Main instrument.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NODE_TYPES } from '../web/src/graph/topology.js';

const wasm = readFileSync(new URL('../web/public/manifold_filter.wasm', import.meta.url));
const defaultProject = JSON.parse(readFileSync(new URL('../projects/main-looper/default-rack-insert.json', import.meta.url)));
const cvProject = JSON.parse(readFileSync(new URL('../projects/main-looper/lfo-filter-rack-insert.json', import.meta.url)));

function buildInsert(e, graph) {
  assert.equal(e.manifold_graph_begin(graph.nodes.length, graph.connections.length), 1);
  for (const node of graph.nodes) {
    assert.equal(e.manifold_graph_node(node.id, NODE_TYPES[node.type].code, node.a ?? 0, node.b ?? 0), 1);
  }
  for (const edge of graph.connections) {
    assert.equal(e.manifold_graph_edge(edge.from, edge.to, edge.inputPort), 1);
  }
  const filters = new Set(graph.nodes.filter(node => ['svf', 'modulated-svf'].includes(node.type)).map(node => node.id));
  for (const parameter of graph.initialParameters) {
    const result = e.manifold_graph_initial_parameter(parameter.nodeId, parameter.id, parameter.value);
    assert.ok(result === 1 || (filters.has(parameter.nodeId) && parameter.id <= 2));
  }
}

async function render(project) {
  const { instance } = await WebAssembly.instantiate(wasm);
  const e = instance.exports;
  const graph = project.signal;
  assert.equal(e.manifold_looper_prepare(48_000, 128), 1);
  const bytesBeforeInsert = e.memory.buffer.byteLength;
  buildInsert(e, graph);
  assert.equal(e.manifold_looper_prepare_rack_insert(), 1);
  const bytesAfterInsert = e.memory.buffer.byteLength;
  assert.equal(e.manifold_looper_synth_parameter(22, 800), 1);
  assert.equal(e.manifold_looper_synth_note(0, 96, 120), 1);
  const outputPtr = e.manifold_looper_output_ptr();
  let energy = 0;
  for (let block = 0; block < 120; block++) {
    assert.equal(e.manifold_looper_process(128), 1);
    if (block >= 40) {
      const output = new Float32Array(e.memory.buffer, outputPtr, 128);
      for (const sample of output) energy += Math.abs(sample);
    }
  }
  buildInsert(e, graph);
  // Preparation is deliberately startup-only; never compile and replace from
  // the running AudioWorklet message handler.
  assert.equal(e.manifold_looper_prepare_rack_insert(), 0);
  return { energy, capture: e.manifold_looper_peak(0, 1, 8_000, 12_000),
    wasmMiBBeforeInsert: bytesBeforeInsert / 1048576,
    wasmMiBAfterInsert: bytesAfterInsert / 1048576 };
}

const normal = await render(defaultProject);
const cv = await render(cvProject);
assert.ok(Math.abs(normal.energy - 29.995070) < 0.03, `Wasm Main default ${normal.energy}`);
assert.ok(Math.abs(cv.energy - 265.247223) < 0.27, `Wasm Main CV ${cv.energy}`);
assert.ok(cv.capture > normal.capture * 2);
console.log(JSON.stringify({ normal, cv, agreement: 'within 0.1% of native Main integration', livePrepareRejected: true }));
