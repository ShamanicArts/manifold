// Experimental adapter, not a public BrowserGraphHost execution mode yet.
import { GraphWorkspace } from '../index.js';
const LIVE_KINDS = new Set(['input.raw', 'input.sidechain', 'output', 'gain', 'fixed-gain', 'sum2', 'stereo-widener', 'distortion']);
export class PreparedGraphHostPrototype {
  constructor(context) {
    this.context = context; this.requests = new Map(); this.nextRequest = 1;
    this.busy = false; this.project = null; this.closed = false;
    this.control = new Int32Array(new SharedArrayBuffer(8 * 4));
  }
  get diagnostics() {
    return { audioBlocks: Atomics.load(this.control, 0), publishedRequest: Atomics.load(this.control, 1),
      rustProcessingFailures: Atomics.load(this.control, 3), transferredNodes: Atomics.load(this.control, 4),
      rustCallbackAllocations: Atomics.load(this.control, 5), rustCallbackDeallocations: Atomics.load(this.control, 6),
      memoryBytes: this.memory?.buffer.byteLength ?? 0, bridgeLatencyBlocks: 0 };
  }
  handleMessage(data) {
    const request = this.requests.get(data.requestId ?? data.type);
    if (!request) return;
    this.requests.delete(data.requestId ?? data.type); clearTimeout(request.timeout);
    data.type === 'error' ? request.reject(new Error(data.message)) : request.resolve(data);
  }
  wait(id) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.requests.delete(id); reject(new Error(`Prototype request ${id} timed out`)); }, 10_000);
      this.requests.set(id, { resolve, reject, timeout });
    });
  }
  validate(project) {
    GraphWorkspace.fromProject(project);
    if (project.assets?.length || project.sampleBindings?.length || project.signal.directional
      || project.signal.nodes.some(node => !LIVE_KINDS.has(node.type))) {
      throw new Error('Prototype supports only the bounded DSP/FX runtime fixtures');
    }
  }
  async prepare(project) {
    this.validate(project);
    this.stage = 'fetch Wasm';
    const response = await fetch('/prepared-worklet-prototype/manifold-prepared.wasm');
    if (!response.ok) throw new Error(`Wasm HTTP ${response.status}`);
    this.stage = 'compile Wasm module';
    this.module = await WebAssembly.compile(await response.arrayBuffer());
    this.memory = new WebAssembly.Memory({ initial: 256, maximum: 8192, shared: true });
    this.stage = 'load audio processor';
    await this.context.audioWorklet.addModule(new URL('./prepared-processor-prototype.js', import.meta.url));
    this.stage = 'construct audio processor';
    const audioReady = this.wait('initialized');
    this.node = new AudioWorkletNode(this.context, 'manifold-prepared-prototype', {
      numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2],
      processorOptions: { module: this.module, memory: this.memory, control: this.control.buffer },
    });
    this.node.port.onmessage = ({ data }) => this.handleMessage(data);
    this.node.onprocessorerror = () => { this.closed = true; for (const request of this.requests.values()) { clearTimeout(request.timeout); request.reject(new Error('Prototype processor failed')); } this.requests.clear(); };
    this.node.connect(this.context.destination);
    this.stage = 'initialize audio Wasm/TLS';
    await audioReady;
    this.stage = 'construct compiler Worker';
    this.compiler = new Worker(new URL('./prepared-compiler-prototype.js', import.meta.url), { type: 'module' });
    this.compiler.onmessage = ({ data }) => this.handleMessage(data);
    this.compiler.onerror = event => { for (const request of this.requests.values()) { clearTimeout(request.timeout); request.reject(new Error(event.message)); } this.requests.clear(); };
    const compilerReady = this.wait('initialized');
    this.compiler.postMessage({ type: 'init', module: this.module, memory: this.memory });
    this.stage = 'initialize compiler Wasm/TLS';
    await compilerReady;
    this.stage = 'prepare and publish graph';
    await this.replaceGraph(project);
    return this;
  }
  async replaceGraph(project) {
    if (this.busy || this.closed) throw new Error('Prototype graph edit unavailable');
    this.validate(project); this.busy = true;
    const started = performance.now(), requestId = this.nextRequest++;
    try {
      const prepared = this.wait(requestId);
      this.compiler.postMessage({ type: 'prepare', requestId, project, sampleRate: this.context.sampleRate });
      const candidate = await prepared;
      if (this.closed) throw new Error('Prototype host closed during preparation');
      this.node.port.postMessage({ ...candidate, type: 'publish' });
      const deadline = performance.now() + 4_000;
      while (Atomics.load(this.control, 1) !== requestId) {
        if (this.closed || performance.now() > deadline) throw new Error('Prototype publication timed out');
        await new Promise(resolve => setTimeout(resolve, 2));
      }
      if (this.closed) throw new Error('Prototype host closed during publication');
      this.project = structuredClone(project);
      const retired = Atomics.load(this.control, 2);
      if (retired) {
        const retireId = this.nextRequest++, done = this.wait(retireId);
        this.compiler.postMessage({ type: 'retire', handle: retired, requestId: retireId }); await done;
      }
      this.lastEdit = { preparationMs: candidate.preparationMs, totalMs: performance.now() - started,
        transferredNodes: Atomics.load(this.control, 4) };
    } finally { this.busy = false; }
  }
  readPublishedParameters() { return structuredClone(this.project?.signal.initialParameters ?? []); }
  async setParameter({ nodeId, id, value }) {
    if (this.busy || !this.project || this.closed) throw new Error('Prototype parameter unavailable');
    const requestId = this.nextRequest++, done = this.wait(requestId);
    this.node.port.postMessage({ type: 'parameter', requestId, nodeId, id, value });
    const result = await done;
    if (!result.accepted) throw new Error('Rust rejected parameter');
    const parameter = this.project.signal.initialParameters?.find(parameter => parameter.nodeId === nodeId && parameter.id === id);
    if (parameter) parameter.value = Math.fround(value);
  }
  setRoute() { return Promise.reject(new Error('Prototype route commands are not implemented')); }
  async probeCompilerStall(durationMs = 250) {
    const requestId = this.nextRequest++, done = this.wait(requestId);
    this.compiler.postMessage({ type: 'probe-stall', requestId, durationMs }); return done;
  }
  async probeRustPreparationRejection(project) {
    // Deliberately bypass JS preflight to exercise the compiler's failure path.
    const bad = structuredClone(project), gain = bad.signal.nodes.find(node => node.type === 'gain');
    bad.signal.connections.find(edge => edge.to === gain.id).from = gain.id;
    const requestId = this.nextRequest++, done = this.wait(requestId);
    this.compiler.postMessage({ type: 'prepare', requestId, project: bad, sampleRate: this.context.sampleRate });
    try {
      const unexpected = await done;
      const retireId = this.nextRequest++, retired = this.wait(retireId);
      this.compiler.postMessage({ type: 'retire', requestId: retireId, handle: unexpected.handle }); await retired;
      throw new Error('Corrupted compiler input unexpectedly prepared');
    } catch (error) {
      if (!error.message.includes('Rust rejected graph preparation')) throw error;
      return { rejected: error.message, injectedCycle: true, diagnostics: this.diagnostics };
    }
  }
  connect(source, destination = this.context.destination, sidechain = null) {
    this.node.disconnect(); source?.connect(this.node, 0, 0); sidechain?.connect(this.node, 0, 1); this.node.connect(destination);
  }
  async close() {
    if (this.closed) return; this.closed = true;
    if (this.node) {
      const requestId = this.nextRequest++, done = this.wait(requestId);
      this.node.port.postMessage({ type: 'close', requestId }); await done; this.node.disconnect();
    }
    if (this.compiler) {
      const requestId = this.nextRequest++, done = this.wait(requestId);
      this.compiler.postMessage({ type: 'close', requestId }); await done;
    }
  }
}
