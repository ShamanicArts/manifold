import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JsonLineDecoder, defineNetwork } from '../../packages/manifold-author/host-services.js';
import { LiveProjectRuntime } from '../../packages/manifold-author/live-project.js';
import { source } from '../../packages/manifold-author/examples/network-services.mjs';

test('explicit network declaration registers a mapper without opening services and saves only settings', async () => {
  const network = defineNetwork({ udp: '127.0.0.1:0' });
  assert.equal(network.handler, null);
  assert.throws(() => network.onEvent(null), /must be a function/);
  assert.equal(network.onEvent(() => null), network);
  const runtime = new LiveProjectRuntime(null, source);
  assert.deepEqual(Object.keys(runtime.save().network).sort(), ['link', 'osc', 'oscQuery', 'tcp', 'udp']);
  await runtime.request({ operation: 'network.receive', event: { type: 'udp', message: { path: '/network/tone', value: 440 } } });
  const saved = runtime.save();
  await assert.rejects(runtime.request({ operation: 'source.apply', source: source.replace('return { graph, view, network };', 'return { graph, view, network, onNetwork };') }), /network.onEvent only/);
  assert.deepEqual(runtime.save(), saved);
  await runtime.request({ operation: 'source.apply', source: source.replace('network.onEvent(onNetwork);', '') });
  await runtime.request({ operation: 'network.receive', event: { type: 'udp', message: { path: '/network/tone', value: 880 } } });
  assert.equal(runtime.presentation().parameters.find(p => p.path === '/network/tone').value, 440);
  assert.deepEqual(runtime.save().network, saved.network);
});

test('TCP framing preserves split UTF-8 and coalesced messages', () => {
  const decoder = new JsonLineDecoder();
  const bytes = new TextEncoder().encode('{"label":"é"}\n{"value":4}\n');
  const split = bytes.indexOf(0xc3) + 1;
  assert.deepEqual(decoder.push(bytes.slice(0, split)), []);
  assert.deepEqual(decoder.push(bytes.slice(split)), [{ label: 'é' }, { value: 4 }]);
  assert.throws(() => new JsonLineDecoder(2).push([1, 2, 3]), /limit/);
});

test('network control replies only after audio acceptance and rejects unknown/out-of-range paths', async () => {
  let acknowledge;
  const runtime = new LiveProjectRuntime({ ready: true, setParameter: () => new Promise(resolve => { acknowledge = resolve; }) }, source);
  const request = runtime.request({ operation: 'network.receive', event: { type: 'udp', message: { path: '/network/tone', value: 440 } }, origin: 'udp' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(runtime.presentation().parameters.find(p => p.path === '/network/tone').value, 220);
  acknowledge(true);
  const accepted = await request;
  assert.equal(accepted.networkReply.accepted, true);
  assert.equal(runtime.presentation().parameters.find(p => p.path === '/network/tone').value, 440);
  const revision = runtime.revision;
  await assert.rejects(runtime.request({ operation: 'network.receive', event: { type: 'osc', path: '/missing', args: [4] } }), /Unknown parameter/);
  await assert.rejects(runtime.request({ operation: 'network.receive', event: { type: 'udp', message: { path: '/network/tone', value: 99999 } } }));
  assert.equal(runtime.revision, revision);
});

test('source replacement removes network handlers without retaining old subscriptions', async () => {
  const runtime = new LiveProjectRuntime(null, source);
  await runtime.request({ operation: 'source.apply', source: source.replace('return { graph, view, network };', 'return { graph, view };') });
  const revision = runtime.revision;
  await runtime.request({ operation: 'network.receive', event: { type: 'udp', message: { path: '/network/tone', value: 440 } } });
  assert.equal(runtime.revision, revision);
  assert.equal(runtime.presentation().parameters.find(p => p.path === '/network/tone').value, 220);
});

test('network intent survives save, source edits, restore and undo without saving socket handles', async () => {
  const runtime = new LiveProjectRuntime(null, source);
  await runtime.request({ operation: 'network.configure', settings: { link: { enabled: true, quantum: 8 } } });
  const saved = runtime.save();
  assert.equal(saved.network.link.enabled, true);
  assert.equal(new LiveProjectRuntime(null, source, saved).snapshot().network.link.quantum, 8);
  await runtime.request({ operation: 'source.apply', source: '// readable edit\n' + source });
  assert.equal(runtime.snapshot().network.link.enabled, true);
  await runtime.request({ operation: 'project.undo' });
  assert.equal(runtime.snapshot().network.link.quantum, 8);
  await assert.rejects(runtime.request({ operation: 'network.configure', settings: { link: { tempo: -2 } } }));
  assert.equal(runtime.snapshot().network.link.quantum, 8);
});

test('Link start/stop and tempo map atomically to core controls', async () => {
  const runtime = new LiveProjectRuntime(null, source);
  await runtime.request({ operation: 'network.receive', event: { type: 'link', state: { tempo: 180, tempoSync: true, startStopSync: true, playing: false } } });
  const parameters = runtime.presentation().parameters;
  assert.equal(parameters.find(p => p.path === '/network/pulse').value, 3);
  assert.equal(parameters.find(p => p.path === '/network/play').value, 0);
});
