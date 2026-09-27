import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { addNode, setConnection, setInitialParameter } from '../web/src/graph/topology.js';

const directory = resolve('web/public/reference/graph-workspace');
mkdirSync(directory, { recursive: true });
const seed = JSON.parse(readFileSync('projects/graph-workspace/project.json', 'utf8')).signal;
const texture = JSON.parse(readFileSync('projects/graph-workspace/tone-texture.json', 'utf8')).signal;
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
const cases = [
  { id: 'seed', label: 'Input → Gain', graph: seed },
  { id: 'distortion', label: 'Input → Gain → Distortion', graph: distorted },
  { id: 'cv', label: 'Input → Gain → Distortion → CV gain', graph: cv },
  { id: 'texture', label: 'Oscillator + noise → SVF → CV gain', graph: texture },
];
for (const entry of cases) {
  entry.output = `${entry.id}.f32`;
  execFileSync('cargo', ['run', '--quiet', '-p', 'manifold-core', '--example',
    'render_graph_workspace', '--', entry.id, resolve(directory, entry.output)], { stdio: 'pipe' });
}
const manifest = {
  version: 1, reference: 'native Rust authored graph topology',
  sourceSha256: createHash('sha256').update(readFileSync('crates/manifold-core/examples/render_graph_workspace.rs')).digest('hex'),
  sampleRate: 48_000, channels: 2, frames: 8192, blockSize: 128, stepFrame: 4096,
  input: 'input.f32', cases,
};
writeFileSync(resolve(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Graph workspace reference: ${cases.length} native Rust captures, 8192 stereo frames each`);
