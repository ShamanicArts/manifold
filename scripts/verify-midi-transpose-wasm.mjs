import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const family = path.join(root, 'web/public/reference/midi-transpose');
const manifest = JSON.parse(fs.readFileSync(path.join(family, 'manifest.json')));
const selected = manifest.cases[0];
const block = selected.blockSize ?? manifest.blockSize;
const reference = fs.readFileSync(path.join(family, selected.output));
const { instance } = await WebAssembly.instantiate(fs.readFileSync(path.join(root, 'web/public/manifold_filter.wasm')), {});
const wasm = instance.exports;
const required = (name, ...args) => {
  if (wasm[name](...args) !== 1) throw new Error(`${name} rejected ${args.join(', ')}`);
};
required('manifold_graph_begin', 2, 1);
required('manifold_graph_node', 1, 10, 0, 0);
required('manifold_graph_node', 2, 7, 0, 0);
required('manifold_graph_edge', 1, 2, 0);
required('manifold_prepare', manifest.sampleRate, block);
required('manifold_midi_transpose_enable', 1, selected.semitones);
for (const [id, value] of [selected.waveform, selected.attack, selected.decay, selected.sustain, selected.release, selected.level].entries()) {
  required('manifold_set_node_parameter', 1, id, value);
}
const frames = manifest.frames;
const input = wasm.manifold_input_ptr() / 4;
const output = wasm.manifold_output_ptr() / 4;
let max = 0;
let sumSquares = 0;
const boundary = {};
for (let offset = 0; offset < frames; offset += block) {
  for (const change of selected.changes) {
    if (change.frame === offset) required('manifold_midi_transpose_set', change.semitones);
  }
  for (const event of selected.events) {
    if (event.frame >= offset && event.frame < offset + block) {
      required('manifold_event_push', 1, event.frame - offset, event.kind, event.channel, event.note, event.velocity);
    }
  }
  const memory = new Float32Array(wasm.memory.buffer);
  memory.fill(0, input, input + block * 2);
  required('manifold_process', block);
  for (let frame = 0; frame < block; frame++) {
    for (let channel = 0; channel < 2; channel++) {
      const index = (offset + frame) * 2 + channel;
      const old = reference.readFloatLE(index * 4);
      const current = memory[output + channel * block + frame];
      const delta = Math.abs(old - current);
      max = Math.max(max, delta);
      sumSquares += delta * delta;
      if (channel === 0 && [128, 2048, 2049, 4096].includes(offset + frame)) {
        boundary[offset + frame] = {native: old, wasm: current};
      }
    }
  }
}
const report = {
  reference: 'Native Rust MIDI Transpose into VoiceSynth versus Rust/Wasm worklet ABI',
  frames, sampleRate: manifest.sampleRate, blockSize: block,
  max, rms: Math.sqrt(sumSquares / (frames * 2)), boundaryLeft: boundary,
};
fs.writeFileSync(path.join(root, 'artifacts/reviews/checkpoint-94-midi-transpose-wasm-metrics.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (max > 1e-6) process.exitCode = 1;
