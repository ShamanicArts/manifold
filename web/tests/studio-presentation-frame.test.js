import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LiveProjectRuntime} from '../../packages/manifold-author/live-project.js';
import {createParameterGesture} from '../../packages/manifold-ui-web/parameter-gesture.js';

const saved = JSON.parse(readFileSync(new URL('../public/studio/field-rules.manifold.json', import.meta.url)));

test('reusing an accepted document still runs authored immediate paint on every frame', () => {
  const runtime = new LiveProjectRuntime(null, `
    import { createGraphWorkspace } from 'manifold/graph';
    export default function createProject() {
      let paints = 0;
      const graph = createGraphWorkspace();
      graph.connect(graph.input.output('out'), graph.output.input('in'));
      return { graph, view: [], paint(ui) { ui.label(++paints, 'paint-count'); } };
    }
  `);
  const gesture = createParameterGesture(runtime, command => runtime.request(command));
  try {
    const first = Number(gesture.presentation().components.find(c => c.id === 'paint-count').label);
    const second = Number(gesture.presentation().components.find(c => c.id === 'paint-count').label);
    assert.equal(second, first + 1);
  } finally { gesture.destroy(); }
});

test('Studio paints accepted documents without recopying project files each frame, while edits and host state stay live', async () => {
  const frames = [], previousRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = callback => frames.push(callback);
  const host = {ready: false, diagnostics: null, setParameterBatch: async () => true, replaceGraph: async () => true};
  const runtime = new LiveProjectRuntime(host, saved.source, saved);
  const snapshot = runtime.snapshot.bind(runtime);
  let copies = 0;
  runtime.snapshot = () => { copies++; return snapshot(); };
  const gesture = createParameterGesture(runtime, command => runtime.request(command));
  try {
    const initial = gesture.presentation();
    assert.ok(Object.isFrozen(initial.catalog));
    assert.strictEqual(gesture.presentation().catalog, initial.catalog);
    const detachedCatalog = runtime.presentation().catalog;
    assert.ok(!Object.isFrozen(detachedCatalog));
    const initialCopies = copies;
    for (let frame = 0; frame < 120; frame++) assert.equal(gesture.presentation().revision, initial.revision);
    assert.equal(copies, initialCopies, 'idle paint must not rebuild and clone the authored document');
    host.ready = true;
    host.diagnostics = {message: 'test host observation'};
    assert.equal(gesture.presentation().running, true);
    assert.deepEqual(gesture.presentation().diagnostics, host.diagnostics);
    host.ready = false;
    const parameter = initial.parameters.find(p => p.min !== p.max && p.operation !== 'control.set');
    assert.ok(parameter);
    const pending = gesture.set(parameter.path, parameter.max);
    assert.equal(gesture.presentation().parameters.find(p => p.path === parameter.path).value, parameter.max, 'pointer intent paints before acknowledgement');
    frames.shift()();
    await pending;
    assert.equal(gesture.presentation().parameters.find(p => p.path === parameter.path).value, parameter.max);
    const endpoint = runtime.project.endpoints.find(p => p.path === parameter.path);
    const authoredRevision = runtime.revision;
    runtime.adoptPublishedParameters([{nodeId: endpoint.nodeId, id: endpoint.id, value: parameter.min}]);
    assert.equal(gesture.presentation().parameters.find(p => p.path === parameter.path).value, parameter.min, 'host adoption is observable without inventing an authoring revision');
    assert.equal(runtime.revision, authoredRevision);
    await runtime.request({operation: 'source.apply', source: '// changed source\n' + saved.source});
    assert.ok(gesture.presentation().source.startsWith('// changed source'));
    assert.notEqual(gesture.presentation().revision, initial.revision);
    const detached = runtime.snapshot();
    detached.graph.signal.nodes.length = 0;
    assert.ok(gesture.presentation().graph.signal.nodes.length > 0, 'public snapshots remain detached');
  } finally { gesture.destroy(); globalThis.requestAnimationFrame = previousRaf; }
});
