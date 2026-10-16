// Repeatable Node/V8 proxy for 128-frame AudioWorklet callback cost.
// This is an offline lab measurement; the browser's audio thread must be measured separately.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus, platform, arch } from 'node:os';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const RATE = 48_000;
const BLOCK = 128;
const WARMUP = 128;
const CALLBACKS = 768;
const DEADLINE_MS = BLOCK / RATE * 1000;
let Processor;
globalThis.sampleRate = RATE;
globalThis.currentFrame = 0;
globalThis.AudioWorkletProcessor = class {
  constructor() { this.port = { postMessage: (message) => { this.lastMessage = message; }, onmessage: null }; }
};
globalThis.registerProcessor = (_name, processor) => { Processor = processor; };
await import(pathToFileURL(resolve('web/src/audio/filter-processor.js')).href);

const wasmBytes = readFileSync('web/dist/manifold_filter.wasm');
const project = JSON.parse(readFileSync('projects/main-voice-bank/project.json', 'utf8'));
const sample = new Float32Array(RATE * 4 * 2);
for (let frame = 0; frame < sample.length / 2; frame++) {
  sample[frame * 2] = Math.sin(2 * Math.PI * 220 * frame / RATE) * .3;
  sample[frame * 2 + 1] = Math.sin(2 * Math.PI * 330 * frame / RATE) * .25;
}
const graph = project.signal;
const partials = [project.partials, ...project.extraPartials];
const inputs = [];

async function run(label, voices, mode, pitchMode = 0) {
  globalThis.currentFrame = 0;
  const processor = new Processor();
  await processor.port.onmessage({ data: {
    type: 'init', wasmBytes, graph,
    sample: { nodeId: 2, sourceRate: RATE, stereo: sample }, partials,
  } });
  assert.equal(processor.lastMessage?.type, 'ready');
  for (const [id, value] of [[1, 0], [5, pitchMode], [6, mode], [7, .85], [17, .5]]) {
    await processor.port.onmessage({ data: { type: 'parameter', nodeId: 2, id, value } });
  }
  for (let index = 0; index < voices; index++) {
    await processor.port.onmessage({ data: {
      type: 'event', nodeId: 2, kind: 0, channel: 0, note: 48 + index, velocity: 90,
    } });
  }
  const left = new Float32Array(BLOCK);
  const right = new Float32Array(BLOCK);
  const outputs = [[left, right]];
  const callback = () => {
    assert.equal(processor.process(inputs, outputs), true);
    globalThis.currentFrame += BLOCK;
  };
  for (let index = 0; index < WARMUP; index++) callback();
  assert.equal(processor.engine.manifold_get_node_meter(2, 0), voices);
  const memoryBefore = processor.engine.memory.buffer.byteLength;
  const durations = [];
  let checksum = 0;
  for (let index = 0; index < CALLBACKS; index++) {
    const start = performance.now();
    callback();
    durations.push(performance.now() - start);
    checksum += Math.abs(left[index % BLOCK]) + Math.abs(right[index % BLOCK]);
  }
  assert.ok(checksum > .01, `${label} was silent`);
  durations.sort((a, b) => a - b);
  const at = (fraction) => durations[Math.floor((durations.length - 1) * fraction)];
  return {
    label, voices, mode, pitchMode,
    meanMs: durations.reduce((sum, duration) => sum + duration, 0) / durations.length,
    p50Ms: at(.5), p95Ms: at(.95), p99Ms: at(.99), maxMs: durations.at(-1),
    callbacksOverDeadline: durations.filter((duration) => duration > DEADLINE_MS).length,
    wasmMemoryBeforeBytes: memoryBefore,
    wasmMemoryAfterBytes: processor.engine.memory.buffer.byteLength,
    outputChecksum: checksum,
  };
}

const scenarios = [
  ['Normal · 1 voice', 1, 0], ['Normal · 4 voices', 4, 0],
  ['Normal · 8 voices', 8, 0], ['Ring · 8 voices', 8, 1],
  ['FM · 8 voices', 8, 2], ['Sync · 8 voices', 8, 3],
  ['Add · 8 voices', 8, 4], ['Morph · 8 voices', 8, 5],
  ['Vocoder · 8 voices', 8, 0, 1],
];
const results = [];
for (const scenario of scenarios) {
  const result = await run(...scenario);
  results.push(result);
  console.log(`${result.label.padEnd(23)} mean ${result.meanMs.toFixed(3)} ms, p95 ${result.p95Ms.toFixed(3)} ms, p99 ${result.p99Ms.toFixed(3)} ms, over deadline ${result.callbacksOverDeadline}/${CALLBACKS}`);
}
const report = {
  schemaVersion: 1, method: 'Node/V8 simulated AudioWorklet; not browser audio-thread timing',
  capturedAt: new Date().toISOString(), platform: platform(), arch: arch(),
  cpu: cpus()[0]?.model, node: process.version,
  wasmSha256: createHash('sha256').update(wasmBytes).digest('hex'),
  source: 'four-second deterministic stereo 220/330 Hz tone; notes 48..55 held',
  sampleRate: RATE, blockFrames: BLOCK, warmupCallbacks: WARMUP,
  measuredCallbacks: CALLBACKS, deadlineMs: DEADLINE_MS, results,
};
if (process.argv[2]) writeFileSync(process.argv[2], `${JSON.stringify(report, null, 2)}\n`);
