// Translate the supported Main rack audio chain into the portable Rust graph
// contract. This is a strict first slice: unsupported voice/CV edits fail here
// instead of appearing in the UI while silently leaving audio unchanged.
import { NODE_TYPES, validateTopology } from '../graph/topology.js';
import { validateRackDocument } from './rack-document.js';

const AUDIO_TYPES = { source: 'main-voice-bank', filter: 'svf', fx1: 'effect-slot-legacy',
  fx2: 'effect-slot-legacy', eq: 'eq8', lfo: 'lfo' };
const key = endpoint => `${endpoint.moduleId}:${endpoint.portId}`;

export function compileMainRackAudio(rackDocument, catalog) {
  const rack = validateRackDocument(rackDocument, catalog);
  const modules = new Map(rack.modules.map(module => [module.id, module]));
  const portKind = (endpoint, direction) => {
    const module = modules.get(endpoint.moduleId);
    const spec = module ? catalog.catalog[module.type] : catalog.endpoints[endpoint.moduleId];
    return spec?.ports?.[direction]?.find(port => port.id === endpoint.portId)?.kind;
  };
  if (modules.get('adsr')?.type !== 'adsr' || modules.get('oscillator')?.type !== 'source') {
    throw new Error('The current Main graph needs its ADSR and Source modules.');
  }
  const voiceEdges = rack.connections.filter(({ from }) => portKind(from, 'outputs') === 'voice');
  const expectedVoice = [
    ['__midiInput:voice', 'adsr:midi'],
    ['adsr:voice', 'oscillator:voice'],
  ];
  if (voiceEdges.length !== expectedVoice.length || expectedVoice.some(([from, to]) =>
    !voiceEdges.some(edge => key(edge.from) === from && key(edge.to) === to))) {
    throw new Error('Main voice rewiring needs a separate voice graph compiler.');
  }
  for (const module of rack.modules) {
    if (module.id === 'adsr') continue;
    if (!AUDIO_TYPES[module.type]) throw new Error(`Main module ${module.id} is not compiled into audio yet.`);
  }
  const cvConnections = rack.connections.filter(edge => portKind(edge.from, 'outputs') === 'cv');
  for (const edge of cvConnections) {
    if (modules.get(edge.from.moduleId)?.type !== 'lfo' || edge.from.portId !== 'out'
      || modules.get(edge.to.moduleId)?.type !== 'filter' || edge.to.portId !== 'cutoff') {
      throw new Error(`Main control connection ${edge.id} has no DSP mapping yet.`);
    }
  }
  const cvFilters = new Set(cvConnections.map(edge => edge.to.moduleId));

  const nodes = [
    { id: 1, type: 'input.raw' },
    { id: catalog.endpoints.__rackOutput.nodeId, type: 'output' },
    { id: catalog.endpoints.__midiInput.nodeId, type: 'midi-input' },
    ...rack.modules.filter(module => module.id !== 'adsr').map(module => {
      const type = module.type === 'filter' && cvFilters.has(module.id)
        ? 'modulated-svf' : AUDIO_TYPES[module.type];
      return { id: module.nodeId, type, ...(NODE_TYPES[type].args ?? {}) };
    }),
  ];
  const connections = [{ from: catalog.endpoints.__midiInput.nodeId,
    to: modules.get('oscillator').nodeId, inputPort: 0 }];
  for (const edge of rack.connections) {
    if (expectedVoice.some(([from, to]) => key(edge.from) === from && key(edge.to) === to)) continue;
    if (cvConnections.includes(edge)) {
      connections.push({ from: modules.get(edge.from.moduleId).nodeId,
        to: modules.get(edge.to.moduleId).nodeId, inputPort: 1 });
      continue;
    }
    const fromModule = modules.get(edge.from.moduleId);
    const toModule = modules.get(edge.to.moduleId);
    if (portKind(edge.from, 'outputs') !== 'audio' || edge.from.portId !== 'out'
      || !((toModule && edge.to.portId === 'in')
        || (edge.to.moduleId === '__rackOutput' && edge.to.portId === 'main'))) {
      throw new Error(`Main connection ${edge.id} has no audio compiler yet.`);
    }
    connections.push({ from: fromModule.nodeId,
      to: toModule?.nodeId ?? catalog.endpoints.__rackOutput.nodeId, inputPort: 0 });
  }
  const initialParameters = nodes.flatMap(node => (NODE_TYPES[node.type].parameters ?? [])
    .map(parameter => ({ nodeId: node.id, id: parameter.id,
      value: node.type === 'lfo' && parameter.id === 1 ? 1 : parameter.default })));
  return validateTopology({ inputs: 2, outputs: 2, inputSource: 'none',
    nodes, connections, initialParameters });
}
