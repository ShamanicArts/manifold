import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveProjectRuntime } from '@manifold/author/live-project';
import { GraphWorkspace } from 'manifold/graph';

function source(names) {
  return `import { createEffect, gain } from 'manifold';
const effect = createEffect({id:'automation-test', name:'Automation test'});
const level = effect.add('level', gain);
effect.connect(effect.inputs.audio, level.inputs.audio);
effect.connect(level.outputs.out, effect.outputs.audio);
${names.map(name => `const ${name} = effect.add('${name}', gain);
effect.control('${name}', ${name}.parameters.level, {label:'${name}', min:0,max:2,default:1});`).join('\n')}
export default effect;`;
}
const assignments = runtime => Object.fromEntries(runtime.project.hostAssignments.map(a => [a.path, a.slot]));

test('deleted controls keep their automation through repeated edits, recall and reintroduction', async () => {
  let runtime = new LiveProjectRuntime(null, source(['original']));
  await runtime.request({operation:'source.apply', source:source([])});
  assert.deepEqual(runtime.project.hostBindings, []);
  assert.deepEqual(assignments(runtime), {'/original':0});
  const saved = runtime.save();
  runtime = new LiveProjectRuntime(null, saved.source, saved);
  await runtime.request({operation:'source.apply', source:source(['replacement'])});
  assert.deepEqual(assignments(runtime), {'/original':0, '/replacement':1});
  assert.equal(runtime.project.hostBindings[0].slot, 1);
  await runtime.request({operation:'source.apply', source:source(['original','replacement'])});
  assert.deepEqual(runtime.project.hostBindings.map(b => b.slot), [0,1]);
  assert.deepEqual(GraphWorkspace.fromProject(runtime.project).toProject(), runtime.project);
});

test('undo does not free a slot that the DAW may already have recorded', async () => {
  const runtime = new LiveProjectRuntime(null, source(['original']));
  await runtime.request({operation:'source.apply', source:source(['original','temporary'])});
  await runtime.request({operation:'project.undo'});
  assert.deepEqual(assignments(runtime), {'/original':0,'/temporary':1});
  await runtime.request({operation:'source.apply', source:source(['original','different'])});
  assert.deepEqual(assignments(runtime), {'/original':0,'/temporary':1,'/different':2});
});

test('an explicit empty export contract survives graph recall without inferred bindings', () => {
  const runtime = new LiveProjectRuntime(null, source(['original']));
  const project = structuredClone(runtime.project);
  project.hostBindings = [];
  const graph = GraphWorkspace.fromProject(project);
  assert.equal(graph.hostSlotForPath('/original'), null);
  assert.deepEqual(graph.toProject().hostBindings, []);
  assert.deepEqual(graph.fork().toProject(), project);
});

test('an explicitly unexposed Device control stays unexposed after source reconciliation', async () => {
  const original = new LiveProjectRuntime(null, source(['original']));
  const saved = structuredClone(original.save());
  saved.graph.hostBindings = [];
  const reopened = new LiveProjectRuntime(null, saved.source, saved);
  await reopened.request({operation:'source.apply', source:'// edited\n' + saved.source});
  assert.deepEqual(reopened.project.hostBindings, []);
  assert.equal(reopened.project.endpoints.length, 1);
});

test('import rejects a binding that redirects a reserved name to a different control', () => {
  const runtime = new LiveProjectRuntime(null, source(['original','replacement']));
  const project = structuredClone(runtime.project);
  [project.hostBindings[0].slot, project.hostBindings[1].slot] = [1,0];
  assert.throws(() => GraphWorkspace.fromProject(project), {code:'reserved-host-slot'});
});

test('unnamed low-level bindings keep reservations after removal and cannot redirect automation', async () => {
  const runtime = new LiveProjectRuntime(null, source([]));
  const graph = GraphWorkspace.fromProject(runtime.project);
  const temporary = graph.add('gain', {id:400});
  graph.bindHostSlot(0,temporary,0);
  graph.remove(temporary);
  const project = graph.toProject();
  assert.deepEqual(project.hostAssignments, [{slot:0}]);
  const restored = GraphWorkspace.fromProject(project);
  assert.deepEqual(restored.toProject(), project);
  const replacement = restored.add('gain', {id:400});
  assert.throws(() => restored.bindHostSlot(0,replacement,0), {code:'reserved-host-slot'});
  const saved = structuredClone(runtime.save()); saved.graph = project;
  const reopened = new LiveProjectRuntime(null, saved.source, saved);
  await reopened.request({operation:'source.apply',source:source(['named'])});
  assert.equal(reopened.project.hostBindings[0].slot,1);
  restored.bindHostSlot(2,replacement,0);
  restored.unbindHostSlot(2);
  assert.deepEqual(restored.listHostAssignments(), [{slot:0},{slot:2}]);
});
