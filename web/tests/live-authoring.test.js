import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGraphWorkspace, createLiveGraphSession, GraphContractError } from '@manifold/author';
import { BrowserAudioHost } from '../src/audio/browser-host.js';
import { createBrowserLiveSession } from '../src/graph/live-routing.js';
import { captureGraphProject, parseGraphBundle } from '../src/graph/topology.js';

globalThis.sampleRate = 48_000;
globalThis.currentFrame = 0;
let Worklet;
globalThis.AudioWorkletProcessor = class {
  constructor() {
    this.sent = [];
    this.port = { postMessage: message => this.sent.push(message) };
  }
};
globalThis.registerProcessor = (_, processor) => { Worklet = processor; };
await import('../src/audio/filter-processor.js');

const wasmBytes = readFileSync(new URL('../public/manifold_filter.wasm', import.meta.url));

function authoredGraph() {
  const graph = createGraphWorkspace();
  const tone = graph.add('oscillator', { id: 4 });
  const lfo = graph.add('lfo', { id: 5 });
  const gain = graph.add('modulated-gain', { id: 6 });
  graph.connect(tone.output('out'), gain.input('audio'));
  graph.connect(lfo.output('inv'), gain.input('cv'));
  graph.connect(gain.output('out'), graph.output.input('in'));
  return graph;
}

async function prepare(graph) {
  const worklet = new Worklet();
  await worklet.port.onmessage({ data: { type: 'init', wasmBytes,
    graph: { ...graph.toProject().signal, patchable: true } } });
  assert.equal(worklet.sent.at(-1)?.type, 'ready');
  return worklet;
}

function render(worklet) {
  const left = new Float32Array(128);
  const right = new Float32Array(128);
  assert.equal(worklet.process([[], []], [[left, right]]), true);
  assert.ok(left.every(Number.isFinite));
  return left;
}

test('JS route edit changes a prepared AudioWorklet graph after Rust acknowledgement', async () => {
  const graph = authoredGraph();
  const [changed, reference] = await Promise.all([prepare(graph), prepare(graph)]);
  globalThis.currentFrame = 0;
  assert.deepEqual(render(changed), render(reference));
  const session = createLiveGraphSession(graph, async route => {
    const requestId = 1;
    await changed.port.onmessage({ data: { type: 'route', requestId,
      to: route.to, port: route.inputPort, from: route.from, outputPort: route.outputPort } });
    const reply = changed.sent.at(-1);
    assert.equal(reply.type, 'route-applied');
    assert.equal(reply.requestId, requestId);
    return reply.accepted;
  });
  const before = session.toProject();
  const after = await session.route({ to: 6, input: 'cv', from: 5, output: 'uni' });
  assert.equal(before.signal.connections.find(edge => edge.from === 5).outputPort, 1);
  assert.equal(after.signal.connections.find(edge => edge.from === 5).outputPort, 2);
  assert.equal(session.snapshot().revision, 1);
  globalThis.currentFrame = 128;
  const newAudio = render(changed);
  const oldAudio = render(reference);
  assert.ok(newAudio.some((sample, index) => Math.abs(sample - oldAudio[index]) > 0.001));
  assert.equal(changed.engine.manifold_node_active(5), 1);
});

test('one acknowledged worklet parameter batch commits its project control and rolls back engine rejection', async () => {
  const graph = authoredGraph();
  graph.registerControl('/test/depth', { min: 0, max: 1, default: 0.5 });
  const worklet = await prepare(graph);
  let requestId = 0;
  const applyBatch = async updates => {
    await worklet.port.onmessage({ data: { type: 'parameter-batch-request',
      requestId: ++requestId, updates } });
    const reply = worklet.sent.at(-1);
    assert.equal(reply.type, 'parameter-batch-applied');
    assert.equal(reply.requestId, requestId);
    return reply.accepted;
  };
  const session = createLiveGraphSession(graph, async () => true, async () => true,
    null, applyBatch);
  const edits = [{ nodeId: 4, id: 1, value: 330 }, { nodeId: 4, id: 2, value: 0.2 }];
  const accepted = await session.parametersWithControl(edits, { path: '/test/depth', value: 0.8 });
  assert.equal(accepted.controls.find(entry => entry.path === '/test/depth').value, 0.8);
  assert.equal(worklet.engine.manifold_get_node_meter(4, 0), 330);
  assert.ok(Math.abs(worklet.engine.manifold_get_node_meter(4, 1) - 0.2) < 1e-6);
  const before = session.toProject();
  worklet.parameterValues.set(99, new Map([[0, 0]]));
  assert.equal(await applyBatch([{ nodeId: 4, id: 1, value: 550 },
    { nodeId: 99, id: 0, value: 1 }]), false);
  assert.equal(worklet.engine.manifold_get_node_meter(4, 0), 330);
  assert.deepEqual(session.toProject(), before);
  const rejected = createLiveGraphSession(graph, async () => true, async () => true,
    null, async () => false);
  await assert.rejects(rejected.parametersWithControl(edits,
    { path: '/test/depth', value: 0.8 }), { code: 'host-rejected-parameter-batch' });
  assert.equal(rejected.snapshot().revision, 0);
});

test('rejected host route leaves the authored graph unchanged', async () => {
  const graph = authoredGraph();
  let accept = false;
  const session = createLiveGraphSession(graph, async () => accept);
  const before = session.toProject();
  await assert.rejects(session.route({ to: 6, input: 'cv', from: 5, output: 'uni' }),
    error => error instanceof GraphContractError && error.code === 'host-rejected-route');
  assert.deepEqual(session.toProject(), before);
  assert.equal(session.snapshot().revision, 0);
  accept = true;
  await session.route({ to: 6, input: 'cv', from: 5, output: 'uni' });
  await session.route({ to: 6, input: 'cv', from: 5, output: 'inv' });
  assert.equal(session.snapshot().revision, 2);
  assert.deepEqual(session.toProject(), before);
});

test('browser host forwards the selected source output port', async () => {
  const host = new BrowserAudioHost(() => {});
  host.ready = true;
  const posted = [];
  host.processor = { port: { postMessage: message => posted.push(message) } };
  const pending = host.setRoute(6, 1, 5, 2);
  assert.deepEqual(posted[0], { type: 'route', requestId: 1,
    to: 6, port: 1, from: 5, outputPort: 2 });
  const request = host.pendingRoutes.get(1);
  clearTimeout(request.timeout);
  request.resolve();
  await pending;
});

test('browser live routing accepts prepared loop assets but rejects other resources', () => {
  const graph = authoredGraph();
  const audio = { setRoute: async () => {}, setNodeParameter: async () => {} };
  const plain = { id: 'manifold.graph-workspace', signal: graph.toProject().signal };
  assert.ok(createBrowserLiveSession(plain, audio));
  assert.equal(createBrowserLiveSession({ ...plain, graphAssets: [{ nodeId: 4 }] }, audio), null);
  assert.equal(createBrowserLiveSession({ ...plain, graphTargets: [{ nodeId: 4 }] }, audio), null);
});

test('authored loop take survives a live Wasm route edit and browser save/reopen', async () => {
  const fixture = JSON.parse(readFileSync(new URL('../../projects/graph-workspace/authored-live-loop-route.json', import.meta.url)));
  const signal = fixture.signal;
  signal.initialParameters.find(entry => entry.nodeId === 2 && entry.id === 1).value = 1;
  const take = new Float32Array(256);
  for (let frame = 0; frame < 128; frame++) {
    take[frame * 2] = 0.2;
    take[frame * 2 + 1] = -0.3;
  }
  const asset = { nodeId: 2, sourceRate: 48_000, stereo: take, label: 'Authored take' };
  const original = captureGraphProject(signal, [asset]);
  const opened = parseGraphBundle(original);
  const worklet = new Worklet();
  await worklet.port.onmessage({ data: { type: 'init', wasmBytes,
    graph: { ...opened.signal, patchable: true }, samples: opened.assets } });
  assert.equal(worklet.sent.at(-1)?.type, 'ready');
  const audio = { setRoute: async (to, port, from, outputPort) => {
    await worklet.port.onmessage({ data: { type: 'route', requestId: 1,
      to, port, from, outputPort } });
    return worklet.sent.at(-1)?.accepted;
  } };
  const session = createBrowserLiveSession({ id: 'manifold.graph-workspace',
    signal: opened.signal, graphAssets: opened.assets }, audio);
  assert.ok(session);
  assert.ok(Math.abs(render(worklet)[0] - 0.2) < 1e-6);
  const changed = await session.route({ to: 3, input: 'in', from: 1, output: 'out' });
  assert.equal(render(worklet)[0], 0);
  const saved = captureGraphProject(changed.signal, opened.assets);
  assert.equal(saved.assets[0].pcmF32Base64, original.assets[0].pcmF32Base64);
  const reopened = parseGraphBundle(saved);
  assert.deepEqual(reopened.assets[0].stereo, take);
  await session.route({ to: 3, input: 'in', from: 2, output: 'out' });
  assert.ok(Math.abs(render(worklet)[0] - 0.2) < 1e-6);

  // The take must also be prepared when its loop node starts disconnected.
  const parked = structuredClone(opened.signal);
  parked.connections = [{ from: 1, to: 2, inputPort: 0 }, { from: 1, to: 3, inputPort: 0 }];
  const second = new Worklet();
  await second.port.onmessage({ data: { type: 'init', wasmBytes,
    graph: { ...parked, patchable: true }, samples: opened.assets } });
  assert.equal(second.sent.at(-1)?.type, 'ready');
  assert.equal(render(second)[0], 0);
  await second.port.onmessage({ data: { type: 'route', requestId: 2,
    to: 3, port: 0, from: 2, outputPort: 0 } });
  assert.equal(second.sent.at(-1)?.accepted, true);
  assert.ok(Math.abs(render(second)[0] - 0.2) < 1e-6);
});

test('browser host uploads a parked loop take before accepting live routes', async () => {
  const fixture = JSON.parse(readFileSync(new URL('../../projects/graph-workspace/authored-live-loop-route.json', import.meta.url)));
  const signal = fixture.signal;
  signal.initialParameters.find(entry => entry.nodeId === 2 && entry.id === 1).value = 1;
  signal.connections = [{ from: 1, to: 2, inputPort: 0 }, { from: 1, to: 3, inputPort: 0 }];
  const asset = { nodeId: 2, sourceRate: 48_000,
    stereo: Float32Array.from({ length: 256 }, (_, index) => index % 2 ? -0.3 : 0.2),
    label: 'Parked take' };
  const savedGlobals = { AudioContext: globalThis.AudioContext,
    AudioWorkletNode: globalThis.AudioWorkletNode, fetch: globalThis.fetch };
  let node;
  globalThis.AudioContext = class {
    sampleRate = 48_000;
    destination = {};
    audioWorklet = { addModule: async () => {} };
    async resume() {}
    async close() {}
    createAnalyser() { return { connect() { return this; }, disconnect() {} }; }
  };
  globalThis.AudioWorkletNode = class {
    constructor() {
      node = this;
      this.worklet = new Worklet();
      this.port = { onmessage: null, postMessage: async data => {
        await this.worklet.port.onmessage({ data });
        for (const reply of this.worklet.sent.splice(0)) this.port.onmessage?.({ data: reply });
      } };
    }
    connect(next) { return next; }
    disconnect() {}
  };
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => Uint8Array.from(wasmBytes).buffer });
  const host = new BrowserAudioHost(() => {});
  try {
    await host.start('oscillator', new Map(), { id: 'manifold.graph-workspace',
      signal, parameters: [], graphAssets: [asset] }, [asset], { patchable: true });
    assert.equal(render(node.worklet)[0], 0);
    await host.setRoute(3, 0, 2, 0);
    assert.ok(Math.abs(render(node.worklet)[0] - 0.2) < 1e-6);
  } finally {
    await host.stop();
    Object.assign(globalThis, savedGlobals);
  }
});

test('one live session serializes acknowledged parameters and routes with a monotonic revision', async () => {
  const graph = authoredGraph();
  const calls = [];
  let acceptParameter = false;
  const audio = {
    setRoute: async (...args) => { calls.push(['route', ...args]); },
    setNodeParameter: async (...args) => {
      calls.push(['parameter', ...args]);
      return acceptParameter;
    },
  };
  const plain = { id: 'manifold.graph-workspace', signal: graph.toProject().signal };
  const session = createBrowserLiveSession(plain, audio);
  const before = session.toProject();
  await assert.rejects(session.parameter({ nodeId: 4, id: 1, value: 330 }),
    error => error instanceof GraphContractError && error.code === 'host-rejected-parameter');
  assert.deepEqual(session.toProject(), before);
  assert.equal(session.snapshot().revision, 0);
  acceptParameter = true;
  const parameter = session.parameter({ nodeId: 4, id: 1, value: 330 });
  const route = session.route({ to: 6, input: 'cv', from: 5, output: 'uni' });
  await Promise.all([parameter, route]);
  assert.deepEqual(calls.slice(-2).map(call => call[0]), ['parameter', 'route']);
  assert.equal(session.snapshot().revision, 2);
  assert.equal(session.toProject().signal.initialParameters.find(entry =>
    entry.nodeId === 4 && entry.id === 1).value, 330);
  assert.equal(session.toProject().signal.connections.find(edge => edge.from === 5).outputPort, 2);
});

test('published host parameters are adopted before composition without losing authored controls', async () => {
  const graph = createGraphWorkspace().setInputSource('external');
  const gain = graph.add('gain', { id: 4 });
  graph.setParameter(gain, 0, 1);
  graph.registerControl('/local/selection', { min: 0, max: 1, default: 1 });
  graph.connect(graph.input.output('out'), gain.input('audio'));
  graph.connect(gain.output('out'), graph.output.input('in'));
  let published = [{ nodeId: 4, id: 0, value: 0.375 }];
  let candidate;
  const session = createLiveGraphSession(graph, () => true, () => true,
    project => { candidate = project; }, null, () => published);
  await session.transaction(graph => {
    const second = graph.add('gain', { id: 5 });
    graph.setParameter(second, 0, 0.8);
  });
  assert.equal(candidate.signal.initialParameters.find(entry => entry.nodeId === 4).value, 0.375);
  assert.equal(candidate.controls[0].value, 1);
  published = [{ nodeId: 4, id: 0, value: 0.25 }];
  await session.adoptPublishedParameters(published);
  const before = session.toProject();
  await assert.rejects(session.adoptPublishedParameters([
    { nodeId: 4, id: 0, value: 0.1 }, { nodeId: 99, id: 0, value: 0.2 },
  ]), { code: 'missing-node' });
  assert.deepEqual(session.toProject(), before);
  await assert.rejects(session.adoptPublishedParameters([
    { nodeId: 4, id: 0, value: 0.1 }, { nodeId: 4, id: 0, value: 0.2 },
  ]), { code: 'invalid-parameter-snapshot' });
  assert.deepEqual(session.toProject(), before);
});
