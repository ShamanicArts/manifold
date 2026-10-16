// Run the actual AudioWorklet adapter in Node with a minimal Web Audio host shim.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const project = JSON.parse(fs.readFileSync(path.join(root, 'projects/midi-transpose/project.json')));
const fixture = fs.readFileSync(path.join(root, 'web/public/reference/midi-transpose/held-remap.f32'));
const wasmBytes = fs.readFileSync(path.join(root, 'web/public/manifold_filter.wasm'));
const messages = [];
globalThis.sampleRate = 48000;
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
const selected = JSON.parse(fs.readFileSync(path.join(root, 'web/public/reference/midi-transpose/manifest.json'))).cases[0];
for (const [id, value] of [selected.waveform, selected.attack, selected.decay, selected.sustain, selected.release, selected.level].entries()) {
  await send({ type: 'parameter', nodeId: 1, id, value });
}
await send({ type: 'parameter', nodeId: 4, id: 0, value: selected.semitones });
let max = 0;
for (let offset = 0; offset < 8192; offset += 128) {
  globalThis.currentFrame = offset;
  for (const change of selected.changes) {
    if (change.frame === offset) await send({ type: 'parameter', nodeId: 4, id: 0, value: change.semitones });
  }
  for (const event of selected.events) {
    if (event.frame === offset) await send({ type: 'event', nodeId: 3, kind: event.kind,
      channel: event.channel, note: event.note, velocity: event.velocity, frame: event.frame });
  }
  const outL = new Float32Array(128);
  const outR = new Float32Array(128);
  processor.process([[]], [[outL, outR]]);
  for (let frame = 0; frame < 128; frame++) {
    for (const [channel, current] of [[0, outL[frame]], [1, outR[frame]]]) {
      const old = fixture.readFloatLE(((offset + frame) * 2 + channel) * 4);
      max = Math.max(max, Math.abs(old - current));
    }
  }
}
if (messages.some((message) => message.type === 'error') || max > 1e-6) {
  throw new Error(`Worklet transpose mismatch: max ${max}; messages ${JSON.stringify(messages)}`);
}
console.log(`AudioWorklet MIDI Transpose matches native Rust: max Δ ${max}`);
