// Browser authoring contract for a subset of Rust's prepared typed graph.
// Rust compilation remains the final authority when playback starts.
import { encodePcm, decodePcm } from '../state/stereo-source.js';
export const SAMPLE_NODE_TYPES = new Set(['sample-instrument', 'sample-region', 'granulator', 'main-voice-bank']);
const NOTE_NODE_TYPES = new Set(['voice-synth', 'sample-instrument', 'sample-region', 'main-voice-bank']);
export const NODE_TYPES = {
  'input.raw': { label: 'Live input', code: 0, output: 'audio', inputs: [], fixedId: 1 },
  'input.sidechain': { label: 'Sidechain input', code: 65, output: 'audio', inputs: [] },
  output: { label: 'Output', code: 7, output: null, inputs: ['audio'], fixedId: 3 },
  gain: { label: 'Gain', code: 3, output: 'audio', inputs: ['audio'], args: { a: .7 },
    parameters: [{ id: 0, label: 'Level', min: 0, max: 2, default: .7 }] },
  'fixed-gain': { label: 'Fixed gain ×4', code: 67, output: 'audio', inputs: ['audio'], args: { a: 4 } },
  distortion: { label: 'Distortion', code: 17, output: 'audio', inputs: ['audio'], args: { a: 4, b: .7 },
    parameters: [{ id: 0, label: 'Drive', min: 1, max: 30, default: 4 },
      { id: 1, label: 'Wet mix', min: 0, max: 1, default: .7 },
      { id: 2, label: 'Output', min: 0, max: 2, default: .8 }] },
  svf: { label: 'SVF filter', code: 6, output: 'audio', inputs: ['audio'],
    parameters: [{ id: 0, label: 'Mode', choices: ['Low pass', 'Band pass', 'High pass', 'Notch'], default: 0 },
      { id: 1, label: 'Cutoff', min: 20, max: 20000, default: 3200 },
      { id: 2, label: 'Resonance', min: .1, max: 1, default: .75 }] },
  sum2: { label: 'Audio sum', code: 4, output: 'audio', inputs: ['audio', 'audio'], args: { a: 1, b: 1 } },
  'loop-capture': { label: 'Loop capture', code: 20, output: 'audio', inputs: ['audio'], args: { a: 2, b: 1 },
    parameters: [
      { id: 0, label: 'Record', choices: ['Stopped', 'Recording'], default: 0 },
      { id: 1, label: 'Play', choices: ['Off', 'On'], default: 0 },
      { id: 2, label: 'Overdub', choices: ['Off', 'On'], default: 0 },
      { id: 3, label: 'Speed', min: .25, max: 2, default: 1 },
      { id: 4, label: 'Reverse', choices: ['Forward', 'Reverse'], default: 0 },
      { id: 5, label: 'Loop mix', min: 0, max: 1, default: 1 },
      { id: 6, label: 'Overdub level', min: 0, max: 1, default: .5 },
    ] },
  'retrospective-capture': { label: 'Retrospective capture', code: 66, output: 'audio', inputs: ['audio'], args: { a: 30, b: 0 } },
  oscillator: { label: 'Oscillator', code: 11, output: 'audio', inputs: ['audio'], args: { a: 220, b: .4 },
    parameters: [{ id: 0, label: 'Waveform', choices: ['Sine', 'Saw', 'Square', 'Triangle', 'Blend'], default: 0 },
      { id: 1, label: 'Frequency', min: 20, max: 16000, default: 220 },
      { id: 2, label: 'Level', min: 0, max: 1, default: .4 }] },
  noise: { label: 'Noise', code: 13, output: 'audio', inputs: [], args: { a: .08, b: .5 },
    parameters: [{ id: 0, label: 'Level', min: 0, max: 1, default: .08 },
      { id: 1, label: 'Color', min: 0, max: 1, default: .5 }] },
  lfo: { label: 'LFO', code: 14, output: 'control', inputs: [], args: { a: 2 },
    parameters: [{ id: 0, label: 'Waveform', choices: ['Sine', 'Triangle', 'Square'], default: 0 },
      { id: 1, label: 'Rate', min: .05, max: 20, default: 2 }] },
  'modulated-gain': { label: 'CV gain', code: 15, output: 'audio', inputs: ['audio', 'control'], args: { a: .5, b: .4 },
    parameters: [{ id: 0, label: 'Base', min: 0, max: 2, default: .5 },
      { id: 1, label: 'Depth', min: -2, max: 2, default: .4 }] },
  'midi-input': { label: 'MIDI input', code: 54, output: 'midi', inputs: [] },
  'midi-transpose': { label: 'MIDI transpose', code: 55, output: 'midi', inputs: ['midi'], args: { a: 0 },
    parameters: [{ id: 0, label: 'Semitones', min: -24, max: 24, default: 0 }] },
  'voice-synth': { label: 'Voice synth', code: 10, output: 'audio', inputs: ['midi'],
    parameters: [{ id: 0, label: 'Waveform', choices: ['Sine', 'Saw', 'Square', 'Triangle'], default: 0 },
      { id: 1, label: 'Attack', min: .001, max: 2, default: .01 },
      { id: 2, label: 'Decay', min: .001, max: 2, default: .12 },
      { id: 3, label: 'Sustain', min: 0, max: 1, default: .65 },
      { id: 4, label: 'Release', min: .001, max: 3, default: .18 },
      { id: 5, label: 'Level', min: 0, max: 1, default: .25 }] },
  'sample-instrument': { label: 'Sample instrument', code: 27, output: 'audio', inputs: ['midi'],
    parameters: [
      { id: 0, label: 'Root note', min: 36, max: 84, default: 60 },
      { id: 1, label: 'Key tracking', min: 0, max: 1, default: 1 },
      { id: 2, label: 'Level', min: 0, max: .5, default: .25 },
      { id: 3, label: 'Speed', min: .25, max: 2, default: 1 },
      { id: 4, label: 'Reverse', choices: ['Forward', 'Reverse'], default: 0 },
      { id: 5, label: 'One shot', choices: ['Loop', 'One shot'], default: 0 },
      { id: 6, label: 'Play start', min: 0, max: 1, default: 0 },
      { id: 7, label: 'Loop start', min: 0, max: 1, default: 0 },
      { id: 8, label: 'Loop end', min: 0, max: 1, default: 1 },
      { id: 9, label: 'Crossfade', min: 0, max: .5, default: .08 },
      { id: 10, label: 'Release', min: 0, max: .2, default: .01 },
      { id: 11, label: 'Unison', min: 1, max: 4, default: 1 },
      { id: 12, label: 'Detune', min: 0, max: 100, default: 0 },
      { id: 13, label: 'Spread', min: 0, max: 1, default: 0 },
    ] },
  'sample-region': { label: 'Sample region', code: 26, output: 'audio', inputs: ['midi'],
    parameters: [
      { id: 0, label: 'Speed', min: .25, max: 2, default: 1 },
      { id: 1, label: 'Reverse', choices: ['Forward', 'Reverse'], default: 0 },
      { id: 2, label: 'One shot', choices: ['Loop', 'One shot'], default: 0 },
      { id: 3, label: 'Play start', min: 0, max: 1, default: 0 },
      { id: 4, label: 'Loop start', min: 0, max: 1, default: 0 },
      { id: 5, label: 'Loop end', min: 0, max: 1, default: 1 },
      { id: 8, label: 'Crossfade', min: 0, max: .5, default: .08 },
    ] },
  granulator: { label: 'Granulator', code: 51, output: 'audio', inputs: ['audio'],
    parameters: [
      { id: 0, label: 'Grain size', min: 1, max: 500, default: 80 },
      { id: 1, label: 'Density', min: 1, max: 100, default: 20 },
      { id: 2, label: 'Position', min: 0, max: 1, default: .5 },
      { id: 3, label: 'Pitch', min: -24, max: 24, default: 0 },
      { id: 4, label: 'Spray', min: 0, max: 1, default: .2 },
      { id: 5, label: 'Wet mix', min: 0, max: 1, default: 1 },
      { id: 6, label: 'Freeze', choices: ['Capture', 'Freeze'], default: 0 },
      { id: 7, label: 'Envelope', choices: ['Hann', 'Triangle', 'Blackman', 'Tukey', 'Rectangle'], default: 0 },
      { id: 8, label: 'Enabled', choices: ['Off', 'On'], default: 1 },
      { id: 9, label: 'Region start', min: 0, max: 1, default: 0 },
      { id: 10, label: 'Region end', min: 0, max: 1, default: 1 },
    ] },
  'main-voice-bank': { label: 'Main voice bank', code: 64, output: 'audio', inputs: ['midi'], args: { a: 9 },
    parameters: [
      { id: 0, label: 'Wave shape', choices: ['Sine', 'Saw', 'Square', 'Triangle', 'Sine + saw'], default: 0 },
      { id: 1, label: 'Wave / sample', min: -1, max: 1, default: 0 },
      { id: 2, label: 'Sample root', min: 36, max: 84, default: 60 },
      { id: 3, label: 'Keytrack', choices: ['Wave', 'Sample', 'Both'], default: 2 },
      { id: 4, label: 'Sample pitch', min: -24, max: 24, default: 0 },
      { id: 5, label: 'Pitch engine', choices: ['Classic', 'Vocoder', 'Vocoder HQ'], default: 0 },
      { id: 6, label: 'Blend mode', choices: ['Normal', 'Ring', 'FM', 'Sync', 'Add', 'Morph'], default: 0 },
      { id: 7, label: 'Direction depth', min: 0, max: 1, default: .5 },
      { id: 8, label: 'Wave to sample', min: 0, max: 1, default: .5 },
      { id: 9, label: 'Sample to wave', min: 0, max: 1, default: 0 },
      { id: 10, label: 'Sync retrigger', choices: ['Off', 'On'], default: 1 },
      { id: 11, label: 'Attack', min: .001, max: .5, default: .005 },
      { id: 12, label: 'Decay', min: .001, max: 1, default: .08 },
      { id: 13, label: 'Sustain', min: 0, max: 1, default: .8 },
      { id: 14, label: 'Release', min: .001, max: 2, default: .16 },
      { id: 15, label: 'Output', min: 0, max: 2, default: 1 },
      { id: 16, label: 'Vocoder time', min: .25, max: 4, default: 1 },
      { id: 17, label: 'Phrase contour', min: 0, max: 1, default: 0 },
      { id: 18, label: 'Phrase reference', min: .05, max: .6, default: .2 },
      { id: 19, label: 'Add wave source', choices: ['Prepared partials', 'Original additive'], default: 0 },
    ] },
};

const PROJECT_FORMAT = 'manifold.project';
const PROJECT_VERSION = 1;
const projectId = 'manifold.graph-workspace';
const sameKeys = (value, keys) => Object.keys(value).sort().join('|') === [...keys].sort().join('|');

export function validateTopology(signal) {
  const baseKeys = ['inputs', 'outputs', 'nodes', 'connections', 'initialParameters'];
  const allowedKeys = new Set([...baseKeys, 'inputSource', 'sidechainSource', 'selectedCaptureNodeId',
    'captureWindowSeconds', 'captureWindowMode', 'captureWindowBars', 'captureTempoBpm',
    'captureTimeSignatureNumerator', 'captureTimeSignatureDenominator']);
  if (!signal || typeof signal !== 'object' || Array.isArray(signal)
    || !baseKeys.every((key) => Object.hasOwn(signal, key))
    || Object.keys(signal).some((key) => !allowedKeys.has(key))
    || signal.inputs !== 2 || signal.outputs !== 2
    || (signal.inputSource !== undefined && !['external', 'none'].includes(signal.inputSource))
    || (signal.sidechainSource !== undefined && !['none', 'oscillator', 'microphone'].includes(signal.sidechainSource))
    || (signal.captureWindowSeconds !== undefined && (typeof signal.captureWindowSeconds !== 'number'
      || !Number.isFinite(signal.captureWindowSeconds)
      || signal.captureWindowSeconds < (signal.captureWindowMode === 'free' ? 0 : .05)
      || signal.captureWindowSeconds === 0 || signal.captureWindowSeconds > 30))
    || (signal.captureWindowMode !== undefined && !['seconds', 'bars', 'free'].includes(signal.captureWindowMode))
    || (signal.captureWindowBars !== undefined && (typeof signal.captureWindowBars !== 'number'
      || !Number.isFinite(signal.captureWindowBars) || signal.captureWindowBars < .0625 || signal.captureWindowBars > 16))
    || (signal.captureTempoBpm !== undefined && (typeof signal.captureTempoBpm !== 'number'
      || !Number.isFinite(signal.captureTempoBpm) || signal.captureTempoBpm < 20 || signal.captureTempoBpm > 300))
    || ['captureTimeSignatureNumerator', 'captureTimeSignatureDenominator'].some((key) =>
      signal[key] !== undefined && (!Number.isInteger(signal[key]) || signal[key] < 1 || signal[key] > 128))
    || ((signal.captureTimeSignatureNumerator === undefined)
      !== (signal.captureTimeSignatureDenominator === undefined))
    || (signal.captureWindowMode === 'bars'
      && (signal.captureWindowBars === undefined || signal.captureTempoBpm === undefined))
    || !Array.isArray(signal.nodes) || signal.nodes.length < 2 || signal.nodes.length > 64
    || !Array.isArray(signal.connections) || signal.connections.length > 256
    || !Array.isArray(signal.initialParameters)) throw new Error('Invalid graph description.');

  const nodes = new Map();
  for (const node of signal.nodes) {
    const spec = Object.hasOwn(NODE_TYPES, node?.type) ? NODE_TYPES[node.type] : null;
    if (!spec || !Number.isInteger(node.id) || node.id < 1 || node.id > 65535
      || nodes.has(node.id) || !sameKeys(node, ['id', 'type', ...Object.keys(spec.args ?? {})])
      || Object.entries(spec.args ?? {}).some(([key, value]) => node[key] !== value)
      || (spec.fixedId && node.id !== spec.fixedId)
      || (!spec.fixedId && [1, 3].includes(node.id))) throw new Error('Invalid graph node.');
    nodes.set(node.id, node);
  }
  if (nodes.get(1)?.type !== 'input.raw' || nodes.get(3)?.type !== 'output') {
    throw new Error('Graph needs its live input and output.');
  }
  if (signal.selectedCaptureNodeId !== undefined
    && (!Number.isInteger(signal.selectedCaptureNodeId)
      || !['loop-capture', 'retrospective-capture'].includes(nodes.get(signal.selectedCaptureNodeId)?.type))) {
    throw new Error('Selected capture source is unavailable.');
  }
  if ([...nodes.values()].filter((node) => node.type === 'midi-input').length > 1) {
    throw new Error('This graph accepts one MIDI input.');
  }
  const ports = new Set();
  const dependents = new Map([...nodes.keys()].map((id) => [id, []]));
  for (const edge of signal.connections) {
    if (!edge || !sameKeys(edge, ['from', 'to', 'inputPort'])
      || !Number.isInteger(edge.from) || !Number.isInteger(edge.to)
      || !Number.isInteger(edge.inputPort) || !nodes.has(edge.from) || !nodes.has(edge.to)) {
      throw new Error('Invalid graph connection.');
    }
    const from = NODE_TYPES[nodes.get(edge.from).type];
    const to = NODE_TYPES[nodes.get(edge.to).type];
    if (!from.output || to.inputs[edge.inputPort] === undefined
      || from.output !== to.inputs[edge.inputPort]) throw new Error('Graph port types do not match.');
    const port = `${edge.to}:${edge.inputPort}`;
    if (ports.has(port)) throw new Error('Graph input already connected.');
    ports.add(port);
    dependents.get(edge.from).push(edge.to);
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new Error('Graph contains a cycle.');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const to of dependents.get(id)) visit(to);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of nodes.keys()) visit(id);

  const parameterKeys = new Set();
  for (const entry of signal.initialParameters) {
    if (!entry || !sameKeys(entry, ['nodeId', 'id', 'value'])
      || !Number.isInteger(entry.nodeId) || !Number.isInteger(entry.id)
      || !nodes.has(entry.nodeId)) throw new Error('Invalid graph parameter.');
    const parameter = NODE_TYPES[nodes.get(entry.nodeId).type].parameters?.find((item) => item.id === entry.id);
    const key = `${entry.nodeId}:${entry.id}`;
    if (!parameter || parameterKeys.has(key)
      || typeof entry.value !== 'number' || !Number.isFinite(entry.value)
      || (parameter.choices ? !Number.isInteger(entry.value) || entry.value < 0 || entry.value >= parameter.choices.length
        : entry.value < parameter.min || entry.value > parameter.max)) throw new Error('Invalid graph parameter.');
    parameterKeys.add(key);
  }
  for (const node of signal.nodes) {
    for (const parameter of NODE_TYPES[node.type].parameters ?? []) {
      if (!parameterKeys.has(`${node.id}:${parameter.id}`)) throw new Error('Graph parameter missing.');
    }
  }
  return structuredClone(signal);
}

export function addNode(signal, type) {
  const spec = Object.hasOwn(NODE_TYPES, type) ? NODE_TYPES[type] : null;
  if (!spec || spec.fixedId) throw new Error('Choose an addable node.');
  const next = structuredClone(signal);
  const id = Math.max(...next.nodes.map((node) => node.id), 3) + 1;
  next.nodes.push({ id, type, ...spec.args });
  for (const parameter of spec.parameters ?? []) {
    next.initialParameters.push({ nodeId: id, id: parameter.id, value: parameter.default });
  }
  return validateTopology(next);
}

export function removeNode(signal, id) {
  if ([1, 3].includes(id)) throw new Error('The live input and output stay in this project.');
  if (!signal.nodes.some((node) => node.id === id)) throw new Error('Graph node unavailable.');
  const next = structuredClone(signal);
  next.nodes = next.nodes.filter((node) => node.id !== id);
  if (next.selectedCaptureNodeId === id) delete next.selectedCaptureNodeId;
  next.connections = next.connections.filter((edge) => edge.from !== id && edge.to !== id);
  next.initialParameters = next.initialParameters.filter((entry) => entry.nodeId !== id);
  return validateTopology(next);
}

export function setConnection(signal, to, inputPort, from) {
  const target = signal.nodes.find((node) => node.id === to);
  if (!target || NODE_TYPES[target.type].inputs[inputPort] === undefined) {
    throw new Error('Graph input unavailable.');
  }
  const next = structuredClone(signal);
  next.connections = next.connections.filter((edge) => edge.to !== to || edge.inputPort !== inputPort);
  if (from !== null) next.connections.push({ from, to, inputPort });
  return validateTopology(next);
}

export function setInitialParameter(signal, nodeId, id, value) {
  const next = structuredClone(signal);
  const entry = next.initialParameters.find((item) => item.nodeId === nodeId && item.id === id);
  if (!entry) throw new Error('Graph parameter unavailable.');
  entry.value = value;
  return validateTopology(next);
}

export function setInputSource(signal, source) {
  const next = structuredClone(signal);
  next.inputSource = source;
  return validateTopology(next);
}

export function setSidechainSource(signal, source) {
  const next = structuredClone(signal);
  next.sidechainSource = source;
  return validateTopology(next);
}

export function graphNoteTarget(signal) {
  const reachable = new Set([3]);
  let changed;
  do {
    changed = false;
    for (const edge of signal.connections) {
      if (reachable.has(edge.to) && !reachable.has(edge.from)) {
        reachable.add(edge.from);
        changed = true;
      }
    }
  } while (changed);
  return signal.nodes.find((node) => node.type === 'midi-input' && reachable.has(node.id))?.id
    ?? signal.nodes.find((node) => NOTE_NODE_TYPES.has(node.type) && reachable.has(node.id))?.id ?? null;
}

export function validateGraphAssets(signal, assets) {
  if (!Array.isArray(assets) || assets.length > 4) throw new Error('Graph supports at most four sample assets.');
  const seen = new Set();
  let bytes = 0;
  return assets.map((asset) => {
    const frames = asset?.stereo?.length / 2;
    bytes += asset?.stereo?.byteLength ?? 0;
    if (!asset || !Number.isInteger(asset.nodeId) || seen.has(asset.nodeId)
      || !SAMPLE_NODE_TYPES.has(signal.nodes.find((node) => node.id === asset.nodeId)?.type)
      || !Number.isInteger(asset.sourceRate) || asset.sourceRate < 8000 || asset.sourceRate > 384000
      || !(asset.stereo instanceof Float32Array) || !Number.isInteger(frames) || frames < 1
      || frames > Math.min(48000 * 30, asset.sourceRate * 30)
      || bytes > 32 * 1024 * 1024
      || typeof asset.label !== 'string' || asset.label.length > 200
      || asset.stereo.some((value) => !Number.isFinite(value))) throw new Error('Invalid graph sample asset.');
    seen.add(asset.nodeId);
    return asset;
  });
}

export function validateGraphTargets(signal, targets) {
  if (!Array.isArray(targets) || targets.length > 8) throw new Error('Graph partial target limit exceeded.');
  const banks = signal.nodes.filter((node) => node.type === 'main-voice-bank').map((node) => node.id);
  const seen = new Set();
  const checked = targets.map((target) => {
    const key = `${target?.nodeId}:${target?.target}`;
    if (!target || !sameKeys(target, ['nodeId', 'target', 'fundamental', 'values'])
      || !banks.includes(target.nodeId) || ![0, 1].includes(target.target)
      || seen.has(key) || typeof target.fundamental !== 'number'
      || !Number.isFinite(target.fundamental) || target.fundamental <= 0 || target.fundamental > 24000
      || !Array.isArray(target.values) || target.values.length < 4
      || target.values.length > 128 || target.values.length % 4) throw new Error('Invalid graph partial target.');
    for (let index = 0; index < target.values.length; index += 4) {
      const [frequency, amplitude, phase, decay] = target.values.slice(index, index + 4);
      if (![frequency, amplitude, phase, decay].every((value) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 3.4028235e38)
        || frequency < 0 || frequency > 24000 || amplitude < 0 || decay < 0) {
        throw new Error('Invalid graph partial target.');
      }
    }
    seen.add(key);
    return { nodeId: target.nodeId, target: target.target, fundamental: target.fundamental,
      values: [...target.values] };
  });
  for (const id of banks) {
    if (!seen.has(`${id}:0`) || !seen.has(`${id}:1`)) throw new Error('Main voice bank needs wave and source targets.');
  }
  return checked;
}

export function defaultGraphTemporal(nodeId) {
  return { nodeId, mode: 1, speed: 1, smooth: 0, contrast: 1,
    recipe: [0, 8, 0, 0, .5, 0, 0, .7, 2, 0, 0] };
}

export function validateGraphTemporal(signal, assets, temporal) {
  if (!Array.isArray(temporal) || temporal.length > 4) throw new Error('Graph temporal recipe limit exceeded.');
  const seen = new Set();
  return temporal.map((entry) => {
    const recipe = entry?.recipe;
    if (!entry || !sameKeys(entry, ['nodeId', 'mode', 'speed', 'smooth', 'contrast', 'recipe'])
      || !Number.isInteger(entry.nodeId) || seen.has(entry.nodeId)
      || signal.nodes.find((node) => node.id === entry.nodeId)?.type !== 'main-voice-bank'
      || !assets.some((asset) => asset.nodeId === entry.nodeId)
      || ![1, 2].includes(entry.mode)
      || typeof entry.speed !== 'number' || !Number.isFinite(entry.speed) || entry.speed < 0 || entry.speed > 4
      || typeof entry.smooth !== 'number' || !Number.isFinite(entry.smooth) || entry.smooth < 0 || entry.smooth > 1
      || typeof entry.contrast !== 'number' || !Number.isFinite(entry.contrast) || entry.contrast < 0 || entry.contrast > 2
      || !Array.isArray(recipe) || recipe.length !== 11
      || recipe.some((value) => typeof value !== 'number' || !Number.isFinite(value))
      || !Number.isInteger(recipe[0]) || recipe[0] < 0 || recipe[0] > 7
      || recipe[1] !== 8 || recipe[2] !== 0 || recipe[3] !== 0
      || recipe[4] < .01 || recipe[4] > .99 || ![0, 1].includes(recipe[5])
      || recipe[6] < 0 || recipe[6] > 1 || recipe[7] < 0 || recipe[7] > 1
      || !Number.isInteger(recipe[8]) || recipe[8] < 0 || recipe[8] > 2
      || recipe[9] < 0 || recipe[9] > 1
      || !Number.isInteger(recipe[10]) || recipe[10] < 0 || recipe[10] > 2) {
      throw new Error('Invalid graph temporal recipe.');
    }
    seen.add(entry.nodeId);
    return { nodeId: entry.nodeId, mode: entry.mode, speed: entry.speed,
      smooth: entry.smooth, contrast: entry.contrast, recipe: [...recipe] };
  });
}

export const HOST_SLOT_COUNT = 128;

export function validateGraphHostBindings(signal, bindings) {
  if (!Array.isArray(bindings) || bindings.length > HOST_SLOT_COUNT) throw new Error('Invalid host bindings.');
  const targets = new Set(signal.initialParameters.map(({ nodeId, id }) => `${nodeId}:${id}`));
  const slots = new Set();
  const used = new Set();
  return bindings.map((entry) => {
    const target = `${entry?.nodeId}:${entry?.id}`;
    if (!entry || !sameKeys(entry, ['slot', 'nodeId', 'id'])
      || !Number.isInteger(entry.slot) || entry.slot < 0 || entry.slot >= HOST_SLOT_COUNT
      || !Number.isInteger(entry.nodeId) || !Number.isInteger(entry.id)
      || slots.has(entry.slot) || used.has(target) || !targets.has(target)) {
      throw new Error('Invalid host binding.');
    }
    slots.add(entry.slot);
    used.add(target);
    return { slot: entry.slot, nodeId: entry.nodeId, id: entry.id };
  });
}

export function deriveGraphHostBindings(signal, previous = []) {
  const targets = new Set(signal.initialParameters.map(({ nodeId, id }) => `${nodeId}:${id}`));
  const retained = validateGraphHostBindings(signal, previous.filter((item) => targets.has(`${item?.nodeId}:${item?.id}`)));
  const usedSlots = new Set(retained.map(({ slot }) => slot));
  const usedTargets = new Set(retained.map(({ nodeId, id }) => `${nodeId}:${id}`));
  const ordered = [...signal.initialParameters].sort((a, b) => a.nodeId - b.nodeId || a.id - b.id);
  for (const { nodeId, id } of ordered) {
    if (retained.length >= HOST_SLOT_COUNT) break;
    if (usedTargets.has(`${nodeId}:${id}`)) continue;
    let slot = 0;
    while (usedSlots.has(slot)) slot++;
    retained.push({ slot, nodeId, id });
    usedSlots.add(slot);
  }
  return retained;
}

export function reassignGraphHostSlot(signal, previous, nodeId, id, slot) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= HOST_SLOT_COUNT) {
    throw new Error(`Host slot must be between 1 and ${HOST_SLOT_COUNT}.`);
  }
  const bindings = deriveGraphHostBindings(signal, previous);
  const current = bindings.find((entry) => entry.nodeId === nodeId && entry.id === id);
  if (!current) throw new Error('This parameter has no available host slot.');
  if (current.slot === slot) return bindings;
  const occupied = bindings.find((entry) => entry.slot === slot);
  return validateGraphHostBindings(signal, bindings.map((entry) => {
    if (entry === current) return { ...entry, slot };
    if (entry === occupied) return { ...entry, slot: current.slot };
    return entry;
  }));
}

export function captureGraphProject(signal, assets = [], targets = [], temporal = [], hostBindings = null) {
  const graph = validateTopology(signal);
  const checked = validateGraphAssets(graph, assets);
  const partials = validateGraphTargets(graph, targets);
  const motion = validateGraphTemporal(graph, checked, temporal);
  const bindings = deriveGraphHostBindings(graph, hostBindings ?? []);
  return { format: PROJECT_FORMAT, schemaVersion: PROJECT_VERSION, projectId, signal: graph,
    hostBindings: bindings,
    ...(checked.length ? { assets: checked.map((asset) => ({ nodeId: asset.nodeId,
      sourceRate: asset.sourceRate, frames: asset.stereo.length / 2, label: asset.label,
      pcmF32Base64: encodePcm(asset.stereo) })) } : {}),
    ...(partials.length ? { targets: partials } : {}),
    ...(motion.length ? { temporal: motion } : {}) };
}

export function parseGraphBundle(document) {
  if (document?.format !== PROJECT_FORMAT || document.schemaVersion !== PROJECT_VERSION
    || document.projectId !== projectId
    || !Array.from({ length: 16 }, (_, mask) => ['assets', 'targets', 'temporal', 'hostBindings']
      .filter((_, index) => mask & (1 << index))).some((optional) =>
      sameKeys(document, ['format', 'schemaVersion', 'projectId', 'signal', ...optional]))) {
    throw new Error('This is not a supported graph workspace project.');
  }
  const signal = validateTopology(document.signal);
  if ((Object.hasOwn(document, 'assets') && !Array.isArray(document.assets))
    || (document.assets?.length ?? 0) > 4) {
    throw new Error('Graph supports at most four sample assets.');
  }
  if (Object.hasOwn(document, 'targets') && !Array.isArray(document.targets)) {
    throw new Error('Invalid graph partial targets.');
  }
  if (Object.hasOwn(document, 'temporal') && !Array.isArray(document.temporal)) {
    throw new Error('Invalid graph temporal recipes.');
  }
  const assets = (document.assets ?? []).map((asset) => {
    if (!asset || !sameKeys(asset, ['nodeId', 'sourceRate', 'frames', 'label', 'pcmF32Base64'])
      || !Number.isInteger(asset.frames) || asset.frames < 1 || asset.frames > 48000 * 30) {
      throw new Error('Invalid graph sample asset.');
    }
    return { nodeId: asset.nodeId, sourceRate: asset.sourceRate, label: asset.label,
      stereo: decodePcm(asset.pcmF32Base64, asset.frames) };
  });
  const checked = validateGraphAssets(signal, assets);
  return { signal, assets: checked,
    targets: validateGraphTargets(signal, document.targets ?? []),
    temporal: validateGraphTemporal(signal, checked, document.temporal ?? []),
    hostBindings: Object.hasOwn(document, 'hostBindings')
      ? deriveGraphHostBindings(signal, validateGraphHostBindings(signal, document.hostBindings))
      : deriveGraphHostBindings(signal) };
}

export function parseGraphProject(document) { return parseGraphBundle(document).signal; }
