// Compare the prepared Rust MIDI Velocity Mapper graph and actual AudioWorklet adapter with native audio.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const project = JSON.parse(fs.readFileSync(path.join(root, 'projects/midi-velocity-mapper/project.json')));
const family = path.join(root, 'web/public/reference/midi-velocity-mapper');
const manifest = JSON.parse(fs.readFileSync(path.join(family, 'manifest.json')));
const selected = manifest.cases[0];
const fixture = fs.readFileSync(path.join(family, selected.output));
const wasmBytes = fs.readFileSync(path.join(root, 'web/public/manifold_filter.wasm'));
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const wasm = instance.exports;
const required = (name, ...args) => {
  if (wasm[name](...args) !== 1) throw new Error(`${name} rejected ${args.join(', ')}`);
};
required('manifold_graph_begin', project.signal.nodes.length, project.signal.connections.length);
for (const node of project.signal.nodes) {
  const kind = { 'midi-input': 54, 'midi-velocity-mapper': 58, 'voice-synth': 10, output: 7 }[node.type];
  required('manifold_graph_node', node.id, kind, node.a ?? 0, node.b ?? 0);
}
for (const edge of project.signal.connections) required('manifold_graph_edge', edge.from, edge.to, edge.inputPort);
required('manifold_prepare', manifest.sampleRate, manifest.blockSize);
const voice = [selected.waveform, selected.attack, selected.decay, selected.sustain, selected.release, selected.level];
for (const [id, value] of voice.entries()) required('manifold_set_node_parameter', 1, id, value);
required('manifold_set_node_parameter', 4, 1, selected.curve);

const messages = [];
globalThis.sampleRate = manifest.sampleRate;
globalThis.currentFrame = 0;
globalThis.AudioWorkletProcessor = class {
  constructor() { this.port = { postMessage: (data) => messages.push(data) }; }
};
globalThis.registerProcessor = (_name, constructor) => { globalThis.Processor = constructor; };
await import('../web/src/audio/filter-processor.js');
const processor = new globalThis.Processor();
const send = async (data) => processor.port.onmessage({ data });
await send({ type: 'init', wasmBytes, graph: project.signal });
if (messages.at(-1)?.type !== 'ready') throw new Error(`Worklet did not prepare: ${JSON.stringify(messages)}`);
for (const [id, value] of voice.entries()) await send({ type: 'parameter', nodeId: 1, id, value });
await send({ type: 'parameter', nodeId: 4, id: 1, value: selected.curve });

let wasmMax = 0;
let workletMax = 0;
const block = manifest.blockSize;
for (let offset = 0; offset < manifest.frames; offset += block) {
  globalThis.currentFrame = offset;
  for (const change of selected.changes) {
    if (change.frame !== offset) continue;
    required('manifold_set_node_parameter', 4, change.id, change.value);
    await send({ type: 'parameter', nodeId: 4, id: change.id, value: change.value });
  }
  for (const event of selected.events) {
    if (event.frame !== offset) continue;
    required('manifold_event_push', 3, 0, event.kind, event.channel, event.note, event.velocity);
    await send({ type: 'event', nodeId: 3, kind: event.kind, channel: event.channel,
      note: event.note, velocity: event.velocity, frame: event.frame });
  }
  required('manifold_process', block);
  const memory = new Float32Array(wasm.memory.buffer);
  const output = wasm.manifold_output_ptr() / 4;
  const outL = new Float32Array(block);
  const outR = new Float32Array(block);
  processor.process([[]], [[outL, outR]]);
  for (let frame = 0; frame < block; frame++) {
    for (let channel = 0; channel < 2; channel++) {
      const old = fixture.readFloatLE(((offset + frame) * 2 + channel) * 4);
      wasmMax = Math.max(wasmMax, Math.abs(old - memory[output + channel * block + frame]));
      workletMax = Math.max(workletMax, Math.abs(old - (channel ? outR : outL)[frame]));
    }
  }
}
await send({ type: 'midi-trace-request' });
const trace = messages.at(-1);
const expectedTrace = [
  [0, 64, 32, true], [0, 60, 79, true], [1, 64, 0, true], [1, 60, 0, true],
  [0, 64, 96, true], [0, 60, 127, true], [1, 64, 0, true], [1, 60, 0, true],
];
if (trace?.type !== 'midi-trace' || JSON.stringify(trace.events.map((event) =>
  [event.kind, event.note, event.velocity, event.emitted])) !== JSON.stringify(expectedTrace)) {
  throw new Error(`Unexpected Rust MIDI output trace: ${JSON.stringify(trace)}`);
}
if (messages.some((message) => message.type === 'error') || wasmMax > 1e-6 || workletMax > 1e-6) {
  throw new Error(`Velocity mapper mismatch: Wasm ${wasmMax}, worklet ${workletMax}, messages ${JSON.stringify(messages)}`);
}
const report = {frames: manifest.frames, sampleRate: manifest.sampleRate,
  nativeToWasmMax: wasmMax, nativeToWorkletMax: workletMax, traceEvents: trace.events.length};
fs.writeFileSync(path.join(root, 'artifacts/reviews/checkpoint-101-midi-velocity-mapper-metrics.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
