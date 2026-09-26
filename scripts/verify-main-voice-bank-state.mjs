import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureMainVoiceBankState, parseMainVoiceBankState } from '../web/src/state/main-voice-bank.js';

const project = JSON.parse(readFileSync('projects/main-voice-bank/project.json', 'utf8'));
const values = new Map(project.parameters.map((parameter) => [parameter.id, parameter.default]));
for (const [id, value] of [[1, .37], [6, 5], [7, .75], [11, .012], [17, .6]]) values.set(id, value);
project.partials.values = [1, .9, 0, 0, 2, .3, .2, 0];
project.extraPartials[0].values = [1, .7, 0, 0, 3, .2, .4, .01];
const controls = { active: true, mode: 3, waveform: 1, position: .42,
  morphAmount: .67, stretch: .2, tiltMode: 2, smooth: .3, contrast: 1.2 };
const stereo = new Float32Array(4096 * 2);
for (let index = 0; index < stereo.length; index++) stereo[index] = Math.sin(index * .017) * .25;

const captured = captureMainVoiceBankState(project, values, controls,
  { sourceKind: 'embedded', sourceRate: 48_000, stereo, label: 'Chosen source' });
const parsed = parseMainVoiceBankState(JSON.parse(JSON.stringify(captured)), project);
assert.equal(parsed.schemaVersion, 1);
assert.equal(parsed.parameters['blend-mode'], 5);
assert.equal(parsed.parameters.depth, .75);
assert.deepEqual(parsed.targetControls, controls);
assert.deepEqual(parsed.targets, [project.partials, project.extraPartials[0]]);
assert.deepEqual(parsed.source.stereo, stereo);
const builtin = captureMainVoiceBankState(project, values, controls,
  { sourceKind: 'builtin', sourceRate: 48_000, stereo });
assert.deepEqual(parseMainVoiceBankState(builtin, project).source, { kind: 'builtin' });
assert.throws(() => parseMainVoiceBankState({ ...captured, projectId: 'other' }, project), /different/);
assert.throws(() => parseMainVoiceBankState({ ...captured,
  targets: [{ ...captured.targets[0], values: [1, -1, 0, 0] }, captured.targets[1]] }, project), /target 0/);
assert.throws(() => parseMainVoiceBankState({ ...captured,
  targets: [captured.targets[0], { ...captured.targets[1], target: 0 }] }, project), /target 1/);
assert.throws(() => parseMainVoiceBankState({ ...captured,
  parameters: { ...captured.parameters, 'blend-mode': 9 } }, project), /Blend mode/);
assert.throws(() => parseMainVoiceBankState({ ...captured,
  source: { ...captured.source, pcmF32Base64: 'bad' } }, project), /PCM/);
console.log('Main voice bank state: 19 controls, two prepared targets, embedded and built-in sources round-trip; malformed states rejected');
