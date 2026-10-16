// Experimental: compile/resources in Worker; same Rust DSP on audio thread.
// No module instantiation or graph preparation during live edits.
const CAPACITY = 2048;
class PreparedManifoldPrototype extends AudioWorkletProcessor {
  constructor(options) {
    super(); this.active = null; this.pending = null; this.inProcess = false;
    this.processAllocations = 0; this.processDeallocations = 0;
    this.memory = options.processorOptions.memory;
    this.control = new Int32Array(options.processorOptions.control);
    this.wasm = new WebAssembly.Instance(options.processorOptions.module, { env: {
      memory: this.memory,
      manifold_allocation_probe: kind => {
        if (this.inProcess) {
          if (kind === 1) this.processAllocations++;
          else this.processDeallocations++;
        }
      },
    } }).exports;
    const tls = this.wasm.manifold_prepared_allocate(this.wasm.__tls_size.value, this.wasm.__tls_align.value);
    if (!tls) throw new Error('Audio TLS allocation failed');
    this.wasm.__wasm_init_tls(tls);
    const stack = this.wasm.manifold_prepared_allocate(1048576, 16);
    if (!stack) throw new Error('Audio stack allocation failed');
    this.wasm.__stack_pointer.value = stack + 1048576;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'publish') {
        this.pending = { ...data, input: new Float32Array(this.memory.buffer, data.inputPtr, CAPACITY * 4),
          output: new Float32Array(this.memory.buffer, data.outputPtr, CAPACITY * 2) };
      } else if (data.type === 'parameter') {
        const accepted = this.active && this.wasm.manifold_prepared_parameter(this.active.handle, data.nodeId, data.id, data.value);
        this.port.postMessage({ type: 'parameter', requestId: data.requestId, accepted: Boolean(accepted) });
      } else if (data.type === 'close') {
        this.active = null; this.pending = null;
        this.port.postMessage({ type: 'closed', requestId: data.requestId });
      } else if (data.type === 'allocation-probe') {
        // Negative control in a separate, disposable verification instance.
        this.probeAllocation = true;
      }
    };
    this.port.postMessage({ type: 'initialized' });
  }
  process(inputs, outputs) {
    const output = outputs[0]; if (!output?.[0]) return true;
    this.inProcess = true;
    if (this.probeAllocation) {
      this.wasm.manifold_prepared_probe_allocation();
      this.probeAllocation = false;
    }
    if (this.pending) {
      const previous = this.active;
      const next = this.pending;
      const transferred = previous ? this.wasm.manifold_prepared_transfer(next.handle, previous.handle) : 0;
      this.active = next; this.pending = null;
      Atomics.store(this.control, 2, previous?.handle ?? 0);
      Atomics.store(this.control, 4, transferred);
      Atomics.store(this.control, 1, next.requestId);
    }
    const active = this.active;
    const frames = output[0].length;
    if (!active || frames > CAPACITY) {
      for (let channel = 0; channel < output.length; channel++) output[channel].fill(0);
    } else {
      const main = inputs[0], side = inputs[1];
      for (let frame = 0; frame < frames; frame++) {
        active.input[frame] = main?.[0]?.[frame] ?? 0;
        active.input[CAPACITY + frame] = (main?.[1] ?? main?.[0])?.[frame] ?? 0;
        active.input[CAPACITY * 2 + frame] = side?.[0]?.[frame] ?? 0;
        active.input[CAPACITY * 3 + frame] = (side?.[1] ?? side?.[0])?.[frame] ?? 0;
      }
      if (this.wasm.manifold_prepared_process(active.handle, frames) !== 1) Atomics.add(this.control, 3, 1);
      for (let frame = 0; frame < frames; frame++) {
        output[0][frame] = active.output[frame];
        if (output[1]) output[1][frame] = active.output[CAPACITY + frame];
      }
    }
    this.inProcess = false;
    Atomics.add(this.control, 0, 1);
    Atomics.store(this.control, 5, this.processAllocations);
    Atomics.store(this.control, 6, this.processDeallocations);
    return true;
  }
}
registerProcessor('manifold-prepared-prototype', PreparedManifoldPrototype);
