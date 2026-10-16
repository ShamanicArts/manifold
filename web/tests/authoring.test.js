import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createGraphWorkspace, createLiveGraphSession, getPrimitive, listPrimitives, GraphContractError, GraphWorkspace } from '@manifold/author';
import { PORT_CATALOG } from '@manifold/author/catalog';
import { buildGraph as buildLegacyGraph, createProject as createLegacyProject } from '@manifold/author/examples/dsp-live-scripting';
import { buildGraph as buildFxSwapGraph, createProject as createFxSwapProject } from '@manifold/author/examples/fx-slot-swap';
import { buildGraph as buildRackFilterGraph, createProject as createRackFilterProject } from '@manifold/author/examples/rack-filter-eq';
import { captureGraphProject, parseGraphBundle } from '../src/graph/topology.js';

const authored = JSON.parse(readFileSync(new URL('../../projects/graph-workspace/authored-inverted-lfo.json', import.meta.url)));
const older = JSON.parse(readFileSync(new URL('../../projects/graph-workspace/tone-texture-inverted.json', import.meta.url)));
const forked = JSON.parse(readFileSync(new URL('../../projects/graph-workspace/forked-tone-texture.json', import.meta.url)));
const distorted = JSON.parse(readFileSync(new URL('../../projects/graph-workspace/authored-distortion.json', import.meta.url)));
const cvUtilities = JSON.parse(readFileSync(new URL('../../projects/graph-workspace/authored-cv-utilities.json', import.meta.url)));
const cvDecisions = JSON.parse(readFileSync(new URL('../../projects/graph-workspace/authored-cv-decisions.json', import.meta.url)));
const legacyLive = JSON.parse(readFileSync(new URL('../../projects/graph-workspace/authored-dsp-live-scripting.json', import.meta.url)));

test('published package runtime uses the current AudioWorklet and Wasm build', () => {
  for (const [packageFile, sourceFile] of [
    ['filter-processor.js', '../../web/src/audio/filter-processor.js'],
    ['manifold_filter.wasm', '../../web/public/manifold_filter.wasm'],
  ]) {
    assert.deepEqual(readFileSync(new URL(`../../packages/manifold-author/runtime/${packageFile}`,
      import.meta.url)), readFileSync(new URL(sourceFile, import.meta.url)));
  }
});
const fxSwap = JSON.parse(readFileSync(new URL('../../projects/graph-workspace/authored-fx-slot-swap.json', import.meta.url)));
const fxSwapWidth = JSON.parse(readFileSync(new URL('../../projects/graph-workspace/authored-fx-slot-swap-width.json', import.meta.url)));
const rackFilter = JSON.parse(readFileSync(new URL('../../projects/graph-workspace/authored-rack-filter.json', import.meta.url)));
const rackFx = JSON.parse(readFileSync(new URL('../../projects/graph-workspace/authored-rack-fx.json', import.meta.url)));
const rackEq = JSON.parse(readFileSync(new URL('../../projects/graph-workspace/authored-rack-eq.json', import.meta.url)));
const rackNoise = JSON.parse(readFileSync(new URL('../../projects/graph-workspace/authored-rack-noise.json', import.meta.url)));
const rackExternal = JSON.parse(readFileSync(new URL('../../projects/graph-workspace/authored-rack-external.json', import.meta.url)));
const rackPulse = JSON.parse(readFileSync(new URL('../../projects/graph-workspace/authored-rack-pulse.json', import.meta.url)));
const rackBlend = JSON.parse(readFileSync(new URL('../../projects/graph-workspace/authored-rack-blend.json', import.meta.url)));
const rackBlendRing = JSON.parse(readFileSync(new URL('../../projects/graph-workspace/authored-rack-blend-ring.json', import.meta.url)));
const rackBlendFm = JSON.parse(readFileSync(new URL('../../projects/graph-workspace/authored-rack-blend-fm.json', import.meta.url)));
const rackBlendSync = JSON.parse(readFileSync(new URL('../../projects/graph-workspace/authored-rack-blend-sync.json', import.meta.url)));

function invertedGraph() {
  const graph = createGraphWorkspace();
  const tone = graph.add('oscillator', { id: 4 });
  const lfo = graph.add('lfo', { id: 5 });
  const gain = graph.add('modulated-gain', { id: 6 });
  graph.connect(tone.output('out'), gain.input('audio'));
  graph.connect(lfo.output('inv'), gain.input('cv'));
  graph.connect(gain.output('out'), graph.output.input('in'));
  return graph;
}

test('public JS authoring builds a deterministic project accepted by the browser reader', () => {
  const example = execFileSync(process.execPath,
    [new URL('../../packages/manifold-author/examples/inverted-lfo.mjs', import.meta.url).pathname],
    { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(example), authored);
  const graph = invertedGraph();
  assert.deepEqual(graph.toProject(), authored);
  assert.deepEqual(parseGraphBundle(graph.toProject()).signal.connections, authored.signal.connections);
  assert.deepEqual(getPrimitive('lfo').outputs.map(port => port.name), ['out', 'inv', 'uni']);
  assert.equal(listPrimitives().length, Object.keys(PORT_CATALOG).length);
  assert.equal(graph.snapshot().revision, 6);
  assert.ok(Object.isFrozen(graph.snapshot().nodes[0]));
});

test('public authoring rejects wrong signals, occupied inputs, cycles, and stale handles', () => {
  const graph = createGraphWorkspace();
  const tone = graph.add('oscillator', { id: 4 });
  const lfo = graph.add('lfo', { id: 5 });
  const gain = graph.add('modulated-gain', { id: 6 });
  const next = graph.add('gain', { id: 7 });
  const error = (code) => (caught) => caught instanceof GraphContractError && caught.code === code;
  assert.throws(() => graph.connect(lfo.output('out'), gain.input('audio')), error('signal-mismatch'));
  graph.connect(tone.output('out'), gain.input('audio'));
  assert.throws(() => graph.connect(next.output('out'), gain.input('audio')), error('occupied-input'));
  graph.connect(gain.output('out'), next.input('audio'));
  graph.disconnect(gain.input('audio'));
  assert.throws(() => graph.connect(next.output('out'), gain.input('audio')), error('cycle'));
  graph.remove(lfo);
  graph.add('lfo', { id: 5 });
  assert.throws(() => lfo.output('inv'), error('stale-handle'));
  assert.throws(() => graph.toProject(), error('unconnected-output'));
});

test('existing graph imports with named ports and can be forked without changing its source', () => {
  const example = execFileSync(process.execPath,
    [new URL('../../scripts/author-fork-tone-texture.mjs', import.meta.url).pathname],
    { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(example), forked);
  const graph = GraphWorkspace.fromProject(older);
  const initial = graph.toProject();
  assert.equal(initial.signal.connections.find(edge => edge.from === 9).outputPort, 1);
  assert.deepEqual(initial.signal.nodes, older.signal.nodes);
  assert.deepEqual(initial.signal.initialParameters, older.signal.initialParameters);
  const gain = graph.find(8);
  const lfo = graph.find(9);
  graph.disconnect(gain.input('cv'));
  graph.connect(lfo.output('uni'), gain.input('cv'));
  assert.deepEqual(graph.toProject(), forked);
  assert.equal(graph.toProject().signal.connections.find(edge => edge.from === 9).outputPort, 2);
  assert.equal(older.signal.connections.find(edge => edge.from === 9).outputPort, 1);
  assert.equal(GraphWorkspace.fromProject({ ...older, signal: { ...older.signal,
    inputSource: 'external' } }).toProject().signal.inputSource, 'external');
  assert.throws(() => getPrimitive('__proto__'),
    error => error instanceof GraphContractError && error.code === 'unknown-type');
  assert.deepEqual(GraphWorkspace.fromProject({ ...older, assets: [] }).toProject(),
    GraphWorkspace.fromProject(older).toProject());
  assert.throws(() => GraphWorkspace.fromProject({ ...older, assets: [{}] }),
    error => error instanceof GraphContractError && error.code === 'invalid-asset-node');
  assert.throws(() => GraphWorkspace.fromProject({ ...older, signal: { ...older.signal,
    initialParameters: older.signal.initialParameters.slice(1) } }),
  error => error instanceof GraphContractError && error.code === 'missing-project-parameter');
});

async function renderWasm(project, blocks = 1, input = null, stereo = false, patchable = false) {
  const wasm = readFileSync(new URL('../public/manifold_filter.wasm', import.meta.url));
  const { instance } = await WebAssembly.instantiate(wasm, {});
  const engine = instance.exports;
  const { nodes, connections } = project.signal;
  assert.equal(engine.manifold_graph_begin(nodes.length, connections.length), 1);
  if (patchable) assert.equal(engine.manifold_graph_patchable(1), 1);
  for (const node of nodes) {
    const type = PORT_CATALOG[node.type];
    assert.equal(engine.manifold_graph_node(node.id, type.code, node.a ?? 0, node.b ?? 0), 1);
  }
  for (const edge of connections) {
    assert.equal(engine.manifold_graph_edge_ports(edge.from, edge.outputPort ?? 0, edge.to, edge.inputPort), 1);
  }
  const postPrepare = project.signal.initialParameters.filter(parameter =>
    engine.manifold_graph_initial_parameter(parameter.nodeId, parameter.id, parameter.value) !== 1);
  assert.equal(engine.manifold_prepare(48000, 128), 1);
  for (const parameter of postPrepare) {
    assert.equal(engine.manifold_set_node_parameter(parameter.nodeId, parameter.id, parameter.value), 1);
  }
  if (input) new Float32Array(engine.memory.buffer, engine.manifold_input_ptr(), 256).set(input);
  for (let block = 0; block < blocks; block++) assert.equal(engine.manifold_process(128), 1);
  return Float32Array.from(new Float32Array(engine.memory.buffer, engine.manifold_output_ptr(), stereo ? 256 : 128));
}

test('legacy DspLiveScripting project module authors and controls the public graph', async () => {
  const graph = buildLegacyGraph();
  assert.deepEqual(graph.toProject(), legacyLive);
  assert.deepEqual(graph.listParameters().map(endpoint => endpoint.path),
    ['/dsp/live/input_gain', '/dsp/live/width']);
  assert.equal(graph.hostSlotForPath('/dsp/live/input_gain'), 0);
  assert.equal(graph.hostSlotForPath('/dsp/live/width'), 1);
  assert.throws(() => graph.setParameter(graph.find(5), 0, 1.5), { code: 'invalid-parameter' });
  assert.deepEqual(legacyLive.hostBindings, [
    { slot: 0, nodeId: 4, id: 0 }, { slot: 1, nodeId: 5, id: 0 },
  ]);
  assert.deepEqual(parseGraphBundle(legacyLive).endpoints, legacyLive.endpoints);
  assert.deepEqual(captureGraphProject(legacyLive.signal, [], [], [], null, legacyLive.endpoints).endpoints,
    legacyLive.endpoints);
  assert.deepEqual(GraphWorkspace.fromProject(legacyLive).toProject(), legacyLive);
  assert.equal(legacyLive.signal.inputSource, 'external');
  assert.deepEqual(legacyLive.signal.nodes.map(node => node.type),
    ['input.raw', 'output', 'gain', 'stereo-widener']);
  const applied = [];
  const project = createLegacyProject({
    setRoute: async route => { applied.push(['route', route]); },
    setParameter: async edit => { applied.push(['parameter', edit]); },
  });
  await project.set('/dsp/live/input_gain', 1.5);
  await project.set('/dsp/live/width', 0.8);
  assert.deepEqual(applied, [
    ['parameter', { nodeId: 4, id: 0, value: 1.5 }],
    ['parameter', { nodeId: 5, id: 0, value: 0.8 }],
  ]);
  assert.deepEqual(project.toProject().signal.initialParameters.filter(p => p.id === 0).map(p => p.value), [1.5, 0.8]);
  await assert.rejects(project.set('/dsp/live/width', 1.5), { code: 'invalid-parameter' });
  await assert.rejects(project.set('/other', 0), { code: 'unknown-parameter-path' });
  const duplicate = GraphWorkspace.fromProject(legacyLive);
  assert.throws(() => duplicate.registerParameter('/dsp/live/duplicate', duplicate.find(4), 0,
    { min: 0, max: 2, default: 1 }), { code: 'duplicate-endpoint' });
  assert.throws(() => GraphWorkspace.fromProject({ ...legacyLive, endpoints: [
    { ...legacyLive.endpoints[0], nodeId: 3 },
  ] }), { code: 'invalid-endpoint-target' });
  assert.throws(() => GraphWorkspace.fromProject({ ...legacyLive, signal: { ...legacyLive.signal,
    initialParameters: legacyLive.signal.initialParameters.map(entry => entry.nodeId === 5
      ? { ...entry, value: 1.5 } : entry) } }), { code: 'invalid-parameter' });
  const removed = GraphWorkspace.fromProject(legacyLive);
  removed.remove(removed.find(5));
  assert.equal(removed.findParameter('/dsp/live/width'), null);
  assert.equal(removed.hostSlotForPath('/dsp/live/width'), null);
  const inserted = GraphWorkspace.fromProject(legacyLive);
  const before = inserted.add('gain', { id: 2 });
  inserted.registerParameter('/new/level', before, 0, { min: 0, max: 2, default: 1 });
  assert.deepEqual(inserted.toProject().hostBindings, legacyLive.hostBindings);
  assert.equal(inserted.hostSlotForPath('/new/level'), null);
  inserted.bindHostSlot(2, before, 0);
  assert.equal(inserted.hostSlotForPath('/new/level'), 2);
  assert.throws(() => inserted.bindHostSlot(0, inserted.find(2), 0), { code: 'invalid-host-binding' });
  const stereoInput = Float32Array.from({ length: 256 }, (_, i) => ((i * (i < 128 ? 1 : 3) % 16) - 8) / 8);
  const muted = GraphWorkspace.fromProject(legacyLive);
  muted.setParameter(muted.find(4), 0, 0);
  const widened = GraphWorkspace.fromProject(legacyLive);
  widened.setParameter(widened.find(5), 0, 1);
  const [original, silent, wide] = await Promise.all([
    renderWasm(legacyLive, 12, stereoInput, true),
    renderWasm(muted.toProject(), 12, stereoInput, true),
    renderWasm(widened.toProject(), 12, stereoInput, true),
  ]);
  assert.ok(original.some(sample => Math.abs(sample) > 0.01));
  assert.ok(silent.every(sample => Math.abs(sample) < 1e-5));
  assert.ok(original.some((sample, index) => Math.abs(sample - wide[index]) > 0.05));
});

test('legacy graph instance paths survive authoring, browser export, and reopen', () => {
  const graph = GraphWorkspace.fromProject(legacyLive);
  const document = graph.toProject();
  assert.deepEqual(document.instances, [
    { path: '/dsp/live/nodes/input_trim', nodeId: 4 },
    { path: '/dsp/live/nodes/width', nodeId: 5 },
  ]);
  assert.equal(GraphWorkspace.fromProject(document).findInstance('/dsp/live/nodes/width').type,
    'stereo-widener');
  assert.deepEqual(parseGraphBundle(document).instances, document.instances);
  assert.deepEqual(captureGraphProject(document.signal, [], [], [], document.hostBindings,
    document.endpoints, [], document.instances).instances, document.instances);
  assert.throws(() => graph.registerInstance('/dsp/live/nodes/alias', graph.find(5)),
    { code: 'invalid-instance' });
  assert.throws(() => GraphWorkspace.fromProject({ ...document, instances: [
    { path: '/dsp/live/nodes/width', nodeId: 99 },
  ] }), { code: 'invalid-instance' });
  graph.remove(graph.findInstance('/dsp/live/nodes/width'));
  assert.equal(graph.findInstance('/dsp/live/nodes/width'), undefined);
});

test('JS structural transaction adds and removes a primitive only after host publication', async () => {
  const graph = buildLegacyGraph();
  let rejectNext = true;
  const published = [];
  const session = createLiveGraphSession(graph, async () => {}, async () => {}, async candidate => {
    published.push(candidate);
    if (rejectNext) { rejectNext = false; return false; }
    return true;
  });
  const original = session.toProject();
  const insert = staged => {
    const distortion = staged.add('distortion', { id: 6 });
    staged.disconnect(staged.find(5).input('audio'));
    staged.connect(staged.find(4).output('out'), distortion.input('audio'));
    staged.connect(distortion.output('out'), staged.find(5).input('audio'));
  };
  await assert.rejects(session.transaction(insert), { code: 'host-rejected-graph' });
  assert.deepEqual(session.toProject(), original);
  assert.equal(session.snapshot().revision, 0);
  const inserted = await session.transaction(insert);
  assert.equal(inserted.signal.nodes.find(node => node.id === 6).type, 'distortion');
  assert.equal(session.snapshot().revision, 1);
  assert.deepEqual(published[1], inserted);
  await assert.rejects(session.transaction(staged => staged.disconnect(staged.output.input('in'))),
    { code: 'unconnected-output' });
  assert.deepEqual(session.toProject(), inserted);
  assert.equal(published.length, 2);
  const removed = await session.transaction(staged => {
    staged.remove(staged.find(6));
    staged.connect(staged.find(4).output('out'), staged.find(5).input('audio'));
  });
  assert.deepEqual(removed, original);
  assert.equal(session.snapshot().revision, 2);
  assert.throws(() => createLiveGraphSession(graph, async () => {}).transaction(() => {}),
    { code: 'structural-unavailable' });
});

test('one acknowledged route saves its associated project selection atomically', async () => {
  const graph = createGraphWorkspace();
  const tone = graph.add('oscillator', { id: 4 });
  const gain = graph.add('gain', { id: 5 });
  graph.setParameter(gain, 0, 0.3);
  graph.connect(tone.output('out'), gain.input('audio'));
  graph.connect(gain.output('out'), graph.output.input('in'));
  graph.registerControl('/rack/selected', { min: 0, max: 1, default: 0, discrete: true });
  const original = graph.toProject();
  let reject = true;
  const sent = [];
  const live = createLiveGraphSession(graph, route => {
    sent.push(route);
    if (reject) { reject = false; return false; }
    return true;
  });
  const edit = { to: 3, input: 'in', from: 4, output: 'out' };
  const control = { path: '/rack/selected', value: 1 };
  await assert.rejects(live.routeWithControl(edit, control), { code: 'host-rejected-route' });
  assert.deepEqual(live.toProject(), original);
  assert.equal(live.snapshot().revision, 0);
  const selected = await live.routeWithControl(edit, control);
  assert.equal(selected.controls[0].value, 1);
  assert.equal(selected.signal.connections.find(edge => edge.to === 3).from, 4);
  assert.equal(live.snapshot().revision, 1);
  assert.deepEqual(sent[0], sent[1]);
  await assert.rejects(live.routeWithControl(edit, { path: '/rack/selected', value: 0.5 }),
    { code: 'invalid-control' });
  assert.equal(sent.length, 2);
  const [before, after] = await Promise.all([renderWasm(original), renderWasm(selected)]);
  assert.ok(before.some((sample, index) => Math.abs(sample - after[index]) > 0.05));
});

test('legacy FX swap controls retain inactive state and instantiate only the selected effect', async () => {
  assert.deepEqual(buildFxSwapGraph().toProject(), fxSwap);
  assert.equal(fxSwap.signal.initialParameters.find(entry => entry.nodeId === 4).value, 1);
  assert.equal(fxSwap.signal.initialParameters.find(entry => entry.nodeId === 13).value, 1);
  assert.equal(fxSwap.controls.length, 6);
  assert.deepEqual(parseGraphBundle(fxSwap).controls, fxSwap.controls);
  assert.equal(GraphWorkspace.fromProject(fxSwap).toProject().controls.length, 6);
  assert.throws(() => GraphWorkspace.fromProject({ ...fxSwap, controls: [
    ...fxSwap.controls, { ...fxSwap.controls[0] },
  ] }), { code: 'invalid-control' });
  assert.throws(() => parseGraphBundle({ ...fxSwap, controls: fxSwap.controls.map(control =>
    control.path.endsWith('/slotA/select') ? { ...control, value: 1.5 } : control) }),
  { code: 'invalid-control' });
  let reject = true;
  const published = [];
  const project = createFxSwapProject({ setRoute: () => {}, setParameter: () => {},
    replaceGraph: candidate => { published.push(candidate); if (reject) { reject = false; return false; } return true; } });
  await assert.rejects(project.set('/test/fxslot/slotA/width/amount', 1.9), { code: 'host-rejected-graph' });
  assert.deepEqual(project.toProject(), fxSwap);
  await project.set('/test/fxslot/slotA/width/amount', 1.9);
  assert.equal(project.toProject().signal.nodes.length, fxSwap.signal.nodes.length);
  await project.set('/test/fxslot/slotA/select', 1);
  assert.deepEqual(project.toProject(), fxSwapWidth);
  assert.equal(project.toProject().signal.nodes.filter(node => node.type === 'stereo-widener').length, 1);
  assert.equal(project.toProject().signal.initialParameters.find(entry => entry.nodeId === 14 && entry.id === 0).value, 1.9);
  await project.set('/test/fxslot/slotA/select', 0);
  assert.equal(project.toProject().signal.nodes.length, fxSwapWidth.signal.nodes.length);
  assert.equal(project.toProject().controls.find(entry => entry.path.endsWith('/slotA/width/amount')).value, 1.9);
  await project.set('/test/fxslot/slotA/select', 1);
  assert.equal(project.toProject().signal.nodes.length, fxSwapWidth.signal.nodes.length);
  await assert.rejects(project.set('/test/fxslot/slotB/width/amount', 2.5), { code: 'invalid-control' });
  const input = Float32Array.from({ length: 256 }, (_, i) => ((i * (i < 128 ? 1 : 3) % 16) - 8) / 8);
  const [gain, wide] = await Promise.all([renderWasm(fxSwap, 12, input, true), renderWasm(fxSwapWidth, 12, input, true)]);
  assert.ok(gain.every(Number.isFinite) && wide.every(Number.isFinite));
  assert.ok(gain.some((sample, index) => Math.abs(sample - wide[index]) > 0.03));
  const symmetricInput = Float32Array.from({ length: 256 }, (_, index) => index < 128 ? 0.5 : -0.5);
  const [gainStart, widthStart] = await Promise.all([
    renderWasm(fxSwap, 1, symmetricInput, true), renderWasm(fxSwapWidth, 1, symmetricInput, true),
  ]);
  const omega = 2 * Math.PI * 160 / 48000;
  const low = 0.5 * omega / (1 + omega);
  assert.ok(Math.abs(gainStart[0] - 0.32) < 1e-5);
  assert.ok(Math.abs(widthStart[0] - (0.5 - low) * 1.9 * 0.8) < 1e-5);
  assert.ok(Math.abs(widthStart[128] + widthStart[0]) < 1e-5);
  assert.equal(published.length, 5);
});

test('FX slot script resolves renamed graph nodes through saved instance paths', async () => {
  const remapped = structuredClone(fxSwap);
  const ids = new Map([[4, 14], [6, 15], [7, 27], [8, 28],
    [10, 30], [11, 31], [12, 32], [13, 33]]);
  const id = old => ids.get(old) ?? old;
  for (const node of remapped.signal.nodes) node.id = id(node.id);
  for (const edge of remapped.signal.connections) {
    edge.from = id(edge.from);
    edge.to = id(edge.to);
  }
  for (const entry of remapped.signal.initialParameters) entry.nodeId = id(entry.nodeId);
  for (const entry of remapped.endpoints) entry.nodeId = id(entry.nodeId);
  for (const entry of remapped.hostBindings) entry.nodeId = id(entry.nodeId);
  for (const entry of remapped.instances) entry.nodeId = id(entry.nodeId);
  const host = { setRoute() {}, setParameter() {}, replaceGraph() { return true; } };
  const project = createFxSwapProject(host, GraphWorkspace.fromProject(remapped));
  await project.set('/test/fxslot/slotA/width/amount', 1.9);
  await project.set('/test/fxslot/slotA/select', 1);
  const selected = project.toProject();
  const widthId = selected.instances.find(entry => entry.path === '/test/fxslot/slotA/nodes/width').nodeId;
  const gateId = selected.instances.find(entry => entry.path === '/test/fxslot/slotA/nodes/width_gate').nodeId;
  assert.equal(widthId, 2);
  assert.equal(gateId, 4);
  assert.ok(selected.signal.connections.some(edge => edge.from === 14 && edge.to === widthId));
  assert.ok(selected.signal.connections.some(edge => edge.from === gateId && edge.to === 28));
  assert.equal(selected.signal.initialParameters.find(entry => entry.nodeId === 27).value, 0);
  const reopened = GraphWorkspace.fromProject(selected);
  assert.equal(reopened.findInstance('/test/fxslot/slotA/nodes/mix').id, 28);
  const input = Float32Array.from({ length: 256 }, (_, i) => ((i % 16) - 8) / 8);
  const [actual, expected] = await Promise.all([
    renderWasm(selected, 12, input, true), renderWasm(fxSwapWidth, 12, input, true),
  ]);
  assert.ok(actual.every((sample, index) => Math.abs(sample - expected[index]) < 1e-6));
});

test('pre-instance FX slot saves gain stable paths when reopened', async () => {
  const old = structuredClone(fxSwapWidth);
  delete old.instances;
  const host = { setRoute() {}, setParameter() {}, replaceGraph() { return true; } };
  const project = createFxSwapProject(host, GraphWorkspace.fromProject(old));
  assert.deepEqual(project.toProject(), fxSwapWidth);
  await project.set('/test/fxslot/slotA/select', 0);
  assert.equal(project.toProject().controls.find(entry => entry.path.endsWith('/slotA/select')).value, 0);
});

test('RackModuleHost Blend, Filter, FX, and EQ factories author and switch the saved output cable', async () => {
  assert.deepEqual(buildRackFilterGraph().toProject(), rackFilter);
  assert.equal(rackFilter.controls.find(entry => entry.path === '/rack_host/module/index').value, 4);
  assert.equal(rackFilter.signal.initialParameters.find(entry => entry.nodeId === 8 && entry.id === 0).value, 0.65);
  assert.equal(rackFilter.signal.initialParameters.find(entry => entry.nodeId === 5 && entry.id === 1).value, 3200);
  assert.equal(rackFilter.signal.initialParameters.find(entry => entry.nodeId === 6 && entry.id === 4).value, 0.8);
  let reject = true;
  const routes = [];
  const host = { setRoute(route) { routes.push(route); if (reject) { reject = false; return false; } return true; },
    setParameter() { return true; }, setParameterBatch() { return true; } };
  const project = createRackFilterProject(host);
  await assert.rejects(project.set('/rack_host/module/index', 6), { code: 'host-rejected-route' });
  assert.deepEqual(project.toProject(), rackFilter);
  assert.deepEqual(await project.set('/rack_host/module/index', 5), rackFx);
  assert.equal(rackFx.signal.connections.find(edge => edge.to === 3).from, 7);
  assert.deepEqual(await project.set('/rack_host/module/index', 6), rackEq);
  assert.equal(routes.length, 3);
  assert.equal(rackEq.signal.connections.find(edge => edge.to === 3).from, 6);
  assert.deepEqual(await project.set('/rack_host/module/index', 3), rackBlend);
  assert.equal(rackBlend.signal.connections.find(edge => edge.to === 3).from, 18);
  assert.equal(getPrimitive('crossfader').parameters.find(entry => entry.id === 1).default, 1);
  await assert.rejects(project.set('/midi/synth/rack/blend_simple/1/mode', 4),
    { code: 'invalid-blend-mode' });
  assert.equal(getPrimitive('ring-modulator').inputs[1].name, 'modulator');
  const ring = createRackFilterProject(host, GraphWorkspace.fromProject(rackBlend));
  assert.deepEqual(await ring.set('/midi/synth/rack/blend_simple/1/mode', 1), rackBlendRing);
  assert.equal(rackBlendRing.signal.connections.find(edge => edge.to === 18).from, 21);
  await ring.set('/midi/synth/rack/blend_simple/1/blendModAmount', 0.8);
  assert.equal(ring.toProject().signal.initialParameters.find(entry => entry.nodeId === 19 && entry.id === 1).value, 0.8);
  assert.equal(ring.toProject().signal.initialParameters.find(entry => entry.nodeId === 20 && entry.id === 1).value, 0.8);
  assert.equal(ring.toProject().controls.find(entry => entry.path.endsWith('/blendModAmount')).value, 0.8);
  const rejectedBatch = createRackFilterProject({ setRoute() { return true; },
    setParameter() { return true; }, setParameterBatch() { return false; } },
  GraphWorkspace.fromProject(rackBlendRing));
  await assert.rejects(rejectedBatch.set('/midi/synth/rack/blend_simple/1/blendModAmount', 0.8),
    { code: 'host-rejected-parameter-batch' });
  assert.deepEqual(rejectedBatch.toProject(), rackBlendRing);
  await ring.set('/midi/synth/rack/blend_simple/1/blendModAmount', 0);
  assert.equal(ring.toProject().signal.initialParameters.find(entry => entry.nodeId === 19 && entry.id === 4).value, 0);
  assert.equal(ring.toProject().signal.initialParameters.find(entry => entry.nodeId === 20 && entry.id === 4).value, 0);
  const ringOffAudio = await renderWasm(ring.toProject(), 12, null, false, true);
  assert.ok(ringOffAudio.every(value => Math.abs(value) < 1e-6));
  const blend = createRackFilterProject(host, GraphWorkspace.fromProject(rackBlend));
  await blend.set('/midi/synth/rack/blend_simple/1/blendAmount', 1);
  assert.equal(blend.toProject().signal.initialParameters.find(entry => entry.nodeId === 17 && entry.id === 0).value, 1);
  await blend.set('/rack_host/input_b/pitch', 69);
  await blend.set('/rack_host/input_b/level', 0.8);
  assert.equal(blend.toProject().signal.initialParameters.find(entry => entry.nodeId === 12 && entry.id === 1).value, 440);
  await blend.set('/rack_host/input_b/mode', 6);
  assert.equal(blend.toProject().signal.connections.find(edge => edge.to === 13).from, 16);
  await blend.set('/rack_host/input_b/mode', 2);
  const bSilent = blend.toProject();
  assert.equal(bSilent.signal.connections.find(edge => edge.to === 13), undefined);
  const [blendAudio, bSilentAudio] = await Promise.all([
    renderWasm(rackBlend, 12, null, false, true),
    renderWasm(bSilent, 12, null, false, true),
  ]);
  assert.ok(blendAudio.some(value => Math.abs(value) > 0.01));
  assert.ok(bSilentAudio.every(value => Math.abs(value) < 1e-6));
  const ringAudio = await renderWasm(rackBlendRing, 12, null, false, true);
  assert.ok(ringAudio.some((value, index) => Math.abs(value - blendAudio[index]) > 0.01));
  for (const [mode, fixture, branch] of [[2, rackBlendFm, 24], [3, rackBlendSync, 27]]) {
    const variant = createRackFilterProject(host, GraphWorkspace.fromProject(rackBlend));
    assert.deepEqual(await variant.set('/midi/synth/rack/blend_simple/1/mode', mode), fixture);
    assert.equal(fixture.signal.connections.find(edge => edge.to === 18).from, branch);
    const audio = await renderWasm(fixture, 12, null, false, true);
    assert.ok(audio.every(Number.isFinite));
    assert.ok(audio.some((value, index) => Math.abs(value - blendAudio[index]) > 0.01));
  }
  const fxProject = createRackFilterProject(host, GraphWorkspace.fromProject(rackFx));
  await fxProject.set('/midi/synth/rack/fx/1/mix', 1);
  assert.equal(fxProject.toProject().signal.initialParameters.find(entry => entry.nodeId === 7 && entry.id === 1).value, 1);
  await assert.rejects(project.set('/rack_host/module/index', 1), { code: 'unported-module' });
  const reopened = createRackFilterProject(host, GraphWorkspace.fromProject(rackEq));
  assert.deepEqual(await reopened.set('/rack_host/module/index', 4), rackFilter);
  const rejectedInput = createRackFilterProject({
    setRoute() { return true; }, setParameter() { return false; },
  });
  await assert.rejects(rejectedInput.set('/rack_host/input_a/pitch', 69), { code: 'host-rejected-parameter' });
  assert.deepEqual(rejectedInput.toProject(), rackFilter);
  await assert.rejects(reopened.set('/rack_host/input_a/mode', 0), { code: 'invalid-source-mode' });
  await assert.rejects(reopened.set('/rack_host/input_a/pitch', 60.5), { code: 'invalid-control' });
  await reopened.set('/rack_host/input_a/mode', 4);
  await reopened.set('/rack_host/input_a/pitch', 69);
  await reopened.set('/rack_host/input_a/level', 0.25);
  const sourceEdited = reopened.toProject();
  assert.equal(sourceEdited.controls.find(entry => entry.path === '/rack_host/input_a/mode').value, 4);
  assert.equal(sourceEdited.controls.find(entry => entry.path === '/rack_host/input_a/pitch').value, 69);
  assert.equal(sourceEdited.signal.initialParameters.find(entry => entry.nodeId === 4 && entry.id === 0).value, 1);
  assert.equal(sourceEdited.signal.initialParameters.find(entry => entry.nodeId === 4 && entry.id === 1).value, 440);
  assert.equal(sourceEdited.signal.initialParameters.find(entry => entry.nodeId === 8 && entry.id === 0).value, 0.25);
  const [filterAudio, fxAudio, eqAudio] = await Promise.all([
    renderWasm(rackFilter, 12, null, false, true), renderWasm(fxProject.toProject(), 12, null, false, true),
    renderWasm(rackEq, 12, null, false, true),
  ]);
  assert.ok(filterAudio.some((sample, index) => Math.abs(sample - eqAudio[index]) > 0.01));
  assert.ok(fxAudio.some((sample, index) => Math.abs(sample - eqAudio[index]) > 0.01));
  const editedAudio = await renderWasm(sourceEdited, 12, null, false, true);
  assert.ok(filterAudio.some((sample, index) => Math.abs(sample - editedAudio[index]) > 0.05));
  const modes = createRackFilterProject(host, GraphWorkspace.fromProject(rackEq));
  const refusedSource = createRackFilterProject({
    setRoute() { return false; }, setParameter() { return true; },
  }, GraphWorkspace.fromProject(rackEq));
  await assert.rejects(refusedSource.set('/rack_host/input_a/mode', 7),
    { code: 'host-rejected-route' });
  assert.deepEqual(refusedSource.toProject(), rackEq);
  assert.deepEqual(await modes.set('/rack_host/input_a/mode', 7), rackNoise);
  assert.deepEqual(await modes.set('/rack_host/input_a/mode', 1), rackExternal);
  assert.deepEqual(await modes.set('/rack_host/input_a/mode', 6), rackPulse);
  assert.equal(getPrimitive('pulse-oscillator').parameters.find(entry => entry.id === 4).default, 0.25);
  const pitchedPulse = createRackFilterProject(host, GraphWorkspace.fromProject(rackPulse));
  await pitchedPulse.set('/rack_host/input_a/pitch', 69);
  assert.equal(pitchedPulse.toProject().signal.initialParameters.find(entry => entry.nodeId === 11 && entry.id === 1).value, 440);
  const silent = await modes.set('/rack_host/input_a/mode', 2);
  assert.equal(silent.signal.connections.find(edge => edge.to === 8), undefined);
  const backToOsc = await modes.set('/rack_host/input_a/mode', 4);
  assert.equal(backToOsc.controls.find(entry => entry.path === '/rack_host/input_a/mode').value, 4);
  assert.equal(backToOsc.signal.connections.find(edge => edge.to === 8).from, 4);
  const input = Float32Array.from({ length: 256 }, (_, frame) => Math.sin(frame * .08) * .4);
  const [noiseAudio, externalAudio, pulseAudio, silentAudio] = await Promise.all([
    renderWasm(rackNoise, 12, input, false, true),
    renderWasm(rackExternal, 12, input, false, true),
    renderWasm(rackPulse, 12, input, false, true),
    renderWasm(silent, 12, input, false, true),
  ]);
  assert.ok(noiseAudio.some(value => Math.abs(value) > .01));
  assert.ok(externalAudio.some(value => Math.abs(value) > .01));
  assert.ok(pulseAudio.some((value, index) => Math.abs(value - externalAudio[index]) > .01));
  assert.ok(silentAudio.every(value => Math.abs(value) < 1e-6));
});

test('a project authored by the package renders in the real Wasm graph', async () => {
  const left = await renderWasm(authored);
  assert.ok(left.some(value => Math.abs(value) > 0.001));
  assert.ok(left.every(Number.isFinite));
});

test('forking an existing graph to the unipolar LFO output changes Wasm audio', async () => {
  assert.deepEqual(parseGraphBundle(forked).signal.connections, forked.signal.connections);
  const [oldAudio, newAudio] = await Promise.all([renderWasm(older), renderWasm(forked)]);
  assert.ok(newAudio.every(Number.isFinite));
  assert.ok(newAudio.some((sample, index) => Math.abs(sample - oldAudio[index]) > 0.001));
});

test('a JS-authored distortion node changes Wasm audio and exports portable state', async () => {
  const example = execFileSync(process.execPath,
    [new URL('../../scripts/author-distortion.mjs', import.meta.url).pathname],
    { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(example), distorted);
  const dry = GraphWorkspace.fromProject(distorted);
  dry.remove(dry.find(5));
  dry.connect(dry.find(4).output('out'), dry.output.input('in'));
  const [dryAudio, wetAudio] = await Promise.all([renderWasm(dry.toProject()), renderWasm(distorted)]);
  assert.ok(wetAudio.every(Number.isFinite));
  assert.ok(wetAudio.some((sample, index) => Math.abs(sample - dryAudio[index]) > 0.001));
});

test('four public CV utilities form one portable, audible authored chain', async () => {
  const example = execFileSync(process.execPath,
    [new URL('../../packages/manifold-author/examples/cv-utilities.mjs', import.meta.url).pathname],
    { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(example), cvUtilities);
  assert.deepEqual(parseGraphBundle(cvUtilities).signal.connections, cvUtilities.signal.connections);
  for (const type of ['attenuverter-bias', 'slew-control', 'sample-hold', 'cv-mix']) {
    assert.ok(getPrimitive(type));
  }
  const direct = GraphWorkspace.fromProject(cvUtilities);
  for (const id of [6, 7, 8, 9]) direct.remove(direct.find(id));
  direct.connect(direct.find(5).output('uni'), direct.find(10).input('cv'));
  const [chained, unchained] = await Promise.all([renderWasm(cvUtilities), renderWasm(direct.toProject())]);
  assert.ok(chained.every(Number.isFinite));
  assert.ok(chained.some((sample, index) => Math.abs(sample - unchained[index]) > 0.001));
});

test('CV compare gate and trigger are distinct JS-authored Wasm routes', async () => {
  const example = execFileSync(process.execPath,
    [new URL('../../packages/manifold-author/examples/cv-decisions.mjs', import.meta.url).pathname],
    { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(example), cvDecisions);
  assert.deepEqual(parseGraphBundle(cvDecisions).signal.connections, cvDecisions.signal.connections);
  assert.deepEqual(getPrimitive('cv-compare').outputs.map(port => port.name), ['gate', 'trig']);
  assert.ok(getPrimitive('cv-range'));
  const gateOnly = GraphWorkspace.fromProject(cvDecisions);
  gateOnly.disconnect(gateOnly.find(8).input('in-2'));
  gateOnly.connect(gateOnly.find(6).output('gate'), gateOnly.find(8).input('in-2'));
  const [pulseAudio, gateAudio] = await Promise.all([
    renderWasm(cvDecisions, 3), renderWasm(gateOnly.toProject(), 3),
  ]);
  assert.ok(pulseAudio.every(Number.isFinite));
  assert.ok(pulseAudio.some((sample, index) => Math.abs(sample - gateAudio[index]) > 0.001));
});
