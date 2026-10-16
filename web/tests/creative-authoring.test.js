import test from 'node:test';
import assert from 'node:assert/strict';
import { createGraphWorkspace, getPrimitive, parameterValue } from '@manifold/author';
import createProject from '@manifold/author/examples/network-instrument';
import { LiveProjectRuntime, evaluateProjectSource } from '@manifold/author/live-project';
import { source } from '../../packages/manifold-author/examples/network-services.mjs';
import { source as previous } from './fixtures/network-services-before-cleanup.mjs';

test('the actual imported module and live source define the same graph, controls and view', async () => {
  const imported = createProject();
  const live = evaluateProjectSource(source);
  assert.deepEqual(imported.graph.toProject(), live.project);
  assert.deepEqual(imported.view, live.view);
  assert.deepEqual(imported.network.settings, live.network);
  assert.equal(typeof imported.network.handler, 'function');
  assert.deepEqual(getPrimitive('oscillator').parameters.map(p => p.name), ['waveform', 'frequency', 'level']);
  const catalog = await new LiveProjectRuntime(null, source).request({ operation: 'catalog.list' });
  assert.equal(catalog.oscillator.parameters.find(p => p.id === 1).name, 'frequency');
  assert.equal(catalog.oscillator.parameters.find(p => p.id === 1).label, 'Frequency');
});

test('named parameters validate stale references and reject invalid declarations without partial mutation', () => {
  const graph = createGraphWorkspace();
  const node = graph.add('oscillator', { id: 4 });
  graph.connect(node.output('out'), graph.output.input('in'));
  const frequency = node.parameter('frequency');
  const before = graph.toProject();
  assert.throws(() => frequency.expose({ path: '/pitch', min: 40, max: 2000, default: 3000 }));
  assert.deepEqual(graph.toProject(), before);
  assert.throws(() => node.parameter('pitch'), /available: waveform, frequency, level/);
  frequency.expose({ path: '/pitch', min: 40, max: 2000, default: 220 });
  frequency.set(440);
  assert.equal(parameterValue(graph.toProject(), '/pitch'), 440);
  graph.remove(node);
  graph.add('oscillator', { id: 4 });
  assert.throws(() => frequency.set(330), /current graph instance/);
});

test('module imports, aliases and exported declarations are parsed rather than replaced inside strings', () => {
  const module = `
import { createGraphWorkspace as workspace } from '@manifold/author';
import * as parts from '@manifold/author/primitives';
export const text = "import { unavailable } from 'elsewhere';";
export default function instrument() {
  const graph = workspace();
  const tone = graph.add(parts.oscillator.type, { id: 4 });
  graph.connect(tone.output('out'), graph.output.input('in'));
  return { graph };
}`;
  assert.equal(evaluateProjectSource(module).project.signal.nodes.find(n => n.id === 4).type, 'oscillator');
  const setup = `import {createGraphWorkspace} from '@manifold/author'; const graph = createGraphWorkspace(); graph.connect(graph.input.output('out'), graph.output.input('in'));`;
  assert.ok(evaluateProjectSource(setup + 'export default () => ({graph});').graph);
  assert.ok(evaluateProjectSource(setup + 'export default {graph};').graph);
});

test('unsupported module edits preserve accepted source and live targets; cleanup recalls old saved targets', async () => {
  // Use the previously delivered source, not another copy of the new spelling.
  const runtime = new LiveProjectRuntime(null, previous);
  await runtime.request({ operation: 'parameter.set', path: '/network/tone', value: 440 });
  const before = runtime.save();
  for (const bad of [
    source.replace("'@manifold/author/primitives'", "'unknown/module'"),
    source.replace('createGraphWorkspace, parameterValue', 'missingExport, parameterValue'),
    source.replace('export default function', 'export default async function'),
    source.replace('const controls = {', "import('unknown/module'); const controls = {"),
  ]) {
    await assert.rejects(runtime.request({ operation: 'source.apply', source: bad }));
    assert.deepEqual(runtime.save(), before);
  }
  await runtime.request({ operation: 'source.apply', source });
  assert.equal(parameterValue(runtime.project, '/network/tone'), 440);
  assert.deepEqual(runtime.project.signal, before.graph.signal);
  const saved = runtime.save();
  assert.equal(parameterValue(new LiveProjectRuntime(null, source, saved).project, '/network/tone'), 440);
});
