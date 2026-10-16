// Offline native/Wasm proof. Does not open or route an audio device.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { lowerDevice } from '../packages/manifold/graph.js';
import { PORT_CATALOG } from '../packages/manifold-author/catalog.generated.js';
const output = resolve(process.argv[2] ?? 'artifacts/device-prototype');
await mkdir(output, { recursive: true });
const wasm = await readFile(new URL('../web/public/manifold_filter.wasm', import.meta.url));
const report = [];
const cases = [
  ...['gain', 'tone', 'spectral', 'reusable'].map((name) => [name, `../packages/manifold/examples/${name}.js`]),
  ...['gain', 'ring', 'spectral', 'reusable'].map((name) => [
    `handbook-${name}`,
    `../web/handbook/examples/${name}.mjs`,
  ]),
];
for (const [name, module] of cases) {
  const { default: device } = await import(module);
  const { project } = lowerDevice(device),
    graph = project.signal;
  const recipe = { project, inputValues: graph.inputs ? [0.25, -0.125] : [], blocks: 48 };
  const recipePath = resolve(output, `${name}.json`),
    pcmPath = resolve(output, `${name}.f32`);
  await writeFile(recipePath, JSON.stringify(recipe));
  const native = spawnSync(
    resolve('target/debug/examples/render_io_graph'),
    [recipePath, pcmPath],
    { encoding: 'utf8' },
  );
  assert.equal(native.status, 0, native.stderr);
  const bytes = await readFile(pcmPath);
  const expected = new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const { instance } = await WebAssembly.instantiate(wasm, {}),
    engine = instance.exports;
  const accepted = (value, message) => assert.equal(value, 1, `${name}: ${message}`);
  accepted(engine.manifold_graph_begin(graph.nodes.length, graph.connections.length), 'begin');
  for (const node of graph.nodes)
    accepted(
      engine.manifold_graph_node(node.id, PORT_CATALOG[node.type].code, node.a ?? 0, node.b ?? 0),
      'node',
    );
  for (const edge of graph.connections)
    accepted(
      engine.manifold_graph_edge_ports(edge.from, edge.outputPort, edge.to, edge.inputPort),
      'edge',
    );
  const io = new TextEncoder().encode(JSON.stringify(graph.io));
  accepted(engine.manifold_graph_io_begin(io.length), 'I/O begin');
  new Uint8Array(engine.memory.buffer, engine.manifold_graph_io_ptr(), io.length).set(io);
  accepted(engine.manifold_graph_io_commit(), 'I/O commit');
  const later = [];
  for (const parameter of graph.initialParameters)
    if (
      engine.manifold_graph_initial_parameter(parameter.nodeId, parameter.id, parameter.value) !== 1
    )
      later.push(parameter);
  accepted(engine.manifold_prepare(48000, 128), 'prepare');
  for (const parameter of later)
    accepted(
      engine.manifold_set_node_parameter(parameter.nodeId, parameter.id, parameter.value),
      'initial parameter',
    );
  accepted(engine.manifold_graph_reset_processing(), 'reset');
  let maxDifference = 0,
    energy = 0;
  for (let block = 0; block < recipe.blocks; block++) {
    const input = new Float32Array(engine.memory.buffer, engine.manifold_input_ptr(), 256);
    input.fill(recipe.inputValues[0] ?? 0, 0, 128);
    input.fill(recipe.inputValues[1] ?? 0, 128);
    accepted(engine.manifold_process(128), 'process');
    const samples = new Float32Array(engine.memory.buffer, engine.manifold_output_ptr(), 256);
    for (let frame = 0; frame < 128; frame++)
      for (let channel = 0; channel < 2; channel++) {
        const value = samples[channel * 128 + frame];
        assert.ok(Number.isFinite(value));
        maxDifference = Math.max(
          maxDifference,
          Math.abs(value - expected[(block * 128 + frame) * 2 + channel]),
        );
        energy += value * value;
      }
  }
  assert.ok(energy > 0, `${name} was silent`);
  assert.ok(maxDifference < 0.00001, `${name}: native/Wasm difference ${maxDifference}`);
  report.push({
    name,
    frames: recipe.blocks * 128,
    maxDifference,
    rms: Math.sqrt(energy / expected.length),
    native: JSON.parse(native.stdout),
  });
}
await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    report.map(({ native, ...result }) => ({
      ...result,
      callbackHeapGuarded: native.callbackHeapGuarded,
    })),
    null,
    2,
  ),
);
