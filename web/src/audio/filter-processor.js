/** Audio callback adapter only. The prepared Rust/Wasm graph owns DSP. */
class ManifoldProjectProcessor extends AudioWorkletProcessor {
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
          if (engine.manifold_version() !== 2) throw new Error('Incompatible graph module');
          const kinds = { 'input.raw': 0, 'input.monitor': 1, constant: 2, gain: 3, sum2: 4, 'linear-blend': 5, svf: 6, output: 7, crossfader: 8, mixer: 9, 'voice-synth': 10, oscillator: 11, adsr: 12, noise: 13, lfo: 14, 'modulated-gain': 15, 'modulated-svf': 16, distortion: 17, 'stereo-delay': 18, 'effect-slot': 19, 'loop-capture': 20, 'spectrum-analyzer': 21, 'envelope-follower': 22, 'envelope-control': 23, compressor: 24, limiter: 25, 'sample-region': 26, 'sample-instrument': 27, 'fft-spectrum': 28, 'slew-audio': 29, 'slew-control': 30 };
          const graph = data.graph;
          if (engine.manifold_graph_begin(graph.nodes.length, graph.connections.length) !== 1) throw new Error('Graph too large');
          for (const node of graph.nodes) {
            if (!(node.type in kinds) || engine.manifold_graph_node(node.id, kinds[node.type], node.a ?? 0, node.b ?? 0) !== 1) {
              throw new Error(`Invalid graph node: ${node.id}`);
            }
          }
          for (const edge of graph.connections) {
            if (engine.manifold_graph_edge(edge.from, edge.to, edge.inputPort) !== 1) throw new Error('Invalid graph connection');
          }
          for (const parameter of graph.initialParameters ?? []) {
            if (engine.manifold_graph_initial_parameter(parameter.nodeId, parameter.id, parameter.value) !== 1) {
              throw new Error(`Invalid initial parameter: ${parameter.nodeId}/${parameter.id}`);
            }
          }
          if (engine.manifold_prepare(sampleRate, this.capacity) !== 1) throw new Error('Graph preparation failed');
          if (data.sample) {
            const { nodeId, sourceRate, stereo } = data.sample;
            const frames = stereo.length / 2;
            if (engine.manifold_sample_begin(nodeId, frames, sourceRate) !== 1) throw new Error('Sample preparation failed');
            const ptr = engine.manifold_sample_ptr();
            if (!ptr) throw new Error('Sample storage unavailable');
            new Float32Array(engine.memory.buffer, ptr, stereo.length).set(stereo);
            if (engine.manifold_sample_commit() !== 1) throw new Error('Sample loading failed');
          }
          this.inputView = new Float32Array(engine.memory.buffer, engine.manifold_input_ptr(), this.capacity * 2);
          this.outputView = new Float32Array(engine.memory.buffer, engine.manifold_output_ptr(), this.capacity * 2);
          this.engine = engine;
          this.port.postMessage({ type: 'ready' });
        } else if (data.type === 'parameter' && this.engine) {
          this.engine.manifold_set_node_parameter(data.nodeId, data.id, data.value);
        } else if (data.type === 'event' && this.engine) {
          const { nodeId, offset = 0, kind, channel = 0, note = 0, velocity = 0 } = data;
          if (this.engine.manifold_event_push(nodeId, offset, kind, channel, note, velocity) !== 1) {
            throw new Error('Event queue rejected note event');
          }
        } else if (data.type === 'meter-request' && this.engine) {
          const count = Math.min(33, Math.max(1, data.count ?? 8));
          const values = Array.from({ length: count }, (_, band) => this.engine.manifold_get_node_meter(data.nodeId, band));
          this.port.postMessage({ type: 'meters', nodeId: data.nodeId, values });
        } else if (data.type === 'capture-request' && this.engine) {
          const frames = this.engine.manifold_capture_length(data.nodeId);
          if (!frames) {
            this.port.postMessage({ type: 'capture-error', message: 'Stop recording a take before sending it to the sampler.' });
            return;
          }
          const stereo = new Float32Array(frames * 2);
          for (let offset = 0; offset < frames;) {
            const count = Math.min(this.capacity, frames - offset);
            const copied = this.engine.manifold_capture_copy(data.nodeId, offset, count);
            if (copied !== count) throw new Error('Captured take changed during export');
            stereo.set(new Float32Array(this.engine.memory.buffer, this.engine.manifold_output_ptr(), copied * 2), offset * 2);
            offset += copied;
          }
          this.port.postMessage({ type: 'capture', nodeId: data.nodeId, sourceRate: sampleRate, stereo }, [stereo.buffer]);
        }
      } catch (error) {
        this.port.postMessage({ type: data.type === 'capture-request' ? 'capture-error' : 'error', message: String(error) });
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

registerProcessor('manifold-project', ManifoldProjectProcessor);
