// Synthetic control-handler timing for a 30-second decoded file, not device underruns.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

let Processor;
globalThis.sampleRate = 48_000;
globalThis.currentFrame = 0;
globalThis.AudioWorkletProcessor = class {
  constructor() { this.port = { postMessage: (message) => { this.lastMessage = message; }, onmessage: null }; }
};
globalThis.registerProcessor = (_name, processor) => { Processor = processor; };
await import(pathToFileURL(resolve('web/src/audio/filter-processor.js')).href);
const graph = JSON.parse(readFileSync('projects/graph-workspace/live-sampler.json', 'utf8')).signal;
const processor = new Processor();
await processor.port.onmessage({ data: { type: 'init', graph,
  wasmBytes: readFileSync('web/dist/manifold_filter.wasm'),
  samples: [{ nodeId: 5, sourceRate: 48_000, stereo: new Float32Array(30 * 48_000 * 2).fill(.25) }],
} });
if (processor.lastMessage.type !== 'ready') throw new Error('Worklet did not prepare.');
const stereo = new Float32Array(30 * 48_000 * 2).fill(-.5);
const measure = async (data) => {
  const start = performance.now();
  await processor.port.onmessage({ data });
  return performance.now() - start;
};
const beginMs = await measure({ type: 'sample-replace-begin', requestId: 1,
  nodeId: 5, sourceRate: 48_000, stereo });
if (processor.lastMessage.type !== 'sample-replace-started') throw new Error('Replacement did not begin.');
const steps = [];
while (true) {
  steps.push(await measure({ type: 'sample-replace-step', requestId: 1 }));
  if (processor.lastMessage.type !== 'sample-replace-progress') throw new Error('Chunk failed.');
  if (processor.lastMessage.done) break;
}
const commitMs = await measure({ type: 'sample-replace-commit', requestId: 1 });
if (!processor.lastMessage.accepted) throw new Error('Replacement did not publish.');
steps.sort((a, b) => a - b);
console.log(JSON.stringify({ frames: stereo.length / 2, sourceRate: 48_000,
  quantumMs: 128 / 48_000 * 1000, chunkFrames: 4096, chunkCount: steps.length,
  beginMs, chunkP95Ms: steps[Math.floor(steps.length * .95)], chunkMaxMs: steps.at(-1), commitMs,
  scope: 'Node synthetic AudioWorklet handlers; excludes browser transfer, audio device, and underruns' }, null, 2));
