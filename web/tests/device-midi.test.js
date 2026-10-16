import test from 'node:test';
import assert from 'node:assert/strict';
import { DeviceMidiInput } from '../../packages/manifold-author/device-midi.js';
import { LiveProjectRuntime } from '../../packages/manifold-author/live-project.js';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../handbook/examples/instrument.mjs', import.meta.url),
  'utf8',
);
test('Studio Device events reach the declared MIDI input and preserve performer ownership', async () => {
  const events = [];
  const runtime = new LiveProjectRuntime(
    {
      ready: true,
      sendEvent: async (event) => {
        events.push(event);
        return true;
      },
    },
    source,
  );
  const send = (event) => runtime.request({ operation: 'event.send', event });
  await send({ type: 'note-on', note: 60, owner: 'keyboard' });
  await send({ type: 'note-on', note: 60, owner: 'agent' });
  await send({ type: 'panic', owner: 'keyboard' });
  assert.deepEqual(
    events.map((e) => e.kind),
    [0, 0],
  );
  await send({ type: 'note-off', note: 60, owner: 'agent' });
  await runtime.request({ operation: 'event.midi', bytes: [0xe0, 0, 64], owner: 'hardware' });
  assert.deepEqual(
    events.map((e) => e.kind),
    [0, 0, 1, 3],
  );
  const input = runtime.project.signal.nodes.find((n) => n.type === 'midi-input');
  assert.ok(events.every((e) => e.nodeId === input.id));
  assert.equal(events.at(-1).velocity, 64);
  await assert.rejects(send({ type: 'note-on', note: 200 }), /MIDI/);
  assert.equal(events.length, 4);
});

test('pedal release and partial rejected panic retain enough ownership to retry', async () => {
  const input = new DeviceMidiInput(),
    events = [];
  let reject = false;
  const host = {
    ready: true,
    sendEvent: async (e) => {
      if (reject && e.note === 64) return false;
      events.push(e);
      return true;
    },
  };
  const send = (event) => input.send(host, 4, { owner: 'keys', ...event });
  await send({ type: 'note-on', note: 60 });
  await send({ type: 'sustain', down: true });
  await send({ type: 'note-off', note: 60 });
  assert.equal(events.length, 1);
  await send({ type: 'sustain', down: false });
  assert.equal(events.at(-1).kind, 1);
  await send({ type: 'note-on', note: 60 });
  await send({ type: 'note-on', note: 64 });
  reject = true;
  await assert.rejects(send({ type: 'panic' }), /rejected/);
  assert.equal(events.at(-1).note, 60);
  const count = events.length;
  reject = false;
  await send({ type: 'panic' });
  assert.equal(events.length, count + 1);
  assert.equal(events.at(-1).note, 64);
});
