import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GraphWorkspace } from '@manifold/author';
import { PORT_CATALOG } from '@manifold/author/catalog';
import { buildGraph, createProject } from '@manifold/author/examples/phase-vocoder-chain';

test('public phase vocoder stage authors, reopens, and changes running Wasm audio', async () => {
  const fixture = JSON.parse(readFileSync(new URL(
    '../../projects/graph-workspace/authored-phase-vocoder-chain.json', import.meta.url)));
  assert.deepEqual(buildGraph().toProject(), fixture);
  assert.deepEqual(GraphWorkspace.fromProject(fixture).toProject(), fixture);
  const graph = GraphWorkspace.fromProject(fixture);
  const vocoder = graph.findInstance('/sample/voice/vocoder');
  assert.throws(() => graph.setParameter(vocoder, 4, 10.5), { code: 'invalid-parameter' });
  const otherOrder = GraphWorkspace.fromProject(fixture);
  otherOrder.setParameter(otherOrder.findInstance('/sample/voice/vocoder'), 4, 12);
  assert.deepEqual(GraphWorkspace.fromProject(otherOrder.toProject()).toProject(),
    otherOrder.toProject());
  assert.throws(() => otherOrder.setParameter(otherOrder.find(5), 4, 8),
    { code: 'invalid-parameter' });
  graph.setParameter(vocoder, 3, 0);

  const wasm = readFileSync(new URL('../public/manifold_filter.wasm', import.meta.url));
  const { instance } = await WebAssembly.instantiate(wasm, {});
  const engine = instance.exports;
  const signal = graph.toProject().signal;
  assert.equal(engine.manifold_graph_begin(signal.nodes.length, signal.connections.length), 1);
  for (const node of signal.nodes) {
    assert.equal(engine.manifold_graph_node(node.id, PORT_CATALOG[node.type].code,
      node.a ?? 0, node.b ?? 0), 1);
  }
  for (const edge of signal.connections) {
    assert.equal(engine.manifold_graph_edge_ports(edge.from, edge.outputPort ?? 0,
      edge.to, edge.inputPort), 1);
  }
  for (const entry of signal.initialParameters) {
    assert.equal(engine.manifold_graph_initial_parameter(entry.nodeId, entry.id, entry.value), 1);
  }
  assert.equal(engine.manifold_prepare(48_000, 128), 1);
  const project = createProject({
    setRoute: () => true,
    setParameter: edit => engine.manifold_set_node_parameter(edit.nodeId, edit.id, edit.value) === 1,
  }, graph);
  const process = () => {
    const output = new Float32Array(128 * 16);
    for (let block = 0; block < 64; block++) {
      assert.equal(engine.manifold_process(128), 1);
      if (block >= 48) output.set(new Float32Array(engine.memory.buffer,
        engine.manifold_output_ptr(), 128), (block - 48) * 128);
    }
    return output;
  };
  const dry = process();
  assert.ok(dry.some(sample => Math.abs(sample) > 0.01));
  await project.set('/sample/voice/mix', 1);
  const wet = process();
  assert.ok(wet.every(Number.isFinite));
  assert.ok(wet.some(sample => Math.abs(sample) > 0.01));
  assert.ok(wet.some((sample, index) => Math.abs(sample - dry[index]) > 0.02));
  assert.equal(project.toProject().signal.initialParameters.find(entry =>
    entry.nodeId === 5 && entry.id === 3).value, 1);
});
