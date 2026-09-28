import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../../../projects/main-looper/rack.json' with { type: 'json' };
import fixture from '../../../projects/main-looper/default-rack-graph.json' with { type: 'json' };
import insertFixture from '../../../projects/main-looper/default-rack-insert.json' with { type: 'json' };
import { initialRackDocument, addRackModule, connectRackPorts, disconnectRackInput,
  replaceRackInput } from './rack-document.js';
import { compileMainRackAudio, compileMainRackInsert } from './main-rack-graph.js';

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

test('LFO OUT to Filter Cutoff creates an audible control edge', () => {
  let rack = addRackModule(initialRackDocument(catalog),
    { id: 'lfo1', nodeId: 11, type: 'lfo', row: 2, col: 0, w: 1, h: 1 }, catalog);
  rack = connectRackPorts(rack, { moduleId: 'lfo1', portId: 'out' },
    { moduleId: 'filter', portId: 'cutoff' }, catalog);
  const signal = compileMainRackAudio(rack, catalog);
  const insert = compileMainRackInsert(rack, catalog);
  assert.ok(signal.nodes.some(node => node.id === 6 && node.type === 'modulated-svf'));
  assert.ok(signal.nodes.some(node => node.id === 11 && node.type === 'lfo'));
  assert.ok(signal.connections.some(edge => edge.from === 11 && edge.to === 6 && edge.inputPort === 1));
  assert.ok(insert.connections.some(edge => edge.from === 11 && edge.to === 6 && edge.inputPort === 1));
  assert.ok(insert.connections.some(edge => edge.from === 1 && edge.to === 6 && edge.inputPort === 0));
  assert.equal(signal.initialParameters.find(parameter => parameter.nodeId === 11 && parameter.id === 1).value, 1);
});

test('unsupported voice and control ports fail before publication', () => {
  const original = initialRackDocument(catalog);
  const noVoice = disconnectRackInput(original, { moduleId: 'oscillator', portId: 'voice' }, catalog);
  assert.throws(() => compileMainRackAudio(noVoice, catalog), /voice rewiring/);
  const withLfo = addRackModule(original,
    { id: 'lfo1', nodeId: 11, type: 'lfo', row: 2, col: 0, w: 1, h: 1 }, catalog);
  const inverse = connectRackPorts(withLfo, { moduleId: 'lfo1', portId: 'inv' },
    { moduleId: 'filter', portId: 'cutoff' }, catalog);
  assert.throws(() => compileMainRackAudio(inverse, catalog), /no DSP mapping/);
  const resonance = connectRackPorts(withLfo, { moduleId: 'lfo1', portId: 'out' },
    { moduleId: 'filter', portId: 'resonance' }, catalog);
  assert.throws(() => compileMainRackAudio(resonance, catalog), /no DSP mapping/);
  const noFx1Audio = disconnectRackInput(original, { moduleId: 'fx1', portId: 'in' }, catalog);
  const auxiliary = connectRackPorts(noFx1Audio, { moduleId: 'filter', portId: 'send' },
    { moduleId: 'fx1', portId: 'recv' }, catalog);
  assert.throws(() => compileMainRackAudio(auxiliary, catalog), /no audio compiler/);
});
