import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../../../projects/main-looper/rack.json' with { type: 'json' };
import { initialRackDocument, validateRackDocument, setRackViewMode, placeRackModule,
  moveRackModule, resizeRackModule, resizeRackModuleWithFlow, removeRackModule,
  connectRackPorts, replaceRackInput,
  disconnectRackInput } from './rack-document.js';

test('legacy Main default chain is a validated typed rack document', () => {
  const rack = initialRackDocument(catalog);
  assert.equal(rack.modules.length, 10);
  assert.equal(rack.modules.find(module => module.id === 'lfo1').row, 2);
  assert.equal(rack.modules.find(module => module.id === 'atv1').col, 1);
  assert.equal(rack.modules.find(module => module.id === 'slew1').col, 2);
  assert.deepEqual(rack.connections.map(({ id }) => id), [
    'midi_in_to_adsr', 'adsr_to_oscillator', 'oscillator_to_filter', 'filter_to_fx1',
    'fx1_to_fx2', 'fx2_to_eq', 'eq_to_output', 'lfo1_to_atv1', 'lfo1_to_slew1', 'lfo1_to_sample_hold1', 'lfo1_eoc_to_sample_hold1',
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
  const moved = placeRackModule(rack, 'eq', 2, 4, catalog);
  assert.equal(moved.modules.find(({ id }) => id === 'eq').row, 2);
  assert.equal(rack.modules.find(({ id }) => id === 'eq').row, 1);
  assert.throws(() => placeRackModule(rack, 'eq', 0, 1, catalog), /overlapping/);
  assert.throws(() => resizeRackModule(rack, 'adsr', 2, 1, catalog), /overlapping/);
  assert.throws(() => placeRackModule(rack, 'missing', 2, 0, catalog), /missing module/);
});

test('occupied drops insert into legacy row flow; free drops keep sparse slots', () => {
  const rack = initialRackDocument(catalog);
  const positions = document => Object.fromEntries(document.modules.filter(module => !['lfo1', 'atv1', 'slew1', 'sample_hold1'].includes(module.id)).map(({ id, row, col }) =>
    [id, `${row},${col}`]));
  assert.deepEqual(positions(moveRackModule(rack, 'fx1', 0, 1, catalog, 400)), {
    adsr: '0,0', oscillator: '0,3', filter: '1,0', fx1: '0,1', fx2: '1,2', eq: '1,4',
  });
  assert.deepEqual(positions(moveRackModule(rack, 'oscillator', 0, 3, catalog, 1050)), {
    adsr: '0,0', oscillator: '0,3', filter: '0,1', fx1: '1,0', fx2: '1,2', eq: '1,4',
  });
  assert.deepEqual(positions(moveRackModule(rack, 'eq', 2, 4, catalog)), {
    adsr: '0,0', oscillator: '0,1', filter: '0,3', fx1: '1,0', fx2: '1,2', eq: '2,4',
  });
});

test('dropping an earlier shell on the next shell midpoint visibly reflows the row', () => {
  const rack = initialRackDocument(catalog);
  const positions = document => Object.fromEntries(document.modules.filter(module => !['lfo1', 'atv1', 'slew1', 'sample_hold1'].includes(module.id)).map(({ id, row, col }) =>
    [id, `${row},${col}`]));
  assert.deepEqual(positions(moveRackModule(rack, 'adsr', 0, 1, catalog, 472)), {
    adsr: '0,2', oscillator: '0,0', filter: '0,3',
    fx1: '1,0', fx2: '1,2', eq: '1,4',
  });
  assert.deepEqual(positions(moveRackModule(rack, 'oscillator', 0, 3, catalog, 944)), {
    adsr: '0,0', oscillator: '0,3', filter: '0,1',
    fx1: '1,0', fx2: '1,2', eq: '1,4',
  });
  assert.deepEqual(rack, initialRackDocument(catalog));
});

test('Filter width toggles through an occupied cell and preserves module identities', () => {
  const rack = initialRackDocument(catalog);
  const compact = resizeRackModuleWithFlow(rack, 'filter', 1, 1, catalog);
  assert.deepEqual(compact.modules.find(module => module.id === 'filter'),
    { ...rack.modules.find(module => module.id === 'filter'), w: 1 });
  const withEq = placeRackModule(compact, 'eq', 0, 4, catalog);
  const wide = resizeRackModuleWithFlow(withEq, 'filter', 2, 1, catalog);
  assert.equal(wide.modules.find(module => module.id === 'filter').w, 2);
  assert.notDeepEqual(wide.modules.find(module => module.id === 'eq'),
    withEq.modules.find(module => module.id === 'eq'));
  assert.deepEqual(wide.connections, rack.connections);
  assert.deepEqual(new Set(wide.modules.map(module => module.id)),
    new Set(rack.modules.map(module => module.id)));
});

test('typed CV connection can be added and unpatched without altering audio chain', () => {
  const rack = initialRackDocument(catalog);
  const withLfo = rack;
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
  assert.ok(removeRackModule(connected, 'lfo1', catalog).connections.every(edge => edge.from.moduleId !== 'lfo1'));
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
