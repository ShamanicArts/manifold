// Audition the legacy Standalone Transpose event behavior with an authored
// MidiInput -> MidiTranspose -> VoiceSynth graph. MIDI export/UI parity is open.
// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import {
  distortion as distortionDefinition,
  midiInput as midiInputDefinition,
  midiTranspose as midiTransposeDefinition,
  voiceSynth as voiceSynthDefinition,
} from '@manifold/author/primitives';
import { createGraphWorkspace, createLiveGraphSession } from '@manifold/author';
export const TRANSPOSE_PATH = '/midi/synth/rack/transpose/1/semitones';
export const INPUT_PATH = '/transpose/audition/nodes/midi_input';
export const EFFECT_PATH = '/midi/synth/rack/transpose/1/nodes/effect';
export const VOICE_PATH = '/transpose/audition/nodes/voice';
// Graph definition — construct inspectable primitives with stable identities.
export function buildGraph() {
  const graph = createGraphWorkspace();
  const input = graph.add(midiInputDefinition.type, { id: 4 });
  const effect = graph.add(midiTransposeDefinition.type, { id: 5 });
  const voice = graph.add(voiceSynthDefinition.type, { id: 6 });
  graph.registerInstance(INPUT_PATH, input);
  graph.registerInstance(EFFECT_PATH, effect);
  graph.registerInstance(VOICE_PATH, voice);
  graph.connect(input.output('out'), effect.input('midi'));
  graph.connect(effect.output('out'), voice.input('midi'));
  graph.connect(voice.output('out'), graph.output.input('in'));
  graph.registerParameter(TRANSPOSE_PATH, effect, effect.parameter('semitones').description.id, {
    min: -24,
    max: 24,
    default: 0,
  });
  graph.bindHostSlot(0, effect, effect.parameter('semitones').description.id);
  return graph;
}
// Host integration — the session publishes edits only after audio acceptance.
export function createProject(host, graph = buildGraph()) {
  const session = createLiveGraphSession(
    graph,
    (route) => host.setRoute(route),
    (edit) => host.setParameter(edit),
    (project) => host.replaceGraph(project),
    typeof host.setParameterBatch === 'function' ? (edits) => host.setParameterBatch(edits) : null,
    typeof host.readPublishedParameters === 'function'
      ? () => host.readPublishedParameters()
      : null,
  );
  return Object.freeze({
    session,
    toProject: () => session.toProject(),
    synchronizeParameters: () => session.adoptPublishedParameters([]),
    set: (path, value) => session.parameterPath(path, value),
    sendEvents: (events) => {
      const input = session.forkGraph().findInstance(INPUT_PATH);
      return host.sendEventBatch(events.map((event) => ({ ...event, nodeId: input.id })));
    },
    setInsert: (enabled, mix = 0.4) =>
      session.transaction((graph) => {
        const voice = graph.findInstance(VOICE_PATH),
          insertPath = '/transpose/audition/nodes/insert';
        const existing = graph.findInstance(insertPath);
        graph.disconnect(graph.output.input('in'));
        if (enabled) {
          const insert = existing ?? graph.add(distortionDefinition.type, { id: 7 });
          graph.registerInstance(insertPath, insert);
          graph.setParameter(insert, 0, 4);
          graph.setParameter(insert, 1, mix);
          graph.setParameter(insert, 2, 1);
          if (!existing) graph.connect(voice.output('out'), insert.input('audio'));
          graph.connect(insert.output('out'), graph.output.input('in'));
        } else {
          if (existing) graph.remove(existing);
          graph.connect(voice.output('out'), graph.output.input('in'));
        }
      }),
  });
}
