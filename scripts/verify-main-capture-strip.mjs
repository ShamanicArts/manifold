import assert from 'node:assert/strict';

globalThis.AudioWorkletProcessor = class {};
globalThis.registerProcessor = () => {};
const { captureStripBins } = await import('../web/src/audio/main-looper-processor.js');

const bars = [1, .5, .25];
const bins = captured => captureStripBins(bars, 2, 1_000, 30_000, captured, 8);
assert.deepEqual(bins(0), Array(8).fill(null));
assert.deepEqual(bins(125), [[93, 125], [62, 93], [31, 62], [0, 31], null, null, null, null]);
assert.deepEqual(bins(250), [[218, 250], [187, 218], [156, 187], [125, 156],
  [93, 125], [62, 93], [31, 62], [0, 31]]);
// A transient written at the start of capture appears on the left, then
// leaves this younger strip once it ages into the adjacent older region.
const containsFirstTransient = (bin, captured) => bin && captured - bin[1] < 31 && captured - bin[0] > 0;
assert.equal(bins(125).findIndex(bin => containsFirstTransient(bin, 125)), 0);
assert.equal(bins(250).findIndex(bin => containsFirstTransient(bin, 250)), 0);
assert.equal(bins(500).some(bin => containsFirstTransient(bin, 500)), false);
const adjacent = captureStripBins(bars, 1, 1_000, 30_000, 500, 8);
assert.equal(adjacent.findIndex(bin => containsFirstTransient(bin, 500)), 0);
// When an older strip first receives audio, it grows from the right edge next
// to the younger strip. Empty space and silent PCM have no plotted waveform.
const enteringOlder = captureStripBins(bars, 1, 1_000, 30_000, 375, 8);
assert.deepEqual(enteringOlder.slice(0, 4), Array(4).fill(null));
assert.deepEqual(enteringOlder.slice(4), [[343, 375], [312, 343], [281, 312], [250, 281]]);
assert.equal(enteringOlder.at(-1)[0], 250);
console.log('Main capture strips: newest strip starts at left; older strips receive audio at right');
