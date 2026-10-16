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
const render = () => {
  const start = performance.now();
  processor.process([[input, input]], [output]);
  globalThis.currentFrame += 128;
  return performance.now() - start;
};
const baseline = Array.from({ length: 100 }, render);
const begin = [], stagedRender = [], chunk = [], commitBegin = [], commitRender = [], commitFinish = [], blocksToReady = [], blocksToPublish = [];
for (let attempt = 0; attempt < 30; attempt++) {
  const requestId = attempt + 2;
  let start = performance.now();
  await processor.port.onmessage({ data: { type: 'capture-publish-live', requestId, captureId: 6, instrumentId: 5 } });
  begin.push(performance.now() - start);
  if (!processor.lastMessage?.accepted) throw new Error('Staging failed');
  let blocks = 0;
  while (true) {
    await processor.port.onmessage({ data: { type: 'capture-stage-status', requestId, captureId: 6 } });
    if (processor.lastMessage.state === 2) break;
    if (processor.lastMessage.state !== 1 || blocks > 100) throw new Error('Staging did not complete');
    stagedRender.push(render());
    blocks++;
  }
  blocksToReady.push(blocks);
  const frames = processor.lastMessage.frames;
  if (frames !== 96_000) throw new Error(`Unexpected staged length ${frames}`);
  for (let offset = 0; offset < frames; offset += 16_384) {
    start = performance.now();
    await processor.port.onmessage({ data: { type: 'capture-stage-chunk', requestId,
      captureId: 6, offset, frames: Math.min(16_384, frames - offset) } });
    chunk.push(performance.now() - start);
    if (processor.lastMessage?.type !== 'capture-stage-chunk') throw new Error('Chunk failed');
  }
  start = performance.now();
  await processor.port.onmessage({ data: { type: 'capture-stage-commit-bounded', requestId, captureId: 6, instrumentId: 5 } });
  commitBegin.push(performance.now() - start);
  if (processor.lastMessage?.type !== 'capture-stage-commit-started') throw new Error('Bounded commit did not start');
  let copyBlocks = 0;
  while (true) {
    commitRender.push(render());
    if (++copyBlocks > 100) throw new Error('Bounded commit did not finish');
    await processor.port.onmessage({ data: { type: 'capture-stage-commit-status', requestId } });
    if (processor.lastMessage?.state === 2) break;
    if (processor.lastMessage?.state !== 1) throw new Error('Bounded commit was cancelled');
  }
  blocksToPublish.push(copyBlocks);
  start = performance.now();
  await processor.port.onmessage({ data: { type: 'capture-stage-commit-final', requestId } });
  commitFinish.push(performance.now() - start);
  if (!processor.lastMessage?.accepted) throw new Error('Commit failed');
}
const summary = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.floor(sorted.length * .95)], maxMs: sorted.at(-1) };
};
const report = { sampleRate: 48_000, frames: 96_000, channels: 2,
  quantumMs: 128 / 48_000 * 1000, blocksToReady: summary(blocksToReady),
  blocksToPublish: summary(blocksToPublish),
  baselineRender: summary(baseline), stagedRender: summary(stagedRender), commitRender: summary(commitRender),
  beginHandler: summary(begin), chunkHandler: summary(chunk),
  commitBeginHandler: summary(commitBegin), commitFinishHandler: summary(commitFinish),
  scope: 'Node synthetic AudioWorklet; no browser transfer, audio device, or underrun observation' };
console.log(JSON.stringify(report, null, 2));
