import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../../../projects/main-looper/rack.json' with { type: 'json' };
import { initialRackDocument, validateRackDocument, setRackViewMode, placeRackModule,
  moveRackModule, resizeRackModule, addRackModule, removeRackModule, connectRackPorts, replaceRackInput,
  disconnectRackInput } from './rack-document.js';

test('legacy Main default chain is a validated typed rack document', () => {
  const rack = initialRackDocument(catalog);
  assert.equal(rack.modules.length, 6);
  assert.deepEqual(rack.connections.map(({ id }) => id), [
    'midi_in_to_adsr', 'adsr_to_oscillator', 'oscillator_to_filter', 'filter_to_fx1',
    'fx1_to_fx2', 'fx2_to_eq', 'eq_to_output',
  ]);
  assert.ok(catalog.catalog.adsr.ports.outputs.some(port => port.id === 'env' && port.kind === 'cv'));
  assert.ok(catalog.catalog.source.ports.outputs.some(port => port.id === 'sub' && port.kind === 'audio'));
  assert.ok(catalog.catalog.filter.ports.inputs.some(port => port.id === 'env' && port.kind === 'cv'));
  assert.ok(catalog.catalog.filter.ports.outputs.some(port => port.id === 'cutoff' && port.parameter));
  assert.ok(catalog.catalog.fx1.ports.inputs.some(port => port.id === 'recv'));
  assert.ok(!catalog.catalog.fx2.ports.inputs.some(port => port.id === 'recv'));
  const patch = setRackViewMode(rack, 'patch', catalog);
  assert.equal(patch.viewMode, 'patch');
  assert.deepEqual(patch.connections, rack.connections);
  assert.deepEqual(validateRackDocument(JSON.parse(JSON.stringify(patch)), catalog), patch);
  const duplicateDspId = structuredClone(rack);
  duplicateDspId.modules[1].nodeId = duplicateDspId.modules[0].nodeId;
  assert.throws(() => validateRackDocument(duplicateDspId, catalog), /duplicate module or DSP node id/);
});

test('module edits retain identity and reject collisions', () => {
  const rack = initialRackDocument(catalog);
  const moved = placeRackModule(rack, 'eq', 2, 0, catalog);
  assert.equal(moved.modules.find(({ id }) => id === 'eq').row, 2);
  assert.equal(rack.modules.find(({ id }) => id === 'eq').row, 1);
  assert.throws(() => placeRackModule(rack, 'eq', 0, 1, catalog), /overlapping/);
  assert.throws(() => resizeRackModule(rack, 'adsr', 2, 1, catalog), /overlapping/);
  assert.throws(() => placeRackModule(rack, 'missing', 2, 0, catalog), /missing module/);
});

test('occupied drops insert into legacy row flow; free drops keep sparse slots', () => {
  const rack = initialRackDocument(catalog);
  const positions = document => Object.fromEntries(document.modules.map(({ id, row, col }) =>
    [id, `${row},${col}`]));
  assert.deepEqual(positions(moveRackModule(rack, 'fx1', 0, 1, catalog, 400)), {
    adsr: '0,0', oscillator: '0,3', filter: '1,0', fx1: '0,1', fx2: '1,2', eq: '1,4',
  });
  assert.deepEqual(positions(moveRackModule(rack, 'oscillator', 0, 3, catalog, 1050)), {
    adsr: '0,0', oscillator: '0,3', filter: '0,1', fx1: '1,0', fx2: '1,2', eq: '1,4',
  });
  assert.deepEqual(positions(moveRackModule(rack, 'eq', 2, 0, catalog)), {
    adsr: '0,0', oscillator: '0,1', filter: '0,3', fx1: '1,0', fx2: '1,2', eq: '2,0',
  });
});

test('typed CV connection can be added and unpatched without altering audio chain', () => {
  const rack = initialRackDocument(catalog);
  const withLfo = addRackModule(rack, { id: 'lfo1', nodeId: 11, type: 'lfo', row: 2, col: 0, w: 1, h: 1 }, catalog);
  const connected = connectRackPorts(withLfo,
    { moduleId: 'lfo1', portId: 'out' }, { moduleId: 'filter', portId: 'cutoff' }, catalog);
  assert.equal(connected.connections.length, rack.connections.length + 1);
  assert.throws(() => connectRackPorts(connected,
    { moduleId: 'lfo1', portId: 'inv' }, { moduleId: 'filter', portId: 'cutoff' }, catalog), /occupied input/);
  assert.throws(() => connectRackPorts(withLfo,
    { moduleId: 'oscillator', portId: 'out' }, { moduleId: 'filter', portId: 'cutoff' }, catalog), /port type/);
  const replaced = replaceRackInput(connected,
    { moduleId: 'lfo1', portId: 'inv' }, { moduleId: 'filter', portId: 'cutoff' }, catalog);
  assert.equal(replaced.connections.find(({ to }) => to.portId === 'cutoff').from.portId, 'inv');
  assert.equal(connected.connections.find(({ to }) => to.portId === 'cutoff').from.portId, 'out');
  assert.throws(() => replaceRackInput(connected,
    { moduleId: 'oscillator', portId: 'out' }, { moduleId: 'filter', portId: 'cutoff' }, catalog), /port type/);
  assert.equal(connected.connections.length, rack.connections.length + 1);
  const unplugged = disconnectRackInput(connected, { moduleId: 'filter', portId: 'cutoff' }, catalog);
  assert.deepEqual(unplugged.connections, rack.connections);
  assert.equal(removeRackModule(connected, 'lfo1', catalog).connections.length, rack.connections.length);
});

test('connections reject cycles, reversed ports, and absent endpoints', () => {
  const rack = initialRackDocument(catalog);
  const shortened = disconnectRackInput(rack, { moduleId: 'fx1', portId: 'in' }, catalog);
  assert.throws(() => connectRackPorts(shortened,
    { moduleId: 'fx2', portId: 'out' }, { moduleId: 'fx1', portId: 'in' }, catalog), /cycle/);
  assert.throws(() => connectRackPorts(rack,
    { moduleId: 'filter', portId: 'in' }, { moduleId: 'fx1', portId: 'in' }, catalog), /port type or direction/);
  assert.throws(() => connectRackPorts(rack,
    { moduleId: 'unknown', portId: 'out' }, { moduleId: 'filter', portId: 'cutoff' }, catalog), /connection/);
});
