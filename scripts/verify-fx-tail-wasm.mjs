// Compare the prepared legacy EffectSlot graph in Wasm with the old C++ switch capture.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const referencePath = path.join(root, 'target/legacy-reference/fx-tail-old.f32');
if (!fs.existsSync(referencePath)) throw new Error('Run python3 scripts/probe-fx-tail.py first.');
const reference = fs.readFileSync(referencePath);
if (reference.byteLength !== 32768 * 2 * 4) throw new Error('Unexpected C++ tail capture size.');
const { instance } = await WebAssembly.instantiate(fs.readFileSync(path.join(root, 'web/public/manifold_filter.wasm')), {});
const wasm = instance.exports;
const required = (name, ...args) => {
  if (wasm[name](...args) !== 1) throw new Error(`${name} failed for ${args.join(', ')}`);
};
if (wasm.manifold_version() !== 4) throw new Error('Unexpected Wasm ABI version.');
required('manifold_graph_begin', 3, 2);
required('manifold_graph_node', 1, 0, 0, 0);
required('manifold_graph_node', 2, 52, 8, 1);
required('manifold_graph_node', 3, 7, 0, 0);
required('manifold_graph_edge', 1, 2, 0);
required('manifold_graph_edge', 2, 3, 0);
required('manifold_graph_initial_parameter', 2, 2, 0);
required('manifold_graph_initial_parameter', 2, 3, 0.6);
required('manifold_prepare', 48000, 128);
const inputPtr = wasm.manifold_input_ptr() / 4;
const outputPtr = wasm.manifold_output_ptr() / 4;
const pulses = [0, 2000, 9500, 14000, 20000];
function sample(frame, channel) {
  let value = 0;
  for (const pulse of pulses) if (frame === pulse + channel * 23) value = Math.fround(value + (channel ? -0.55 : 0.7));
  if (frame >= 4000 && frame < 6000 || frame >= 10500 && frame < 12500) {
    const amp = channel ? 0.17 : 0.2;
    const freq = channel ? 330 : 220;
    value = Math.fround(value + Math.fround(amp * Math.sin(2 * 3.141592653589793 * freq * frame / 48000)));
  }
  return value;
}
let maximum = 0;
let sumSquared = 0;
let afterMaximum = 0;
let afterSumSquared = 0;
let returnTailSample = null;
for (let offset = 0; offset < 32768; offset += 128) {
  if (offset === 8192) required('manifold_set_node_parameter', 2, 0, 0);
  if (offset === 16384) required('manifold_set_node_parameter', 2, 0, 8);
  const memory = new Float32Array(wasm.memory.buffer);
  for (let frame = 0; frame < 128; frame++) {
    memory[inputPtr + frame] = sample(offset + frame, 0);
    memory[inputPtr + 128 + frame] = sample(offset + frame, 1);
  }
  required('manifold_process', 128);
  for (let frame = 0; frame < 128; frame++) {
    for (let channel = 0; channel < 2; channel++) {
      const index = (offset + frame) * 2 + channel;
      const old = reference.readFloatLE(index * 4);
      const current = memory[outputPtr + channel * 128 + frame];
      const difference = Math.abs(old - current);
      maximum = Math.max(maximum, difference);
      sumSquared += difference * difference;
      if (offset >= 16384) {
        afterMaximum = Math.max(afterMaximum, difference);
        afterSumSquared += difference * difference;
      }
      if (offset + frame === 17180 && channel === 0) returnTailSample = { old, wasm: current };
    }
  }
}
const report = {
  reference: 'Old C++ scalar Chorus/Delay route versus prepared Rust/Wasm legacy EffectSlot graph kind 52',
  frames: 32768, sampleRate: 48000, blockSize: 128,
  maxDifference: maximum,
  rmsDifference: Math.sqrt(sumSquared / (32768 * 2)),
  afterReturnMaxDifference: afterMaximum,
  afterReturnRmsDifference: Math.sqrt(afterSumSquared / (16384 * 2)),
  returnTailSample,
};
fs.writeFileSync(path.join(root, 'artifacts/reviews/checkpoint-74-wasm-metrics.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (maximum > 2e-6) process.exitCode = 1;
