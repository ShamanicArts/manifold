import { encodePcm, decodePcm } from './stereo-source.js';
// Portable version-11 state for the authored Main sample blend study.
// User audio is embedded as bounded interleaved stereo float32 PCM.
const VERSION = 11;
const MAX_FRAMES = 48_000 * 30;
const MAX_LABEL = 200;

function validNumber(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

export function parseMainSampleBlendState(document, project) {
  const savedVersion = document?.schemaVersion;
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, VERSION].includes(savedVersion) || document?.projectId !== project.id) {
    throw new Error('This state belongs to a different Manifold v2 project.');
  }
  const parameters = document.parameters;
  const savedCount = savedVersion === 1 ? 6 : savedVersion === 2 ? 11 : savedVersion === 3 ? 13 : savedVersion === 4 ? 17 : savedVersion === 5 ? 18 : savedVersion === 6 ? 20 : savedVersion === 7 ? 21 : savedVersion === 8 ? 23 : savedVersion === 9 ? 24 : savedVersion === 10 ? 28 : project.parameters.length;
  const savedParameters = project.parameters.filter((parameter) => parameter.id < savedCount);
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)
    || Object.keys(parameters).length !== savedParameters.length) {
    throw new Error(`State needs ${savedParameters.length} parameter values.`);
  }
  const checkedParameters = {};
  for (const parameter of project.parameters) {
    const value = parameter.id >= savedCount ? parameter.default : parameters[parameter.hostId];
    const valid = parameter.kind === 'toggle' ? value === 0 || value === 1
      : parameter.kind === 'select' || parameter.kind === 'choice'
        ? (parameter.choiceValues ?? parameter.choices.map((_, index) => index)).includes(value)
        : validNumber(value, parameter.min, parameter.max);
    if (!valid) {
      throw new Error(`Invalid ${parameter.label} value.`);
    }
    checkedParameters[parameter.hostId] = value;
  }
  const target = document.target;
  if (!target || typeof target.active !== 'boolean'
    || !Number.isInteger(target.mode) || target.mode < 0 || target.mode > 3
    || !Number.isInteger(target.waveform) || target.waveform < 0 || target.waveform > 7
    || !Number.isInteger(target.tiltMode) || target.tiltMode < 0 || target.tiltMode > 2
    || !validNumber(target.position, 0, 1)
    || !validNumber(target.morphAmount, 0, 1)
    || (target.pulseWidth !== undefined && !validNumber(target.pulseWidth, .01, .99))
    || (target.morphDepth !== undefined && !validNumber(target.morphDepth, 0, 1))
    || (target.morphCurve !== undefined && (!Number.isInteger(target.morphCurve)
      || target.morphCurve < 0 || target.morphCurve > 2))
    || !validNumber(target.stretch, 0, 1)
    || !validNumber(target.smooth, 0, 1)
    || !validNumber(target.contrast, 0, 2)) {
    throw new Error('Invalid prepared target controls.');
  }
  const normalizedTarget = { ...target, pulseWidth: target.pulseWidth ?? .5,
    morphDepth: target.morphDepth ?? .7, morphCurve: target.morphCurve ?? 2 };
  const source = document.source;
  if (source?.kind === 'builtin') {
    return { schemaVersion: VERSION, projectId: project.id, parameters: checkedParameters,
      target: normalizedTarget, source: { kind: 'builtin' } };
  }
  if (source?.kind !== 'embedded' || !Number.isInteger(source.sourceRate)
    || source.sourceRate < 8_000 || source.sourceRate > 96_000
    || !Number.isInteger(source.frames) || source.frames < 256 || source.frames > MAX_FRAMES
    || source.frames > source.sourceRate * 30
    || typeof source.label !== 'string' || source.label.length > MAX_LABEL) {
    throw new Error('Invalid embedded audio source.');
  }
  const stereo = decodePcm(source.pcmF32Base64, source.frames);
  return { schemaVersion: VERSION, projectId: project.id, parameters: checkedParameters,
    target: normalizedTarget, source: { kind: 'embedded', sourceRate: source.sourceRate,
      frames: source.frames, label: source.label, stereo } };
}

export function captureMainSampleBlendState(project, values, target, source) {
  if (!source?.stereo || source.stereo.length % 2 !== 0) throw new Error('Choose a source before saving.');
  const builtin = source.sourceKind === 'builtin';
  const serializedSource = builtin ? { kind: 'builtin' } : {
    kind: 'embedded', sourceRate: source.sourceRate, frames: source.stereo.length / 2,
    label: source.label ?? 'Embedded audio', pcmF32Base64: encodePcm(source.stereo),
  };
  const document = { schemaVersion: VERSION, projectId: project.id,
    parameters: Object.fromEntries(project.parameters.map((parameter) => [parameter.hostId, values.get(parameter.id)])),
    target, source: serializedSource };
  // The same validation applies to newly captured and opened states.
  parseMainSampleBlendState(document, project);
  return document;
}
