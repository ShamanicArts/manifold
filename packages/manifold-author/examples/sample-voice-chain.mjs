// First historical Rack Sample voice chain, assembled from public primitives.
// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import {
  gain as gainDefinition,
  phaseVocoder as phaseVocoderDefinition,
  sampleRegion as sampleRegionDefinition,
} from '@manifold/author/primitives';
import { createGraphWorkspace, createLiveGraphSession, GraphContractError } from '@manifold/author';
export const SAMPLE_BASE = '/midi/synth/rack/sample/1';
const hz = (note) => 440 * 2 ** ((note - 69) / 12);
const ratio = (note, root) => Math.max(0.25, Math.min(2, hz(note) / hz(root)));
// Graph definition — construct inspectable primitives with stable identities.
export function buildGraph(stereo, sourceRate = 48000, label = 'Sample voice source') {
  const graph = createGraphWorkspace();
  const region = graph.add(sampleRegionDefinition.type, { id: 4 });
  const vocoder = graph.add(phaseVocoderDefinition.type, { id: 5 });
  const voiceGain = graph.add(gainDefinition.type, { id: 6 });
  const output = graph.add(gainDefinition.type, { id: 7 });
  graph.registerInstance(`${SAMPLE_BASE}/nodes/voice_1/playback`, region);
  graph.registerInstance(`${SAMPLE_BASE}/nodes/voice_1/vocoder`, vocoder);
  graph.registerInstance(`${SAMPLE_BASE}/nodes/voice_1/gain`, voiceGain);
  graph.registerInstance(`${SAMPLE_BASE}/nodes/output`, output);
  region.parameter('crossfade').set(0.1);
  vocoder.parameter('fftOrder').set(9);
  voiceGain.parameter('level').set(0);
  output.parameter('level').set(0.2);
  graph.connect(region.output('out'), vocoder.input('audio'));
  graph.connect(vocoder.output('out'), voiceGain.input('audio'));
  graph.connect(voiceGain.output('out'), output.input('audio'));
  graph.connect(output.output('out'), graph.output.input('in'));
  for (const [suffix, range] of Object.entries({
    rootNote: { min: 12, max: 96, default: 60 },
    pitchMode: { min: 0, max: 2, default: 0, discrete: true },
    pvocTimeStretch: { min: 0.25, max: 4, default: 1 },
    playStart: { min: 0, max: 0.95, default: 0 },
    loopStart: { min: 0, max: 0.95, default: 0 },
    loopLen: { min: 0.05, max: 1, default: 1 },
    crossfade: { min: 0, max: 0.5, default: 0.1 },
    unison: { min: 1, max: 8, default: 1, discrete: true },
    detune: { min: 0, max: 100, default: 0 },
    spread: { min: 0, max: 1, default: 0 },
    output: { min: 0, max: 2, default: 0.8 },
  }))
    graph.registerControl(`${SAMPLE_BASE}/${suffix}`, range);
  graph.registerControl(`${SAMPLE_BASE}/voice/1/gate`, {
    min: 0,
    max: 1,
    default: 0,
  });
  graph.registerControl(`${SAMPLE_BASE}/voice/1/vOct`, {
    min: 0,
    max: 127,
    default: 60,
  });
  if (stereo) graph.setSampleAsset(region, stereo, sourceRate, label);
  return graph;
}
// Host integration — the session publishes edits only after audio acceptance.
export function createProject(host, graph) {
  if (!graph) throw new TypeError('Provide a graph with a decoded sample source');
  if (typeof host.sendEvent !== 'function')
    throw new TypeError('Sample voice needs a host event adapter');
  const session = createLiveGraphSession(
    graph,
    (route) => host.setRoute(route),
    (edit) => host.setParameter(edit),
    null,
    (edits) => host.setParameterBatch(edits),
  );
  const control = (path, value) => ({ path, value });
  const current = (path) =>
    session.toProject().controls.find((entry) => entry.path === path)?.value;
  return {
    activate() {
      if (current(`${SAMPLE_BASE}/voice/1/gate`) > 0.001) {
        host.sendEvent({ nodeId: 4, kind: 0, note: 60, velocity: 100 });
      }
    },
    async set(path, value) {
      if (!path.startsWith(`${SAMPLE_BASE}/`) || current(path) === undefined) {
        throw new GraphContractError('unknown-control', `Unknown sample voice control: ${path}`);
      }
      const suffix = path.slice(path.lastIndexOf('/') + 1);
      if (suffix === 'gate') {
        const previous = current(path);
        const accepted = await session.parameterWithControl(
          { nodeId: 6, id: 0, value },
          control(path, value),
        );
        if (value > 0.001 && previous <= 0.001) {
          host.sendEvent({ nodeId: 4, kind: 0, note: 60, velocity: 100 });
        } else if (value <= 0.001 && previous > 0.001) {
          host.sendEvent({ nodeId: 4, kind: 2 });
        }
        return accepted;
      }
      if (suffix === 'vOct' || suffix === 'rootNote') {
        const note = suffix === 'vOct' ? value : current(`${SAMPLE_BASE}/voice/1/vOct`);
        const root = suffix === 'rootNote' ? value : current(`${SAMPLE_BASE}/rootNote`);
        return session.parameterWithControl(
          { nodeId: 4, id: 0, value: ratio(note, root) },
          control(path, value),
        );
      }
      if (suffix === 'pitchMode') {
        return session.parametersWithControl(
          [
            { nodeId: 5, id: 0, value: value === 2 ? 1 : 0 },
            { nodeId: 5, id: 3, value: value === 0 ? 0 : 1 },
          ],
          control(path, value),
        );
      }
      if (suffix === 'pvocTimeStretch') {
        return session.parameterWithControl({ nodeId: 5, id: 2, value }, control(path, value));
      }
      if (suffix === 'playStart' || suffix === 'loopStart' || suffix === 'loopLen') {
        const start = suffix === 'loopStart' ? value : current(`${SAMPLE_BASE}/loopStart`);
        const length = suffix === 'loopLen' ? value : current(`${SAMPLE_BASE}/loopLen`);
        const end = Math.min(1, start + length);
        if (suffix === 'playStart') {
          return session.parameterWithControl(
            { nodeId: 4, id: 3, value: value > end ? start : value },
            control(path, value),
          );
        }
        return session.parametersWithControl(
          [
            { nodeId: 4, id: 4, value: start },
            { nodeId: 4, id: 5, value: end },
          ],
          control(path, value),
        );
      }
      if (suffix === 'crossfade') {
        return session.parameterWithControl({ nodeId: 4, id: 8, value }, control(path, value));
      }
      if (suffix === 'unison' || suffix === 'detune' || suffix === 'spread') {
        return session.parameterWithControl(
          {
            nodeId: 4,
            id: { unison: 9, detune: 10, spread: 11 }[suffix],
            value,
          },
          control(path, value),
        );
      }
      if (suffix === 'output') {
        return session.parameterWithControl(
          { nodeId: 7, id: 0, value: value * 0.25 },
          control(path, value),
        );
      }
      throw new GraphContractError('unknown-control', `Unsupported sample voice control: ${path}`);
    },
    toProject: () => session.toProject(),
    session,
  };
}
