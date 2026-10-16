// Exercise both actual Wasm libraries directly; no audio device is opened.
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createEffect, mixer} from '../packages/manifold-author/creative.js';
import {lowerDevice} from '../packages/manifold-author/device.js';
import {PORT_CATALOG} from '../packages/manifold-author/catalog.generated.js';

const report = {recordedAt: new Date().toISOString(),
  scope: 'Actual normal/prepared Wasm execution; no audio device; prepared callback heap probe', runs: []};
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
    assert.ok(allocations && frees, 'Heap probe must detect its negative control');
    allocations = frees = 0;
  }
  const run = {mode, sha256: createHash('sha256').update(bytes).digest('hex'), mixers: []};
  for (const inputs of [33, 128, 257, 513]) {
    const effect = createEffect({id: 'mixer-probe', name: 'Mixer probe'});
    const mix = effect.add('mix', mixer, {config: {inputs}});
    effect.connect(effect.inputs.audio, mix.inputs[`in-${inputs}`]);
    effect.connect(mix.outputs.out, effect.outputs.audio);
    mix.configure({[`input${inputs}Gain`]: .5, [`input${inputs}Pan`]: -1});
    effect.control('lastGain', mix.parameters[`input${inputs}Gain`], {label: 'Last gain', min: 0, max: 2, default: .5});
    const {project} = lowerDevice(effect);
    const {signal} = project;
    assert.equal(wasm.manifold_graph_begin(signal.nodes.length, signal.connections.length), 1);
    assert.equal(wasm.manifold_graph_patchable(1), 1);
    for (const node of signal.nodes) assert.equal(wasm.manifold_graph_node(node.id, PORT_CATALOG[node.type].code, node.a, node.b), 1);
    for (const edge of signal.connections) assert.equal(wasm.manifold_graph_edge_ports(edge.from, edge.outputPort, edge.to, edge.inputPort), 1);
    const io = new TextEncoder().encode(JSON.stringify(signal.io));
    assert.equal(wasm.manifold_graph_io_begin(io.length), 1);
    new Uint8Array(wasm.memory.buffer, wasm.manifold_graph_io_ptr(), io.length).set(io);
    assert.equal(wasm.manifold_graph_io_commit(), 1);
    assert.equal(wasm.manifold_prepare(48000, 128), 1);
    for (const {nodeId, id, value} of signal.initialParameters) assert.equal(wasm.manifold_set_node_parameter(nodeId, id, value), 1, `${mode}: ${inputs} inputs, parameter ${nodeId}:${id}=${value}`);
    assert.equal(wasm.manifold_graph_reset_processing(), 1);
    const handle = mode === 'prepared' ? wasm.manifold_prepared_take() : 0;
    const inputPtr = handle ? wasm.manifold_prepared_input_ptr(handle) : wasm.manifold_input_ptr();
    new Float32Array(wasm.memory.buffer, inputPtr, 256).fill(.25);
    const process = () => handle ? wasm.manifold_prepared_process(handle, 128) : wasm.manifold_process(128);
    const render = () => {
      processing = true;
      const accepted = process();
      processing = false;
      assert.equal(accepted, 1);
    };
    for (let block = 0; block < 64; block++) render();
    const outputPtr = handle ? wasm.manifold_prepared_output_ptr(handle) : wasm.manifold_output_ptr();
    const output = new Float32Array(wasm.memory.buffer, outputPtr, 256);
    const left = output[127], right = output[255];
    assert.ok(output.subarray(0, 128).every(v => Math.abs(v - .125) < 1e-5));
    assert.ok(output.subarray(128).every(v => Math.abs(v) < 1e-5));
    const {nodeId, id: gain} = project.endpoints[0];
    const source = signal.connections.find(edge => edge.to === nodeId).from;
    for (const from of [0, source]) {
      processing = true;
      const accepted = handle ? wasm.manifold_prepared_route(handle, nodeId, inputs - 1, from, 0)
        : wasm.manifold_set_route_from(nodeId, inputs - 1, from, 0);
      processing = false;
      assert.equal(accepted, 1);
      render();
      assert.ok(output.subarray(0, 128).every(v => Math.abs(v - (from ? .125 : 0)) < 1e-5));
      assert.ok(output.subarray(128).every(v => Math.abs(v) < 1e-5));
    }
    processing = true;
    const accepted = handle ? wasm.manifold_prepared_parameter(handle, nodeId, gain, 0) : wasm.manifold_set_node_parameter(nodeId, gain, 0);
    processing = false;
    assert.equal(accepted, 1);
    for (let block = 0; block < 64; block++) render();
    assert.ok(output.every(v => Math.abs(v) < 1e-5), 'Last input gain must silence the connected channel');
    assert.equal(allocations, 0); assert.equal(frees, 0);
    run.mixers.push({inputs, parameters: signal.initialParameters.length, lastGainId: gain,
      left, right, liveRouteDisconnectReconnect: true, lastGainEditSilencesOutput: true});
    if (handle) wasm.manifold_prepared_release(handle);
  }
  if (memory) Object.assign(run, {callbackAllocations: allocations, callbackFrees: frees});
  report.runs.push(run);
}
const out = new URL('../web/public/studio/2026-10-13-mixer-scale/', import.meta.url);
await mkdir(out, {recursive: true});
await writeFile(new URL('wasm-report.json', out), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
