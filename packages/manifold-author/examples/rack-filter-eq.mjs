// Bounded RackModuleHost port: prepared source buses feed reusable module
// primitives. Project logic owns active cables and saved controls.
// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import {
  audioFm as audioFmDefinition,
  audioSync as audioSyncDefinition,
  crossfader as crossfaderDefinition,
  effectSlotLegacy as effectSlotLegacyDefinition,
  eq8 as eq8Definition,
  gain as gainDefinition,
  noise as noiseDefinition,
  oscillator as oscillatorDefinition,
  pulseOscillator as pulseOscillatorDefinition,
  ringModulator as ringModulatorDefinition,
  svf as svfDefinition,
} from '@manifold/author/primitives';
import { GraphContractError, createGraphWorkspace, createLiveGraphSession } from '@manifold/author';
import { OSC_BASE, setRackOscillatorControl } from './rack-oscillator.mjs';
import { createProject as createRackSampleProject } from './rack-sample-eight-voice.mjs';
import { SAMPLE_BASE } from './sample-voice-chain.mjs';
const ROOT = '/rack_host';
const FILTER = `${ROOT}/modules/filter/nodes/processor`;
const FX = `${ROOT}/modules/fx/nodes/processor`;
const EQ = `${ROOT}/modules/eq/nodes/processor`;
const SOURCE = `${ROOT}/input_a/nodes/oscillator`;
const SOURCE_BUS = `${ROOT}/input_a/nodes/bus`;
const SOURCE_EXTERNAL = `${ROOT}/input_a/nodes/external`;
const SOURCE_NOISE = `${ROOT}/input_a/nodes/noise`;
const SOURCE_PULSE = `${ROOT}/input_a/nodes/pulse`;
const B_SOURCE = `${ROOT}/input_b/nodes/oscillator`;
const B_BUS = `${ROOT}/input_b/nodes/bus`;
const B_NOISE = `${ROOT}/input_b/nodes/noise`;
const B_EXTERNAL = `${ROOT}/input_b/nodes/external`;
const B_PULSE = `${ROOT}/input_b/nodes/pulse`;
const BLEND = `${ROOT}/modules/blend_simple/nodes/crossfader`;
const BLEND_OUTPUT = `${ROOT}/modules/blend_simple/nodes/output`;
const RING_A_TO_B = `${ROOT}/modules/blend_simple/nodes/ring_a_to_b`;
const RING_B_TO_A = `${ROOT}/modules/blend_simple/nodes/ring_b_to_a`;
const RING_CROSSFADE = `${ROOT}/modules/blend_simple/nodes/ring_crossfader`;
const FM_A_TO_B = `${ROOT}/modules/blend_simple/nodes/fm_a_to_b`;
const FM_B_TO_A = `${ROOT}/modules/blend_simple/nodes/fm_b_to_a`;
const FM_CROSSFADE = `${ROOT}/modules/blend_simple/nodes/fm_crossfader`;
const SYNC_A_TO_B = `${ROOT}/modules/blend_simple/nodes/sync_a_to_b`;
const SYNC_B_TO_A = `${ROOT}/modules/blend_simple/nodes/sync_b_to_a`;
const SYNC_CROSSFADE = `${ROOT}/modules/blend_simple/nodes/sync_crossfader`;
const BLEND_BRANCHES = [BLEND, RING_CROSSFADE, FM_CROSSFADE, SYNC_CROSSFADE];
const SELECT = `${ROOT}/module/index`;
const INPUT_MODE = `${ROOT}/input_a/mode`;
const INPUT_PITCH = `${ROOT}/input_a/pitch`;
const INPUT_LEVEL = `${ROOT}/input_a/level`;
const B_MODE = `${ROOT}/input_b/mode`;
const B_PITCH = `${ROOT}/input_b/pitch`;
const B_LEVEL = `${ROOT}/input_b/level`;
const BLEND_BASE = '/midi/synth/rack/blend_simple/1';
const FILTER_BASE = '/midi/synth/rack/filter/1';
const FX_BASE = '/midi/synth/rack/fx/1';
const EQ_BASE = '/midi/synth/rack/eq/1';
const C4_HZ = 440 * 2 ** ((60 - 69) / 12);
// Graph definition — construct inspectable primitives with stable identities.
export function buildGraph() {
  const graph = createGraphWorkspace().setInputSource('external');
  const source = graph.add(oscillatorDefinition.type, { id: 4 });
  const filter = graph.add(svfDefinition.type, { id: 5 });
  const eq = graph.add(eq8Definition.type, { id: 6 });
  const fx = graph.add(effectSlotLegacyDefinition.type, { id: 7 });
  const sourceBus = graph.add(gainDefinition.type, { id: 8 });
  const noise = graph.add(noiseDefinition.type, { id: 9 });
  const external = graph.add(gainDefinition.type, { id: 10 });
  const pulse = graph.add(pulseOscillatorDefinition.type, { id: 11 });
  const bSource = graph.add(oscillatorDefinition.type, { id: 12 });
  const bBus = graph.add(gainDefinition.type, { id: 13 });
  const bNoise = graph.add(noiseDefinition.type, { id: 14 });
  const bExternal = graph.add(gainDefinition.type, { id: 15 });
  const bPulse = graph.add(pulseOscillatorDefinition.type, { id: 16 });
  const blend = graph.add(crossfaderDefinition.type, { id: 17 });
  const blendOutput = graph.add(gainDefinition.type, { id: 18 });
  const ringAToB = graph.add(ringModulatorDefinition.type, { id: 19 });
  const ringBToA = graph.add(ringModulatorDefinition.type, { id: 20 });
  const ringCrossfade = graph.add(crossfaderDefinition.type, { id: 21 });
  const fmAToB = graph.add(audioFmDefinition.type, { id: 22 });
  const fmBToA = graph.add(audioFmDefinition.type, { id: 23 });
  const fmCrossfade = graph.add(crossfaderDefinition.type, { id: 24 });
  const syncAToB = graph.add(audioSyncDefinition.type, { id: 25 });
  const syncBToA = graph.add(audioSyncDefinition.type, { id: 26 });
  const syncCrossfade = graph.add(crossfaderDefinition.type, { id: 27 });
  graph.registerInstance(SOURCE, source);
  graph.registerInstance(SOURCE_BUS, sourceBus);
  graph.registerInstance(SOURCE_NOISE, noise);
  graph.registerInstance(SOURCE_EXTERNAL, external);
  graph.registerInstance(SOURCE_PULSE, pulse);
  for (const [path, node] of [
    [B_SOURCE, bSource],
    [B_BUS, bBus],
    [B_NOISE, bNoise],
    [B_EXTERNAL, bExternal],
    [B_PULSE, bPulse],
    [BLEND, blend],
    [BLEND_OUTPUT, blendOutput],
    [RING_A_TO_B, ringAToB],
    [RING_B_TO_A, ringBToA],
    [RING_CROSSFADE, ringCrossfade],
    [FM_A_TO_B, fmAToB],
    [FM_B_TO_A, fmBToA],
    [FM_CROSSFADE, fmCrossfade],
    [SYNC_A_TO_B, syncAToB],
    [SYNC_B_TO_A, syncBToA],
    [SYNC_CROSSFADE, syncCrossfade],
  ])
    graph.registerInstance(path, node);
  graph.registerInstance(FILTER, filter);
  graph.registerInstance(FX, fx);
  graph.registerInstance(EQ, eq);
  source.parameter('waveform').set(0);
  source.parameter('frequency').set(C4_HZ);
  source.parameter('level').set(1);
  sourceBus.parameter('level').set(0.65);
  noise.parameter('level').set(1);
  noise.parameter('color').set(0.1);
  external.parameter('level').set(1);
  pulse.parameter('frequency').set(C4_HZ);
  pulse.parameter('level').set(1);
  pulse.parameter('pulseWidth').set(0.25);
  bSource.parameter('waveform').set(1);
  bSource.parameter('frequency').set(440 * 2 ** ((67 - 69) / 12));
  bSource.parameter('level').set(1);
  bBus.parameter('level').set(0.5);
  bNoise.parameter('level').set(1);
  bNoise.parameter('color').set(0.1);
  bExternal.parameter('level').set(1);
  bPulse.parameter('frequency').set(440 * 2 ** ((67 - 69) / 12));
  bPulse.parameter('level').set(1);
  bPulse.parameter('pulseWidth').set(0.25);
  blend.parameter('position').set(0);
  blend.parameter('curve').set(1);
  blend.parameter('wetMix').set(1);
  blendOutput.parameter('level').set(1);
  for (const ring of [ringAToB, ringBToA]) {
    graph.setParameter(ring, 0, 120);
    graph.setParameter(ring, 1, 0.5);
    graph.setParameter(ring, 2, 1);
    graph.setParameter(ring, 3, 0);
    graph.setParameter(ring, 4, 1);
  }
  ringCrossfade.parameter('position').set(0);
  ringCrossfade.parameter('curve').set(1);
  ringCrossfade.parameter('wetMix').set(1);
  for (const node of [fmAToB, fmBToA, syncAToB, syncBToA]) {
    graph.setParameter(node, 0, 0.5);
    graph.setParameter(node, 1, 1);
  }
  for (const node of [fmCrossfade, syncCrossfade]) {
    graph.setParameter(node, 0, 0);
    graph.setParameter(node, 1, 1);
    graph.setParameter(node, 2, 1);
  }
  eq.parameter('band1Q').set(0.8);
  eq.parameter('band8Q').set(0.8);
  for (const [index, value] of [0.5, 0.5, 0.2, 0.6, 0.4].entries()) {
    graph.setParameter(fx, index + 2, value);
  }
  graph.connect(graph.input.output('out'), external.input('audio'));
  graph.connect(graph.input.output('out'), bExternal.input('audio'));
  graph.connect(source.output('out'), sourceBus.input('audio'));
  graph.connect(bSource.output('out'), bBus.input('audio'));
  graph.connect(sourceBus.output('out'), filter.input('audio'));
  graph.connect(sourceBus.output('out'), fx.input('audio'));
  graph.connect(sourceBus.output('out'), eq.input('audio'));
  graph.connect(sourceBus.output('out'), blend.input('a'));
  graph.connect(bBus.output('out'), blend.input('b'));
  graph.connect(sourceBus.output('out'), ringAToB.input('carrier'));
  graph.connect(bBus.output('out'), ringAToB.input('modulator'));
  graph.connect(bBus.output('out'), ringBToA.input('carrier'));
  graph.connect(sourceBus.output('out'), ringBToA.input('modulator'));
  graph.connect(ringAToB.output('out'), ringCrossfade.input('a'));
  graph.connect(ringBToA.output('out'), ringCrossfade.input('b'));
  for (const [forward, backward, crossfade] of [
    [fmAToB, fmBToA, fmCrossfade],
    [syncAToB, syncBToA, syncCrossfade],
  ]) {
    graph.connect(sourceBus.output('out'), forward.input('carrier'));
    graph.connect(bBus.output('out'), forward.input('modulator'));
    graph.connect(bBus.output('out'), backward.input('carrier'));
    graph.connect(sourceBus.output('out'), backward.input('modulator'));
    graph.connect(forward.output('out'), crossfade.input('a'));
    graph.connect(backward.output('out'), crossfade.input('b'));
  }
  graph.connect(blend.output('out'), blendOutput.input('audio'));
  graph.connect(filter.output('out'), graph.output.input('in'));
  graph.registerControl(SELECT, {
    min: 1,
    max: 19,
    default: 4,
    discrete: true,
  });
  graph.registerControl(INPUT_MODE, {
    min: 1,
    max: 7,
    default: 3,
    discrete: true,
  });
  graph.registerControl(INPUT_PITCH, {
    min: 24,
    max: 84,
    default: 60,
    discrete: true,
  });
  graph.registerControl(B_MODE, { min: 1, max: 7, default: 4, discrete: true });
  graph.registerControl(B_PITCH, {
    min: 24,
    max: 84,
    default: 67,
    discrete: true,
  });
  graph.registerControl(`${BLEND_BASE}/mode`, {
    min: 0,
    max: 3,
    default: 0,
    discrete: true,
  });
  graph.registerControl(`${BLEND_BASE}/blendAmount`, {
    min: 0,
    max: 1,
    default: 0.5,
  });
  graph.registerControl(`${BLEND_BASE}/blendModAmount`, {
    min: 0,
    max: 1,
    default: 0.5,
  });
  for (const [path, node, id, range, slot] of [
    [`${FILTER_BASE}/type`, filter, 0, { min: 0, max: 3, default: 0 }, 0],
    [`${FILTER_BASE}/cutoff`, filter, 1, { min: 20, max: 20000, default: 3200 }, 1],
    [`${FILTER_BASE}/resonance`, filter, 2, { min: 0.1, max: 1, default: 0.75 }, 2],
    [`${EQ_BASE}/output`, eq, 40, { min: -24, max: 24, default: 0 }, 3],
    [`${EQ_BASE}/mix`, eq, 41, { min: 0, max: 1, default: 1 }, 4],
    [`${FX_BASE}/type`, fx, 0, { min: 0, max: 20, default: 0 }, 5],
    [`${FX_BASE}/mix`, fx, 1, { min: 0, max: 1, default: 0 }, 6],
    ...[0.5, 0.5, 0.2, 0.6, 0.4].map((defaultValue, index) => [
      `${FX_BASE}/p/${index}`,
      fx,
      index + 2,
      { min: 0, max: 1, default: defaultValue },
      index + 7,
    ]),
    [INPUT_LEVEL, sourceBus, 0, { min: 0, max: 1, default: 0.65 }, 12],
    [B_LEVEL, bBus, 0, { min: 0, max: 1, default: 0.5 }, 13],
    [`${BLEND_BASE}/output`, blendOutput, 0, { min: 0, max: 1, default: 1 }, 14],
  ]) {
    graph.registerParameter(path, node, id, range);
    graph.bindHostSlot(slot, node, id);
  }
  return graph;
}
// Host integration — the session publishes edits only after audio acceptance.
export function createProject(host, graph = buildGraph()) {
  if (typeof host.setRoute !== 'function' || typeof host.setParameter !== 'function') {
    throw new GraphContractError(
      'invalid-host',
      'Rack module audition needs route and parameter adapters',
    );
  }
  for (const [path, type] of [
    [SOURCE, 'oscillator'],
    [SOURCE_BUS, 'gain'],
    [SOURCE_EXTERNAL, 'gain'],
    [SOURCE_NOISE, 'noise'],
    [FILTER, 'svf'],
    [SOURCE_PULSE, 'pulse-oscillator'],
    [B_SOURCE, 'oscillator'],
    [B_BUS, 'gain'],
    [B_EXTERNAL, 'gain'],
    [B_NOISE, 'noise'],
    [B_PULSE, 'pulse-oscillator'],
    [BLEND, 'crossfader'],
    [BLEND_OUTPUT, 'gain'],
    [RING_A_TO_B, 'ring-modulator'],
    [RING_B_TO_A, 'ring-modulator'],
    [RING_CROSSFADE, 'crossfader'],
    [FM_A_TO_B, 'audio-fm'],
    [FM_B_TO_A, 'audio-fm'],
    [FM_CROSSFADE, 'crossfader'],
    [SYNC_A_TO_B, 'audio-sync'],
    [SYNC_B_TO_A, 'audio-sync'],
    [SYNC_CROSSFADE, 'crossfader'],
    [FX, 'effect-slot-legacy'],
    [EQ, 'eq8'],
  ]) {
    if (graph.findInstance(path)?.type !== type) {
      throw new GraphContractError('unsupported-project', `Missing Rack module instance: ${path}`);
    }
  }
  const session = createLiveGraphSession(
    graph,
    (route) => host.setRoute(route),
    (edit) => host.setParameter(edit),
    null,
    typeof host.setParameterBatch === 'function' ? (edits) => host.setParameterBatch(edits) : null,
  );
  const sampleProject =
    graph.findInstance(`${SAMPLE_BASE}/nodes/output`) && typeof host.sendEvent === 'function'
      ? createRackSampleProject(host, graph, session)
      : null;
  const sourcePaths = {
    [INPUT_MODE]: {
      pitch: INPUT_PITCH,
      source: SOURCE,
      bus: SOURCE_BUS,
      external: SOURCE_EXTERNAL,
      noise: SOURCE_NOISE,
      pulse: SOURCE_PULSE,
    },
    [B_MODE]: {
      pitch: B_PITCH,
      source: B_SOURCE,
      bus: B_BUS,
      external: B_EXTERNAL,
      noise: B_NOISE,
      pulse: B_PULSE,
    },
  };
  async function setSourceMode(path, value) {
    if (!Number.isInteger(value) || value < 1 || value > 7) {
      throw new GraphContractError(
        'invalid-source-mode',
        'Input mode must be an integer from 1 to 7',
      );
    }
    const paths = sourcePaths[path];
    const current = session.forkGraph();
    const prior = current.findControl(path).value;
    const bus = current.findInstance(paths.bus);
    if (value >= 3 && value <= 5 && prior >= 3 && prior <= 5) {
      return session.parameterWithControl(
        {
          nodeId: current.findInstance(paths.source).id,
          id: 0,
          value: value - 3,
        },
        { path, value },
      );
    }
    if (value >= 3 && value <= 5) {
      // Prepare the silent branch first; selection and cable move on route ack.
      await session.parameter({
        nodeId: current.findInstance(paths.source).id,
        id: 1,
        value: 440 * 2 ** ((current.findControl(paths.pitch).value - 69) / 12),
      });
      await session.parameter({
        nodeId: current.findInstance(paths.source).id,
        id: 0,
        value: value - 3,
      });
    }
    if (value === 6) {
      await session.parameter({
        nodeId: current.findInstance(paths.pulse).id,
        id: 1,
        value: 440 * 2 ** ((current.findControl(paths.pitch).value - 69) / 12),
      });
    }
    const branch =
      value === 1
        ? paths.external
        : value === 7
          ? paths.noise
          : value === 6
            ? paths.pulse
            : paths.source;
    return session.routeWithControl(
      {
        to: bus.id,
        input: 'audio',
        from: value === 2 ? null : current.findInstance(branch).id,
        output: 'out',
      },
      { path, value },
    );
  }
  function setSourcePitch(path, value) {
    const modePath = path === INPUT_PITCH ? INPUT_MODE : B_MODE;
    const paths = sourcePaths[modePath];
    const current = session.forkGraph();
    const source = current.findInstance(
      current.findControl(modePath).value === 6 ? paths.pulse : paths.source,
    );
    return session.parameterWithControl(
      { nodeId: source.id, id: 1, value: 440 * 2 ** ((value - 69) / 12) },
      { path, value },
    );
  }
  return Object.freeze({
    session,
    toProject: () => session.toProject(),
    activate: () => sampleProject?.activate(),
    captureArmed: () => sampleProject?.captureArmed() ?? false,
    latestAnalysis: () => sampleProject?.latestAnalysis() ?? null,
    analyzeSavedSample: () => sampleProject?.analyzeSavedSample() ?? Promise.resolve(null),
    applyDetectedRoot: () =>
      sampleProject?.applyDetectedRoot() ??
      Promise.reject(new GraphContractError('capture-unavailable', 'Rack Sample is not prepared')),
    analysisError: () => sampleProject?.analysisError() ?? null,
    cancelCapture: () => sampleProject?.cancelCapture(),
    configureCaptureWindow: (settings) =>
      sampleProject?.configureCaptureWindow(settings) ??
      Promise.reject(new GraphContractError('capture-unavailable', 'Rack Sample is not prepared')),
    selectCaptureSource: (id) =>
      sampleProject?.selectCaptureSource(id) ??
      Promise.reject(new GraphContractError('capture-unavailable', 'Rack Sample is not prepared')),
    captureSample: (windowSeconds) =>
      sampleProject?.captureSample(windowSeconds) ??
      Promise.reject(new GraphContractError('capture-unavailable', 'Rack Sample is not prepared')),
    async set(path, value) {
      if (path.startsWith(`${SAMPLE_BASE}/`)) {
        if (!sampleProject)
          throw new GraphContractError(
            'event-unavailable',
            'Rack Sample needs a prepared host event adapter',
          );
        return sampleProject.set(path, value);
      }
      if (path.startsWith(`${OSC_BASE}/`)) return setRackOscillatorControl(session, path, value);
      if (path === INPUT_MODE || path === B_MODE) return setSourceMode(path, value);
      if (path === INPUT_PITCH || path === B_PITCH) return setSourcePitch(path, value);
      if (path === SELECT) {
        const current = session.forkGraph();
        if (
          ![2, 3, 4, 5, 6].includes(value) &&
          !(value === 1 && current.findInstance(`${OSC_BASE}/nodes/output`))
        ) {
          throw new GraphContractError(
            'unported-module',
            'This Rack graph has no processor for that selection',
          );
        }
        if (value === 2 && !sampleProject) {
          throw new GraphContractError(
            'event-unavailable',
            'Rack Sample needs a host event adapter',
          );
        }
        const source = current.findInstance(
          value === 1
            ? `${OSC_BASE}/nodes/output`
            : value === 2
              ? `${SAMPLE_BASE}/nodes/output`
              : value === 3
                ? BLEND_OUTPUT
                : value === 4
                  ? FILTER
                  : value === 5
                    ? FX
                    : EQ,
        );
        return session.routeWithControl(
          { to: 3, input: 'in', from: source.id, output: 'out' },
          { path, value },
        );
      }
      if (path === `${BLEND_BASE}/mode`) {
        if (!Number.isInteger(value) || value < 0 || value > 3) {
          throw new GraphContractError('invalid-blend-mode', 'Blend mode must be 0–3');
        }
        const current = session.forkGraph();
        const branch = current.findInstance(BLEND_BRANCHES[value]);
        await session.parameter({
          nodeId: branch.id,
          id: 0,
          value: current.findControl(`${BLEND_BASE}/blendAmount`).value * 2 - 1,
        });
        return session.routeWithControl(
          {
            to: current.findInstance(BLEND_OUTPUT).id,
            input: 'audio',
            from: branch.id,
            output: 'out',
          },
          { path, value },
        );
      }
      if (path === `${BLEND_BASE}/blendAmount`) {
        const current = session.forkGraph();
        const branch = BLEND_BRANCHES[current.findControl(`${BLEND_BASE}/mode`).value];
        return session.parameterWithControl(
          {
            nodeId: current.findInstance(branch).id,
            id: 0,
            value: value * 2 - 1,
          },
          { path, value },
        );
      }
      if (path === `${BLEND_BASE}/blendModAmount`) {
        const current = session.forkGraph();
        const a = current.findInstance(RING_A_TO_B).id;
        const b = current.findInstance(RING_B_TO_A).id;
        const enabled = Number(value > 0.001);
        const edits = [
          { nodeId: a, id: 1, value },
          { nodeId: b, id: 1, value },
          ...[FM_A_TO_B, FM_B_TO_A, SYNC_A_TO_B, SYNC_B_TO_A].map((branch) => ({
            nodeId: current.findInstance(branch).id,
            id: 0,
            value,
          })),
          { nodeId: a, id: 4, value: enabled },
          { nodeId: b, id: 4, value: enabled },
        ];
        return session.parametersWithControl(edits, { path, value });
      }
      if (session.toProject().endpoints?.some((endpoint) => endpoint.path === path)) {
        return session.parameterPath(path, value);
      }
      throw new GraphContractError('unknown-control', `Unknown Rack module control: ${path}`);
    },
  });
}
