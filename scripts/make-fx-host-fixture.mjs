// Package the reconstructed old C++ FX branch graph capture for the browser.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const target = path.join(root, 'web/public/reference/standalone-fx-host');
const source = path.join(root, 'target/legacy-reference/fx-runtime-switch.f32');
const input = path.join(root, 'web/public/reference/standalone-fx-routing/input.f32');
const report = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/reviews/checkpoint-80-runtime-switch-metrics.json'), 'utf8'));
if (fs.statSync(source).size !== 32768 * 2 * 4 || fs.statSync(input).size !== 32768 * 2 * 4) {
  throw new Error('Unexpected FX graph reference size.');
}
fs.mkdirSync(target, {recursive: true});
fs.copyFileSync(source, path.join(target, 'delay-chorus-delay.f32'));
fs.copyFileSync(input, path.join(target, 'input.f32'));
const manifest = {
  version: 1,
  reference: 'Old C++ scalar PrimitiveGraph/GraphRuntime FX branches reconstructed from fx_slot.lua',
  sourceSha256: report.sourceSha256,
  sampleRate: 48000, channels: 2, frames: 32768, blockSize: 128, stepFrame: 8192,
  input: 'input.f32',
  cases: [{
    id: 'delay-chorus-delay', label: 'Delay → Chorus → Delay · host graph switches',
    before: [8, 1, 0, 0.6, 0.5, 0.5, 0.5],
    switches: [[8192, 0], [16384, 8]],
    focusFrame: 16384,
    output: 'delay-chorus-delay.f32',
  }],
};
fs.writeFileSync(path.join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(target);
