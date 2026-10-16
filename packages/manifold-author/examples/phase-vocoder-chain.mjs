// Public graph composition for the historical Sample module's pitch stage.
// The oscillator is a deterministic test source; a sample voice can replace it.
// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import {
  oscillator as oscillatorDefinition,
  phaseVocoder as phaseVocoderDefinition,
} from '@manifold/author/primitives';
import { createGraphWorkspace, createLiveGraphSession } from '@manifold/author';
// Graph definition — construct inspectable primitives with stable identities.
export function buildGraph() {
  const graph = createGraphWorkspace();
  const source = graph.add(oscillatorDefinition.type, { id: 4 });
  const vocoder = graph.add(phaseVocoderDefinition.type, { id: 5 });
  graph.registerInstance('/sample/voice/source', source);
  graph.registerInstance('/sample/voice/vocoder', vocoder);
  source.parameter('waveform').set(0);
  source.parameter('frequency').set(440);
  source.parameter('level').set(0.4);
  vocoder.parameter('mode').set(0);
  vocoder.parameter('pitchSemitones').set(12);
  vocoder.parameter('wetMix').set(1);
  vocoder.parameter('fftOrder').set(9);
  graph.registerParameter(
    '/sample/voice/pitch',
    vocoder,
    vocoder.parameter('pitchSemitones').description.id,
    { min: -24, max: 24, default: 12 },
  );
  graph.registerParameter(
    '/sample/voice/mix',
    vocoder,
    vocoder.parameter('wetMix').description.id,
    { min: 0, max: 1, default: 1 },
  );
  graph.connect(source.output('out'), vocoder.input('audio'));
  graph.connect(vocoder.output('out'), graph.output.input('in'));
  return graph;
}
// Host integration — the session publishes edits only after audio acceptance.
export function createProject(host, graph = buildGraph()) {
  const session = createLiveGraphSession(
    graph,
    (route) => host.setRoute(route),
    (edit) => host.setParameter(edit),
  );
  return {
    set: (path, value) => session.parameterPath(path, value),
    toProject: () => session.toProject(),
    session,
  };
}
