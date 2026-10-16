import { writeFileSync } from 'node:fs';
import { buildGraph } from '../packages/manifold-author/examples/sample-voice-chain.mjs';

const frames = 4800;
const stereo = new Float32Array(frames * 2);
for (let frame = 0; frame < frames; frame++) {
  const envelope = Math.min(1, frame / 160, (frames - frame - 1) / 160);
  const sample = Math.sin(2 * Math.PI * 220 * frame / 48_000) * 0.6 * envelope;
  stereo[frame * 2] = sample;
  stereo[frame * 2 + 1] = sample;
}
const graph = buildGraph(stereo, 48_000, 'Authored 220 Hz sample');
const destination = new URL('../projects/graph-workspace/authored-sample-voice-chain.json', import.meta.url);
writeFileSync(destination, `${JSON.stringify(graph.toProject(), null, 2)}\n`);
