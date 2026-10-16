import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiveProjectRuntime } from '@manifold/author/live-project';
import { getProgram } from '@manifold/author/examples/primitive-library';
import createStyledTone from '@manifold/author/examples/ui-styled-tone';
import createReactiveTone from '@manifold/author/examples/ui-reactive-tone';

test('UI examples import as ordinary library modules and as editable live programs', () => {
  for (const [id, factory] of [['ui-styled-tone',createStyledTone], ['ui-reactive-tone',createReactiveTone]]) {
    const runtime = new LiveProjectRuntime(null, getProgram(id).source);
    assert.deepEqual(runtime.project, factory().graph.toProject());
    assert.ok(runtime.presentation().components.length > 3);
  }
});

test('style edits preserve graph and live targets, save/recall styles; malformed styles roll back', async () => {
  const source = getProgram('ui-styled-tone').source;
  const runtime = new LiveProjectRuntime(null, source);
  await runtime.request({ operation:'parameter.set', path:'/ui/tone/pitch', value:330 });
  const graph = runtime.project;
  await runtime.request({ operation:'source.apply', source:source.replaceAll('#f59e0b','#a78bfa') });
  assert.deepEqual(runtime.project,graph);
  assert.equal(runtime.presentation().components[0].style.accent,'#a78bfa');
  const saved = runtime.save();
  assert.equal(new LiveProjectRuntime(null,runtime.source,saved).presentation().components[0].style.accent,'#a78bfa');
  for (const invalid of ["'red'", "['#a78bfa']", '42']) {
    await assert.rejects(runtime.request({operation:'source.apply',source:source.replace("'#f59e0b'",invalid)}),{code:'invalid-view'});
    assert.deepEqual(runtime.save(),saved);
  }
});

test('immediate UI drawing, text, palette and conditional composition follow accepted audio targets', async () => {
  const runtime = new LiveProjectRuntime(null,getProgram('ui-reactive-tone').source);
  const before = runtime.presentation().components;
  assert.equal(before.find(c=>c.id==='wave').points.length,257);
  assert.equal(before.find(c=>c.id==='wave').height,160);
  assert.equal(before.find(c=>c.id==='hint'),undefined);
  await runtime.request({operation:'parameter.batch',edits:[{path:'/ui/reactive/pitch',value:440},{path:'/ui/reactive/level',value:0.25}]});
  const after = runtime.presentation().components;
  assert.notDeepEqual(after[0].points,before[0].points);
  assert.equal(after[0].style.accent,'#fb7185');
  assert.equal(after.find(c=>c.id==='readout').label,'440 Hz · 0.25 level');
  assert.ok(after.find(c=>c.id==='hint'));
  const saved=runtime.save();
  assert.deepEqual(new LiveProjectRuntime(null,runtime.source,saved).presentation().components,after);
  await assert.rejects(runtime.request({operation:'source.apply',source:runtime.source.replace('height: 160','height: 900')}),{code:'invalid-view'});
  assert.deepEqual(runtime.save(),saved);
});
