import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateGraphTransport, RING_BLOCKS, MAX_FRAMES, PUBLISH_REQUEST_WORD } from '../../packages/manifold-author/worker-transport.js';
let Worklet;
globalThis.AudioWorkletProcessor = class { constructor() { this.port = { onmessage: null }; } };
globalThis.registerProcessor = (_name, processor) => { Worklet = processor; };
await import('../../packages/manifold-author/shared-graph-processor.js');

function ready(transport, slot, sequence, value) {
  const index = sequence % RING_BLOCKS;
  const output = new Float32Array(transport.output);
  const base = (slot * RING_BLOCKS + index) * MAX_FRAMES * 2;
  output.fill(value, base, base + MAX_FRAMES * 2);
  Atomics.store(new Int32Array(transport.counts), index, 128);
  Atomics.store(new Int32Array(transport.control), 5 + slot * RING_BLOCKS + index, sequence);
}
function render(worklet) {
  const left = new Float32Array(128);
  const right = new Float32Array(128);
  assert.equal(worklet.process([[], []], [[left, right]]), true);
  return left;
}

test('candidate progress cannot publish a graph with a hole in its next audible block', () => {
  const transport = allocateGraphTransport();
  const control = new Int32Array(transport.control);
  const worklet = new Worklet();
  worklet.port.onmessage({ data: { type: 'init', transport } });
  worklet.sequence = 10;
  worklet.audibleStarted = true;
  ready(transport, 0, 7, 0.25);
  ready(transport, 1, 8, 0.625);
  // Preparation restored history from a recent input block and produced newer
  // output, but never rendered target 7. Progress-only warmup accepts this case.
  Atomics.store(control, 2, 8);
  Atomics.store(control, PUBLISH_REQUEST_WORD, 2);
  assert.ok(render(worklet).every(value => value === 0.25));
  assert.equal(Atomics.load(control, 3), 0);
  assert.equal(Atomics.load(control, PUBLISH_REQUEST_WORD), 2);
  assert.equal(Atomics.load(control, 4), 0);
  ready(transport, 0, 8, 0.25);
  assert.ok(render(worklet).every(value => value === 0.625));
  assert.equal(Atomics.load(control, 3), 1);
  assert.equal(Atomics.load(control, PUBLISH_REQUEST_WORD), 0);
  assert.equal(Atomics.load(control, 4), 0);
});

test('a ring tag for another cycle cannot acknowledge graph publication', () => {
  const transport = allocateGraphTransport();
  const control = new Int32Array(transport.control);
  const worklet = new Worklet();
  worklet.port.onmessage({ data: { type: 'init', transport } });
  worklet.sequence = 10;
  worklet.audibleStarted = true;
  ready(transport, 0, 7, 0.25);
  ready(transport, 1, 7 + RING_BLOCKS, 0.625);
  Atomics.store(control, 2, 7 + RING_BLOCKS);
  Atomics.store(control, PUBLISH_REQUEST_WORD, 2);
  assert.ok(render(worklet).every(value => value === 0.25));
  assert.equal(Atomics.load(control, 3), 0);
  assert.equal(Atomics.load(control, 4), 0);
  // A timeout/cancellation retains the previously audible graph.
  Atomics.store(control, PUBLISH_REQUEST_WORD, 0);
  ready(transport, 0, 8, 0.25);
  ready(transport, 1, 8, 0.625);
  assert.ok(render(worklet).every(value => value === 0.25));
  assert.equal(Atomics.load(control, 3), 0);
});

test('bounded callback diagnostics distinguish a late worker from a missing output block', () => {
  const transport = allocateGraphTransport();
  const control = new Int32Array(transport.control);
  const diagnostics = new Int32Array(transport.bridgeDiagnostics);
  const misses = new Int32Array(transport.bridgeMisses);
  const worklet = new Worklet();
  worklet.port.onmessage({ data: { type: 'init', transport } });
  worklet.sequence = 10;
  worklet.audibleStarted = true;
  Atomics.store(control, 1, 6); // target 7 has not been processed yet
  render(worklet);
  assert.equal(Atomics.load(diagnostics, 4), 1);
  assert.deepEqual(Array.from(misses.slice(1, 10)), [1, 11, 7, 0, 0, 6, 1, 0, 0]);
  Atomics.store(control, 1, 9); // ahead of target 8, but no output at that tag
  render(worklet);
  assert.equal(Atomics.load(diagnostics, 5), 1);
  assert.equal(Atomics.load(diagnostics, 4), 1);
  assert.deepEqual(Array.from(misses.slice(10, 19)), [2, 12, 8, 0, 0, 9, 2, 0, 0]);
  for (let i = 0; i < 70; i++) render(worklet);
  assert.equal(Atomics.load(control, 4), 72);
  assert.equal(Atomics.load(misses, 0), 72);
  assert.equal(misses.length, 1 + 64 * 9);
  const last = 1 + 7 * 9;
  assert.equal(Atomics.load(misses, last), 72);
  assert.equal(Atomics.load(misses, last + 1), 82);
});
