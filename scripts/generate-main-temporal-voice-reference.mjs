// Render real analyzed temporal Add/Morph targets through the native Main bank.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = 'web/public/reference/main-temporal-voice';
mkdirSync(root, { recursive: true });
const hash = (names) => {
  const digest = createHash('sha256');
  for (const name of names) digest.update(readFileSync(name));
  return digest.digest('hex');
};
const bytes = (floats) => Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength);
const wasmBytes = readFileSync('web/public/manifold_filter.wasm');
const { instance: { exports: analysis } } = await WebAssembly.instantiate(wasmBytes, {});
const rate = 48_000, sampleFrames = rate, frames = 32_768, blockSize = 128;
const sample = new Float32Array(sampleFrames * 2);
for (let frame = 0; frame < sampleFrames; frame++) {
  const time = frame / rate;
  const position = frame / (sampleFrames - 1);
  const fundamental = .4 * Math.sin(2 * Math.PI * 220 * time);
  const second = (.08 + .28 * position) * Math.sin(2 * Math.PI * 440 * time);
  const fourth = (.3 - .27 * position) * Math.sin(2 * Math.PI * 880 * time);
  sample[frame * 2] = fundamental + second + fourth;
  sample[frame * 2 + 1] = (fundamental + second + fourth) * .8;
}
writeFileSync(join(root, 'sample.f32'), bytes(sample));
writeFileSync(join(root, 'input.f32'), Buffer.alloc(frames * 8));
assert.equal(analysis.manifold_analysis_begin(sampleFrames, rate), 1);
new Float32Array(analysis.memory.buffer, analysis.manifold_analysis_ptr(), sample.length).set(sample);
assert.equal(analysis.manifold_analysis_run_temporal(0, sampleFrames, 128), 1);
const recipe = new Float32Array([1, 8, .2, .3, .35, 0, .5, .7, 2, .1, 2]);
new Float32Array(analysis.memory.buffer, analysis.manifold_analysis_recipe_ptr(), recipe.length).set(recipe);
assert.equal(analysis.manifold_analysis_prepare_wave_target(1, 8, .2, .3, .35), 1);
const waveCount = analysis.manifold_analysis_target_count();
const waveTarget = Array.from(new Float32Array(analysis.memory.buffer,
  analysis.manifold_analysis_target_ptr(), waveCount * 4));
const tables = new Map();
for (const [mode, name] of [[1, 'add'], [2, 'morph']]) {
  const table = new Float32Array(256 * 130);
  for (let index = 0; index < 256; index++) {
    assert.equal(analysis.manifold_analysis_prepare_target(mode, index / 255, .6, .5), 1);
    const count = analysis.manifold_analysis_target_count();
    table[index * 130] = count;
    table[index * 130 + 1] = analysis.manifold_analysis_target_fundamental();
    table.set(new Float32Array(analysis.memory.buffer, analysis.manifold_analysis_target_ptr(), count * 4),
      index * 130 + 2);
  }
  writeFileSync(join(root, `${name}-table.f32`), bytes(table));
  tables.set(name, table);
}
const sourceTarget = Array.from(tables.get('add').subarray(2, 2 + tables.get('add')[0] * 4));
const argsFor = (values) => values.join(',');
const parameters = (mode, blend) => [0, blend, 60, 2, 0, 0, mode, .9, .5, 0, 1,
  .001, .001, 1, .05, 1, 1, 0, .2];
const events = [[0, 0, 0, 60, 127], [10_240, 0, 0, 60, 100]];
const eventText = events.map((entry) => entry.join(':')).join(',');
const cases = [];
for (const [name, mode] of [['add', 4], ['morph', 5]]) {
  for (const [motion, speed] of [['static', 0], ['follow', 1], ['fast', 2]]) {
    const id = `${name}-${motion}`;
    const output = `${id}-rust.f32`;
    const params = parameters(mode, 1);
    execFileSync('target/debug/examples/render_main_voice_bank', [
      join(root, 'sample.f32'), join(root, output), rate, rate, blockSize, frames,
      argsFor(params), eventText, '', argsFor(waveTarget), argsFor(sourceTarget),
      join(root, `${name}-table.f32`), speed,
    ].map(String));
    cases.push({ id, label: `${name === 'add' ? 'Add' : 'Morph'} · ${motion} source spectrum · two staggered voices`,
      parameters: params, events, changes: [], blockSize, output,
      temporalFile: `${name}-table.f32`, temporalSpeed: speed });
  }
}
writeFileSync(join(root, 'manifest.json'), `${JSON.stringify({
  version: 1, reference: 'native Rust versus Wasm Main temporal source spectrum',
  scope: '256 prepared positions from Rust/Wasm source analysis; per-voice playhead selection in Add and Morph; no original C++ temporal route assertion',
  sourceSha256: hash([
    'crates/manifold-core/src/main_voice_bank.rs', 'crates/manifold-core/src/sample_analysis.rs',
    'crates/manifold-core/src/sine_bank.rs', 'crates/manifold-core/src/graph.rs',
    'crates/manifold-core/examples/render_main_voice_bank.rs',
    'scripts/generate-main-temporal-voice-reference.mjs',
  ]), wasmSha256: createHash('sha256').update(wasmBytes).digest('hex'),
  sampleRate: rate, sampleSourceRate: rate, sampleFrames, sample: 'sample.f32',
  channels: 2, frames, stepFrame: 8192, input: 'input.f32', waveTarget, sourceTarget, cases,
}, null, 2)}\n`);
console.log(`Wrote ${cases.length} native temporal Main cases from analyzed source to ${root}`);
