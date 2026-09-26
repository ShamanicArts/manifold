// Compare the prepared Rust MIDI Arpeggiator graph and actual AudioWorklet adapter with native audio.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const project = JSON.parse(fs.readFileSync(path.join(root, 'projects/midi-arpeggiator/project.json')));
const family = path.join(root, 'web/public/reference/midi-arpeggiator');
const manifest = JSON.parse(fs.readFileSync(path.join(family, 'manifest.json')));
const selected = manifest.cases[Number(process.argv[2] ?? 0)];
if (!selected) throw new Error('Choose arpeggiator case 0, 1, 2, or 3');
const fixture = fs.readFileSync(path.join(family, selected.output));
const wasmBytes = fs.readFileSync(path.join(root, 'web/public/manifold_filter.wasm'));
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const wasm = instance.exports;
const required = (name, ...args) => {
  if (wasm[name](...args) !== 1) throw new Error(`${name} rejected ${args.join(', ')}`);
};
required('manifold_graph_begin', project.signal.nodes.length, project.signal.connections.length);
for (const node of project.signal.nodes) {
  const kind = { 'midi-input': 54, 'midi-arpeggiator': 59, 'voice-synth': 10, output: 7 }[node.type];
  required('manifold_graph_node', node.id, kind, node.a ?? 0, node.b ?? 0);
}
for (const edge of project.signal.connections) required('manifold_graph_edge', edge.from, edge.to, edge.inputPort);
required('manifold_prepare', manifest.sampleRate, manifest.blockSize);
const voice = [selected.waveform, selected.attack, selected.decay, selected.sustain, selected.release, selected.level];
for (const [id, value] of voice.entries()) required('manifold_set_node_parameter', 1, id, value);
for (const [id, value] of [[1, selected.mode], [2, selected.octaves], [3, selected.gate], [4, selected.hold]]) required('manifold_set_node_parameter', 4, id, value);

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
for (const [id, value] of [[1, selected.mode], [2, selected.octaves], [3, selected.gate], [4, selected.hold]]) await send({ type: 'parameter', nodeId: 4, id, value });

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
    if (event.frame < offset || event.frame >= offset + block) continue;
    required('manifold_event_push', 3, event.frame - offset, event.kind, event.channel, event.note, event.velocity);
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
function seededPitches() {
  const sequence = [60, 64, 72, 76];
  let state = 0x9e3779b97f4a7c15n;
  const mask = (1n << 64n) - 1n;
  return Array.from({ length: 6 }, () => {
    state = (state ^ (state << 13n)) & mask;
    state ^= state >> 7n;
    state = (state ^ (state << 17n)) & mask;
    return sequence[Number(state % 4n)];
  });
}
const pitches = selected.id === 'chord-capture' ? [60, 64]
  : selected.mode === 2 ? [60, 64, 72, 76, 72, 64]
    : selected.mode === 3 ? seededPitches() : [76, 72, 64, 60, 76, 72];
const expectedTrace = pitches.flatMap((note, step) => {
  const onFrame = 1440 + step * 6000;
  const offFrame = selected.id === 'chord-capture' && step === 1
    ? 9500 : onFrame + Math.round(6000 * selected.gate);
  return [
    { frame: onFrame, tuple: [0, note, note % 12 === 0 ? 90 : 100, onFrame % block] },
    { frame: offFrame, tuple: [1, note, 0, offFrame % block] },
  ].filter((entry) => entry.frame < manifest.frames);
}).sort((a, b) => a.frame - b.frame).map((entry) => entry.tuple);
if (trace?.type !== 'midi-trace' || JSON.stringify(trace.events.map((event) =>
  [event.kind, event.note, event.velocity, event.offset])) !== JSON.stringify(expectedTrace)) {
  throw new Error(`Unexpected Rust MIDI output trace: ${JSON.stringify(trace)}`);
}
if (messages.some((message) => message.type === 'error') || wasmMax > 1e-6 || workletMax > 1e-6) {
  throw new Error(`Arpeggiator mismatch: Wasm ${wasmMax}, worklet ${workletMax}, messages ${JSON.stringify(messages)}`);
}
const report = {case: selected.id, frames: manifest.frames, sampleRate: manifest.sampleRate,
  nativeToWasmMax: wasmMax, nativeToWorkletMax: workletMax, traceEvents: trace.events.length};
fs.writeFileSync(path.join(root, `artifacts/reviews/checkpoint-102-midi-arpeggiator-${selected.id}-metrics.json`), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
