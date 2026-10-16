import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildGraph } from '../packages/manifold-author/examples/rack-sample-eight-voice.mjs';
import { decodeSampleAsset } from '../packages/manifold-author/sample-assets.js';

const source = JSON.parse(readFileSync(new URL(
  '../projects/graph-workspace/authored-sample-voice-chain.json', import.meta.url)));
const { stereo, sourceRate } = decodeSampleAsset(source.assets[0]);
const project = buildGraph(stereo, sourceRate, 'Rack Sample eight voice source').toProject();
writeFileSync(fileURLToPath(new URL(
  '../projects/graph-workspace/authored-rack-sample-eight-voice.json', import.meta.url)),
`${JSON.stringify(project, null, 2)}\n`);
