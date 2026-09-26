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
          const kinds = { 'input.raw': 0, 'input.monitor': 1, constant: 2, gain: 3, sum2: 4, 'linear-blend': 5, svf: 6, output: 7, crossfader: 8, mixer: 9, 'voice-synth': 10, oscillator: 11, adsr: 12, noise: 13, lfo: 14, 'modulated-gain': 15, 'modulated-svf': 16, distortion: 17, 'stereo-delay': 18, 'effect-slot': 19 };
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

registerProcessor('manifold-project', ManifoldProjectProcessor);
