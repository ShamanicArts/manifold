import assert from 'node:assert/strict';

globalThis.AudioWorkletProcessor = class {};
globalThis.registerProcessor = () => {};
const { captureStripBins } = await import('../web/src/audio/main-looper-processor.js');

const bars = [1, .5, .25];
const bins = captured => captureStripBins(bars, 2, 1_000, 30_000, captured, 8);
assert.deepEqual(bins(0), Array(8).fill(null));
assert.deepEqual(bins(125), [[0, 31], [31, 62], [62, 93], [93, 125], null, null, null, null]);
assert.deepEqual(bins(250), [[0, 31], [31, 62], [62, 93], [93, 125],
  [125, 156], [156, 187], [187, 218], [218, 250]]);
// A transient written at the start of capture travels right, then
// leaves this younger strip once it ages into the adjacent older region.
const containsFirstTransient = (bin, captured) => bin && captured - bin[1] < 31 && captured - bin[0] > 0;
assert.equal(bins(125).findIndex(bin => containsFirstTransient(bin, 125)), 3);
assert.equal(bins(250).findIndex(bin => containsFirstTransient(bin, 250)), 7);
assert.equal(bins(500).some(bin => containsFirstTransient(bin, 500)), false);
const adjacent = captureStripBins(bars, 1, 1_000, 30_000, 500, 8);
assert.equal(adjacent.findIndex(bin => containsFirstTransient(bin, 500)), 7);
// When an older strip first receives audio, it grows from the left edge next
// to the younger strip. Empty space and silent PCM have no plotted waveform.
const enteringOlder = captureStripBins(bars, 1, 1_000, 30_000, 375, 8);
assert.deepEqual(enteringOlder.slice(0, 4), [[250, 281], [281, 312], [312, 343], [343, 375]]);
assert.deepEqual(enteringOlder.slice(4), Array(4).fill(null));
assert.equal(enteringOlder[0][0], 250);
console.log('Main capture strips: newest audio enters each strip at left, then moves right');
