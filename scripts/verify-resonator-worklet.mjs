import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const base = 'web/public/reference/resonator';
const manifest = JSON.parse(readFileSync(`${base}/manifest.json`, 'utf8'));
const project = JSON.parse(readFileSync('projects/resonator/project.json', 'utf8'));
const inputBytes = readFileSync(`${base}/${manifest.input}`);
const input = new Float32Array(inputBytes.buffer, inputBytes.byteOffset, inputBytes.byteLength / 4);
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
  const expectedBytes = readFileSync(`${base}/${selected.output}`);
  const expected = new Float32Array(expectedBytes.buffer, expectedBytes.byteOffset, expectedBytes.byteLength / 4);
  let max = 0;
  for (let offset = 0; offset < manifest.frames; offset += selected.blockSize) {
    if (offset === manifest.stepFrame) {
      for (const [id, value] of selected.after.entries()) {
        await processor.port.onmessage({ data: { type: 'parameter', nodeId: 2, id, value } });
      }
    }
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
  console.log(`${selected.id}: C++ ↔ AudioWorklet max Δ ${max}`);
}
