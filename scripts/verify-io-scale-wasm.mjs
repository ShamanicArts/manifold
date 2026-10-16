// Exercise library Wasm buffers directly, without browser device channel limits
// or an audio destination. Build normal and prepared Wasm artifacts first.
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createGraphWorkspace} from '../packages/manifold-author/index.js';
import {PORT_CATALOG} from '../packages/manifold-author/catalog.generated.js';

const report = {recordedAt: new Date().toISOString(), runs: [], scope: 'Direct Wasm library execution; no WebAudio device or DAW acceptance claim'};
const stride = 96, frames = 67;
const build = buses => {
  const graph = createGraphWorkspace();
  const channels = Array.from({length: buses}, (_, i) => ({id: `bus-${i}`, name: `Audio bus ${i}`, channels: i ? 9 : 300, optional: false}));
  const total = channels.reduce((sum, bus) => sum + bus.channels, 0);
  graph.setIoLayout({version: 1, inputs: channels, outputs: channels,
    inputBindings: [{nodeId: 1, channels: [{bus: buses - 1, channel: 8}, {bus: 0, channel: 299}]}],
    outputBindings: Array.from({length: total}, (_, i) => i % 11 === 0 ? null : {nodeId: 1, outputPort: 0, channel: i % 2}),
  });
  return graph.toProject().signal;
};
const upload = (wasm, graph) => {
  assert.equal(wasm.manifold_graph_begin(graph.nodes.length, graph.connections.length), 1);
  for (const node of graph.nodes) assert.equal(wasm.manifold_graph_node(node.id, PORT_CATALOG[node.type].code, node.a, node.b), 1);
  for (const edge of graph.connections) assert.equal(wasm.manifold_graph_edge_ports(edge.from, edge.outputPort, edge.to, edge.inputPort), 1);
  const bytes = new TextEncoder().encode(JSON.stringify(graph.io));
  assert.equal(wasm.manifold_graph_io_begin(bytes.length), 1);
  new Uint8Array(wasm.memory.buffer, wasm.manifold_graph_io_ptr(), bytes.length).set(bytes);
  assert.equal(wasm.manifold_graph_io_commit(), 1);
};
for (const mode of ['normal', 'prepared']) {
  const path = new URL(`../packages/manifold-author/runtime/manifold_${mode === 'normal' ? 'filter' : 'prepared'}.wasm`, import.meta.url);
  const bytes = await readFile(path);
  const importedMemory = mode === 'prepared' ? new WebAssembly.Memory({initial: 256, maximum: 8192, shared: true}) : undefined;
  let processing = false, allocations = 0, frees = 0;
  const {instance: {exports: wasm}} = await WebAssembly.instantiate(bytes, {env: {
    memory: importedMemory,
    manifold_allocation_probe(kind) { if (processing) { if (kind === 1) allocations++; else frees++; } },
  }});
  if (mode === 'prepared') {
    assert.equal(wasm.memory, importedMemory);
    const tls = wasm.manifold_prepared_allocate(wasm.__tls_size.value, wasm.__tls_align.value);
    wasm.__wasm_init_tls(tls);
    const stack = wasm.manifold_prepared_allocate(1048576, 16);
    wasm.__stack_pointer.value = stack + 1048576;
    processing = true; wasm.manifold_prepared_probe_allocation(); processing = false;
    assert.ok(allocations > 0 && frees > 0, 'Allocator negative control must register');
    allocations = frees = 0;
  }
  const run = {mode, sha256: createHash('sha256').update(bytes).digest('hex'), layouts: []};
  for (const buses of [41, 42, 33]) {
    const graph = build(buses), total = graph.inputs;
    upload(wasm, graph);
    assert.equal(wasm.manifold_prepare(48000, stride), 1);
    const handle = mode === 'prepared' ? wasm.manifold_prepared_take() : 0;
    const inputPtr = handle ? wasm.manifold_prepared_input_ptr(handle) : wasm.manifold_input_ptr();
    const outputPtr = handle ? wasm.manifold_prepared_output_ptr(handle) : wasm.manifold_output_ptr();
    const input = new Float32Array(wasm.memory.buffer, inputPtr, total * stride);
    const output = new Float32Array(wasm.memory.buffer, outputPtr, total * stride);
    for (let block = 0; block < 4; block++) {
      for (let channel = 0; channel < total; channel++) {
        for (let frame = 0; frame < frames; frame++) input[channel * stride + frame] = (channel + block) * .001 + frame * .0001;
      }
      output.fill(99);
      processing = true;
      const status = handle ? wasm.manifold_prepared_process(handle, frames) : wasm.manifold_process(frames);
      processing = false;
      assert.equal(status, 1);
      for (let channel = 0; channel < total; channel++) {
        for (let frame = 0; frame < stride; frame++) {
          const expected = frame >= frames ? 99 : channel % 11 === 0 ? 0 : input[(channel % 2 ? 299 : total - 1) * stride + frame];
          assert.equal(output[channel * stride + frame], expected, `${mode} bus count ${buses}, channel ${channel}, frame ${frame}`);
        }
      }
    }
    run.layouts.push({buses, channels: total, blocks: 4, frames, stride, exactSamples: true, untouchedPadding: true});
    if (handle) wasm.manifold_prepared_release(handle);
  }
  // A valid channel count whose sample storage cannot fit in Wasm32 returns
  // preparation failure; it must never wrap into an undersized allocation.
  const huge = structuredClone(build(41));
  huge.io.inputs = [{id: 'wide', name: 'Wide', channels: 0xffffffff, optional: false}];
  huge.io.inputBindings[0].channels = [{bus: 0, channel: 0}, null];
  upload(wasm, huge);
  assert.equal(wasm.manifold_prepare(48000, stride), 0);
  if (mode === 'normal') assert.equal(wasm.manifold_process(frames), 1, 'A failed prepare preserves the accepted engine');
  run.addressOverflowRejected = true;
  if (mode === 'prepared') {
    assert.equal(allocations, 0); assert.equal(frees, 0);
    run.callbackAllocations = allocations; run.callbackFrees = frees;
  }
  report.runs.push(run);
}
const output = new URL('../web/public/studio/2026-10-13-io-scale/', import.meta.url);
await mkdir(output, {recursive: true});
await writeFile(new URL('wasm-report.json', output), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
