// Ordinary public graph composition. This audition does not implement Main's
// quantized transport or seek/scrub behavior.
// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import {
  distortion as distortionDefinition,
  fixedGain as fixedGainDefinition,
  mixer9 as mixer9Definition,
  oscillator as oscillatorDefinition,
  retrospectiveCapture as retrospectiveCaptureDefinition,
} from '@manifold/author/primitives';
import { GraphWorkspace, createGraphWorkspace, createLiveGraphSession } from '@manifold/author';
import {
  addFourLayerLoopSources,
  createFourLayerLoopController,
  snapshotWithLoopAudio,
} from './four-layer-loops.mjs';
// Graph definition — construct inspectable primitives with stable identities.
export function buildGraph() {
  const graph = createGraphWorkspace(),
    tone = graph.add(oscillatorDefinition.type, { id: 4 }),
    trim = graph.add(fixedGainDefinition.type, { id: 5 });
  graph.registerInstance('/loop/audition/source', tone);
  tone.parameter('frequency').set(220);
  graph.registerInstance('/loop/audition/trim', trim);
  graph.connect(tone.output('out'), trim.input('audio'));
  const loops = addFourLayerLoopSources(graph, {
    input: trim.output('out'),
    registerSampleSources: false,
  });
  const mix = graph.add(mixer9Definition.type, { id: 8 });
  graph.registerInstance('/loop/audition/mix', mix);
  mix.parameter('masterLevel').set(0.25);
  loops.forEach((loop, index) => graph.connect(loop.output('out'), mix.input(`in-${index + 1}`)));
  const capture = graph.add(retrospectiveCaptureDefinition.type, { id: 80 });
  graph.registerInstance('/loop/audition/history', capture);
  graph.connect(trim.output('out'), capture.input('audio'));
  graph.connect(mix.output('out'), graph.output.input('in'));
  return graph;
}
// Host integration — the session publishes edits only after audio acceptance.
export function createProject(host, graph = buildGraph()) {
  const session = createLiveGraphSession(
    graph,
    (route) => host.setRoute(route),
    (edit) => host.setParameter(edit),
    (state) => host.replaceGraph(state),
    typeof host.setParameterBatch === 'function' ? (edits) => host.setParameterBatch(edits) : null,
    typeof host.readPublishedParameters === 'function'
      ? () => host.readPublishedParameters()
      : null,
  );
  const layers = createFourLayerLoopController(session);
  return Object.freeze({
    session,
    layers,
    record: layers.record,
    play: layers.play,
    overdub: layers.overdub,
    speed: layers.speed,
    reverse: layers.reverse,
    toProject: () => session.toProject(),
    adoptPublishedParameters: (edits) => session.adoptPublishedParameters(edits),
    synchronizeParameters: () => session.adoptPublishedParameters([]),
    setLayerCapacity: (layer, capacitySeconds) =>
      session.transaction((graph) => {
        const loop = graph.findInstance(`/rack_host/layers/${layer}/loop`);
        if (!loop) throw new Error('Unknown loop layer');
        graph.configure(loop, { capacitySeconds });
      }),
    async snapshot() {
      if (typeof host.snapshotLoop !== 'function')
        throw new Error(
          'This host has no live loop snapshot service; native audio uses stop_and_snapshot after processing stops',
        );
      const state = await session.adoptPublishedParameters([]);
      return snapshotWithLoopAudio(state, (id) => host.snapshotLoop(id));
    },
    setInsert: (enabled, mix = 0.4) =>
      session.transaction((graph) => {
        const mixer = graph.findInstance('/loop/audition/mix'),
          old = graph.findInstance('/loop/audition/insert');
        graph.disconnect(graph.output.input('in'));
        if (enabled) {
          const insert = old ?? graph.add(distortionDefinition.type, { id: 9 });
          graph.registerInstance('/loop/audition/insert', insert);
          graph.setParameter(insert, 0, 4);
          graph.setParameter(insert, 1, mix);
          graph.setParameter(insert, 2, 1);
          if (!old) graph.connect(mixer.output('out'), insert.input('audio'));
          graph.connect(insert.output('out'), graph.output.input('in'));
        } else {
          if (old) graph.remove(old);
          graph.connect(mixer.output('out'), graph.output.input('in'));
        }
      }),
  });
}
// Recall — validate portable state through the same graph contract.
export function restoreProject(host, saved) {
  return createProject(host, GraphWorkspace.fromProject(saved));
}
