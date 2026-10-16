// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import {
  createGraphWorkspace,
  GraphWorkspace,
  createLiveGraphSession,
} from '../../packages/manifold-author/author.js';
import {
  midiInput,
  sampleInstrument,
  phaseVocoder,
  gain as gainDefinition,
} from '../../packages/manifold-author/primitives.js';

function pcm(frequency) {
  return Float32Array.from(
    { length: 16384 },
    (_, index) =>
      Math.sin((Math.floor(index / 2) * 2 * Math.PI * frequency) / 48000) *
      (index % 2 ? -0.21 : 0.3),
  );
}
function graph() {
  // Composition — MIDI drives a sample voice, then pitch processing and output.
  const graph = createGraphWorkspace();
  const midi = graph.add(midiInput.type, { id: 2 });
  const instrument = graph.add(sampleInstrument.type, { id: 4 });
  const vocoder = graph.add(phaseVocoder.type, { id: 5 });
  const gain = graph.add(gainDefinition.type, { id: 6 });
  graph.registerInstance('/instrument/source', instrument);
  graph.registerInstance('/instrument/vocoder', vocoder);
  graph.registerInstance('/instrument/output', gain);
  graph.connect(midi.output('out'), instrument.input('midi'));
  graph.connect(instrument.output('out'), vocoder.input('audio'));
  graph.connect(vocoder.output('out'), gain.input('audio'));
  graph.connect(gain.output('out'), graph.output.input('in'));
  graph.setSampleAsset(instrument, pcm(220), 48000, 'Instrument initial');
  instrument.parameter('unison').set(4);
  instrument.parameter('detune').set(21);
  instrument.parameter('spread').set(0.7);
  vocoder.parameter('wetMix').set(1);
  // FFT order 9 prepares 512 samples outside the audio callback.
  vocoder.parameter('fftOrder').set(9);
  return graph;
}
function controller(host, graph) {
  // Host integration — resource replacement uses the accepted live session.
  const session = createLiveGraphSession(
    graph,
    (route) => host.setRoute(route),
    (edit) => host.setParameter(edit),
    (document) => host.replaceGraph(document),
    (edits) => host.setParameterBatch(edits),
  );
  return {
    toProject: () => session.toProject(),
    adoptPublishedParameters: (edits) => session.adoptPublishedParameters(edits),
    async event(event) {
      await host.sendEvent({ nodeId: 2, ...event });
      return session.toProject();
    },
    replaceSource(frequency) {
      return session.transaction((graph) =>
        graph.setSampleAsset(
          graph.findInstance('/instrument/source'),
          pcm(frequency),
          48000,
          `Instrument ${frequency} Hz`,
        ),
      );
    },
  };
}
export const createProject = (host) => controller(host, graph());
export const restoreProject = (host, saved) => controller(host, GraphWorkspace.fromProject(saved));
