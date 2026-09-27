// Compare native Rust and the actual Wasm worklet for edited graph shapes.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NODE_TYPES, addNode, setConnection, setInitialParameter } from '../web/src/graph/topology.js';

const messages = [];
let Processor;
globalThis.sampleRate = 48_000;
globalThis.currentFrame = 0;
globalThis.AudioWorkletProcessor = class {
  constructor() { this.port = { postMessage: (message) => messages.push(message), onmessage: null }; }
};
globalThis.registerProcessor = (_, processor) => { Processor = processor; };
await import(pathToFileURL(resolve('web/src/audio/filter-processor.js')).href);
const seed = JSON.parse(readFileSync('projects/graph-workspace/project.json', 'utf8')).signal;
let distorted = addNode(seed, 'distortion');
distorted = setConnection(distorted, 4, 0, 2);
distorted = setConnection(distorted, 3, 0, 4);
distorted = setInitialParameter(distorted, 4, 0, 9);
let cv = addNode(distorted, 'lfo');
cv = addNode(cv, 'modulated-gain');
cv = setConnection(cv, 6, 0, 4);
cv = setConnection(cv, 6, 1, 5);
cv = setConnection(cv, 3, 0, 6);

const workspace = mkdtempSync(join(tmpdir(), 'manifold-graph-'));
try {
  for (const [mode, signal] of [['seed', seed], ['distortion', distorted], ['cv', cv]]) {
    const output = join(workspace, `${mode}.f32`);
    execFileSync('cargo', ['run', '--quiet', '-p', 'manifold-core', '--example',
      'render_graph_workspace', '--', mode, output], { cwd: resolve('.'), stdio: 'pipe' });
    globalThis.currentFrame = 0;
    const processor = new Processor();
    await processor.port.onmessage({ data: {
      type: 'init', wasmBytes: readFileSync('web/dist/manifold_filter.wasm'), graph: signal,
    } });
    assert.deepEqual(messages.at(-1), { type: 'ready' }, `${mode} prepared`);
    const wasm = new Float32Array(8192 * 2);
    for (let block = 0; block < 64; block++) {
      const inputLeft = new Float32Array(128);
      const inputRight = new Float32Array(128);
      for (let index = 0; index < 128; index++) {
        const step = ((block * 128 + index) % 64) - 32;
        inputLeft[index] = step / 128;
        inputRight[index] = -step / 256;
      }
      const left = new Float32Array(128);
      const right = new Float32Array(128);
      processor.process([[inputLeft, inputRight]], [[left, right]]);
      for (let index = 0; index < 128; index++) {
        const frame = block * 128 + index;
        wasm[frame * 2] = left[index];
        wasm[frame * 2 + 1] = right[index];
      }
      globalThis.currentFrame += 128;
    }
    const nativeBytes = readFileSync(output);
    assert.equal(nativeBytes.length, wasm.length * 4);
    const native = new DataView(nativeBytes.buffer, nativeBytes.byteOffset, nativeBytes.byteLength);
    let maxDifference = 0;
    let squared = 0;
    let peak = 0;
    for (let index = 0; index < wasm.length; index++) {
      const value = native.getFloat32(index * 4, true);
      const difference = Math.abs(value - wasm[index]);
      maxDifference = Math.max(maxDifference, difference);
      squared += difference * difference;
      peak = Math.max(peak, Math.abs(wasm[index]));
    }
    const rms = Math.sqrt(squared / wasm.length);
    assert.ok(peak > .01, `${mode} should produce audio`);
    assert.ok(maxDifference < 1e-5, `${mode} max difference ${maxDifference}`);
    console.log(`${mode}: 8192 stereo frames, peak ${peak.toFixed(6)}, native/Wasm max ${maxDifference.toFixed(9)}, RMS ${rms.toFixed(9)}`);
  }
  for (const [type, spec] of Object.entries(NODE_TYPES).filter(([, entry]) => !entry.fixedId)) {
    let signal = addNode(seed, type);
    const nodeId = signal.nodes.at(-1).id;
    if (spec.inputs[0] === 'audio') signal = setConnection(signal, nodeId, 0, 2);
    if (type === 'sum2') signal = setConnection(signal, nodeId, 1, 1);
    if (type === 'modulated-gain') {
      signal = addNode(signal, 'lfo');
      signal = setConnection(signal, nodeId, 1, signal.nodes.at(-1).id);
    }
    if (spec.output === 'audio') signal = setConnection(signal, 3, 0, nodeId);
    const processor = new Processor();
    await processor.port.onmessage({ data: { type: 'init', wasmBytes: readFileSync('web/dist/manifold_filter.wasm'), graph: signal } });
    assert.deepEqual(messages.at(-1), { type: 'ready' }, `${type} palette graph compiled`);
    const left = new Float32Array(128);
    const right = new Float32Array(128);
    processor.process([[new Float32Array(128), new Float32Array(128)]], [[left, right]]);
    assert.ok([...left, ...right].every(Number.isFinite), `${type} produced finite audio`);
  }
  console.log('Palette: all eight addable node kinds prepared and processed in the Wasm worklet');
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
