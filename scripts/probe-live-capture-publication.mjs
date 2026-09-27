// Synthetic worklet cost probe. Measures message handler wall time, not device underruns.
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
await processor.port.onmessage({ data: { type: 'init',
  wasmBytes: readFileSync('web/dist/manifold_filter.wasm'), graph,
  samples: [{ nodeId: 5, sourceRate: 48_000, stereo: new Float32Array(4096).fill(.2) }],
} });
if (processor.lastMessage?.type !== 'ready') throw new Error(`Worklet init failed: ${JSON.stringify(processor.lastMessage)}`);
await processor.port.onmessage({ data: { type: 'parameter-request', requestId: 1, nodeId: 6, id: 0, value: 1 } });
const input = new Float32Array(128).fill(.25);
const output = [new Float32Array(128), new Float32Array(128)];
for (let block = 0; block < 750; block++) {
  processor.process([[input, input]], [output]);
  globalThis.currentFrame += 128;
}
const times = [];
for (let attempt = 0; attempt < 30; attempt++) {
  const start = performance.now();
  await processor.port.onmessage({ data: { type: 'capture-publish-live',
    requestId: attempt + 2, captureId: 6, instrumentId: 5 } });
  times.push(performance.now() - start);
  if (!processor.lastMessage?.accepted || processor.lastMessage.stereo.length !== 192_000) {
    throw new Error(`Publication failed: ${JSON.stringify(processor.lastMessage)}`);
  }
}
times.sort((a, b) => a - b);
const report = { sampleRate: 48_000, frames: 96_000, channels: 2,
  quantumMs: 128 / 48_000 * 1000, medianMs: times[14], p95Ms: times[28], maxMs: times[29],
  scope: 'Node synthetic AudioWorklet message handler; no browser transfer, audio device, or underrun observation' };
console.log(JSON.stringify(report, null, 2));
