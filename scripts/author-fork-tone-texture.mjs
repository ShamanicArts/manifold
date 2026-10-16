// Run from any directory: node scripts/author-fork-tone-texture.mjs
import { readFileSync } from 'node:fs';
import { GraphWorkspace } from '../packages/manifold-author/index.js';

const source = JSON.parse(readFileSync(new URL('../projects/graph-workspace/tone-texture-inverted.json', import.meta.url)));
const graph = GraphWorkspace.fromProject(source);
const gain = graph.find(8);
const lfo = graph.find(9);
graph.disconnect(gain.input('cv'));
graph.connect(lfo.output('uni'), gain.input('cv'));
console.log(JSON.stringify(graph.toProject(), null, 2));
