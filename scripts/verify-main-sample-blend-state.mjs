import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureMainSampleBlendState, parseMainSampleBlendState } from '../web/src/state/main-sample-blend.js';

const project = JSON.parse(readFileSync('projects/main-sample-blend/project.json', 'utf8'));
const values = new Map(project.parameters.map((parameter) => [parameter.id, parameter.default]));
values.set(2, .3);
values.set(3, .7);
values.set(11, .8);
values.set(12, .25);
values.set(13, 330);
values.set(14, .4);
values.set(15, 3);
values.set(16, -.5);
const target = { active: true, mode: 3, waveform: 1, position: .47,
  morphAmount: .68, stretch: .2, tiltMode: 2, smooth: .6, contrast: 1.2 };
const stereo = new Float32Array(4096 * 2);
for (let frame = 0; frame < stereo.length / 2; frame++) {
  stereo[frame * 2] = .3 * Math.sin(frame * .03);
  stereo[frame * 2 + 1] = .2 * Math.cos(frame * .02);
}
const embedded = captureMainSampleBlendState(project, values, target,
  { sourceKind: 'embedded', sourceRate: 48_000, stereo, label: 'Chosen source' });
const restored = parseMainSampleBlendState(JSON.parse(JSON.stringify(embedded)), project);
assert.deepEqual(restored.parameters, Object.fromEntries(project.parameters.map((parameter) => [parameter.hostId, values.get(parameter.id)])));
assert.deepEqual(restored.target, target);
assert.deepEqual(restored.source.stereo, stereo);
const builtin = captureMainSampleBlendState(project, values, target,
  { sourceKind: 'builtin', sourceRate: 48_000, stereo, label: 'Built-in two-tone source' });
assert.deepEqual(parseMainSampleBlendState(builtin, project).source, { kind: 'builtin' });
const oldState = { ...builtin, schemaVersion: 1,
  parameters: Object.fromEntries(project.parameters.filter((parameter) => parameter.id < 6)
    .map((parameter) => [parameter.hostId, values.get(parameter.id)])) };
const migrated = parseMainSampleBlendState(oldState, project);
assert.equal(migrated.schemaVersion, 4);
assert.equal(migrated.parameters['pvoc-mix'], 0);
assert.equal(migrated.parameters['phrase-amount'], 0);
assert.equal(migrated.parameters['wave-level'], 0);
const v2State = { ...builtin, schemaVersion: 2,
  parameters: Object.fromEntries(project.parameters.filter((parameter) => parameter.id < 11)
    .map((parameter) => [parameter.hostId, values.get(parameter.id)])) };
const migratedV2 = parseMainSampleBlendState(v2State, project);
assert.equal(migratedV2.parameters['pvoc-mix'], values.get(9));
assert.equal(migratedV2.parameters['phrase-amount'], 0);
assert.equal(migratedV2.parameters['phrase-reference'], .18);
const v3State = { ...builtin, schemaVersion: 3,
  parameters: Object.fromEntries(project.parameters.filter((parameter) => parameter.id < 13)
    .map((parameter) => [parameter.hostId, values.get(parameter.id)])) };
const migratedV3 = parseMainSampleBlendState(v3State, project);
assert.equal(migratedV3.parameters['phrase-amount'], .8);
assert.equal(migratedV3.parameters['base-blend'], 1);
assert.equal(migratedV3.parameters['wave-level'], 0);
assert.throws(() => parseMainSampleBlendState({ ...embedded, projectId: 'other' }, project), /different/);
assert.throws(() => parseMainSampleBlendState({ ...embedded, target: { ...target, position: 3 } }, project), /target/);
assert.throws(() => parseMainSampleBlendState({ ...embedded, source: { ...embedded.source, frames: 10 } }, project), /source/);
assert.throws(() => parseMainSampleBlendState({ ...embedded, source: { ...embedded.source, pcmF32Base64: 'bad' } }, project), /PCM/);
console.log(`Main blend state: ${project.parameters.length} controls + target + ${stereo.length / 2} stereo frames round-trip; v1/v2/v3 migration and malformed states checked`);
