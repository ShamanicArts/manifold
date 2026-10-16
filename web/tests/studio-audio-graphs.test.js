import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveProjectRuntime } from '@manifold/author/live-project';
import { source } from '@manifold/author/examples/standalone-filter';

async function chain(host = null) {
  const r = new LiveProjectRuntime(host, source);
  await r.request({ operation: 'graph.add', type: 'gain', id: 5, path: '/plugin/level' });
  await r.request({
    operation: 'parameter.expose',
    definition: {
      instance: '/plugin/level',
      parameter: 'level',
      path: '/plugin/level/value',
      label: 'Output level',
      min: 0,
      max: 2,
      default: 0.6,
    },
  });
  await r.request({
    operation: 'graph.connect',
    from: '/plugin/filter',
    output: 'out',
    to: '/plugin/level',
    input: 'audio',
  });
  await r.request({
    operation: 'graph.connect',
    from: '/plugin/level',
    output: 'out',
    to: '@output',
    input: 'in',
  });
  return r;
}
const groups = (r) => r.snapshot().audioNodes.filter((n) => n.implementationKind === 'composition');
const parameter = (r, id, name) =>
  r
    .snapshot()
    .audioNodes.find((n) => n.id === id)
    .parameters.find((p) => p.name === name);

test('wrapping and nesting retain the accepted DSP graph, IDs, controls and host bindings', async () => {
  const calls = [];
  const r = await chain({
    ready: true,
    setParameter: async () => true,
    replaceGraph: async () => {
      calls.push('dsp');
      return true;
    },
    updateMetadata: async () => {
      calls.push('metadata');
      return true;
    },
  });
  await r.request({ operation: 'parameter.set', path: '/plugin/level/value', value: 0.3 });
  const before = r.project;
  calls.length = 0;
  await r.request({
    operation: 'graph.wrap',
    ids: [4, 5],
    definitionId: 'color',
    label: 'Color stage',
  });
  assert.deepEqual(r.project, before);
  assert.deepEqual(calls, ['metadata']);
  const root = groups(r)[0];
  assert.equal(r.snapshot().audioNodes.find((n) => n.id === 4).scope, root.instance);
  await r.request({
    operation: 'graph.wrap',
    ids: [4],
    definitionId: 'filter',
    label: 'Filter stage',
  });
  assert.deepEqual(r.project, before);
  assert.equal(groups(r).length, 2);
  assert.equal(parameter(r, 4, 'cutoff').path, '/plugin/params/cutoff');
  assert.deepEqual(calls, ['metadata', 'metadata']);
  const saved = r.save(),
    recalled = new LiveProjectRuntime(null, saved.source, saved);
  assert.deepEqual(recalled.project, r.project);
  assert.deepEqual(recalled.snapshot().audioNodes, r.snapshot().audioNodes);
});

test('instances have independent controls and shared rewiring, including disconnected boundaries', async () => {
  const r = await chain();
  await r.request({
    operation: 'graph.wrap',
    ids: [4, 5],
    definitionId: 'color',
    label: 'Color stage',
  });
  await r.request({
    operation: 'graph.wrap',
    ids: [4],
    definitionId: 'filter',
    label: 'Filter stage',
  });
  await r.request({
    operation: 'graph.addInstance',
    definitionId: 'color',
    path: '/audio/color/second',
  });
  const roots = groups(r).filter((n) => !n.scope),
    first = roots[0],
    second = roots[1];
  const secondGain = r
    .snapshot()
    .audioNodes.find((n) => n.type === 'gain' && n.scope === second.instance);
  assert.equal(r.snapshot().nodeSources[secondGain.id][0].path, '/audio-graphs.json');
  assert.equal(r.snapshot().nodeSources[5][0].path, '/project.mjs');
  await r.request({
    operation: 'parameter.set',
    path: parameter(r, secondGain.id, 'level').path,
    value: 0.2,
  });
  assert.equal(parameter(r, 5, 'level').default, 0.6);
  assert.equal(parameter(r, secondGain.id, 'level').default, 0.2);
  await r.request({
    operation: 'graph.connect',
    from: first.instance,
    output: first.outputs[0].name,
    to: second.instance,
    input: second.inputs[0].name,
  });
  await r.request({
    operation: 'graph.connect',
    from: second.instance,
    output: second.outputs[0].name,
    to: '@output',
    input: 'in',
  });
  assert.equal(r.project.signal.connections.find((e) => e.to === 3).from, secondGain.id);
  const child = groups(r).find((n) => n.scope === first.instance);
  const old = r.project.signal.connections.filter((e) => e.to === 5 || e.to === secondGain.id);
  assert.equal(old.length, 2);
  await r.request({ operation: 'graph.disconnect', to: '/plugin/level', input: 'audio' });
  assert.equal(
    r.project.signal.connections.some((e) => e.to === 5 || e.to === secondGain.id),
    false,
  );
  await r.request({ operation: 'project.undo' });
  assert.deepEqual(
    r.project.signal.connections.filter((e) => e.to === 5 || e.to === secondGain.id),
    old,
  );
  await r.request({
    operation: 'graph.disconnect',
    to: child.instance + '/@outputs',
    input: child.outputs[0].name,
  });
  assert.equal(
    r.project.signal.connections.some((e) => e.to === 5 || e.to === secondGain.id),
    false,
  );
  await r.request({ operation: 'project.undo' });
  const saved = r.save();
  assert.deepEqual(new LiveProjectRuntime(null, saved.source, saved).project, r.project);
});

test('failed recursive, cyclic, mismatched and cross-boundary edits are atomic', async () => {
  const r = await chain();
  await r.request({ operation: 'graph.wrap', ids: [4, 5], definitionId: 'color', label: 'Color' });
  const before = r.save(),
    root = groups(r)[0];
  await assert.rejects(
    r.request({
      operation: 'graph.connect',
      from: '/plugin/level',
      output: 'out',
      to: '/plugin/filter',
      input: 'audio',
    }),
    /cycle/,
  );
  assert.deepEqual(r.save(), before);
  await assert.rejects(
    r.request({
      operation: 'graph.connect',
      from: '@input',
      output: 'out',
      to: '/plugin/level',
      input: 'audio',
    }),
    /interface/,
  );
  assert.deepEqual(r.save(), before);
  await assert.rejects(
    r.request({ operation: 'graph.position', path: root.instance, x: 12, y: 2 }),
    /position/,
  );
  await assert.rejects(
    r.request({
      operation: 'graph.position',
      path: root.instance,
      x: 0.2,
      y: 0.2,
      space: 'unknown',
    }),
    /position/,
  );
  await assert.rejects(
    r.request({
      operation: 'graph.addInstance',
      definitionId: root.type,
      label: { text: 'invalid' },
    }),
    /instances/,
  );
  assert.deepEqual(r.save(), before);
  const file = await r.request({ operation: 'file.read', path: '/audio-graphs.json' }),
    data = JSON.parse(file.content);
  data.definitions[0].nodes.push({ key: 'recursive', definition: 'color' });
  await assert.rejects(
    r.request({ operation: 'file.write', ...file, content: JSON.stringify(data) }),
    /Recursive/,
  );
  assert.deepEqual(r.save(), before);
  await assert.rejects(
    r.request({ operation: 'graph.addInstance', definitionId: root.type, expectedRevision: 0 }),
    /revision/i,
  );
  assert.deepEqual(r.save(), before);
});

test('shared inner structure can grow and shrink without changing its other node IDs', async () => {
  const r = await chain();
  await r.request({ operation: 'graph.wrap', ids: [4, 5], definitionId: 'color', label: 'Color' });
  await r.request({ operation: 'graph.addInstance', definitionId: 'color' });
  const before = r.project.signal.nodes;
  await r.request({ operation: 'graph.add', scope: 'color', type: 'stereo-widener' });
  const added = r.snapshot().audioNodes.filter((n) => n.type === 'stereo-widener');
  assert.equal(added.length, 2);
  const first = groups(r).find((n) => !n.scope);
  const inside = added.find((n) => n.scope === first.instance);
  await r.request({
    operation: 'graph.connect',
    from: '/plugin/level',
    output: 'out',
    to: inside.instance,
    input: 'audio',
  });
  await r.request({
    operation: 'graph.connect',
    from: inside.instance,
    output: 'out',
    to: first.instance + '/@outputs',
    input: first.outputs[0].name,
  });
  assert.equal(r.project.signal.connections.find((e) => e.to === 3).from, inside.id);
  await r.request({
    operation: 'graph.connect',
    from: '/plugin/level',
    output: 'out',
    to: first.instance + '/@outputs',
    input: first.outputs[0].name,
  });
  await r.request({ operation: 'graph.remove', id: inside.id });
  assert.deepEqual(r.project.signal.nodes, before);
  await r.request({ operation: 'graph.remove', id: groups(r).filter((n) => !n.scope)[1].id });
  assert.equal(groups(r).length, 1);
});

test('wrapping keeps script-local control state when only the hierarchy changes', async () => {
  const text = `import {createGraphWorkspace} from '@manifold/author';
import {applyStudioGraph} from '@manifold/author/studio-graph';
const studioGraph={nodes:[],connections:[],removed:[],layout:[]};
export default function(){
  let count=0;const graph=createGraphWorkspace();
  const gain=graph.add('gain',{id:4});graph.registerInstance('/gain',gain);
  gain.parameter('level').expose({path:'/level',min:0,max:2,default:0.8});
  graph.registerControl('/step',{min:0,max:1,default:0});
  graph.connect(graph.input.output('out'),gain.input('audio'));graph.connect(gain.output('out'),graph.output.input('in'));
  applyStudioGraph(graph,studioGraph);
  return {graph,editorGraph:studioGraph,view:[],onControl(session,path,value){session.parameterWithControl({nodeId:4,id:0,value:++count/10},{path,value});}};}`;
  const r = new LiveProjectRuntime(null, text);
  await r.request({ operation: 'control.set', path: '/step', value: 1 });
  await r.request({ operation: 'graph.wrap', ids: [4], label: 'Level' });
  await r.request({ operation: 'control.set', path: '/step', value: 0 });
  assert.equal(r.project.signal.initialParameters.find((p) => p.nodeId === 4).value, 0.2);
});

test('constructor settings survive extraction and new instances', async () => {
  const text = `import {createGraphWorkspace} from '@manifold/author';
import {applyStudioGraph} from '@manifold/author/studio-graph';
const studioGraph={nodes:[],connections:[],removed:[],layout:[]};
export default function(){const graph=createGraphWorkspace();const node=graph.add('fixed-gain',{id:4,config:{gain:0.35}});graph.registerInstance('/fixed',node);graph.connect(graph.input.output('out'),node.input('audio'));graph.connect(node.output('out'),graph.output.input('in'));applyStudioGraph(graph,studioGraph);return {graph,editorGraph:studioGraph,view:[]};}`;
  const r = new LiveProjectRuntime(null, text),
    before = r.project;
  await r.request({
    operation: 'graph.wrap',
    ids: [4],
    definitionId: 'attenuator',
    label: 'Attenuator',
  });
  assert.deepEqual(r.project, before);
  await r.request({ operation: 'graph.addInstance', definitionId: 'attenuator' });
  assert.deepEqual(
    r.project.signal.nodes.filter((n) => n.type === 'fixed-gain').map((n) => n.a),
    [0.35, 0.35],
  );
});

test('configured mixer boundaries and cloned values follow the existing graph contract', async () => {
  const text = `import {createGraphWorkspace} from '@manifold/author';
import {applyStudioGraph} from '@manifold/author/studio-graph';
const studioGraph={nodes:[],connections:[],removed:[],layout:[]};
export default function(){const graph=createGraphWorkspace();const mixer=graph.add('mixer',{id:4,config:{inputs:2}});graph.registerInstance('/mix',mixer);graph.connect(graph.input.output('out'),mixer.input('in-1'));graph.connect(mixer.output('out'),graph.output.input('in'));applyStudioGraph(graph,studioGraph);return {graph,editorGraph:studioGraph,view:[]};}`;
  const r = new LiveProjectRuntime(null, text),
    before = r.project;
  await r.request({ operation: 'graph.wrap', ids: [4], definitionId: 'mix', label: 'Mix' });
  assert.deepEqual(r.project, before);
  assert.equal(groups(r)[0].inputs.length, 2);
  await r.request({ operation: 'graph.addInstance', definitionId: 'mix' });
  const mixers = r.snapshot().audioNodes.filter((n) => n.type === 'mixer');
  assert.equal(mixers.length, 2);
  for (const mixer of mixers) {
    assert.equal(mixer.inputs.length, 2);
    assert.equal(mixer.parameters.length, 5);
  }
});
