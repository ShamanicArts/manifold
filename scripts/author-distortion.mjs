// Run from any directory: node scripts/author-distortion.mjs
import { createGraphWorkspace } from '../packages/manifold-author/index.js';

const graph = createGraphWorkspace();
const tone = graph.add('oscillator', { id: 4 });
const distortion = graph.add('distortion', { id: 5 });
graph.connect(tone.output('out'), distortion.input('audio'));
graph.connect(distortion.output('out'), graph.output.input('in'));
console.log(JSON.stringify(graph.toProject(), null, 2));
