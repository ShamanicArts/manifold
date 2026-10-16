// Run the actual normal/prepared Wasm libraries without an audio destination.
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createGraphWorkspace} from '../packages/manifold-author/index.js';
import {PORT_CATALOG} from '../packages/manifold-author/catalog.generated.js';

const frames = 1_500_128, rate = 48000;
const pcm = new Float32Array(frames * 2);
for (let frame = frames - 256; frame < frames; frame++) {
  pcm[frame * 2] = .75; pcm[frame * 2 + 1] = -.5;
}
const graph = createGraphWorkspace();
const region = graph.add('sample-region', {id: 4});
graph.connect(region.output('out'), graph.output.input('in'));
const signal = graph.toProject().signal;
const report = {recordedAt: new Date().toISOString(), frames, rate,
  scope: 'Actual Wasm library execution, including prepared allocation probes; no audio device', runs: []};
for (const mode of ['normal', 'prepared']) {
  const bytes = await readFile(new URL(`../packages/manifold-author/runtime/manifold_${mode === 'normal' ? 'filter' : 'prepared'}.wasm`, import.meta.url));
  const memory = mode === 'prepared' ? new WebAssembly.Memory({initial: 256, maximum: 8192, shared: true}) : undefined;
  let processing = false, allocations = 0, frees = 0;
  const {instance: {exports: wasm}} = await WebAssembly.instantiate(bytes, {env: {memory,
    manifold_allocation_probe(kind) {if (processing) {if (kind === 1) allocations++; else frees++;}},
  }});
  if (memory) {
    const tls = wasm.manifold_prepared_allocate(wasm.__tls_size.value, wasm.__tls_align.value);
    wasm.__wasm_init_tls(tls);
    wasm.__stack_pointer.value = wasm.manifold_prepared_allocate(1048576, 16) + 1048576;
    processing = true; wasm.manifold_prepared_probe_allocation(); processing = false;
    assert.ok(allocations && frees); allocations = frees = 0;
  }
  assert.equal(wasm.manifold_graph_begin(signal.nodes.length, signal.connections.length), 1);
  for (const node of signal.nodes) assert.equal(wasm.manifold_graph_node(node.id, PORT_CATALOG[node.type].code, node.a, node.b), 1);
  for (const edge of signal.connections) assert.equal(wasm.manifold_graph_edge_ports(edge.from, edge.outputPort, edge.to, edge.inputPort), 1);
  assert.equal(wasm.manifold_prepare(rate, 128), 1);
  assert.equal(wasm.manifold_sample_begin(4, frames, rate), 1);
  new Float32Array(wasm.memory.buffer, wasm.manifold_sample_ptr(), pcm.length).set(pcm);
  assert.equal(wasm.manifold_sample_commit(), 1);
  assert.equal(wasm.manifold_sample_begin(4, 0xffffffff, rate), 0, 'Address overflow returns failure');
  assert.equal(wasm.manifold_analysis_begin(frames, rate), 1);
  new Float32Array(wasm.memory.buffer, wasm.manifold_analysis_ptr(), pcm.length).set(pcm);
  assert.equal(wasm.manifold_analysis_run(), 1);
  assert.equal(wasm.manifold_analysis_metric(0), .75);
  assert.equal(wasm.manifold_analysis_begin(0xffffffff, rate), 0);
  const handle = mode === 'prepared' ? wasm.manifold_prepared_take() : 0;
  const parameter = (id, value) => handle ? wasm.manifold_prepared_parameter(handle, 4, id, value) : wasm.manifold_set_node_parameter(4, id, value);
  assert.equal(parameter(2, 1), 1); // One-shot playback avoids a loop seam crossfade.
  assert.equal(parameter(3, .99999), 1);
  assert.equal(parameter(7, 1), 1);
  processing = true;
  assert.equal(handle ? wasm.manifold_prepared_process(handle, 8) : wasm.manifold_process(8), 1);
  processing = false;
  const ptr = handle ? wasm.manifold_prepared_output_ptr(handle) : wasm.manifold_output_ptr();
  const output = new Float32Array(wasm.memory.buffer, ptr, 256);
  // The graph ABI uses planar output with the prepared 128-frame stride.
  for (let channel = 0; channel < 2; channel++) for (let frame = 0; frame < 8; frame++) {
    const sample = output[channel * 128 + frame];
    assert.ok(Math.abs(sample - (channel ? -.5 : .75) * Math.SQRT1_2) < 1e-6, `${mode} channel ${channel} frame ${frame}: ${sample}`);
  }
  assert.equal(allocations, 0); assert.equal(frees, 0);
  report.runs.push({mode, sha256: createHash('sha256').update(bytes).digest('hex'), tailPlayback: true,
    analysis: true, addressOverflowRejected: true, previousSampleRetained: true,
    ...(memory ? {callbackAllocations: allocations, callbackFrees: frees} : {})});
  if (handle) wasm.manifold_prepared_release(handle);
  const captureGraph = createGraphWorkspace();
  const capture = captureGraph.add('retrospective-capture', {id: 4, config: {capacitySeconds: 240}});
  captureGraph.connect(captureGraph.input.output('out'), capture.input('audio'));
  captureGraph.connect(captureGraph.input.output('out'), captureGraph.output.input('in'));
  const captureSignal = captureGraph.toProject().signal;
  assert.equal(wasm.manifold_graph_begin(captureSignal.nodes.length, captureSignal.connections.length), 1);
  for (const node of captureSignal.nodes) assert.equal(wasm.manifold_graph_node(node.id, PORT_CATALOG[node.type].code, node.a, node.b), 1);
  for (const edge of captureSignal.connections) assert.equal(wasm.manifold_graph_edge_ports(edge.from, edge.outputPort, edge.to, edge.inputPort), 1);
  const captureRate = 8000, capacity = captureRate * 240;
  assert.equal(wasm.manifold_prepare(captureRate, 128), 1);
  assert.equal(wasm.manifold_capture_capacity(4), capacity);
  assert.equal(wasm.manifold_capture_stage_reserve(4, capacity), 1);
  const captureHandle = mode === 'prepared' ? wasm.manifold_prepared_take() : 0;
  const inputPtr = captureHandle ? wasm.manifold_prepared_input_ptr(captureHandle) : wasm.manifold_input_ptr();
  new Float32Array(wasm.memory.buffer, inputPtr, 128 * 2).fill(.25);
  const process = () => captureHandle ? wasm.manifold_prepared_process(captureHandle, 128) : wasm.manifold_process(128);
  processing = true; assert.equal(process(), 1); processing = false;
  assert.equal(captureHandle ? wasm.manifold_prepared_capture_begin(captureHandle, 4, frames) : wasm.manifold_capture_stage_begin(4, frames), 1);
  let completed = false;
  for (let step = 0; step < 2000; step++) {
    processing = true;
    const state = captureHandle ? wasm.manifold_prepared_capture_step(captureHandle, 4) : process();
    processing = false;
    if (captureHandle ? state === 1 : wasm.manifold_capture_stage_status(4) === 2) { completed = true; break; }
  }
  assert.ok(completed, 'Long capture must complete');
  assert.equal(captureHandle ? wasm.manifold_prepared_capture_length(captureHandle, 4) : wasm.manifold_capture_stage_length(4), frames);
  const captureOutput = captureHandle ? wasm.manifold_prepared_output_ptr(captureHandle) : wasm.manifold_output_ptr();
  for (const [offset, expected] of [[0, 0], [frames - 128, .25]]) {
    processing = true;
    assert.equal(captureHandle ? wasm.manifold_prepared_capture_copy(captureHandle, 4, offset, 128) : wasm.manifold_capture_stage_copy(4, offset, 128), 128);
    processing = false;
    assert.ok(new Float32Array(wasm.memory.buffer, captureOutput, 256).every(v => v === expected));
  }
  assert.equal(allocations, 0); assert.equal(frees, 0);
  Object.assign(report.runs.at(-1), {captureCapacity: capacity, captureSeconds: 240, capturedFrames: frames,
    capturePrefixAndTail: true, ...(memory ? {callbackAllocations: allocations, callbackFrees: frees} : {})});
  if (captureHandle) wasm.manifold_prepared_release(captureHandle);
}
const out = new URL('../web/public/studio/2026-10-13-sample-storage/', import.meta.url);
await mkdir(out, {recursive: true});
await writeFile(new URL('wasm-report.json', out), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
