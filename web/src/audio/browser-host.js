/** Browser devices, AudioWorklet lifecycle, and control transport. */
import { midiFrame } from './midi-timing.js';
export class BrowserAudioHost {
  constructor(onStatus, onMeters = () => {}) {
    this.onStatus = onStatus;
    this.onMeters = onMeters;
    this.context = null;
    this.processor = null;
    this.analyser = null;
    this.source = null;
    this.sourceStream = null;
    this.parameters = new Map();
    this.pendingCapture = null;
    this.pendingRoutes = new Map();
    this.nextRouteRequest = 1;
    this.ready = false;
  }

  get running() { return this.context !== null; }

  async start(kind, values, project, sample = null) {
    if (this.running) return;
    const context = new AudioContext({ latencyHint: 'interactive' });
    this.context = context;
    try {
      await context.resume();
      await context.audioWorklet.addModule(new URL('./filter-processor.js', import.meta.url));
      const response = await fetch(`${import.meta.env.BASE_URL}manifold_filter.wasm`);
      if (!response.ok) throw new Error('Wasm filter missing: run ./scripts/build-wasm.sh');
      const wasmBytes = await response.arrayBuffer();
      const processor = new AudioWorkletNode(context, 'manifold-project', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      });
      this.processor = processor;
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.78;
      this.analyser = analyser;
      // Keep the worklet rendering while its Wasm module initializes.
      processor.connect(analyser).connect(context.destination);
      const ready = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('AudioWorklet initialization timed out')), 10_000);
        processor.onprocessorerror = () => {
          clearTimeout(timeout);
          reject(new Error('AudioWorklet processor failed'));
        };
        processor.port.onmessage = ({ data }) => {
          if (data.type === 'meters') this.onMeters(data.nodeId, data.values, data.active);
          if (data.type === 'route-applied') {
            const pending = this.pendingRoutes.get(data.requestId);
            if (pending) {
              this.pendingRoutes.delete(data.requestId);
              clearTimeout(pending.timeout);
              data.accepted ? pending.resolve() : pending.reject(new Error('Rust rejected this control route.'));
            }
          }
          if ((data.type === 'capture' || data.type === 'capture-error') && this.pendingCapture) {
            const pending = this.pendingCapture;
            this.pendingCapture = null;
            clearTimeout(pending.timeout);
            if (data.type === 'capture') pending.resolve({ sourceRate: data.sourceRate, stereo: data.stereo });
            else pending.reject(new Error(data.message));
          }
          if (data.type === 'error' && this.ready) {
            this.onStatus(`Audio error: ${data.message}`);
            return;
          }
          if (data.type === 'ready' || data.type === 'error') {
            clearTimeout(timeout);
            data.type === 'ready' ? resolve() : reject(new Error(data.message));
          }
        };
      });
      const prepareValues = project.parameters.filter((parameter) => parameter.prepareOnly)
        .map((parameter) => ({ nodeId: parameter.nodeId, id: parameter.nodeParameterId,
          value: values.get(parameter.id) ?? parameter.default }));
      const graph = { ...project.signal,
        initialParameters: [...(project.signal.initialParameters ?? []), ...prepareValues] };
      const slot = project.signal.nodes.find((node) => node.type === 'effect-slot');
      if (slot) {
        const controls = project.parameters.filter((parameter) => parameter.nodeId === slot.id);
        const type = controls.find((parameter) => parameter.nodeParameterId === 0);
        const mix = controls.find((parameter) => parameter.nodeParameterId === 1);
        graph.nodes = project.signal.nodes.map((node) => node.id === slot.id
          ? { ...node, a: values.get(type.id) ?? type.default, b: values.get(mix.id) ?? mix.default }
          : node);
        graph.initialParameters.push(...controls.filter((parameter) => parameter.nodeParameterId >= 2)
          .map((parameter) => ({ nodeId: slot.id, id: parameter.nodeParameterId,
            value: values.get(parameter.id) ?? parameter.default })));
      }
      const upload = sample ? { nodeId: 2, sourceRate: sample.sourceRate, stereo: sample.stereo.slice() } : null;
      processor.port.postMessage({ type: 'init', wasmBytes, graph, sample: upload },
        upload ? [wasmBytes, upload.stereo.buffer] : [wasmBytes]);
      await ready;
      this.ready = true;
      this.parameters = new Map(project.parameters.map((parameter) => [parameter.id, parameter]));
      for (const [id, value] of values) this.setParameter(id, value);
      if (project.signal.inputSource === 'none') {
        this.source = null;
      } else if (kind === 'microphone') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false }, video: false });
        this.sourceStream = stream;
        this.source = context.createMediaStreamSource(stream);
      } else {
        const oscillator = context.createOscillator();
        oscillator.type = 'sawtooth';
        oscillator.frequency.value = 165;
        const level = context.createGain();
        level.gain.value = 0.16;
        oscillator.connect(level);
        oscillator.start();
        this.source = level;
        this.oscillator = oscillator;
      }
      this.source?.connect(processor);
      this.onStatus(`Audio running · ${project.signal.inputSource === 'none' ? 'instrument' : kind === 'microphone' ? 'microphone' : 'test oscillator'} · ${Math.round(context.sampleRate / 1000)} kHz`);
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  setParameter(id, value) {
    const parameter = this.parameters.get(id);
    if (parameter) this.processor?.port.postMessage({ type: 'parameter', nodeId: parameter.nodeId, id: parameter.nodeParameterId, value });
  }

  setRoute(to, port, from) {
    if (!this.processor || !this.ready) return Promise.reject(new Error('Wait for audio to start before changing a live route.'));
    return new Promise((resolve, reject) => {
      const requestId = this.nextRouteRequest++;
      const timeout = setTimeout(() => {
        if (this.pendingRoutes.delete(requestId)) reject(new Error('Route update timed out.'));
      }, 4_000);
      this.pendingRoutes.set(requestId, { resolve, reject, timeout });
      this.processor.port.postMessage({ type: 'route', requestId, to, port, from });
    });
  }

  sendEvent(nodeId, kind, note = 0, velocity = 0, offset = 0, channel = 0) {
    this.processor?.port.postMessage({ type: 'event', nodeId, kind, channel, note, velocity, offset });
  }

  sendMidiEvent(nodeId, kind, note, velocity, channel, eventTimeMs) {
    if (!this.context || !this.processor) return;
    const frame = midiFrame(this.context, eventTimeMs);
    this.processor.port.postMessage({ type: 'event', nodeId, kind, channel, note, velocity, frame });
  }

  requestMeters(nodeId, count = 8) {
    this.processor?.port.postMessage({ type: 'meter-request', nodeId, count });
  }

  captureSnapshot(nodeId) {
    if (!this.processor || !this.running) return Promise.reject(new Error('Start audio before exporting a take.'));
    if (this.pendingCapture) return Promise.reject(new Error('Capture export is already in progress.'));
    return new Promise((resolve, reject) => {
      const pending = { resolve, reject, timeout: null };
      pending.timeout = setTimeout(() => {
        if (this.pendingCapture === pending) this.pendingCapture = null;
        reject(new Error('Capture export timed out.'));
      }, 10_000);
      this.pendingCapture = pending;
      this.processor.port.postMessage({ type: 'capture-request', nodeId });
    });
  }

  async stop() {
    for (const pending of this.pendingRoutes.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Audio stopped during a route change.'));
    }
    this.pendingRoutes.clear();
    this.ready = false;
    if (this.pendingCapture) {
      clearTimeout(this.pendingCapture.timeout);
      this.pendingCapture.reject(new Error('Audio stopped during capture export.'));
      this.pendingCapture = null;
    }
    this.oscillator?.stop();
    this.sourceStream?.getTracks().forEach((track) => track.stop());
    this.source?.disconnect();
    this.processor?.disconnect();
    this.analyser?.disconnect();
    await this.context?.close();
    this.context = this.processor = this.analyser = this.source = this.sourceStream = this.oscillator = null;
    this.parameters.clear();
    this.onStatus('Audio idle');
  }
}
