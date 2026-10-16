import test from 'node:test';
import assert from 'node:assert/strict';
import {createGraphWorkspace} from '../../packages/manifold-author/index.js';
import {BrowserGraphHost} from '../../packages/manifold-author/browser.js';
import {PreparedGraphRuntime} from '../../packages/manifold-author/prepared-runtime.js';

const project = () => {
  const graph = createGraphWorkspace();
  const mix = graph.add('mixer', {id: 4, config: {inputs: 513}});
  graph.add('input.sidechain', {id: 5});
  graph.connect(graph.input.output('out'), mix.input('in-513'));
  graph.connect(mix.output('out'), graph.output.input('in'));
  return graph.toProject();
};

test('browser route dispatch resolves configured mixer ports and rejects invalid ports before sending', async t => {
  // Transport acknowledgements are mocked here; real high-port routing and PCM
  // are checked by scripts/verify-mixer-scale-wasm.mjs in both engines.
  const messages = [];
  class Worklet {
    port = {
      postMessage: message => {
        messages.push(message);
        queueMicrotask(() => this.port.onmessage({data: message.type === 'init'
          ? {type: 'ready'} : {type: 'route-applied', requestId: message.requestId, accepted: true}}));
      },
      close() {},
    };
    disconnect() {}
  }
  t.mock.method(globalThis, 'fetch', async () => ({ok: true, arrayBuffer: async () => new ArrayBuffer(0)}));
  const original = globalThis.AudioWorkletNode;
  globalThis.AudioWorkletNode = Worklet;
  t.after(() => { if (original === undefined) delete globalThis.AudioWorkletNode; else globalThis.AudioWorkletNode = original; });
  const host = new BrowserGraphHost({sampleRate: 48000, audioWorklet: {async addModule() {}}});
  try {
    await host.prepare(project());
    for (const from of [5, null, 1]) await host.setRoute({to: 4, inputPort: 512, from});
    assert.deepEqual(messages.filter(m => m.type === 'route').map(m => [m.to, m.port, m.from]),
      [[4, 512, 5], [4, 512, null], [4, 512, 1]]);
    const sent = messages.length;
    await assert.rejects(host.setRoute({to: 4, inputPort: 513, from: 1}), /no inputs port/);
    assert.equal(messages.length, sent);
  } finally { await host.close(); }
});

test('prepared routing uses the configured port and commits only an acknowledged edit', async () => {
  const runtime = new PreparedGraphRuntime({sampleRate: 48000});
  runtime.current = {project: structuredClone(project()), requestId: 1};
  runtime.node = {port: {}};
  runtime.readPublishedParameters = () => runtime.current.project.signal.initialParameters;
  const messages = [];
  runtime.send = async (_, message) => { messages.push(message); };
  await runtime.setRoute({to: 4, inputPort: 512, from: 5});
  assert.equal(messages[0].inputPort, 512);
  assert.equal(runtime.current.project.signal.connections.find(e => e.to === 4).from, 5);
  const accepted = structuredClone(runtime.current.project);
  runtime.send = async () => { throw new Error('Route rejected'); };
  await assert.rejects(runtime.setRoute({to: 4, inputPort: 512}), /Route rejected/);
  assert.deepEqual(runtime.current.project, accepted);
  assert.equal(runtime.routePending, false);
  let acknowledge;
  runtime.send = () => new Promise(resolve => { acknowledge = resolve; });
  const pending = runtime.setRoute({to: 4, inputPort: 512, from: 1});
  await assert.rejects(runtime.setRoute({to: 4, inputPort: 511, from: 5}), /already pending/);
  assert.deepEqual(runtime.current.project, accepted);
  acknowledge(); await pending;
  assert.equal(runtime.current.project.signal.connections.find(e => e.to === 4).from, 1);
});
