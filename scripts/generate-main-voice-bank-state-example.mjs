import { readFileSync, writeFileSync } from 'node:fs';
import { captureMainVoiceBankState } from '../web/src/state/main-voice-bank.js';

const project = JSON.parse(readFileSync('projects/main-voice-bank/project.json', 'utf8'));
const values = new Map(project.parameters.map((parameter) => [parameter.id, parameter.default]));
values.set(1, .25);
values.set(6, 5);
values.set(7, .65);
const rate = 48_000;
const frames = 24_000;
const stereo = new Float32Array(frames * 2);
const targetControls = { active: false, mode: 3, waveform: 1, position: .5,
  morphAmount: .5, stretch: 0, tiltMode: 0, smooth: 0, contrast: .5,
  followPlayback: false, speed: 1 };
const state = captureMainVoiceBankState(project, values, targetControls,
  { sourceKind: 'builtin', sourceRate: rate, stereo });
const output = process.argv[2] ?? 'web/public/reference/main-voice-bank/state-example.json';
writeFileSync(output, `${JSON.stringify(state, null, 2)}\n`);
console.log(`Wrote Main bank state example: ${output}`);
