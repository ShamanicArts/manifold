// Translate the supported Main rack audio chain into the portable Rust graph
// contract. This is a strict first slice: unsupported voice/CV edits fail here
// instead of appearing in the UI while silently leaving audio unchanged.
import { NODE_TYPES, validateTopology } from '../graph/topology.js';
import { addRackModule, validateRackDocument } from './rack-document.js';

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
    ...rack.modules.filter(module => module.id !== 'adsr'
      && (module.type !== 'lfo' || cvConnections.some(edge => edge.from.moduleId === module.id)))
      .map(module => {
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

// MainInstrument already owns the voice bank, its sample assets, and the
// looper. Its prepared insert graph receives that voice output as raw input.
export function compileMainRackInsert(rackDocument, catalog) {
  // MainInstrument already runs the four LFO slots and their scalar routes.
  // The rack's LFO shell names that prepared control source; compiling it as
  // another graph LFO would silently create a second oscillator.
  const rack = validateRackDocument(rackDocument, catalog);
  if (rack.connections.some(edge => (edge.from.moduleId === 'lfo1'
    || edge.to.moduleId === 'lfo1') && (edge.from.moduleId !== 'lfo1'
    || edge.from.portId !== 'out' || edge.to.moduleId !== 'filter'
    || edge.to.portId !== 'cutoff'))) {
    throw new Error('This Main control cable has no prepared route.');
  }
  const audioRack = { ...rack,
    modules: rack.modules.filter(module => module.type !== 'lfo'),
    connections: rack.connections.filter(edge =>
      edge.from.moduleId !== 'lfo1' && edge.to.moduleId !== 'lfo1'),
  };
  const full = compileMainRackAudio(audioRack, catalog);
  const voiceNodeId = rack.modules.find(module => module.id === 'oscillator').nodeId;
  const midiNodeId = catalog.endpoints.__midiInput.nodeId;
  return validateTopology({ ...full, inputSource: 'external',
    nodes: full.nodes.filter(node => node.id !== midiNodeId && node.id !== voiceNodeId),
    connections: full.connections.filter(edge => edge.from !== midiNodeId && edge.to !== voiceNodeId)
      .map(edge => edge.from === voiceNodeId ? { ...edge, from: 1 } : edge),
    initialParameters: full.initialParameters.filter(parameter => parameter.nodeId !== voiceNodeId),
  });
}

// Main sessions save the prepared six-module audio topology and its grid layout.
// Filter has its original compact width; other module sizes await their faces.
export function validateMainRackInsertDocument(document, catalog) {
  const rack = validateRackDocument(document, catalog);
  if (rack.modules.length < catalog.initial.modules.length - 1
    || rack.modules.length > catalog.initial.modules.length ||
    rack.modules.some(module => {
      const original = catalog.initial.modules.find(item => item.id === module.id);
      return !original || ['nodeId', 'type']
        .some(key => module[key] !== original[key])
        || (module.id === 'filter' ? !((module.w === 1 || module.w === 2) && module.h === 1)
          : module.w !== original.w || module.h !== original.h);
    }) || catalog.initial.modules.some(module => module.id !== 'lfo1'
      && !rack.modules.some(item => item.id === module.id))) {
    throw new Error('This Main session uses modules or sizes that the current rack cannot display.');
  }
  const stage = { oscillator: 0, filter: 1, fx1: 2, fx2: 3, eq: 4, __rackOutput: 5 };
  if (rack.connections.some(edge => edge.from.moduleId in stage && edge.to.moduleId in stage
    && stage[edge.from.moduleId] >= stage[edge.to.moduleId])) {
    throw new Error('This Main audio cable runs against the prepared signal order.');
  }
  compileMainRackInsert(rack, catalog);
  return rack;
}

export function withMainLfoShell(document, catalog) {
  const rack = validateMainRackInsertDocument(document, catalog);
  if (rack.modules.some(module => module.id === 'lfo1')) return rack;
  const shell = catalog.initial.modules.find(module => module.id === 'lfo1');
  for (let row = shell.row; row < catalog.grid.maxRows; row++) {
    for (let col = 0; col < catalog.grid.columns; col++) {
      try {
        return validateMainRackInsertDocument(addRackModule(rack, { ...shell, row, col }, catalog), catalog);
      } catch { /* Look for an unoccupied grid cell. */ }
    }
  }
  throw new Error('The saved Main rack has no cell for its LFO shell.');
}

export function validateMainRackControlRoute(document, rackState) {
  const cable = document.connections.some(edge => edge.from.moduleId === 'lfo1'
    && edge.from.portId === 'out' && edge.to.moduleId === 'filter' && edge.to.portId === 'cutoff');
  if (cable) {
    const route = rackState?.lfos?.find(lfo => lfo.slot === 0)?.route;
    if (route?.source !== 0 || route?.target !== 22 || route?.enabled !== true) {
      throw new Error('The saved LFO cable and Rust modulation route disagree.');
    }
  }
  return document;
}
