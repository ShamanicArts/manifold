import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LiveProjectRuntime, evaluateProjectSource } from '@manifold/author/live-project';
import { programs } from '@manifold/author/examples/primitive-library';
import { source as filter } from '@manifold/author/examples/standalone-filter';
import { source as oscillator } from '@manifold/author/examples/standalone-oscillator';
import { source as main } from '@manifold/author/examples/main-wave-creator';
import { parameterValue } from '@manifold/author';
import * as manifold from '@manifold/author';

const previous = JSON.parse(await readFile(new URL('./fixtures/creative-examples-before.json', import.meta.url)));
const current = [...programs, { id: 'standalone-filter', source: filter },
  { id: 'standalone-oscillator', source: oscillator }, { id: 'main-wave', source: main }];

test('the public namespace works in ordinary modules and shared live source', () => {
  assert.equal(manifold.gain.type, 'gain');
  assert.equal(typeof manifold.defineNetwork, 'function');
  const source = `import * as manifold from '@manifold/author';
export default function createProject() {
  const graph = manifold.createGraphWorkspace();
  const level = graph.add(manifold.gain.type, {id:4});
  graph.connect(graph.input.output('out'),level.input('audio'));
  graph.connect(level.output('out'),graph.output.input('in'));
  const network = manifold.defineNetwork({udp:'127.0.0.1:0'});
  network.onEvent(() => null);
  return {graph, network};
}`;
  assert.equal(evaluateProjectSource(source).project.signal.nodes.find(n => n.id === 4).type, 'gain');
});

test('every displayed sketch declares explicit imports, with the public Device form supported', () => {
  for (const {id, source} of current) {
    assert.match(source, /^import /m, id);
    if (/from 'manifold'/.test(source)) {
      assert.doesNotMatch(source, /from '@manifold\/author'/, id);
      assert.match(source, /^export default effect;/m, id);
    } else {
      assert.ok(source.includes("Alternative: import * as manifold from '@manifold/author'"), id);
      assert.match(source, /^export default function createProject/m, id);
    }
  }
});

test('all cleaned sketches retain the actual previously delivered graphs, views and edited targets', async () => {
  assert.ok(current.length >= previous.length);
  for (const oldSketch of previous) {
    const sketch = current.find(p => p.id === oldSketch.id);
    assert.ok(sketch, oldSketch.id);
    const old = previous.find(p => p.id === sketch.id);
    const evaluated = evaluateProjectSource(sketch.source);
    const expected = structuredClone(old.project);
    // Gain's public range was deliberately expanded after this historical
    // snapshot. Keep the snapshot intact and admit only that contract change.
    if (sketch.id === 'gain') {
      assert.equal(expected.endpoints[0].max, 2);
      expected.endpoints[0].max = 8;
    }
    // Reservations add persistent host identity without changing this historical audio contract.
    const {hostAssignments: _reservations, ...audioContract} = evaluated.project;
    assert.deepEqual(audioContract, expected, sketch.id + ' graph');
    if (sketch.id !== 'fixed-gain') assert.deepEqual(evaluated.view, old.view, sketch.id + ' view');
    const runtime = new LiveProjectRuntime(null, old.source);
    const endpoint = old.project.endpoints?.find(p => p.min < p.max);
    if (endpoint) {
      await runtime.request({ operation: 'parameter.set', path: endpoint.path,
        value: endpoint.default === endpoint.max ? endpoint.min : endpoint.max });
    }
    const saved = runtime.save();
    await runtime.request({ operation: 'source.apply', source: sketch.source });
    const expectedLive = structuredClone(saved.graph);
    if (sketch.id === 'gain') expectedLive.endpoints[0].max = 8;
    assert.deepEqual(runtime.project, expectedLive, sketch.id + ' live edit');
    if (endpoint) assert.equal(parameterValue(new LiveProjectRuntime(null, sketch.source, runtime.save()).project,
      endpoint.path), parameterValue(saved.graph, endpoint.path), sketch.id + ' cold recall');
  }
});

test('widening an unchanged parameter keeps its live value; narrower ranges and changed defaults take effect', async () => {
  const source = (max, value = 1) => `import { createGraphWorkspace } from '@manifold/author';
export default function createProject() {
  const graph = createGraphWorkspace();
  const level = graph.add('gain', {id:4});
  graph.connect(graph.input.output('out'), level.input('audio'));
  graph.connect(level.output('out'), graph.output.input('in'));
  level.parameter('level').expose({path:'/level', min:0, max:${max}, default:${value}});
  return {graph};
}`;
  const runtime = new LiveProjectRuntime(null, source(2));
  await runtime.request({operation:'parameter.set', path:'/level', value:1.5});
  await runtime.request({operation:'source.apply', source:source(8)});
  assert.equal(parameterValue(runtime.project, '/level'), 1.5);
  await runtime.request({operation:'source.apply', source:source(1)});
  assert.equal(parameterValue(runtime.project, '/level'), 1);
  await runtime.request({operation:'source.apply', source:source(8, 0.5)});
  assert.equal(parameterValue(runtime.project, '/level'), 0.5);
});
