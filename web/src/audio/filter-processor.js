/** Audio callback adapter only. DSP is in the Rust/Wasm module. */
class ManifoldFilterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = null;
    this.inputView = null;
    this.outputView = null;
    this.capacity = 2048;
    this.port.onmessage = async ({ data }) => {
      try {
        if (data.type === 'init') {
          const module = await WebAssembly.compile(data.wasmBytes);
          const instance = await WebAssembly.instantiate(module, {});
          const engine = instance.exports;
          if (engine.manifold_version() !== 1 || engine.manifold_prepare(sampleRate, this.capacity) !== 1) {
            throw new Error('Incompatible filter module or sample rate');
          }
          this.inputView = new Float32Array(engine.memory.buffer, engine.manifold_input_ptr(), this.capacity * 2);
          this.outputView = new Float32Array(engine.memory.buffer, engine.manifold_output_ptr(), this.capacity * 2);
          this.engine = engine;
          this.port.postMessage({ type: 'ready' });
        } else if (data.type === 'parameter' && this.engine) {
          this.engine.manifold_set_parameter(data.id, data.value);
        }
      } catch (error) {
        this.port.postMessage({ type: 'error', message: String(error) });
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const frames = output[0].length;
    if (!this.engine || frames > this.capacity) {
      for (const channel of output) channel.fill(0);
      return true;
    }
    const input = inputs[0] || [];
    const left = input[0];
    const right = input[1] || left;
    const buffer = this.inputView;
    for (let frame = 0; frame < frames; frame++) {
      buffer[frame] = left ? left[frame] : 0;
      buffer[this.capacity + frame] = right ? right[frame] : 0;
    }
    if (this.engine.manifold_process(frames) !== 1) {
      for (const channel of output) channel.fill(0);
      return true;
    }
    const result = this.outputView;
    for (let frame = 0; frame < frames; frame++) {
      output[0][frame] = result[frame];
      if (output[1]) output[1][frame] = result[this.capacity + frame];
    }
    return true;
  }
}

registerProcessor('manifold-filter', ManifoldFilterProcessor);
