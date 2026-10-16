import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NODE_TYPES, parseGraphBundle, setConnection } from '../src/graph/topology.js';
import { PORT_CATALOG } from '@manifold/author/catalog';

const fixture = JSON.parse(readFileSync(new URL('../../projects/graph-workspace/tone-texture.json', import.meta.url)));
const invertedFixture = JSON.parse(readFileSync(new URL('../../projects/graph-workspace/tone-texture-inverted.json', import.meta.url)));

test('authored LFO port identity survives browser project capture and validation', () => {
  const signal = setConnection(fixture.signal, 8, 1, 9, 1);
  assert.deepEqual(signal.connections.find(edge => edge.to === 8 && edge.inputPort === 1),
    { from: 9, outputPort: 1, to: 8, inputPort: 1 });
  assert.deepEqual(NODE_TYPES.lfo.outputNames, ['out', 'inv', 'uni']);
  assert.deepEqual(parseGraphBundle({ ...fixture, signal }).signal.connections, signal.connections);
  const byTarget = (a, b) => a.to - b.to || a.inputPort - b.inputPort;
  assert.deepEqual(parseGraphBundle(invertedFixture).signal.connections.toSorted(byTarget),
    signal.connections.toSorted(byTarget));
  assert.throws(() => setConnection(signal, 8, 1, 9, 3), /Graph port types/);
});

test('all browser node types use generated Rust port descriptors and Wasm codes', async () => {
  assert.deepEqual(Object.keys(NODE_TYPES).sort(), Object.keys(PORT_CATALOG).sort());
  const { instance } = await WebAssembly.instantiate(wasm, {});
  const engine = instance.exports;
  for (const [id, spec] of Object.entries(NODE_TYPES)) {
    assert.equal(engine.manifold_graph_begin(1, 0), 1);
    assert.equal(engine.manifold_graph_node(10, spec.code, spec.args?.a ?? 0, spec.args?.b ?? 0), 1, id);
    assert.deepEqual(spec.inputs, PORT_CATALOG[id].inputs.map(port => port.signal), id);
    assert.deepEqual(spec.outputs, PORT_CATALOG[id].outputs.map(port => port.signal), id);
  }
});

const wasm = readFileSync(new URL('../public/manifold_filter.wasm', import.meta.url));

async function render(outputPort) {
  const { instance } = await WebAssembly.instantiate(wasm, {});
  const engine = instance.exports;
  assert.equal(engine.manifold_version(), 5);
  assert.equal(engine.manifold_graph_begin(4, 3), 1);
  assert.equal(engine.manifold_graph_node(1, 0, 0, 0), 1);
  assert.equal(engine.manifold_graph_node(2, 14, 20, 0), 1);
  assert.equal(engine.manifold_graph_node(3, 15, 0.5, 0.5), 1);
  assert.equal(engine.manifold_graph_node(4, 7, 0, 0), 1);
  assert.equal(engine.manifold_graph_edge_ports(1, 0, 3, 0), 1);
  assert.equal(engine.manifold_graph_edge_ports(2, outputPort, 3, 1), 1);
  assert.equal(engine.manifold_graph_edge_ports(3, 0, 4, 0), 1);
  assert.equal(engine.manifold_prepare(48000, 128), 1);
  const input = new Float32Array(engine.memory.buffer, engine.manifold_input_ptr(), 256);
  input.fill(1);
  assert.equal(engine.manifold_process(128), 1);
  return [...new Float32Array(engine.memory.buffer, engine.manifold_output_ptr(), 128)];
}

test('Wasm graph processes all three source outputs as distinct CV', async () => {
  const [normal, inverted, unipolar] = await Promise.all([render(0), render(1), render(2)]);
  assert.equal(normal[0], 0.5);
  assert.equal(inverted[0], 0.5);
  assert.equal(unipolar[0], 0.75);
  assert.ok(normal[127] > normal[0]);
  assert.ok(inverted[127] < inverted[0]);
  assert.ok(unipolar[127] > unipolar[0]);
  assert.ok(Math.abs(normal[127] + inverted[127] - 1) < 1e-6);
  assert.ok(normal[127] !== inverted[127]);
});
