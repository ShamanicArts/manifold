// Main's Wave-only subgraph, translated from sample_synth.createVoiceGraph.
// Sample, Ring, FM, Sync and additive/morph branches are still separate port work.
// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import {
  fixedGain as fixedGainDefinition,
  mixer as mixerDefinition,
  retrospectiveCapture as retrospectiveCaptureDefinition,
  svf as svfDefinition,
} from '@manifold/author/primitives';
import {
  GraphContractError,
  GraphWorkspace,
  createGraphWorkspace,
  createLiveGraphSession,
} from '@manifold/author';
export const MAIN_SYNTH = '/midi/synth';
const voiceBase = (index) => `${MAIN_SYNTH}/voice/${index}`;
const nodePath = (index, name) => `${voiceBase(index)}/nodes/${name}`;
const ranges = {
  waveform: [0, 7, 1, true],
  pulseWidth: [0.01, 0.99, 0.5],
  drive: [0, 20, 0],
  driveShape: [0, 3, 0, true],
  driveBias: [-1, 1, 0],
  driveMix: [0, 1, 1],
  unison: [1, 8, 1, true],
  detune: [0, 100, 0],
  spread: [0, 1, 0],
  'blend/amount': [0, 1, 0.5],
};
const oscillatorIds = {
  waveform: 0,
  pulseWidth: 4,
  drive: 5,
  driveShape: 6,
  driveBias: 7,
  driveMix: 8,
  unison: 10,
  detune: 11,
  spread: 12,
};
/** A real Main voice branch. A missing sample input is silent, as in the old graph. */
export function addMainWaveVoice(graph, { index, firstNodeId, sample = null }) {
  const add = (type, name, offset) => {
    const node = graph.add(type.startsWith('mixer') ? 'mixer' : type, {
      id: firstNodeId + offset,
      config: type.startsWith('mixer') ? { inputs: Number(type.slice(5)) } : {},
    });
    graph.registerInstance(nodePath(index, name), node);
    return node;
  };
  const oscillator = add('extended-oscillator', 'oscillator', 0);
  const mix = add('crossfader', 'mix', 1);
  const direction = add('crossfader', 'direction', 2);
  const select = add('crossfader', 'base_select', 3);
  const branches = add('mixer3', 'branches', 4);
  const voice = add('mixer4', 'output', 5);
  for (const node of [mix, direction]) {
    graph.connect(oscillator.output('out'), node.input('a'));
    if (sample) graph.connect(sample, node.input('b'));
  }
  graph.setParameter(select, 0, -1);
  graph.connect(mix.output('out'), select.input('a'));
  graph.connect(direction.output('out'), select.input('b'));
  graph.setParameter(branches, 2, 0).setParameter(branches, 3, 0);
  graph.connect(select.output('out'), branches.input('in-1'));
  for (let input = 1; input <= 3; input++) graph.setParameter(voice, input, 0);
  graph.connect(branches.output('out'), voice.input('in-4'));
  graph.registerParameter(`${voiceBase(index)}/freq`, oscillator, 1, {
    min: 20,
    max: 8000,
    default: 220,
  });
  graph.registerParameter(`${voiceBase(index)}/amp`, oscillator, 2, {
    min: 0,
    max: 0.5,
    default: 0,
  });
  graph.registerControl(`${voiceBase(index)}/gate`, {
    min: 0,
    max: 1,
    default: 0,
  });
  return { oscillator, mix, direction, select, branches, output: voice };
}
/** Eight independent authored voices; scripts may inspect and replace every node. */
export function addMainWaveVoices(graph, { firstNodeId = 10, mixerId = 60 } = {}) {
  const mixer = graph.add(mixerDefinition.type, {
    id: mixerId,
    config: { inputs: 8 },
  });
  graph.registerInstance(`${MAIN_SYNTH}/nodes/voice_mixer`, mixer);
  const voices = Array.from({ length: 8 }, (_, index) => {
    const voice = addMainWaveVoice(graph, {
      index: index + 1,
      firstNodeId: firstNodeId + index * 6,
    });
    graph.connect(voice.output.output('out'), mixer.input(`in-${index + 1}`));
    return voice;
  });
  for (const [key, [min, max, value, discrete = false]] of Object.entries(ranges)) {
    graph.registerControl(`${MAIN_SYNTH}/${key}`, {
      min,
      max,
      default: value,
      discrete,
    });
  }
  return { voices, output: mixer };
}
/** Main's shared SVF, from midisynth_integration.applyFilterDefaults.
 * The caller chooses its placement in the authored audio graph.
 */
export function addMainSynthFilter(graph, { input, nodeId = 130 } = {}) {
  const filter = graph.add(svfDefinition.type, { id: nodeId });
  graph.registerInstance(`${MAIN_SYNTH}/nodes/filter`, filter);
  graph.connect(input, filter.input('audio'));
  for (const [id, name, min, max, value] of [
    [0, 'filterType', 0, 3, 0],
    [1, 'cutoff', 80, 16000, 3200],
    [2, 'resonance', 0.1, 2, 0.75],
  ])
    graph.registerParameter(`${MAIN_SYNTH}/${name}`, filter, id, {
      min,
      max,
      default: value,
    });
  // The public SVF is fully wet with unity drive, matching these old defaults.
  return filter;
}
/** main.lua dry/monitor/master routing, with caller-authored loop and synth buses.
 * The caller supplies real layer inputs/outputs; this function does not substitute
 * an independent LoopCapture for the legacy LoopLayer behavior.
 */
export function addMainSignalBranches(
  graph,
  { synth, layerInputs = [], layerOutputs = [], firstNodeId = 70, connectOutput = true } = {},
) {
  if (!synth || layerInputs.length > 4 || layerOutputs.length > 4) {
    throw new GraphContractError(
      'invalid-main-branches',
      'Provide a synth output and at most four layer buses',
    );
  }
  const add = (name, type, offset) => {
    const node = graph.add(type.startsWith('mixer') ? 'mixer' : type, {
      id: firstNodeId + offset,
      config: type.startsWith('mixer') ? { inputs: Number(type.slice(5)) } : {},
    });
    graph.registerInstance(`/main/nodes/${name}`, node);
    return node;
  };
  const trim = add('input_trim', 'gain', 0),
    monitor = add('input_monitor', 'gain', 1);
  const synthMonitor = add('synth_monitor', 'gain', 2),
    send = add('synth_send', 'gain', 3);
  const layers = add('layer_mixer', 'mixer4', 4),
    mix = add('main_mixer', 'mixer3', 5);
  const master = add('master', 'gain', 6);
  for (const node of [trim, monitor, send, master]) graph.setParameter(node, 0, 1);
  graph.setParameter(synthMonitor, 0, 0.8);
  graph.connect(graph.input.output('out'), trim.input('audio'));
  graph.connect(trim.output('out'), monitor.input('audio'));
  graph.connect(synth, synthMonitor.input('audio'));
  graph.connect(synth, send.input('audio'));
  // The legacy graph permits fan-in to a layer input. Explicit sum nodes retain
  // the two contributions in the portable contract's single-source input model.
  layerInputs.forEach((target, index) => {
    const sum = add(`layer_${index + 1}_input`, 'sum2', 7 + index);
    graph.connect(trim.output('out'), sum.input('a'));
    graph.connect(send.output('out'), sum.input('b'));
    graph.connect(sum.output('out'), target);
  });
  layerOutputs.forEach((source, index) => graph.connect(source, layers.input(`in-${index + 1}`)));
  graph.connect(synthMonitor.output('out'), mix.input('in-1'));
  graph.connect(layers.output('out'), mix.input('in-2'));
  graph.connect(monitor.output('out'), mix.input('in-3'));
  graph.connect(mix.output('out'), master.input('audio'));
  if (connectOutput) graph.connect(master.output('out'), graph.output.input('in'));
  for (const [name, node, value] of [
    ['inputTrim', trim, 1],
    ['inputMonitor', monitor, 1],
    ['output', synthMonitor, 0.8],
    ['captureSend', send, 1],
    ['master', master, 1],
  ]) {
    graph.registerParameter(`${MAIN_SYNTH}/${name}`, node, 0, {
      min: 0,
      max: 2,
      default: value,
    });
  }
  return { trim, monitor, synthMonitor, send, layers, mix, master };
}
// Graph definition — construct inspectable primitives with stable identities.
export function buildGraph({ captureLayers = false } = {}) {
  const graph = createGraphWorkspace().setInputSource('external');
  const { output } = addMainWaveVoices(graph);
  const captures = captureLayers
    ? Array.from({ length: 4 }, (_, index) => {
        const node = graph.add(retrospectiveCaptureDefinition.type, {
          id: 90 + index,
        });
        graph.registerInstance(`/main/layer/${index + 1}/capture`, node);
        return node.input('audio');
      })
    : [];
  addMainSignalBranches(graph, {
    synth: output.output('out'),
    layerInputs: captures,
  });
  return graph;
}
// Host integration — the session publishes edits only after audio acceptance.
export function createProject(host, graph = buildGraph()) {
  const session = createLiveGraphSession(
    graph,
    (route) => host.setRoute(route),
    (edit) => host.setParameter(edit),
    (document) => host.replaceGraph(document),
    (edits) => host.setParameterBatch(edits),
  );
  const api = {
    session,
    toProject: () => session.toProject(),
    adoptPublishedParameters: (edits) => session.adoptPublishedParameters(edits),
    async set(path, value) {
      const document = session.toProject();
      if (document.endpoints.some((endpoint) => endpoint.path === path))
        return session.parameterPath(path, value);
      const instances = new Map(document.instances.map((entry) => [entry.path, entry.nodeId]));
      const gate = path.match(/^\/midi\/synth\/voice\/([1-8])\/gate$/);
      if (gate) {
        // Gate is independent of amplitude in legacy VoicePool's Wave branch.
        const nodeId = instances.get(nodePath(Number(gate[1]), 'oscillator'));
        const amplitude =
          document.signal.initialParameters.find((p) => p.nodeId === nodeId && p.id === 2)?.value ??
          0;
        return session.parameterWithControl({ nodeId, id: 2, value: amplitude }, { path, value });
      }
      const name = path.slice(`${MAIN_SYNTH}/`.length);
      if (!path.startsWith(`${MAIN_SYNTH}/`) || !Object.hasOwn(ranges, name)) {
        throw new GraphContractError('unknown-control', `Unknown Main Wave control: ${path}`);
      }
      const edits = [];
      for (let index = 1; index <= 8; index++) {
        if (name === 'blend/amount')
          for (const branch of ['mix', 'direction']) {
            edits.push({
              nodeId: instances.get(nodePath(index, branch)),
              id: 0,
              value: value * 2 - 1,
            });
          }
        else
          edits.push({
            nodeId: instances.get(nodePath(index, 'oscillator')),
            id: oscillatorIds[name],
            value,
          });
      }
      return session.parametersWithControl(edits, { path, value });
    },
    setVoices(values) {
      const instances = new Map(
        session.toProject().instances.map((entry) => [entry.path, entry.nodeId]),
      );
      return session.parameters(
        values.flatMap(({ index, frequency, amplitude }) => {
          if (!Number.isInteger(index) || index < 1 || index > 8)
            throw new Error('Choose voice 1–8');
          const nodeId = instances.get(nodePath(index, 'oscillator'));
          return [
            ...(frequency === undefined ? [] : [{ nodeId, id: 1, value: frequency }]),
            ...(amplitude === undefined ? [] : [{ nodeId, id: 2, value: amplitude }]),
          ];
        }),
      );
    },
    setInsert(enabled) {
      return session.transaction((candidate) => {
        const output = candidate.findInstance('/main/nodes/master');
        candidate.disconnect(candidate.output.input('in'));
        if (candidate.find(100)) candidate.remove(candidate.find(100));
        if (enabled) {
          const unity = candidate.add(fixedGainDefinition.type, {
            id: 100,
            config: { gain: 1 },
          });
          candidate.registerInstance('/main/nodes/review_insert', unity);
          candidate.connect(output.output('out'), unity.input('audio'));
          candidate.connect(unity.output('out'), candidate.output.input('in'));
        } else candidate.connect(output.output('out'), candidate.output.input('in'));
      });
    },
  };
  return api;
}
export const restoreProject = (host, saved) =>
  createProject(host, GraphWorkspace.fromProject(saved));
