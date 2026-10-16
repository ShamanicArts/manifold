import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioInputDevice } from '../src/audio/audio-input-device.js';

test('hardware rejection, disconnect, reconnect and late permission responses retain coherent input ownership', async () => {
  const tracks = [];
  let delayed;
  const media = {
    enumerateDevices: async () => [],
    async getUserMedia({ audio }) {
      const id = audio.deviceId?.exact ?? 'default';
      if (id === 'reject') throw new Error('Permission denied');
      const track = {
        stopped: false,
        stop() {
          this.stopped = true;
        },
      };
      const stream = { id, getTracks: () => [track] };
      tracks.push(track);
      if (id === 'late')
        return new Promise((resolve) => {
          delayed = () => resolve(stream);
        });
      return stream;
    },
  };
  let connected;
  const context = { createMediaStreamSource: (stream) => ({ stream, disconnect() {} }) };
  const input = new AudioInputDevice(media);
  input.bind(context, (node) => {
    connected = node;
  });
  await input.select('default');
  assert.equal(connected.stream.id, 'default');
  await assert.rejects(input.select('reject'), /Permission denied/);
  assert.equal(connected.stream.id, 'default');
  assert.equal(input.snapshot().input, 'default');
  assert.equal(tracks[0].stopped, false);
  await input.select('second');
  assert.equal(tracks[0].stopped, true);
  await input.select('');
  assert.equal(connected, null);
  await input.select('default');
  assert.equal(connected.stream.id, 'default');
  const pending = input.select('late');
  input.close();
  delayed();
  await pending;
  assert.equal(input.snapshot().input, '');
  assert.equal(connected, null);
  assert.ok(tracks.every((track) => track.stopped));
});
