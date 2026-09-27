import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { addNode, setConnection, setInitialParameter, setInputSource } from '../web/src/graph/topology.js';

const directory = resolve('web/public/reference/graph-workspace');
mkdirSync(directory, { recursive: true });
const seed = JSON.parse(readFileSync('projects/graph-workspace/project.json', 'utf8')).signal;
const texture = JSON.parse(readFileSync('projects/graph-workspace/tone-texture.json', 'utf8')).signal;
const noteVoice = JSON.parse(readFileSync('projects/graph-workspace/note-voice.json', 'utf8')).signal;
const sampleVoice = JSON.parse(readFileSync('projects/graph-workspace/sample-voice.json', 'utf8')).signal;
const regionVoice = JSON.parse(readFileSync('projects/graph-workspace/region-voice.json', 'utf8')).signal;
const granularSource = JSON.parse(readFileSync('projects/graph-workspace/granular-source.json', 'utf8')).signal;
const mainBundle = JSON.parse(readFileSync('projects/graph-workspace/main-bank.json', 'utf8'));
const granularCapture = setInputSource(setConnection(granularSource, 5, 0, 1), 'external');
let distorted = addNode(seed, 'distortion');
distorted = setConnection(distorted, 4, 0, 2);
distorted = setConnection(distorted, 3, 0, 4);
distorted = setInitialParameter(distorted, 4, 0, 9);
let cv = addNode(distorted, 'lfo');
cv = addNode(cv, 'modulated-gain');
cv = setConnection(cv, 6, 0, 4);
cv = setConnection(cv, 6, 1, 5);
cv = setConnection(cv, 3, 0, 6);

const input = Buffer.alloc(8192 * 2 * 4);
for (let frame = 0; frame < 8192; frame++) {
  const step = (frame % 64) - 32;
  input.writeFloatLE(step / 128, frame * 8);
  input.writeFloatLE(-step / 256, frame * 8 + 4);
}
writeFileSync(resolve(directory, 'input.f32'), input);
const sampleFrames = 24_000;
const sample = Buffer.alloc(sampleFrames * 2 * 4);
for (let frame = 0; frame < sampleFrames; frame++) {
  const time = frame / 48_000;
  const envelope = (1 - frame / sampleFrames) ** 2;
  const tone = envelope * (0.48 * Math.sin(2 * Math.PI * 220 * time)
    + 0.16 * Math.sin(2 * Math.PI * 440 * time));
  sample.writeFloatLE(tone, frame * 8);
  sample.writeFloatLE(tone * .85, frame * 8 + 4);
}
writeFileSync(resolve(directory, 'sample-source.f32'), sample);
const notes = [
  { frame: 16, kind: 0, channel: 15, note: 60, velocity: 100 },
  { frame: 2048, kind: 0, channel: 15, note: 64, velocity: 96 },
  { frame: 4096, kind: 1, channel: 15, note: 60, velocity: 0 },
  { frame: 6144, kind: 1, channel: 15, note: 64, velocity: 0 },
];
const cases = [
  { id: 'seed', label: 'Input → Gain', graph: seed },
  { id: 'distortion', label: 'Input → Gain → Distortion', graph: distorted },
  { id: 'cv', label: 'Input → Gain → Distortion → CV gain', graph: cv },
  { id: 'texture', label: 'Oscillator + noise → SVF → CV gain', graph: texture },
  { id: 'note-voice', label: 'MIDI → +7 transpose → voice → SVF', graph: noteVoice, events: notes },
  { id: 'sample-voice', label: 'MIDI → sample voice → SVF', graph: sampleVoice, events: notes,
    sampleNodeId: 5 },
  { id: 'region-voice', label: 'MIDI → retriggered sample region → SVF', graph: regionVoice, events: notes,
    sampleNodeId: 5 },
  { id: 'granular-source', label: 'Prepared source → granulator → SVF', graph: granularSource,
    sampleNodeId: 5 },
  { id: 'granular-capture', label: 'Live input → capture granulator → SVF', graph: granularCapture },
  { id: 'main-bank', label: 'MIDI → Main voice bank → SVF', graph: mainBundle.signal,
    events: notes, sampleNodeId: 5, targets: mainBundle.targets },
  { id: 'main-bank-add', label: 'MIDI → Main voice bank Add mode → SVF',
    graph: setInitialParameter(mainBundle.signal, 5, 6, 4), events: notes,
    sampleNodeId: 5, targets: mainBundle.targets },
];
for (const entry of cases) {
  entry.output = `${entry.id}.f32`;
  execFileSync('cargo', ['run', '--quiet', '-p', 'manifold-core', '--example',
    'render_graph_workspace', '--', entry.id, resolve(directory, entry.output)], { stdio: 'pipe' });
}
const manifest = {
  version: 1, reference: 'native Rust authored graph topology',
  sourceSha256: createHash('sha256').update(readFileSync('crates/manifold-core/examples/render_graph_workspace.rs')).digest('hex'),
  sampleRate: 48_000, channels: 2, frames: 8192, blockSize: 128, prepareFrames: 2048, stepFrame: 4096,
  input: 'input.f32', sample: 'sample-source.f32', sampleFrames, sampleSourceRate: 48_000, cases,
};
writeFileSync(resolve(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Graph workspace reference: ${cases.length} native Rust captures, 8192 stereo frames each`);
