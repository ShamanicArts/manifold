import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PORT_CATALOG } from '@manifold/author/catalog';
import { buildGraph, createProject, OSC_BASE } from '@manifold/author/examples/rack-oscillator';
import { buildRackModuleHostGraph } from '@manifold/author/examples/rack-module-host';

const BLOCK = 128;

async function startAuthoredOscillator(graph = buildGraph()) {
  const wasm = readFileSync(new URL('../public/manifold_filter.wasm', import.meta.url));
  const { instance } = await WebAssembly.instantiate(wasm, {});
  const engine = instance.exports;
  const signal = graph.toProject().signal;
  assert.equal(engine.manifold_graph_begin(signal.nodes.length, signal.connections.length), 1);
  assert.equal(engine.manifold_graph_patchable(1), 1);
  for (const node of signal.nodes) {
    assert.equal(engine.manifold_graph_node(node.id, PORT_CATALOG[node.type].code,
      node.a ?? 0, node.b ?? 0), 1);
  }
  for (const edge of signal.connections) {
    assert.equal(engine.manifold_graph_edge_ports(edge.from, edge.outputPort ?? 0,
      edge.to, edge.inputPort), 1);
  }
  const deferred = signal.initialParameters.filter(parameter =>
    engine.manifold_graph_initial_parameter(parameter.nodeId, parameter.id, parameter.value) !== 1);
  assert.equal(engine.manifold_prepare(48_000, BLOCK), 1);
  for (const parameter of deferred) {
    assert.equal(engine.manifold_set_node_parameter(parameter.nodeId, parameter.id, parameter.value),
      1, `deferred node ${parameter.nodeId} parameter ${parameter.id}`);
  }
  const apply = edit => engine.manifold_set_node_parameter(edit.nodeId, edit.id, edit.value) === 1;
  const project = createProject({
    setRoute: () => true,
    setParameter: apply,
    setParameterBatch: edits => edits.every(apply),
  }, graph);
  const process = (blocks = 1) => {
    const output = new Float32Array(blocks * BLOCK);
    for (let block = 0; block < blocks; block++) {
      assert.equal(engine.manifold_process(BLOCK), 1);
      output.set(new Float32Array(engine.memory.buffer,
        engine.manifold_output_ptr(), BLOCK), block * BLOCK);
    }
    return output;
  };
  return { project, process };
}

function risingCrossings(samples) {
  let count = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i - 1] <= 0 && samples[i] > 0) count++;
  }
  return count;
}

test('authored voice gate retriggers phase and pitch/FM alter Wasm audio across blocks', async () => {
  const { project, process } = await startAuthoredOscillator();
  const voice = `${OSC_BASE}/voice/1`;
  await project.set(`${OSC_BASE}/waveform`, 0);
  await project.set(`${voice}/vOct`, 69);
  assert.ok(process(4).every(sample => sample === 0));
  await project.set(`${voice}/gate`, 0.4);
  const firstAttack = process();
  assert.ok(firstAttack.some(sample => Math.abs(sample) > 0.001));
  process(32);
  const a440 = process(16);
  assert.ok(risingCrossings(a440) >= 17 && risingCrossings(a440) <= 20);

  await project.set(`${voice}/fm`, 1);
  process(32);
  const a880 = process(16);
  assert.ok(risingCrossings(a880) >= 36 && risingCrossings(a880) <= 39);
  assert.equal(project.toProject().signal.initialParameters.find(
    entry => entry.nodeId === 4 && entry.id === 1).value, 880);

  await project.set(`${voice}/fm`, 0);
  await project.set(`${voice}/gate`, 0);
  process(64);
  await project.set(`${voice}/gate`, 0.4);
  const secondAttack = process();
  const worstDifference = Math.max(...secondAttack.map((sample, index) =>
    Math.abs(sample - firstAttack[index])));
  assert.ok(worstDifference < 0.00005, `phase retrigger differed by ${worstDifference}`);
});

test('authored pulse CV changes the audible duty cycle and saved primitive width', async () => {
  const { project, process } = await startAuthoredOscillator(
    buildRackModuleHostGraph({ selection: 1 }));
  const voice = `${OSC_BASE}/voice/1`;
  await project.set(`${OSC_BASE}/waveform`, 6);
  await project.set(`${voice}/vOct`, 69);
  await project.set(`${voice}/gate`, 0.4);
  process(32);
  const half = process(16);
  await project.set(`${voice}/pwCv`, 0.75);
  const wide = process(16);
  const duty = samples => samples.filter(sample => sample > 0).length / samples.length;
  assert.ok(duty(half) > 0.45 && duty(half) < 0.55);
  assert.ok(duty(wide) > 0.70 && duty(wide) < 0.80);
  const nodeId = project.toProject().instances.find(
    entry => entry.path === `${OSC_BASE}/nodes/voice_1`).nodeId;
  assert.equal(project.toProject().signal.initialParameters.find(
    entry => entry.nodeId === nodeId && entry.id === 4).value, 0.75);
});
