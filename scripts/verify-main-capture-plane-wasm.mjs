import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import project from '../projects/main-looper/project.json' with { type: 'json' };

globalThis.AudioWorkletProcessor = class {};
globalThis.registerProcessor = () => {};
const { captureStripBins } = await import('../web/src/audio/main-looper-processor.js');

const wasm = await readFile(new URL('../web/public/manifold_filter.wasm', import.meta.url));
const { instance } = await WebAssembly.instantiate(wasm, {});
const e = instance.exports;
assert.equal(e.manifold_looper_prepare(8_000, 128), 1);
const input = new Float32Array(e.memory.buffer, e.manifold_looper_input_ptr(), 256);
function feed(value, total) {
  for (let remaining = total; remaining > 0;) {
    const frames = Math.min(128, remaining);
    input.fill(value, 0, frames);
    input.fill(value, 128, 128 + frames);
    assert.equal(e.manifold_looper_process(frames), 1);
    remaining -= frames;
  }
}

// At 120 BPM and 8 kHz, 1/16 bar is 1,000 samples. The first 500 are
// loud and the newest 500 are quiet. Screen order must preserve that order.
feed(.8, 500);
feed(.1, 500);
const samplesPerBar = e.manifold_looper_status(project.status.samplesPerBar, 0);
const bins = captureStripBins(project.segments, 8, samplesPerBar, 8_000 * project.captureSeconds);
const peaks = bins.map(([start, end]) => e.manifold_looper_peak(0, 1, start, end));
assert.equal(peaks.length, 20);
assert.ok(peaks.slice(0, 9).every(value => Math.abs(value - .8) < .0001), `older bins: ${peaks}`);
assert.ok(peaks.slice(11).every(value => Math.abs(value - .1) < .0001), `newer bins: ${peaks}`);
assert.ok(captureStripBins(project.segments, 7, samplesPerBar, 8_000 * project.captureSeconds)
  .every(([start, end]) => e.manifold_looper_peak(0, 1, start, end) === 0));
assert.equal(e.manifold_looper_command(project.commands.commit, .0625), 1);
feed(0, 128); // bounded commit publishes on the next process block
const loopPeaks = Array.from({ length: 20 }, (_, bin) => e.manifold_looper_peak(0, 0, bin * 50, (bin + 1) * 50));
assert.ok(loopPeaks.slice(0, 9).every(value => Math.abs(value - .8) < .0001), `loop head: ${loopPeaks}`);
assert.ok(loopPeaks.slice(11).every(value => Math.abs(value - .1) < .0001), `loop tail: ${loopPeaks}`);
console.log('Main capture plane: oldest audio left, newest audio right, and committed loop head/tail in source order');
