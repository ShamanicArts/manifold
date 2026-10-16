import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createEffect, gain, mixer } from 'manifold';
import { lowerDevice, parameterValue } from 'manifold/graph';
import { devicePresentation } from '../../packages/manifold-author/device-presentation.js';
import { PORT_CATALOG } from '../../packages/manifold-author/catalog.generated.js';
import { LiveProjectRuntime } from 'manifold/live-project';

const source = await readFile(
  new URL('../../packages/manifold/examples/reusable.js', import.meta.url),
  'utf8',
);
test('nested instances have separate controls, navigable scopes and actual source selections', async () => {
  const runtime = new LiveProjectRuntime(null, source);
  let snapshot = runtime.snapshot();
  const groups = snapshot.audioNodes.filter((n) => n.implementationKind === 'composition');
  assert.equal(groups.length, 2);
  for (const group of groups) {
    const inside = snapshot.audioNodes.filter((n) => n.scope === group.instance);
    assert.equal(inside.length, 4);
    const filter = inside.find((n) => n.type === 'svf');
    assert.match(
      snapshot.nodeSources[filter.id][0].excerpt,
      /filterStage.add\('filter', lowPassFilter\)/,
    );
    assert.match(snapshot.nodeSources[group.id][0].excerpt, /effect.add/);
    assert.equal(snapshot.audioEdges.filter((e) => inside.some((n) => n.id === e.to)).length, 3);
  }
  await runtime.request({ operation: 'parameter.set', path: '/first/brightness', value: 2400 });
  assert.equal(parameterValue(runtime.project, '/second/brightness'), 600);
  const before = runtime.project;
  await runtime.request({
    operation: 'source.apply',
    source: source.replaceAll('filterStage', 'soundShaper'),
  });
  assert.deepEqual(runtime.project, before);
  const saved = runtime.save(),
    reopened = new LiveProjectRuntime(null, saved.source, saved);
  assert.deepEqual(reopened.snapshot().audioEdges, runtime.snapshot().audioEdges);
  assert.equal(parameterValue(reopened.project, '/first/brightness'), 2400);
});

test('a Device can nest further, fan its input out and promote an inner control once', () => {
  const inner = createEffect({ id: 'inner', name: 'Inner' });
  const level = inner.add('level', gain);
  inner.control('volume', level.parameters.level, {
    label: 'Volume',
    min: 0,
    max: 1,
    default: 0.5,
  });
  inner.connect(inner.inputs.audio, level.inputs.audio);
  inner.connect(level.outputs.out, inner.outputs.audio);
  const middle = createEffect({ id: 'middle', name: 'Middle' });
  const voice = middle.add('voice', inner);
  middle.control('amount', voice.controls.volume);
  middle.connect(middle.inputs.audio, voice.inputs.audio);
  middle.connect(voice.outputs.audio, middle.outputs.audio);
  const outer = createEffect({ id: 'outer', name: 'Outer' });
  const a = outer.add('first', middle),
    b = outer.add('second', middle);
  b.configure({ amount: 0.2 });
  outer.connect(outer.inputs.audio, a.inputs.audio);
  outer.connect(outer.inputs.audio, b.inputs.audio);
  outer.connect(a.outputs.audio, outer.outputs.audio);
  const { project, editorGraph } = lowerDevice(outer);
  const presentation = devicePresentation(editorGraph, project, PORT_CATALOG);
  const containers = presentation.audioNodes.filter((n) => n.implementationKind === 'composition');
  assert.equal(containers.length, 4);
  assert.ok(
    containers.every((n) => n.parameters.some((p) => p.name === 'level')),
    'deep container inspectors retain descendant parameters',
  );
  assert.deepEqual(
    project.endpoints.map((e) => e.path),
    ['/first/amount', '/second/amount'],
  );
  assert.equal(parameterValue(project, '/second/amount'), 0.2);
  assert.equal(project.signal.connections.length, 2);
  inner.add('recursive', outer);
  assert.throws(() => lowerDevice(outer), /recursively/);
});

test('constructor configuration uses existing configured ports and admission rules', () => {
  const effect = createEffect({ id: 'mix', name: 'Mix' });
  const blend = effect.add('blend', mixer, { config: { inputs: 3 } });
  assert.equal(Object.keys(blend.inputs).length, 3);
  effect.connect(effect.inputs.audio, blend.inputs['in-1']);
  effect.connect(blend.outputs.out, effect.outputs.audio);
  assert.ok(lowerDevice(effect).project);
});


test('a large configured mixer exposes named controls and its final real port through a Device', () => {
  const device = createEffect({ id: 'wide-mix', name: 'Wide mix' });
  const blend = device.add('blend', mixer, { config: { inputs: 257 } });
  device.connect(device.inputs.audio, blend.inputs['in-257']);
  device.connect(blend.outputs.out, device.outputs.audio);
  device.control('lastLevel', blend.parameters.input257Gain, { label: 'Last input', min: 0, max: 2, default: .5 });
  assert.equal(blend.parameters.input257Gain.name, 'input257Gain');
  assert.equal(Object.keys(blend.inputs).length, 257);
  const { project } = lowerDevice(device);
  assert.equal(project.endpoints.length, 1);
  assert.ok(project.endpoints[0].id > 255);
  assert.ok(project.signal.connections.some(edge => edge.inputPort === 256));
});
