import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { renderWasm } from '../web/src/reference/comparison.js';

const base = 'web/public/reference/resonator';
const manifest = JSON.parse(readFileSync(`${base}/manifest.json`, 'utf8'));
const inputBytes = readFileSync(`${base}/${manifest.input}`);
const input = new Float32Array(inputBytes.buffer, inputBytes.byteOffset, inputBytes.byteLength / 4);
const module = await WebAssembly.compile(readFileSync('web/public/manifold_filter.wasm'));
const { exports: engine } = await WebAssembly.instantiate(module, {});
const metrics = [];
for (const selected of manifest.cases) {
  const expectedBytes = readFileSync(`${base}/${selected.output}`);
  const expected = new Float32Array(expectedBytes.buffer, expectedBytes.byteOffset, expectedBytes.byteLength / 4);
  const rendered = renderWasm(engine, 'resonator', manifest, input, selected);
  assert.equal(rendered.length, expected.length);
  let max = 0;
  let sum = 0;
  for (let index = 0; index < rendered.length; index++) {
    const delta = rendered[index] - expected[index];
    assert.ok(Number.isFinite(delta), `${selected.id} sample ${index} is non-finite`);
    max = Math.max(max, Math.abs(delta));
    sum += delta * delta;
  }
  const result = { case: selected.id, frames: manifest.frames, blockSize: selected.blockSize,
    max, rms: Math.sqrt(sum / rendered.length) };
  assert.ok(max <= .0002, `${selected.id}: C++ ↔ Wasm max ${max}`);
  metrics.push(result);
  console.log(JSON.stringify(result));
}
writeFileSync('artifacts/reviews/checkpoint-103-resonator-metrics.json', `${JSON.stringify(metrics, null, 2)}\n`);
