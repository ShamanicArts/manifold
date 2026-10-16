import { PORT_CATALOG } from './catalog.generated.js';
import { GraphWorkspace } from './index.js';
import { PreparedGraphRuntime } from './prepared-runtime.js';
import { decodeSampleAsset } from './sample-assets.js';
import { allocateGraphTransport, LIVE_RECORD_BYTES, RING_BLOCKS, OUTPUT_LATENCY_BLOCKS,
  PUBLISH_REQUEST_WORD, WORKER_TIMING_SAMPLES,
  EVENT_CAPACITY, EVENT_WORDS, EVENT_WORDS_PER_WORKER, BRIDGE_MISS_RECORDS, BRIDGE_MISS_WORDS } from './worker-transport.js';

const KIND_CODES = Object.fromEntries(Object.entries(PORT_CATALOG).map(([id, spec]) => [id, spec.code]));
const WORKER_LIVE_KINDS = new Set(['input.raw', 'input.sidechain', 'output', 'gain',
  'fixed-gain', 'sum2', 'stereo-widener', 'distortion']);
const TRANSFER_KINDS = new Set(['gain', 'stereo-widener']);
const sharedWorkletModules = new WeakMap();

function timingProfile(buffer, slot) {
  const timing = new Int32Array(buffer);
  const base = slot * (2 + WORKER_TIMING_SAMPLES);
  const count = Math.min(Atomics.load(timing, base), WORKER_TIMING_SAMPLES);
  if (!count) return null;
  const values = [];
  for (let index = 0; index < count; index++) values.push(Atomics.load(timing, base + 2 + index));
  values.sort((a, b) => a - b);
  const at = p => values[Math.ceil(count * p) - 1];
  return { blocks: count, p50Us: at(0.5), p95Us: at(0.95), p99Us: at(0.99), maxUs: Atomics.load(timing, base + 1) };
}

function liveIdentity(previous, next) {
  const oldNodes = new Map(previous.signal.nodes.map(node => [node.id, node.type]));
  const nextNodes = new Map(next.signal.nodes.map(node => [node.id, node.type]));
  const oldNamed = new Map((previous.instances ?? []).map(instance => [instance.path, instance.nodeId]));
  const oldNamedIds = new Set(oldNamed.values());
  const nextNamedIds = new Set((next.instances ?? []).map(instance => instance.nodeId));
  const pairs = [];
  const usedOld = new Set();
  for (const instance of next.instances ?? []) {
    const previousId = oldNamed.get(instance.path);
    const type = nextNodes.get(instance.nodeId);
    if (previousId !== undefined && oldNodes.get(previousId) === type
      && TRANSFER_KINDS.has(type)) {
      pairs.push({ previousId, nextId: instance.nodeId });
      usedOld.add(previousId);
    }
  }
  for (const [nextId, type] of nextNodes) {
    if (!TRANSFER_KINDS.has(type) || nextNamedIds.has(nextId)
      || oldNamedIds.has(nextId) || usedOld.has(nextId)
      || oldNodes.get(nextId) !== type) continue;
    pairs.push({ previousId: nextId, nextId });
  }
  return pairs;
}

function addSharedWorkletModule(context, url) {
  let modules = sharedWorkletModules.get(context);
  if (!modules) { modules = new Map(); sharedWorkletModules.set(context, modules); }
  const key = String(url);
  if (!modules.has(key)) {
    const loading = context.audioWorklet.addModule(url).catch(error => {
      modules.delete(key);
      throw error;
    });
    modules.set(key, loading);
  }
  return modules.get(key);
}

/** Browser device adapter for a plain authored graph. The caller owns AudioContext and I/O. */
export class BrowserGraphHost {
  #context;
  #workletUrl;
  #wasmUrl;
  #node = null;
  #source = null;
  #sidechainSource = null;
  #pending = new Map();
  #nextRequest = 1;
  #ready = false;
  #armedCaptureId = null;
  #workerMode;
  #workerUrl;
  #workerWorkletUrl;
  #transport = null;
  #wasmBytes = null;
  #activeWorker = null;
  #candidateWorker = null;
  #activeSlot = 0;
  #replaceBusy = false;
  #commandPending = false;
  #currentProject = null;
  #lastPreparationMs = null;
  #lastPublicationMs = null;
  #lastTransferredNodes = null;
  #profiling;
  #nextWorkerGeneration = 1;
  #retiredWorkers = new Map();
  #lastRetirementMs = null;
  #preparedRuntime = null;

  constructor(context, { workletUrl = new URL('./runtime/filter-processor.js', import.meta.url),
    wasmUrl = new URL('./runtime/manifold_filter.wasm', import.meta.url),
    execution = 'worklet', workerUrl = null,
    workerWorkletUrl = new URL('./shared-graph-processor.js', import.meta.url), profiling = false,
    preparedWasmUrl = new URL('./runtime/manifold_prepared.wasm', import.meta.url),
    preparedWorkletUrl = new URL('./prepared-processor.js', import.meta.url), preparedCompilerUrl = null } = {}) {
    if (!context?.audioWorklet) {
      throw new TypeError('An AudioContext is required');
    }
    if (execution !== 'worklet' && execution !== 'worker' && execution !== 'prepared') {
      throw new TypeError(`Unknown graph execution mode: ${execution}`);
    }
    this.#context = context;
    this.#workletUrl = workletUrl;
    this.#wasmUrl = wasmUrl;
    this.#workerMode = execution !== 'worklet';
    if (execution === 'prepared') {
      if (typeof SharedArrayBuffer === 'undefined' || !globalThis.crossOriginIsolated) throw new Error('Prepared execution requires a cross-origin isolated document');
      this.#preparedRuntime = new PreparedGraphRuntime(context, { wasmUrl: preparedWasmUrl, workletUrl: preparedWorkletUrl, compilerUrl: preparedCompilerUrl });
    }
    this.#workerUrl = workerUrl;
    this.#workerWorkletUrl = workerWorkletUrl;
    this.#profiling = Boolean(profiling);
  }

  get ready() { return this.#preparedRuntime?.ready ?? this.#ready; }
  get ioLayout() { return this.#preparedRuntime?.current?.project.signal.io ?? null; }
  connectInput(busId, source, sourceOutput = 0) {
    if (!this.#preparedRuntime) throw new Error('Declared buses require prepared browser execution');
    this.#preparedRuntime.connectInput(busId,source,sourceOutput); return this;
  }
  connectOutput(busId, destination, destinationInput = 0) {
    if (!this.#preparedRuntime) throw new Error('Declared buses require prepared browser execution');
    this.#preparedRuntime.connectOutput(busId,destination,destinationInput); return this;
  }

  get diagnostics() {
    if (this.#preparedRuntime) return this.#preparedRuntime.diagnostics;
    if (!this.#transport) return null;
    const control = new Int32Array(this.#transport.control);
    const diagnostics = new Int32Array(this.#transport.bridgeDiagnostics);
    const trace = new Int32Array(this.#transport.bridgeMisses);
    const total = Atomics.load(trace, 0);
    const recentUnderruns = [];
    for (let event = Math.max(1, total - BRIDGE_MISS_RECORDS + 1); event <= total; event++) {
      const row = 1 + ((event - 1) % BRIDGE_MISS_RECORDS) * BRIDGE_MISS_WORDS;
      if (Atomics.load(trace, row) !== event) continue;
      const record = { audioSequence: Atomics.load(trace, row + 1), target: Atomics.load(trace, row + 2),
        activeSlot: Atomics.load(trace, row + 3), outputTag: Atomics.load(trace, row + 4),
        renderedSequence: Atomics.load(trace, row + 5),
        reason: ['unknown', 'worker-late', 'missing-output', 'frame-mismatch'][Atomics.load(trace, row + 6)],
        pendingPublication: Atomics.load(trace, row + 7), contextFrame: Atomics.load(trace, row + 8) };
      if (Atomics.load(trace, row) === event) recentUnderruns.push(record);
    }
    return { execution: 'worker', audioBlocks: Atomics.load(control, 0), underruns: Atomics.load(control, 4),
      pendingRetirements: this.#retiredWorkers.size, lastRetirementMs: this.#lastRetirementMs,
      deferredPublicationBlocks: Atomics.load(diagnostics, 0), publications: Atomics.load(diagnostics, 1),
      lastPublicationTarget: Atomics.load(diagnostics, 2), maxRenderLagBlocks: Atomics.load(diagnostics, 3),
      workerLateBlocks: Atomics.load(diagnostics, 4), missingOutputBlocks: Atomics.load(diagnostics, 5),
      frameMismatchBlocks: Atomics.load(diagnostics, 6), startupMutedBlocks: Atomics.load(diagnostics, 7),
      recentUnderruns,
      activeSlot: Atomics.load(control, 3), outputLatencyBlocks: OUTPUT_LATENCY_BLOCKS,
      lastPreparationMs: this.#lastPreparationMs, lastPublicationMs: this.#lastPublicationMs,
      lastTransferredNodes: this.#lastTransferredNodes };
  }

  /** Wasm processing time in the active DSP worker; excludes audio callback copying. */
  get workerProfile() {
    if (this.#preparedRuntime) return null;
    if (!this.#transport) return null;
    const profile = timingProfile(this.#transport.workerTiming, this.#activeSlot);
    return profile && { ...profile, service: timingProfile(this.#transport.workerServiceTiming, this.#activeSlot) };
  }

  async prepare(project, { patchable = true } = {}) {
    if (this.#preparedRuntime) { await this.#preparedRuntime.prepare(project); return this; }
    if (this.#node) throw new Error('Graph host is already prepared');
    GraphWorkspace.fromProject(project).captureRingBytes(this.#context.sampleRate);
    if (project.signal.io) throw new Error('Declared buses require prepared browser execution');
    if (this.#workerMode) return this.#prepareWorker(project);
    const samples = (project.assets ?? []).map(decodeSampleAsset);
    await this.#context.audioWorklet.addModule(this.#workletUrl);
    const response = await fetch(this.#wasmUrl);
    if (!response.ok) throw new Error(`Wasm fetch failed: ${response.status}`);
    const wasmBytes = await response.arrayBuffer();
    const node = new AudioWorkletNode(this.#context, 'manifold-project', {
      numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2],
    });
    this.#node = node;
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Graph preparation timed out')), 10_000);
        const settle = (callback, value) => { clearTimeout(timeout); callback(value); };
        node.onprocessorerror = () => settle(reject, new Error('AudioWorklet processor failed'));
        node.port.onmessage = ({ data }) => {
          if (data.type === 'ready') {
            this.#ready = true;
            settle(resolve);
          } else if (data.type === 'error') {
            if (!this.#ready) settle(reject, new Error(data.message));
            else this.#rejectAll(new Error(data.message));
          } else if (data.type === 'loop-snapshot-empty' || data.type === 'capture-stage-started' || data.type === 'capture-stage-status'
            || data.type === 'capture-stage-chunk' || data.type === 'capture-published') {
            this.#captureMessage(data);
          } else if (data.type === 'capture-free-armed') {
            const pending = this.#pending.get(data.requestId);
            if (pending?.kind === 'freeArm') {
              if (data.accepted) this.#armedCaptureId = pending.captureId;
              this.#finish(data.requestId, data.accepted ? null : new Error('Free capture source unavailable'),
                data.accepted ? { startOffset: data.startOffset, capacity: data.capacity } : undefined);
            }
          } else if (data.type === 'capture-cursor') {
            this.#finish(data.requestId, data.accepted ? null : new Error('Capture source unavailable'),
              data.accepted ? { startOffset: data.startOffset, capacity: data.capacity } : undefined);
          } else if (data.type === 'sample-replace-started' || data.type === 'sample-replace-progress'
            || data.type === 'sample-replaced') {
            this.#sampleMessage(data);
          } else if (data.type === 'route-applied' || data.type === 'parameter-applied'
            || data.type === 'parameter-batch-applied') {
            const pending = this.#pending.get(data.requestId);
            if (!pending) return;
            this.#pending.delete(data.requestId);
            clearTimeout(pending.timeout);
            data.accepted ? pending.resolve() : pending.reject(new Error('Rust rejected the graph edit'));
          }
        };
        node.port.postMessage({ type: 'init', wasmBytes, graph: { ...project.signal, patchable },
        kindCodes: KIND_CODES, samples, sampleBindings: project.sampleBindings ?? [] },
        [wasmBytes, ...samples.map(asset => asset.stereo.buffer)]);
      });
    } catch (error) {
      this.close();
      throw error;
    }
    this.#currentProject = structuredClone(project);
    return this;
  }

  connect(source, destination = this.#context.destination, sidechainSource = null) {
    if (this.#preparedRuntime) { this.#preparedRuntime.connect(source, destination, sidechainSource); return this; }
    if (!this.#ready) throw new Error('Prepare the graph before connecting audio');
    if (this.#source) this.#source.disconnect(this.#node);
    if (this.#sidechainSource) this.#sidechainSource.disconnect(this.#node);
    this.#node.disconnect();
    this.#source = source ?? null;
    this.#sidechainSource = sidechainSource;
    source?.connect(this.#node, 0, 0);
    sidechainSource?.connect(this.#node, 0, 1);
    this.#node.connect(destination);
    return this;
  }

  #request(type, payload) {
    if (!this.#ready) return Promise.reject(new Error('Graph host is not ready'));
    if (this.#workerMode) return this.#workerCommand(type, payload);
    const requestId = this.#nextRequest++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(requestId);
        reject(new Error('Graph edit timed out'));
      }, 4_000);
      this.#pending.set(requestId, { resolve, reject, timeout });
      this.#node.port.postMessage({ type, requestId, ...payload });
    });
  }

  #workerCommand(type, payload) {
    if (!this.#activeWorker || !['route', 'parameter-request', 'parameter-batch-request'].includes(type)) {
      return Promise.reject(new Error('This worker graph command is not available'));
    }
    if (this.#commandPending || this.#replaceBusy) {
      return Promise.reject(new Error('Another graph edit is pending'));
    }
    const words = new Int32Array(this.#activeWorker.manifoldCommands);
    const floats = new Float32Array(this.#activeWorker.manifoldCommands);
    const base = 0;
    if (Atomics.load(words, base) !== Atomics.load(words, base + 1)) {
      return Promise.reject(new Error('A graph control command is pending'));
    }
    const requestId = this.#nextRequest++;
    if (type === 'parameter-batch-request') {
      if (!Array.isArray(payload.updates) || payload.updates.length < 1
        || payload.updates.length > (words.length - 8) / 3
        || payload.updates.some(update => !Number.isInteger(update.nodeId)
          || !Number.isInteger(update.id) || !Number.isFinite(update.value))) {
        return Promise.reject(new TypeError('Invalid parameter batch'));
      }
      Atomics.store(words, base + 3, 3);
      Atomics.store(words, base + 4, payload.updates.length);
      for (let index = 0; index < payload.updates.length; index++) {
        const offset = base + 8 + index * 3;
        words[offset] = payload.updates[index].nodeId;
        words[offset + 1] = payload.updates[index].id;
        floats[offset + 2] = payload.updates[index].value;
      }
    } else if (type === 'parameter-request') {
      if (!Number.isInteger(payload.nodeId) || !Number.isInteger(payload.id)
        || !Number.isFinite(payload.value)) return Promise.reject(new TypeError('Invalid parameter command'));
      Atomics.store(words, base + 3, 1);
      Atomics.store(words, base + 4, payload.nodeId);
      Atomics.store(words, base + 5, payload.id);
      floats[base + 7] = payload.value;
    } else {
      if (![payload.to, payload.port, payload.from ?? 0, payload.outputPort ?? 0]
        .every(Number.isInteger)) return Promise.reject(new TypeError('Invalid route command'));
      Atomics.store(words, base + 3, 2);
      Atomics.store(words, base + 4, payload.to);
      Atomics.store(words, base + 5, payload.port);
      Atomics.store(words, base + 6, payload.from ?? 0);
      Atomics.store(words, base + 7, payload.outputPort ?? 0);
    }
    Atomics.store(words, base + 2, 0);
    Atomics.store(words, base, requestId);
    Atomics.notify(new Int32Array(this.#transport.control), 0);
    this.#commandPending = true;
    return new Promise((resolve, reject) => {
      const deadline = performance.now() + 4_000;
      const poll = () => {
        if (!this.#node || !this.#activeWorker) return reject(new Error('Graph worker stopped'));
        if (Atomics.load(words, base + 1) === requestId) {
          return Atomics.load(words, base + 2) === 1
            ? resolve() : reject(new Error('Rust rejected the graph edit'));
        }
        if (performance.now() > deadline) return reject(new Error('Graph control timed out'));
        setTimeout(poll, 2);
      };
      poll();
    }).finally(() => { this.#commandPending = false; });
  }

  #finish(requestId, error = null, value = undefined) {
    const pending = this.#pending.get(requestId);
    if (!pending) return;
    this.#pending.delete(requestId);
    clearTimeout(pending.timeout);
    clearTimeout(pending.poll);
    if (error && pending.kind === 'capture') {
      this.#node?.port.postMessage({ type: 'capture-stage-cancel', captureId: pending.captureId });
    }
    if (error && pending.kind === 'sample') {
      this.#node?.port.postMessage({ type: 'sample-replace-cancel', requestId });
    }
    error ? pending.reject(error) : pending.resolve(value);
  }

  #captureMessage(data) {
    const pending = this.#pending.get(data.requestId);
    if (pending?.kind !== 'capture') return;
    const requestId = data.requestId;
    const captureId = pending.captureId;
    if (data.type === 'loop-snapshot-empty') {
      this.#finish(requestId, null, { sourceRate: this.#context.sampleRate, stereo: new Float32Array(0) });
    } else if (data.type === 'capture-published' || (data.type === 'capture-stage-started' && !data.accepted)) {
      this.#finish(requestId, new Error(data.message ?? 'Capture window was unavailable'));
    } else if (data.type === 'capture-stage-started') {
      if (pending.freeStop) this.#armedCaptureId = null;
      this.#node.port.postMessage({ type: 'capture-stage-status', requestId, captureId });
    } else if (data.type === 'capture-stage-status') {
      if (data.state === 1) {
        pending.poll = setTimeout(() => this.#node?.port.postMessage({ type: 'capture-stage-status',
          requestId, captureId }), 10);
      } else if (data.state === 2 && data.frames > 0) {
        pending.stereo = new Float32Array(data.frames * 2);
        this.#node.port.postMessage({ type: 'capture-stage-chunk', requestId, captureId,
          offset: 0, frames: Math.min(data.frames, 16384) });
      } else this.#finish(requestId, new Error('Capture window was reset'));
    } else if (data.type === 'capture-stage-chunk') {
      pending.stereo.set(data.stereo, data.offset * 2);
      const next = data.offset + data.stereo.length / 2;
      const frames = pending.stereo.length / 2;
      if (next < frames) this.#node.port.postMessage({ type: 'capture-stage-chunk',
        requestId, captureId, offset: next, frames: Math.min(frames - next, 16384) });
      else {
        this.#node.port.postMessage({ type: 'capture-stage-cancel', captureId });
        this.#finish(requestId, null, { sourceRate: this.#context.sampleRate, stereo: pending.stereo });
      }
    }
  }

  #sampleMessage(data) {
    const pending = this.#pending.get(data.requestId);
    if (pending?.kind !== 'sample') return;
    if (data.type === 'sample-replace-started' || (data.type === 'sample-replace-progress' && !data.done)) {
      this.#node.port.postMessage({ type: 'sample-replace-step', requestId: data.requestId });
    } else if (data.type === 'sample-replace-progress') {
      this.#node.port.postMessage({ type: 'sample-replace-commit', requestId: data.requestId });
    } else if (data.type === 'sample-replaced') {
      this.#finish(data.requestId, data.accepted ? null : new Error(data.message ?? 'Sample replacement failed'));
    }
  }

  /** Freeze a chronological window of a registered retrospective source. */
  captureWindow(captureId, window = 1) {
    if (this.#preparedRuntime) return this.#preparedRuntime.captureWindow(captureId, window);
    if (this.#workerMode) return Promise.reject(new Error('Worker graph capture is not installed'));
    if (!this.#ready) return Promise.reject(new Error('Prepare the graph before capturing'));
    const timing = typeof window === 'number' ? { windowSeconds: window } : window;
    const bars = timing && 'windowBars' in timing;
    const freeStop = timing?.freeStop === true;
    const manualFree = timing && Object.hasOwn(timing, 'manualStartOffsetFrames');
    if (!Number.isInteger(captureId) || captureId < 1 || !timing || typeof timing !== 'object'
      || (freeStop ? this.#armedCaptureId !== captureId : manualFree
        ? !Number.isSafeInteger(timing.manualStartOffsetFrames)
          || timing.manualStartOffsetFrames === 0
          || this.#armedCaptureId !== null : bars
        ? !(Number.isFinite(timing.windowBars) && timing.windowBars > 0
        && Number.isFinite(timing.tempoBpm)
        && timing.tempoBpm >= 20 && timing.tempoBpm <= 300)
        : !(Number.isFinite(timing.windowSeconds) && timing.windowSeconds > 0))) {
      return Promise.reject(new RangeError('Invalid capture window'));
    }
    if ([...this.#pending.values()].some(pending => pending.kind === 'capture')) {
      return Promise.reject(new Error('A capture window is already being exported'));
    }
    const requestId = this.#nextRequest++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#finish(requestId, new Error('Capture window timed out'));
      }, 20_000);
      this.#pending.set(requestId, { kind: 'capture', captureId, freeStop, resolve, reject,
        timeout, poll: null });
      this.#node.port.postMessage({ type: 'capture-publish-live', requestId,
        captureId, ...timing });
    });
  }

  /** Copy a stopped Loop Capture take through the prepared, bounded staging path. */
  snapshotLoop(captureId) {
    if (this.#preparedRuntime) return this.#preparedRuntime.snapshotLoop(captureId);
    if (this.#workerMode) return Promise.reject(new Error('Worker graph capture is not installed'));
    if (!this.#ready || !Number.isInteger(captureId) || captureId < 1) {
      return Promise.reject(new Error('Prepare a loop graph before snapshotting'));
    }
    if ([...this.#pending.values()].some(pending => pending.kind === 'capture')) {
      return Promise.reject(new Error('A capture is already being exported'));
    }
    const requestId = this.#nextRequest++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => this.#finish(requestId,
        new Error('Loop snapshot timed out')), 30_000);
      this.#pending.set(requestId, { kind: 'capture', captureId, resolve, reject,
        timeout, poll: null });
      this.#node.port.postMessage({ type: 'loop-snapshot-start', requestId, captureId });
    });
  }

  armFreeCapture(captureId) {
    if (this.#workerMode) return Promise.reject(new Error('Worker graph capture is not installed'));
    if (!this.#ready) return Promise.reject(new Error('Prepare the graph before arming capture'));
    if (!Number.isInteger(captureId) || captureId < 1 || this.#armedCaptureId !== null
      || [...this.#pending.values()].some(pending => pending.kind === 'freeArm')) {
      return Promise.reject(new Error('A free capture is already armed or the source is invalid'));
    }
    const requestId = this.#nextRequest++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => this.#finish(requestId,
        new Error('Free capture arm timed out')), 10_000);
      this.#pending.set(requestId, { kind: 'freeArm', captureId, resolve, reject, timeout });
      this.#node.port.postMessage({ type: 'capture-free-arm', requestId, captureId });
    });
  }

  /** Read a prepared ring cursor off the audio thread for a manual Free start. */
  captureCursor(captureId) {
    if (this.#preparedRuntime) return this.#preparedRuntime.captureCursor(captureId);
    if (this.#workerMode) return Promise.reject(new Error('Worker graph capture is not installed'));
    if (!Number.isInteger(captureId) || captureId < 1) {
      return Promise.reject(new RangeError('Invalid capture source'));
    }
    return this.#request('capture-cursor-request', { captureId });
  }

  cancelFreeCapture() {
    this.#armedCaptureId = null;
    if (this.#workerMode) return;
    this.#node?.port.postMessage({ type: 'capture-free-cancel' });
  }

  /** Publish decoded PCM to one Sample Region and its named shared bindings. */
  replaceSample(nodeId, sourceRate, stereo, bindingTargets = []) {
    if (this.#workerMode) return Promise.reject(new Error('Worker graph sample replacement is not installed'));
    if (!this.#ready) return Promise.reject(new Error('Prepare the graph before replacing a sample'));
    if (!Number.isInteger(nodeId) || nodeId < 1 || !(stereo instanceof Float32Array)
      || stereo.length < 2 || stereo.length % 2 || !Number.isFinite(sourceRate)
      || !Array.isArray(bindingTargets) || bindingTargets.some(id => !Number.isInteger(id) || id < 1)) {
      return Promise.reject(new TypeError('Invalid decoded Sample source'));
    }
    if ([...this.#pending.values()].some(pending => pending.kind === 'sample')) {
      return Promise.reject(new Error('A sample replacement is already running'));
    }
    const requestId = this.#nextRequest++;
    const transfer = stereo.slice();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#finish(requestId, new Error('Sample replacement timed out'));
      }, 20_000);
      this.#pending.set(requestId, { kind: 'sample', resolve, reject, timeout });
      this.#node.port.postMessage({ type: 'sample-replace-begin', requestId,
        nodeId, sourceRate, stereo: transfer, bindingTargets }, [transfer.buffer]);
    });
  }

  readPublishedParameters() {
    if (this.#preparedRuntime) return this.#preparedRuntime.readPublishedParameters();
    if (!this.#ready || !this.#currentProject) throw new Error('Graph host is not ready');
    return structuredClone(this.#currentProject.signal.initialParameters);
  }

  async setRoute({ to, inputPort, from = null, outputPort = 0 }) {
    if (this.#preparedRuntime) return this.#preparedRuntime.setRoute({ to, inputPort, from, outputPort });
    const graph = GraphWorkspace.fromProject(this.#currentProject);
    const targetNode = graph.find(to);
    const target = targetNode.input(graph.describeNode(targetNode).inputs[inputPort]?.name);
    graph.disconnect(target);
    if (from !== null) {
      const source = graph.find(from);
      graph.connect(source.output(graph.describeNode(source).outputs[outputPort]?.name), target);
    }
    graph.toProject();
    await this.#request('route', { to, port: inputPort, from, outputPort });
    // Other accepted routes may have changed while this request was in flight.
    const latest = GraphWorkspace.fromProject(this.#currentProject);
    const latestNode = latest.find(to);
    const latestTarget = latestNode.input(latest.describeNode(latestNode).inputs[inputPort]?.name);
    latest.disconnect(latestTarget);
    if (from !== null) {
      const source = latest.find(from);
      latest.connect(source.output(latest.describeNode(source).outputs[outputPort]?.name), latestTarget);
    }
    this.#currentProject.signal.connections = latest.toProject().signal.connections;
  }

  async setParameter({ nodeId, id, value }) {
    if (this.#preparedRuntime) return this.#preparedRuntime.setParameter({ nodeId, id, value });
    this.#validatePublishedParameters([{ nodeId, id, value }]);
    await this.#request('parameter-request', { nodeId, id, value });
    this.#commitPublishedParameters([{ nodeId, id, value }]);
  }

  async setParameterBatch(updates) {
    if (this.#preparedRuntime) return this.#preparedRuntime.setParameterBatch(updates);
    const submitted = updates.map(({ nodeId, id, value }) => ({ nodeId, id, value }));
    this.#validatePublishedParameters(submitted);
    await this.#request('parameter-batch-request', { updates: submitted });
    this.#commitPublishedParameters(submitted);
  }

  #validatePublishedParameters(edits) {
    if (!this.#ready || !this.#currentProject) throw new Error('Graph host is not ready');
    try {
      const graph = GraphWorkspace.fromProject(this.#currentProject);
      for (const edit of edits) graph.setParameter(graph.find(edit.nodeId), edit.id, edit.value);
    } catch (error) { throw new Error(`Graph edit rejected: ${error.message}`); }
  }

  #commitPublishedParameters(edits) {
    const graph = GraphWorkspace.fromProject(this.#currentProject);
    for (const edit of edits) graph.setParameter(graph.find(edit.nodeId), edit.id, edit.value);
    this.#currentProject.signal.initialParameters = graph.toProject().signal.initialParameters;
  }

  async #prepareWorker(project) {
    if (typeof SharedArrayBuffer === 'undefined' || !crossOriginIsolated) {
      throw new Error('Live graph publication requires a cross-origin isolated browser page');
    }
    this.#transport = allocateGraphTransport();
    await addSharedWorkletModule(this.#context, this.#workerWorkletUrl);
    const response = await fetch(this.#wasmUrl);
    if (!response.ok) throw new Error(`Wasm fetch failed: ${response.status}`);
    this.#wasmBytes = await response.arrayBuffer();
    const node = new AudioWorkletNode(this.#context, 'manifold-shared-graph', {
      numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2],
    });
    this.#node = node;
    node.onprocessorerror = () => {
      this.#ready = false;
      this.#rejectAll(new Error('Shared graph AudioWorklet failed'));
    };
    node.port.postMessage({ type: 'init', transport: this.#transport });
    try {
      this.#activeWorker = await this.#launchWorker(0, project);
      this.#candidateWorker = null;
      this.#lastPreparationMs = this.#activeWorker.manifoldPreparationMs;
      this.#activeSlot = 0;
      this.#currentProject = structuredClone(project);
      this.#ready = true;
      return this;
    } catch (error) {
      this.close();
      throw error;
    }
  }

  #launchWorker(slot, project, identity = undefined) {
    const workerGeneration = this.#nextWorkerGeneration++;
    Atomics.store(new Int32Array(this.#transport.workerEpochs), slot, workerGeneration);
    const worker = this.#workerUrl
      ? new Worker(this.#workerUrl, { type: 'module' })
      : new Worker(new URL('./graph-worker.js', import.meta.url), { type: 'module' });
    worker.manifoldGeneration = workerGeneration;
    worker.manifoldSlot = slot;
    // Each prepared graph owns its state storage. A replacement reads the old
    // graph's buffer and publishes into its own, sized before rendering starts.
    worker.manifoldCommands = new SharedArrayBuffer((8 + project.signal.initialParameters.length * 3) * Int32Array.BYTES_PER_ELEMENT);
    worker.manifoldLiveState = new SharedArrayBuffer(project.signal.nodes.length * LIVE_RECORD_BYTES * 2);
    this.#candidateWorker = worker;
    const ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Graph worker preparation timed out')), 10_000);
      let starting = true;
      worker.onerror = event => {
        event.preventDefault();
        const error = new Error(`Graph worker failed: ${event.message} at ${event.filename}:${event.lineno}`);
        if (starting) { starting = false; clearTimeout(timeout); reject(error); }
        else {
          if (worker === this.#activeWorker) this.#ready = false;
          this.#rejectAll(error);
        }
      };
      worker.onmessage = ({ data }) => {
        if (data.type === 'ready' && starting) {
          starting = false;
          clearTimeout(timeout);
          worker.manifoldPreparationMs = data.preparationMs;
          worker.manifoldTransferred = data.transferred;
          resolve(worker);
        } else if ((data.type === 'error' || data.type === 'fatal') && starting) {
          starting = false;
          clearTimeout(timeout);
          reject(new Error(data.message));
        } else if (data.type === 'fatal') {
          if (worker === this.#activeWorker) {
            this.#activeWorker = null;
            this.#ready = false;
          }
          this.#rejectAll(new Error(data.message));
        }
      };
      worker.postMessage({ type: 'init', wasmBytes: this.#wasmBytes,
        project, identity, sampleRate: this.#context.sampleRate,
        liveStateBuffer: worker.manifoldLiveState, commandBuffer: worker.manifoldCommands,
        previousLiveStateBuffer: identity === undefined ? null : this.#activeWorker.manifoldLiveState,
        transport: this.#transport, workerSlot: slot, profiling: this.#profiling, workerGeneration });
    });
    return ready.catch(error => {
      this.#stopWorker(worker);
      this.#retiredWorkers.set(slot, worker);
      worker.terminate();
      if (this.#candidateWorker === worker) this.#candidateWorker = null;
      throw error;
    });
  }

  #stopWorker(worker) {
    if (!worker || !this.#transport) return;
    Atomics.compareExchange(new Int32Array(this.#transport.workerEpochs),
      worker.manifoldSlot, worker.manifoldGeneration, 0);
    Atomics.notify(new Int32Array(this.#transport.control), 0);
  }

  async #finishRetirement(slot) {
    const worker = this.#retiredWorkers.get(slot);
    if (!worker) return true;
    const epochs = new Int32Array(this.#transport.workerEpochs);
    const started = performance.now();
    while (Atomics.load(epochs, 2 + slot) !== worker.manifoldGeneration) {
      if (!this.#transport || performance.now() - started > 2_000) return false;
      await new Promise(resolve => setTimeout(resolve, 2));
    }
    worker.terminate();
    this.#retiredWorkers.delete(slot);
    this.#lastRetirementMs = performance.now() - started;
    return true;
  }

  /** Prepare another complete graph while the old worker renders, then publish at a block boundary. */
  async replaceGraph(project) {
    if (this.#preparedRuntime) return this.#preparedRuntime.replaceGraph(project);
    const submittedAt = performance.now();
    if (!this.#workerMode || !this.#ready) throw new Error('Prepare a worker graph before replacing it');
    if (this.#replaceBusy || this.#commandPending) throw new Error('Another graph edit is pending');
    GraphWorkspace.fromProject(project);
    if (project.signal.io) throw new Error('Declared buses require prepared browser execution');
    if (project.assets?.length || project.sampleBindings?.length) {
      throw new Error('Live graph assets need a separate state transfer');
    }
    if ([...this.#currentProject.signal.nodes, ...project.signal.nodes]
      .some(node => !WORKER_LIVE_KINDS.has(node.type))) {
      throw new Error('Live replacement of stateful nodes needs an explicit state transfer');
    }
    const identity = liveIdentity(this.#currentProject, project);
    this.#replaceBusy = true;
    const slot = 1 - this.#activeSlot;
    const control = new Int32Array(this.#transport.control);
    // A terminating Worker can remain inside a synchronous Wasm/Atomics loop.
    // Its slot cannot be cleared or reused until its final-write acknowledgement.
    if (this.#retiredWorkers.has(slot)) {
      try {
        if (!await this.#finishRetirement(slot)) throw new Error('Previous graph worker has not retired; its slot cannot be reused');
      } catch (error) { this.#replaceBusy = false; throw error; }
    }
    for (let index = 0; index < RING_BLOCKS; index++) {
      Atomics.store(control, 5 + slot * RING_BLOCKS + index, 0);
    }
    Atomics.store(control, 1 + slot, 0);
    const timingBase = slot * (2 + WORKER_TIMING_SAMPLES);
    for (const buffer of [this.#transport.workerTiming, this.#transport.workerServiceTiming]) {
      const timing = new Int32Array(buffer);
      for (let index = 0; index < 2 + WORKER_TIMING_SAMPLES; index++) Atomics.store(timing, timingBase + index, 0);
    }
    const events = new Int32Array(this.#transport.events);
    const eventBase = slot * EVENT_WORDS_PER_WORKER;
    Atomics.store(events, eventBase, 0);
    Atomics.store(events, eventBase + 1, 0);
    const stateTags = new Int32Array(this.#transport.liveStateTags);
    for (let index = 1; index < stateTags.length; index++) Atomics.store(stateTags, index, 0);
    Atomics.store(stateTags, 0, this.#activeSlot + 1);
    let candidate = null;
    try {
      candidate = await this.#launchWorker(slot, project, identity);
      this.#candidateWorker = candidate;
      if (candidate.manifoldTransferred !== identity.length) {
        throw new Error('Prepared graph did not retain all compatible node histories');
      }
      const deadline = performance.now() + 4_000;
      for (;;) {
        const target = Math.max(1, Atomics.load(control, 0) + 1 - OUTPUT_LATENCY_BLOCKS);
        if (Atomics.load(control, 5 + slot * RING_BLOCKS + target % RING_BLOCKS) === target) break;
        if (!this.#node || performance.now() > deadline) throw new Error('Prepared graph missed audio warmup');
        await new Promise(resolve => setTimeout(resolve, 2));
      }
      Atomics.store(control, PUBLISH_REQUEST_WORD, slot + 1);
      while (Atomics.load(control, 3) !== slot) {
        if (!this.#node) throw new Error('Graph host closed during publication');
        if (performance.now() > deadline && Atomics.compareExchange(control,
          PUBLISH_REQUEST_WORD, slot + 1, 0) === slot + 1) {
          throw new Error('Graph publication timed out before the audio block claimed it');
        }
        await new Promise(resolve => setTimeout(resolve, 2));
      }
      const old = this.#activeWorker;
      this.#activeWorker = candidate;
      this.#candidateWorker = null;
      this.#activeSlot = slot;
      this.#currentProject = structuredClone(project);
      this.#lastPreparationMs = candidate.manifoldPreparationMs;
      this.#lastPublicationMs = performance.now() - submittedAt;
      this.#lastTransferredNodes = candidate.manifoldTransferred;
      if (old) {
        this.#stopWorker(old);
        this.#retiredWorkers.set(old.manifoldSlot, old);
        // A timeout quarantines the old slot while the accepted graph keeps
        // playing. A later edit must observe retirement before reusing it.
        await this.#finishRetirement(old.manifoldSlot);
      }
    } catch (error) {
      this.#stopWorker(candidate);
      if (candidate) this.#retiredWorkers.set(candidate.manifoldSlot, candidate);
      candidate?.terminate();
      this.#candidateWorker = null;
      throw error;
    } finally {
      Atomics.store(stateTags, 0, 0);
      this.#replaceBusy = false;
    }
  }

  sendEvent({ nodeId, kind, channel = 0, note = 0, velocity = 0, offset = 0 }) {
    if (this.#preparedRuntime) return this.#preparedRuntime.sendEventBatch([{ nodeId, kind, channel, note, velocity, offset }]);
    if (!this.#ready) throw new Error('Prepare the graph before sending an event');
    if (![nodeId, kind, channel, note, velocity, offset].every(Number.isInteger)
      || nodeId < 1 || nodeId > 0xffffffff || kind < 0 || kind > 3
      || channel < 0 || channel > 15 || note < 0 || note > 127
      || velocity < 0 || velocity > 127 || offset < 0 || offset > 4096) {
      throw new RangeError('Invalid graph event');
    }
    if (this.#workerMode) {
      if (offset !== 0) throw new RangeError('Worker graph events currently start at the next block');
      const target = this.#currentProject.signal.nodes.find(node => node.id === nodeId);
      if (!PORT_CATALOG[target?.type]?.inputs.some(port => port.signal === 'midi')) {
        throw new RangeError('Graph node does not accept note events');
      }
      const events = new Int32Array(this.#transport.events);
      const base = this.#activeSlot * EVENT_WORDS_PER_WORKER;
      const head = Atomics.load(events, base);
      const tail = Atomics.load(events, base + 1);
      if (((tail - head) >>> 0) >= EVENT_CAPACITY) throw new Error('Graph event queue is full');
      const eventBase = base + 2 + ((tail >>> 0) % EVENT_CAPACITY) * EVENT_WORDS;
      events[eventBase] = nodeId;
      events[eventBase + 1] = offset;
      events[eventBase + 2] = kind;
      events[eventBase + 3] = channel;
      events[eventBase + 4] = note;
      events[eventBase + 5] = velocity;
      Atomics.store(events, base + 1, tail + 1);
      return;
    }
    this.#node.port.postMessage({ type: 'event', nodeId, kind, channel, note, velocity, offset });
  }

  sendEventBatch(events) {
    if (!this.#preparedRuntime) throw new Error('Atomic event batch admission requires prepared execution');
    return this.#preparedRuntime.sendEventBatch(events);
  }
  readMidiTrace() {
    if (!this.#preparedRuntime) throw new Error('Public MIDI trace readback requires prepared execution');
    return this.#preparedRuntime.readMidiTrace();
  }

  #rejectAll(error) {
    for (const [requestId, pending] of this.#pending) {
      clearTimeout(pending.timeout);
      clearTimeout(pending.poll);
      if (pending.kind === 'capture') this.#node?.port.postMessage({
        type: 'capture-stage-cancel', captureId: pending.captureId });
      if (pending.kind === 'sample') this.#node?.port.postMessage({
        type: 'sample-replace-cancel', requestId });
      if (pending.kind === 'freeArm') this.#node?.port.postMessage({ type: 'capture-free-cancel' });
      pending.reject(error);
    }
    this.#pending.clear();
  }

  close() {
    if (this.#preparedRuntime) return this.#preparedRuntime.close();
    this.#rejectAll(new Error('Graph host closed'));
    this.cancelFreeCapture();
    if (this.#source && this.#node) this.#source.disconnect(this.#node);
    if (this.#sidechainSource && this.#node) this.#sidechainSource.disconnect(this.#node);
    this.#node?.disconnect();
    this.#node?.port.close();
    for (const worker of [this.#activeWorker, this.#candidateWorker, ...this.#retiredWorkers.values()]) {
      this.#stopWorker(worker);
      worker?.terminate();
    }
    this.#retiredWorkers.clear();
    this.#activeWorker = null;
    this.#candidateWorker = null;
    this.#transport = null;
    this.#wasmBytes = null;
    this.#currentProject = null;
    this.#node = null;
    this.#source = null;
    this.#sidechainSource = null;
    this.#ready = false;
  }
}
