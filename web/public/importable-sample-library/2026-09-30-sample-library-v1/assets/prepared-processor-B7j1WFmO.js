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
    this.eventCapacity = 256; this.eventCount = 0; this.renderQuantum = 128;
    this.eventNodes = new Array(this.eventCapacity).fill(null);
    this.eventOffsets = new Uint32Array(this.eventCapacity);
    this.eventKinds = new Uint8Array(this.eventCapacity);
    this.eventChannels = new Uint8Array(this.eventCapacity);
    this.eventNotes = new Uint8Array(this.eventCapacity);
    this.eventVelocities = new Uint8Array(this.eventCapacity);
    this.wasm = new WebAssembly.Instance(options.processorOptions.module, { env: {
      memory: this.memory, manifold_allocation_probe: kind => {
        if (this.inProcess) { if (kind === 1) this.processAllocations++; else this.processDeallocations++; }
      },
    } }).exports;
    if (this.wasm.memory !== this.memory || this.wasm.manifold_version?.() !== 5
      || this.wasm.manifold_prepared_version?.() !== 4) throw new Error('Incompatible shared prepared graph module');
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
        } else if (data.type === 'events') {
          try {
            if (!this.active || !Array.isArray(data.events) || !data.events.length || data.events.length > this.eventCapacity) throw new Error('Invalid event batch');
            const resolved = data.events.map(event => {
              if (![event.nodeId,event.kind,event.channel,event.note,event.velocity,event.offset].every(Number.isInteger)
                || event.kind < 0 || event.kind > 3 || event.channel < 0 || event.channel > 15
                || event.note < 0 || event.note > 127 || event.velocity < 0 || event.velocity > 127
                || event.offset < 0 || event.offset >= this.renderQuantum) throw new Error('Invalid next-block event');
              const node = this.resolveEventNode(event);
              if (!node || this.wasm.manifold_prepared_accepts_events(this.active.handle, node.id) !== 1) throw new Error('Event instance no longer exists');
              return { ...event, node };
            });
            const stops = resolved.filter(event => event.kind === 2);
            const cancelled = this.eventNodes.slice(0, this.eventCount).filter(node => stops.some(stop => this.sameEventNode(node, stop.node))).length;
            if (this.eventCount - cancelled + resolved.length > this.eventCapacity) throw new Error('Prepared event queue is full');
            // Stop clears previously admitted future events for this instance.
            // The new atomic batch can explicitly schedule a subsequent onset.
            let retained = 0;
            for (let index = 0; index < this.eventCount; index++) {
              if (stops.some(stop => this.sameEventNode(this.eventNodes[index], stop.node))) continue;
              this.copyEvent(retained++, index);
            }
            for (let index = retained; index < this.eventCount; index++) this.eventNodes[index] = null;
            this.eventCount = retained;
            for (const event of resolved) {
              let index = this.eventCount;
              while (index > 0 && this.eventOffsets[index - 1] > event.offset) { this.copyEvent(index, index - 1); index--; }
              this.eventNodes[index] = event.node; this.eventOffsets[index] = event.offset;
              this.eventKinds[index] = event.kind; this.eventChannels[index] = event.channel;
              this.eventNotes[index] = event.note; this.eventVelocities[index] = event.velocity; this.eventCount++;
            }
            Atomics.add(this.control, 11, resolved.length); Atomics.add(this.control, 13, cancelled);
            Atomics.store(this.control, 15, this.eventCount);
            this.port.postMessage({ type: 'events-admitted', requestId: data.requestId,
              admittedEvents: resolved.length, pendingEvents: this.eventCount, publicationId: this.active.requestId });
          } catch (error) { Atomics.add(this.control, 14, Array.isArray(data.events) ? data.events.length : 1); throw error; }
        } else if (data.type === 'capture-cursor') {
          if (!this.active) throw new Error('Graph host is not ready');
          const startOffset = this.wasm.manifold_prepared_capture_cursor(this.active.handle, data.nodeId, 0);
          const capacity = this.wasm.manifold_prepared_capture_cursor(this.active.handle, data.nodeId, 1);
          if (startOffset === 0xffffffff || capacity === 0xffffffff) throw new Error('Target is not a retrospective capture');
          this.port.postMessage({ type: 'capture-cursor', requestId: data.requestId, startOffset, capacity });
        } else if (data.type === 'loop-info') {
          if (!this.active) throw new Error('Graph host is not ready');
          const frames = this.wasm.manifold_prepared_loop_length(this.active.handle, data.nodeId);
          if (frames === 0xffffffff) throw new Error('Stop recording and overdub before saving a loop');
          const revision = this.wasm.manifold_prepared_loop_revision(this.active.handle, data.nodeId);
          this.port.postMessage({ type: 'loop-info', requestId: data.requestId, publicationId: this.active.requestId, frames, revision });
        } else if (data.type === 'loop-copy') {
          const active = this.active;
          if (!active || active.requestId !== data.publicationId
            || this.wasm.manifold_prepared_loop_revision(active.handle, data.nodeId) !== data.revision
            || this.wasm.manifold_prepared_loop_length(active.handle, data.nodeId) === 0xffffffff) throw new Error('Loop changed during snapshot');
          if (!Number.isInteger(data.frames) || data.frames < 1 || data.frames > CAPACITY
            || !Number.isInteger(data.offset) || data.offset < 0
            || this.wasm.manifold_prepared_loop_copy(active.handle, data.nodeId, data.offset, data.frames) !== data.frames) throw new Error('Invalid loop snapshot chunk');
          const stereo = active.output.slice(0, data.frames * 2);
          this.port.postMessage({ type: 'loop-copy', requestId: data.requestId, stereo }, [stereo.buffer]);
        } else if (data.type === 'midi-trace') {
          if (!this.active) throw new Error('Graph host is not ready');
          const count = this.wasm.manifold_prepared_midi_trace_count(this.active.handle), entries = [];
          for (let index = 0; index < count; index++) {
            const fields = Array.from({ length: 8 }, (_, field) => this.wasm.manifold_prepared_midi_trace_field(this.active.handle, index, field));
            entries.push({ sequence: fields[0], nodeId: fields[1], offset: fields[2], kind: fields[3],
              channel: fields[4], note: fields[5], velocity: fields[6], emitted: fields[7] === 1 });
          }
          this.port.postMessage({ type: 'midi-trace', requestId: data.requestId, publicationId: this.active.requestId, entries });
        } else if (data.type === 'route') {
          if (!this.active || this.active.requestId !== data.revision) throw new Error('Graph changed before route command');
          if (this.wasm.manifold_prepared_route(this.active.handle, data.to, data.inputPort, data.from ?? 0, data.outputPort ?? 0) !== 1) throw new Error('Rust rejected route');
          this.port.postMessage({ type: 'route-applied', requestId: data.requestId });
        } else if (data.type === 'close') {
          Atomics.add(this.control, 13, this.eventCount); Atomics.store(this.control, 15, 0);
          this.eventCount = 0; this.eventNodes.fill(null);
          this.active = null; this.pending = null; this.closed = true;
          this.wasm = null; this.memory = null;
          this.port.postMessage({ type: 'closed', requestId: data.requestId });
        }
      } catch (error) { this.port.postMessage({ type: 'error', requestId: data.requestId, message: String(error) }); }
    };
    this.port.postMessage({ type: 'initialized' });
  }
  sameEventNode(a, b) {
    return a.type === b.type && (a.path !== null ? a.path === b.path : b.path === null && a.id === b.id);
  }
  resolveEventNode(event) {
    const nodes = this.active?.nodes;
    if (!nodes) return null;
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      if (node.type === event.targetType && (event.path !== null ? node.path === event.path : node.path === null && node.id === event.nodeId)) return node;
    }
    return null;
  }
  copyEvent(to, from) {
    this.eventNodes[to] = this.eventNodes[from]; this.eventOffsets[to] = this.eventOffsets[from];
    this.eventKinds[to] = this.eventKinds[from]; this.eventChannels[to] = this.eventChannels[from];
    this.eventNotes[to] = this.eventNotes[from]; this.eventVelocities[to] = this.eventVelocities[from];
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
    this.renderQuantum = frames; Atomics.store(this.control, 17, frames);
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
      let admitted = 0, lastOffset = 0;
      for (let index = 0; index < this.eventCount; index++) {
        const identity = this.eventNodes[index];
        let node = null;
        // No closure or transient event object is constructed in process().
        for (let target = 0; target < active.nodes.length; target++) {
          if (this.sameEventNode(identity, active.nodes[target])) { node = active.nodes[target]; break; }
        }
        if (node && this.wasm.manifold_prepared_event_push(active.handle, node.id, this.eventOffsets[index],
          this.eventKinds[index], this.eventChannels[index], this.eventNotes[index], this.eventVelocities[index], frames) === 1) {
          admitted++; lastOffset = this.eventOffsets[index];
        } else Atomics.add(this.control, 13, 1);
        this.eventNodes[index] = null;
      }
      this.eventCount = 0; Atomics.store(this.control, 15, 0);
      if (this.wasm.manifold_prepared_process(active.handle, frames) !== 1) {
        Atomics.add(this.control, 3, 1); Atomics.add(this.control, 13, admitted);
      } else if (admitted) {
        Atomics.add(this.control, 12, admitted); Atomics.store(this.control, 16, currentFrame + lastOffset);
      }
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
