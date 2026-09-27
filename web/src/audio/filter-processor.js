/** Audio callback adapter only. The prepared Rust/Wasm graph owns DSP. */
class ManifoldProjectProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = null;
    this.inputView = null;
    this.outputView = null;
    this.capacity = 2048;
    this.eventCapacity = 256;
    this.pendingCount = 0;
    this.pendingFrame = new Float64Array(this.eventCapacity);
    this.pendingNode = new Uint32Array(this.eventCapacity);
    this.pendingKind = new Uint8Array(this.eventCapacity);
    this.pendingChannel = new Uint8Array(this.eventCapacity);
    this.pendingNote = new Uint8Array(this.eventCapacity);
    this.pendingVelocity = new Uint8Array(this.eventCapacity);
    this.eqResponse = new Float32Array(64);
    this.port.onmessage = async ({ data }) => {
      try {
        if (data.type === 'init') {
          this.pendingCount = 0;
          const module = await WebAssembly.compile(data.wasmBytes);
          const instance = await WebAssembly.instantiate(module, {});
          const engine = instance.exports;
          if (engine.manifold_version() !== 4) throw new Error('Incompatible graph module');
          const kinds = { 'input.raw': 0, 'input.monitor': 1, constant: 2, gain: 3, sum2: 4, 'linear-blend': 5, svf: 6, output: 7, crossfader: 8, mixer: 9, 'voice-synth': 10, oscillator: 11, adsr: 12, noise: 13, lfo: 14, 'modulated-gain': 15, 'modulated-svf': 16, distortion: 17, 'stereo-delay': 18, 'effect-slot': 19, 'loop-capture': 20, 'spectrum-analyzer': 21, 'envelope-follower': 22, 'envelope-control': 23, compressor: 24, limiter: 25, 'sample-region': 26, 'sample-instrument': 27, 'fft-spectrum': 28, 'slew-audio': 29, 'slew-control': 30, 'attenuverter-bias': 31, 'sample-hold': 32, 'cv-mix': 33, phaser: 34, chorus: 35, eq8: 36, waveshaper: 37, 'stereo-widener': 38, 'legacy-filter': 39, reverb: 40, multitap: 41, 'ring-modulator': 42, 'transient-shaper': 43, bitcrusher: 44, 'eq-node': 45, formant: 46, 'reverse-delay': 47, stutter: 48, 'pitch-shifter': 49, shimmer: 50, granulator: 51, 'effect-slot-legacy': 52, 'effect-slot-host-switch': 53, 'midi-input': 54, 'midi-transpose': 55, 'midi-note-filter': 56, 'midi-scale-quantizer': 57, 'midi-velocity-mapper': 58, 'midi-arpeggiator': 59, resonator: 60, 'sine-bank': 61, 'phase-vocoder': 62, 'phrase-gain': 63, 'main-voice-bank': 64, 'input.sidechain': 65, 'retrospective-capture': 66 };
          const graph = data.graph;
          const postPrepareParameters = [];
          const reachable = new Set(graph.nodes.filter((node) =>
            node.type === 'output' || node.type === 'retrospective-capture').map((node) => node.id));
          if (!graph.patchable) {
            let changed;
            do {
              changed = false;
              for (const edge of graph.connections) {
                if (reachable.has(edge.to) && !reachable.has(edge.from)) {
                  reachable.add(edge.from);
                  changed = true;
                }
              }
            } while (changed);
          }
          if (engine.manifold_graph_begin(graph.nodes.length, graph.connections.length) !== 1) throw new Error('Graph too large');
          if (graph.patchable && engine.manifold_graph_patchable(1) !== 1) throw new Error('Patchable graph unavailable');
          for (const node of graph.nodes) {
            if (!(node.type in kinds) || engine.manifold_graph_node(node.id, kinds[node.type], node.a ?? 0, node.b ?? 0) !== 1) {
              throw new Error(`Invalid graph node: ${node.id}`);
            }
          }
          for (const edge of graph.connections) {
            if (engine.manifold_graph_edge(edge.from, edge.to, edge.inputPort) !== 1) throw new Error('Invalid graph connection');
          }
          for (const parameter of graph.initialParameters ?? []) {
            if (!Number.isFinite(parameter.value)) throw new Error(`Invalid initial parameter: ${parameter.nodeId}/${parameter.id}`);
            if (engine.manifold_graph_initial_parameter(parameter.nodeId, parameter.id, parameter.value) !== 1) postPrepareParameters.push(parameter);
          }
          if (engine.manifold_prepare(sampleRate, this.capacity) !== 1) throw new Error('Graph preparation failed');
          for (const parameter of postPrepareParameters) {
            if (!graph.patchable && !reachable.has(parameter.nodeId)) continue;
            if (engine.manifold_set_node_parameter(parameter.nodeId, parameter.id, parameter.value) !== 1) {
              throw new Error(`Invalid initial parameter: ${parameter.nodeId}/${parameter.id}`);
            }
          }
          for (const { nodeId, sourceRate, stereo } of data.samples ?? (data.sample ? [data.sample] : [])) {
            const frames = stereo.length / 2;
            if (engine.manifold_sample_begin(nodeId, frames, sourceRate) !== 1) throw new Error('Sample preparation failed');
            const ptr = engine.manifold_sample_ptr();
            if (!ptr) throw new Error('Sample storage unavailable');
            new Float32Array(engine.memory.buffer, ptr, stereo.length).set(stereo);
            if (engine.manifold_sample_commit() !== 1) throw new Error('Sample loading failed');
          }
          if (graph.directional && engine.manifold_main_directional_configure(
            graph.directional.oscillatorId, graph.directional.sampleId) !== 1) {
            throw new Error('Main directional behavior preparation failed');
          }
          if (graph.directional?.vocoderId != null && engine.manifold_main_pitch_configure(
            graph.directional.vocoderId) !== 1) {
            throw new Error('Main pitch behavior preparation failed');
          }
          this.inputView = new Float32Array(engine.memory.buffer, engine.manifold_input_ptr(), this.capacity * 4);
          this.outputView = new Float32Array(engine.memory.buffer, engine.manifold_output_ptr(), this.capacity * 2);
          this.engine = engine;
          for (const partials of data.partials == null ? [] : Array.isArray(data.partials) ? data.partials : [data.partials]) {
            if (!this.uploadPartials(partials)) throw new Error('Invalid initial partial set');
          }
          for (const temporal of data.temporals ?? []) {
            if (!this.uploadTemporalFrames({ nodeId: temporal.nodeId, frames: temporal.frames,
              packed: temporal.rawFrames, recipe: temporal.rawRecipe })
              || engine.manifold_main_temporal_speed(temporal.nodeId, temporal.speed) !== 1) {
              throw new Error('Invalid initial Main source motion');
            }
          }
          this.port.postMessage({ type: 'ready' });
        } else if (data.type === 'parameter-request' && this.engine) {
          const accepted = Number.isInteger(data.nodeId) && Number.isInteger(data.id)
            && Number.isFinite(data.value)
            && this.engine.manifold_set_node_parameter(data.nodeId, data.id, data.value) === 1;
          this.port.postMessage({ type: 'parameter-applied', requestId: data.requestId, accepted });
        } else if (data.type === 'parameter' && this.engine) {
          this.engine.manifold_set_node_parameter(data.nodeId, data.id, data.value);
        } else if (data.type === 'directional-parameter' && this.engine) {
          if (this.engine.manifold_main_directional_parameter(data.id, data.value) !== 1) {
            throw new Error('Main directional parameter rejected');
          }
        } else if (data.type === 'pitch-parameter' && this.engine) {
          if (this.engine.manifold_main_pitch_parameter(data.id, data.value) !== 1) {
            throw new Error('Main pitch parameter rejected');
          }
        } else if (data.type === 'parameter-batch' && this.engine) {
          if (!Array.isArray(data.updates) || data.updates.length > 16) throw new Error('Invalid parameter batch');
          for (const update of data.updates) {
            if (!Number.isInteger(update.nodeId) || !Number.isInteger(update.id) || !Number.isFinite(update.value)) {
              throw new Error('Invalid parameter update');
            }
          }
          for (const update of data.updates) {
            this.engine.manifold_set_node_parameter(update.nodeId, update.id, update.value);
          }
        } else if (data.type === 'partials' && this.engine) {
          const accepted = this.uploadPartials(data);
          this.port.postMessage({ type: 'partials-applied', requestId: data.requestId, accepted });
        } else if (data.type === 'temporal-targets' && this.engine) {
          const accepted = this.uploadTemporalTargets(data);
          this.port.postMessage({ type: 'temporal-applied', requestId: data.requestId, accepted });
        } else if (data.type === 'temporal-frames' && this.engine) {
          const accepted = this.uploadTemporalFrames(data);
          this.port.postMessage({ type: 'temporal-applied', requestId: data.requestId, accepted });
        } else if (data.type === 'temporal-clear' && this.engine) {
          const accepted = this.engine.manifold_main_temporal_clear(data.nodeId) === 1;
          this.port.postMessage({ type: 'temporal-applied', requestId: data.requestId, accepted });
        } else if (data.type === 'temporal-speed' && this.engine) {
          if (this.engine.manifold_main_temporal_speed(data.nodeId, data.speed) !== 1) {
            throw new Error('Temporal speed rejected');
          }
        } else if (data.type === 'route') {
          const accepted = this.engine?.manifold_set_route(data.to, data.port, data.from ?? 0) === 1;
          this.port.postMessage({ type: 'route-applied', requestId: data.requestId, accepted });
        } else if (data.type === 'event' && this.engine) {
          this.queueEvent(data);
        } else if (data.type === 'meter-request' && this.engine) {
          const count = Math.min(33, Math.max(1, data.count ?? 8));
          const values = Array.from({ length: count }, (_, band) => this.engine.manifold_get_node_meter(data.nodeId, band));
          const active = this.engine.manifold_node_active(data.nodeId) === 1;
          this.port.postMessage({ type: 'meters', nodeId: data.nodeId, values, active });
        } else if (data.type === 'midi-trace-request' && this.engine) {
          const count = this.engine.manifold_midi_trace_count();
          const events = Array.from({ length: count }, (_, index) => {
            const fields = Array.from({ length: 8 }, (_, field) => this.engine.manifold_midi_trace_field(index, field));
            return { sequence: fields[0], nodeId: fields[1], offset: fields[2], kind: fields[3],
              channel: fields[4], note: fields[5], velocity: fields[6], emitted: fields[7] === 1 };
          });
          this.port.postMessage({ type: 'midi-trace', events });
        } else if (data.type === 'eq8-response-request' && this.engine) {
          for (let bin = 0; bin < this.eqResponse.length; bin++) {
            const frequency = 20 * 1000 ** (bin / (this.eqResponse.length - 1));
            this.eqResponse[bin] = this.engine.manifold_eq8_response_db(data.nodeId, frequency);
          }
          this.port.postMessage({ type: 'eq8-response', nodeId: data.nodeId, values: this.eqResponse });
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
        } else if (data.type === 'capture-publish' && this.engine) {
          const accepted = this.engine.manifold_capture_publish(data.captureId, data.instrumentId) === 1;
          this.inputView = new Float32Array(this.engine.memory.buffer, this.engine.manifold_input_ptr(), this.capacity * 4);
          this.outputView = new Float32Array(this.engine.memory.buffer, this.engine.manifold_output_ptr(), this.capacity * 2);
          this.port.postMessage({ type: 'capture-published', requestId: data.requestId, accepted });
        } else if (data.type === 'capture-publish-live' && this.engine) {
          const requestedFrames = Number.isFinite(data.windowSeconds) && data.windowSeconds > 0
            ? Math.round(Math.min(30, data.windowSeconds) * sampleRate) : 0;
          const accepted = this.engine.manifold_capture_stage_begin(data.captureId, requestedFrames) === 1;
          this.inputView = new Float32Array(this.engine.memory.buffer, this.engine.manifold_input_ptr(), this.capacity * 4);
          this.outputView = new Float32Array(this.engine.memory.buffer, this.engine.manifold_output_ptr(), this.capacity * 2);
          this.port.postMessage({ type: 'capture-stage-started', requestId: data.requestId, accepted });
        } else if (data.type === 'capture-stage-status' && this.engine) {
          const state = this.engine.manifold_capture_stage_status(data.captureId);
          const frames = state === 2 ? this.engine.manifold_capture_stage_length(data.captureId) : 0;
          this.port.postMessage({ type: 'capture-stage-status', requestId: data.requestId, state, frames });
        } else if (data.type === 'capture-stage-chunk' && this.engine) {
          const length = this.engine.manifold_capture_stage_length(data.captureId);
          if (!Number.isInteger(data.offset) || !Number.isInteger(data.frames) || data.offset < 0
            || data.frames < 1 || data.frames > this.capacity * 8 || data.offset + data.frames > length) {
            throw new Error('Invalid staged capture chunk');
          }
          const stereo = new Float32Array(data.frames * 2);
          for (let offset = 0; offset < data.frames;) {
            const count = Math.min(this.capacity, data.frames - offset);
            const copied = this.engine.manifold_capture_stage_copy(data.captureId, data.offset + offset, count);
            if (copied !== count) throw new Error('Staged capture changed during export');
            stereo.set(new Float32Array(this.engine.memory.buffer, this.engine.manifold_output_ptr(), count * 2), offset * 2);
            offset += count;
          }
          this.port.postMessage({ type: 'capture-stage-chunk', requestId: data.requestId,
            offset: data.offset, stereo }, [stereo.buffer]);
        } else if (data.type === 'capture-stage-commit' && this.engine) {
          const accepted = this.engine.manifold_capture_stage_publish(data.captureId, data.instrumentId) === 1;
          this.inputView = new Float32Array(this.engine.memory.buffer, this.engine.manifold_input_ptr(), this.capacity * 4);
          this.outputView = new Float32Array(this.engine.memory.buffer, this.engine.manifold_output_ptr(), this.capacity * 2);
          this.port.postMessage({ type: 'capture-published', requestId: data.requestId, accepted, sourceRate: sampleRate });
        } else if (data.type === 'capture-stage-cancel' && this.engine) {
          this.engine.manifold_capture_stage_cancel(data.captureId);
        }
      } catch (error) {
        if (data.type === 'capture-publish-live' || data.type === 'capture-publish'
          || data.type === 'capture-stage-status' || data.type === 'capture-stage-chunk' || data.type === 'capture-stage-commit') {
          this.port.postMessage({ type: 'capture-published', requestId: data.requestId, accepted: false, message: String(error) });
        } else {
          this.port.postMessage({ type: data.type === 'capture-request' ? 'capture-error' : 'error', message: String(error) });
        }
      }
    };
  }

  uploadPartials(data) {
    const { nodeId, fundamental, values } = data;
    if (!Array.isArray(values) && !(values instanceof Float32Array)) return false;
    if (values.length % 4 !== 0 || values.length > 32 * 4) return false;
    const count = values.length / 4;
    if (this.engine.manifold_partials_begin_target(nodeId, data.target ?? 0, count, fundamental) !== 1) return false;
    const ptr = this.engine.manifold_partials_ptr();
    if (!ptr) return false;
    new Float32Array(this.engine.memory.buffer, ptr, values.length).set(values);
    return this.engine.manifold_partials_commit() === 1;
  }

  uploadTemporalTargets(data) {
    const { nodeId, frames, values } = data;
    const stride = 2 + 32 * 4;
    if (!(values instanceof Float32Array) || !Number.isInteger(frames)
      || frames < 2 || frames > 256 || values.length !== frames * stride) return false;
    if (this.engine.manifold_main_temporal_begin(nodeId, frames) !== 1) return false;
    const ptr = this.engine.manifold_main_temporal_ptr();
    if (!ptr) return false;
    new Float32Array(this.engine.memory.buffer, ptr, values.length).set(values);
    const accepted = this.engine.manifold_main_temporal_commit() === 1;
    // A large table may grow Wasm memory and invalidate cached JS views.
    this.inputView = new Float32Array(this.engine.memory.buffer, this.engine.manifold_input_ptr(), this.capacity * 4);
    this.outputView = new Float32Array(this.engine.memory.buffer, this.engine.manifold_output_ptr(), this.capacity * 2);
    return accepted;
  }

  uploadTemporalFrames(data) {
    const { nodeId, frames, packed, recipe } = data;
    if (!(packed instanceof Float32Array) || !(recipe instanceof Float32Array)
      || !Number.isInteger(frames) || frames < 2 || frames > 128
      || packed.length !== 1 + frames * 131 || recipe.length !== 10) return false;
    if (this.engine.manifold_main_temporal_raw_begin(nodeId, frames) !== 1) return false;
    new Float32Array(this.engine.memory.buffer,
      this.engine.manifold_main_temporal_raw_ptr(), packed.length).set(packed);
    new Float32Array(this.engine.memory.buffer,
      this.engine.manifold_main_temporal_raw_recipe_ptr(), recipe.length).set(recipe);
    const accepted = this.engine.manifold_main_temporal_raw_commit() === 1;
    this.inputView = new Float32Array(this.engine.memory.buffer, this.engine.manifold_input_ptr(), this.capacity * 4);
    this.outputView = new Float32Array(this.engine.memory.buffer, this.engine.manifold_output_ptr(), this.capacity * 2);
    return accepted;
  }

  queueEvent(data) {
    const offset = Number.isFinite(data.offset) ? Math.max(0, Math.trunc(data.offset)) : 0;
    const frame = Number.isSafeInteger(data.frame) && data.frame >= 0 ? data.frame : currentFrame + offset;
    if (data.kind === 2) {
      let kept = 0;
      for (let index = 0; index < this.pendingCount; index++) {
        if (this.pendingNode[index] === data.nodeId && this.pendingFrame[index] >= frame) continue;
        this.pendingFrame[kept] = this.pendingFrame[index];
        this.pendingNode[kept] = this.pendingNode[index];
        this.pendingKind[kept] = this.pendingKind[index];
        this.pendingChannel[kept] = this.pendingChannel[index];
        this.pendingNote[kept] = this.pendingNote[index];
        this.pendingVelocity[kept] = this.pendingVelocity[index];
        kept++;
      }
      this.pendingCount = kept;
      if (this.pendingCount === this.eventCapacity) this.pendingCount--;
    }
    if (this.pendingCount >= this.eventCapacity) throw new Error('MIDI event queue is full');
    let index = this.pendingCount;
    while (index > 0 && this.pendingFrame[index - 1] > frame) {
      this.pendingFrame[index] = this.pendingFrame[index - 1];
      this.pendingNode[index] = this.pendingNode[index - 1];
      this.pendingKind[index] = this.pendingKind[index - 1];
      this.pendingChannel[index] = this.pendingChannel[index - 1];
      this.pendingNote[index] = this.pendingNote[index - 1];
      this.pendingVelocity[index] = this.pendingVelocity[index - 1];
      index--;
    }
    this.pendingFrame[index] = frame;
    this.pendingNode[index] = data.nodeId;
    this.pendingKind[index] = data.kind;
    this.pendingChannel[index] = data.channel ?? 0;
    this.pendingNote[index] = data.note ?? 0;
    this.pendingVelocity[index] = data.velocity ?? 0;
    this.pendingCount++;
  }

  pushDueEvents(frames) {
    const end = currentFrame + frames;
    let due = 0;
    while (due < this.pendingCount && this.pendingFrame[due] < end) {
      const offset = Math.max(0, this.pendingFrame[due] - currentFrame);
      if (this.engine.manifold_event_push(this.pendingNode[due], offset,
        this.pendingKind[due], this.pendingChannel[due], this.pendingNote[due], this.pendingVelocity[due]) !== 1) {
        this.port.postMessage({ type: 'error', message: 'Rust rejected a scheduled MIDI event' });
      }
      due++;
    }
    if (due) {
      this.pendingFrame.copyWithin(0, due, this.pendingCount);
      this.pendingNode.copyWithin(0, due, this.pendingCount);
      this.pendingKind.copyWithin(0, due, this.pendingCount);
      this.pendingChannel.copyWithin(0, due, this.pendingCount);
      this.pendingNote.copyWithin(0, due, this.pendingCount);
      this.pendingVelocity.copyWithin(0, due, this.pendingCount);
      this.pendingCount -= due;
    }
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
    const sidechain = inputs[1] || [];
    const sideLeft = sidechain[0];
    const sideRight = sidechain[1] || sideLeft;
    const buffer = this.inputView;
    for (let frame = 0; frame < frames; frame++) {
      buffer[frame] = left ? left[frame] : 0;
      buffer[this.capacity + frame] = right ? right[frame] : 0;
      buffer[this.capacity * 2 + frame] = sideLeft ? sideLeft[frame] : 0;
      buffer[this.capacity * 3 + frame] = sideRight ? sideRight[frame] : 0;
    }
    this.pushDueEvents(frames);
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
