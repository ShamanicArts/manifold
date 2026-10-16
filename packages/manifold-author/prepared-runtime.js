import { GraphWorkspace } from './index.js';
import { configuredWorkspaceType } from './workspace-types.js';
import { resourceTransfers } from './resource-history.js';
// The caller owns its source and may already have disconnected this exact route.
function disconnectOwnedRoute(source, destination, ...ports) {
  try { source.disconnect(destination, ...ports); }
  catch (error) { if (error.name !== 'InvalidAccessError') throw error; }
}
const LIVE_KINDS = new Set(['wave-shaper','legacy-filter','eq8','modulated-svf','slew-control','attenuverter-bias','sample-hold','cv-mix','cv-compare','cv-range','noise','ring-modulator','input.raw', 'input.sidechain', 'output', 'gain', 'fixed-gain', 'sum2', 'svf', 'stereo-widener', 'distortion', 'oscillator', 'extended-oscillator', 'adsr', 'pulse-oscillator', 'lfo', 'modulated-gain', 'mixer9', 'mixer', 'crossfader', 'midi-input', 'midi-transpose', 'voice-synth', 'loop-capture', 'retrospective-capture', 'sample-region', 'sample-instrument', 'phase-vocoder', 'granulator']);
const modules = new WeakMap();
const pause = () => new Promise(resolve => setTimeout(resolve, 2));
const ioShape = project => project.signal.io ? JSON.stringify(['declared',
  project.signal.io.inputs.map(b=>[b.id,b.channels,b.optional]), project.signal.io.outputs.map(b=>[b.id,b.channels,b.optional])]) : 'legacy';
function identities(previous, next) {
  if (!previous) return [];
  const namedOld = new Map((previous.instances ?? []).map(entry => [entry.path, entry.nodeId]));
  const namedOldIds = new Set(namedOld.values());
  const namedNext = new Map((next.instances ?? []).map(entry => [entry.nodeId, entry.path]));
  const oldKinds = new Map(previous.signal.nodes.map(node => [node.id, node.type]));
  return next.signal.nodes.flatMap(node => {
    const previousId = namedNext.has(node.id) ? namedOld.get(namedNext.get(node.id))
      : !namedOldIds.has(node.id) ? node.id : undefined;
    return previousId !== undefined && oldKinds.get(previousId) === node.type
      ? [{ nextId: node.id, previousId }] : [];
  });
}
function inheritance(previous, next, identity) {
  if (!previous) return [];
  const old = new Map(previous.signal.initialParameters.map(p => [`${p.nodeId}:${p.id}`, p.value]));
  const nodes = new Map(identity.map(pair => [pair.nextId, pair.previousId]));
  const bounds = project => {
    const ranges = new Map();
    for (const node of project.signal.nodes) {
      for (const parameter of configuredWorkspaceType(node).parameters) {
        ranges.set(`${node.id}:${parameter.id}`, [parameter.min, parameter.max]);
      }
    }
    for (const endpoint of project.endpoints ?? []) {
      ranges.set(`${endpoint.nodeId}:${endpoint.id}`, [endpoint.min, endpoint.max]);
    }
    return ranges;
  };
  const oldBounds = bounds(previous), newBounds = bounds(next);
  return next.signal.initialParameters.flatMap(parameter => {
    const previousId = nodes.get(parameter.nodeId), key = `${previousId}:${parameter.id}`;
    const oldRange = oldBounds.get(key), newRange = newBounds.get(`${parameter.nodeId}:${parameter.id}`);
    return previousId !== undefined && old.has(key) && Math.fround(old.get(key)) === Math.fround(parameter.value)
      && oldRange && newRange && oldRange[0] === newRange[0] && oldRange[1] === newRange[1]
      ? [{ nextId: parameter.nodeId, id: parameter.id, previousId }] : [];
  });
}
function loopTransfers(previous, next, identity, inherited, sampleRate) {
  const oldAssets = new Map((previous?.assets ?? []).map(asset => [asset.nodeId, asset]));
  const newAssets = new Map((next.assets ?? []).map(asset => [asset.nodeId, asset]));
  return identity.flatMap(pair => {
    const node = next.signal.nodes.find(node => node.id === pair.nextId);
    if (node.type !== 'loop-capture' && node.type !== 'retrospective-capture') return [];
    const previousNode = previous.signal.nodes.find(node => node.id === pair.previousId);
    const frames = node => Math.round(Math.fround(Math.fround(sampleRate) * Math.fround(node.a)));
    if (frames(node) !== frames(previousNode)) return [];
    const old = oldAssets.get(pair.previousId), asset = newAssets.get(pair.nextId);
    // A changed decoded take is an explicit resource replacement. Labels and
    // numeric IDs are presentation/identity metadata, not PCM differences.
    if (Boolean(old) !== Boolean(asset) || asset && (old.sourceRate !== asset.sourceRate
      || old.frames !== asset.frames || old.pcmF32Base64 !== asset.pcmF32Base64)) return [];
    return [{ ...pair, parameters: next.signal.initialParameters.filter(p => p.nodeId === pair.nextId)
      .map(parameter => ({ ...parameter, inherit: inherited.some(p => p.nextId === pair.nextId && p.id === parameter.id) })) }];
  });
}

/** Internal device/scheduling adapter used by the public BrowserGraphHost. */
export class PreparedGraphRuntime {
  constructor(context, { wasmUrl, workletUrl = new URL('./prepared-processor.js', import.meta.url), compilerUrl = null } = {}) {
    this.context = context; this.wasmUrl = wasmUrl; this.workletUrl = workletUrl; this.compilerUrl = compilerUrl;
    this.requests = new Map(); this.nextRequest = 1; this.busy = false; this.routePending = false; this.closed = false; this.ready = false;
    this.current = null; this.pendingPublication = null; this.commandTail = Promise.resolve();
    this.control = new Int32Array(new SharedArrayBuffer(18 * 4));
    this.closePromise = null; this.compilerFailed = false; this.processorFailed = false;
    this.busSources = new Map(); this.ioShape = null;
  }
  get diagnostics() {
    return { execution: 'prepared', audioBlocks: Atomics.load(this.control, 0),
      rustProcessedBlocks: Atomics.load(this.control, 8), publications: Atomics.load(this.control, 10),
      rustProcessingFailures: Atomics.load(this.control, 3), rustCallbackAllocations: Atomics.load(this.control, 5),
      rustCallbackDeallocations: Atomics.load(this.control, 6), lastTransferredNodes: Atomics.load(this.control, 4),
      lastPublicationContextFrame: Atomics.load(this.control, 9), outputLatencyBlocks: 0,
      memoryBytes: this.memory?.buffer.byteLength ?? 0, lastPreparationMs: this.lastEdit?.preparationMs ?? null,
      lastPublicationMs: this.lastEdit?.totalMs ?? null, compilerFailed: this.compilerFailed,
      processorFailed: this.processorFailed,
      eventsAdmitted: Atomics.load(this.control, 11), eventsConsumed: Atomics.load(this.control, 12),
      eventsCancelled: Atomics.load(this.control, 13), eventsRejected: Atomics.load(this.control, 14),
      eventsPending: Atomics.load(this.control, 15), lastEventContextFrame: Atomics.load(this.control, 16),
      renderQuantum: Atomics.load(this.control, 17) || 128 };
  }
  receive(data) {
    const key = data.requestId ?? data.type, request = this.requests.get(key);
    if (!request) return;
    this.requests.delete(key); clearTimeout(request.timeout);
    data.type === 'error' ? request.reject(new Error(data.message)) : request.resolve(data);
  }
  failRequests(error) {
    for (const request of this.requests.values()) { clearTimeout(request.timeout); request.reject(error); }
    this.requests.clear();
  }
  wait(id) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.requests.delete(id); reject(new Error(`Prepared graph request ${id} timed out`)); }, 10_000);
      this.requests.set(id, { resolve, reject, timeout });
    });
  }
  send(target, message) {
    const requestId = this.nextRequest++, done = this.wait(requestId);
    try { target.postMessage({ ...message, requestId }); } catch (error) { this.receive({ type: 'error', requestId, message: error.message }); }
    return done;
  }
  validate(project) {
    GraphWorkspace.fromProject(project).captureRingBytes(this.context.sampleRate);
    if (project.signal.io && [...project.signal.io.inputs,...project.signal.io.outputs].some(b=>b.channels>32)) {
      throw new Error('This browser host admits at most 32 channels per bus');
    }
    if (this.ioShape !== null && this.ioShape !== ioShape(project)) {
      throw new Error('Changing host bus IDs/counts/requirements requires a new browser host; active graph retained');
    }
    if ((project.assets ?? []).some(asset => !['loop-capture', 'sample-region', 'sample-instrument'].includes(project.signal.nodes.find(node => node.id === asset.nodeId)?.type))
      || project.signal.directional
      || project.signal.nodes.some(node => !LIVE_KINDS.has(node.type))) throw new Error('Prepared execution does not yet support this graph state/resource kind');
  }
  async prepare(project) {
    if (this.node || this.closed) throw new Error('Prepared runtime already initialized or closed');
    this.validate(project);
    if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') throw new Error('Prepared execution requires an isolated document and compiler Worker');
    try {
      const response = await fetch(this.wasmUrl); if (!response.ok) throw new Error(`Prepared Wasm HTTP ${response.status}`);
      this.module = await WebAssembly.compile(await response.arrayBuffer());
      this.memory = new WebAssembly.Memory({ initial: 256, maximum: 8192, shared: true });
      let urls = modules.get(this.context); if (!urls) { urls = new Map(); modules.set(this.context, urls); }
      const url = String(this.workletUrl);
      if (!urls.has(url)) urls.set(url, this.context.audioWorklet.addModule(this.workletUrl).catch(error => { urls.delete(url); throw error; }));
      await urls.get(url);
      const audioReady = this.wait('initialized');
      const io = project.signal.io;
      this.ioShape = ioShape(project);
      this.node = new AudioWorkletNode(this.context, 'manifold-prepared-graph', {
        numberOfInputs: io ? io.inputs.length : 2, numberOfOutputs: io ? io.outputs.length : 1,
        ...(io?.outputs.length === 0 ? {} : {outputChannelCount: io ? io.outputs.map(b=>b.channels) : [2]}),
        ...(io ? {channelCountMode:'max',channelInterpretation:'discrete'} : {}),
        processorOptions: { module: this.module, memory: this.memory, control: this.control.buffer },
      });
      this.node.port.onmessage = ({ data }) => this.receive(data);
      this.node.onprocessorerror = () => { this.processorFailed = true; this.ready = false; this.failRequests(new Error('Prepared graph AudioWorklet failed')); };
      if (!io) this.node.connect(this.context.destination); await audioReady;
      this.compiler = this.compilerUrl ? new Worker(this.compilerUrl, { type: 'module' })
        : new Worker(new URL('./prepared-compiler.js', import.meta.url), { type: 'module' });
      this.compiler.onmessage = ({ data }) => this.receive(data);
      this.compiler.onerror = event => { event.preventDefault(); this.compilerFailed = true; this.failRequests(new Error(`Prepared graph compiler failed: ${event.message}`)); };
      const compilerReady = this.wait('initialized');
      this.compiler.postMessage({ type: 'init', module: this.module, memory: this.memory }); await compilerReady;
      await this.replaceGraph(project); this.ready = true; return this;
    } catch (error) { await this.close().catch(() => {}); throw error; }
  }
  adoptPublished() {
    const published = Atomics.load(this.control, 1);
    if (this.pendingPublication?.requestId === published) {
      this.current = this.pendingPublication; this.pendingPublication = null;
    }
    return this.current;
  }
  readPublishedParameters() {
    if (!this.ready || this.closed) throw new Error('Prepared graph host is not ready');
    for (let attempt = 0; attempt < 16; attempt++) {
      const current = this.adoptPublished();
      if (!current) throw new Error('Prepared graph has not published');
      const version = Atomics.load(current.parameterControl, 0) >>> 0;
      const base = (version % 2) * current.parameters.length;
      const result = current.parameters.map((parameter, index) => ({ ...parameter, value: current.parameterValues[base + index] }));
      if ((Atomics.load(current.parameterControl, 0) >>> 0) === version
        && Atomics.load(this.control, 1) === current.requestId) {
        for (let index = 0; index < result.length; index++) current.project.signal.initialParameters[index].value = result[index].value;
        return result;
      }
    }
    throw new Error('Prepared parameter snapshot changed during readback');
  }
  async replaceGraph(project) {
    if (this.busy || this.routePending || this.closed || this.compilerFailed) throw new Error('Prepared graph replacement unavailable');
    this.validate(project); this.busy = true;
    const started = performance.now(); let candidate = null, claimed = false;
    try {
      // Capture the accepted authoring baseline; later scalar automation is
      // read from Rust at publication, never from this frozen snapshot.
      if (this.ready) this.readPublishedParameters();
      const baseline = this.current?.project, identity = identities(baseline, project);
      let inherited = inheritance(baseline, project, identity);
      const loops = loopTransfers(baseline, project, identity, inherited, this.context.sampleRate);
      // Resource replacement takes candidate transport intent. Otherwise a
      // recording command arriving during preparation could erase the new clip.
      const mappedLoops = new Set(loops.map(loop => loop.nextId));
      const loopNodes = new Set(project.signal.nodes.filter(node => node.type === 'loop-capture').map(node => node.id));
      inherited = inherited.filter(parameter => !loopNodes.has(parameter.nextId) || mappedLoops.has(parameter.nextId));
      const resources = resourceTransfers(baseline, project, identity);
      const mappedSamples = new Set(resources.map(pair => pair.nextId));
      const sampleNodes = new Set(project.signal.nodes.filter(node => ['sample-region', 'sample-instrument'].includes(node.type)).map(node => node.id));
      inherited = inherited.filter(parameter => !sampleNodes.has(parameter.nextId) || mappedSamples.has(parameter.nextId));
      resources.push(...loops.map(({ nextId, previousId }) => ({ nextId, previousId })));
      const parameterBank = new SharedArrayBuffer(4 + project.signal.initialParameters.length * 8);
      candidate = await this.send(this.compiler, { type: 'prepare', project,
        sampleRate: this.context.sampleRate, identity, inheritance: inherited, loops, resources, parameterBank });
      if (this.closed) throw new Error('Graph host closed during preparation');
      const parameters = project.signal.initialParameters.map(({ nodeId, id }) => ({ nodeId, id }));
      const names = new Map((project.instances ?? []).map(entry => [entry.nodeId, entry.path]));
      const nodes = project.signal.nodes.map(node => ({ id: node.id, type: node.type, path: names.get(node.id) ?? null }));
      this.pendingPublication = { ...candidate, project: structuredClone(project), parameters,
        parameterControl: new Int32Array(parameterBank, 0, 1), parameterValues: new Float32Array(parameterBank, 4) };
      this.node.port.postMessage({ ...candidate, type: 'publish', parameterBank, parameters, nodes,
        io: project.signal.io ?? null, endpoints: project.endpoints ?? [], allowIdle: !this.ready || this.context.state !== 'running' });
      const deadline = performance.now() + 4_000;
      while (Atomics.load(this.control, 1) !== candidate.requestId) {
        if (this.closed || this.processorFailed) throw new Error('Graph host stopped during publication');
        if (performance.now() > deadline) {
          const result = await this.send(this.node.port, { type: 'cancel-publication', publicationId: candidate.requestId });
          if (!result.published) throw new Error('Graph publication timed out and was cancelled');
        }
        await pause();
      }
      claimed = true; this.adoptPublished();
      if (this.closed) throw new Error('Graph host closed during publication');
      const retired = Atomics.load(this.control, 2);
      if (retired) await this.send(this.compiler, { type: 'retire', handle: retired });
      this.lastEdit = { preparationMs: candidate.preparationMs, totalMs: performance.now() - started };
      // Initial publication is also an accepted snapshot, even before ready.
      const current = this.current, version = Atomics.load(current.parameterControl, 0) >>> 0;
      for (let index = 0; index < parameters.length; index++) current.project.signal.initialParameters[index].value = current.parameterValues[(version % 2) * parameters.length + index];
    } catch (error) {
      // An unclaimed handle is released only after the Worklet confirms it
      // cannot become audible. If stopped, close owns all handle retirement.
      if (candidate && !claimed && !this.closed && !this.processorFailed) {
        const result = await this.send(this.node.port, { type: 'cancel-publication', publicationId: candidate.requestId }).catch(() => null);
        if (result?.cancelled || result && !result.published) {
          this.pendingPublication = null;
          await this.send(this.compiler, { type: 'retire', handle: candidate.handle }).catch(() => {});
        } else if (result?.published) { this.adoptPublished(); }
      }
      throw error;
    } finally { this.busy = false; }
  }
  setParameterBatch(updates) {
    const submitted = updates.map(update => ({ ...update }));
    this.readPublishedParameters(); const current = this.current;
    if (!submitted.length || new Set(submitted.map(p => `${p.nodeId}:${p.id}`)).size !== submitted.length) throw new Error('Invalid or duplicate parameter batch');
    const graph = GraphWorkspace.fromProject(current.project);
    const names = new Map((current.project.instances ?? []).map(entry => [entry.nodeId, entry.path]));
    const resolved = submitted.map(update => { const node = graph.find(update.nodeId); graph.setParameter(node, update.id, update.value);
      return { ...update, kind: node.type, path: names.get(update.nodeId) ?? null }; });
    const operation = this.commandTail.then(async () => {
      if (this.closed) throw new Error('Graph host closed before parameter command');
      await this.send(this.node.port, { type: 'parameter-batch', updates: resolved, rollback: new SharedArrayBuffer(resolved.length * Float32Array.BYTES_PER_ELEMENT) }); this.readPublishedParameters();
    });
    this.commandTail = operation.catch(() => {}); return operation;
  }
  setParameter(edit) { return this.setParameterBatch([edit]); }
  sendEventBatch(events) {
    if (!Array.isArray(events) || !events.length || events.length > 256) throw new RangeError('Event batch requires 1–256 events');
    this.readPublishedParameters();
    const graph = GraphWorkspace.fromProject(this.current.project);
    const names = new Map((this.current.project.instances ?? []).map(entry => [entry.nodeId, entry.path]));
    const quantum = this.diagnostics.renderQuantum;
    const submitted = events.map(({ nodeId, kind, channel = 0, note = 0, velocity = 0, offset = 0 }) => {
      if (![nodeId, kind, channel, note, velocity, offset].every(Number.isInteger)
        || nodeId < 1 || kind < 0 || kind > 3 || channel < 0 || channel > 15
        || note < 0 || note > 127 || velocity < 0 || velocity > 127 || offset < 0 || offset >= quantum) throw new RangeError('Invalid next-block event');
      const node = graph.find(nodeId);
      if (node.type !== 'midi-input' && node.type !== 'midi-transpose' && node.type !== 'voice-synth' && node.type !== 'sample-region' && node.type !== 'sample-instrument') throw new RangeError('Graph node does not accept prepared events');
      return { nodeId, kind, channel, note, velocity, offset, targetType: node.type, path: names.get(nodeId) ?? null };
    });
    const operation = this.commandTail.then(() => {
      if (this.closed) throw new Error('Graph host closed before event admission');
      return this.send(this.node.port, { type: 'events', events: submitted });
    });
    this.commandTail = operation.catch(() => {}); return operation;
  }
  readMidiTrace() {
    if (!this.ready || this.closed) throw new Error('Prepared graph host is not ready');
    return this.send(this.node.port, { type: 'midi-trace' });
  }
  async snapshotLoop(nodeId) {
    if (!this.ready || this.closed || !Number.isInteger(nodeId)) throw new Error('Prepare a loop graph before snapshotting');
    const graph = GraphWorkspace.fromProject(this.adoptPublished().project);
    if (graph.find(nodeId).type !== 'loop-capture') throw new Error('Snapshot target is not a loop');
    const snapshot = await this.send(this.node.port, { type: 'loop-info', nodeId });
    const stereo = new Float32Array(snapshot.frames * 2);
    for (let offset = 0; offset < snapshot.frames; offset += 2048) {
      const result = await this.send(this.node.port, { type: 'loop-copy', nodeId, offset,
        frames: Math.min(2048, snapshot.frames - offset), publicationId: snapshot.publicationId, revision: snapshot.revision });
      stereo.set(result.stereo, offset * 2);
    }
    // Revalidate even an empty take and the final chunk against a concurrent
    // record/overdub/publication before returning a portable asset.
    const final = await this.send(this.node.port, { type: 'loop-info', nodeId });
    if (final.publicationId !== snapshot.publicationId || final.revision !== snapshot.revision
      || final.frames !== snapshot.frames) throw new Error('Loop changed during snapshot');
    return { sourceRate: this.context.sampleRate, stereo };
  }
  async captureWindow(nodeId, window = 1) {
    const timing = typeof window === 'number' ? { windowSeconds: window } : window;
    // Seconds windows are implemented here. Unsupported transport/free modes
    // reject explicitly until the same timed service is available in this host.
    if (!this.ready || this.closed || !Number.isInteger(nodeId) || !timing
      || Object.keys(timing).some(key => key !== 'windowSeconds')
      || !Number.isFinite(timing.windowSeconds) || timing.windowSeconds <= 0) {
      throw new Error('Prepared capture requires a valid seconds window');
    }
    if (this.capturePending) throw new Error('A capture window is already being exported');
    const graph = GraphWorkspace.fromProject(this.adoptPublished().project);
    if (graph.find(nodeId)?.type !== 'retrospective-capture') throw new Error('Target is not a retrospective capture');
    const frames = Math.max(1, Math.round(timing.windowSeconds * this.context.sampleRate));
    this.capturePending = true;
    let snapshot;
    try {
      snapshot = await this.send(this.node.port, { type: 'capture-start', nodeId, frames });
      let progress;
      do { progress = await this.send(this.node.port, { type: 'capture-step', nodeId, publicationId: snapshot.publicationId }); } while (!progress.ready);
      if (progress.frames !== frames) throw new Error('Capture window length changed');
      const stereo = new Float32Array(frames * 2);
      for (let offset = 0; offset < frames; offset += 2048) {
        const chunk = await this.send(this.node.port, { type: 'capture-copy', nodeId,
          frames: Math.min(2048, frames - offset), offset, publicationId: snapshot.publicationId });
        stereo.set(chunk.stereo, offset * 2);
      }
      return { sourceRate: this.context.sampleRate, stereo };
    } finally {
      try {
        if (snapshot && !this.closed) await this.send(this.node.port, { type: 'capture-cancel', nodeId, publicationId: snapshot.publicationId });
      } finally { this.capturePending = false; }
    }
  }

  async captureCursor(nodeId) {
    if (!this.ready || this.closed || !Number.isInteger(nodeId)) throw new Error('Prepare a capture graph before reading its cursor');
    const { startOffset, capacity } = await this.send(this.node.port, { type: 'capture-cursor', nodeId });
    return { startOffset, capacity };
  }
  async setRoute({ to, inputPort, from = null, outputPort = 0 }) {
    if (this.busy) throw new Error('Structural graph preparation is pending');
    if (this.routePending) throw new Error('A route edit is already pending');
    this.readPublishedParameters(); const current = this.current, graph = GraphWorkspace.fromProject(current.project);
    const target = graph.find(to);
    const input = target.input(graph.describeNode(target).inputs[inputPort]?.name);
    graph.disconnect(input);
    if (from !== null) {
      const source = graph.find(from);
      graph.connect(source.output(graph.describeNode(source).outputs[outputPort]?.name), input);
    }
    // MIDI routing changes the original-key ownership domain. Use preparation
    // and the core's chain compatibility check to reset affected histories.
    if (input.signal === 'midi') return this.replaceGraph(graph.toProject());
    this.routePending = true;
    try {
      await this.send(this.node.port, { type: 'route', revision: current.requestId, to, inputPort, from, outputPort });
      current.project.signal.connections = graph.toProject().signal.connections;
    } finally { this.routePending = false; }
  }
  connect(source, destination = this.context.destination, sidechain = null) {
    if (!this.ready || this.closed) throw new Error('Prepare the graph before connecting audio');
    if (this.current?.project.signal.io) throw new Error('Use connectInput/connectOutput with declared bus IDs');
    if (this.source) this.source.disconnect(this.node); if (this.sidechain) this.sidechain.disconnect(this.node);
    this.source = source; this.sidechain = sidechain; this.node.disconnect();
    source?.connect(this.node, 0, 0); sidechain?.connect(this.node, 0, 1); this.node.connect(destination);
  }
  connectInput(busId, source, sourceOutput = 0) {
    if (!this.ready || this.closed) throw new Error('Prepare the graph before connecting audio');
    const index = this.current?.project.signal.io?.inputs.findIndex(b=>b.id===busId) ?? -1;
    if (index < 0 || !Number.isInteger(sourceOutput) || sourceOutput < 0) throw new Error('Unknown input bus or source output');
    const previous = this.busSources.get(busId);
    // Connect first so rejection preserves an existing source connection.
    if (source) source.connect(this.node, sourceOutput, index);
    if (previous && (previous.source !== source || previous.output !== sourceOutput)) disconnectOwnedRoute(previous.source, this.node, previous.output, index);
    if (source) this.busSources.set(busId,{source,output:sourceOutput,index}); else this.busSources.delete(busId);
  }
  connectOutput(busId, destination, destinationInput = 0) {
    if (!this.ready || this.closed) throw new Error('Prepare the graph before connecting audio');
    const index = this.current?.project.signal.io?.outputs.findIndex(b=>b.id===busId) ?? -1;
    if (index < 0 || !Number.isInteger(destinationInput) || destinationInput < 0) throw new Error('Unknown output bus or destination input');
    this.node.connect(destination,index,destinationInput);
  }
  close() {
    if (this.closePromise) return this.closePromise;
    this.closed = true; this.ready = false;
    this.closePromise = (async () => {
      for (const {source,output,index} of this.busSources.values()) disconnectOwnedRoute(source,this.node,output,index);
      this.busSources.clear();
      if (this.source) disconnectOwnedRoute(this.source,this.node); if (this.sidechain) disconnectOwnedRoute(this.sidechain,this.node);
      if (this.node && !this.processorFailed) await this.send(this.node.port, { type: 'close' });
      this.node?.disconnect();
      if (this.compiler && !this.compilerFailed) await this.send(this.compiler, { type: 'close' });
      else this.compiler?.terminate();
      this.failRequests(new Error('Prepared graph host closed'));
      this.current = null; this.pendingPublication = null;
      this.node?.port.close(); this.compiler?.terminate();
      this.node = null; this.compiler = null; this.memory = null; this.module = null;
    })();
    return this.closePromise;
  }
}
