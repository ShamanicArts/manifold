import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const project = JSON.parse(readFileSync('projects/sine-bank/project.json', 'utf8'));
const wasmBytes = readFileSync('web/dist/manifold_filter.wasm');
let Processor;
const messages = [];
globalThis.sampleRate = 48000;
globalThis.currentFrame = 0;
globalThis.AudioWorkletProcessor = class {
  constructor() { this.port = { postMessage: (message) => messages.push(message), onmessage: null }; }
};
globalThis.registerProcessor = (name, processor) => {
  assert.equal(name, 'manifold-project');
  Processor = processor;
};
await import(pathToFileURL(resolve('web/src/audio/filter-processor.js')).href);

const processor = new Processor();
await processor.port.onmessage({ data: { type: 'init', wasmBytes, graph: project.signal, partials: project.partials } });
assert.deepEqual(messages.at(-1), { type: 'ready' });
const render = () => {
  const left = new Float32Array(128);
  const right = new Float32Array(128);
  processor.process([[]], [[left, right]]);
  globalThis.currentFrame += 128;
  return { left, right };
};
const first = render();
assert.ok(first.left.some((value) => Math.abs(value) > .005), 'initial partials must sound');
assert.deepEqual(first.left, first.right, 'default unison is centered');

const sine = { ...project.partials, values: [440, 1, 0, 0] };
await processor.port.onmessage({ data: { type: 'partials', requestId: 1, ...sine } });
assert.deepEqual(messages.at(-1), { type: 'partials-applied', requestId: 1, accepted: true });
const after = render();
assert.ok(after.left.every(Number.isFinite));
const invalid = { ...sine, values: [NaN, 1, 0, 0] };
await processor.port.onmessage({ data: { type: 'partials', requestId: 2, ...invalid } });
assert.deepEqual(messages.at(-1), { type: 'partials-applied', requestId: 2, accepted: false });
assert.ok(render().left.some((value) => Math.abs(value) > .005), 'rejected upload preserves previous partials');

await processor.port.onmessage({ data: { type: 'parameter', nodeId: 2, id: 4, value: 4 } });
await processor.port.onmessage({ data: { type: 'parameter', nodeId: 2, id: 3, value: 1 } });
for (let index = 0; index < 16; index++) render();
const spread = render();
assert.ok(spread.left.some((value, index) => Math.abs(value - spread.right[index]) > .0001), 'unison spread must produce stereo difference');
console.log('Sine bank AudioWorklet: initial audio, centered mono, live upload, atomic rejection, and stereo unison passed');

const base = 'web/public/reference/sine-bank';
const manifest = JSON.parse(readFileSync(`${base}/manifest.json`, 'utf8'));
const inputBytes = readFileSync(`${base}/${manifest.input}`);
const input = new Float32Array(inputBytes.buffer, inputBytes.byteOffset, inputBytes.byteLength / 4);
for (const selected of manifest.cases) {
  messages.length = 0;
  globalThis.currentFrame = 0;
  const reference = new Processor();
  const graph = {
    nodes: [{ id: 1, type: 'input.raw' }, { id: 2, type: 'sine-bank' }, { id: 3, type: 'output' }],
    connections: [{ from: 1, to: 2, inputPort: 0 }, { from: 2, to: 3, inputPort: 0 }],
    initialParameters: selected.before.map((value, id) => ({ nodeId: 2, id, value })),
  };
  await reference.port.onmessage({ data: { type: 'init', wasmBytes, graph,
    partials: { nodeId: 2, fundamental: 440, values: selected.partials } } });
  assert.deepEqual(messages.at(-1), { type: 'ready' });
  const expectedBytes = readFileSync(`${base}/${selected.output}`);
  const expected = new Float32Array(expectedBytes.buffer, expectedBytes.byteOffset, expectedBytes.byteLength / 4);
  let max = 0;
  for (let offset = 0; offset < manifest.frames; offset += selected.blockSize) {
    if (offset === manifest.stepFrame) {
      for (const [id, value] of selected.after.entries()) {
        await reference.port.onmessage({ data: { type: 'parameter', nodeId: 2, id, value } });
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
    reference.process([[left, right]], [[outLeft, outRight]]);
    for (let frame = 0; frame < count; frame++) {
      max = Math.max(max, Math.abs(outLeft[frame] - expected[(offset + frame) * 2]),
        Math.abs(outRight[frame] - expected[(offset + frame) * 2 + 1]));
    }
    globalThis.currentFrame += count;
  }
  assert.ok(max <= .00002, `${selected.id}: C++ ↔ AudioWorklet max ${max}`);
  console.log(`${selected.id}: C++ ↔ AudioWorklet max Δ ${max}`);
}
