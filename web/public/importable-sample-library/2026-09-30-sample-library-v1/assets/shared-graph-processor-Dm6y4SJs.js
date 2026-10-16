// Keep these ABI constants in sync with worker-transport.js. This file is
// self-contained because build tools may inline AudioWorklet URLs as data URLs.
const RING_BLOCKS = 16;
const MAX_FRAMES = 2048;
const OUTPUT_LATENCY_BLOCKS = 4;
const PUBLISH_REQUEST_WORD = 5 + 2 * RING_BLOCKS;
const BRIDGE_MISS_RECORDS = 64;
const BRIDGE_MISS_WORDS = 9;
const EMPTY_CHANNELS = [];

// The audio callback only copies fixed-size blocks and publishes integer cursors.
// Graph construction, Wasm allocation, and DSP happen in dedicated workers.
class ManifoldSharedGraphProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.control = null;
    this.counts = null;
    this.input = null;
    this.output = null;
    this.sequence = 0;
    this.activeSlot = 0;
    this.audibleStarted = false;
    this.diagnostics = null;
    this.misses = null;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'init') {
        this.control = new Int32Array(data.transport.control);
        this.diagnostics = new Int32Array(data.transport.bridgeDiagnostics);
        this.misses = new Int32Array(data.transport.bridgeMisses);
        this.counts = new Int32Array(data.transport.counts);
        this.input = new Float32Array(data.transport.input);
        this.output = new Float32Array(data.transport.output);
        Atomics.store(this.control, 3, 0);
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output?.[0]) return true;
    const frames = output[0].length;
    if (!this.control || frames > MAX_FRAMES) {
      for (let channel = 0; channel < output.length; channel++) output[channel].fill(0);
      return true;
    }
    const sequence = ++this.sequence;
    const target = sequence - OUTPUT_LATENCY_BLOCKS;
    const targetIndex = target % RING_BLOCKS;
    const requested = Atomics.load(this.control, PUBLISH_REQUEST_WORD);
    if (requested === 1 || requested === 2) {
      const candidateTag = 5 + (requested - 1) * RING_BLOCKS + targetIndex;
      // A progress cursor can skip a block when preparation restores recent
      // history. Publish only output the callback can actually play now.
      if (target > 0 && Atomics.load(this.control, candidateTag) === target
        && Atomics.load(this.counts, targetIndex) === frames) {
        if (Atomics.compareExchange(this.control, PUBLISH_REQUEST_WORD, requested, -requested) === requested) {
          this.activeSlot = requested - 1;
          Atomics.store(this.control, 3, this.activeSlot);
          Atomics.store(this.control, PUBLISH_REQUEST_WORD, 0);
          Atomics.add(this.diagnostics, 1, 1);
          Atomics.store(this.diagnostics, 2, target);
        }
      } else {
        Atomics.add(this.diagnostics, 0, 1);
      }
    }
    const ringIndex = sequence % RING_BLOCKS;
    const base = ringIndex * MAX_FRAMES * 4;
    const main = inputs[0] || EMPTY_CHANNELS;
    const side = inputs[1] || EMPTY_CHANNELS;
    const mainRight = main[1] || main[0];
    const sideRight = side[1] || side[0];
    for (let frame = 0; frame < frames; frame++) {
      this.input[base + frame] = main[0]?.[frame] ?? 0;
      this.input[base + MAX_FRAMES + frame] = mainRight?.[frame] ?? 0;
      this.input[base + MAX_FRAMES * 2 + frame] = side[0]?.[frame] ?? 0;
      this.input[base + MAX_FRAMES * 3 + frame] = sideRight?.[frame] ?? 0;
    }
    Atomics.store(this.counts, ringIndex, frames);
    Atomics.store(this.control, 0, sequence);
    Atomics.notify(this.control, 0);

    const tag = 5 + this.activeSlot * RING_BLOCKS + targetIndex;
    const rendered = Atomics.load(this.control, 1 + this.activeSlot);
    const lag = sequence - rendered;
    if (lag > Atomics.load(this.diagnostics, 3)) Atomics.store(this.diagnostics, 3, lag);
    const observed = target > 0 ? Atomics.load(this.control, tag) : 0;
    if (target > 0 && observed === target
      && Atomics.load(this.counts, targetIndex) === frames) {
      this.audibleStarted = true;
      const outBase = (this.activeSlot * RING_BLOCKS + targetIndex) * MAX_FRAMES * 2;
      for (let frame = 0; frame < frames; frame++) {
        output[0][frame] = this.output[outBase + frame];
        if (output[1]) output[1][frame] = this.output[outBase + MAX_FRAMES + frame];
      }
    } else {
      if (target > 0 && this.audibleStarted) {
        Atomics.add(this.control, 4, 1);
        const reason = observed === target ? 3 : rendered < target ? 1 : 2;
        Atomics.add(this.diagnostics, 3 + reason, 1);
        const event = Atomics.add(this.misses, 0, 1) + 1;
        const record = 1 + ((event - 1) % BRIDGE_MISS_RECORDS) * BRIDGE_MISS_WORDS;
        Atomics.store(this.misses, record, -event);
        Atomics.store(this.misses, record + 1, sequence);
        Atomics.store(this.misses, record + 2, target);
        Atomics.store(this.misses, record + 3, this.activeSlot);
        Atomics.store(this.misses, record + 4, observed);
        Atomics.store(this.misses, record + 5, rendered);
        Atomics.store(this.misses, record + 6, reason);
        Atomics.store(this.misses, record + 7, requested);
        Atomics.store(this.misses, record + 8, typeof currentFrame === 'number' ? currentFrame : 0);
        Atomics.store(this.misses, record, event);
      } else {
        Atomics.add(this.diagnostics, 7, 1);
      }
      for (let channel = 0; channel < output.length; channel++) output[channel].fill(0);
    }
    return true;
  }
}

registerProcessor('manifold-shared-graph', ManifoldSharedGraphProcessor);
