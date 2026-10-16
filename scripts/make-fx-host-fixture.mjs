// Package the reconstructed old C++ FX branch graph capture for the browser.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const target = path.join(root, 'web/public/reference/standalone-fx-host');
const source = path.join(root, 'target/legacy-reference/fx-runtime-switch.f32');
const phaserSource = path.join(root, 'target/legacy-reference/fx-phaser-switch-old.f32');
const reverbSource = path.join(root, 'target/legacy-reference/fx-reverb-switch-old.f32');
const svfSource = path.join(root, 'target/legacy-reference/fx-svf-switch-old.f32');
const compressorSource = path.join(root, 'target/legacy-reference/fx-compressor-switch-old.f32');
const ringSource = path.join(root, 'target/legacy-reference/fx-ring-switch-old.f32');
const input = path.join(root, 'web/public/reference/standalone-fx-routing/input.f32');
const report = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/reviews/checkpoint-80-runtime-switch-metrics.json'), 'utf8'));
const phaserReport = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/reviews/checkpoint-84-phaser-switch-metrics.json'), 'utf8'));
const reverbReport = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/reviews/checkpoint-85-reverb-switch-metrics.json'), 'utf8'));
const svfReport = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/reviews/checkpoint-86-svf-switch-metrics.json'), 'utf8'));
const compressorReport = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/reviews/checkpoint-87-compressor-switch-metrics.json'), 'utf8'));
const ringReport = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/reviews/checkpoint-88-ring-switch-metrics.json'), 'utf8'));
if ([source, phaserSource, reverbSource, svfSource, compressorSource, ringSource, input].some((file) => fs.statSync(file).size !== 32768 * 2 * 4)) {
  throw new Error('Unexpected FX graph reference size.');
}
fs.mkdirSync(target, {recursive: true});
fs.copyFileSync(source, path.join(target, 'delay-chorus-delay.f32'));
fs.copyFileSync(phaserSource, path.join(target, 'delay-phaser-delay.f32'));
fs.copyFileSync(reverbSource, path.join(target, 'delay-reverb-delay-reverb.f32'));
fs.copyFileSync(svfSource, path.join(target, 'delay-svf-delay-svf.f32'));
fs.copyFileSync(compressorSource, path.join(target, 'delay-compressor-delay-compressor.f32'));
fs.copyFileSync(ringSource, path.join(target, 'delay-ring-delay-ring.f32'));
fs.copyFileSync(input, path.join(target, 'input.f32'));
const manifest = {
  version: 1,
  reference: 'Old C++ scalar PrimitiveGraph/GraphRuntime FX branches reconstructed from fx_slot.lua',
  sourceSha256: report.sourceSha256,
  sampleRate: 48000, channels: 2, frames: 32768, blockSize: 128, stepFrame: 8192,
  input: 'input.f32',
  cases: [{
    id: 'delay-chorus-delay', label: 'Delay → Chorus → Delay · host graph switches',
    sourceSha256: report.sourceSha256,
    before: [8, 1, 0, 0.6, 0.5, 0.5, 0.5],
    switches: [[8192, 0], [16384, 8]],
    focusFrame: 16384,
    output: 'delay-chorus-delay.f32',
  }, {
    id: 'delay-phaser-delay', label: 'Delay → Phaser → Delay · host graph switches',
    sourceSha256: phaserReport.sourceSha256,
    before: [8, 1, 0, 0.6, 0.5, 0.5, 0.5],
    switches: [[8192, 1], [16384, 8]],
    focusFrame: 16384,
    output: 'delay-phaser-delay.f32',
  }, {
    id: 'delay-reverb-delay-reverb', label: 'Delay → Reverb → Delay → Reverb · host graph switches',
    sourceSha256: reverbReport.sourceSha256,
    before: [8, 1, 0, 0.6, 0.5, 0.5, 0.5],
    switches: [[8192, 7], [16384, 8], [24576, 7]],
    focusFrame: 24576,
    output: 'delay-reverb-delay-reverb.f32',
  }, {
    id: 'delay-svf-delay-svf', label: 'Delay → SVF → Delay → SVF · host graph switches',
    sourceSha256: svfReport.sourceSha256,
    before: [8, 1, 0, 0.6, 0.5, 0.5, 0.5],
    switches: [[8192, 6], [16384, 8], [20096, 6]],
    focusFrame: 20096,
    output: 'delay-svf-delay-svf.f32',
  }, {
    id: 'delay-compressor-delay-compressor', label: 'Delay → Compressor → Delay → Compressor · timing refresh',
    sourceSha256: compressorReport.sourceSha256,
    before: [8, 1, 0, 0.6, 0.5, 0.5, 0.5],
    switches: [[8192, 3], [11008, 8], [11520, 3]],
    changes: [[10880, 4, 1], [10880, 5, 1]],
    focusFrame: 11520,
    output: 'delay-compressor-delay-compressor.f32',
  }, {
    id: 'delay-ring-delay-ring', label: 'Delay → Ring → Delay → Ring · old silent B bus',
    sourceSha256: ringReport.sourceSha256,
    before: [8, 1, 0, 0.6, 0.5, 0.5, 0.5],
    switches: [[8192, 12], [11008, 8], [11520, 12]],
    focusFrame: 11520,
    output: 'delay-ring-delay-ring.f32',
  }],
};
fs.writeFileSync(path.join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(target);
