import assert from 'node:assert/strict';
import { MidiHoldState } from '../web/src/audio/midi-hold.js';

const holds = new MidiHoldState();
const on = (device, channel, note) => holds.note(device, 'on', channel, note, 100);
const off = (device, channel, note) => holds.note(device, 'off', channel, note, 0);

assert.equal(on('a', 0, 60).events[0].kind, 'on');
assert.deepEqual(holds.sustain('a', 0, true), []);
assert.equal(off('a', 0, 60).deferred, true);
assert.equal(holds.hasHeldNotes, true);
assert.deepEqual(holds.sustain('a', 0, false), [{ kind: 'off', channel: 0, note: 60, velocity: 0 }]);
assert.equal(holds.hasHeldNotes, false);

on('a', 0, 60);
holds.sustain('a', 0, true);
off('a', 0, 60);
assert.equal(on('a', 0, 60).events[0].kind, 'on');
assert.deepEqual(holds.sustain('a', 0, false), []);
assert.equal(off('a', 0, 60).events[0].kind, 'off');

on('a', 0, 64);
assert.deepEqual(on('b', 0, 64).events, []);
holds.sustain('a', 0, true);
assert.equal(off('a', 0, 64).deferred, true);
assert.deepEqual(off('b', 0, 64).events, []);
assert.equal(holds.sustain('a', 0, false)[0].note, 64);

on('a', 0, 67);
holds.sustain('a', 0, true);
off('a', 0, 67);
assert.equal(holds.disconnect('a')[0].note, 67);
assert.equal(holds.hasHeldNotes, false);

const keyboard = Symbol('keyboard');
on(keyboard, 15, 72);
assert.deepEqual(on('b', 15, 72).events, []);
assert.deepEqual(off(keyboard, 15, 72).events, []);
assert.equal(off('b', 15, 72).events[0].note, 72);

on('a', 0, 60);
on('a', 1, 60);
holds.sustain('a', 0, true);
assert.equal(off('a', 0, 60).deferred, true);
assert.equal(off('a', 1, 60).events[0].channel, 1);
assert.equal(holds.sustain('a', 0, false)[0].channel, 0);
assert.deepEqual(off('a', 0, 60).events, []);

on('keyboard-device', 0, 62);
holds.sustain('pedal-device', 0, true);
assert.equal(off('keyboard-device', 0, 62).deferred, true);
assert.equal(holds.sustain('pedal-device', 0, false)[0].note, 62);

on('keyboard-device', 0, 65);
holds.sustain('pedal-a', 0, true);
holds.sustain('pedal-b', 0, true);
assert.equal(off('keyboard-device', 0, 65).deferred, true);
assert.deepEqual(holds.sustain('pedal-a', 0, false), []);
assert.equal(holds.disconnect('pedal-b')[0].note, 65);
assert.equal(holds.hasHeldNotes, false);

on('keyboard-device', 0, 69);
holds.sustain('pedal-device', 0, true);
assert.equal(off('keyboard-device', 0, 69).deferred, true);
assert.equal(on('other-keyboard', 0, 69).events[0].kind, 'on');
assert.deepEqual(holds.sustain('pedal-device', 0, false), []);
assert.equal(off('other-keyboard', 0, 69).events[0].kind, 'off');
console.log('MIDI sustain, retrigger, channel merge, device overlap, disconnect, and keyboard ownership passed');
