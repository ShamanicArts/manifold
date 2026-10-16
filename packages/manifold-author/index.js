import { PORT_CATALOG } from './catalog.generated.js';
import { WORKSPACE_TYPES, configuredWorkspaceType, validMixerInputs } from './workspace-types.js';
import { validateSampleAsset, encodeSampleAsset, SAMPLE_TYPES, PCM_ASSET_TYPES } from './sample-assets.js';
export { decodeSampleAsset, encodeSampleAsset } from './sample-assets.js';

export class GraphContractError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'GraphContractError';
    this.code = code;
    this.details = details;
  }
}

const fail = (code, message, details) => { throw new GraphContractError(code, message, details); };
const stable = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) stable(child);
    Object.freeze(value);
  }
  return value;
};
const copy = value => structuredClone(value);
const nodePorts = node => {
  if (node.type !== 'mixer') return PORT_CATALOG[node.type];
  const spec = configuredWorkspaceType(node);
  return { inputs: spec.inputNames.map((name, i) => ({ name, signal: spec.inputs[i] })),
    outputs: PORT_CATALOG.mixer.outputs };
};
const nodeParameters = node => configuredWorkspaceType(node).parameters ?? [];
const compareEdge = (a, b) => a.to - b.to || a.inputPort - b.inputPort;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const utf8ByteLength = value => {
  let length = 0;
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code >= 0xd800 && code <= 0xdfff) return Infinity;
    length += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return length;
};
const exactKeys = (value, keys) => record(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const describe = (type, spec) => stable({ type, ...copy(spec),
  inputs: copy(PORT_CATALOG[type].inputs), outputs: copy(PORT_CATALOG[type].outputs) });
const endpointPath = /^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const comparePath = (a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
const validArguments = (type, node) => Object.entries(PORT_CATALOG[type].args).every(([key, value]) => {
  const field = Object.values(PORT_CATALOG[type].configuration).find(field => field.argument === key);
  return field ? Number.isFinite(node[key]) && node[key] >= field.min && node[key] <= (field.max ?? Infinity)
    && (type !== 'mixer' || key !== 'a' || validMixerInputs(node[key]))
    && (!['loop-capture', 'retrospective-capture'].includes(type) || key !== 'a' || node[key] > 0) : node[key] === value;
});
const configuredNode = (type, node, config) => {
  if (!record(config)) fail('invalid-configuration', 'Constructor configuration must be an object');
  const result = { ...node };
  for (const [name, value] of Object.entries(config)) {
    const field = PORT_CATALOG[type].configuration[name];
    if (!Object.hasOwn(PORT_CATALOG[type].configuration, name) || !Number.isFinite(value)
      || value < field.min || value > (field.max ?? Infinity)
      || type === 'mixer' && name === 'inputs' && !validMixerInputs(value)
      || name === 'capacitySeconds' && value <= 0) fail('invalid-configuration', `Invalid ${type} constructor field ${name}`);
    result[field.argument] = value;
  }
  return result;
};

/** Explicit host buses and channel routes, shared with the Rust graph contract. */
export function validateIoLayout(layout, nodes) {
  if (!exactKeys(layout, ['version', 'inputs', 'outputs', 'inputBindings', 'outputBindings']) || layout.version !== 1) {
    fail('invalid-io', 'Expected an I/O layout version 1');
  }
  const types = new Map(nodes.map(node => [node.id, node.type]));
  for (const [direction, buses] of [['inputs', layout.inputs], ['outputs', layout.outputs]]) {
    if (!Array.isArray(buses)) fail('invalid-io', 'Expected audio buses');
    const ids = new Set(); let total = 0;
    for (const bus of buses) {
      if (!exactKeys(bus, ['id', 'name', 'channels', 'optional']) || typeof bus.id !== 'string'
        || !/^[A-Za-z0-9_-]+$/.test(bus.id) || ids.has(bus.id)
        || typeof bus.name !== 'string' || !bus.name || bus.name.trim() !== bus.name
        || !Number.isFinite(utf8ByteLength(bus.name)) || !Number.isSafeInteger(bus.channels)
        || bus.channels < 1
        || typeof bus.optional !== 'boolean' || direction === 'outputs' && bus.optional) {
        fail('invalid-io', 'Invalid or duplicate bus declaration');
      }
      ids.add(bus.id); total += bus.channels;
    }
    if (!Number.isSafeInteger(total)) fail('invalid-io', 'Channel count cannot be represented exactly');
  }
  if (!Array.isArray(layout.inputBindings) || layout.inputBindings.length > nodes.length
    || !Array.isArray(layout.outputBindings)
    || layout.outputBindings.length !== layout.outputs.reduce((sum,bus)=>sum+bus.channels,0)) {
    fail('invalid-io', 'I/O bindings do not match declared channels');
  }
  const bound = new Set();
  for (const binding of layout.inputBindings) {
    if (!exactKeys(binding, ['nodeId', 'channels']) || !Number.isInteger(binding.nodeId)
      || !['input.raw', 'input.sidechain', 'input.monitor'].includes(types.get(binding.nodeId))
      || bound.has(binding.nodeId) || !Array.isArray(binding.channels) || binding.channels.length !== 2) {
      fail('invalid-io', 'Input binding needs two explicit kernel lanes');
    }
    bound.add(binding.nodeId);
    for (const route of binding.channels) {
      if (route === null) continue;
      if (!exactKeys(route, ['bus', 'channel']) || !Number.isInteger(route.bus) || route.bus < 0
        || !Number.isInteger(route.channel) || route.channel < 0
        || !layout.inputs[route.bus] || route.channel >= layout.inputs[route.bus].channels) {
        fail('invalid-io', 'Input channel route is outside its declared bus');
      }
    }
  }
  for (const node of nodes) if (['input.raw', 'input.sidechain', 'input.monitor'].includes(node.type) && !bound.has(node.id)) {
    fail('invalid-io', 'Every host input node needs an explicit binding, including silence');
  }
  for (const route of layout.outputBindings) {
    if (route === null) continue;
    if (!exactKeys(route, ['nodeId', 'outputPort', 'channel']) || !Number.isInteger(route.nodeId)
      || !Number.isInteger(route.outputPort) || route.outputPort < 0
      || !Number.isInteger(route.channel) || route.channel < 0 || route.channel > 1
      || PORT_CATALOG[types.get(route.nodeId)]?.outputs[route.outputPort]?.signal !== 'audio') {
      fail('invalid-io', 'Output route needs an existing audio port and kernel lane');
    }
  }
  return stable(copy(layout));
}
const CAPTURE_WINDOW_FIELDS = ['captureWindowSeconds', 'captureWindowMode', 'captureWindowBars',
  'captureTempoBpm', 'captureTimeSignatureNumerator', 'captureTimeSignatureDenominator'];
const validCaptureWindow = settings => {
  if (!record(settings) || Object.keys(settings).some(key => !CAPTURE_WINDOW_FIELDS.includes(key))) return false;
  const mode = settings.captureWindowMode ?? 'seconds';
  const seconds = settings.captureWindowSeconds;
  const bars = settings.captureWindowBars;
  const tempo = settings.captureTempoBpm;
  const numerator = settings.captureTimeSignatureNumerator;
  const denominator = settings.captureTimeSignatureDenominator;
  return ['seconds', 'bars', 'free'].includes(mode)
    && (seconds === undefined || (Number.isFinite(seconds) && seconds > 0))
    && (bars === undefined || (Number.isFinite(bars) && bars > 0))
    && (tempo === undefined || (Number.isFinite(tempo) && tempo >= 20 && tempo <= 300))
    && (mode !== 'bars' || (bars !== undefined && tempo !== undefined))
    && ((numerator === undefined && denominator === undefined)
      || (Number.isInteger(numerator) && numerator >= 1 && numerator <= 128
        && Number.isInteger(denominator) && denominator >= 1 && denominator <= 128));
};

/** Stable project paths for graph instances, independent of numeric host IDs. */
export function validateNamedInstances(signal, instances) {
  if (!Array.isArray(instances)) {
    fail('invalid-instances', 'Expected named instances');
  }
  const nodes = new Set(signal.nodes.map(node => node.id));
  const paths = new Set();
  const targets = new Set();
  return stable(instances.map(entry => {
    if (!exactKeys(entry, ['path', 'nodeId'])
      || typeof entry.path !== 'string' || !endpointPath.test(entry.path)
      || !Number.isInteger(entry.nodeId) || !nodes.has(entry.nodeId)
      || paths.has(entry.path) || targets.has(entry.nodeId)) {
      fail('invalid-instance', 'Named instance must bind one unique path to one existing node');
    }
    paths.add(entry.path);
    targets.add(entry.nodeId);
    return copy(entry);
  }).sort(comparePath));
}

/** Validate the authored path registry against the same numeric parameter catalog as the graph. */
export function validateParameterEndpoints(signal, endpoints) {
  if (!Array.isArray(endpoints)) {
    fail('invalid-endpoints', 'Expected parameter endpoints');
  }
  const nodes = new Map(signal.nodes.map(node => [node.id, node]));
  const parameters = new Map(signal.initialParameters.map(entry => [`${entry.nodeId}:${entry.id}`, entry.value]));
  const paths = new Set();
  const targets = new Set();
  const result = [];
  for (const entry of endpoints) {
    if (!exactKeys(entry, ['path', 'kind', 'nodeId', 'id', 'min', 'max', 'default'])
      || entry.kind !== 'parameter' || typeof entry.path !== 'string'
      || !endpointPath.test(entry.path)
      || !Number.isInteger(entry.nodeId) || !Number.isInteger(entry.id)
      || !Number.isFinite(entry.min) || !Number.isFinite(entry.max)
      || !Number.isFinite(entry.default) || Math.fround(entry.min) >= Math.fround(entry.max)
      || entry.default < entry.min || entry.default > entry.max) {
      fail('invalid-endpoint', 'Parameter endpoint has an invalid path, shape, or range');
    }
    const target = `${entry.nodeId}:${entry.id}`;
    const node = nodes.get(entry.nodeId);
    const spec = node && nodeParameters(node).find(parameter => parameter.id === entry.id);
    if (!spec || !parameters.has(target) || entry.min < spec.min || entry.max > spec.max
      || Math.fround(parameters.get(target)) < Math.fround(entry.min)
      || Math.fround(parameters.get(target)) > Math.fround(entry.max)
      || (spec.discrete && [entry.min, entry.max, entry.default].some(value => !Number.isInteger(value)))) {
      fail('invalid-endpoint-target', `Endpoint ${entry.path} does not bind a compatible graph parameter`);
    }
    if (paths.has(entry.path) || targets.has(target)) {
      fail('duplicate-endpoint', 'Endpoint paths and parameter targets must be unique');
    }
    paths.add(entry.path);
    targets.add(target);
    result.push(copy(entry));
  }
  return stable(result.sort(comparePath));
}

/** Saved slot ownership remains after its control is removed. */
export function validateHostAssignments(assignments) {
  if (!Array.isArray(assignments)) fail('invalid-host-assignments', 'Expected host assignments');
  const slots = new Set(), paths = new Set();
  return stable(assignments.map(entry => {
    if ((!exactKeys(entry, ['slot', 'path']) && !exactKeys(entry, ['slot'])) || !Number.isInteger(entry.slot)
      || entry.slot < 0 || entry.slot > 0xffffffff - 0x01000000
      || (entry.path !== undefined && (typeof entry.path !== 'string' || !endpointPath.test(entry.path) || paths.has(entry.path)))
      || slots.has(entry.slot)) {
      fail('invalid-host-assignment', 'Host assignments need unique slots and authored paths');
    }
    slots.add(entry.slot); if (entry.path !== undefined) paths.add(entry.path);
    return copy(entry);
  }).sort((a, b) => a.slot - b.slot));
}

export function validateHostBindings(signal, bindings) {
  if (!Array.isArray(bindings)) {
    fail('invalid-host-bindings', 'Expected host bindings');
  }
  const parameters = new Set(signal.initialParameters.map(entry => `${entry.nodeId}:${entry.id}`));
  const slots = new Set();
  const targets = new Set();
  return stable(bindings.map(entry => {
    if (!exactKeys(entry, ['slot', 'nodeId', 'id'])
      || !Number.isInteger(entry.slot) || entry.slot < 0 || entry.slot > 0xffffffff - 0x01000000
      || !Number.isInteger(entry.nodeId) || !Number.isInteger(entry.id)) {
      fail('invalid-host-binding', 'Host binding has invalid fields');
    }
    const target = `${entry.nodeId}:${entry.id}`;
    if (!parameters.has(target) || slots.has(entry.slot) || targets.has(target)) {
      fail('invalid-host-binding', 'Host slot and graph parameter must each be unique');
    }
    slots.add(entry.slot);
    targets.add(target);
    return copy(entry);
  }).sort((a, b) => a.slot - b.slot));
}

export function validateProjectControls(controls, endpoints = []) {
  if (!Array.isArray(controls)) {
    fail('invalid-controls', 'Expected project controls');
  }
  const paths = new Set(endpoints.map(entry => entry.path));
  return stable(controls.map(entry => {
    if (!exactKeys(entry, ['path', 'min', 'max', 'default', 'value', 'discrete'])
      || typeof entry.path !== 'string' || !endpointPath.test(entry.path)
      || !Number.isFinite(entry.min) || !Number.isFinite(entry.max)
      || !Number.isFinite(entry.default) || !Number.isFinite(entry.value)
      || [entry.min, entry.max, entry.default, entry.value].some(value => Math.abs(value) > 3.4028234663852886e38)
      || Math.fround(entry.min) >= Math.fround(entry.max)
      || entry.default < entry.min || entry.default > entry.max
      || entry.value < entry.min || entry.value > entry.max
      || typeof entry.discrete !== 'boolean'
      || entry.discrete && [entry.min, entry.max, entry.default, entry.value].some(value => !Number.isInteger(value))
      || paths.has(entry.path)) {
      fail('invalid-control', 'Project control has an invalid path, range, or value');
    }
    paths.add(entry.path);
    return copy(entry);
  }).sort(comparePath));
}

export function listPrimitives() {
  return stable(Object.entries(WORKSPACE_TYPES).map(([type, spec]) => describe(type, spec)));
}

export function getPrimitive(type) {
  const spec = Object.hasOwn(WORKSPACE_TYPES, type) ? WORKSPACE_TYPES[type] : undefined;
  if (!spec) fail('unknown-type', `Unknown primitive: ${type}`, { type });
  return describe(type, spec);
}

class PortRef {
  constructor(graph, id, generation, direction, index, description) {
    Object.defineProperty(this, 'graph', { value: graph });
    this.nodeId = id;
    this.generation = generation;
    this.direction = direction;
    this.index = index;
    this.name = description.name;
    this.signal = description.signal;
    Object.freeze(this);
  }
}

/** A named authoring reference; all validation still uses the shared graph contract. */
export class ParameterRef {
  constructor(node, name) {
    Object.defineProperty(this, 'node', { value: node });
    this.name = name;
    Object.freeze(this);
  }

  get description() {
    const description = this.node.graph.describeNode(this.node).parameters.find(p => p.name === this.name);
    if (!description) fail('unknown-parameter', `${this.node.type} has no named parameter ${this.name}`);
    return description;
  }

  set(value) {
    this.node.graph.setParameter(this.node, this.description.id, value);
    return this;
  }

  expose({ path, min, max, default: initial }) {
    const id = this.description.id;
    // Validate the complete declaration on a candidate before changing this graph.
    const candidate = this.node.graph.fork();
    const node = candidate.find(this.node.id);
    candidate.setParameter(node, id, initial);
    candidate.registerParameter(path, node, id, { min, max, default: initial });
    this.node.graph.setParameter(this.node, id, initial);
    this.node.graph.registerParameter(path, this.node, id, { min, max, default: initial });
    return this;
  }
}

export class NodeHandle {
  constructor(graph, id, generation, type) {
    Object.defineProperty(this, 'graph', { value: graph });
    this.id = id;
    this.generation = generation;
    this.type = type;
    Object.freeze(this);
  }

  #port(direction, name) {
    this.graph.assertHandle(this);
    const ports = this.graph.describeNode(this)[direction];
    const index = ports.findIndex(port => port.name === name);
    if (index < 0) fail('unknown-port', `${this.type} has no ${direction} port ${name}`,
      { nodeId: this.id, direction, name });
    return new PortRef(this.graph, this.id, this.generation, direction, index, ports[index]);
  }

  input(name) { return this.#port('inputs', name); }
  output(name) { return this.#port('outputs', name); }

  parameter(name) {
    const names = this.graph.describeNode(this).parameters.map(p => p.name).filter(Boolean);
    if (!names.includes(name)) fail('unknown-parameter', `${this.type} has no named parameter ${name}; available: ${names.join(', ') || 'numeric parameters only'}`);
    return new ParameterRef(this, name);
  }
}

/** Read accepted targets by public endpoint, without memorizing transport IDs. */
export function parameterValue(project, path) {
  const endpoint = project.endpoints?.find(entry => entry.path === path);
  if (!endpoint) fail('missing-endpoint', `Unknown parameter ${path}`);
  const parameter = project.signal.initialParameters.find(entry => entry.nodeId === endpoint.nodeId && entry.id === endpoint.id);
  if (!parameter) fail('missing-parameter', `No accepted value for ${path}`);
  return parameter.value;
}

export class GraphWorkspace {
  #nodes = new Map();
  #edges = new Map();
  #parameters = new Map();
  #omittedParameters = new Set();
  #endpoints = new Map();
  #hostBindings = new Map();
  #hostAssignments = new Map();
  #explicitHostBindings = false;
  #controls = new Map();
  #instances = new Map();
  #assets = new Map();
  #sampleBindings = new Map();
  #generations = new Map();
  #revision = 0;
  #inputSource = 'none';
  #captureSources = [];
  #defaultCaptureSourceId = null;
  #selectedCaptureSourceId = null;
  #selectedCaptureNodeId = null;
  #sidechainSource = undefined;
  #captureWindow = {};
  #io = null;

  constructor() {
    this.#insert(1, 'input.raw');
    this.#insert(3, 'output');
  }

  get revision() { return this.#revision; }
  get input() { return this.find(1); }
  get output() { return this.find(3); }
  get ioLayout() { return this.#io; }

  setIoLayout(layout) {
    const checked = validateIoLayout(layout, [...this.#nodes.values()]);
    this.#io = checked; this.#revision++;
    return this;
  }

  setInputSource(source) {
    if (this.#io) fail('declared-io', 'Use declared input buses instead of the legacy input recipe');
    if (!['none', 'external'].includes(source)) {
      fail('invalid-input-source', 'Input source must be external or none');
    }
    if (this.#inputSource !== source) {
      this.#inputSource = source;
      this.#revision++;
    }
    return this;
  }

  setSidechainSource(source) {
    if (this.#io) fail('declared-io', 'Use declared input buses instead of the legacy sidechain recipe');
    if (!['none', 'oscillator', 'microphone'].includes(source)) {
      fail('invalid-sidechain-source', 'Sidechain source must be none, oscillator, or microphone');
    }
    if (this.#sidechainSource !== source) {
      this.#sidechainSource = source;
      this.#revision++;
    }
    return this;
  }

  configureCaptureWindow(settings) {
    if (!validCaptureWindow(settings)) {
      fail('invalid-capture-window', 'Capture window settings are outside the supported range');
    }
    this.#captureWindow = copy(settings);
    this.#revision++;
    return this;
  }

  registerCaptureSource(handle, name, kind = 'custom', id = null) {
    this.assertHandle(handle);
    if (!['loop-capture', 'retrospective-capture'].includes(handle.type)
      || typeof name !== 'string' || !name || name.trim() !== name || name.length > 80
      || !['input', 'sidechain', 'layer', 'custom'].includes(kind)
      || this.#captureSources.some(source => source.nodeId === handle.id)) {
      fail('invalid-capture-source', 'Capture source needs a unique prepared capture node, name, and kind');
    }
    const used = new Set(this.#captureSources.map(source => source.id));
    const sourceId = id ?? Array.from({ length: 256 }, (_, candidate) => candidate)
      .find(candidate => !used.has(candidate));
    if (!Number.isInteger(sourceId) || sourceId < 0 || sourceId > 255 || used.has(sourceId)) {
      fail('invalid-capture-source', 'Capture source ID must be a unique byte');
    }
    this.#captureSources.push({ id: sourceId, nodeId: handle.id, name, kind });
    this.#defaultCaptureSourceId ??= sourceId;
    this.#selectedCaptureSourceId ??= sourceId;
    this.#selectedCaptureNodeId = this.#captureSources.find(source =>
      source.id === this.#selectedCaptureSourceId).nodeId;
    this.#revision++;
    return this;
  }

  selectCaptureSource(id) {
    if (!this.#captureSources.some(source => source.id === id)) {
      fail('unknown-capture-source', 'Capture source ID is not registered');
    }
    if (this.#selectedCaptureSourceId !== id) {
      this.#selectedCaptureSourceId = id;
      this.#selectedCaptureNodeId = this.#captureSources.find(source => source.id === id).nodeId;
      this.#revision++;
    }
    return this;
  }

  listCaptureSources() { return stable(this.#captureSources.map(copy)); }

  static fromProject(project) {
    if (!record(project) || Object.keys(project).some(key =>
      !['format', 'schemaVersion', 'projectId', 'signal', 'endpoints', 'hostBindings', 'hostAssignments', 'controls', 'instances', 'assets', 'sampleBindings', 'liveAuthoring'].includes(key))
      || ['format', 'schemaVersion', 'projectId', 'signal'].some(key => !Object.hasOwn(project, key))
      || project.format !== 'manifold.project' || project.schemaVersion !== 1
      || project.projectId !== 'manifold.graph-workspace') {
      fail('unsupported-project', 'Expected a plain graph-workspace project version 1');
    }
    const signal = project.signal;
    const required = ['inputs', 'outputs', 'nodes', 'connections', 'initialParameters'];
    const keys = Object.keys(signal ?? {});
    if (!record(signal) || required.some(key => !Object.hasOwn(signal, key))
      || keys.some(key => ![...required, 'io', 'inputSource', 'sidechainSource', 'captureSources',
        'defaultCaptureSourceId', 'selectedCaptureSourceId', 'selectedCaptureNodeId',
        ...CAPTURE_WINDOW_FIELDS].includes(key))
      || signal.io === undefined && (signal.inputs !== 2 || signal.outputs !== 2)
      || !['none', 'external'].includes(signal.inputSource ?? 'none')
      || (signal.sidechainSource !== undefined
        && !['none', 'oscillator', 'microphone'].includes(signal.sidechainSource))
      || !Array.isArray(signal.nodes) || !Array.isArray(signal.connections)
      || !Array.isArray(signal.initialParameters)) {
      fail('unsupported-project-fields', 'Expected a stereo graph with supported project fields');
    }
    if (signal.nodes.length < 2) {
      fail('project-size', 'Graph needs input and output boundaries');
    }
    const graph = new GraphWorkspace();
    graph.#inputSource = signal.inputSource ?? 'none';
    graph.#sidechainSource = signal.sidechainSource;
    graph.#captureWindow = Object.fromEntries(CAPTURE_WINDOW_FIELDS.filter(key =>
      signal[key] !== undefined).map(key => [key, signal[key]]));
    if (!validCaptureWindow(graph.#captureWindow)) {
      fail('invalid-capture-window', 'Project capture window settings are invalid');
    }
    const seen = new Set();
    for (const node of signal.nodes) {
      const spec = record(node) && Object.hasOwn(WORKSPACE_TYPES, node.type)
        ? WORKSPACE_TYPES[node.type] : undefined;
      if (!spec || !Number.isInteger(node.id) || node.id < 1 || node.id > 0xffffffff
        || seen.has(node.id) || !exactKeys(node, ['id', 'type', ...Object.keys(spec.args)])
        || !validArguments(node.type, node)) {
        fail('invalid-project-node', 'Project has an unknown, duplicate, or invalid graph node');
      }
      seen.add(node.id);
      if (node.id === 1 || node.id === 3) {
        if (node.type !== (node.id === 1 ? 'input.raw' : 'output')) {
          fail('invalid-project-boundary', 'Project boundary IDs have the wrong type');
        }
      } else {
        const config = Object.fromEntries(Object.entries(PORT_CATALOG[node.type].configuration)
          .map(([name, field]) => [name, node[field.argument]]));
        graph.add(node.type, { id: node.id, config });
      }
    }
    if (!seen.has(1) || !seen.has(3)) fail('missing-project-boundary', 'Project needs input and output boundary nodes');
    if (signal.captureSources !== undefined || signal.defaultCaptureSourceId !== undefined
      || signal.selectedCaptureSourceId !== undefined) {
      if (!Array.isArray(signal.captureSources) || signal.captureSources.length < 1) {
        fail('invalid-capture-sources', 'Project capture registry must contain a source');
      }
      for (const source of signal.captureSources) {
        if (!exactKeys(source, ['id', 'nodeId', 'name', 'kind'])) {
          fail('invalid-capture-source', 'Project capture source has invalid fields');
        }
        const handle = graph.find(source.nodeId);
        if (!handle) fail('invalid-capture-source', 'Project capture source node is missing');
        graph.registerCaptureSource(handle, source.name, source.kind, source.id);
      }
      if (!graph.#captureSources.some(source => source.id === signal.defaultCaptureSourceId)
        || !graph.#captureSources.some(source => source.id === signal.selectedCaptureSourceId
          && source.nodeId === signal.selectedCaptureNodeId)) {
        fail('invalid-capture-source', 'Project capture selection does not match its registry');
      }
      graph.#defaultCaptureSourceId = signal.defaultCaptureSourceId;
      graph.selectCaptureSource(signal.selectedCaptureSourceId);
    } else if (signal.selectedCaptureNodeId !== undefined) {
      const handle = graph.find(signal.selectedCaptureNodeId);
      if (!handle || !['loop-capture', 'retrospective-capture'].includes(handle.type)) {
        fail('invalid-capture-source', 'Selected capture node is missing');
      }
      graph.#selectedCaptureNodeId = signal.selectedCaptureNodeId;
    }
    if (project.assets !== undefined) {
      if (!Array.isArray(project.assets)) {
        fail('invalid-assets', 'Expected PCM assets');
      }
      for (const asset of project.assets) {
        const node = graph.find(asset?.nodeId);
        if (!node || !PCM_ASSET_TYPES.has(node.type) || graph.#assets.has(node.id)) {
          fail('invalid-asset-node', 'PCM asset needs a unique compatible graph node');
        }
        let portable;
        try { portable = validateSampleAsset(asset); }
        catch { fail('invalid-asset', 'Sample asset has invalid metadata or PCM'); }
        if (portable.nodeId !== node.id) fail('invalid-asset-node', 'PCM asset node changed during validation');
        graph.#assets.set(node.id, portable);
      }
    }
    if (project.sampleBindings !== undefined) {
      if (!Array.isArray(project.sampleBindings)) {
        fail('invalid-sample-bindings', 'Expected sample bindings');
      }
      for (const binding of project.sampleBindings) {
        if (!exactKeys(binding, ['sourceNodeId', 'nodeId'])
          || !Number.isInteger(binding.sourceNodeId) || !Number.isInteger(binding.nodeId)
          || !graph.#assets.has(binding.sourceNodeId)
          || graph.find(binding.sourceNodeId)?.type !== 'sample-region'
          || graph.find(binding.nodeId)?.type !== 'sample-region'
          || binding.sourceNodeId === binding.nodeId || graph.#assets.has(binding.nodeId)
          || graph.#sampleBindings.has(binding.nodeId)) {
          fail('invalid-sample-binding', 'Sample binding needs one source asset and a distinct unbound region');
        }
        graph.#sampleBindings.set(binding.nodeId, binding.sourceNodeId);
      }
    }
    for (const edge of signal.connections) {
      if (!(exactKeys(edge, ['from', 'to', 'inputPort'])
        || exactKeys(edge, ['from', 'outputPort', 'to', 'inputPort']))
        || !Number.isInteger(edge.from) || !Number.isInteger(edge.to)
        || !Number.isInteger(edge.inputPort) || !Number.isInteger(edge.outputPort ?? 0)) {
        fail('invalid-project-edge', 'Project connection has invalid indices or fields');
      }
      const from = graph.find(edge.from);
      const to = graph.find(edge.to);
      const output = from && graph.describeNode(from).outputs[edge.outputPort ?? 0];
      const input = to && graph.describeNode(to).inputs[edge.inputPort];
      if (!output || !input) fail('invalid-project-edge', 'Project connection refers to a missing node or port');
      graph.connect(from.output(output.name), to.input(input.name));
    }
    const parameters = new Set();
    for (const entry of signal.initialParameters) {
      if (!exactKeys(entry, ['nodeId', 'id', 'value'])
        || !Number.isInteger(entry.nodeId) || !Number.isInteger(entry.id)) {
        fail('invalid-project-parameter', 'Project parameter has invalid fields');
      }
      const handle = graph.find(entry.nodeId);
      const key = `${entry.nodeId}:${entry.id}`;
      if (!handle || parameters.has(key) || !graph.#parameters.has(key)) {
        fail('invalid-project-parameter', 'Project parameter is unknown or repeated');
      }
      parameters.add(key);
      graph.setParameter(handle, entry.id, entry.value);
    }
    for (const key of graph.#parameters.keys()) {
      if (parameters.has(key)) continue;
      const [nodeId, id] = key.split(':').map(Number);
      if (graph.find(nodeId)?.type === 'sample-region' && id >= 9 && id <= 11) {
        graph.#omittedParameters.add(key);
      } else {
        fail('missing-project-parameter', 'Project must specify every initial parameter');
      }
    }
    for (const endpoint of validateParameterEndpoints(graph.snapshot(), project.endpoints ?? [])) {
      graph.#endpoints.set(endpoint.path, endpoint);
    }
    graph.#explicitHostBindings = Object.hasOwn(project, 'hostBindings') || Object.hasOwn(project, 'hostAssignments');
    for (const assignment of validateHostAssignments(project.hostAssignments ?? [])) {
      graph.#hostAssignments.set(assignment.slot, assignment);
    }
    for (const binding of validateHostBindings(graph.snapshot(), project.hostBindings ?? [])) {
      const assignment = graph.#hostAssignments.get(binding.slot);
      const endpoint = assignment && graph.findParameter(assignment.path);
      if (assignment?.path !== undefined && (!endpoint || endpoint.nodeId !== binding.nodeId || endpoint.id !== binding.id))
        fail('reserved-host-slot', `Automation slot belongs to ${assignment.path}`);
      graph.#hostBindings.set(binding.slot, binding);
    }
    for (const control of validateProjectControls(project.controls ?? [], project.endpoints ?? [])) {
      graph.#controls.set(control.path, control);
    }
    for (const instance of validateNamedInstances(graph.snapshot(), project.instances ?? [])) {
      graph.#instances.set(instance.path, instance.nodeId);
    }
    if (signal.io !== undefined) {
      graph.setIoLayout(signal.io);
      if (signal.inputs !== signal.io.inputs.reduce((sum,b)=>sum+b.channels,0)
        || signal.outputs !== signal.io.outputs.reduce((sum,b)=>sum+b.channels,0)) fail('invalid-io', 'I/O channel totals disagree');
    }
    graph.toProject();
    graph.#revision = 0;
    return graph;
  }

  #insert(id, type) {
    const generation = (this.#generations.get(id) ?? 0) + 1;
    this.#generations.set(id, generation);
    this.#nodes.set(id, { id, type, ...copy(PORT_CATALOG[type].args) });
    for (const parameter of WORKSPACE_TYPES[type].parameters ?? []) {
      this.#parameters.set(`${id}:${parameter.id}`, { nodeId: id, id: parameter.id, value: parameter.default });
    }
    return new NodeHandle(this, id, generation, type);
  }

  /** Clone document state without decoding immutable sample assets again. */
  fork() {
    const next = new GraphWorkspace();
    next.#nodes = new Map(this.#nodes);
    next.#edges = new Map(this.#edges);
    next.#parameters = new Map(this.#parameters);
    next.#omittedParameters = new Set(this.#omittedParameters);
    next.#endpoints = new Map(this.#endpoints);
    next.#hostBindings = new Map(this.#hostBindings);
    next.#hostAssignments = new Map(this.#hostAssignments);
    next.#explicitHostBindings = this.#explicitHostBindings;
    next.#controls = new Map(this.#controls);
    next.#instances = new Map(this.#instances);
    next.#assets = new Map(this.#assets);
    next.#sampleBindings = new Map(this.#sampleBindings);
    next.#generations = new Map(this.#generations);
    next.#revision = this.#revision;
    next.#inputSource = this.#inputSource;
    next.#captureSources = this.#captureSources.map(copy);
    next.#defaultCaptureSourceId = this.#defaultCaptureSourceId;
    next.#selectedCaptureSourceId = this.#selectedCaptureSourceId;
    next.#selectedCaptureNodeId = this.#selectedCaptureNodeId;
    next.#sidechainSource = this.#sidechainSource;
    next.#captureWindow = copy(this.#captureWindow);
    next.#io = this.#io;
    return next;
  }

  setSampleAsset(handle, stereo, sourceRate, label = '') {
    this.assertHandle(handle);
    if (!PCM_ASSET_TYPES.has(handle.type)) {
      fail('invalid-asset-node', 'PCM needs a compatible sample or loop node');
    }
    if (this.#sampleBindings.has(handle.id)) {
      fail('invalid-asset-node', 'Remove the shared sample binding before assigning PCM');
    }
    let asset;
    try { asset = encodeSampleAsset(handle.id, stereo, sourceRate, label); }
    catch { fail('invalid-asset', 'Sample asset has invalid metadata or PCM'); }
    this.#assets.set(handle.id, asset);
    this.#revision++;
    return this;
  }

  removeSampleAsset(handle) {
    this.assertHandle(handle);
    if (this.#assets.delete(handle.id)) {
      for (const [target, source] of this.#sampleBindings) {
        if (source === handle.id) this.#sampleBindings.delete(target);
      }
      this.#revision++;
    }
    return this;
  }

  bindSampleAsset(source, target) {
    this.assertHandle(source);
    this.assertHandle(target);
    if (source.type !== 'sample-region' || target.type !== 'sample-region'
      || source.id === target.id || !this.#assets.has(source.id)
      || this.#assets.has(target.id)) {
      fail('invalid-sample-binding', 'Bind a region with PCM to a distinct unowned region');
    }
    if (this.#sampleBindings.get(target.id) !== source.id) {
      this.#sampleBindings.set(target.id, source.id);
      this.#revision++;
    }
    return this;
  }

  unbindSampleAsset(target) {
    this.assertHandle(target);
    if (this.#sampleBindings.delete(target.id)) this.#revision++;
    return this;
  }

  listSampleBindings() {
    return stable([...this.#sampleBindings].sort((a, b) => a[0] - b[0])
      .map(([nodeId, sourceNodeId]) => ({ sourceNodeId, nodeId })));
  }

  listSampleAssets() {
    return stable([...this.#assets.values()].sort((a, b) => a.nodeId - b.nodeId).map(copy));
  }

  assertHandle(handle) {
    if (!(handle instanceof NodeHandle) || handle.graph !== this
      || this.#generations.get(handle.id) !== handle.generation
      || this.#nodes.get(handle.id)?.type !== handle.type) {
      fail('stale-handle', 'Node handle does not refer to a current graph instance');
    }
  }

  /** Actual configured ports and parameters, shared by lookup and mutation. */
  describeNode(handle) {
    this.assertHandle(handle);
    const node = this.#nodes.get(handle.id);
    return stable({ ...copy(node), ...copy(nodePorts(node)), parameters: copy(nodeParameters(node)) });
  }

  #assertPort(ref, direction) {
    if (!(ref instanceof PortRef) || ref.graph !== this || ref.direction !== direction
      || this.#generations.get(ref.nodeId) !== ref.generation
      || !this.#nodes.has(ref.nodeId)
      || nodePorts(this.#nodes.get(ref.nodeId))[direction][ref.index]?.name !== ref.name) {
      fail('stale-port', `Expected a current ${direction} port from this graph`);
    }
  }

  add(type, { id, config = {} } = {}) {
    getPrimitive(type);
    if (!Number.isInteger(id) || id < 1 || id > 0xffffffff || this.#nodes.has(id)) {
      fail('invalid-id', 'Node ID must be an unused integer in the unsigned 32-bit node ID format', { id });
    }
    if (type === 'output' || id === 1 || id === 3) {
      fail('reserved-boundary', 'Input and output boundary nodes have fixed IDs');
    }
    const node = configuredNode(type, { id, type, ...PORT_CATALOG[type].args }, config);
    const handle = this.#insert(id, type);
    this.#nodes.set(id, node);
    if (type === 'mixer') {
      const supported = new Set(nodeParameters(node).map(parameter => parameter.id));
      for (const [key, parameter] of this.#parameters) {
        if (parameter.nodeId === id && !supported.has(parameter.id)) this.#parameters.delete(key);
      }
      for (const parameter of nodeParameters(node)) {
        const key = `${id}:${parameter.id}`;
        if (!this.#parameters.has(key)) this.#parameters.set(key, { nodeId: id, id: parameter.id, value: parameter.default });
      }
    }
    this.#revision++;
    return handle;
  }

  /** Structural configuration: publish through a graph transaction while running. */
  configure(handle, config) {
    this.assertHandle(handle);
    const previous = this.#nodes.get(handle.id), next = configuredNode(handle.type, previous, config);
    if (Object.keys(next).some(key => next[key] !== previous[key])) {
      if (handle.type === 'mixer') {
        const supported = new Set(nodeParameters(next).map(parameter => parameter.id));
        if ([...this.#edges.values()].some(edge => edge.to === handle.id && edge.inputPort >= next.a)
          || [...this.#endpoints.values(), ...this.#hostBindings.values()].some(entry =>
            entry.nodeId === handle.id && !supported.has(entry.id))) {
          fail('configuration-in-use', 'Remove cables and published parameters before removing their ports');
        }
        for (const [key, parameter] of this.#parameters) if (parameter.nodeId === handle.id && !supported.has(parameter.id)) {
          this.#parameters.delete(key); this.#omittedParameters.delete(key);
        }
        for (const parameter of nodeParameters(next)) {
          const key = `${handle.id}:${parameter.id}`;
          if (!this.#parameters.has(key)) this.#parameters.set(key, { nodeId: handle.id, id: parameter.id, value: parameter.default });
        }
      }
      this.#nodes.set(handle.id, next);
      this.#revision++;
    }
    return this;
  }

  /** Capture rings only; PCM, staging and other kernels add host-specific costs. */
  captureRingBytes(sampleRate) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 1 || !Number.isFinite(Math.fround(sampleRate))) {
      fail('invalid-sample-rate', 'Resource preparation requires a finite sample rate');
    }
    let bytes = 0;
    for (const node of this.#nodes.values()) if (['loop-capture', 'retrospective-capture'].includes(node.type)) {
      bytes += Math.max(1, Math.round(Math.fround(Math.fround(sampleRate) * Math.fround(node.a)))) * 8;
      if (!Number.isSafeInteger(bytes)) fail('resource-size-overflow', 'Capture storage size cannot be represented');
    }
    return bytes;
  }

  find(id) {
    const node = this.#nodes.get(id);
    return node ? new NodeHandle(this, id, this.#generations.get(id), node.type) : undefined;
  }

  connect(from, to) {
    this.#assertPort(from, 'outputs');
    this.#assertPort(to, 'inputs');
    if (from.signal !== to.signal) {
      fail('signal-mismatch', `${from.signal} cannot connect to ${to.signal}`,
        { from: from.nodeId, to: to.nodeId, inputPort: to.index });
    }
    const key = `${to.nodeId}:${to.index}`;
    if (this.#edges.has(key)) fail('occupied-input', 'Graph input is already connected', { to: to.nodeId, inputPort: to.index });
    const descendants = new Set([to.nodeId]);
    const queue = [to.nodeId];
    for (let i = 0; i < queue.length; i++) {
      for (const edge of this.#edges.values()) {
        if (edge.from === queue[i] && !descendants.has(edge.to)) {
          descendants.add(edge.to);
          queue.push(edge.to);
        }
      }
    }
    if (descendants.has(from.nodeId)) fail('cycle', 'Connection would create a graph cycle');
    this.#edges.set(key, { from: from.nodeId, outputPort: from.index, to: to.nodeId, inputPort: to.index });
    this.#revision++;
    return this;
  }

  disconnect(to) {
    this.#assertPort(to, 'inputs');
    if (this.#edges.delete(`${to.nodeId}:${to.index}`)) this.#revision++;
    return this;
  }

  remove(handle) {
    this.assertHandle(handle);
    if (this.#io && (this.#io.inputBindings.some(b=>b.nodeId===handle.id)
      || this.#io.outputBindings.some(b=>b?.nodeId===handle.id))) {
      fail('io-in-use', 'Remove host channel bindings before removing this node');
    }
    if (handle.id === 1 || handle.id === 3) fail('reserved-boundary', 'Boundary nodes cannot be removed');
    // Preserve named ownership even when opening an older explicit contract.
    for (const [slot, binding] of this.#hostBindings) if (binding.nodeId === handle.id) {
      const endpoint = this.listParameters().find(p => p.nodeId === handle.id && p.id === binding.id);
      if (!this.#hostAssignments.has(slot)) this.reserveHostSlots([{slot, ...(endpoint ? {path: endpoint.path} : {})}]);
    }
    this.#nodes.delete(handle.id);
    if (this.#captureSources.some(source => source.nodeId === handle.id)) {
      this.#captureSources = this.#captureSources.filter(source => source.nodeId !== handle.id);
      if (this.#defaultCaptureSourceId !== null
        && !this.#captureSources.some(source => source.id === this.#defaultCaptureSourceId)) {
        this.#defaultCaptureSourceId = this.#captureSources[0]?.id ?? null;
      }
      if (this.#selectedCaptureSourceId !== null
        && !this.#captureSources.some(source => source.id === this.#selectedCaptureSourceId)) {
        this.#selectedCaptureSourceId = this.#defaultCaptureSourceId;
      }
      this.#selectedCaptureNodeId = this.#captureSources.find(source =>
        source.id === this.#selectedCaptureSourceId)?.nodeId ?? null;
    }
    if (this.#selectedCaptureNodeId === handle.id) this.#selectedCaptureNodeId = null;
    this.#assets.delete(handle.id);
    for (const [target, source] of this.#sampleBindings) {
      if (source === handle.id || target === handle.id) this.#sampleBindings.delete(target);
    }
    for (const key of this.#parameters.keys()) {
      if (key.startsWith(`${handle.id}:`)) {
        this.#parameters.delete(key);
        this.#omittedParameters.delete(key);
      }
    }
    for (const [path, endpoint] of this.#endpoints) {
      if (endpoint.nodeId === handle.id) this.#endpoints.delete(path);
    }
    for (const [slot, binding] of this.#hostBindings) {
      if (binding.nodeId === handle.id) this.#hostBindings.delete(slot);
    }
    for (const [path, nodeId] of this.#instances) {
      if (nodeId === handle.id) this.#instances.delete(path);
    }
    for (const [key, edge] of this.#edges) {
      if (edge.from === handle.id || edge.to === handle.id) this.#edges.delete(key);
    }
    this.#revision++;
    return this;
  }

  setParameter(handle, id, value) {
    this.assertHandle(handle);
    const spec = nodeParameters(this.#nodes.get(handle.id)).find(parameter => parameter.id === id);
    if (!spec || !Number.isFinite(value)
      || (spec.discrete && !Number.isInteger(value))
      || (spec.choices ? !Number.isInteger(value)
        || !(spec.choiceValues ?? spec.choices.map((_, index) => index)).includes(value)
        : value < spec.min || value > spec.max)) {
      fail('invalid-parameter', `Invalid ${handle.type} parameter ${id}`, { nodeId: handle.id, id, value });
    }
    const key = `${handle.id}:${id}`;
    const endpoint = [...this.#endpoints.values()].find(entry => entry.nodeId === handle.id && entry.id === id);
    if (endpoint && (value < endpoint.min || value > endpoint.max)) {
      fail('invalid-parameter', `Value exceeds published range for ${endpoint.path}`);
    }
    const wasOmitted = this.#omittedParameters.delete(key);
    if (this.#parameters.get(key).value !== value || wasOmitted) {
      this.#parameters.set(key, { nodeId: handle.id, id, value });
      this.#revision++;
    }
    return this;
  }

  registerParameter(path, handle, id, { min, max, default: defaultValue }) {
    this.assertHandle(handle);
    if (this.#controls.has(path)) fail('duplicate-endpoint', `Path already belongs to a project control: ${path}`);
    const endpoint = { path, kind: 'parameter', nodeId: handle.id, id, min, max, default: defaultValue };
    const checked = validateParameterEndpoints(this.snapshot(), [...this.#endpoints.values(), endpoint]);
    this.#endpoints = new Map(checked.map(entry => [entry.path, entry]));
    this.#revision++;
    return this;
  }

  findParameter(path) { return this.#endpoints.get(path) ?? null; }
  listParameters() { return stable([...this.#endpoints.values()].sort(comparePath).map(copy)); }

  registerInstance(path, handle) {
    this.assertHandle(handle);
    const checked = validateNamedInstances(this.snapshot(), [
      ...this.listInstances(), { path, nodeId: handle.id },
    ]);
    this.#instances = new Map(checked.map(entry => [entry.path, entry.nodeId]));
    this.#revision++;
    return this;
  }

  findInstance(path) {
    const id = this.#instances.get(path);
    return id === undefined ? undefined : this.find(id);
  }

  listInstances() {
    return stable([...this.#instances].map(([path, nodeId]) => ({ path, nodeId })).sort(comparePath));
  }

  unregisterInstance(path) {
    if (this.#instances.delete(path)) this.#revision++;
    return this;
  }

  unregisterParameter(path) {
    if (this.#endpoints.delete(path)) this.#revision++;
    return this;
  }

  bindHostSlot(slot, handle, id) {
    this.assertHandle(handle);
    const candidate = { slot, nodeId: handle.id, id };
    const checked = validateHostBindings(this.snapshot(), [...this.#hostBindings.values(), candidate]);
    const endpoint = this.listParameters().find(p => p.nodeId === handle.id && p.id === id);
    if (endpoint) this.reserveHostSlots([{ slot, path: endpoint.path }]);
    else if (this.#hostAssignments.has(slot)) fail('reserved-host-slot', 'Automation slot is reserved');
    this.#explicitHostBindings = true;
    this.#hostBindings = new Map(checked.map(entry => [entry.slot, entry]));
    this.#revision++;
    return this;
  }

  hostSlotForPath(path) {
    const endpoint = this.findParameter(path);
    if (!endpoint) return null;
    const explicit = [...this.#hostBindings.values()].find(binding =>
      binding.nodeId === endpoint.nodeId && binding.id === endpoint.id);
    if (explicit) return explicit.slot;
    if (this.#explicitHostBindings) return null;
    const occupied = new Set(this.#hostBindings.keys());
    const targets = new Set([...this.#hostBindings.values()].map(binding => `${binding.nodeId}:${binding.id}`));
    for (const parameter of this.snapshot().initialParameters) {
      const key = `${parameter.nodeId}:${parameter.id}`;
      if (targets.has(key)) continue;
      let slot = 0;
      while (occupied.has(slot)) slot++;
      if (parameter.nodeId === endpoint.nodeId && parameter.id === endpoint.id) return slot;
      occupied.add(slot);
    }
    return null;
  }

  reserveHostSlots(assignments) {
    const merged = new Map(this.#hostAssignments);
    for (const entry of validateHostAssignments(assignments)) {
      const previous = merged.get(entry.slot);
      if (previous && previous.path !== entry.path)
        fail('reserved-host-slot', `Automation slot belongs to ${previous.path}`);
      merged.set(entry.slot, entry);
    }
    const checked = validateHostAssignments([...merged.values()]);
    this.#hostAssignments = new Map(checked.map(entry => [entry.slot, entry]));
    this.#explicitHostBindings = true;
    return this;
  }

  listHostAssignments() { return stable([...this.#hostAssignments.values()].sort((a, b) => a.slot - b.slot).map(copy)); }

  listHostBindings() { return stable([...this.#hostBindings.values()].sort((a, b) => a.slot - b.slot).map(copy)); }

  unbindHostSlot(slot) {
    if (this.#hostBindings.has(slot) && !this.#hostAssignments.has(slot)) {
      const binding = this.#hostBindings.get(slot);
      const endpoint = this.listParameters().find(p => p.nodeId === binding.nodeId && p.id === binding.id);
      this.reserveHostSlots([{slot, ...(endpoint ? {path:endpoint.path} : {})}]);
    }
    if (this.#hostBindings.delete(slot)) this.#revision++;
    return this;
  }

  registerControl(path, { min, max, default: defaultValue, discrete = false }) {
    const control = { path, min, max, default: defaultValue, value: defaultValue, discrete };
    const checked = validateProjectControls([...this.#controls.values(), control], this.listParameters());
    this.#controls = new Map(checked.map(entry => [entry.path, entry]));
    this.#revision++;
    return this;
  }

  setControl(path, value) {
    const previous = this.#controls.get(path);
    if (!previous) fail('unknown-control', `Unknown project control: ${path}`);
    const [next] = validateProjectControls([{ ...previous, value }]);
    if (previous.value !== next.value) {
      this.#controls.set(path, next);
      this.#revision++;
    }
    return this;
  }

  findControl(path) { return this.#controls.get(path) ?? null; }
  listControls() { return stable([...this.#controls.values()].sort(comparePath).map(copy)); }
  unregisterControl(path) {
    if (this.#controls.delete(path)) this.#revision++;
    return this;
  }

  snapshot() {
    return stable({ revision: this.#revision,
      nodes: [...this.#nodes.values()].sort((a, b) => a.id - b.id).map(copy),
      connections: [...this.#edges.values()].sort(compareEdge).map(copy),
      initialParameters: [...this.#parameters.values()]
        .sort((a, b) => a.nodeId - b.nodeId || a.id - b.id).map(copy),
      endpoints: this.listParameters(), hostBindings: this.listHostBindings(), hostAssignments: this.listHostAssignments(), controls: this.listControls(),
      instances: this.listInstances() });
  }

  toProject({ inputSource = this.#inputSource } = {}) {
    if (!['external', 'none'].includes(inputSource)) fail('invalid-input-source', 'Input source must be external or none');
    const graph = this.snapshot();
    if (this.#io) validateIoLayout(this.#io, graph.nodes);
    else {
      if (graph.nodes.filter(n=>n.type==='input.raw').length !== 1) fail('invalid-io', 'Additional input nodes need an explicit I/O layout');
      if (!graph.connections.some(edge => edge.to === 3)) fail('unconnected-output', 'Connect an audio source to the output before export');
    }
    return stable({ format: 'manifold.project', schemaVersion: 1,
      projectId: 'manifold.graph-workspace',
      signal: { inputs: this.#io ? this.#io.inputs.reduce((sum,b)=>sum+b.channels,0) : 2,
        outputs: this.#io ? this.#io.outputs.reduce((sum,b)=>sum+b.channels,0) : 2,
        ...(!this.#io ? {inputSource} : {}),
        ...(this.#io ? {io:this.#io} : {}),
        ...(this.#io || this.#sidechainSource === undefined ? {} : { sidechainSource: this.#sidechainSource }),
        nodes: graph.nodes.map(copy), connections: graph.connections.map(copy),
        initialParameters: graph.initialParameters.filter(entry =>
          !this.#omittedParameters.has(`${entry.nodeId}:${entry.id}`)).map(copy),
        ...copy(this.#captureWindow),
        ...(this.#captureSources.length ? {
          captureSources: this.listCaptureSources(),
          defaultCaptureSourceId: this.#defaultCaptureSourceId,
          selectedCaptureSourceId: this.#selectedCaptureSourceId,
          selectedCaptureNodeId: this.#selectedCaptureNodeId,
        } : this.#selectedCaptureNodeId === null ? {} : {
          selectedCaptureNodeId: this.#selectedCaptureNodeId,
        }) },
      ...(graph.endpoints.length ? { endpoints: graph.endpoints.map(copy) } : {}),
      ...(this.#explicitHostBindings || graph.hostBindings.length ? { hostBindings: graph.hostBindings.map(copy) } : {}),
      ...(graph.hostAssignments.length ? { hostAssignments: graph.hostAssignments.map(copy) } : {}),
      ...(graph.controls.length ? { controls: graph.controls.map(copy) } : {}),
      ...(graph.instances.length ? { instances: graph.instances.map(copy) } : {}),
      ...(this.#assets.size ? { assets: this.listSampleAssets() } : {}),
      ...(this.#sampleBindings.size ? { sampleBindings: this.listSampleBindings() } : {}) });
  }
}

export function createGraphWorkspace() { return new GraphWorkspace(); }

/** Owns a graph snapshot while a prepared host applies one route at a time. */
export class LiveGraphSession {
  #graph;
  #applyRoute;
  #applyParameter;
  #applyParameterBatch;
  #applyGraph;
  #readPublishedParameters;
  #pending = Promise.resolve();
  #revision = 0;

  constructor(graph, applyRoute, applyParameter = null, applyGraph = null,
    applyParameterBatch = null, readPublishedParameters = null) {
    if (!(graph instanceof GraphWorkspace) || typeof applyRoute !== 'function') {
      fail('invalid-live-session', 'Live routing needs an authored graph and a host route adapter');
    }
    if (applyParameter !== null && typeof applyParameter !== 'function') {
      fail('invalid-live-session', 'Parameter adapter must be a function');
    }
    if (applyGraph !== null && typeof applyGraph !== 'function') {
      fail('invalid-live-session', 'Graph publication adapter must be a function');
    }
    if (applyParameterBatch !== null && typeof applyParameterBatch !== 'function') {
      fail('invalid-live-session', 'Parameter batch adapter must be a function');
    }
    if (readPublishedParameters !== null && typeof readPublishedParameters !== 'function') {
      fail('invalid-live-session', 'Published parameter reader must be a function');
    }
    graph.toProject();
    this.#graph = graph.fork();
    this.#applyRoute = applyRoute;
    this.#applyParameter = applyParameter;
    this.#applyGraph = applyGraph;
    this.#applyParameterBatch = applyParameterBatch;
    this.#readPublishedParameters = readPublishedParameters;
  }

  snapshot() { return stable({ ...this.#graph.snapshot(), revision: this.#revision }); }
  toProject() { return this.#graph.toProject(); }
  forkGraph() { return this.#graph.fork(); }

  /** Save new PCM only after the prepared host accepts the same shared source. */
  sampleAsset(nodeId, stereo, sourceRate, label, applySample) {
    if (typeof applySample !== 'function') fail('sample-unavailable', 'Prepared host has no sample adapter');
    return this.#enqueue(async () => {
      const staged = this.#graph.fork();
      const node = staged.find(nodeId);
      if (!node) fail('missing-node', `Sample node ${nodeId} is unavailable`);
      staged.setSampleAsset(node, stereo, sourceRate, label);
      const project = staged.toProject();
      const bindingTargets = staged.listSampleBindings().filter(binding =>
        binding.sourceNodeId === nodeId).map(binding => binding.nodeId);
      const accepted = await applySample(nodeId, sourceRate, stereo, bindingTargets);
      if (accepted === false) fail('host-rejected-sample', 'Prepared host rejected the Sample source');
      this.#graph = staged;
      this.#revision++;
      return project;
    });
  }

  configureCaptureWindow(settings) {
    return this.#enqueue(() => {
      const staged = this.#graph.fork();
      staged.configureCaptureWindow(settings);
      const project = staged.toProject();
      this.#graph = staged;
      this.#revision++;
      return project;
    });
  }

  selectCaptureSource(id) {
    return this.#enqueue(() => {
      const staged = this.#graph.fork();
      staged.selectCaptureSource(id);
      const project = staged.toProject();
      this.#graph = staged;
      this.#revision++;
      return project;
    });
  }

  #enqueue(change) {
    const result = this.#pending.then(async () => {
      if (this.#readPublishedParameters) {
        this.#adoptParameters(await this.#readPublishedParameters());
      }
      const changed = await change();
      if (this.#readPublishedParameters) {
        this.#adoptParameters(await this.#readPublishedParameters());
      }
      return changed?.format === 'manifold.project' ? this.#graph.toProject() : changed;
    });
    this.#pending = result.then(() => {}, () => {});
    return result;
  }

  /** Adopt DSP targets already accepted by this host; never submit audio work.
   * Queue with edits so a host snapshot cannot overwrite a pending transaction.
   * Authored controls, instance paths, routes and script-local state survive.
   */
  adoptPublishedParameters(edits) {
    return this.#enqueue(() => this.#adoptParameters(edits));
  }

  #adoptParameters(edits) {
    if (!Array.isArray(edits)) fail('invalid-parameter-snapshot', 'Published parameters must be an array');
    const staged = this.#graph.fork();
    const seen = new Set();
    for (const { nodeId, id, value } of edits) {
      const key = `${nodeId}:${id}`;
      if (seen.has(key)) fail('invalid-parameter-snapshot', `Duplicate published parameter: ${key}`);
      seen.add(key);
      const node = staged.find(nodeId);
      if (!node) fail('missing-node', `Published parameter node ${nodeId} is unavailable`);
      staged.setParameter(node, id, value);
    }
    const project = staged.toProject();
    if (JSON.stringify(project.signal.initialParameters) !==
      JSON.stringify(this.#graph.toProject().signal.initialParameters)) {
      this.#graph = staged;
      this.#revision++;
    }
    return this.#graph.toProject();
  }

  route({ to, input, from = null, output } = {}) {
    return this.#enqueue(() => this.#routeChange({ to, input, from, output }));
  }

  /** Commit one saved project control with the route acknowledged by a prepared host. */
  routeWithControl(route, { path, value } = {}) {
    return this.#enqueue(() => this.#routeChange(route, { path, value }));
  }

  async #routeChange({ to, input, from = null, output } = {}, control = null) {
    const staged = this.#graph.fork();
    if (control) staged.setControl(control.path, control.value);
    const target = staged.find(to);
    if (!target) fail('missing-node', `Target node ${to} is unavailable`);
    const targetPort = target.input(input);
    staged.disconnect(targetPort);
    let sourcePort;
    if (from !== null) {
      const source = staged.find(from);
      if (!source) fail('missing-node', `Source node ${from} is unavailable`);
      sourcePort = source.output(output);
      staged.connect(sourcePort, targetPort);
    }
    staged.toProject();
    const accepted = await this.#applyRoute({
      to, inputPort: targetPort.index,
      from, outputPort: sourcePort?.index ?? 0,
    });
    if (accepted === false) fail('host-rejected-route', 'Prepared host rejected the route');
    this.#graph = staged;
    this.#revision++;
    return this.#graph.toProject();
  }

  parameter({ nodeId, id, value } = {}) {
    if (!this.#applyParameter) fail('parameter-unavailable', 'Prepared host has no parameter adapter');
    return this.#enqueue(() => this.#parameterChange(nodeId, id, value));
  }

  /** Commit a project control and its derived DSP parameter after host acknowledgement. */
  parameterWithControl(parameter, { path, value } = {}) {
    if (!this.#applyParameter) fail('parameter-unavailable', 'Prepared host has no parameter adapter');
    return this.#enqueue(() => this.#parameterChange(
      parameter?.nodeId, parameter?.id, parameter?.value, { path, value }));
  }

  /** Apply a bounded group between blocks and save its control on one host acknowledgement. */
  parametersWithControl(edits, { path, value } = {}) {
    return this.#parameterBatch(edits, { path, value });
  }

  /** Apply direct parameter targets as one acknowledged, bounded group. */
  parameters(edits) {
    return this.#parameterBatch(edits);
  }

  #parameterBatch(edits, control = null) {
    if (!this.#applyParameterBatch) fail('batch-unavailable', 'Prepared host has no parameter batch adapter');
    return this.#enqueue(async () => {
      if (!Array.isArray(edits) || edits.length < 1) {
        fail('invalid-parameter-batch', 'Parameter batch must contain at least one edit');
      }
      const staged = this.#graph.fork();
      if (control) staged.setControl(control.path, control.value);
      for (const edit of edits) {
        const node = staged.find(edit.nodeId);
        if (!node) fail('missing-node', `Parameter node ${edit.nodeId} is unavailable`);
        staged.setParameter(node, edit.id, edit.value);
      }
      const project = staged.toProject();
      const accepted = await this.#applyParameterBatch(edits.map(edit => ({
        nodeId: edit.nodeId, id: edit.id, value: edit.value,
      })));
      if (accepted === false) fail('host-rejected-parameter-batch', 'Prepared host rejected the parameter batch');
      this.#graph = staged;
      this.#revision++;
      return project;
    });
  }

  parameterPath(path, value) {
    if (!this.#applyParameter) fail('parameter-unavailable', 'Prepared host has no parameter adapter');
    return this.#enqueue(() => {
      const endpoint = this.#graph.findParameter(path);
      if (!endpoint) fail('unknown-parameter-path', `Unknown project parameter: ${path}`);
      if (!Number.isFinite(value) || value < endpoint.min || value > endpoint.max) {
        fail('invalid-parameter', `Invalid project parameter: ${path}`);
      }
      return this.#parameterChange(endpoint.nodeId, endpoint.id, value);
    });
  }

  async #parameterChange(nodeId, id, value, control = null) {
    const staged = this.#graph.fork();
    if (control) staged.setControl(control.path, control.value);
    const node = staged.find(nodeId);
    if (!node) fail('missing-node', `Parameter node ${nodeId} is unavailable`);
    staged.setParameter(node, id, value);
    const project = staged.toProject();
    const accepted = await this.#applyParameter({ nodeId, id, value });
    if (accepted === false) fail('host-rejected-parameter', 'Prepared host rejected the parameter');
    this.#graph = staged;
    this.#revision++;
    return project;
  }

  transaction(edit) {
    if (!this.#applyGraph) fail('structural-unavailable', 'Prepared host has no graph publication adapter');
    if (typeof edit !== 'function') fail('invalid-graph-edit', 'Graph edit must be a function');
    return this.#enqueue(async () => {
      const staged = this.#graph.fork();
      await edit(staged);
      const project = staged.toProject();
      const accepted = await this.#applyGraph(project);
      if (accepted === false) fail('host-rejected-graph', 'Prepared host rejected the graph transaction');
      this.#graph = staged;
      this.#revision++;
      return project;
    });
  }
}

export function createLiveGraphSession(graph, applyRoute, applyParameter, applyGraph, applyParameterBatch, readPublishedParameters) {
  return new LiveGraphSession(graph, applyRoute, applyParameter, applyGraph, applyParameterBatch, readPublishedParameters);
}
