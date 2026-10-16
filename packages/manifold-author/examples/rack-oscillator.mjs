// Historical Rack oscillator wiring, authored entirely from public graph primitives.
// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import {
  extendedOscillator as extendedOscillatorDefinition,
  gain as gainDefinition,
  mixer9 as mixer9Definition,
} from '@manifold/author/primitives';
import { GraphContractError, createGraphWorkspace, createLiveGraphSession } from '@manifold/author';
export const OSC_BASE = '/midi/synth/rack/osc/1';
const hz = (note) => 440 * 2 ** ((note - 69) / 12);
const voicePath = (index) => `${OSC_BASE}/voice/${index}`;
const oscillatorPath = (index) => `${OSC_BASE}/nodes/${index === 9 ? 'manual' : `voice_${index}`}`;
/** Add the original eight voices, manual voice, nine-input mixer, and output gain. */
export function addRackOscillatorModule(
  graph,
  { firstVoiceId = 4, mixerId = 13, outputId = 21, connectOutput = false } = {},
) {
  const oscillators = [];
  for (let index = 1; index <= 9; index++) {
    const oscillator = graph.add(extendedOscillatorDefinition.type, {
      id: firstVoiceId + index - 1,
    });
    graph.registerInstance(oscillatorPath(index), oscillator);
    oscillator.parameter('waveform').set(1);
    oscillator.parameter('frequency').set(index === 9 ? hz(60) : 220);
    oscillator.parameter('level').set(0);
    if (index <= 8) oscillator.parameter('retriggerOnLevelRise').set(1);
    oscillators.push(oscillator);
  }
  const mixer = graph.add(mixer9Definition.type, { id: mixerId });
  graph.registerInstance(`${OSC_BASE}/nodes/mixer`, mixer);
  for (let index = 0; index < oscillators.length; index++) {
    graph.connect(oscillators[index].output('out'), mixer.input(`in-${index + 1}`));
  }
  const output = graph.add(gainDefinition.type, { id: outputId });
  graph.registerInstance(`${OSC_BASE}/nodes/output`, output);
  output.parameter('level').set(0.2);
  graph.connect(mixer.output('out'), output.input('audio'));
  if (connectOutput) graph.connect(output.output('out'), graph.output.input('in'));
  for (const [suffix, range] of Object.entries({
    waveform: { min: 0, max: 7, default: 1, discrete: true },
    drive: { min: 0, max: 20, default: 0 },
    driveShape: { min: 0, max: 3, default: 0, discrete: true },
    driveBias: { min: -1, max: 1, default: 0 },
    pulseWidth: { min: 0.01, max: 0.99, default: 0.5 },
    unison: { min: 1, max: 8, default: 1, discrete: true },
    detune: { min: 0, max: 100, default: 0 },
    spread: { min: 0, max: 1, default: 0 },
    renderMode: { min: 0, max: 1, default: 0, discrete: true },
    additivePartials: { min: 1, max: 32, default: 8, discrete: true },
    additiveTilt: { min: -1, max: 1, default: 0 },
    additiveDrift: { min: 0, max: 1, default: 0 },
    manualPitch: { min: 0, max: 127, default: 60 },
    manualLevel: { min: 0, max: 1, default: 0 },
    output: { min: 0, max: 2, default: 0.8 },
  }))
    graph.registerControl(`${OSC_BASE}/${suffix}`, range);
  for (let index = 1; index <= 8; index++) {
    for (const [suffix, range] of Object.entries({
      gate: { min: 0, max: 1, default: 0 },
      vOct: { min: 0, max: 127, default: 60 },
      fm: { min: -1, max: 1, default: 0 },
      pwCv: { min: 0, max: 1, default: 0.5 },
    }))
      graph.registerControl(`${voicePath(index)}/${suffix}`, range);
  }
  return output;
}
// Graph definition — construct inspectable primitives with stable identities.
export function buildGraph() {
  const graph = createGraphWorkspace();
  addRackOscillatorModule(graph, { connectOutput: true });
  return graph;
}
/** Interpret old path controls against any prepared graph containing this module. */
export function setRackOscillatorControl(session, path, value) {
  const project = session.toProject();
  const values = new Map(project.controls.map((entry) => [entry.path, entry.value]));
  if (!values.has(path))
    throw new GraphContractError('unknown-control', `Unknown oscillator control: ${path}`);
  const instances = new Map(project.instances.map((entry) => [entry.path, entry.nodeId]));
  const node = (index) => instances.get(oscillatorPath(index));
  const output = instances.get(`${OSC_BASE}/nodes/output`);
  if (!output || Array.from({ length: 9 }, (_, index) => node(index + 1)).some((id) => !id)) {
    throw new GraphContractError('unsupported-project', 'Rack oscillator nodes are missing');
  }
  const suffix = path.slice(path.lastIndexOf('/') + 1);
  const control = { path, value };
  if (suffix === 'output')
    return session.parameterWithControl({ nodeId: output, id: 0, value: value * 0.25 }, control);
  if (suffix === 'manualPitch')
    return session.parameterWithControl(
      {
        nodeId: node(9),
        id: 1,
        value: Math.max(20, Math.min(8000, hz(value))),
      },
      control,
    );
  if (suffix === 'manualLevel')
    return session.parameterWithControl({ nodeId: node(9), id: 2, value: value * 0.4 }, control);
  const match = path.match(/\/voice\/(\d+)\/(gate|vOct|fm|pwCv)$/);
  if (match) {
    const index = Number(match[1]);
    const base = voicePath(index);
    const get = (key) => (key === suffix ? value : values.get(`${base}/${key}`));
    const edit =
      suffix === 'gate'
        ? {
            nodeId: node(index),
            id: 2,
            value: Math.min(0.4, Math.max(0, value)),
          }
        : suffix === 'pwCv'
          ? {
              nodeId: node(index),
              id: 4,
              value: Math.max(
                0.01,
                Math.min(0.99, values.get(`${OSC_BASE}/pulseWidth`) + value - 0.5),
              ),
            }
          : {
              nodeId: node(index),
              id: 1,
              value: Math.max(20, Math.min(8000, hz(get('vOct') + get('fm') * 12))),
            };
    return session.parameterWithControl(edit, control);
  }
  const ids = {
    waveform: 0,
    drive: 5,
    driveShape: 6,
    driveBias: 7,
    pulseWidth: 4,
    unison: 10,
    detune: 11,
    spread: 12,
    renderMode: 13,
    additivePartials: 14,
    additiveTilt: 15,
    additiveDrift: 16,
  };
  if (Object.hasOwn(ids, suffix)) {
    const edits = Array.from({ length: 9 }, (_, index) => ({
      nodeId: node(index + 1),
      id: ids[suffix],
      value:
        suffix === 'pulseWidth' && index < 8
          ? Math.max(0.01, Math.min(0.99, value + values.get(`${voicePath(index + 1)}/pwCv`) - 0.5))
          : value,
    }));
    return session.parametersWithControl(edits, control);
  }
  throw new GraphContractError('unknown-control', `Unsupported oscillator control: ${path}`);
}
// Host integration — the session publishes edits only after audio acceptance.
export function createProject(host, graph = buildGraph()) {
  const session = createLiveGraphSession(
    graph,
    (route) => host.setRoute(route),
    (edit) => host.setParameter(edit),
    typeof host.replaceGraph === 'function' ? (project) => host.replaceGraph(project) : null,
    typeof host.setParameterBatch === 'function' ? (edits) => host.setParameterBatch(edits) : null,
    typeof host.readPublishedParameters === 'function'
      ? () => host.readPublishedParameters()
      : null,
  );
  return {
    set: (path, value) => setRackOscillatorControl(session, path, value),
    toProject: () => session.toProject(),
    session,
  };
}
