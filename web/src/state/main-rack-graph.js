// Translate the supported Main rack audio chain into the portable Rust graph
// contract. This is a strict first slice: unsupported voice/CV edits fail here
// instead of appearing in the UI while silently leaving audio unchanged.
import { NODE_TYPES, validateTopology } from '../graph/topology.js';
import { validateRackDocument } from './rack-document.js';

const AUDIO_TYPES = { source: 'main-voice-bank', filter: 'svf', fx: 'effect-slot-legacy', eq: 'eq8' };
const key = endpoint => `${endpoint.moduleId}:${endpoint.portId}`;

export function compileMainRackAudio(rackDocument, catalog) {
  const rack = validateRackDocument(rackDocument, catalog);
  const modules = new Map(rack.modules.map(module => [module.id, module]));
  if (modules.get('adsr')?.type !== 'adsr' || modules.get('oscillator')?.type !== 'source') {
    throw new Error('The current Main graph needs its ADSR and Source modules.');
  }
  const voiceEdges = rack.connections.filter(({ from, to }) =>
    [from, to].some(endpoint => catalog.endpoints[endpoint.moduleId]?.ports?.outputs?.some(port => port.id === endpoint.portId && port.kind === 'voice')
      || catalog.endpoints[endpoint.moduleId]?.ports?.inputs?.some(port => port.id === endpoint.portId && port.kind === 'voice')
      || endpoint.moduleId === 'adsr'));
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

  const nodes = [
    { id: 1, type: 'input.raw' },
    { id: catalog.endpoints.__rackOutput.nodeId, type: 'output' },
    { id: catalog.endpoints.__midiInput.nodeId, type: 'midi-input' },
    ...rack.modules.filter(module => module.id !== 'adsr').map(module => ({
      id: module.nodeId, type: AUDIO_TYPES[module.type],
      ...(NODE_TYPES[AUDIO_TYPES[module.type]].args ?? {}),
    })),
  ];
  const connections = [{ from: catalog.endpoints.__midiInput.nodeId,
    to: modules.get('oscillator').nodeId, inputPort: 0 }];
  for (const edge of rack.connections) {
    if (expectedVoice.some(([from, to]) => key(edge.from) === from && key(edge.to) === to)) continue;
    const fromModule = modules.get(edge.from.moduleId);
    const toModule = modules.get(edge.to.moduleId);
    const fromPort = fromModule && catalog.catalog[fromModule.type].ports.outputs.find(port => port.id === edge.from.portId);
    if (fromPort?.kind !== 'audio' || !(toModule || edge.to.moduleId === '__rackOutput')) {
      throw new Error(`Main connection ${edge.id} has no audio compiler yet.`);
    }
    connections.push({ from: fromModule.nodeId,
      to: toModule?.nodeId ?? catalog.endpoints.__rackOutput.nodeId, inputPort: 0 });
  }
  const initialParameters = nodes.flatMap(node => (NODE_TYPES[node.type].parameters ?? [])
    .map(parameter => ({ nodeId: node.id, id: parameter.id, value: parameter.default })));
  return validateTopology({ inputs: 2, outputs: 2, inputSource: 'none',
    nodes, connections, initialParameters });
}
