// Compare one portable graph through the native adapter and the Wasm AudioWorklet
// adapter. This runs offline in Node; it does not measure a browser audio thread.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { PORT_CATALOG } from '../packages/manifold-author/catalog.generated.js';
import { decodeSampleAsset } from '../packages/manifold-author/sample-assets.js';

const root = resolve(import.meta.dirname, '..');
const fixtureArg = process.argv.slice(2).find(arg => arg.startsWith('--fixture='));
const patchable = process.argv.includes('--patchable');
const sampleVoice = Number(process.argv.slice(2).find(arg => arg.startsWith('--sample-voice='))
  ?.slice('--sample-voice='.length) ?? 0);
const allSampleVoices = process.argv.includes('--all-sample-voices');
const vocoder = process.argv.includes('--vocoder');
const trace = process.argv.includes('--trace');
const fixture = fixtureArg?.slice('--fixture='.length) ?? 'projects/graph-workspace/authored-inverted-lfo.json';
const fixturePath = resolve(root, fixture);
const binary = resolve(root, 'target/release/examples/bench_authored_graph');
const wasmPath = resolve(root, 'web/public/manifold_filter.wasm');
const fixtureBytes = readFileSync(fixturePath);
const wasmBytes = readFileSync(wasmPath);
assert.ok(existsSync(binary), 'Build the release native example before benchmarking');
const authored = JSON.parse(fixtureBytes);
const graph = authored.signal;
const sampleVoices = allSampleVoices ? graph.nodes.filter(node => node.type === 'sample-region')
  .map(node => node.id) : sampleVoice ? [sampleVoice] : [];
const input = graph.inputSource === 'external' ? [[
  Float32Array.from({ length: 128 }, (_, frame) => ((frame % 16) - 8) / 8),
  Float32Array.from({ length: 128 }, (_, frame) => (((frame * 3) % 16) - 8) / 8),
]] : [];
const kindCodes = Object.fromEntries(Object.entries(PORT_CATALOG).map(([id, spec]) => [id, spec.code]));
const RATE = 48_000;
const FRAMES = 128;
const WARMUP = 128;
const BLOCKS = 2048;
const RUNS = trace ? 1 : 3;
const deadlineUs = FRAMES / RATE * 1_000_000;

let Worklet;
globalThis.sampleRate = RATE;
globalThis.currentFrame = 0;
globalThis.AudioWorkletProcessor = class {
  constructor() {
    this.port = { postMessage: message => { this.lastMessage = message; } };
  }
};
globalThis.registerProcessor = (_name, constructor) => { Worklet = constructor; };
await import(pathToFileURL(resolve(root, 'web/src/audio/filter-processor.js')).href);

async function wasmRun() {
  const processor = new Worklet();
  const started = process.hrtime.bigint();
  await processor.port.onmessage({ data: { type: 'init', wasmBytes,
    graph: { ...graph, patchable }, kindCodes,
    samples: (authored.assets ?? []).map(decodeSampleAsset),
    sampleBindings: authored.sampleBindings ?? [] } });
  const initMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  assert.equal(processor.lastMessage?.type, 'ready', processor.lastMessage?.message);
  for (const node of sampleVoices) {
    assert.equal(processor.engine.manifold_set_node_parameter(node + 2, 0, 0.6), 1);
    if (vocoder) assert.equal(processor.engine.manifold_set_node_parameter(node + 1, 3, 1), 1);
  }
  const left = new Float32Array(FRAMES);
  const right = new Float32Array(FRAMES);
  const output = [[left, right]];
  const block = index => {
    if (sampleVoices.length && index % 32 === 0) {
      for (const nodeId of sampleVoices) {
        void processor.port.onmessage({ data: { type: 'event', nodeId,
          kind: 0, channel: 0, note: 60, velocity: 100, offset: 0 } });
      }
    }
    assert.equal(processor.process(input, output), true);
    globalThis.currentFrame += FRAMES;
  };
  for (let index = 0; index < WARMUP; index++) block(index);
  const memoryBeforeBytes = processor.engine.memory.buffer.byteLength;
  const durationsUs = [];
  let checksum = 0;
  const checkpoints = [];
  const blockAbsSums = [];
  for (let index = 0; index < BLOCKS; index++) {
    const started = process.hrtime.bigint();
    block(index);
    durationsUs.push(Number(process.hrtime.bigint() - started) / 1000);
    checksum += Math.abs(left[index % FRAMES]) + Math.abs(right[index % FRAMES]);
    if ([0, 1024, 2047].includes(index)) checkpoints.push([left[index % FRAMES], right[index % FRAMES]]);
    if (trace) {
      let sum = 0;
      for (let frame = 0; frame < FRAMES; frame++) sum += Math.abs(left[frame]) + Math.abs(right[frame]);
      blockAbsSums.push(sum);
    }
  }
  assert.ok(checksum > 0.01, 'Wasm graph was silent');
  durationsUs.sort((a, b) => a - b);
  const at = fraction => durationsUs[Math.floor((BLOCKS - 1) * fraction)];
  return {
    method: patchable ? 'Node/V8 simulated patchable AudioWorklet process, offline'
      : 'Node/V8 simulated AudioWorklet process, offline',
    sampleRate: RATE, blockFrames: FRAMES,
    warmupBlocks: WARMUP, measuredBlocks: BLOCKS,
    initMs, p50Us: at(.50), p95Us: at(.95), p99Us: at(.99),
    maxUs: durationsUs.at(-1),
    overDeadline: durationsUs.filter(value => value > deadlineUs).length,
    outputChecksum: checksum, memoryBeforeBytes,
    checkpoints,
    ...(trace ? { blockAbsSums } : {}),
    memoryAfterBytes: processor.engine.memory.buffer.byteLength,
  };
}

const runs = [];
for (let index = 0; index < RUNS; index++) {
  const nativeProcess = spawnSync(binary, [fixturePath, ...(patchable ? ['--patchable'] : []),
    ...(sampleVoice ? [`--sample-voice=${sampleVoice}`] : []),
    ...(allSampleVoices ? ['--all-sample-voices'] : []),
    ...(vocoder ? ['--vocoder'] : []), ...(trace ? ['--trace'] : [])],
    { encoding: 'utf8', cwd: root });
  assert.equal(nativeProcess.status, 0, nativeProcess.stderr);
  const native = JSON.parse(nativeProcess.stdout);
  const wasm = await wasmRun();
  assert.equal(native.sampleRate, wasm.sampleRate);
  assert.equal(native.blockFrames, wasm.blockFrames);
  assert.equal(native.warmupBlocks, wasm.warmupBlocks);
  assert.equal(native.measuredBlocks, wasm.measuredBlocks);
  // The fixture starts each fresh engine from the same state. This catches
  // accidental comparison of different graphs or stale Wasm artifacts.
  assert.ok(Math.abs(native.outputChecksum - wasm.outputChecksum) / native.outputChecksum < 0.001,
    'Native and Wasm rendered different graph behavior');
  runs.push({ native, wasm });
}
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const medianMetrics = side => Object.fromEntries(['p50Us', 'p95Us', 'p99Us', 'maxUs']
  .map(key => [key, median(runs.map(run => run[side][key]))]));
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  fixture,
  sampleVoice: sampleVoice || null,
  allSampleVoices,
  vocoder,
  signalTrace: trace,
  fixtureSha256: createHash('sha256').update(fixtureBytes).digest('hex'),
  wasmSha256: createHash('sha256').update(wasmBytes).digest('hex'),
  nativeBinarySha256: createHash('sha256').update(readFileSync(binary)).digest('hex'),
  platform: platform(), arch: arch(), cpu: cpus()[0]?.model,
  node: process.version, deadlineUs, patchable, runs,
  medianOfRuns: { native: medianMetrics('native'), wasm: medianMetrics('wasm') },
  limits: 'Offline sequential runs; native and Wasm adapters differ; no actual browser/DAW callback scheduling or old C++ graph measured.',
};
console.log(JSON.stringify(report, null, 2));
const output = process.argv.slice(2).find(arg => !arg.startsWith('--'));
if (output) writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
