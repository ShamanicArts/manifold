import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../../../projects/main-looper/rack.json' with { type: 'json' };
import fixture from '../../../projects/main-looper/default-rack-graph.json' with { type: 'json' };
import { initialRackDocument, addRackModule, connectRackPorts, disconnectRackInput,
  replaceRackInput } from './rack-document.js';
import { compileMainRackAudio } from './main-rack-graph.js';

test('authored Main default compiles to the portable Graph host fixture', () => {
  const signal = compileMainRackAudio(initialRackDocument(catalog), catalog);
  assert.deepEqual(signal, fixture.signal);
  assert.deepEqual(signal.nodes.map(({ id, type }) => [id, type]), [
    [1, 'input.raw'], [3, 'output'], [4, 'midi-input'], [5, 'main-voice-bank'],
    [6, 'svf'], [7, 'effect-slot-legacy'], [8, 'effect-slot-legacy'], [9, 'eq8'],
  ]);
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

test('unsupported voice and CV edits fail before publication', () => {
  const original = initialRackDocument(catalog);
  const noVoice = disconnectRackInput(original, { moduleId: 'oscillator', portId: 'voice' }, catalog);
  assert.throws(() => compileMainRackAudio(noVoice, catalog), /voice rewiring/);
  let withLfo = addRackModule(original,
    { id: 'lfo1', nodeId: 11, type: 'lfo', row: 2, col: 0, w: 1, h: 1 }, catalog);
  withLfo = connectRackPorts(withLfo, { moduleId: 'lfo1', portId: 'out' },
    { moduleId: 'filter', portId: 'cutoff' }, catalog);
  assert.throws(() => compileMainRackAudio(withLfo, catalog), /not compiled into audio yet/);
});
