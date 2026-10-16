import test from 'node:test';
import assert from 'node:assert/strict';
import { GraphWorkspace, listPrimitives } from '../../packages/manifold-author/index.js';
import { applyAudioGraphs, audioGraphPresentation } from '../../packages/manifold-author/audio-graphs.js';

const ids = [65536, 0x1000000, 0xfffffffe];
test('full-width node identities roundtrip without aliasing parameter targets', () => {
  const graph = new GraphWorkspace();
  let previous = graph.find(1);
  for (const id of ids) {
    const level = graph.add('gain', { id });
    graph.registerInstance(`/level-${id}`, level);
    level.parameter('level').set(1);
    graph.connect(previous.output('out'), level.input('audio'));
    previous = level;
  }
  graph.connect(previous.output('out'), graph.find(3).input('in'));
  const project = graph.toProject();
  const reopened = GraphWorkspace.fromProject(project);
  for (const id of ids) assert.equal(reopened.findInstance(`/level-${id}`).id, id);
  assert.deepEqual(reopened.toProject(), project);
});

test('reusable graphs resolve historical hash collisions and keep identities on reopen', () => {
  const composition = {version: 1,
    definitions: [{id: 'level', label: 'Level', nodes: [{key: 'level', type: 'gain'}],
      connections: [], inputs: [{name: 'audio', node: 'level', port: 'audio'}],
      outputs: [{name: 'audio', node: 'level', port: 'out'}], parameters: []}],
    instances: [{path: '/voice-11', definition: 'level'}, {path: '/voice-112', definition: 'level'}]};
  const graph = new GraphWorkspace();
  applyAudioGraphs(graph, composition);
  const first = graph.findInstance('/voice-11/level').id;
  const second = graph.findInstance('/voice-112/level').id;
  assert.notEqual(first, second);
  graph.connect(graph.find(1).output('out'), graph.find(3).input('in'));
  const project = GraphWorkspace.fromProject(graph.toProject()).toProject();
  const view = audioGraphPresentation(composition, project, Object.fromEntries(listPrimitives().map(p => [p.type, p])));
  assert.equal(view.audioNodes.find(n => n.instance === '/voice-11/level').id, first);
  assert.equal(view.audioNodes.find(n => n.instance === '/voice-112/level').id, second);
  assert.equal(new Set(view.audioNodes.map(n => n.id)).size, view.audioNodes.length);
});
