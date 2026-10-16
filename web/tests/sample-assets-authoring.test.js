import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGraphWorkspace, createLiveGraphSession, GraphWorkspace } from '@manifold/author';
import { decodeSampleAsset } from '../../packages/manifold-author/sample-assets.js';
import { createProject as createSampleVoiceProject, SAMPLE_BASE } from
  '@manifold/author/examples/sample-voice-chain';
import { createProject as createRackSampleProject } from
  '@manifold/author/examples/rack-sample-eight-voice';
import { PORT_CATALOG } from '@manifold/author/catalog';
import { createProject as createRackModuleHostProject, attachRackSampleLayerSource } from
  '@manifold/author/examples/rack-module-host';
import { createFourLayerLoopController, snapshotWithoutLoopAudio, snapshotWithLoopAudio } from
  '../../packages/manifold-author/examples/four-layer-loops.mjs';

globalThis.sampleRate = 48_000;
globalThis.currentFrame = 0;
let Worklet;
globalThis.AudioWorkletProcessor = class {
  constructor() { this.sent = []; this.port = { postMessage: message => this.sent.push(message) }; }
};
globalThis.registerProcessor = (_, processor) => { Worklet = processor; };
await import('../src/audio/filter-processor.js');

test('direct Wasm loop loading restores authored overdub after loading PCM', async () => {
  const graph=createGraphWorkspace(),loop=graph.add('loop-capture',{id:70});
  graph.connect(graph.input.output('out'),loop.input('audio'));
  graph.connect(loop.output('out'),graph.output.input('in'));
  graph.setSampleAsset(loop,Float32Array.from({length:64},(_,index)=>index%2?-.3:.2),48000,'overdub clip');
  graph.setParameter(loop,1,1);graph.setParameter(loop,2,1);
  const project=graph.toProject(),worklet=new Worklet();
  await worklet.port.onmessage({data:{type:'init',wasmBytes:readFileSync(new URL('../public/manifold_filter.wasm',import.meta.url)),
    graph:{...project.signal,patchable:true},samples:project.assets.map(decodeSampleAsset),
    kindCodes:Object.fromEntries(Object.entries(PORT_CATALOG).map(([type,spec])=>[type,spec.code]))}});
  assert.equal(worklet.sent.at(-1).type,'ready');
  const left=new Float32Array(128),right=new Float32Array(128);
  worklet.process([[new Float32Array(128).fill(.1),new Float32Array(128).fill(-.2)]],[[left,right]]);
  // Playback reads the old sample before adding this pass's overdub input.
  for (let pass = 0; pass < 4; pass++) {
    assert.ok(left.slice(pass * 32, (pass + 1) * 32).every(value => Math.abs(value - (.2 + pass * .05)) < 1e-6));
    assert.ok(right.slice(pass * 32, (pass + 1) * 32).every(value => Math.abs(value - (-.3 - pass * .1)) < 1e-6));
  }
});

test('public sample assets survive authoring and trigger real Wasm sample playback', async () => {
  const graph = createGraphWorkspace();
  const region = graph.add('sample-region', { id: 4 });
  graph.registerInstance('/sample/voice/region', region);
  graph.connect(region.output('out'), graph.output.input('in'));
  const pcm = Float32Array.from({ length: 4096 }, (_, index) =>
    Math.sin(2 * Math.PI * 440 * Math.floor(index / 2) / 48_000) * 0.4);
  graph.setSampleAsset(region, pcm, 48_000, 'authored sine');
  pcm.fill(0);
  const project = graph.toProject();
  assert.equal(project.assets[0].frames, 2048);
  assert.equal(decodeSampleAsset(project.assets[0]).stereo[2],
    Math.fround(Math.sin(2 * Math.PI * 440 / 48_000) * 0.4));
  assert.deepEqual(GraphWorkspace.fromProject(project).toProject(), project);
  assert.deepEqual(graph.fork().toProject(), project);
  const edited = createLiveGraphSession(graph, () => true, () => true);
  const next = await edited.parameter({ nodeId: 4, id: 0, value: 1.25 });
  assert.deepEqual(next.assets, project.assets);
  assert.equal(next.signal.initialParameters.find(entry => entry.nodeId === 4 && entry.id === 0).value, 1.25);
  assert.throws(() => GraphWorkspace.fromProject({ ...project, assets: [
    { ...project.assets[0], pcmF32Base64: project.assets[0].pcmF32Base64.slice(0, -1) + '!' },
  ] }), { code: 'invalid-asset' });

  const wasmBytes = readFileSync(new URL('../public/manifold_filter.wasm', import.meta.url));
  const worklet = new Worklet();
  await worklet.port.onmessage({ data: { type: 'init', wasmBytes,
    graph: { ...project.signal, patchable: true }, samples: project.assets.map(decodeSampleAsset) } });
  assert.equal(worklet.sent.at(-1).type, 'ready');
  const left = new Float32Array(128);
  const right = new Float32Array(128);
  worklet.process([[], []], [[left, right]]);
  assert.ok(left.every(sample => sample === 0));
  await worklet.port.onmessage({ data: { type: 'event', nodeId: 4,
    kind: 0, channel: 0, note: 60, velocity: 100, offset: 0 } });
  worklet.process([[], []], [[left, right]]);
  assert.ok(left.some(sample => Math.abs(sample) > 0.05));
  assert.deepEqual(left, right);
});

test('authored Sample voice chain carries PCM, gate, pitch, and vocoder mode through Wasm', async () => {
  const fixture = JSON.parse(readFileSync(new URL(
    '../../projects/graph-workspace/authored-sample-voice-chain.json', import.meta.url)));
  const graph = GraphWorkspace.fromProject(fixture);
  assert.deepEqual(graph.toProject(), fixture);
  const wasmBytes = readFileSync(new URL('../public/manifold_filter.wasm', import.meta.url));
  const worklet = new Worklet();
  await worklet.port.onmessage({ data: { type: 'init', wasmBytes,
    graph: { ...fixture.signal, patchable: true }, samples: fixture.assets.map(decodeSampleAsset) } });
  assert.equal(worklet.sent.at(-1).type, 'ready');
  let requestId = 0;
  const apply = async (type, payload) => {
    const id = ++requestId;
    await worklet.port.onmessage({ data: { type, requestId: id, ...payload } });
    const reply = worklet.sent.at(-1);
    assert.equal(reply.requestId, id);
    return reply.accepted;
  };
  const project = createSampleVoiceProject({
    setRoute: () => true,
    setParameter: edit => apply('parameter-request', edit),
    setParameterBatch: updates => apply('parameter-batch-request', { updates }),
    sendEvent: event => { void worklet.port.onmessage({ data: { type: 'event', ...event } }); },
  }, graph);
  const render = () => {
    const left = new Float32Array(128);
    const right = new Float32Array(128);
    assert.equal(worklet.process([[], []], [[left, right]]), true);
    assert.deepEqual(left, right);
    return left;
  };
  assert.ok(render().every(sample => sample === 0));
  await project.set(`${SAMPLE_BASE}/voice/1/gate`, 0.6);
  const attack = Array.from({ length: 4 }, render);
  assert.ok(attack.some(block => block.some(sample => Math.abs(sample) > 0.01)));
  const savedWithOpenGate = project.toProject();
  const reopenedWorklet = new Worklet();
  await reopenedWorklet.port.onmessage({ data: { type: 'init', wasmBytes,
    graph: { ...savedWithOpenGate.signal, patchable: true },
    samples: savedWithOpenGate.assets.map(decodeSampleAsset) } });
  const reopenedProject = createSampleVoiceProject({
    setRoute: () => true, setParameter: () => true, setParameterBatch: () => true,
    sendEvent: event => { void reopenedWorklet.port.onmessage({ data: { type: 'event', ...event } }); },
  }, GraphWorkspace.fromProject(savedWithOpenGate));
  reopenedProject.activate();
  const resumed = new Float32Array(128);
  const resumedRight = new Float32Array(128);
  reopenedWorklet.process([[], []], [[resumed, resumedRight]]);
  assert.ok(resumed.some(sample => Math.abs(sample) > 0.01));
  await project.set(`${SAMPLE_BASE}/voice/1/vOct`, 72);
  assert.equal(project.toProject().signal.initialParameters.find(entry =>
    entry.nodeId === 4 && entry.id === 0).value, 2);
  await project.set(`${SAMPLE_BASE}/pitchMode`, 1);
  assert.equal(project.toProject().signal.initialParameters.find(entry =>
    entry.nodeId === 5 && entry.id === 3).value, 1);
  await project.set(`${SAMPLE_BASE}/loopStart`, 0.2);
  assert.equal(project.toProject().signal.initialParameters.find(entry =>
    entry.nodeId === 4 && entry.id === 5).value, 1);
  await project.set(`${SAMPLE_BASE}/voice/1/gate`, 0);
  assert.ok(render().every(sample => sample === 0));
  assert.deepEqual(GraphWorkspace.fromProject(project.toProject()).toProject(), project.toProject());
});

test('one portable PCM asset feeds independent public Sample Region voices in Wasm', async () => {
  const graph = createGraphWorkspace();
  const source = graph.add('sample-region', { id: 4 });
  const voice = graph.add('sample-region', { id: 5 });
  const mix = graph.add('sum2', { id: 6 });
  graph.connect(source.output('out'), mix.input('a'));
  graph.connect(voice.output('out'), mix.input('b'));
  graph.connect(mix.output('out'), graph.output.input('in'));
  const pcm = Float32Array.from({ length: 8192 }, (_, index) =>
    Math.sin(2 * Math.PI * 220 * Math.floor(index / 2) / 48_000) * 0.4);
  graph.setSampleAsset(source, pcm, 48_000, 'shared source');
  graph.bindSampleAsset(source, voice);
  const project = graph.toProject();
  assert.equal(project.assets.length, 1);
  assert.deepEqual(project.sampleBindings, [{ sourceNodeId: 4, nodeId: 5 }]);
  assert.deepEqual(GraphWorkspace.fromProject(project).toProject(), project);
  assert.throws(() => GraphWorkspace.fromProject({ ...project,
    sampleBindings: [{ sourceNodeId: 4, nodeId: 4 }] }),
  { code: 'invalid-sample-binding' });
  assert.throws(() => graph.setSampleAsset(voice, pcm, 48_000),
    { code: 'invalid-asset-node' });

  const wasmBytes = readFileSync(new URL('../public/manifold_filter.wasm', import.meta.url));
  const worklet = new Worklet();
  await worklet.port.onmessage({ data: { type: 'init', wasmBytes,
    graph: { ...project.signal, patchable: true }, samples: project.assets.map(decodeSampleAsset),
    sampleBindings: project.sampleBindings } });
  assert.equal(worklet.sent.at(-1).type, 'ready');
  const render = () => {
    const left = new Float32Array(128);
    const right = new Float32Array(128);
    worklet.process([[], []], [[left, right]]);
    assert.deepEqual(left, right);
    return left;
  };
  assert.ok(render().every(sample => sample === 0));
  await worklet.port.onmessage({ data: { type: 'event', nodeId: 5,
    kind: 0, channel: 0, note: 60, velocity: 100, offset: 0 } });
  assert.ok(render().some(sample => Math.abs(sample) > 0.01));
  await worklet.port.onmessage({ data: { type: 'event', nodeId: 5,
    kind: 2, channel: 0, note: 60, velocity: 0, offset: 0 } });
  assert.ok(render().every(sample => sample === 0));
  await worklet.port.onmessage({ data: { type: 'event', nodeId: 4,
    kind: 0, channel: 0, note: 60, velocity: 100, offset: 0 } });
  assert.ok(render().some(sample => Math.abs(sample) > 0.01));
  graph.removeSampleAsset(source);
  assert.equal(graph.listSampleAssets().length, 0);
  assert.equal(graph.listSampleBindings().length, 0);
});

test('public Sample Region unison, detune, and spread change running Wasm audio', async () => {
  const graph = createGraphWorkspace();
  const region = graph.add('sample-region', { id: 4 });
  graph.connect(region.output('out'), graph.output.input('in'));
  const pcm = Float32Array.from({ length: 4096 }, (_, index) =>
    Math.sin(0.12 * Math.floor(index / 2)));
  graph.setSampleAsset(region, pcm, 48_000, 'unison source');
  const project = graph.toProject();
  const wasmBytes = readFileSync(new URL('../public/manifold_filter.wasm', import.meta.url));
  const worklet = new Worklet();
  await worklet.port.onmessage({ data: { type: 'init', wasmBytes,
    graph: { ...project.signal, patchable: true }, samples: project.assets.map(decodeSampleAsset) } });
  assert.equal(worklet.sent.at(-1).type, 'ready', JSON.stringify(worklet.sent.at(-1)));
  const render = () => {
    const left = new Float32Array(128);
    const right = new Float32Array(128);
    worklet.process([[], []], [[left, right]]);
    return [left, right];
  };
  await worklet.port.onmessage({ data: { type: 'event', nodeId: 4,
    kind: 0, channel: 0, note: 60, velocity: 100, offset: 0 } });
  const baseline = render();
  assert.deepEqual(...baseline);
  for (const [requestId, id, value] of [[1, 9, 2], [2, 10, 100], [3, 11, 1]]) {
    await worklet.port.onmessage({ data: { type: 'parameter-request', requestId,
      nodeId: 4, id, value } });
    assert.equal(worklet.sent.at(-1).accepted, true);
  }
  await worklet.port.onmessage({ data: { type: 'event', nodeId: 4,
    kind: 0, channel: 0, note: 60, velocity: 100, offset: 0 } });
  const stacked = Array.from({ length: 2 }, render).at(-1);
  assert.ok(stacked[0].some((sample, index) => Math.abs(sample - stacked[1][index]) > 0.001));
  assert.ok(stacked[0].some((sample, index) => Math.abs(sample - baseline[0][index]) > 0.001));
});

test('older Sample projects reopen without stacking parameters until one is authored', () => {
  const fixture = JSON.parse(readFileSync(new URL(
    '../../projects/graph-workspace/authored-sample-voice-chain.json', import.meta.url)));
  const old = { ...fixture, signal: { ...fixture.signal,
    initialParameters: fixture.signal.initialParameters.filter(entry =>
      !(entry.nodeId === 4 && entry.id >= 9 && entry.id <= 11)) } };
  const graph = GraphWorkspace.fromProject(old);
  assert.deepEqual(graph.toProject().signal.initialParameters, old.signal.initialParameters);
  const fork = graph.fork();
  fork.setParameter(fork.find(4), 9, 3);
  assert.equal(fork.toProject().signal.initialParameters.filter(entry =>
    entry.nodeId === 4 && entry.id >= 9 && entry.id <= 11).length, 1);
  assert.equal(graph.toProject().signal.initialParameters.filter(entry =>
    entry.nodeId === 4 && entry.id >= 9 && entry.id <= 11).length, 0);
});

test('historical eight Sample voice topology shares PCM and responds at either edge in Wasm', async () => {
  const fixture = JSON.parse(readFileSync(new URL(
    '../../projects/graph-workspace/authored-rack-sample-eight-voice.json', import.meta.url)));
  assert.equal(fixture.assets.length, 1);
  assert.equal(fixture.sampleBindings.length, 7);
  assert.equal(fixture.signal.nodes.filter(node => node.type === 'sample-region').length, 8);
  assert.equal(fixture.signal.nodes.filter(node => node.type === 'phase-vocoder').length, 8);
  assert.deepEqual(GraphWorkspace.fromProject(fixture).toProject(), fixture);
  const wasmBytes = readFileSync(new URL('../public/manifold_filter.wasm', import.meta.url));
  const worklet = new Worklet();
  await worklet.port.onmessage({ data: { type: 'init', wasmBytes,
    graph: { ...fixture.signal, patchable: true },
    samples: fixture.assets.map(decodeSampleAsset), sampleBindings: fixture.sampleBindings,
    kindCodes: Object.fromEntries(Object.entries(PORT_CATALOG).map(([type, spec]) =>
      [type, spec.code])) } });
  assert.equal(worklet.sent.at(-1).type, 'ready', JSON.stringify(worklet.sent.at(-1)));
  let requestId = 0;
  const apply = async (type, payload) => {
    const id = ++requestId;
    await worklet.port.onmessage({ data: { type, requestId: id, ...payload } });
    const reply = worklet.sent.at(-1);
    assert.equal(reply.requestId, id);
    return reply.accepted;
  };
  const project = createRackSampleProject({
    setRoute: () => true,
    setParameter: edit => apply('parameter-request', edit),
    setParameterBatch: updates => apply('parameter-batch-request', { updates }),
    sendEvent: event => { void worklet.port.onmessage({ data: { type: 'event', ...event } }); },
  }, GraphWorkspace.fromProject(fixture));
  const render = () => {
    const left = new Float32Array(128);
    const right = new Float32Array(128);
    worklet.process([[], []], [[left, right]]);
    assert.deepEqual(left, right);
    return left;
  };
  assert.ok(render().every(sample => sample === 0));
  await project.set(`${SAMPLE_BASE}/voice/8/gate`, 0.7);
  assert.ok(Array.from({ length: 4 }, render).some(block =>
    block.some(sample => Math.abs(sample) > 0.005)));
  await project.set(`${SAMPLE_BASE}/voice/8/gate`, 0);
  assert.ok(render().every(sample => sample === 0));
  await project.set(`${SAMPLE_BASE}/voice/1/gate`, 0.7);
  assert.ok(Array.from({ length: 4 }, render).some(block =>
    block.some(sample => Math.abs(sample) > 0.005)));
  await project.set(`${SAMPLE_BASE}/pitchMode`, 1);
  assert.equal(project.toProject().signal.initialParameters.filter(entry =>
    entry.id === 3 && [5, 8, 11, 14, 17, 20, 23, 26].includes(entry.nodeId)
    && entry.value === 1).length, 8);
  for (const [name, value, id] of [['unison', 3, 9], ['detune', 38, 10], ['spread', 0.6, 11]]) {
    await project.set(`${SAMPLE_BASE}/${name}`, value);
    assert.equal(project.toProject().signal.initialParameters.filter(entry =>
      entry.id === id && [4, 7, 10, 13, 16, 19, 22, 25].includes(entry.nodeId)
      && entry.value === value).length, 8);
  }
  assert.deepEqual(GraphWorkspace.fromProject(project.toProject()).toProject(), project.toProject());
});

test('RackModuleHost selection 2 routes the same authored eight-voice Sample graph', async () => {
  const fixture = JSON.parse(readFileSync(new URL(
    '../../projects/graph-workspace/authored-rack-module-host-sample.json', import.meta.url)));
  assert.equal(fixture.signal.nodes.length, 68);
  assert.equal(fixture.signal.connections.find(edge => edge.to === 3).from, 64);
  assert.equal(fixture.assets.length, 1);
  assert.equal(fixture.sampleBindings.length, 7);
  const graph = GraphWorkspace.fromProject(fixture);
  assert.deepEqual(graph.toProject(), fixture);
  const wasmBytes = readFileSync(new URL('../public/manifold_filter.wasm', import.meta.url));
  const worklet = new Worklet();
  await worklet.port.onmessage({ data: { type: 'init', wasmBytes,
    graph: { ...fixture.signal, patchable: true },
    samples: fixture.assets.map(decodeSampleAsset), sampleBindings: fixture.sampleBindings,
    kindCodes: Object.fromEntries(Object.entries(PORT_CATALOG).map(([type, spec]) =>
      [type, spec.code])) } });
  assert.equal(worklet.sent.at(-1).type, 'ready', JSON.stringify(worklet.sent.at(-1)));
  let requestId = 0;
  const apply = async (type, payload) => {
    const id = ++requestId;
    await worklet.port.onmessage({ data: { type, requestId: id, ...payload } });
    const reply = worklet.sent.at(-1);
    assert.equal(reply.requestId, id);
    return reply.accepted;
  };
  const project = createRackModuleHostProject({
    setRoute: route => apply('route', { to: route.to, port: route.inputPort,
      from: route.from, outputPort: route.outputPort }),
    setParameter: edit => apply('parameter-request', edit),
    setParameterBatch: updates => apply('parameter-batch-request', { updates }),
    sendEvent: event => { void worklet.port.onmessage({ data: { type: 'event', ...event } }); },
  }, graph);
  const render = () => {
    const left = new Float32Array(128);
    const right = new Float32Array(128);
    worklet.process([[], []], [[left, right]]);
    return left;
  };
  await project.set(`${SAMPLE_BASE}/voice/8/gate`, 0.7);
  assert.ok(Array.from({ length: 4 }, render).some(block =>
    block.some(sample => Math.abs(sample) > 0.005)));
  const decode = globalThis.atob;
  let decodesDuringRoute = 0;
  globalThis.atob = encoded => { decodesDuringRoute++; return decode(encoded); };
  try {
    await project.set('/rack_host/module/index', 1);
    assert.equal(project.toProject().signal.connections.find(edge => edge.to === 3).from, 38);
    await project.set('/rack_host/module/index', 2);
  } finally { globalThis.atob = decode; }
  assert.equal(decodesDuringRoute, 0, 'Route gestures must not decode saved PCM');
  assert.equal(project.toProject().signal.connections.find(edge => edge.to === 3).from, 64);
  assert.equal(project.toProject().assets.length, 1);
  assert.equal(project.toProject().sampleBindings.length, 7);
  assert.deepEqual(GraphWorkspace.fromProject(project.toProject()).toProject(), project.toProject());
});

test('authored Rack graph can grow beyond 64 nodes and still render through Wasm', async () => {
  const fixture = JSON.parse(readFileSync(new URL(
    '../../projects/graph-workspace/authored-rack-module-host-sample.json', import.meta.url)));
  const graph = GraphWorkspace.fromProject(fixture);
  graph.disconnect(graph.output.input('in'));
  let source = graph.find(64);
  for (let id = 70; id <= 73; id++) {
    const gain = graph.add('gain', { id });
    graph.registerInstance(`/rack_host/nodes/post_${id}`, gain);
    graph.setParameter(gain, 0, 1);
    graph.connect(source.output('out'), gain.input('audio'));
    source = gain;
  }
  graph.connect(source.output('out'), graph.output.input('in'));
  const project = graph.toProject();
  assert.equal(project.signal.nodes.length, 72);
  assert.equal(project.instances.length, 70);
  assert.equal(project.sampleBindings.length, 7);
  assert.deepEqual(GraphWorkspace.fromProject(project).toProject(), project);
  const wasmBytes = readFileSync(new URL('../public/manifold_filter.wasm', import.meta.url));
  const worklet = new Worklet();
  await worklet.port.onmessage({ data: { type: 'init', wasmBytes,
    graph: { ...project.signal, patchable: true },
    samples: project.assets.map(decodeSampleAsset), sampleBindings: project.sampleBindings,
    kindCodes: Object.fromEntries(Object.entries(PORT_CATALOG).map(([type, spec]) =>
      [type, spec.code])) } });
  assert.equal(worklet.sent.at(-1).type, 'ready', JSON.stringify(worklet.sent.at(-1)));
  await worklet.port.onmessage({ data: { type: 'parameter-request',
    requestId: 1, nodeId: 41, id: 0, value: 0.7 } });
  assert.equal(worklet.sent.at(-1).accepted, true);
  await worklet.port.onmessage({ data: { type: 'event', nodeId: 39,
    kind: 0, channel: 0, note: 60, velocity: 100, offset: 0 } });
  const audible = Array.from({ length: 4 }, () => {
    const left = new Float32Array(128);
    const right = new Float32Array(128);
    worklet.process([[], []], [[left, right]]);
    assert.deepEqual(left, right);
    return left.some(value => Math.abs(value) > 0.005);
  });
  assert.ok(audible.some(Boolean));
});

test('authored Rack Sample capture source records host input in the Wasm graph', async () => {
  const fixture = JSON.parse(readFileSync(new URL(
    '../../projects/graph-workspace/authored-rack-module-host-sample.json', import.meta.url)));
  assert.deepEqual(fixture.signal.captureSources, [
    { id: 0, nodeId: 65, name: 'Rack Sample input', kind: 'input' },
    { id: 1, nodeId: 68, name: 'Rack Sample sidechain', kind: 'sidechain' },
  ]);
  assert.deepEqual(GraphWorkspace.fromProject(fixture).toProject(), fixture);
  const wasmBytes = readFileSync(new URL('../public/manifold_filter.wasm', import.meta.url));
  const worklet = new Worklet();
  await worklet.port.onmessage({ data: { type: 'init', wasmBytes,
    graph: { ...fixture.signal, patchable: true },
    samples: fixture.assets.map(decodeSampleAsset), sampleBindings: fixture.sampleBindings,
    kindCodes: Object.fromEntries(Object.entries(PORT_CATALOG).map(([type, spec]) =>
      [type, spec.code])) } });
  assert.equal(worklet.sent.at(-1).type, 'ready', JSON.stringify(worklet.sent.at(-1)));
  const inputLeft = new Float32Array(128).fill(0.25);
  const inputRight = new Float32Array(128).fill(-0.25);
  const sideLeft = new Float32Array(128).fill(0.125);
  const sideRight = new Float32Array(128).fill(-0.5);
  const outLeft = new Float32Array(128);
  const outRight = new Float32Array(128);
  for (let block = 0; block < 2; block++) {
    worklet.process([[inputLeft, inputRight], [sideLeft, sideRight]], [[outLeft, outRight]]);
  }
  assert.equal(worklet.engine.manifold_capture_write_offset(65), 256);
  assert.equal(worklet.engine.manifold_capture_write_offset(68), 256);
  assert.equal(worklet.engine.manifold_capture_stage_begin(65, 128), 1);
  assert.equal(worklet.engine.manifold_capture_stage_begin(68, 128), 1);
  worklet.process([[inputLeft, inputRight], [sideLeft, sideRight]], [[outLeft, outRight]]);
  assert.equal(worklet.engine.manifold_capture_stage_status(65), 2);
  assert.equal(worklet.engine.manifold_capture_stage_copy(65, 0, 128), 128);
  const captured = new Float32Array(worklet.engine.memory.buffer,
    worklet.engine.manifold_output_ptr(), 256);
  assert.ok(captured.every((sample, index) => Math.abs(sample - (index % 2 ? -0.25 : 0.25)) < 1e-6));
  assert.equal(worklet.engine.manifold_capture_stage_status(68), 2);
  assert.equal(worklet.engine.manifold_capture_stage_copy(68, 0, 128), 128);
  const sideCaptured = new Float32Array(worklet.engine.memory.buffer,
    worklet.engine.manifold_output_ptr(), 256);
  assert.ok(sideCaptured.every((sample, index) =>
    Math.abs(sample - (index % 2 ? -0.5 : 0.125)) < 1e-6));
  assert.ok(outLeft.every(sample => sample === 0));
  assert.ok(outRight.every(sample => sample === 0));
});

test('four authored layer outputs become selectable Rack Sample capture sources', async () => {
  const fixture = JSON.parse(readFileSync(new URL(
    '../../projects/graph-workspace/authored-rack-module-host-sample.json', import.meta.url)));
  const graph = GraphWorkspace.fromProject(fixture);
  const layerOutputs = [];
  for (let layer = 1; layer <= 4; layer++) {
    const layerOutput = graph.add('gain', { id: 69 + layer });
    graph.setParameter(layerOutput, 0, layer / 4);
    graph.connect(graph.input.output('out'), layerOutput.input('audio'));
    layerOutputs.push(layerOutput.output('out'));
  }
  layerOutputs.forEach((output, index) => attachRackSampleLayerSource(graph, index + 1, output));
  const beforeReject = graph.toProject();
  assert.throws(() => attachRackSampleLayerSource(graph, 4,
    graph.find(73).output('out')), /already registered/);
  assert.deepEqual(graph.toProject(), beforeReject);
  graph.selectCaptureSource(5);
  const authored = graph.toProject();
  assert.deepEqual(authored.signal.captureSources.map(source => [source.id, source.kind]),
    [[0, 'input'], [1, 'sidechain'], [2, 'layer'], [3, 'layer'], [4, 'layer'], [5, 'layer']]);
  assert.equal(authored.signal.selectedCaptureNodeId,
    authored.signal.captureSources.find(source => source.id === 5).nodeId);
  assert.deepEqual(GraphWorkspace.fromProject(authored).toProject(), authored);

  const wasmBytes = readFileSync(new URL('../public/manifold_filter.wasm', import.meta.url));
  const worklet = new Worklet();
  await worklet.port.onmessage({ data: { type: 'init', wasmBytes,
    graph: { ...authored.signal, patchable: true },
    samples: authored.assets.map(decodeSampleAsset), sampleBindings: authored.sampleBindings,
    kindCodes: Object.fromEntries(Object.entries(PORT_CATALOG).map(([type, spec]) =>
      [type, spec.code])) } });
  assert.equal(worklet.sent.at(-1).type, 'ready', JSON.stringify(worklet.sent.at(-1)));
  const left = new Float32Array(128).fill(0.4);
  const right = new Float32Array(128).fill(-0.4);
  const silent = new Float32Array(128);
  for (let block = 0; block < 16; block++) worklet.process([[left, right]], [[silent, silent]]);
  for (let layer = 1; layer <= 4; layer++) {
    const source = authored.signal.captureSources.find(entry => entry.id === layer + 1);
    assert.equal(worklet.engine.manifold_capture_stage_begin(source.nodeId, 128), 1);
    worklet.process([[left, right]], [[silent, silent]]);
    assert.equal(worklet.engine.manifold_capture_stage_status(source.nodeId), 2);
    assert.equal(worklet.engine.manifold_capture_stage_copy(source.nodeId, 0, 128), 128);
    const captured = new Float32Array(worklet.engine.memory.buffer,
      worklet.engine.manifold_output_ptr(), 256);
    const expected = layer * 0.1;
    assert.ok(captured.every((sample, index) =>
      Math.abs(sample - (index % 2 ? -expected : expected)) < 1e-3),
    `layer ${layer} returned its own ${expected} signal`);
  }
});

test('authored loop layer records and feeds Rack Sample capture with silent host input', async () => {
  const fixture = JSON.parse(readFileSync(new URL(
    '../../projects/graph-workspace/authored-rack-four-layer-loops.json', import.meta.url)));
  assert.deepEqual(GraphWorkspace.fromProject(fixture).toProject(), fixture);
  const wasmBytes = readFileSync(new URL('../public/manifold_filter.wasm', import.meta.url));
  const worklet = new Worklet();
  await worklet.port.onmessage({ data: { type: 'init', wasmBytes,
    graph: { ...fixture.signal, patchable: true },
    samples: fixture.assets.map(decodeSampleAsset), sampleBindings: fixture.sampleBindings,
    kindCodes: Object.fromEntries(Object.entries(PORT_CATALOG).map(([type, spec]) =>
      [type, spec.code])) } });
  assert.equal(worklet.sent.at(-1).type, 'ready', JSON.stringify(worklet.sent.at(-1)));
  const session = createLiveGraphSession(GraphWorkspace.fromProject(fixture), () => true,
    edit => worklet.engine.manifold_set_node_parameter(edit.nodeId, edit.id, edit.value) === 1);
  const layers = createFourLayerLoopController(session);
  const inputLeft = new Float32Array(128).fill(0.2);
  const inputRight = new Float32Array(128).fill(-0.3);
  const zero = new Float32Array(128);
  const outLeft = new Float32Array(128);
  const outRight = new Float32Array(128);
  await layers.record(1, true);
  for (let block = 0; block < 4; block++) {
    worklet.process([[inputLeft, inputRight]], [[outLeft, outRight]]);
  }
  await layers.record(1, false);
  await layers.play(1, true);
  worklet.process([[zero, zero]], [[outLeft, outRight]]);
  assert.equal(worklet.engine.manifold_capture_stage_begin(74, 128), 1);
  worklet.process([[zero, zero]], [[outLeft, outRight]]);
  assert.equal(worklet.engine.manifold_capture_stage_status(74), 2);
  assert.equal(worklet.engine.manifold_capture_stage_copy(74, 0, 128), 128);
  const captured = new Float32Array(worklet.engine.memory.buffer,
    worklet.engine.manifold_output_ptr(), 256);
  assert.ok(captured.every((sample, index) =>
    Math.abs(sample - (index % 2 ? -0.3 : 0.2)) < 1e-6));
  assert.equal(worklet.engine.manifold_capture_stage_begin(76, 128), 1);
  worklet.process([[zero, zero]], [[outLeft, outRight]]);
  assert.equal(worklet.engine.manifold_capture_stage_copy(76, 0, 128), 128);
  const other = new Float32Array(worklet.engine.memory.buffer,
    worklet.engine.manifold_output_ptr(), 256);
  assert.ok(other.every(sample => sample === 0));
  const saved = session.toProject();
  assert.equal(saved.signal.selectedCaptureSourceId, 2);
  assert.equal(saved.signal.initialParameters.find(entry => entry.nodeId === 70 && entry.id === 1).value, 1);
  const portable = snapshotWithoutLoopAudio(saved);
  assert.equal(portable.signal.initialParameters.find(entry => entry.nodeId === 70 && entry.id === 1).value, 0);
  assert.equal(saved.signal.initialParameters.find(entry => entry.nodeId === 70 && entry.id === 1).value, 1);
  assert.deepEqual(GraphWorkspace.fromProject(portable).toProject(), portable);
  const withLoops = await snapshotWithLoopAudio(saved, async nodeId => {
    if (nodeId !== 70) return { sourceRate: 48_000, stereo: new Float32Array(0) };
    assert.equal(worklet.engine.manifold_capture_stage_begin(nodeId, 512), 1);
    worklet.process([[zero, zero]], [[outLeft, outRight]]);
    assert.equal(worklet.engine.manifold_capture_stage_status(nodeId), 2);
    const stereo = new Float32Array(1024);
    for (let offset = 0; offset < 512; offset += 128) {
      assert.equal(worklet.engine.manifold_capture_stage_copy(nodeId, offset, 128), 128);
      stereo.set(new Float32Array(worklet.engine.memory.buffer,
        worklet.engine.manifold_output_ptr(), 256), offset * 2);
    }
    worklet.engine.manifold_capture_stage_cancel(nodeId);
    return { sourceRate: 48_000, stereo };
  });
  assert.equal(withLoops.assets.find(asset => asset.nodeId === 70).frames, 512);
  assert.deepEqual(GraphWorkspace.fromProject(withLoops).toProject(), withLoops);
  const reopened = new Worklet();
  await reopened.port.onmessage({ data: { type: 'init', wasmBytes,
    graph: { ...withLoops.signal, patchable: true },
    samples: withLoops.assets.map(decodeSampleAsset), sampleBindings: withLoops.sampleBindings,
    kindCodes: Object.fromEntries(Object.entries(PORT_CATALOG).map(([type, spec]) =>
      [type, spec.code])) } });
  assert.equal(reopened.sent.at(-1).type, 'ready', JSON.stringify(reopened.sent.at(-1)));
  assert.equal(reopened.engine.manifold_capture_length(70), 512);
  reopened.process([[zero, zero]], [[outLeft, outRight]]);
  assert.equal(reopened.engine.manifold_capture_stage_begin(74, 128), 1);
  reopened.process([[zero, zero]], [[outLeft, outRight]]);
  assert.equal(reopened.engine.manifold_capture_stage_copy(74, 0, 128), 128);
  const restored = new Float32Array(reopened.engine.memory.buffer,
    reopened.engine.manifold_output_ptr(), 256);
  assert.ok(restored.every((sample, index) =>
    Math.abs(sample - (index % 2 ? -0.3 : 0.2)) < 1e-6));
});

test('Rack project stages browser capture, publishes one shared PCM, and reopens the take', async () => {
  const fixture = JSON.parse(readFileSync(new URL(
    '../../projects/graph-workspace/authored-rack-module-host-sample.json', import.meta.url)));
  const wasmBytes = readFileSync(new URL('../public/manifold_filter.wasm', import.meta.url));
  const worklet = new Worklet();
  const message = async data => {
    await worklet.port.onmessage({ data });
    return worklet.sent.at(-1);
  };
  await message({ type: 'init', wasmBytes, graph: { ...fixture.signal, patchable: true },
    samples: fixture.assets.map(decodeSampleAsset), sampleBindings: fixture.sampleBindings,
    kindCodes: Object.fromEntries(Object.entries(PORT_CATALOG).map(([type, spec]) =>
      [type, spec.code])) });
  assert.equal(worklet.sent.at(-1).type, 'ready');
  const left = new Float32Array(128).fill(0.36);
  const right = new Float32Array(128).fill(-0.24);
  const sideLeft = new Float32Array(128).fill(-0.16);
  const sideRight = new Float32Array(128).fill(0.48);
  const out = [[new Float32Array(128), new Float32Array(128)]];
  const render = () => worklet.process([[left, right], [sideLeft, sideRight]], out);
  for (let block = 0; block < 3; block++) render();
  let requestId = 0;
  const acknowledged = async (type, payload) => {
    const result = await message({ type, requestId: ++requestId, ...payload });
    assert.equal(result.accepted, true, JSON.stringify(result));
  };
  const captureWindow = async (captureId, timing) => {
    const id = ++requestId;
    const requestedFrames = typeof timing === 'number' ? 128 : timing.freeStop ? 1280
      : Number.isInteger(timing.manualStartOffsetFrames) ? timing.manualStartOffsetFrames < 0
        ? -timing.manualStartOffsetFrames
        : worklet.engine.manifold_capture_free_frames(timing.manualStartOffsetFrames,
          worklet.engine.manifold_capture_write_offset(captureId),
          worklet.engine.manifold_capture_capacity(captureId)) : 2400;
    assert.equal((await message({ type: 'capture-publish-live', requestId: id,
      captureId, ...(typeof timing === 'number' ? { windowSeconds: timing } : timing) })).accepted, true);
    let status;
    for (let attempt = 0; attempt < 8; attempt++) {
      status = await message({ type: 'capture-stage-status', requestId: id, captureId });
      if (status.state === 2) break;
      render();
    }
    assert.equal(status.state, 2);
    assert.equal(status.frames, requestedFrames);
    const chunk = await message({ type: 'capture-stage-chunk', requestId: id,
      captureId, offset: 0, frames: requestedFrames });
    assert.equal(chunk.type, 'capture-stage-chunk');
    await message({ type: 'capture-stage-cancel', captureId });
    return { sourceRate: 48_000, stereo: chunk.stereo };
  };
  const replaceSample = async (nodeId, sourceRate, stereo, bindingTargets) => {
    const id = ++requestId;
    const rejected = await message({ type: 'sample-replace-begin', requestId: id + 1000,
      nodeId, sourceRate, stereo, bindingTargets: [...bindingTargets, 3] });
    assert.equal(rejected.accepted, false, 'An invalid target must reject before PCM publication');
    assert.equal((await message({ type: 'sample-replace-begin', requestId: id,
      nodeId, sourceRate, stereo, bindingTargets })).type, 'sample-replace-started');
    let progress;
    do {
      progress = await message({ type: 'sample-replace-step', requestId: id });
      assert.equal(progress.type, 'sample-replace-progress');
    } while (!progress.done);
    const result = await message({ type: 'sample-replace-commit', requestId: id });
    assert.equal(result.accepted, true, JSON.stringify(result));
  };
  let analysisConfidence = 0.95;
  const project = createRackModuleHostProject({
    setRoute: route => acknowledged('route', { to: route.to, port: route.inputPort,
      from: route.from, outputPort: route.outputPort }),
    setParameter: edit => acknowledged('parameter-request', edit),
    setParameterBatch: updates => acknowledged('parameter-batch-request', { updates }),
    sendEvent: event => { void message({ type: 'event', ...event }); },
    armFreeCapture: async captureId => {
      const result = await message({ type: 'capture-free-arm', requestId: ++requestId, captureId });
      assert.equal(result.accepted, true);
      return result;
    },
    cancelFreeCapture: () => { void message({ type: 'capture-free-cancel' }); },
    captureWindow, replaceSample,
    analyzeSample: async () => ({ pitchHz: 220, confidence: analysisConfidence }),
  }, GraphWorkspace.fromProject(fixture));
  const saved = await project.captureSample(128 / 48_000);
  assert.equal(saved.assets.length, 1);
  assert.equal(saved.assets[0].frames, 128);
  assert.equal(saved.sampleBindings.length, 7);
  const pcm = decodeSampleAsset(saved.assets[0]).stereo;
  assert.ok(pcm.every((sample, index) => sample === Math.fround(index % 2 ? -0.24 : 0.36)));
  assert.deepEqual(GraphWorkspace.fromProject(saved).toProject(), saved);
  await project.selectCaptureSource(1);
  for (let block = 0; block < 3; block++) render();
  const sideSaved = await project.captureSample(128 / 48_000);
  assert.equal(sideSaved.signal.selectedCaptureSourceId, 1);
  assert.equal(sideSaved.signal.selectedCaptureNodeId, 68);
  assert.match(sideSaved.assets[0].label, /sidechain/);
  assert.ok(decodeSampleAsset(sideSaved.assets[0]).stereo.every((sample, index) =>
    sample === Math.fround(index % 2 ? 0.48 : -0.16)));
  assert.deepEqual(GraphWorkspace.fromProject(sideSaved).toProject(), sideSaved);
  let reopenedFrames = 0;
  const reopened = createRackModuleHostProject({
    setRoute: () => true, setParameter: () => true, setParameterBatch: () => true,
    sendEvent: () => {},
    analyzeSample: async (stereo, sourceRate) => {
      reopenedFrames = stereo.length / 2;
      assert.equal(sourceRate, 48_000);
      return { pitchHz: 220, confidence: 0.95 };
    },
  }, GraphWorkspace.fromProject(sideSaved));
  assert.equal((await reopened.analyzeSavedSample()).pitchHz, 220);
  assert.equal(reopenedFrames, 128);
  assert.equal((await reopened.analyzeSavedSample()).pitchHz, 220);
  assert.equal(reopenedFrames, 128, 'Unchanged saved PCM needs one readback analysis');
  assert.deepEqual(reopened.toProject(), sideSaved);
  const pitched = await project.applyDetectedRoot();
  assert.equal(pitched.controls.find(control => control.path === `${SAMPLE_BASE}/rootNote`).value, 57);
  for (let voice = 0; voice < 8; voice++) {
    const speed = pitched.signal.initialParameters.find(parameter =>
      parameter.nodeId === 39 + voice * 3 && parameter.id === 0).value;
    assert.ok(Math.abs(speed - 2 ** (3 / 12)) < 1e-6);
  }
  assert.deepEqual(GraphWorkspace.fromProject(pitched).toProject(), pitched);
  await project.configureCaptureWindow({ captureWindowMode: 'free' });
  const negativeManual = await project.captureSample({ manualStartOffsetFrames: -64 });
  assert.equal(negativeManual.assets[0].frames, 64);
  assert.equal(project.captureArmed(), false);
  const cursorReply = await message({ type: 'capture-cursor-request',
    requestId: ++requestId, captureId: 68 });
  assert.equal(cursorReply.accepted, true);
  assert.equal(cursorReply.startOffset, worklet.engine.manifold_capture_write_offset(68));
  const positiveManual = await project.captureSample({
    manualStartOffsetFrames: cursorReply.startOffset - 128 });
  assert.equal(positiveManual.assets[0].frames, 128);
  assert.equal(positiveManual.signal.selectedCaptureSourceId, 1);
  assert.ok(decodeSampleAsset(positiveManual.assets[0]).stereo.every((sample, index) =>
    sample === Math.fround(index % 2 ? 0.48 : -0.16)));
  assert.deepEqual(GraphWorkspace.fromProject(positiveManual).toProject(), positiveManual);
  analysisConfidence = 0.2;
  await project.captureSample({ manualStartOffsetFrames: -64 });
  assert.throws(() => project.applyDetectedRoot(), { code: 'pitch-unavailable' });
  assert.equal(project.toProject().controls.find(control =>
    control.path === `${SAMPLE_BASE}/rootNote`).value, 57);
  await project.selectCaptureSource(0);
  await project.configureCaptureWindow({ captureWindowMode: 'bars', captureWindowBars: 0.0625,
    captureTempoBpm: 300, captureTimeSignatureNumerator: 4,
    captureTimeSignatureDenominator: 4 });
  for (let block = 0; block < 20; block++) render();
  const savedBars = await project.captureSample();
  assert.equal(savedBars.signal.captureWindowMode, 'bars');
  assert.equal(savedBars.assets[0].frames, 2400);
  assert.equal(savedBars.sampleBindings.length, 7);
  assert.deepEqual(GraphWorkspace.fromProject(savedBars).toProject(), savedBars);
  await project.configureCaptureWindow({ captureWindowMode: 'free' });
  const beforeFree = project.toProject();
  assert.deepEqual(await project.captureSample(), beforeFree);
  assert.equal(project.captureArmed(), true);
  assert.throws(() => project.selectCaptureSource(1), { code: 'capture-armed' });
  for (let block = 0; block < 10; block++) render();
  const savedFree = await project.captureSample();
  assert.equal(project.captureArmed(), false);
  assert.equal(savedFree.assets[0].frames, 1280);
  assert.equal(savedFree.sampleBindings.length, 7);
  assert.deepEqual(GraphWorkspace.fromProject(savedFree).toProject(), savedFree);
  await project.captureSample();
  assert.equal(project.captureArmed(), true);
  await project.configureCaptureWindow({ captureWindowMode: 'seconds', captureWindowSeconds: 1 });
  assert.equal(project.captureArmed(), false);
  await project.set('/rack_host/module/index', 2);
  await project.set(`${SAMPLE_BASE}/voice/8/gate`, 0.7);
  assert.ok(Array.from({ length: 4 }, () => {
    render();
    return out[0][0].some(sample => Math.abs(sample) > 0.005)
      && out[0][1].some(sample => Math.abs(sample) > 0.005);
  }).some(Boolean));
});
