import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LiveProjectRuntime } from '../../packages/manifold-author/live-project.js';
import { nodeDeclaration, sourceSelection } from '../../packages/manifold-author/node-sources.js';

const saved = JSON.parse(
  readFileSync(new URL('../public/studio/output-probe.manifold.json', import.meta.url), 'utf8'),
);
test('source relationships survive recall and reveal shared helper edit scope', async () => {
  const runtime = new LiveProjectRuntime(null, saved.source, saved);
  const links = runtime.snapshot().nodeSources;
  assert.match(links[4][0].excerpt, /const outputGain = graph.add/);
  assert.equal(links[2147483648][0].path, '/nodes/meter.mjs');
  assert.equal(links[2147483649][0].path, '/nodes/history.mjs');
  assert.equal(links[2147483648][1].sharedInstances, 2);
  await runtime.request({ operation: 'component.add', definitionId: 'level-meter' });
  assert.equal(runtime.snapshot().nodeSources[2147483648][0].sharedInstances, 2);
  assert.equal(runtime.snapshot().nodeSources[2147483648][1].sharedInstances, 3);
  const reopened = new LiveProjectRuntime(null, runtime.source, runtime.save());
  assert.deepEqual(reopened.snapshot().nodeSources, runtime.snapshot().nodeSources);
  await runtime.request({ operation: 'project.undo' });
  assert.deepEqual(runtime.snapshot().nodeSources, links);
});

test('declaration navigation ignores comments, layout and unrelated add calls', () => {
  const source = `// graph.add(gain.type, {id:4});
const unrelated = {id:4}; other.add(gain.type, {id:4});
const studioGraph = {layout:[{path:'/gain', x:0,y:0}]};
export default function createProject(){
  const graph=createGraphWorkspace();
  const level=graph.add(gain.type,{id:4});
  graph.registerInstance('/gain',level);
  return {graph};
}`;
  const graph = { instances: [{ nodeId: 4, path: '/gain' }] };
  const link = nodeDeclaration(source, { id: 4, type: 'gain' }, graph);
  assert.equal(link.excerpt, 'const level=graph.add(gain.type,{id:4});');
  assert.deepEqual(sourceSelection(source, link), { anchor: link.from, head: link.to });
  assert.equal(sourceSelection('// a draft\n' + source, link), null);
  const moved = nodeDeclaration('// a draft\n' + source, { id: 4, type: 'gain' }, graph);
  assert.equal(moved.from, link.from + 11);
  const ambiguous =
    source +
    `function unused(){const graph=createGraphWorkspace(); const second=graph.add(gain.type,{id:4});}`;
  assert.equal(nodeDeclaration(ambiguous, { id: 4, type: 'gain' }, graph).from, undefined);
});

test('canvas declarations resolve inside studioGraph; dynamic code falls back honestly', () => {
  const graph = { instances: [{ nodeId: 4, path: '/gain' }] };
  const source = `const studioGraph={nodes:[{id:4,type:'gain',path:'/gain'}],layout:[{path:'/gain',x:0,y:0}]};`;
  assert.equal(
    nodeDeclaration(source, { id: 4, type: 'gain' }, graph).excerpt,
    "{id:4,type:'gain',path:'/gain'}",
  );
  const fallback = nodeDeclaration(
    'export default function createProject(){return makeGraph();}',
    { id: 4, type: 'gain' },
    graph,
  );
  assert.equal(fallback.label, 'Project source');
  assert.equal(fallback.from, undefined);
  assert.equal(nodeDeclaration('unfinished(', { id: 4, type: 'gain' }, graph).from, undefined);
});
