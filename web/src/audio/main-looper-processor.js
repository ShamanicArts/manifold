/** Main looper adapter: device buffers and messages only; Rust owns audio/state. */
// Vite serves this AudioWorklet module as an asset, so it must be self-contained.
// The nine strips form one timeline: older audio is left, newest audio is right.
// Peak queries use samples ago, so reverse the age bins inside every strip.
export function captureStripBins(bars, index, samplesPerBar, captureFrames, capturedFrames, count = 128) {
  const older = Math.min(captureFrames, Math.floor(bars[index] * samplesPerBar));
  const newer = Math.min(captureFrames, Math.floor((bars[index + 1] ?? 0) * samplesPerBar));
  const span = Math.max(0, older - newer);
  if (!span || capturedFrames <= newer) return Array(count).fill(null);
  return Array.from({ length: count }, (_, bin) => {
    const start = Math.floor(newer + span * (count - bin - 1) / count);
    const end = Math.floor(newer + span * (count - bin) / count);
    return start < capturedFrames && end > start ? [start, Math.min(end, capturedFrames)] : null;
  });
}
let project;
class MainLooperProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = null;
    this.capacity = 2048;
    this.inputView = null;
    this.outputView = null;
    this.transferJob = null;
    this.sampleJob = null;
    this.freeSource = null;
    this.lfoActive = [true, false, false, false];
    this.port.onmessage = async ({ data }) => {
      try {
        if (data.type === 'init') {
          project = data.project;
          if (project?.id !== 'manifold.main-looper' || project.version !== 1) throw new Error('Incompatible looper contract');
          const module = await WebAssembly.compile(data.wasmBytes);
          this.engine = (await WebAssembly.instantiate(module, {})).exports;
          if (this.engine.manifold_looper_prepare(sampleRate, this.capacity) !== 1) throw new Error('Looper preparation failed');
          const graph = data.rackInsert;
          if (!graph || this.engine.manifold_graph_begin(graph.nodes.length, graph.connections.length) !== 1) {
            throw new Error('Main rack graph is missing or too large');
          }
          if (this.engine.manifold_graph_patchable(1) !== 1) throw new Error('Main rack routing is unavailable');
          for (const node of graph.nodes) {
            if (this.engine.manifold_graph_node(node.id, node.kind, node.a, node.b) !== 1) {
              throw new Error(`Invalid Main rack node ${node.id}`);
            }
          }
          for (const edge of graph.connections) {
            if (this.engine.manifold_graph_edge(edge.from, edge.to, edge.inputPort) !== 1) {
              throw new Error('Invalid Main rack connection');
            }
          }
          const mainControlledFilters = new Set(graph.nodes.filter(node =>
            node.kind === 6 || node.kind === 16).map(node => node.id));
          for (const parameter of graph.initialParameters) {
            if (this.engine.manifold_graph_initial_parameter(parameter.nodeId, parameter.id, parameter.value) !== 1
              && !(mainControlledFilters.has(parameter.nodeId) && parameter.id <= 2)) {
              throw new Error(`Invalid Main rack parameter ${parameter.nodeId}/${parameter.id}`);
            }
          }
          if (this.engine.manifold_looper_prepare_rack_insert() !== 1) throw new Error('Main rack insert preparation failed');
          this.inputView = new Float32Array(this.engine.memory.buffer, this.engine.manifold_looper_input_ptr(), this.capacity * 2);
          this.outputView = new Float32Array(this.engine.memory.buffer, this.engine.manifold_looper_output_ptr(), this.capacity * 2);
          this.port.postMessage({ type: 'ready' });
        } else if (data.type === 'rack-route' && this.transferJob) {
          this.port.postMessage({ type: 'rack-route-applied', requestId: data.requestId, accepted: false });
        } else if (data.type === 'rack-routes' && this.transferJob) {
          this.port.postMessage({ type: 'rack-route-applied', requestId: data.requestId, accepted: false });
        } else if (data.type === 'modulation-routes' && this.transferJob) {
          this.port.postMessage({ type: 'control-route-applied', requestId: data.requestId, accepted: false });
        } else if (this.transferJob && ['control', 'layer-control', 'command', 'synth-note', 'synth-parameter',
          'lfo-slot-active', 'lfo-parameter', 'lfo-gate', 'modulation-route', 'atv-parameter', 'slew-parameter', 'sample-hold-parameter', 'compare-parameter', 'cv-mix-parameter', 'range-parameter', 'scale-quantizer-parameter', 'transpose-parameter', 'note-filter-parameter', 'velocity-mapper-parameter'].includes(data.type)) {
          this.port.postMessage({ type: 'rejected', action: data });
        } else if (data.type === 'sample-capture' && this.engine && !this.sampleJob && !this.transferJob && this.freeSource === null) {
          const frames = this.engine.manifold_looper_sample_capture(data.source, data.bars);
          if (!frames) throw new Error('Sample capture was rejected.');
          this.sampleJob = { source: data.source, frames, copied: 0, publishing: false };
          this.port.postMessage({ type: 'sample-capture-started', source: data.source, frames });
        } else if (data.type === 'sample-free-start' && this.engine && !this.sampleJob && !this.transferJob && this.freeSource === null) {
          if (this.engine.manifold_looper_sample_free_start(data.source) !== 1) throw new Error('Free sample recording could not start.');
          this.freeSource = data.source;
          this.port.postMessage({ type: 'sample-free-started', source: data.source });
        } else if (data.type === 'sample-free-stop' && this.engine && this.freeSource !== null) {
          const source = this.freeSource;
          const frames = this.engine.manifold_looper_sample_free_finish();
          this.freeSource = null;
          if (!frames) throw new Error('Free sample recording contains no audio.');
          this.sampleJob = { source, frames, copied: 0, publishing: false };
          this.port.postMessage({ type: 'sample-capture-started', source, frames });
        } else if (data.type === 'sample-free-cancel' && this.engine) {
          this.engine.manifold_looper_sample_free_cancel();
          this.freeSource = null;
        } else if (data.type === 'sample-publish-next' && this.engine && this.sampleJob) {
          const job = this.sampleJob;
          const frames = Math.min(4096, job.frames - job.copied);
          if (this.engine.manifold_looper_sample_publish_chunk(job.copied, frames) !== 1) {
            throw new Error('Sample PCM failed validation.');
          }
          job.copied += frames;
          if (job.copied === job.frames) {
            if (this.engine.manifold_looper_sample_publish_finish() !== 1) throw new Error('Sample publication failed.');
            this.inputView = new Float32Array(this.engine.memory.buffer,
              this.engine.manifold_looper_input_ptr(), this.capacity * 2);
            this.outputView = new Float32Array(this.engine.memory.buffer,
              this.engine.manifold_looper_output_ptr(), this.capacity * 2);
            this.sampleJob = null;
            this.port.postMessage({ type: 'sample-capture-complete', frames: job.frames });
          } else {
            this.port.postMessage({ type: 'sample-publish-progress', copied: job.copied, frames: job.frames });
          }
        } else if (data.type === 'sample-cancel' && this.engine) {
          this.engine.manifold_looper_sample_cancel();
          this.sampleJob = null;
        } else if (data.type === 'save-start' && this.engine && !this.transferJob && !this.sampleJob && this.freeSource === null) {
          const e = this.engine, s = (id, layer = 0) => e.manifold_looper_status(id, layer);
          if (s(project.status.recording) || Array.from({ length: project.layers }, (_, layer) => s(project.status.layerPending, layer)).some(Boolean)) {
            throw new Error('Finish recording and pending commits before saving.');
          }
          this.transferJob = { type: 'save', requestId: data.requestId };
          const layers = Array.from({ length: project.layers }, (_, layer) => ({
            frames: s(project.status.layerLength, layer), bars: s(project.status.layerBars, layer),
            position: s(project.status.layerPosition, layer),
            playing: s(project.status.layerPlaying, layer) === 1,
            volume: s(project.status.layerVolume, layer), speed: s(project.status.layerSpeed, layer),
            muted: s(project.status.layerMute, layer) === 1,
          }));
          this.port.postMessage({ type: 'save-started', requestId: data.requestId,
            sampleHold: { held: e.manifold_looper_sample_hold_status(2),
              triggerHigh: e.manifold_looper_sample_hold_status(4) === 1 },
            compare: { gate: e.manifold_looper_compare_status(1) === 1,
              pulseRemaining: e.manifold_looper_compare_status(3) },
            state: { format: project.format, version: project.sessionVersion, id: project.id,
              sampleRate: s(project.status.sampleRate), tempo: s(project.status.tempo),
              targetBpm: s(project.status.targetBpm), mode: s(project.status.mode),
              activeLayer: s(project.status.activeLayer), overdub: s(project.status.overdub) === 1,
              overdubLengthPolicy: s(project.status.overdubLengthPolicy), layers,
              sample: { frames: e.manifold_looper_synth_sample_frames() } } });
        } else if (data.type === 'save-chunk' && this.engine && this.transferJob?.type === 'save'
          && this.transferJob.requestId === data.requestId) {
          const frames = this.engine.manifold_looper_export_chunk(data.layer, data.offset, Math.min(4096, data.frames));
          if (frames === 0) throw new Error('Loop export ended before its saved length.');
          const ptr = this.engine.manifold_looper_transfer_ptr();
          const stereo = new Float32Array(this.engine.memory.buffer, ptr, frames * 2).slice();
          this.port.postMessage({ type: 'save-chunk', requestId: data.requestId, layer: data.layer, offset: data.offset, stereo }, [stereo.buffer]);
        } else if (data.type === 'save-sample-chunk' && this.engine && this.transferJob?.type === 'save'
          && this.transferJob.requestId === data.requestId) {
          const frames = this.engine.manifold_looper_synth_sample_export_chunk(data.offset, Math.min(4096, data.frames));
          if (!frames) throw new Error('Main Sample export ended before its saved length.');
          const ptr = this.engine.manifold_looper_transfer_ptr();
          const stereo = new Float32Array(this.engine.memory.buffer, ptr, frames * 2).slice();
          this.port.postMessage({ type: 'save-sample-chunk', requestId: data.requestId, offset: data.offset, stereo }, [stereo.buffer]);
        } else if (data.type === 'save-end' && this.transferJob?.type === 'save'
          && this.transferJob.requestId === data.requestId) {
          this.transferJob = null;
        } else if (data.type === 'import-start' && this.engine && !this.transferJob && !this.sampleJob && this.freeSource === null) {
          const s = (id, layer = 0) => this.engine.manifold_looper_status(id, layer);
          if (s(project.status.recording) || Array.from({ length: project.layers }, (_, layer) => s(project.status.layerPending, layer)).some(Boolean)) {
            throw new Error('Finish recording and pending commits before opening a session.');
          }
          this.transferJob = { type: 'import', requestId: data.requestId, state: data.state, layer: null, sample: null };
          this.port.postMessage({ type: 'import-started', requestId: data.requestId });
        } else if (data.type === 'import-begin' && this.engine && this.transferJob?.type === 'import'
          && this.transferJob.requestId === data.requestId) {
          const accepted = data.stereo instanceof Float32Array && data.stereo.length % 2 === 0
            && this.engine.manifold_looper_import_begin(data.layer, data.stereo.length / 2,
              data.bars, data.position, data.playing ? 1 : 0) === 1;
          if (!accepted) throw new Error('Layer import preparation failed.');
          this.transferJob.layer = { index: data.layer, stereo: data.stereo, copied: 0 };
          this.port.postMessage({ type: 'import-progress', requestId: data.requestId, layer: data.layer, done: false });
        } else if (data.type === 'import-step' && this.engine && this.transferJob?.type === 'import'
          && this.transferJob.requestId === data.requestId) {
          const job = this.transferJob.layer;
          if (!job || job.index !== data.layer) throw new Error('Layer import step is unavailable.');
          const count = Math.min(4096, job.stereo.length / 2 - job.copied);
          const ptr = this.engine.manifold_looper_transfer_ptr();
          new Float32Array(this.engine.memory.buffer, ptr, count * 2)
            .set(job.stereo.subarray(job.copied * 2, (job.copied + count) * 2));
          if (this.engine.manifold_looper_import_chunk(job.index, job.copied, count) !== 1) throw new Error('Layer PCM failed validation.');
          job.copied += count;
          const done = job.copied === job.stereo.length / 2;
          if (done) {
            if (this.engine.manifold_looper_import_finish(job.index) !== 1) throw new Error('Layer publication failed.');
            this.transferJob.layer = null;
          }
          this.port.postMessage({ type: 'import-progress', requestId: data.requestId, layer: data.layer, done });
        } else if (data.type === 'import-sample-begin' && this.engine && this.transferJob?.type === 'import'
          && this.transferJob.requestId === data.requestId && !this.transferJob.sample) {
          const stereo = data.stereo;
          if (!(stereo instanceof Float32Array) || stereo.length !== data.frames * 2
            || this.engine.manifold_looper_synth_sample_import_begin(data.frames) !== 1) {
            throw new Error('Main Sample import preparation failed.');
          }
          this.inputView = new Float32Array(this.engine.memory.buffer, this.engine.manifold_looper_input_ptr(), this.capacity * 2);
          this.outputView = new Float32Array(this.engine.memory.buffer, this.engine.manifold_looper_output_ptr(), this.capacity * 2);
          this.transferJob.sample = { stereo, copied: 0 };
          this.port.postMessage({ type: 'import-sample-progress', requestId: data.requestId, done: false });
        } else if (data.type === 'import-sample-step' && this.engine && this.transferJob?.sample
          && this.transferJob.requestId === data.requestId) {
          const job = this.transferJob.sample;
          const count = Math.min(4096, job.stereo.length / 2 - job.copied);
          const ptr = this.engine.manifold_looper_transfer_ptr();
          new Float32Array(this.engine.memory.buffer, ptr, count * 2)
            .set(job.stereo.subarray(job.copied * 2, (job.copied + count) * 2));
          if (this.engine.manifold_looper_synth_sample_import_chunk(job.copied, count) !== 1) {
            throw new Error('Saved Main Sample PCM failed validation.');
          }
          job.copied += count;
          const done = job.copied === job.stereo.length / 2;
          if (done) {
            if (this.engine.manifold_looper_synth_sample_import_finish() !== 1) {
              throw new Error('Main Sample publication failed.');
            }
            this.transferJob.sample = null;
            this.inputView = new Float32Array(this.engine.memory.buffer, this.engine.manifold_looper_input_ptr(), this.capacity * 2);
            this.outputView = new Float32Array(this.engine.memory.buffer, this.engine.manifold_looper_output_ptr(), this.capacity * 2);
          }
          this.port.postMessage({ type: 'import-sample-progress', requestId: data.requestId, done });
        } else if (data.type === 'import-end' && this.engine && this.transferJob?.type === 'import'
          && this.transferJob.requestId === data.requestId) {
          const state = this.transferJob.state;
          if (this.transferJob.layer || this.transferJob.sample) throw new Error('Session PCM transfer is incomplete.');
          if (state.version >= 2 && state.sample.frames === 0
            && this.engine.manifold_looper_synth_sample_clear() !== 1) {
            throw new Error('Saved empty Main Sample could not be restored.');
          }
          const c = project.controls, lc = project.layerControls;
          for (const [id, value] of [[c.tempo, state.tempo], [c.targetBpm, state.targetBpm],
            [c.mode, state.mode], [c.activeLayer, state.activeLayer],
            [c.overdub, state.overdub ? 1 : 0], [c.overdubLengthPolicy, state.overdubLengthPolicy]]) {
            if (this.engine.manifold_looper_control(id, value) !== 1) throw new Error('Saved looper control was rejected.');
          }
          for (let layer = 0; layer < project.layers; layer++) {
            const saved = state.layers[layer];
            if (!saved.frames) this.engine.manifold_looper_command(project.commands.clearLayer, layer);
            for (const [id, value] of [[lc.volume, saved.volume], [lc.speed, saved.speed], [lc.mute, saved.muted ? 1 : 0]]) {
              if (this.engine.manifold_looper_layer_control(layer, id, value) !== 1) throw new Error('Saved layer control was rejected.');
            }
          }
          this.transferJob = null;
          this.port.postMessage({ type: 'import-complete', requestId: data.requestId });
        } else if (data.type === 'import-cancel' && this.transferJob?.type === 'import') {
          if (this.transferJob.layer) this.engine.manifold_looper_import_cancel(this.transferJob.layer.index);
          if (this.transferJob.sample) this.engine.manifold_looper_synth_sample_import_cancel();
          this.transferJob = null;
        } else if (data.type === 'control' && this.engine) {
          const accepted = this.engine.manifold_looper_control(data.id, data.value) === 1;
          if (!accepted) this.port.postMessage({ type: 'rejected', action: data });
        } else if (data.type === 'layer-control' && this.engine) {
          const accepted = this.engine.manifold_looper_layer_control(data.layer, data.id, data.value) === 1;
          if (!accepted) this.port.postMessage({ type: 'rejected', action: data });
        } else if (data.type === 'command' && this.engine) {
          const accepted = this.engine.manifold_looper_command(data.id, data.value ?? 0) === 1;
          if (!accepted) this.port.postMessage({ type: 'rejected', action: data });
        } else if (data.type === 'synth-note' && this.engine) {
          const accepted = this.engine.manifold_looper_synth_note(data.kind, data.note ?? 0, data.velocity ?? 0) === 1;
          if (!accepted) this.port.postMessage({ type: 'rejected', action: data });
        } else if (data.type === 'synth-parameter' && this.engine) {
          const accepted = this.engine.manifold_looper_synth_parameter(data.id, data.value) === 1;
          if (!accepted) this.port.postMessage({ type: 'rejected', action: data });
        } else if (data.type === 'rack-route' && this.engine) {
          const accepted = this.engine.manifold_looper_set_rack_route(data.to, data.port, data.from ?? 0) === 1;
          this.port.postMessage({ type: 'rack-route-applied', requestId: data.requestId, accepted });
        } else if (data.type === 'rack-routes' && this.engine) {
          let applied = 0;
          for (const route of data.routes) {
            if (this.engine.manifold_looper_set_rack_route(route.to, route.port, route.from) !== 1) break;
            applied++;
          }
          const accepted = applied === data.routes.length;
          if (!accepted) for (let index = applied - 1; index >= 0; index--) {
            const route = data.routes[index];
            this.engine.manifold_looper_set_rack_route(route.to, route.port, route.previous);
          }
          this.port.postMessage({ type: 'rack-route-applied', requestId: data.requestId, accepted });
        } else if (data.type === 'modulation-routes' && this.engine) {
          let applied = 0;
          for (const route of data.routes) {
            if (this.engine.manifold_looper_modulation_slot_route(route.slot, route.id, route.value) !== 1) break;
            applied++;
          }
          const accepted = applied === data.routes.length;
          if (!accepted) for (let index = applied - 1; index >= 0; index--) {
            const route = data.routes[index];
            this.engine.manifold_looper_modulation_slot_route(route.slot, route.id, route.previous);
          }
          this.port.postMessage({ type: 'control-route-applied', requestId: data.requestId, accepted });
        } else if (data.type === 'lfo-slot-active' && this.engine) {
          if (this.engine.manifold_looper_lfo_slot_active(data.slot, Number(data.active)) !== 1)
            this.port.postMessage({ type: 'rejected', action: data });
          else this.lfoActive[data.slot] = Boolean(data.active);
        } else if (data.type === 'lfo-parameter' && this.engine) {
          if (this.engine.manifold_looper_lfo_slot_parameter(data.slot ?? 0, data.id, data.value) !== 1)
            this.port.postMessage({ type: 'rejected', action: data });
        } else if (data.type === 'lfo-gate' && this.engine) {
          if (this.engine.manifold_looper_lfo_slot_gate(data.slot ?? 0, data.id, data.high) !== 1)
            this.port.postMessage({ type: 'rejected', action: data });
        } else if (data.type === 'modulation-route' && this.engine) {
          if (this.engine.manifold_looper_modulation_slot_route(data.slot ?? 0, data.id, data.value) !== 1)
            this.port.postMessage({ type: 'rejected', action: data });
        } else if (data.type === 'atv-parameter' && this.engine) {
          if (this.engine.manifold_looper_atv_parameter(data.id, data.value) !== 1)
            this.port.postMessage({ type: 'rejected', action: data });
        } else if (data.type === 'slew-parameter' && this.engine) {
          if (this.engine.manifold_looper_slew_parameter(data.id, data.value) !== 1)
            this.port.postMessage({ type: 'rejected', action: data });
        } else if (data.type === 'sample-hold-parameter' && this.engine) {
          if (this.engine.manifold_looper_sample_hold_parameter(data.id, data.value) !== 1)
            this.port.postMessage({ type: 'rejected', action: data });
        } else if (data.type === 'compare-parameter' && this.engine) {
          if (this.engine.manifold_looper_compare_parameter(data.id, data.value) !== 1)
            this.port.postMessage({ type: 'rejected', action: data });
        } else if (data.type === 'cv-mix-parameter' && this.engine) {
          if (this.engine.manifold_looper_cv_mix_parameter(data.id, data.value) !== 1)
            this.port.postMessage({ type: 'rejected', action: data });
        } else if (data.type === 'range-parameter' && this.engine) {
          if (this.engine.manifold_looper_range_parameter(data.id, data.value) !== 1)
            this.port.postMessage({ type: 'rejected', action: data });
        } else if (data.type === 'scale-quantizer-parameter' && this.engine) {
          if (this.engine.manifold_looper_scale_quantizer_parameter(data.id, data.value) !== 1)
            this.port.postMessage({ type: 'rejected', action: data });
        } else if (data.type === 'transpose-parameter' && this.engine) {
          if (this.engine.manifold_looper_transpose_parameter(data.id, data.value) !== 1)
            this.port.postMessage({ type: 'rejected', action: data });
        } else if (data.type === 'note-filter-parameter' && this.engine) {
          if (this.engine.manifold_looper_note_filter_parameter(data.id, data.value) !== 1)
            this.port.postMessage({ type: 'rejected', action: data });
        } else if (data.type === 'velocity-mapper-parameter' && this.engine) {
          if (this.engine.manifold_looper_velocity_mapper_parameter(data.id, data.value) !== 1)
            this.port.postMessage({ type: 'rejected', action: data });
        } else if (data.type === 'arpeggiator-parameter' && this.engine) {
          if (this.engine.manifold_looper_arpeggiator_parameter(data.id, data.value) !== 1)
            this.port.postMessage({ type: 'rejected', action: data });
        } else if (data.type === 'snapshot' && this.engine) {
          const e = this.engine;
          if (this.freeSource !== null) {
            this.port.postMessage({ type: 'sample-free-progress', frames: e.manifold_looper_sample_free_elapsed() });
          }
          if (this.sampleJob && !this.sampleJob.publishing
            && e.manifold_looper_sample_progress() === this.sampleJob.frames) {
            if (e.manifold_looper_sample_publish_begin() !== this.sampleJob.frames) {
              throw new Error('Sample publication preparation failed.');
            }
            // The upload may grow Wasm memory and detach the old audio views.
            this.inputView = new Float32Array(e.memory.buffer, e.manifold_looper_input_ptr(), this.capacity * 2);
            this.outputView = new Float32Array(e.memory.buffer, e.manifold_looper_output_ptr(), this.capacity * 2);
            this.sampleJob.publishing = true;
            this.port.postMessage({ type: 'sample-capture-ready', frames: this.sampleJob.frames });
          }
          const s = (id, layer = 0) => e.manifold_looper_status(id, layer);
          const active = s(project.status.activeLayer);
          const spb = s(project.status.samplesPerBar);
          const bars = project.segments;
          const sampleFrames = e.manifold_looper_synth_sample_frames();
          const samplePeaks = sampleFrames ? Array.from({ length: 128 }, (_, bin) =>
            e.manifold_looper_synth_sample_peak(
              Math.floor(sampleFrames * bin / 128), Math.floor(sampleFrames * (bin + 1) / 128))) : [];
          const eqResponse = Array.from({ length: 108 }, (_, bin) =>
            e.manifold_looper_eq_response(20 * (1000 ** (bin / 107))));
          const layers = Array.from({ length: project.layers }, (_, index) => {
            const length = s(project.status.layerLength, index);
            const peaks = length > 0 ? Array.from({ length: 128 }, (_, bin) =>
              e.manifold_looper_peak(index, 0, Math.floor(length * bin / 128), Math.floor(length * (bin + 1) / 128))) : [];
            return { state: s(project.status.layerState, index), length,
              position: s(project.status.layerPosition, index), bars: s(project.status.layerBars, index),
              pending: s(project.status.layerPending, index), volume: s(project.status.layerVolume, index),
              speed: s(project.status.layerSpeed, index),
              muted: s(project.status.layerMute, index) === 1,
              playing: s(project.status.layerPlaying, index) === 1, peaks };
          });
          const captured = s(project.status.capturedFrames, active);
          const segments = bars.map((_, index) => captureStripBins(
            bars, index, spb, project.captureSeconds * sampleRate, captured,
          ).map(bin => bin ? e.manifold_looper_peak(active, 1, bin[0], bin[1]) : 0));
          const lfos = this.lfoActive.map((active, slot) => active ? {
            slot, phase: e.manifold_looper_lfo_slot_status(slot, 0),
            out: e.manifold_looper_lfo_slot_status(slot, 1),
            inv: e.manifold_looper_lfo_slot_status(slot, 2),
            uni: e.manifold_looper_lfo_slot_status(slot, 3),
            eoc: e.manifold_looper_lfo_slot_status(slot, 4),
            cutoff: e.manifold_looper_lfo_slot_status(slot, 5),
            resonance: e.manifold_looper_lfo_slot_status(slot, 6),
            fx1Mix: e.manifold_looper_lfo_slot_status(slot, 7),
            fx2Mix: e.manifold_looper_lfo_slot_status(slot, 8),
          } : null);
          this.port.postMessage({ type: 'snapshot', tempo: s(project.status.tempo), active,
            mode: s(project.status.mode), recording: s(project.status.recording) === 1,
            overdub: s(project.status.overdub) === 1, forwardBars: s(project.status.forwardBars),
            captured, sampleRate: s(project.status.sampleRate),
            layers, segments, sampleFrames, samplePeaks, eqResponse, lfos,
            atv: { input: e.manifold_looper_atv_status(0), output: e.manifold_looper_atv_status(1) },
            slew: { input: e.manifold_looper_slew_status(0), output: e.manifold_looper_slew_status(1) },
            sampleHold: { input: e.manifold_looper_sample_hold_status(0),
              trigger: e.manifold_looper_sample_hold_status(1),
              held: e.manifold_looper_sample_hold_status(2),
              inv: e.manifold_looper_sample_hold_status(3),
              triggerHigh: e.manifold_looper_sample_hold_status(4) === 1 },
            compare: { input: e.manifold_looper_compare_status(0),
              gate: e.manifold_looper_compare_status(1) === 1,
              trigger: e.manifold_looper_compare_status(2),
              pulseRemaining: e.manifold_looper_compare_status(3) },
            cvMix: { inputs: Array.from({ length: 4 }, (_, index) => e.manifold_looper_cv_mix_status(index)),
              output: e.manifold_looper_cv_mix_status(4), inv: e.manifold_looper_cv_mix_status(5) },
            range: { input: e.manifold_looper_range_status(0), output: e.manifold_looper_range_status(1) },
            scaleQuantizer: { voices: Array.from({ length: 8 }, (_, index) => ({ index,
              input: e.manifold_looper_scale_quantizer_status(1 + index * 2),
              output: e.manifold_looper_scale_quantizer_status(2 + index * 2) }))
              .filter(voice => voice.input >= 0) },
            transpose: { voices: Array.from({ length: 8 }, (_, index) => ({ index,
              input: e.manifold_looper_transpose_status(1 + index * 2),
              output: e.manifold_looper_transpose_status(2 + index * 2) }))
              .filter(voice => voice.input >= 0) },
            noteFilter: { voices: Array.from({ length: 8 }, (_, index) => ({ index,
              note: e.manifold_looper_note_filter_status(1 + index * 2),
              passes: e.manifold_looper_note_filter_status(2 + index * 2) === 1 }))
              .filter(voice => voice.note >= 0) },
            arpeggiator: { held: e.manifold_looper_arpeggiator_status(0),
              note: e.manifold_looper_arpeggiator_status(1),
              gates: e.manifold_looper_arpeggiator_status(2),
              lanes: Array.from({ length: 8 }, (_, index) => e.manifold_looper_arpeggiator_status(3 + index) === 1) },
            velocityMapper: { voices: Array.from({ length: 8 }, (_, index) => ({ index,
              input: e.manifold_looper_velocity_mapper_status(1 + index * 2),
              output: e.manifold_looper_velocity_mapper_status(2 + index * 2) }))
              .filter(voice => voice.input >= 0) } });
        }
      } catch (error) {
        if (this.sampleJob && this.engine) this.engine.manifold_looper_sample_cancel();
        this.sampleJob = null;
        if (this.freeSource !== null && this.engine) this.engine.manifold_looper_sample_free_cancel();
        this.freeSource = null;
        if (this.transferJob?.type === 'import' && this.transferJob.layer) {
          this.engine.manifold_looper_import_cancel(this.transferJob.layer.index);
        }
        if (this.transferJob?.type === 'import' && this.transferJob.sample) {
          this.engine.manifold_looper_synth_sample_import_cancel();
        }
        this.transferJob = null;
        this.port.postMessage({ type: 'error', message: error.message });
      }
    };
  }
  process(inputs, outputs) {
    const output = outputs[0];
    const frames = output?.[0]?.length ?? 0;
    if (!frames || !this.engine) return true;
    const input = inputs[0] ?? [];
    this.inputView.fill(0, 0, frames);
    this.inputView.fill(0, this.capacity, this.capacity + frames);
    if (input[0]) this.inputView.set(input[0], 0);
    if (input[1]) this.inputView.set(input[1], this.capacity);
    else if (input[0]) this.inputView.set(input[0], this.capacity);
    if (this.engine.manifold_looper_process(frames) !== 1) return true;
    output[0].set(this.outputView.subarray(0, frames));
    if (output[1]) output[1].set(this.outputView.subarray(this.capacity, this.capacity + frames));
    return true;
  }
}
registerProcessor('manifold-main-looper', MainLooperProcessor);
