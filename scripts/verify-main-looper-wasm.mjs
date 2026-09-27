import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const wasm = await readFile(new URL('../web/public/manifold_filter.wasm', import.meta.url));
const { instance } = await WebAssembly.instantiate(wasm, {});
const e = instance.exports;
assert.equal(e.manifold_looper_prepare(8_000, 128), 1);
const input = new Float32Array(e.memory.buffer, e.manifold_looper_input_ptr(), 256);
const output = new Float32Array(e.memory.buffer, e.manifold_looper_output_ptr(), 256);
function block(value) {
  input.fill(value);
  assert.equal(e.manifold_looper_process(128), 1);
  return output[0];
}
assert.equal(e.manifold_looper_command(0, 0), 1);
for (let i = 0; i < 125; i++) block(.25);
assert.equal(e.manifold_looper_command(1, 0), 1);
assert.equal(e.manifold_looper_status(10, 0), 1); // one bar
assert.ok(Math.abs(e.manifold_looper_status(0, 0) - 120) < .001);
for (let i = 0; i < 20; i++) block(0);
assert.ok(Math.abs(block(0) - .25) < .001);
assert.equal(e.manifold_looper_control(0, 1), 1);
for (let i = 0; i < 125; i++) block(.1);
assert.equal(e.manifold_looper_command(7, .25), 1);
for (let i = 0; i < 20; i++) block(0);
assert.equal(e.manifold_looper_status(8, 1), 4_000);
assert.ok(block(0) > .25);
console.log('Main looper Wasm: First Loop tempo/audio and second-layer retrospective audio passed');
