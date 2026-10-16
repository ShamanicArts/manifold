// Two worker-owned graph engines share one preallocated audio bridge.
export const RING_BLOCKS = 16;
export const MAX_FRAMES = 2048;
export const OUTPUT_LATENCY_BLOCKS = 4;
export const PUBLISH_REQUEST_WORD = 5 + 2 * RING_BLOCKS;
export const CONTROL_WORDS = PUBLISH_REQUEST_WORD + 1;
export const BRIDGE_DIAGNOSTIC_WORDS = 8;
export const BRIDGE_MISS_RECORDS = 64;
export const BRIDGE_MISS_WORDS = 9;
export const WORKER_TIMING_SAMPLES = 4096;
export const EVENT_CAPACITY = 256;
export const EVENT_WORDS = 6;
export const EVENT_WORDS_PER_WORKER = 2 + EVENT_CAPACITY * EVENT_WORDS;
export const LIVE_RECORD_BYTES = 48;

export function allocateGraphTransport() {
  return {
    control: new SharedArrayBuffer(CONTROL_WORDS * Int32Array.BYTES_PER_ELEMENT),
    // Desired generation per slot, followed by each slot's finished generation.
    workerEpochs: new SharedArrayBuffer(4 * Int32Array.BYTES_PER_ELEMENT),
    bridgeDiagnostics: new SharedArrayBuffer(BRIDGE_DIAGNOSTIC_WORDS * Int32Array.BYTES_PER_ELEMENT),
    bridgeMisses: new SharedArrayBuffer((1 + BRIDGE_MISS_RECORDS * BRIDGE_MISS_WORDS) * Int32Array.BYTES_PER_ELEMENT),
    counts: new SharedArrayBuffer(RING_BLOCKS * Int32Array.BYTES_PER_ELEMENT),
    input: new SharedArrayBuffer(RING_BLOCKS * MAX_FRAMES * 4 * Float32Array.BYTES_PER_ELEMENT),
    output: new SharedArrayBuffer(2 * RING_BLOCKS * MAX_FRAMES * 2 * Float32Array.BYTES_PER_ELEMENT),
    events: new SharedArrayBuffer(2 * EVENT_WORDS_PER_WORKER * Int32Array.BYTES_PER_ELEMENT),
    liveStateTags: new SharedArrayBuffer(5 * Int32Array.BYTES_PER_ELEMENT),
    workerTiming: new SharedArrayBuffer(2 * (2 + WORKER_TIMING_SAMPLES) * Int32Array.BYTES_PER_ELEMENT),
    workerServiceTiming: new SharedArrayBuffer(2 * (2 + WORKER_TIMING_SAMPLES) * Int32Array.BYTES_PER_ELEMENT),
  };
}
