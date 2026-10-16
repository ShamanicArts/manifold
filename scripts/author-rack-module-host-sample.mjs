import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildRackModuleHostGraph } from '../packages/manifold-author/examples/rack-module-host.mjs';
import { decodeSampleAsset } from '../packages/manifold-author/sample-assets.js';

const source = JSON.parse(readFileSync(new URL(
  '../projects/graph-workspace/authored-sample-voice-chain.json', import.meta.url)));
const { stereo, sourceRate } = decodeSampleAsset(source.assets[0]);
const graph = buildRackModuleHostGraph({ selection: 2,
  sampleSource: { stereo, sourceRate, label: 'RackModuleHost Sample source' } });
writeFileSync(fileURLToPath(new URL(
  '../projects/graph-workspace/authored-rack-module-host-sample.json', import.meta.url)),
`${JSON.stringify(graph.toProject(), null, 2)}\n`);
