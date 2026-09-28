// Render the generated Main rack graph through the actual Rust/Wasm worklet.
// This fake AudioWorklet host has no device connection or speaker output.
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

const authored = JSON.parse(readFileSync('projects/main-looper/default-rack-graph.json', 'utf8'));
const wasmBytes = readFileSync('web/dist/manifold_filter.wasm');
async function noteEnergy(bypass) {
  messages.length = 0;
  globalThis.currentFrame = 0;
  const graph = structuredClone(authored.signal);
  graph.initialParameters.find(entry => entry.nodeId === 6 && entry.id === 1).value = 80;
  if (bypass) graph.connections.find(edge => edge.to === 7).from = 5;
  const processor = new Processor();
  await processor.port.onmessage({ data: { type: 'init', wasmBytes, graph, partials: authored.targets } });
  assert.deepEqual(messages.at(-1), { type: 'ready' });
  await processor.port.onmessage({ data: { type: 'event', nodeId: 4, frame: 0,
    kind: 0, channel: 0, note: 96, velocity: 120 } });
  const silence = new Float32Array(128);
  let energy = 0;
  for (let block = 0; block < 90; block++) {
    const left = new Float32Array(128), right = new Float32Array(128);
    assert.equal(processor.process([[silence, silence]], [[left, right]]), true);
    if (block >= 40) energy += left.reduce((sum, sample) => sum + Math.abs(sample), 0);
    globalThis.currentFrame += 128;
  }
  return energy;
}
const filtered = await noteEnergy(false);
const bypassed = await noteEnergy(true);
assert.ok(bypassed > filtered * 3, `Filter ${filtered}, bypass ${bypassed}`);
const native = JSON.parse(execFileSync('cargo', ['run', '--quiet', '-p', 'manifold-native',
  '--example', 'render_main_rack_graph'], { encoding: 'utf8' }));
for (const [name, wasm] of [['filtered', filtered], ['bypassed', bypassed]]) {
  const difference = Math.abs(wasm - native[name]);
  assert.ok(difference < Math.max(1e-4, Math.abs(native[name]) * 1e-4),
    `${name} native/Wasm energy difference ${difference}`);
}
console.log(JSON.stringify({ filtered, bypassed, ratio: bypassed / filtered, native,
  nodes: authored.signal.nodes.length, edges: authored.signal.connections.length }));
