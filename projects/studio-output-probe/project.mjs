import { createGraphWorkspace } from '@manifold/author';
import { gain } from '@manifold/author/primitives';
import { applyStudioGraph } from '@manifold/author/studio-graph';

// Audio flows left to right. Both visual nodes observe the output after gain.
const studioGraph = {
  nodes: [],
  connections: [],
  removed: [],
  layout: [
    { path: '/input.raw/1', x: 0, y: 80, space: 'world' },
    { path: '/probe/outputGain', x: 220, y: 80, space: 'world' },
    { path: '/output/3', x: 440, y: 80, space: 'world' },
  ],
};
const studioParameters = [];

export default function createProject() {
  const graph = createGraphWorkspace().setInputSource('external');
  const outputGain = graph.add(gain.type, { id: 4 });
  graph.registerInstance('/probe/outputGain', outputGain);
  outputGain.parameter('level').expose({
    path: '/probe/gain',
    label: 'Output gain',
    min: 0,
    max: 2,
    default: 0.5,
  });
  graph.connect(graph.input.output('out'), outputGain.input('audio'));
  graph.connect(outputGain.output('out'), graph.output.input('in'));
  applyStudioGraph(graph, studioGraph);
  for (const definition of studioParameters) {
    graph.findInstance(definition.instance).parameter(definition.parameter).expose(definition);
  }
  const view = [{ id: 'gain', type: 'parameter', path: '/probe/gain', label: 'Output gain' }];
  return { graph, view, editorGraph: studioGraph };
}
