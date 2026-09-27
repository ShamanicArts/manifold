/** Main looper adapter: device buffers and messages only; Rust owns audio/state. */
// Vite serves this AudioWorklet module as an asset, so it must be self-contained.
// Each Main capture strip spans an age range. Return buckets in screen order:
// older audio on the left, the current write head toward the right.
export function captureStripBins(bars, index, samplesPerBar, captureFrames, count = 20) {
  const older = Math.min(captureFrames, Math.floor(bars[index] * samplesPerBar));
  const newer = Math.min(captureFrames, Math.floor((bars[index + 1] ?? 0) * samplesPerBar));
  const span = Math.max(0, older - newer);
  return Array.from({ length: count }, (_, bin) => [
    Math.floor(older - span * (bin + 1) / count),
    Math.floor(older - span * bin / count),
  ]);
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
    this.port.onmessage = async ({ data }) => {
      try {
        if (data.type === 'init') {
          project = data.project;
          if (project?.id !== 'manifold.main-looper' || project.version !== 1) throw new Error('Incompatible looper contract');
          const module = await WebAssembly.compile(data.wasmBytes);
          this.engine = (await WebAssembly.instantiate(module, {})).exports;
          if (this.engine.manifold_looper_prepare(sampleRate, this.capacity) !== 1) throw new Error('Looper preparation failed');
          this.inputView = new Float32Array(this.engine.memory.buffer, this.engine.manifold_looper_input_ptr(), this.capacity * 2);
          this.outputView = new Float32Array(this.engine.memory.buffer, this.engine.manifold_looper_output_ptr(), this.capacity * 2);
          this.port.postMessage({ type: 'ready' });
        } else if (this.transferJob && ['control', 'layer-control', 'command', 'synth-note', 'synth-parameter'].includes(data.type)) {
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
            state: { format: project.format, version: project.version, id: project.id,
              sampleRate: s(project.status.sampleRate), tempo: s(project.status.tempo),
              targetBpm: s(project.status.targetBpm), mode: s(project.status.mode),
              activeLayer: s(project.status.activeLayer), overdub: s(project.status.overdub) === 1,
              overdubLengthPolicy: s(project.status.overdubLengthPolicy), layers } });
        } else if (data.type === 'save-chunk' && this.engine && this.transferJob?.type === 'save'
          && this.transferJob.requestId === data.requestId) {
          const frames = this.engine.manifold_looper_export_chunk(data.layer, data.offset, Math.min(4096, data.frames));
          if (frames === 0) throw new Error('Loop export ended before its saved length.');
          const ptr = this.engine.manifold_looper_transfer_ptr();
          const stereo = new Float32Array(this.engine.memory.buffer, ptr, frames * 2).slice();
          this.port.postMessage({ type: 'save-chunk', requestId: data.requestId, layer: data.layer, offset: data.offset, stereo }, [stereo.buffer]);
        } else if (data.type === 'save-end' && this.transferJob?.type === 'save'
          && this.transferJob.requestId === data.requestId) {
          this.transferJob = null;
        } else if (data.type === 'import-start' && this.engine && !this.transferJob && !this.sampleJob && this.freeSource === null) {
          const s = (id, layer = 0) => this.engine.manifold_looper_status(id, layer);
          if (s(project.status.recording) || Array.from({ length: project.layers }, (_, layer) => s(project.status.layerPending, layer)).some(Boolean)) {
            throw new Error('Finish recording and pending commits before opening a session.');
          }
          this.transferJob = { type: 'import', requestId: data.requestId, state: data.state, layer: null };
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
        } else if (data.type === 'import-end' && this.engine && this.transferJob?.type === 'import'
          && this.transferJob.requestId === data.requestId) {
          const state = this.transferJob.state;
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
          const segments = bars.map((_, index) => captureStripBins(
            bars, index, spb, project.captureSeconds * sampleRate,
          ).map(([start, end]) => e.manifold_looper_peak(active, 1, start, end)));
          this.port.postMessage({ type: 'snapshot', tempo: s(project.status.tempo), active,
            mode: s(project.status.mode), recording: s(project.status.recording) === 1,
            overdub: s(project.status.overdub) === 1, forwardBars: s(project.status.forwardBars),
            captured: s(project.status.capturedFrames, active), sampleRate: s(project.status.sampleRate),
            layers, segments });
        }
      } catch (error) {
        if (this.sampleJob && this.engine) this.engine.manifold_looper_sample_cancel();
        this.sampleJob = null;
        if (this.freeSource !== null && this.engine) this.engine.manifold_looper_sample_free_cancel();
        this.freeSource = null;
        if (this.transferJob?.type === 'import' && this.transferJob.layer) {
          this.engine.manifold_looper_import_cancel(this.transferJob.layer.index);
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
