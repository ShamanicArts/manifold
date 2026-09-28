import assert from 'node:assert/strict';

globalThis.AudioWorkletProcessor = class {};
globalThis.registerProcessor = () => {};
const { captureStripBins } = await import('../web/src/audio/main-looper-processor.js');

const bars = [1, .5, .25];
const bins = captured => captureStripBins(bars, 2, 1_000, 30_000, captured, 8);
assert.equal(captureStripBins(bars, 2, 1_000, 30_000, 250).length, 128);
assert.deepEqual(bins(0), Array(8).fill(null));
assert.deepEqual(bins(125), [null, null, null, null, [93, 125], [62, 93], [31, 62], [0, 31]]);
assert.deepEqual(bins(250), [[218, 250], [187, 218], [156, 187], [125, 156],
  [93, 125], [62, 93], [31, 62], [0, 31]]);
// A transient written at the start of capture enters on the right,
// travels left, then enters the adjacent older strip from its right edge.
const containsFirstTransient = (bin, captured) => bin && captured - bin[1] < 31 && captured - bin[0] > 0;
assert.equal(bins(125).findIndex(bin => containsFirstTransient(bin, 125)), 4);
assert.equal(bins(250).findIndex(bin => containsFirstTransient(bin, 250)), 0);
assert.equal(bins(500).some(bin => containsFirstTransient(bin, 500)), false);
const adjacent = captureStripBins(bars, 1, 1_000, 30_000, 500, 8);
assert.equal(adjacent.findIndex(bin => containsFirstTransient(bin, 500)), 0);
assert.equal(bins(500)[0][1], adjacent.at(-1)[0], 'neighboring strips share the 1/4-bar boundary');
// An older strip fills from the right edge next to its younger neighbor.
const enteringOlder = captureStripBins(bars, 1, 1_000, 30_000, 375, 8);
assert.deepEqual(enteringOlder.slice(0, 4), Array(4).fill(null));
assert.deepEqual(enteringOlder.slice(4), [[343, 375], [312, 343], [281, 312], [250, 281]]);
assert.equal(enteringOlder.at(-1)[0], 250);
console.log('Main capture strips: newest audio enters each strip at right, then moves left');
