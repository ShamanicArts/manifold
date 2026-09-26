// Portable snapshot of the eight-voice Main bank: source, two prepared targets, and controls.
import { encodePcm, decodePcm } from './stereo-source.js';

const VERSION = 1;
const MAX_FRAMES = 48_000 * 30;
const MAX_LABEL = 200;
const MAX_F32 = 3.4028235e38;
const validNumber = (value, min, max) => typeof value === 'number'
  && Number.isFinite(value) && value >= min && value <= max;

function checkTarget(target, index) {
  if (!target || target.nodeId !== 2 || target.target !== index
    || !validNumber(target.fundamental, 1e-6, 24_000)
    || !Array.isArray(target.values) || target.values.length % 4
    || target.values.length > 128) throw new Error(`Invalid prepared target ${index}.`);
  for (let offset = 0; offset < target.values.length; offset += 4) {
    const [frequency, amplitude, phase, decay] = target.values.slice(offset, offset + 4);
    if (!validNumber(frequency, 0, 24_000) || !validNumber(amplitude, 0, MAX_F32)
      || !validNumber(phase, -MAX_F32, MAX_F32) || !validNumber(decay, 0, MAX_F32)) {
      throw new Error(`Invalid prepared target ${index}.`);
    }
  }
  return { nodeId: 2, target: index, fundamental: target.fundamental,
    values: [...target.values] };
}

function checkTargetControls(target) {
  if (!target || typeof target.active !== 'boolean'
    || !Number.isInteger(target.mode) || target.mode < 0 || target.mode > 3
    || !Number.isInteger(target.waveform) || target.waveform < 0 || target.waveform > 7
    || !Number.isInteger(target.tiltMode) || target.tiltMode < 0 || target.tiltMode > 2
    || !validNumber(target.position, 0, 1)
    || !validNumber(target.morphAmount, 0, 1)
    || !validNumber(target.stretch, 0, 1)
    || !validNumber(target.smooth, 0, 1)
    || !validNumber(target.contrast, 0, 2)) throw new Error('Invalid target controls.');
  return { active: target.active, mode: target.mode, waveform: target.waveform,
    tiltMode: target.tiltMode, position: target.position,
    morphAmount: target.morphAmount, stretch: target.stretch,
    smooth: target.smooth, contrast: target.contrast };
}

export function parseMainVoiceBankState(document, project) {
  if (document?.schemaVersion !== VERSION || document.projectId !== project.id) {
    throw new Error('This state belongs to a different Manifold v2 project.');
  }
  const parameters = document.parameters;
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)
    || Object.keys(parameters).length !== project.parameters.length) {
    throw new Error(`State needs ${project.parameters.length} parameter values.`);
  }
  const checkedParameters = {};
  for (const parameter of project.parameters) {
    const value = parameters[parameter.hostId];
    const valid = parameter.kind === 'toggle' ? value === 0 || value === 1
      : parameter.kind === 'select' || parameter.kind === 'choice'
        ? (parameter.choiceValues ?? parameter.choices.map((_, index) => index)).includes(value)
        : validNumber(value, parameter.min, parameter.max);
    if (!valid) throw new Error(`Invalid ${parameter.label} value.`);
    checkedParameters[parameter.hostId] = value;
  }
  if (!Array.isArray(document.targets) || document.targets.length !== 2) {
    throw new Error('State needs wave and source targets.');
  }
  const targets = document.targets.map(checkTarget);
  const targetControls = checkTargetControls(document.targetControls);
  const source = document.source;
  if (source?.kind === 'builtin') {
    return { schemaVersion: VERSION, projectId: project.id,
      parameters: checkedParameters, targetControls, targets, source: { kind: 'builtin' } };
  }
  if (source?.kind !== 'embedded' || !Number.isInteger(source.sourceRate)
    || source.sourceRate < 8_000 || source.sourceRate > 96_000
    || !Number.isInteger(source.frames) || source.frames < 256 || source.frames > MAX_FRAMES
    || source.frames > source.sourceRate * 30
    || typeof source.label !== 'string' || source.label.length > MAX_LABEL) {
    throw new Error('Invalid embedded audio source.');
  }
  const stereo = decodePcm(source.pcmF32Base64, source.frames);
  return { schemaVersion: VERSION, projectId: project.id,
    parameters: checkedParameters, targetControls, targets,
    source: { kind: 'embedded', sourceRate: source.sourceRate,
      frames: source.frames, label: source.label, stereo } };
}

export function captureMainVoiceBankState(project, values, targetControls, source) {
  if (!source?.stereo || source.stereo.length % 2
    || source.stereo.length < 512 || source.stereo.length > MAX_FRAMES * 2
    || !Number.isInteger(source.sourceRate) || source.sourceRate < 8_000
    || source.sourceRate > 96_000 || source.stereo.length / 2 > source.sourceRate * 30) {
    throw new Error('Choose a bounded source before saving.');
  }
  const builtin = source.sourceKind === 'builtin';
  const serializedSource = builtin ? { kind: 'builtin' } : {
    kind: 'embedded', sourceRate: source.sourceRate,
    frames: source.stereo.length / 2, label: source.label ?? 'Embedded audio',
    pcmF32Base64: encodePcm(source.stereo),
  };
  const document = { schemaVersion: VERSION, projectId: project.id,
    parameters: Object.fromEntries(project.parameters.map((parameter) =>
      [parameter.hostId, values.get(parameter.id)])),
    targetControls,
    targets: [project.partials, ...project.extraPartials], source: serializedSource };
  parseMainVoiceBankState(document, project);
  return document;
}
