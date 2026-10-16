// Browser authoring contract for a subset of Rust's prepared typed graph.
// Rust compilation remains the final authority when playback starts.
import { encodePcm, decodePcm } from '../state/stereo-source.js';
export const SAMPLE_NODE_TYPES = new Set(['sample-instrument', 'sample-region', 'granulator', 'main-voice-bank']);
export const PCM_ASSET_TYPES = new Set([...SAMPLE_NODE_TYPES, 'loop-capture']);
const NOTE_NODE_TYPES = new Set(['voice-synth', 'sample-instrument', 'sample-region', 'main-voice-bank']);
export { WORKSPACE_TYPES as NODE_TYPES } from '@manifold/author/workspace-types';
import { WORKSPACE_TYPES as NODE_TYPES, configuredWorkspaceType, validMixerInputs } from '@manifold/author/workspace-types';
import { validateNamedInstances, validateParameterEndpoints, validateProjectControls, validateHostAssignments } from '@manifold/author';

const PROJECT_FORMAT = 'manifold.project';
const PROJECT_VERSION = 1;
const projectId = 'manifold.graph-workspace';
const sameKeys = (value, keys) => Object.keys(value).sort().join('|') === [...keys].sort().join('|');

export function validateTopology(signal) {
  const baseKeys = ['inputs', 'outputs', 'nodes', 'connections', 'initialParameters'];
  const allowedKeys = new Set([...baseKeys, 'inputSource', 'sidechainSource', 'selectedCaptureNodeId',
    'captureSources', 'defaultCaptureSourceId', 'selectedCaptureSourceId',
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
      || signal.captureWindowSeconds <= 0))
    || (signal.captureWindowMode !== undefined && !['seconds', 'bars', 'free'].includes(signal.captureWindowMode))
    || (signal.captureWindowBars !== undefined && (typeof signal.captureWindowBars !== 'number'
      || !Number.isFinite(signal.captureWindowBars) || signal.captureWindowBars <= 0))
    || (signal.captureTempoBpm !== undefined && (typeof signal.captureTempoBpm !== 'number'
      || !Number.isFinite(signal.captureTempoBpm) || signal.captureTempoBpm < 20 || signal.captureTempoBpm > 300))
    || ['captureTimeSignatureNumerator', 'captureTimeSignatureDenominator'].some((key) =>
      signal[key] !== undefined && (!Number.isInteger(signal[key]) || signal[key] < 1 || signal[key] > 128))
    || ((signal.captureTimeSignatureNumerator === undefined)
      !== (signal.captureTimeSignatureDenominator === undefined))
    || (signal.captureWindowMode === 'bars'
      && (signal.captureWindowBars === undefined || signal.captureTempoBpm === undefined))
    || !Array.isArray(signal.nodes) || signal.nodes.length < 2
    || !Array.isArray(signal.connections)
    || !Array.isArray(signal.initialParameters)) throw new Error('Invalid graph description.');

  const nodes = new Map();
  for (const node of signal.nodes) {
    const spec = Object.hasOwn(NODE_TYPES, node?.type) ? NODE_TYPES[node.type] : null;
    if (!spec || !Number.isInteger(node.id) || node.id < 1 || node.id > 0xffffffff
      || nodes.has(node.id) || !sameKeys(node, ['id', 'type', ...Object.keys(spec.args ?? {})])
      || Object.entries(spec.args ?? {}).some(([key, value]) => {
        const field = Object.values(spec.configuration ?? {}).find(field => field.argument === key);
        return field ? !Number.isFinite(node[key]) || node[key] < field.min || node[key] > (field.max ?? Infinity)
          || (['loop-capture', 'retrospective-capture'].includes(node.type) && key === 'a' && node[key] <= 0) : node[key] !== value;
      })
      || (node.type === 'mixer' && !validMixerInputs(node.a))
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
  if (signal.captureSources !== undefined || signal.defaultCaptureSourceId !== undefined
    || signal.selectedCaptureSourceId !== undefined) {
    if (!Array.isArray(signal.captureSources) || signal.captureSources.length < 1) throw new Error('Invalid capture sources.');
    const ids = new Set();
    const nodeIds = new Set();
    for (const source of signal.captureSources) {
      if (!source || !sameKeys(source, ['id', 'nodeId', 'name', 'kind'])
        || !Number.isInteger(source.id) || source.id < 0 || source.id > 255
        || ids.has(source.id) || !Number.isInteger(source.nodeId) || nodeIds.has(source.nodeId)
        || !['loop-capture', 'retrospective-capture'].includes(nodes.get(source.nodeId)?.type)
        || typeof source.name !== 'string' || source.name.trim() !== source.name
        || !source.name.length || new TextEncoder().encode(source.name).length > 80
        || !['input', 'sidechain', 'layer', 'custom'].includes(source.kind)) {
        throw new Error('Invalid capture source.');
      }
      ids.add(source.id);
      nodeIds.add(source.nodeId);
    }
    if (!ids.has(signal.defaultCaptureSourceId) || !ids.has(signal.selectedCaptureSourceId)
      || signal.captureSources.find((source) => source.id === signal.selectedCaptureSourceId)?.nodeId
        !== signal.selectedCaptureNodeId) throw new Error('Invalid selected capture source.');
  }
  if ([...nodes.values()].filter((node) => node.type === 'midi-input').length > 1) {
    throw new Error('This graph accepts one MIDI input.');
  }
  const ports = new Set();
  const dependents = new Map([...nodes.keys()].map((id) => [id, []]));
  for (const edge of signal.connections) {
    if (!edge || !(sameKeys(edge, ['from', 'to', 'inputPort'])
      || sameKeys(edge, ['from', 'outputPort', 'to', 'inputPort']))
      || !Number.isInteger(edge.from) || !Number.isInteger(edge.to)
      || !Number.isInteger(edge.inputPort) || !Number.isInteger(edge.outputPort ?? 0)
      || !nodes.has(edge.from) || !nodes.has(edge.to)) {
      throw new Error('Invalid graph connection.');
    }
    const from = configuredWorkspaceType(nodes.get(edge.from));
    const to = configuredWorkspaceType(nodes.get(edge.to));
    const outputType = (from.outputs ?? (from.output ? [from.output] : []))[edge.outputPort ?? 0];
    if (!outputType || to.inputs[edge.inputPort] === undefined
      || outputType !== to.inputs[edge.inputPort]) throw new Error('Graph port types do not match.');
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
    const parameter = configuredWorkspaceType(nodes.get(entry.nodeId)).parameters?.find((item) => item.id === entry.id);
    const key = `${entry.nodeId}:${entry.id}`;
    if (!parameter || parameterKeys.has(key)
      || typeof entry.value !== 'number' || !Number.isFinite(entry.value)
      || (parameter.choices ? !Number.isInteger(entry.value)
        || !(parameter.choiceValues ?? parameter.choices.map((_, index) => index)).includes(entry.value)
        : entry.value < parameter.min || entry.value > parameter.max)) throw new Error('Invalid graph parameter.');
    parameterKeys.add(key);
  }
  for (const node of signal.nodes) {
    for (const parameter of configuredWorkspaceType(node).parameters ?? []) {
      if (!parameterKeys.has(`${node.id}:${parameter.id}`)
        && !(node.type === 'sample-region' && parameter.id >= 9 && parameter.id <= 11)) {
        throw new Error('Graph parameter missing.');
      }
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
  if (next.captureSources) {
    next.captureSources = next.captureSources.filter((source) => source.nodeId !== id);
    if (!next.captureSources.length) {
      delete next.captureSources;
      delete next.defaultCaptureSourceId;
      delete next.selectedCaptureSourceId;
    } else {
      if (!next.captureSources.some((source) => source.id === next.defaultCaptureSourceId)) {
        next.defaultCaptureSourceId = next.captureSources[0].id;
      }
      if (!next.captureSources.some((source) => source.id === next.selectedCaptureSourceId)) {
        next.selectedCaptureSourceId = next.defaultCaptureSourceId;
        next.selectedCaptureNodeId = next.captureSources.find((source) => source.id === next.selectedCaptureSourceId).nodeId;
      }
    }
  }
  next.connections = next.connections.filter((edge) => edge.from !== id && edge.to !== id);
  next.initialParameters = next.initialParameters.filter((entry) => entry.nodeId !== id);
  return validateTopology(next);
}

export function registerCaptureSource(signal, nodeId, name, kind = 'custom') {
  const next = structuredClone(signal);
  if (next.captureSources?.some((source) => source.nodeId === nodeId)) throw new Error('Capture source already registered.');
  const used = new Set((next.captureSources ?? []).map((source) => source.id));
  let id = 0;
  while (used.has(id)) id++;
  next.captureSources ??= [];
  next.captureSources.push({ id, nodeId, name, kind });
  next.defaultCaptureSourceId ??= id;
  next.selectedCaptureSourceId ??= id;
  next.selectedCaptureNodeId = next.captureSources.find((source) => source.id === next.selectedCaptureSourceId).nodeId;
  return validateTopology(next);
}

export function renameCaptureSource(signal, nodeId, name) {
  const next = structuredClone(signal);
  const source = next.captureSources?.find((entry) => entry.nodeId === nodeId);
  if (!source) throw new Error('Capture source is not registered.');
  source.name = name;
  return validateTopology(next);
}

export function setConnection(signal, to, inputPort, from, outputPort = 0) {
  const target = signal.nodes.find((node) => node.id === to);
  if (!target || configuredWorkspaceType(target).inputs[inputPort] === undefined) {
    throw new Error('Graph input unavailable.');
  }
  const next = structuredClone(signal);
  next.connections = next.connections.filter((edge) => edge.to !== to || edge.inputPort !== inputPort);
  if (from !== null) next.connections.push(outputPort === 0
    ? { from, to, inputPort } : { from, outputPort, to, inputPort });
  return validateTopology(next);
}

export function setInitialParameter(signal, nodeId, id, value) {
  const next = structuredClone(signal);
  const entry = next.initialParameters.find((item) => item.nodeId === nodeId && item.id === id);
  if (entry) entry.value = value;
  else if (next.nodes.some((node) => node.id === nodeId && node.type === 'sample-region')
    && id >= 9 && id <= 11) next.initialParameters.push({ nodeId, id, value });
  else throw new Error('Graph parameter unavailable.');
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
  if (!Array.isArray(assets)) throw new Error('Expected sample assets.');
  const seen = new Set();
  return assets.map((asset) => {
    const frames = asset?.stereo?.length / 2;
    if (!asset || !Number.isInteger(asset.nodeId) || seen.has(asset.nodeId)
      || !PCM_ASSET_TYPES.has(signal.nodes.find((node) => node.id === asset.nodeId)?.type)
      || !Number.isInteger(asset.sourceRate) || asset.sourceRate < 8000 || asset.sourceRate > 384000
      || !(asset.stereo instanceof Float32Array) || !Number.isInteger(frames) || frames < 1
      || typeof asset.label !== 'string'
      || asset.stereo.some((value) => !Number.isFinite(value))) throw new Error('Invalid graph sample asset.');
    seen.add(asset.nodeId);
    return asset;
  });
}

export function validateGraphSampleBindings(signal, assets, bindings) {
  if (!Array.isArray(bindings)) {
    throw new Error('Graph sample binding limit exceeded.');
  }
  const sources = new Set(assets.map((asset) => asset.nodeId));
  const types = new Map(signal.nodes.map((node) => [node.id, node.type]));
  const targets = new Set();
  return bindings.map((binding) => {
    if (!binding || !sameKeys(binding, ['sourceNodeId', 'nodeId'])
      || !Number.isInteger(binding.sourceNodeId) || !Number.isInteger(binding.nodeId)
      || !sources.has(binding.sourceNodeId) || sources.has(binding.nodeId)
      || types.get(binding.sourceNodeId) !== 'sample-region'
      || types.get(binding.nodeId) !== 'sample-region'
      || binding.sourceNodeId === binding.nodeId || targets.has(binding.nodeId)) {
      throw new Error('Invalid graph sample binding.');
    }
    targets.add(binding.nodeId);
    return { sourceNodeId: binding.sourceNodeId, nodeId: binding.nodeId };
  });
}

export function validateGraphTargets(signal, targets) {
  if (!Array.isArray(targets)) throw new Error('Expected partial targets.');
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
  if (!Array.isArray(temporal)) throw new Error('Expected temporal recipes.');
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

// The Studio plug-in bank; this is not a graph or exported-control limit.
export const HOST_SLOT_COUNT = 2048;

export function validateGraphHostBindings(signal, bindings) {
  if (!Array.isArray(bindings)) throw new Error('Invalid host bindings.');
  const targets = new Set(signal.initialParameters.map(({ nodeId, id }) => `${nodeId}:${id}`));
  const slots = new Set();
  const used = new Set();
  return bindings.map((entry) => {
    const target = `${entry?.nodeId}:${entry?.id}`;
    if (!entry || !sameKeys(entry, ['slot', 'nodeId', 'id'])
      || !Number.isInteger(entry.slot) || entry.slot < 0 || entry.slot > 0xffffffff - 0x01000000
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

export function captureGraphProject(signal, assets = [], targets = [], temporal = [], hostBindings = null, endpoints = [], controls = [], instances = [], sampleBindings = [], hostAssignments = null) {
  const graph = validateTopology(signal);
  const checked = validateGraphAssets(graph, assets);
  const partials = validateGraphTargets(graph, targets);
  const motion = validateGraphTemporal(graph, checked, temporal);
  const bindings = hostBindings === null ? deriveGraphHostBindings(graph) : validateGraphHostBindings(graph, hostBindings);
  const paths = validateParameterEndpoints(graph, endpoints);
  const projectControls = validateProjectControls(controls, paths);
  const named = validateNamedInstances(graph, instances);
  const shared = validateGraphSampleBindings(graph, checked, sampleBindings);
  const assignments = validateHostAssignments(hostAssignments ?? bindings.flatMap(binding => {
    const endpoint = paths.find(p => p.nodeId === binding.nodeId && p.id === binding.id);
    return endpoint ? [{slot:binding.slot, path:endpoint.path}] : [];
  }));
  return { format: PROJECT_FORMAT, schemaVersion: PROJECT_VERSION, projectId, signal: graph,
    hostBindings: bindings,
    ...(assignments.length ? {hostAssignments:assignments} : {}),
    ...(paths.length ? { endpoints: paths } : {}),
    ...(projectControls.length ? { controls: projectControls } : {}),
    ...(named.length ? { instances: named } : {}),
    ...(checked.length ? { assets: checked.map((asset) => ({ nodeId: asset.nodeId,
      sourceRate: asset.sourceRate, frames: asset.stereo.length / 2, label: asset.label,
      pcmF32Base64: encodePcm(asset.stereo) })) } : {}),
    ...(shared.length ? { sampleBindings: shared } : {}),
    ...(partials.length ? { targets: partials } : {}),
    ...(motion.length ? { temporal: motion } : {}) };
}

export function parseGraphBundle(document) {
  if (document?.format !== PROJECT_FORMAT || document.schemaVersion !== PROJECT_VERSION
    || document.projectId !== projectId
    || !['format','schemaVersion','projectId','signal'].every(key => Object.hasOwn(document, key))
    || Object.keys(document).some(key => !['format','schemaVersion','projectId','signal','assets','sampleBindings','targets','temporal','hostBindings','hostAssignments','endpoints','controls','instances'].includes(key))) {
    throw new Error('This is not a supported graph workspace project.');
  }
  const signal = validateTopology(document.signal);
  if ((Object.hasOwn(document, 'assets') && !Array.isArray(document.assets))
    ) {
    throw new Error('Expected sample assets.');
  }
  if (Object.hasOwn(document, 'targets') && !Array.isArray(document.targets)) {
    throw new Error('Invalid graph partial targets.');
  }
  if (Object.hasOwn(document, 'temporal') && !Array.isArray(document.temporal)) {
    throw new Error('Invalid graph temporal recipes.');
  }
  const assets = (document.assets ?? []).map((asset) => {
    if (!asset || !sameKeys(asset, ['nodeId', 'sourceRate', 'frames', 'label', 'pcmF32Base64'])
      || !Number.isSafeInteger(asset.frames) || asset.frames < 1 || !Number.isSafeInteger(asset.frames * 8)) {
      throw new Error('Invalid graph sample asset.');
    }
    return { nodeId: asset.nodeId, sourceRate: asset.sourceRate, label: asset.label,
      stereo: decodePcm(asset.pcmF32Base64, asset.frames) };
  });
  const checked = validateGraphAssets(signal, assets);
  return { signal, assets: checked,
    sampleBindings: validateGraphSampleBindings(signal, checked, document.sampleBindings ?? []),
    endpoints: validateParameterEndpoints(signal, document.endpoints ?? []),
    controls: validateProjectControls(document.controls ?? [], document.endpoints ?? []),
    instances: validateNamedInstances(signal, document.instances ?? []),
    targets: validateGraphTargets(signal, document.targets ?? []),
    temporal: validateGraphTemporal(signal, checked, document.temporal ?? []),
    hostAssignments: validateHostAssignments(document.hostAssignments ?? []),
    hostBindings: Object.hasOwn(document, 'hostBindings')
      ? validateGraphHostBindings(signal, document.hostBindings)
      : deriveGraphHostBindings(signal) };
}

export function parseGraphProject(document) { return parseGraphBundle(document).signal; }
