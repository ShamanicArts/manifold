import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureProjectDocument, captureProjectPreset, applyProjectPreset, parseProjectDocument } from '../web/src/state/project-document.js';
import { captureMainVoiceBankState, parseMainVoiceBankState } from '../web/src/state/main-voice-bank.js';
import { captureMainSampleBlendState, parseMainSampleBlendState } from '../web/src/state/main-sample-blend.js';

const cases = [
  { path: 'projects/main-voice-bank/project.json', capture: captureMainVoiceBankState,
    parse: parseMainVoiceBankState, controls: { active: false, mode: 0, waveform: 0,
      pulseWidth: .5, position: 0, morphAmount: 0, morphDepth: .7, morphCurve: 2,
      stretch: 0, tiltMode: 0, smooth: 0, contrast: 1, followPlayback: false, speed: 1 } },
  { path: 'projects/main-sample-blend/project.json', capture: captureMainSampleBlendState,
    parse: parseMainSampleBlendState, controls: { active: false, mode: 0, waveform: 0,
      pulseWidth: .5, position: 0, morphAmount: 0, morphDepth: .7, morphCurve: 2,
      stretch: 0, tiltMode: 0, smooth: 0, contrast: 1 } },
];

for (const { path, capture, parse, controls } of cases) {
  const project = JSON.parse(readFileSync(path, 'utf8'));
  const values = new Map(project.parameters.map((parameter) => [parameter.id, parameter.default]));
  const source = { sourceKind: 'builtin', sourceRate: 48_000, stereo: new Float32Array(4096 * 2) };
  const snapshot = capture(project, values, controls, source);
  const presetSnapshot = structuredClone(snapshot);
  const changedParameter = project.parameters.find((parameter) => parameter.kind === 'float');
  presetSnapshot.parameters[changedParameter.hostId] = changedParameter.default === changedParameter.min
    ? changedParameter.max : changedParameter.min;
  const preset = captureProjectPreset('warm-start', 'Warm start', presetSnapshot, project, parse);
  const bundle = captureProjectDocument(project, snapshot, [preset], parse);
  assert.equal(bundle.format, 'manifold.project');
  assert.equal(bundle.schemaVersion, 1);
  assert.equal(bundle.projectId, project.id);
  assert.deepEqual(bundle.signal, project.signal);
  assert.equal(bundle.presets.length, 1);
  assert.deepEqual(parseProjectDocument(JSON.parse(JSON.stringify(bundle)), project, parse),
    { bundled: true, state: parse(snapshot, project), presets: [preset] });
  assert.deepEqual(parseProjectDocument(snapshot, project, parse),
    { bundled: false, state: parse(snapshot, project), presets: [] });
  assert.deepEqual(applyProjectPreset(snapshot, preset, project, parse), parse(presetSnapshot, project));
  assert.deepEqual(parseProjectDocument({ ...bundle, presets: undefined }, project, parse).presets, []);

  const reordered = structuredClone(bundle);
  reordered.signal = Object.fromEntries(Object.entries(reordered.signal).reverse());
  assert.equal(parseProjectDocument(reordered, project, parse).bundled, true);
  const changedGraph = structuredClone(bundle);
  changedGraph.signal.nodes[0].type = 'unavailable-node';
  assert.throws(() => parseProjectDocument(changedGraph, project, parse), /graph/);
  assert.throws(() => parseProjectDocument({ ...bundle, projectId: 'other' }, project, parse), /graph/);
  assert.throws(() => parseProjectDocument({ ...bundle, schemaVersion: 2 }, project, parse), /graph/);
  assert.throws(() => parseProjectDocument({ ...bundle, format: 'other' }, project, parse), /graph/);
  assert.throws(() => parseProjectDocument({ ...bundle, snapshot: { ...snapshot, projectId: 'other' } }, project, parse), /different/);
  assert.throws(() => parseProjectDocument({ ...bundle, presets: [preset, preset] }, project, parse), /preset/);
  assert.throws(() => parseProjectDocument({ ...bundle, presets: Array.from({ length: 33 }, () => preset) }, project, parse), /limit/);
  assert.throws(() => parseProjectDocument({ ...bundle, presets: [{ ...preset, name: ' bad ' }] }, project, parse), /preset/);
  assert.throws(() => parseProjectDocument({ ...bundle, presets: [{ ...preset,
    parameters: { ...preset.parameters, [project.parameters[0].hostId]: 100000 } }] }, project, parse), /value/);
  assert.throws(() => captureProjectDocument(project, { ...snapshot, projectId: 'other' }), /match/);
}
console.log('Project document: Main bank and blend graph+snapshot+named preset round-trip, older state import, invalid graph and preset rejection passed');
