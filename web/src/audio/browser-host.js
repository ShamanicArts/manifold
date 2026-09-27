/** Browser devices, AudioWorklet lifecycle, and control transport. */
import { midiFrame } from './midi-timing.js';
import { parameterRoutes } from './parameter-routing.js';
import { analyzeMainTemporal } from '../graph/main-source.js';
export class BrowserAudioHost {
  constructor(onStatus, onMeters = () => {}, onEqResponse = () => {}, onMidiTrace = () => {}) {
    this.onStatus = onStatus;
    this.onMeters = onMeters;
    this.onEqResponse = onEqResponse;
    this.onMidiTrace = onMidiTrace;
    this.context = null;
    this.processor = null;
    this.analyser = null;
    this.source = null;
    this.sourceStream = null;
    this.sidechainSource = null;
    this.sidechainStream = null;
    this.sidechainOscillator = null;
    this.parameters = new Map();
    this.parameterValues = new Map();
    this.pendingCapture = null;
    this.pendingRoutes = new Map();
    this.nextRouteRequest = 1;
    this.pendingParameters = new Map();
    this.nextParameterRequest = 1;
    this.pendingPublishes = new Map();
    this.nextPublishRequest = 1;
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
      const temporalReachable = new Set(project.signal.nodes.filter((node) => node.type === 'output').map((node) => node.id));
      for (let changed = true; changed;) {
        changed = false;
        for (const edge of project.signal.connections) {
          if (temporalReachable.has(edge.to) && !temporalReachable.has(edge.from)) {
            temporalReachable.add(edge.from);
            changed = true;
          }
        }
      }
      const temporalRecipes = project.id === 'manifold.graph-workspace'
        ? (project.graphTemporal ?? []).filter((entry) => temporalReachable.has(entry.nodeId)) : [];
      if (temporalRecipes.length) this.onStatus('Preparing Main source motion in Rust/Wasm…');
      const temporals = await Promise.all(temporalRecipes.map(async (entry) => {
        const source = project.graphAssets?.find((asset) => asset.nodeId === entry.nodeId);
        if (!source) throw new Error(`Main bank ${entry.nodeId} needs a source for temporal motion.`);
        return { nodeId: entry.nodeId, ...await analyzeMainTemporal(source, entry) };
      }));
      const processor = new AudioWorkletNode(context, 'manifold-project', {
        numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2],
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
          if (data.type === 'eq8-response') this.onEqResponse(data.nodeId, data.values);
          if (data.type === 'midi-trace') this.onMidiTrace(data.events);
          if (data.type === 'partials-applied' && !data.accepted) this.onStatus('Partial set rejected by Rust. Previous sound preserved.');
          if (data.type === 'temporal-applied' && !data.accepted) this.onStatus('Temporal spectra rejected by Rust. Previous sound preserved.');
          if (data.type === 'route-applied') {
            const pending = this.pendingRoutes.get(data.requestId);
            if (pending) {
              this.pendingRoutes.delete(data.requestId);
              clearTimeout(pending.timeout);
              data.accepted ? pending.resolve() : pending.reject(new Error('Rust rejected this control route.'));
            }
          }
          if (data.type === 'parameter-applied') {
            const pending = this.pendingParameters.get(data.requestId);
            if (pending) {
              this.pendingParameters.delete(data.requestId);
              clearTimeout(pending.timeout);
              data.accepted ? pending.resolve() : pending.reject(new Error('Rust rejected this node parameter.'));
            }
          }
          if (data.type === 'capture-published') {
            const pending = this.pendingPublishes.get(data.requestId);
            if (pending) {
              this.pendingPublishes.delete(data.requestId);
              clearTimeout(pending.timeout);
              clearTimeout(pending.poll);
              if (!data.accepted && pending.live) this.processor?.port.postMessage({
                type: 'capture-stage-cancel', captureId: pending.captureId,
              });
              data.accepted
                ? pending.resolve(pending.live ? { sourceRate: data.sourceRate, stereo: pending.stereo } : undefined)
                : pending.reject(new Error(data.message ?? (pending.live
                  ? 'Rust rejected the recording window publication.'
                  : 'Rust rejected the capture publication. Stop recording and try again.')));
            }
          }
          if (data.type === 'capture-stage-commit-started') {
            const pending = this.pendingPublishes.get(data.requestId);
            if (pending?.live) this.processor.port.postMessage({
              type: 'capture-stage-commit-status', requestId: data.requestId,
            });
          }
          if (data.type === 'capture-stage-commit-status') {
            const pending = this.pendingPublishes.get(data.requestId);
            if (pending?.live) {
              if (data.state === 1) {
                pending.poll = setTimeout(() => {
                  if (this.pendingPublishes.has(data.requestId)) this.processor?.port.postMessage({
                    type: 'capture-stage-commit-status', requestId: data.requestId,
                  });
                }, 10);
              } else if (data.state === 2) {
                this.processor.port.postMessage({ type: 'capture-stage-commit-final', requestId: data.requestId });
              } else {
                this.pendingPublishes.delete(data.requestId);
                clearTimeout(pending.timeout);
                this.processor.port.postMessage({ type: 'capture-stage-cancel', captureId: pending.captureId });
                pending.reject(new Error('Recording window was reset during source preparation.'));
              }
            }
          }
          if (data.type === 'capture-stage-started' || data.type === 'capture-stage-status' || data.type === 'capture-stage-chunk') {
            const pending = this.pendingPublishes.get(data.requestId);
            if (pending?.live) {
              if (data.type === 'capture-stage-started') {
                if (data.accepted) this.processor.port.postMessage({ type: 'capture-stage-status', requestId: data.requestId, captureId: pending.captureId });
                else {
                  this.pendingPublishes.delete(data.requestId);
                  clearTimeout(pending.timeout);
                  pending.reject(new Error('Start recording before publishing its current window.'));
                }
              } else if (data.type === 'capture-stage-status') {
                if (data.state === 1) {
                  pending.poll = setTimeout(() => {
                    if (this.pendingPublishes.has(data.requestId)) this.processor?.port.postMessage({ type: 'capture-stage-status', requestId: data.requestId, captureId: pending.captureId });
                  }, 10);
                } else if (data.state === 2 && data.frames > 0) {
                  pending.stereo = new Float32Array(data.frames * 2);
                  this.processor.port.postMessage({ type: 'capture-stage-chunk', requestId: data.requestId,
                    captureId: pending.captureId, offset: 0, frames: Math.min(data.frames, 16384) });
                } else {
                  this.pendingPublishes.delete(data.requestId);
                  clearTimeout(pending.timeout);
                  pending.reject(new Error('Recording window was reset during publication.'));
                }
              } else {
                pending.stereo.set(data.stereo, data.offset * 2);
                const next = data.offset + data.stereo.length / 2;
                if (next < pending.stereo.length / 2) {
                  this.processor.port.postMessage({ type: 'capture-stage-chunk', requestId: data.requestId,
                    captureId: pending.captureId, offset: next, frames: Math.min(pending.stereo.length / 2 - next, 16384) });
                } else {
                  this.processor.port.postMessage({ type: 'capture-stage-commit-bounded', requestId: data.requestId,
                    captureId: pending.captureId, instrumentId: pending.instrumentId });
                }
              }
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
      const prepareValues = project.parameters.filter((parameter) => parameter.prepareOnly || project.id === 'manifold.standalone-eq8')
        .map((parameter) => ({ nodeId: parameter.nodeId, id: parameter.nodeParameterId,
          value: values.get(parameter.id) ?? parameter.default }));
      const graph = { ...project.signal,
        initialParameters: [...(project.signal.initialParameters ?? []), ...prepareValues] };
      const slot = project.signal.nodes.find((node) => ['effect-slot', 'effect-slot-legacy', 'effect-slot-host-switch'].includes(node.type));
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
      const reachable = new Set(graph.nodes.filter((node) => node.type === 'output').map((node) => node.id));
      for (let changed = true; changed;) {
        changed = false;
        for (const edge of graph.connections) {
          if (reachable.has(edge.to) && !reachable.has(edge.from)) {
            reachable.add(edge.from);
            changed = true;
          }
        }
      }
      const uploads = (Array.isArray(sample) ? sample : sample ? [sample] : [])
        .filter((asset) => project.id !== 'manifold.graph-workspace' || reachable.has(asset.nodeId))
        .map((asset) => ({ nodeId: asset.nodeId ?? 2, sourceRate: asset.sourceRate, stereo: asset.stereo.slice() }));
      const partials = project.id === 'manifold.graph-workspace'
        ? (project.graphTargets ?? []).filter((target) => reachable.has(target.nodeId))
        : project.extraPartials?.length ? [project.partials, ...project.extraPartials] : project.partials ?? null;
      processor.port.postMessage({ type: 'init', wasmBytes, graph, samples: uploads, partials, temporals },
        [wasmBytes, ...uploads.map((asset) => asset.stereo.buffer),
          ...temporals.flatMap((entry) => [entry.rawFrames.buffer, entry.rawRecipe.buffer])]);
      await ready;
      this.ready = true;
      this.parameters = new Map(project.parameters.map((parameter) => [parameter.id, parameter]));
      this.parameterValues = new Map(values);
      for (const [id, value] of values) this.setParameter(id, value);
      if (project.temporalTargets) {
        this.setTemporalTargets(project.temporalTargets);
      }
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
      this.source?.connect(processor, 0, 0);
      const sidechainKind = project.signal.sidechainSource ?? 'none';
      if (sidechainKind === 'microphone') {
        if (this.sourceStream) {
          this.sidechainSource = context.createMediaStreamSource(this.sourceStream);
        } else {
          this.sidechainStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false }, video: false });
          this.sidechainSource = context.createMediaStreamSource(this.sidechainStream);
        }
      } else if (sidechainKind === 'oscillator') {
        const oscillator = context.createOscillator();
        oscillator.type = 'triangle';
        oscillator.frequency.value = 330;
        const level = context.createGain();
        level.gain.value = 0.16;
        oscillator.connect(level);
        oscillator.start();
        this.sidechainOscillator = oscillator;
        this.sidechainSource = level;
      }
      this.sidechainSource?.connect(processor, 0, 1);
      this.onStatus(`Audio running · ${project.signal.inputSource === 'none' ? 'instrument' : kind === 'microphone' ? 'microphone' : 'test oscillator'}${sidechainKind === 'none' ? '' : ` + ${sidechainKind} sidechain`} · ${Math.round(context.sampleRate / 1000)} kHz`);
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  setParameter(id, value) {
    const parameter = this.parameters.get(id);
    if (!parameter) return;
    this.parameterValues.set(id, value);
    const updates = parameterRoutes(this.parameters, this.parameterValues, id);
    if (updates.length === 1) this.processor?.port.postMessage({ type: 'parameter', ...updates[0] });
    else if (updates.length) this.processor?.port.postMessage({ type: 'parameter-batch', updates });
    if (parameter.directionalParameterId != null) {
      this.processor?.port.postMessage({ type: 'directional-parameter', id: parameter.directionalParameterId, value });
    }
    if (parameter.pitchParameterId != null) {
      this.processor?.port.postMessage({ type: 'pitch-parameter', id: parameter.pitchParameterId, value });
    }
  }

  setPartials(partials) {
    if (!this.processor || !this.ready) return;
    this.processor.port.postMessage({ type: 'partials', nodeId: partials.nodeId, target: partials.target ?? 0,
      fundamental: partials.fundamental, values: partials.values });
  }

  setTemporalTargets(table) {
    if (!this.processor || !this.ready) return;
    if (table.rawFrames) {
      const packed = table.rawFrames.slice();
      const recipe = table.rawRecipe.slice();
      this.processor.port.postMessage({ type: 'temporal-frames', nodeId: 2,
        frames: table.frames, packed, recipe }, [packed.buffer, recipe.buffer]);
    } else {
      const values = table.values.slice();
      this.processor.port.postMessage({ type: 'temporal-targets', nodeId: 2,
        frames: table.frames, values }, [values.buffer]);
    }
    this.processor.port.postMessage({ type: 'temporal-speed', nodeId: 2, speed: table.speed });
  }

  clearTemporalTargets() {
    this.processor?.port.postMessage({ type: 'temporal-clear', nodeId: 2 });
  }

  setTemporalSpeed(speed, nodeId = 2) {
    this.processor?.port.postMessage({ type: 'temporal-speed', nodeId, speed });
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

  setNodeParameter(nodeId, id, value) {
    if (!this.processor || !this.ready) return Promise.reject(new Error('Wait for audio to start before changing a node parameter.'));
    return new Promise((resolve, reject) => {
      const requestId = this.nextParameterRequest++;
      const timeout = setTimeout(() => {
        if (this.pendingParameters.delete(requestId)) reject(new Error('Node parameter update timed out.'));
      }, 4_000);
      this.pendingParameters.set(requestId, { resolve, reject, timeout });
      this.processor.port.postMessage({ type: 'parameter-request', requestId, nodeId, id, value });
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

  requestMidiTrace() {
    this.processor?.port.postMessage({ type: 'midi-trace-request' });
  }

  requestEqResponse(nodeId = 2) {
    this.processor?.port.postMessage({ type: 'eq8-response-request', nodeId });
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

  publishCapture(captureId, instrumentId) {
    return this.publishCaptureRequest(captureId, instrumentId, false);
  }

  publishLiveCapture(captureId, instrumentId, window = 0) {
    return this.publishCaptureRequest(captureId, instrumentId, true, window);
  }

  publishCaptureRequest(captureId, instrumentId, live, window = 0) {
    if (!this.processor || !this.ready) return Promise.reject(new Error('Start audio before publishing a take.'));
    if (live && [...this.pendingPublishes.values()].some((pending) => pending.live)) {
      return Promise.reject(new Error('A recording window is already being published.'));
    }
    return new Promise((resolve, reject) => {
      const requestId = this.nextPublishRequest++;
      const timeout = setTimeout(() => {
        if (this.pendingPublishes.delete(requestId)) {
          if (live) this.processor?.port.postMessage({ type: 'capture-stage-cancel', captureId });
          reject(new Error('Capture publication timed out.'));
        }
      }, 10_000);
      this.pendingPublishes.set(requestId, { resolve, reject, timeout, live, captureId, instrumentId, stereo: null, poll: null });
      const timing = typeof window === 'number' ? { windowSeconds: window } : window;
      this.processor.port.postMessage({ type: live ? 'capture-publish-live' : 'capture-publish', requestId, captureId, instrumentId, ...timing });
    });
  }

  async stop() {
    for (const pending of this.pendingRoutes.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Audio stopped during a route change.'));
    }
    this.pendingRoutes.clear();
    for (const pending of this.pendingParameters.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Audio stopped during a node parameter change.'));
    }
    this.pendingParameters.clear();
    for (const pending of this.pendingPublishes.values()) {
      clearTimeout(pending.timeout);
      clearTimeout(pending.poll);
      pending.reject(new Error('Audio stopped during capture publication.'));
    }
    this.pendingPublishes.clear();
    this.ready = false;
    if (this.pendingCapture) {
      clearTimeout(this.pendingCapture.timeout);
      this.pendingCapture.reject(new Error('Audio stopped during capture export.'));
      this.pendingCapture = null;
    }
    this.oscillator?.stop();
    this.sidechainOscillator?.stop();
    this.sourceStream?.getTracks().forEach((track) => track.stop());
    this.sidechainStream?.getTracks().forEach((track) => track.stop());
    this.source?.disconnect();
    this.sidechainSource?.disconnect();
    this.processor?.disconnect();
    this.analyser?.disconnect();
    await this.context?.close();
    this.context = this.processor = this.analyser = this.source = this.sourceStream = this.oscillator = null;
    this.sidechainSource = this.sidechainStream = this.sidechainOscillator = null;
    this.parameters.clear();
    this.onStatus('Audio idle');
  }
}
