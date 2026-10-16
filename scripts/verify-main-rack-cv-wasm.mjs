// Render the authored LFO→Filter Cutoff connection through Rust/Wasm without a device.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

let Processor;
const messages = [];
globalThis.sampleRate = 48_000;
globalThis.currentFrame = 0;
globalThis.AudioWorkletProcessor = class {
  constructor() { this.port = { postMessage: message => messages.push(message), onmessage: null }; }
};
globalThis.registerProcessor = (_, constructor) => { Processor = constructor; };
await import(pathToFileURL(resolve('web/src/audio/filter-processor.js')).href);

const base = JSON.parse(readFileSync('projects/main-looper/default-rack-graph.json', 'utf8'));
const wired = JSON.parse(readFileSync('projects/main-looper/lfo-filter-rack-graph.json', 'utf8'));
const wasmBytes = readFileSync('web/dist/manifold_filter.wasm');
async function energy(project) {
  messages.length = 0;
  globalThis.currentFrame = 0;
  const graph = structuredClone(project.signal);
  graph.initialParameters.find(entry => entry.nodeId === 6 && entry.id === 1).value = 800;
  const processor = new Processor();
  await processor.port.onmessage({ data: { type: 'init', wasmBytes, graph, partials: project.targets } });
  assert.deepEqual(messages.at(-1), { type: 'ready' });
  await processor.port.onmessage({ data: { type: 'event', nodeId: 4, frame: 0,
    kind: 0, channel: 0, note: 96, velocity: 120 } });
  const silence = new Float32Array(128);
  let total = 0;
  for (let block = 0; block < 120; block++) {
    const left = new Float32Array(128), right = new Float32Array(128);
    assert.equal(processor.process([[silence, silence]], [[left, right]]), true);
    if (block >= 40) total += left.reduce((sum, sample) => sum + Math.abs(sample), 0);
    globalThis.currentFrame += 128;
  }
  return total;
}
const unwired = await energy(base);
const withLfo = await energy(wired);
assert.ok(withLfo > unwired * 3, `Unwired ${unwired}, wired ${withLfo}`);
const native = JSON.parse(execFileSync('cargo', ['run', '--quiet', '-p', 'manifold-native',
  '--example', 'render_main_rack_cv'], { encoding: 'utf8' }));
for (const [name, wasm] of [['unwired', unwired], ['wired', withLfo]]) {
  assert.ok(Math.abs(wasm - native[name]) < Math.max(1e-4, native[name] * 1e-4),
    `${name}: Wasm ${wasm}, native ${native[name]}`);
}
console.log(JSON.stringify({ unwired, wired: withLfo, ratio: withLfo / unwired, native }));
