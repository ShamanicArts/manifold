// Audio-thread ownership of explicitly prepared Rust engines. No live graph
// construction, module instantiation, resource allocation or retirement here.
const CAPACITY = 2048;
class ManifoldPreparedProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(); this.closed = false; this.active = null; this.pending = null; this.inProcess = false;
    this.processAllocations = 0; this.processDeallocations = 0;
    this.memory = options.processorOptions.memory;
    this.control = new Int32Array(options.processorOptions.control);
    this.batchOldValues = new Float32Array(16);
    this.wasm = new WebAssembly.Instance(options.processorOptions.module, { env: {
      memory: this.memory, manifold_allocation_probe: kind => {
        if (this.inProcess) { if (kind === 1) this.processAllocations++; else this.processDeallocations++; }
      },
    } }).exports;
    if (this.wasm.memory !== this.memory || this.wasm.manifold_version?.() !== 5
      || this.wasm.manifold_prepared_version?.() !== 1) throw new Error('Incompatible shared prepared graph module');
    const tls = this.wasm.manifold_prepared_allocate(this.wasm.__tls_size.value, this.wasm.__tls_align.value);
    if (!tls) throw new Error('Audio TLS allocation failed'); this.wasm.__wasm_init_tls(tls);
    const stack = this.wasm.manifold_prepared_allocate(1048576, 16);
    if (!stack) throw new Error('Audio stack allocation failed'); this.wasm.__stack_pointer.value = stack + 1048576;
    this.port.onmessage = ({ data }) => {
      try {
        if (this.closed && data.type !== 'close') throw new Error('Prepared audio owner is closed');
        if (data.type === 'publish') {
          if (this.pending) throw new Error('Another publication is pending');
          this.pending = { ...data,
            input: new Float32Array(this.memory.buffer, data.inputPtr, CAPACITY * 4),
            output: new Float32Array(this.memory.buffer, data.outputPtr, CAPACITY * 2),
            parameterControl: new Int32Array(data.parameterBank, 0, 1),
            parameterValues: new Float32Array(data.parameterBank, 4),
          };
          // Port handling is serialized with process(). A suspended host has
          // no callback to claim its candidate, so publish between calls here.
          if (data.allowIdle) this.publishPending();
        } else if (data.type === 'cancel-publication') {
          const cancelled = this.pending?.requestId === data.publicationId;
          if (cancelled) this.pending = null;
          this.port.postMessage({ type: 'cancelled', requestId: data.requestId, cancelled,
            published: this.active?.requestId === data.publicationId });
        } else if (data.type === 'parameter-batch') {
          const active = this.active;
          if (!active) throw new Error('Graph host is not ready');
          if (!Array.isArray(data.updates) || !data.updates.length || data.updates.length > 16) throw new Error('Invalid parameter batch');
          const resolved = data.updates.map(update => {
            const node = active.nodes.find(node => node.type === update.kind && (update.path !== null
              ? node.path === update.path : node.path === null && node.id === update.nodeId));
            if (!node) throw new Error('Parameter instance no longer exists');
            const endpoint = active.endpoints.find(entry => entry.nodeId === node.id && entry.id === update.id);
            if (endpoint && (update.value < endpoint.min || update.value > endpoint.max)) throw new Error('Value exceeds published parameter range');
            return { ...update, nodeId: node.id };
          });
          for (let index = 0; index < resolved.length; index++) {
            const update = resolved[index];
            if (!Number.isFinite(update.value) || resolved.slice(0,index).some(old => old.nodeId === update.nodeId && old.id === update.id)) throw new Error('Invalid or duplicate parameter');
            const old = this.wasm.manifold_prepared_parameter_target(active.handle, update.nodeId, update.id);
            if (!Number.isFinite(old)) throw new Error('Parameter target unavailable'); this.batchOldValues[index] = old;
          }
          let changed = 0;
          for (const update of resolved) {
            if (this.wasm.manifold_prepared_parameter(active.handle, update.nodeId, update.id, update.value) !== 1) {
              for (let index = 0; index < changed; index++) {
                const old = resolved[index];
                this.wasm.manifold_prepared_parameter(active.handle, old.nodeId, old.id, this.batchOldValues[index]);
              }
              throw new Error('Rust rejected parameter batch');
            }
            changed++;
          }
          this.publishParameters(active);
          this.port.postMessage({ type: 'parameters-applied', requestId: data.requestId });
        } else if (data.type === 'route') {
          if (!this.active || this.active.requestId !== data.revision) throw new Error('Graph changed before route command');
          if (this.wasm.manifold_prepared_route(this.active.handle, data.to, data.inputPort, data.from ?? 0, data.outputPort ?? 0) !== 1) throw new Error('Rust rejected route');
          this.port.postMessage({ type: 'route-applied', requestId: data.requestId });
        } else if (data.type === 'close') {
          this.active = null; this.pending = null; this.closed = true;
          this.wasm = null; this.memory = null;
          this.port.postMessage({ type: 'closed', requestId: data.requestId });
        }
      } catch (error) { this.port.postMessage({ type: 'error', requestId: data.requestId, message: String(error) }); }
    };
    this.port.postMessage({ type: 'initialized' });
  }
  publishParameters(active) {
    const sequence = (Atomics.load(active.parameterControl, 0) + 1) >>> 0;
    const base = (sequence % 2) * active.parameters.length;
    for (let index = 0; index < active.parameters.length; index++) {
      const parameter = active.parameters[index];
      active.parameterValues[base + index] = this.wasm.manifold_prepared_parameter_target(active.handle, parameter.nodeId, parameter.id);
    }
    Atomics.store(active.parameterControl, 0, sequence);
  }
  publishPending() {
    if (!this.pending) return;
    const previous = this.active, next = this.pending;
    const transferred = previous ? this.wasm.manifold_prepared_transfer(next.handle, previous.handle) : 0;
    this.active = next; this.pending = null;
    this.publishParameters(next);
    Atomics.store(this.control, 2, previous?.handle ?? 0);
    Atomics.store(this.control, 4, transferred);
    Atomics.store(this.control, 9, currentFrame);
    Atomics.add(this.control, 10, 1);
    Atomics.store(this.control, 1, next.requestId);
  }
  process(inputs, outputs) {
    if (this.closed) return false;
    const output = outputs[0]; if (!output?.[0]) return true;
    this.inProcess = true; this.publishPending();
    const active = this.active, frames = output[0].length;
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
      Atomics.add(this.control, 8, 1);
      for (let frame = 0; frame < frames; frame++) {
        output[0][frame] = active.output[frame]; if (output[1]) output[1][frame] = active.output[CAPACITY + frame];
      }
    }
    this.inProcess = false; Atomics.add(this.control, 0, 1);
    Atomics.store(this.control, 5, this.processAllocations); Atomics.store(this.control, 6, this.processDeallocations);
    return true;
  }
}
registerProcessor('manifold-prepared-graph', ManifoldPreparedProcessor);
