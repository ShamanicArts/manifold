import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const base = 'web/public/reference/phase-vocoder';
const manifest = JSON.parse(readFileSync(`${base}/manifest.json`, 'utf8'));
const project = JSON.parse(readFileSync('projects/phase-vocoder/project.json', 'utf8'));
const floats = (file) => {
  const bytes = readFileSync(`${base}/${file}`);
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};
const input = floats(manifest.input);
const wasmBytes = readFileSync('web/dist/manifold_filter.wasm');
let Processor;
const messages = [];
globalThis.sampleRate = manifest.sampleRate;
globalThis.currentFrame = 0;
globalThis.AudioWorkletProcessor = class {
  constructor() { this.port = { postMessage: (message) => messages.push(message), onmessage: null }; }
};
globalThis.registerProcessor = (name, processor) => {
  assert.equal(name, 'manifold-project');
  Processor = processor;
};
await import(pathToFileURL(resolve('web/src/audio/filter-processor.js')).href);

for (const selected of manifest.cases) {
  messages.length = 0;
  globalThis.currentFrame = 0;
  const processor = new Processor();
  const graph = structuredClone(project.signal);
  graph.initialParameters = selected.before.map((value, id) => ({ nodeId: 2, id, value }));
  await processor.port.onmessage({ data: { type: 'init', wasmBytes, graph } });
  assert.deepEqual(messages.at(-1), { type: 'ready' });
  const expected = floats(selected.rustOutput);
  let max = 0;
  for (let offset = 0; offset < manifest.frames; offset += selected.blockSize) {
    const count = Math.min(selected.blockSize, manifest.frames - offset);
    const left = new Float32Array(count);
    const right = new Float32Array(count);
    const outLeft = new Float32Array(count);
    const outRight = new Float32Array(count);
    for (let frame = 0; frame < count; frame++) {
      left[frame] = input[(offset + frame) * 2];
      right[frame] = input[(offset + frame) * 2 + 1];
    }
    processor.process([[left, right]], [[outLeft, outRight]]);
    for (let frame = 0; frame < count; frame++) {
      max = Math.max(max, Math.abs(outLeft[frame] - expected[(offset + frame) * 2]),
        Math.abs(outRight[frame] - expected[(offset + frame) * 2 + 1]));
    }
    globalThis.currentFrame += count;
  }
  assert.ok(Number.isFinite(max) && max <= .0002, `${selected.id}: max ${max}`);
  console.log(`${selected.id}: native Rust ↔ AudioWorklet max Δ ${max}`);
}
