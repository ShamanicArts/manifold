// Four public Loop Capture layers connected to Rack Sample capture sources.
import { readFileSync, writeFileSync } from 'node:fs';
import { GraphWorkspace } from '../packages/manifold-author/index.js';
import { addFourLayerLoopSources } from '../packages/manifold-author/examples/four-layer-loops.mjs';

const base = JSON.parse(readFileSync(new URL(
  '../projects/graph-workspace/authored-rack-module-host-sample.json', import.meta.url)));
const graph = GraphWorkspace.fromProject(base);
addFourLayerLoopSources(graph);
graph.selectCaptureSource(2);
writeFileSync(new URL('../projects/graph-workspace/authored-rack-four-layer-loops.json', import.meta.url),
  `${JSON.stringify(graph.toProject(), null, 2)}\n`);
