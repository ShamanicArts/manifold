// Review instrumentation only. Allocate the tape before connecting audio.
// The callback copies into bounded storage, with no messages or new views.
class RuntimeReviewRecorder extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.tape = new Float32Array(options.processorOptions.tape);
    this.control = new Int32Array(options.processorOptions.control);
    this.cadence = new Int32Array(options.processorOptions.cadence);
    this.clockOriginUnixMs = options.processorOptions.clockOriginUnixMs;
  }
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    const frames = output[0].length;
    let cursor = Atomics.load(this.control, 0);
    const armed = Atomics.load(this.control, 1) === 1;
    const started = armed ? Date.now() : 0;
    const cursorStart = cursor;
    if (armed && cursor === 0) Atomics.store(this.control, 3, currentFrame);
    for (let frame = 0; frame < frames; frame++) {
      const left = input[0]?.[frame] ?? 0;
      const right = input[1]?.[frame] ?? left;
      output[0][frame] = left;
      output[1][frame] = right;
      if (armed && cursor * 2 + 1 < this.tape.length) {
        this.tape[cursor * 2] = left;
        this.tape[cursor * 2 + 1] = right;
        cursor++;
      } else if (armed) Atomics.store(this.control, 2, 1);
    }
    if (armed) {
      Atomics.store(this.control, 0, cursor);
      Atomics.store(this.control, 4, currentFrame + frames);
      const count = Atomics.load(this.control, 5);
      const row = count * 5;
      if (row + 4 < this.cadence.length) {
        this.cadence[row] = currentFrame;
        this.cadence[row + 1] = cursorStart;
        this.cadence[row + 2] = started - this.clockOriginUnixMs;
        this.cadence[row + 3] = Date.now() - started;
        this.cadence[row + 4] = frames;
        Atomics.store(this.control, 5, count + 1);
      } else Atomics.store(this.control, 6, 1);
    }
    return true;
  }
}
registerProcessor('manifold-runtime-review-recorder', RuntimeReviewRecorder);
