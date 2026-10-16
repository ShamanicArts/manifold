import test from 'node:test';
import assert from 'node:assert/strict';
import { GraphWorkspace, createGraphWorkspace } from '@manifold/author';
import { validateGraphAssets } from '../src/graph/topology.js';
import { encodeSampleAsset, decodeSampleAsset, validateSampleAsset } from
  '../../packages/manifold-author/sample-assets.js';

function asset(value, frames = 4) {
  return encodeSampleAsset(4, new Float32Array(frames * 2).fill(value), 48000, 'take');
}

function countDecodes(run) {
  const original = globalThis.atob;
  let calls = 0;
  globalThis.atob = (...args) => { calls++; return original(...args); };
  try { run(); return calls; } finally { globalThis.atob = original; }
}

test('repeated project validation avoids decoding identical PCM but rejects changed payloads', () => {
  const graph = createGraphWorkspace();
  const loop = graph.add('loop-capture', { id: 4 });
  graph.connect(loop.output('out'), graph.output.input('in'));
  const project = { ...graph.toProject(), assets: [asset(0.137)] };
  assert.equal(countDecodes(() => GraphWorkspace.fromProject(project)), 1);
  assert.equal(countDecodes(() => GraphWorkspace.fromProject(structuredClone(project))), 0);
  const bytes = Buffer.from(project.assets[0].pcmF32Base64, 'base64');
  bytes.writeFloatLE(Infinity, 0);
  const invalid = { ...project.assets[0], pcmF32Base64: bytes.toString('base64') };
  assert.throws(() => GraphWorkspace.fromProject({ ...project, assets: [invalid] }),
    { code: 'invalid-asset' });
  assert.deepEqual(GraphWorkspace.fromProject(project).toProject(), project);
});

test('cached payload never authorizes invalid metadata, keys, or a different byte count', () => {
  const take = asset(-0.281);
  validateSampleAsset(take);
  for (const patch of [{ nodeId: 0 }, { nodeId: 0x100000000 }, { sourceRate: 0 },
    { frames: take.frames + 1 }, { extra: true }]) {
    assert.throws(() => validateSampleAsset({ ...take, ...patch }), TypeError);
    assert.throws(() => decodeSampleAsset({ ...take, ...patch }), TypeError);
  }
  assert.equal(countDecodes(() => validateSampleAsset({ ...take, nodeId: 6,
    sourceRate: 44100, label: 'renamed' })), 0);
});

test('decoded PCM is fresh and caller mutation cannot corrupt validation or future decodes', () => {
  const take = asset(0.319);
  validateSampleAsset(take);
  const decoded = decodeSampleAsset(take);
  decoded.stereo.fill(NaN);
  const fresh = decodeSampleAsset(take);
  assert.ok(fresh.stereo.every(value => value === Math.fround(0.319)));
  assert.notEqual(fresh.stereo.buffer, decoded.stereo.buffer);
  const changed = { ...take, pcmF32Base64: '!'.repeat(take.pcmF32Base64.length) };
  assert.throws(() => validateSampleAsset(changed), TypeError);
});

test('validation captures accessor values once and retains independent asset records', () => {
  const take = asset(0.363);
  validateSampleAsset(take);
  let reads = 0;
  const accessor = { ...take, get pcmF32Base64() {
    return reads++ === 0 ? take.pcmF32Base64 : '!'.repeat(take.pcmF32Base64.length);
  } };
  assert.ok(decodeSampleAsset(accessor).stereo.every(value => value === Math.fround(0.363)));
  assert.equal(reads, 1);
  const graph = createGraphWorkspace();
  const loop = graph.add('loop-capture', { id: 4 });
  graph.connect(loop.output('out'), graph.output.input('in'));
  const project = { ...graph.toProject(), assets: [take] };
  const reopened = GraphWorkspace.fromProject(project);
  take.pcmF32Base64 = '!'.repeat(take.pcmF32Base64.length);
  assert.ok(decodeSampleAsset(reopened.toProject().assets[0]).stereo.every(value =>
    value === Math.fround(0.363)));
  assert.throws(() => GraphWorkspace.fromProject(project), { code: 'invalid-asset' });
});

test('padding aliases and nonfinite PCM remain invalid on cold and repeated validation', () => {
  const take = asset(0.427, 1);
  validateSampleAsset(take);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const tail = take.pcmF32Base64.length - 2;
  const alias = take.pcmF32Base64.slice(0, tail)
    + alphabet[alphabet.indexOf(take.pcmF32Base64[tail]) + 1] + '=';
  assert.deepEqual(Buffer.from(alias, 'base64'), Buffer.from(take.pcmF32Base64, 'base64'));
  for (const value of [NaN, Infinity, -Infinity]) {
    const bytes = Buffer.from(take.pcmF32Base64, 'base64');
    bytes.writeFloatLE(value, 0);
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.throws(() => validateSampleAsset({ ...take, pcmF32Base64: bytes.toString('base64') }), TypeError);
    }
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.throws(() => validateSampleAsset({ ...take, pcmF32Base64: alias }), TypeError);
  }
});

test('validation retention is bounded by eight payloads', () => {
  const takes = Array.from({ length: 9 }, (_, index) => asset(0.51 + index / 100));
  for (const take of takes) validateSampleAsset(take);
  assert.equal(countDecodes(() => validateSampleAsset(takes.at(-1))), 0);
  assert.equal(countDecodes(() => validateSampleAsset(takes[0])), 1);
});

test('payloads exceeding the retention byte budget validate without entering the cache', () => {
  const take = asset(0.673, 393217);
  assert.ok(take.pcmF32Base64.length * 2 > 8 * 1024 * 1024);
  assert.equal(countDecodes(() => validateSampleAsset(take)), 1);
  assert.equal(countDecodes(() => validateSampleAsset(take)), 1);
});

test('portable PCM codec works without DOM base64 or TextEncoder globals', () => {
  const originals = { atob: globalThis.atob, btoa: globalThis.btoa, TextEncoder: globalThis.TextEncoder };
  globalThis.atob = globalThis.btoa = globalThis.TextEncoder = undefined;
  try {
    const pcm = Float32Array.from({ length: 4100 }, (_, index) => Math.sin(index * 0.13));
    const encoded = encodeSampleAsset(4, pcm, 48000, '🎛'.repeat(50));
    assert.deepEqual(Buffer.from(encoded.pcmF32Base64, 'base64'), Buffer.from(pcm.buffer));
    assert.deepEqual(decodeSampleAsset(encoded).stereo, pcm);
    assert.equal(encodeSampleAsset(4, pcm, 48000, '🎛'.repeat(1024)).label, '🎛'.repeat(1024));
    const surrogate = '\ud800'.repeat(66);
    assert.equal(encodeSampleAsset(4, pcm, 48000, surrogate).label, surrogate);
    assert.equal(encodeSampleAsset(4, pcm, 48000, surrogate + '\ud800').label, surrogate + '\ud800');
    assert.throws(() => validateSampleAsset({ ...encoded,
      pcmF32Base64: encoded.pcmF32Base64.slice(0,-1) + '!' }), TypeError);
    for (const frames of [1, 2, 3, 1024]) {
      const take = asset(0.831 + frames / 10000, frames);
      assert.deepEqual(decodeSampleAsset(take).stereo, new Float32Array(frames * 2).fill(Math.fround(0.831 + frames / 10000)));
    }
  } finally { Object.assign(globalThis, originals); }
});


test('long sample assets round-trip with full labels and finite PCM beyond the old duration cap', () => {
  const frames = 1_500_128;
  const pcm = new Float32Array(frames * 2);
  pcm[0] = 0.125;
  pcm[pcm.length - 2] = -0.75;
  pcm[pcm.length - 1] = 0.625;
  const label = 'Long take · 🎛 '.repeat(80);
  const graph = createGraphWorkspace();
  const region = graph.add('sample-region', {id: 4});
  graph.connect(region.output('out'), graph.output.input('in'));
  graph.setSampleAsset(region, pcm, 48000, label);
  const assets = [4, 5, 6].map(nodeId => ({nodeId, stereo: pcm, sourceRate: 48000, label}));
  assert.equal(validateGraphAssets({nodes: assets.map(asset => ({id: asset.nodeId, type: 'sample-region'}))}, assets).length, 3);
  const saved = JSON.parse(JSON.stringify(graph.toProject()));
  const reopened = GraphWorkspace.fromProject(saved).toProject();
  assert.equal(reopened.assets[0].frames, frames);
  assert.equal(reopened.assets[0].label, label);
  assert.deepEqual(decodeSampleAsset(reopened.assets[0]).stereo, pcm);
  assert.throws(() => validateSampleAsset({...reopened.assets[0], frames: Number.MAX_SAFE_INTEGER}), TypeError);
  const bytes = Buffer.from(reopened.assets[0].pcmF32Base64, 'base64');
  bytes.writeFloatLE(NaN, bytes.length - 4);
  assert.throws(() => validateSampleAsset({...reopened.assets[0], pcmF32Base64: bytes.toString('base64')}), TypeError);
});
