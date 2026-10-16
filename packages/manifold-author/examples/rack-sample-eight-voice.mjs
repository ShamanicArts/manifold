// Historical Rack Sample topology: eight independently gated public voice chains.
// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import {
  gain as gainDefinition,
  mixer9 as mixer9Definition,
  phaseVocoder as phaseVocoderDefinition,
  sampleRegion as sampleRegionDefinition,
} from '@manifold/author/primitives';
import { createGraphWorkspace, createLiveGraphSession, GraphContractError } from '@manifold/author';
import { decodeSampleAsset } from '@manifold/author';
import { SAMPLE_BASE } from './sample-voice-chain.mjs';
export const VOICES = 8;
const voiceNode = (firstVoiceId, voice, stage) => firstVoiceId + (voice - 1) * 3 + stage;
const voicePath = (voice, control) => `${SAMPLE_BASE}/voice/${voice}/${control}`;
const ratio = (note, root) => Math.max(0.25, Math.min(2, 2 ** ((note - root) / 12)));
// Graph definition — construct inspectable primitives with stable identities.
export function buildGraph(stereo, sourceRate = 48000, label = 'Rack Sample source') {
  const graph = createGraphWorkspace();
  const output = addRackSampleModule(graph, { stereo, sourceRate, label });
  graph.connect(output.output('out'), graph.output.input('in'));
  return graph;
}
export function addRackSampleModule(
  graph,
  {
    firstVoiceId = 4,
    mixerId = 28,
    outputId = 29,
    stereo,
    sourceRate = 48000,
    label = 'Rack Sample source',
  } = {},
) {
  const mixer = graph.add(mixer9Definition.type, { id: mixerId });
  const output = graph.add(gainDefinition.type, { id: outputId });
  graph.registerInstance(`${SAMPLE_BASE}/nodes/mixer`, mixer);
  graph.registerInstance(`${SAMPLE_BASE}/nodes/output`, output);
  output.parameter('level').set(0.2);
  graph.connect(mixer.output('out'), output.input('audio'));
  let source;
  for (let voice = 1; voice <= VOICES; voice++) {
    const playback = graph.add(sampleRegionDefinition.type, {
      id: voiceNode(firstVoiceId, voice, 0),
    });
    const vocoder = graph.add(phaseVocoderDefinition.type, {
      id: voiceNode(firstVoiceId, voice, 1),
    });
    const gain = graph.add(gainDefinition.type, {
      id: voiceNode(firstVoiceId, voice, 2),
    });
    graph.registerInstance(`${SAMPLE_BASE}/nodes/voice_${voice}/playback`, playback);
    graph.registerInstance(`${SAMPLE_BASE}/nodes/voice_${voice}/vocoder`, vocoder);
    graph.registerInstance(`${SAMPLE_BASE}/nodes/voice_${voice}/gain`, gain);
    vocoder.parameter('fftOrder').set(11);
    playback.parameter('crossfade').set(0.1);
    gain.parameter('level').set(0);
    graph.connect(playback.output('out'), vocoder.input('audio'));
    graph.connect(vocoder.output('out'), gain.input('audio'));
    graph.connect(gain.output('out'), mixer.input(`in-${voice}`));
    if (voice === 1) {
      source = playback;
      if (stereo) graph.setSampleAsset(source, stereo, sourceRate, label);
    } else if (stereo) graph.bindSampleAsset(source, playback);
    graph.registerControl(voicePath(voice, 'gate'), {
      min: 0,
      max: 1,
      default: 0,
    });
    graph.registerControl(voicePath(voice, 'vOct'), {
      min: 0,
      max: 127,
      default: 60,
    });
  }
  for (const [name, range] of Object.entries({
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
    graph.registerControl(`${SAMPLE_BASE}/${name}`, range);
  return output;
}
// Host integration — the session publishes edits only after audio acceptance.
export function createProject(host, graph, sharedSession = null) {
  if (!graph || typeof host?.sendEvent !== 'function') {
    throw new TypeError('Provide a Sample graph and a host event adapter');
  }
  const firstVoiceId = graph.findInstance(`${SAMPLE_BASE}/nodes/voice_1/playback`)?.id;
  const outputId = graph.findInstance(`${SAMPLE_BASE}/nodes/output`)?.id;
  if (firstVoiceId === undefined || outputId === undefined) {
    throw new GraphContractError('unsupported-project', 'Missing authored Rack Sample instances');
  }
  const session =
    sharedSession ??
    createLiveGraphSession(
      graph,
      (route) => host.setRoute(route),
      (edit) => host.setParameter(edit),
      null,
      (edits) => host.setParameterBatch(edits),
    );
  const instance = (path) => {
    const id = session.toProject().instances.find((entry) => entry.path === path)?.nodeId;
    if (id === undefined)
      throw new GraphContractError('unsupported-project', `Missing authored instance: ${path}`);
    return id;
  };
  const voiceId = (voice, stage) =>
    instance(`${SAMPLE_BASE}/nodes/voice_${voice}/${['playback', 'vocoder', 'gain'][stage]}`);
  const sourceId = () => voiceId(1, 0);
  const state = () =>
    new Map(session.toProject().controls.map((entry) => [entry.path, entry.value]));
  const withControl = (path, value) => ({ path, value });
  const all = (stage, id, value) =>
    Array.from({ length: VOICES }, (_, index) => ({
      nodeId: voiceId(index + 1, stage),
      id,
      value,
    }));
  let armedCaptureId = null;
  let lastAnalysis = null;
  let analysisError = null;
  let analysisGeneration = 0;
  let analyzedAsset = null;
  const api = {
    configureCaptureWindow: async (settings) => {
      const saved = await session.configureCaptureWindow(settings);
      if (settings.captureWindowMode !== 'free' && armedCaptureId !== null) {
        host.cancelFreeCapture?.();
        armedCaptureId = null;
      }
      return saved;
    },
    selectCaptureSource: (id) => {
      if (armedCaptureId !== null) {
        throw new GraphContractError(
          'capture-armed',
          'Stop or cancel Free capture before switching source',
        );
      }
      return session.selectCaptureSource(id);
    },
    captureArmed: () => armedCaptureId !== null,
    latestAnalysis: () => lastAnalysis,
    analysisError: () => analysisError,
    async analyzeSavedSample() {
      const asset = session.toProject().assets?.find((entry) => entry.nodeId === sourceId());
      if (!asset) {
        lastAnalysis = null;
        analyzedAsset = null;
        return null;
      }
      if (lastAnalysis && analyzedAsset === asset.pcmF32Base64) return lastAnalysis;
      lastAnalysis = null;
      analyzedAsset = null;
      if (typeof host.analyzeSample !== 'function') return null;
      const generation = analysisGeneration;
      try {
        const { stereo, sourceRate } = decodeSampleAsset(asset);
        const result = await host.analyzeSample(stereo, sourceRate);
        const current = session.toProject().assets?.find((entry) => entry.nodeId === sourceId());
        if (generation === analysisGeneration && current?.pcmF32Base64 === asset.pcmF32Base64) {
          lastAnalysis = result;
          analyzedAsset = asset.pcmF32Base64;
          analysisError = null;
        }
      } catch (error) {
        if (generation === analysisGeneration) analysisError = error.message ?? String(error);
      }
      return lastAnalysis;
    },
    applyDetectedRoot() {
      const pitchHz = lastAnalysis?.pitchHz;
      const confidence = lastAnalysis?.confidence;
      if (
        !Number.isFinite(pitchHz) ||
        pitchHz <= 0 ||
        !Number.isFinite(confidence) ||
        confidence < 0.6
      ) {
        throw new GraphContractError('pitch-unavailable', 'Captured source has no reliable pitch');
      }
      const root = Math.round(69 + 12 * Math.log2(pitchHz / 440));
      if (root < 12 || root > 96) {
        throw new GraphContractError(
          'pitch-out-of-range',
          'Detected root is outside the Sample range',
        );
      }
      return api.set(`${SAMPLE_BASE}/rootNote`, root);
    },
    cancelCapture() {
      if (armedCaptureId !== null) host.cancelFreeCapture?.();
      armedCaptureId = null;
    },
    async captureSample(window = null) {
      if (typeof host.captureWindow !== 'function' || typeof host.replaceSample !== 'function') {
        throw new GraphContractError(
          'capture-unavailable',
          'Prepared host needs capture and Sample adapters',
        );
      }
      const signal = session.toProject().signal;
      const captureId = signal.selectedCaptureNodeId;
      const sourceName =
        signal.captureSources?.find((source) => source.id === signal.selectedCaptureSourceId)
          ?.name ?? 'Rack Sample source';
      if (
        window &&
        typeof window === 'object' &&
        Object.hasOwn(window, 'manualStartOffsetFrames') &&
        (signal.captureWindowMode !== 'free' || armedCaptureId !== null)
      ) {
        throw new GraphContractError(
          'invalid-free-capture',
          'Manual start offset needs Free mode with no capture armed',
        );
      }
      if (!Number.isInteger(captureId)) {
        throw new GraphContractError(
          'capture-unavailable',
          'Rack Sample has no selected capture source',
        );
      }
      if (window === null && signal.captureWindowMode === 'free' && armedCaptureId === null) {
        if (typeof host.armFreeCapture !== 'function') {
          throw new GraphContractError(
            'capture-unavailable',
            'Prepared host cannot arm free capture',
          );
        }
        await host.armFreeCapture(captureId);
        armedCaptureId = captureId;
        return session.toProject();
      }
      const timing =
        window ??
        (signal.captureWindowMode === 'bars'
          ? {
              windowBars: signal.captureWindowBars,
              tempoBpm: signal.captureTempoBpm,
              meterNumerator: signal.captureTimeSignatureNumerator ?? 4,
              meterDenominator: signal.captureTimeSignatureDenominator ?? 4,
            }
          : signal.captureWindowMode === 'free'
            ? { freeStop: true }
            : (signal.captureWindowSeconds ?? 1));
      const activeCaptureId = timing?.freeStop ? armedCaptureId : captureId;
      const { stereo, sourceRate } = await host.captureWindow(activeCaptureId, timing);
      if (timing?.freeStop) armedCaptureId = null;
      const saved = await session.sampleAsset(
        sourceId(),
        stereo,
        sourceRate,
        `${sourceName} · ${Math.round((stereo.length / 2 / sourceRate) * 1000)}ms`,
        (...args) => host.replaceSample(...args),
      );
      analysisGeneration++;
      const generation = analysisGeneration;
      const savedAsset =
        saved.assets?.find((entry) => entry.nodeId === sourceId())?.pcmF32Base64 ?? null;
      lastAnalysis = null;
      analyzedAsset = null;
      analysisError = null;
      if (typeof host.analyzeSample === 'function') {
        try {
          const result = await host.analyzeSample(stereo, sourceRate);
          const current = session.toProject().assets?.find((entry) => entry.nodeId === sourceId());
          if (generation === analysisGeneration && current?.pcmF32Base64 === savedAsset) {
            lastAnalysis = result;
            analyzedAsset = savedAsset;
          }
        } catch (error) {
          if (generation === analysisGeneration) analysisError = error.message ?? String(error);
        }
      }
      return saved;
    },
    async activate() {
      const values = state();
      for (let voice = 1; voice <= VOICES; voice++) {
        if (values.get(voicePath(voice, 'gate')) > 0.001) {
          await host.sendEvent({
            nodeId: voiceId(voice, 0),
            kind: 0,
            note: 60,
            velocity: 100,
          });
        }
      }
    },
    async set(path, value) {
      const values = state();
      if (!values.has(path) || !path.startsWith(`${SAMPLE_BASE}/`)) {
        throw new GraphContractError('unknown-control', `Unknown Rack Sample control: ${path}`);
      }
      const voiceMatch = path.match(/\/voice\/([1-8])\/(gate|vOct)$/);
      if (voiceMatch) {
        const voice = Number(voiceMatch[1]);
        if (voiceMatch[2] === 'gate') {
          const previous = values.get(path);
          const saved = await session.parameterWithControl(
            { nodeId: voiceId(voice, 2), id: 0, value },
            withControl(path, value),
          );
          if (value > 0.001 && previous <= 0.001) {
            await host.sendEvent({
              nodeId: voiceId(voice, 0),
              kind: 0,
              note: 60,
              velocity: 100,
            });
          } else if (value <= 0.001 && previous > 0.001) {
            await host.sendEvent({ nodeId: voiceId(voice, 0), kind: 2 });
          }
          return saved;
        }
        return session.parameterWithControl(
          {
            nodeId: voiceId(voice, 0),
            id: 0,
            value: ratio(value, values.get(`${SAMPLE_BASE}/rootNote`)),
          },
          withControl(path, value),
        );
      }
      const key = path.slice(SAMPLE_BASE.length + 1);
      if (key === 'rootNote')
        return session.parametersWithControl(
          Array.from({ length: VOICES }, (_, index) => ({
            nodeId: voiceId(index + 1, 0),
            id: 0,
            value: ratio(values.get(voicePath(index + 1, 'vOct')), value),
          })),
          withControl(path, value),
        );
      if (key === 'pitchMode')
        return session.parametersWithControl(
          [...all(1, 0, value === 2 ? 1 : 0), ...all(1, 3, value === 0 ? 0 : 1)],
          withControl(path, value),
        );
      if (key === 'pvocTimeStretch')
        return session.parametersWithControl(all(1, 2, value), withControl(path, value));
      if (key === 'crossfade')
        return session.parametersWithControl(all(0, 8, value), withControl(path, value));
      if (key === 'unison' || key === 'detune' || key === 'spread')
        return session.parametersWithControl(
          all(0, { unison: 9, detune: 10, spread: 11 }[key], value),
          withControl(path, value),
        );
      if (key === 'output')
        return session.parameterWithControl(
          {
            nodeId: instance(`${SAMPLE_BASE}/nodes/output`),
            id: 0,
            value: value * 0.25,
          },
          withControl(path, value),
        );
      if (['playStart', 'loopStart', 'loopLen'].includes(key)) {
        const start = key === 'loopStart' ? value : values.get(`${SAMPLE_BASE}/loopStart`);
        const length = key === 'loopLen' ? value : values.get(`${SAMPLE_BASE}/loopLen`);
        const end = Math.min(1, start + length);
        if (key === 'playStart')
          return session.parametersWithControl(
            all(0, 3, value > end ? start : value),
            withControl(path, value),
          );
        return session.parametersWithControl(
          [...all(0, 4, start), ...all(0, 5, end)],
          withControl(path, value),
        );
      }
      throw new GraphContractError('unknown-control', `Unsupported Rack Sample control: ${path}`);
    },
    adoptPublishedParameters: (edits) => session.adoptPublishedParameters(edits),
    toProject: () => session.toProject(),
    session,
  };
  return api;
}
