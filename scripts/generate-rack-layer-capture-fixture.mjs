// Reproducible portable graph with four distinct stand-in layer outputs.
// A Main port can replace these gain branches with authored looper outputs.
import { readFileSync, writeFileSync } from 'node:fs';
import { GraphWorkspace } from '../packages/manifold-author/index.js';
import { attachRackSampleLayerSource } from '../packages/manifold-author/examples/rack-module-host.mjs';

const base = JSON.parse(readFileSync(new URL(
  '../projects/graph-workspace/authored-rack-module-host-sample.json', import.meta.url)));
const graph = GraphWorkspace.fromProject(base);
const outputs = [];
for (let layer = 1; layer <= 4; layer++) {
  const source = graph.add('gain', { id: 69 + layer });
  graph.registerInstance(`/rack_host/layers/${layer}/test_output`, source);
  graph.setParameter(source, 0, layer / 4);
  graph.connect(graph.input.output('out'), source.input('audio'));
  outputs.push(source.output('out'));
}
outputs.forEach((output, index) => attachRackSampleLayerSource(graph, index + 1, output));
graph.selectCaptureSource(5);
const output = new URL('../projects/graph-workspace/authored-rack-sample-layer-capture.json', import.meta.url);
writeFileSync(output, `${JSON.stringify(graph.toProject(), null, 2)}\n`);
