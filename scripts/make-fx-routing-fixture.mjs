// Package the isolated old C++ switch capture for the browser comparison lab.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'web/public/reference/standalone-fx-routing');
const oldCapture = path.join(root, 'target/legacy-reference/fx-tail-old.f32');
const sourceReport = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/reviews/checkpoint-73-tail-metrics.json'), 'utf8'));
if (!fs.existsSync(oldCapture)) throw new Error('Run python3 scripts/probe-fx-tail.py first.');
if (fs.statSync(oldCapture).size !== 32768 * 2 * 4) throw new Error('Unexpected C++ capture length.');
fs.mkdirSync(output, { recursive: true });
const pulses = [0, 2000, 9500, 14000, 20000];
function sample(frame, channel) {
  let value = 0;
  for (const pulse of pulses) if (frame === pulse + channel * 23) value = Math.fround(value + (channel ? -0.55 : 0.7));
  if (frame >= 4000 && frame < 6000 || frame >= 10500 && frame < 12500) {
    const amp = channel ? 0.17 : 0.2;
    const freq = channel ? 330 : 220;
    value = Math.fround(value + Math.fround(amp * Math.sin(2 * Math.PI * freq * frame / 48000)));
  }
  return value;
}
const input = Buffer.alloc(32768 * 2 * 4);
for (let frame = 0; frame < 32768; frame++) {
  for (let channel = 0; channel < 2; channel++) {
    input.writeFloatLE(sample(frame, channel), (frame * 2 + channel) * 4);
  }
}
fs.writeFileSync(path.join(output, 'input.f32'), input);
fs.copyFileSync(oldCapture, path.join(output, 'delay-chorus-delay.f32'));
const manifest = {
  version: 1,
  reference: 'Isolated old C++ Gain/Mixer/Chorus/StereoDelay route; prepared gates and persistent processing',
  sourceSha256: sourceReport.sourceSha256,
  sampleRate: 48000, channels: 2, frames: 32768, blockSize: 128, stepFrame: 8192,
  input: 'input.f32',
  cases: [{
    id: 'delay-chorus-delay', label: 'Delay → Chorus → Delay · returning tail',
    before: [8, 1, 0, 0.6, 0.5, 0.5, 0.5],
    switches: [[8192, 0], [16384, 8]],
    focusFrame: 17180,
    output: 'delay-chorus-delay.f32',
  }],
};
fs.writeFileSync(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(output);
