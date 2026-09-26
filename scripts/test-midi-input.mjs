import assert from 'node:assert/strict';
import { BrowserMidiInput } from '../web/src/audio/midi-input.js';

const keys = ['isSecureContext', 'navigator', 'document'];
const previous = Object.fromEntries(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const setGlobal = (key, value) => Object.defineProperty(globalThis, key,
  { configurable: true, writable: true, value });

try {
  setGlobal('isSecureContext', true);
  setGlobal('document', { permissionsPolicy: { allowsFeature: () => true } });
  let resolveAccess;
  let requests = 0;
  setGlobal('navigator', {
    requestMIDIAccess: () => {
      ++requests;
      return new Promise((resolve) => { resolveAccess = resolve; });
    },
  });
  const statuses = [];
  const states = [];
  const midi = new BrowserMidiInput(() => {}, () => {},
    (message) => statuses.push(message), () => {}, () => {},
    () => states.push([midi.pending, midi.listening]));
  const pending = midi.connect();
  assert.equal(midi.pending, true);
  assert.equal(midi.listening, false);
  await midi.connect();
  assert.equal(requests, 1, 'a second click must not stack permission prompts');
  midi.stop();
  resolveAccess({ inputs: new Map(), onstatechange: null });
  await pending;
  assert.equal(midi.pending, false);
  assert.equal(midi.listening, false, 'late permission must not reconnect after stop');
  assert.deepEqual(states, [[true, false], [false, false]]);
  assert.match(statuses.at(-1), /stopped/);
  console.log('MIDI pending-request cancellation: pass');
} finally {
  for (const [key, descriptor] of Object.entries(previous)) {
    if (descriptor === undefined) delete globalThis[key];
    else Object.defineProperty(globalThis, key, descriptor);
  }
}
