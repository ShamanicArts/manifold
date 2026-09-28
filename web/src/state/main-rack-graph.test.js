import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../../../projects/main-looper/rack.json' with { type: 'json' };
import fixture from '../../../projects/main-looper/default-rack-graph.json' with { type: 'json' };
import insertFixture from '../../../projects/main-looper/default-rack-insert.json' with { type: 'json' };
import defaultSession from '../../../projects/main-looper/default-session-v16.json' with { type: 'json' };
import { initialRackDocument, connectRackPorts, disconnectRackInput,
  moveRackModule, removeRackModule, resizeRackModuleWithFlow, replaceRackInput } from './rack-document.js';
import { compileMainRackAudio, compileMainRackInsert,
  validateMainRackControlRoute, validateMainRackInsertDocument,
  withMainControlShells } from './main-rack-graph.js';

test('native default session and browser start with the same eight-shell rack', () => {
  assert.deepEqual(defaultSession.rackDocument, initialRackDocument(catalog));
  assert.equal(defaultSession.rackDocument.modules.length, 8);
});

test('Main v16 audio document accepts saved bypass but rejects backward prepared routes', () => {
  const original = initialRackDocument(catalog);
  assert.deepEqual(validateMainRackInsertDocument(original, catalog), original);
  const bypass = replaceRackInput(original, { moduleId: 'oscillator', portId: 'out' },
    { moduleId: 'fx1', portId: 'in' }, catalog);
  assert.ok(validateMainRackInsertDocument(bypass, catalog));
  const openFx1 = disconnectRackInput(original, { moduleId: 'fx1', portId: 'in' }, catalog);
  const backward = replaceRackInput(openFx1, { moduleId: 'eq', portId: 'out' },
    { moduleId: 'filter', portId: 'in' }, catalog);
  assert.throws(() => validateMainRackInsertDocument(backward, catalog), /prepared signal order/);
});

test('Main rack insertion and reflow leave DSP edges unchanged', () => {
  const original = initialRackDocument(catalog);
  const swapped = moveRackModule(original, 'oscillator', 0, 3, catalog, 1050);
  assert.deepEqual(swapped.modules.find(module => module.id === 'oscillator'),
    { ...original.modules.find(module => module.id === 'oscillator'), col: 3 });
  assert.equal(swapped.modules.find(module => module.id === 'filter').col, 1);
  assert.deepEqual(compileMainRackInsert(swapped, catalog), compileMainRackInsert(original, catalog));
  assert.deepEqual(validateMainRackInsertDocument(swapped, catalog), swapped);
  const reflowed = moveRackModule(original, 'eq', 0, 1, catalog);
  assert.ok(reflowed.modules.some(module => module.row > 1));
  assert.deepEqual(validateMainRackInsertDocument(reflowed, catalog), reflowed);
  assert.equal(moveRackModule(original, 'oscillator', 0, 4, catalog, 1050).modules
    .find(module => module.id === 'oscillator').col, 3);
  assert.throws(() => moveRackModule(original, 'oscillator', 32, 0, catalog), /position/);
  assert.deepEqual(original, initialRackDocument(catalog));
});

test('compact Filter remains the same audible Main insert and reopens as a valid shell', () => {
  const original = initialRackDocument(catalog);
  const compact = resizeRackModuleWithFlow(original, 'filter', 1, 1, catalog);
  assert.deepEqual(validateMainRackInsertDocument(compact, catalog), compact);
  assert.deepEqual(compileMainRackInsert(compact, catalog), compileMainRackInsert(original, catalog));
  const wrongSize = structuredClone(original);
  wrongSize.modules.find(module => module.id === 'fx1').w = 1;
  assert.throws(() => validateMainRackInsertDocument(wrongSize, catalog), /modules or sizes/);
});

test('authored Main default compiles to the portable Graph host fixture', () => {
  const signal = compileMainRackAudio(initialRackDocument(catalog), catalog);
  assert.deepEqual(signal, fixture.signal);
  assert.deepEqual(signal.nodes.map(({ id, type }) => [id, type]), [
    [1, 'input.raw'], [3, 'output'], [4, 'midi-input'], [5, 'main-voice-bank'],
    [6, 'svf'], [7, 'effect-slot-legacy'], [8, 'effect-slot-legacy'], [9, 'eq8'],
  ]);
});

test('Main insert uses the existing voice bank as its sole audio source', () => {
  const insert = compileMainRackInsert(initialRackDocument(catalog), catalog);
  assert.deepEqual(insert, insertFixture.signal);
  assert.deepEqual(insert.nodes.map(node => [node.id, node.type]), [
    [1, 'input.raw'], [3, 'output'], [6, 'svf'], [7, 'effect-slot-legacy'],
    [8, 'effect-slot-legacy'], [9, 'eq8'],
  ]);
  assert.ok(insert.connections.some(edge => edge.from === 1 && edge.to === 6));
  assert.ok(!insert.nodes.some(node => node.type === 'main-voice-bank'));
});

test('audio rewiring changes the compiled signal and keeps parked module state', () => {
  const original = initialRackDocument(catalog);
  let bypassed = disconnectRackInput(original, { moduleId: 'eq', portId: 'in' }, catalog);
  bypassed = replaceRackInput(bypassed, { moduleId: 'fx2', portId: 'out' },
    { moduleId: '__rackOutput', portId: 'main' }, catalog);
  const signal = compileMainRackAudio(bypassed, catalog);
  assert.ok(signal.connections.some(edge => edge.from === 8 && edge.to === 3));
  assert.ok(signal.nodes.some(node => node.id === 9 && node.type === 'eq8'));
  assert.equal(signal.initialParameters.filter(parameter => parameter.nodeId === 9).length, 42);
  assert.ok(original.connections.some(edge => edge.from.moduleId === 'eq' && edge.to.moduleId === '__rackOutput'));
});

test('LFO OUT to Filter Cutoff uses the portable graph CV edge and Main existing slot', () => {
  let rack = initialRackDocument(catalog);
  rack = connectRackPorts(rack, { moduleId: 'lfo1', portId: 'out' },
    { moduleId: 'filter', portId: 'cutoff' }, catalog);
  const signal = compileMainRackAudio(rack, catalog);
  const insert = compileMainRackInsert(rack, catalog);
  assert.ok(signal.nodes.some(node => node.id === 6 && node.type === 'modulated-svf'));
  assert.ok(signal.nodes.some(node => node.id === 11 && node.type === 'lfo'));
  assert.ok(signal.connections.some(edge => edge.from === 11 && edge.to === 6 && edge.inputPort === 1));
  assert.ok(!insert.nodes.some(node => node.id === 11));
  assert.ok(!insert.connections.some(edge => edge.from === 11));
  assert.ok(insert.nodes.some(node => node.id === 6 && node.type === 'svf'));
  assert.ok(insert.connections.some(edge => edge.from === 1 && edge.to === 6 && edge.inputPort === 0));
  assert.equal(signal.initialParameters.find(parameter => parameter.nodeId === 11 && parameter.id === 1).value, 1);
  assert.deepEqual(validateMainRackInsertDocument(rack, catalog), rack);
  assert.equal(validateMainRackControlRoute(rack, { atv: { slot: 0, port: 0 }, lfos: [{ slot: 0,
    route: { source: 0, target: 22, enabled: true } }] }), rack);
  assert.throws(() => validateMainRackControlRoute(rack, { atv: { slot: 0, port: 0 }, lfos: [{ slot: 0,
    route: { source: 0, target: 22, enabled: false } }] }), /disagree/);
});

test('older six-shell Main documents gain LFO 1 and ATV without changing their audio cables', () => {
  const current = initialRackDocument(catalog);
  const old = removeRackModule(removeRackModule(current, 'atv1', catalog), 'lfo1', catalog);
  const migrated = withMainControlShells(old, catalog);
  assert.equal(migrated.modules.length, 8);
  assert.deepEqual(migrated.connections, old.connections);
  assert.deepEqual(compileMainRackInsert(migrated, catalog), compileMainRackInsert(old, catalog));
});

test('ATV OUT to Filter Cutoff names the prepared Rust source without adding a graph node', () => {
  const original = initialRackDocument(catalog);
  const routed = connectRackPorts(original, { moduleId: 'atv1', portId: 'out' },
    { moduleId: 'filter', portId: 'cutoff' }, catalog);
  assert.deepEqual(compileMainRackInsert(routed, catalog), compileMainRackInsert(original, catalog));
  assert.equal(validateMainRackControlRoute(routed, { atv: { slot: 0, port: 0 },
    lfos: [{ slot: 0, route: { source: 4, target: 22, enabled: true } }] }), routed);
  assert.throws(() => validateMainRackControlRoute(routed, { atv: { slot: 1, port: 0 },
    lfos: [{ slot: 0, route: { source: 4, target: 22, enabled: true } }] }), /disagree/);
  assert.throws(() => compileMainRackAudio(routed, catalog), /no DSP mapping/);
});

test('unsupported voice and control ports fail before publication', () => {
  const original = initialRackDocument(catalog);
  const noVoice = disconnectRackInput(original, { moduleId: 'oscillator', portId: 'voice' }, catalog);
  assert.throws(() => compileMainRackAudio(noVoice, catalog), /voice rewiring/);
  const withLfo = original;
  const inverse = connectRackPorts(withLfo, { moduleId: 'lfo1', portId: 'inv' },
    { moduleId: 'filter', portId: 'cutoff' }, catalog);
  assert.throws(() => compileMainRackAudio(inverse, catalog), /no DSP mapping/);
  assert.throws(() => compileMainRackInsert(inverse, catalog), /no prepared route/);
  const resonance = connectRackPorts(withLfo, { moduleId: 'lfo1', portId: 'out' },
    { moduleId: 'filter', portId: 'resonance' }, catalog);
  assert.throws(() => compileMainRackAudio(resonance, catalog), /no DSP mapping/);
  const noFx1Audio = disconnectRackInput(original, { moduleId: 'fx1', portId: 'in' }, catalog);
  const auxiliary = connectRackPorts(noFx1Audio, { moduleId: 'filter', portId: 'send' },
    { moduleId: 'fx1', portId: 'recv' }, catalog);
  assert.throws(() => compileMainRackAudio(auxiliary, catalog), /no audio compiler/);
});
