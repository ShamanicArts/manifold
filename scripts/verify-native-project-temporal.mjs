// Compare a saved Main project through native state loading and browser Wasm playback.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { captureGraphProject, defaultGraphTemporal, setInitialParameter } from '../web/src/graph/topology.js';

const messages = [];
let Processor;
globalThis.sampleRate = 48_000;
globalThis.currentFrame = 0;
globalThis.AudioWorkletProcessor = class {
  constructor() { this.port = { postMessage: (message) => messages.push(message), onmessage: null }; }
};
globalThis.registerProcessor = (_, processor) => { Processor = processor; };
await import(pathToFileURL(resolve('web/src/audio/filter-processor.js')).href);

const wasmBytes = readFileSync('web/dist/manifold_filter.wasm');
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const analysis = instance.exports;
const authored = JSON.parse(readFileSync('projects/graph-workspace/main-bank.json', 'utf8'));
const signal = setInitialParameter(authored.signal, 5, 6, 4);
const sourceFrames = 12_288;
const source = new Float32Array(sourceFrames * 2);
for (let frame = 0; frame < sourceFrames; frame++) {
  const frequency = frame < sourceFrames / 2 ? 220 : 660;
  const sample = Math.fround(Math.sin(frame * Math.PI * 2 * frequency / 48_000) * .8);
  source[frame * 2] = sample;
  source[frame * 2 + 1] = sample;
}
const recipe = { ...defaultGraphTemporal(5), speed: 2 };
const bundle = captureGraphProject(signal, [{ nodeId: 5, sourceRate: 48_000,
  label: 'moving Main source', stereo: source }], authored.targets, [recipe]);

assert.equal(analysis.manifold_analysis_begin(sourceFrames, 48_000), 1);
new Float32Array(analysis.memory.buffer, analysis.manifold_analysis_ptr(), source.length).set(source);
assert.equal(analysis.manifold_analysis_run_temporal(0, sourceFrames, 128), 1);
const frames = analysis.manifold_analysis_temporal_count();
assert.ok(frames >= 2, 'source has moving spectral frames');
const packed = new Float32Array(1 + frames * 131);
packed[0] = frames;
for (let index = 0; index < frames; index++) {
  const offset = 1 + index * 131;
  const count = analysis.manifold_analysis_temporal_frame_field(index, 5);
  packed[offset] = analysis.manifold_analysis_temporal_frame_field(index, 0);
  packed[offset + 1] = analysis.manifold_analysis_temporal_frame_field(index, 4);
  packed[offset + 2] = count;
  packed.set(new Float32Array(analysis.memory.buffer,
    analysis.manifold_analysis_temporal_partials_ptr(index), count * 4), offset + 3);
}
const rawRecipe = new Float32Array([recipe.smooth, recipe.contrast, recipe.recipe[9],
  recipe.recipe[10], recipe.recipe[5], recipe.recipe[0], recipe.recipe[4],
  recipe.recipe[6], recipe.recipe[7], recipe.recipe[8]]);

const workspace = mkdtempSync(join(tmpdir(), 'manifold-native-project-'));
try {
  const projectPath = join(workspace, 'main.project.json');
  const nativePath = join(workspace, 'native.f32');
  const staticPath = join(workspace, 'static.f32');
  writeFileSync(projectPath, JSON.stringify(bundle));
  execFileSync('cargo', ['run', '--quiet', '-p', 'manifold-native', '--example',
    'render_project', '--', projectPath, nativePath], { cwd: resolve('.'), stdio: 'pipe' });
  const staticBundle = { ...bundle, temporal: undefined };
  writeFileSync(projectPath, JSON.stringify(staticBundle));
  execFileSync('cargo', ['run', '--quiet', '-p', 'manifold-native', '--example',
    'render_project', '--', projectPath, staticPath], { cwd: resolve('.'), stdio: 'pipe' });

  const processor = new Processor();
  await processor.port.onmessage({ data: {
    type: 'init', wasmBytes, graph: bundle.signal,
    samples: [{ nodeId: 5, sourceRate: 48_000, stereo: source }],
    partials: bundle.targets,
    temporals: [{ nodeId: 5, frames, rawFrames: packed, rawRecipe, speed: recipe.speed }],
  } });
  assert.deepEqual(messages.at(-1), { type: 'ready' });
  await processor.port.onmessage({ data: { type: 'event', nodeId: 4, frame: 16,
    kind: 0, channel: 15, note: 60, velocity: 100 } });
  const browser = new Float32Array(8192 * 2);
  for (let block = 0; block < 64; block++) {
    const left = new Float32Array(128);
    const right = new Float32Array(128);
    processor.process([[new Float32Array(128), new Float32Array(128)]], [[left, right]]);
    for (let index = 0; index < 128; index++) {
      const frame = block * 128 + index;
      browser[frame * 2] = left[index];
      browser[frame * 2 + 1] = right[index];
    }
    globalThis.currentFrame += 128;
  }
  const nativeBytes = readFileSync(nativePath);
  const staticBytes = readFileSync(staticPath);
  assert.equal(nativeBytes.length, browser.byteLength);
  assert.equal(staticBytes.length, nativeBytes.length);
  let maxDifference = 0;
  let temporalDifference = 0;
  let peak = 0;
  for (let index = 0; index < browser.length; index++) {
    const native = nativeBytes.readFloatLE(index * 4);
    maxDifference = Math.max(maxDifference, Math.abs(native - browser[index]));
    temporalDifference = Math.max(temporalDifference,
      Math.abs(native - staticBytes.readFloatLE(index * 4)));
    peak = Math.max(peak, Math.abs(native));
  }
  assert.ok(peak > .01, `Main produced audio: ${peak}`);
  assert.ok(temporalDifference > .005, `temporal recipe changed audio: ${temporalDifference}`);
  assert.ok(maxDifference < 1e-5, `native and Wasm differ: ${maxDifference}`);
  console.log(`Saved Main project: ${frames} temporal frames, 8192 stereo output frames; peak ${peak.toFixed(6)}; temporal change ${temporalDifference.toFixed(6)}; native/Wasm max difference ${maxDifference.toFixed(9)}`);
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
