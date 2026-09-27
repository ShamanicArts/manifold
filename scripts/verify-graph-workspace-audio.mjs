// Compare native Rust and the actual Wasm worklet for edited graph shapes.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
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
const texture = JSON.parse(readFileSync('projects/graph-workspace/tone-texture.json', 'utf8')).signal;
const noteVoice = JSON.parse(readFileSync('projects/graph-workspace/note-voice.json', 'utf8')).signal;
const sampleVoice = JSON.parse(readFileSync('projects/graph-workspace/sample-voice.json', 'utf8')).signal;
const regionVoice = JSON.parse(readFileSync('projects/graph-workspace/region-voice.json', 'utf8')).signal;
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
  for (const [mode, signal] of [['seed', seed], ['distortion', distorted], ['cv', cv], ['texture', texture], ['note-voice', noteVoice], ['sample-voice', sampleVoice], ['region-voice', regionVoice]]) {
    const output = join(workspace, `${mode}.f32`);
    const source = ['sample-voice', 'region-voice'].includes(mode)
      ? readFileSync('web/public/reference/graph-workspace/sample-source.f32') : null;
    if (source) writeFileSync(join(workspace, 'sample-source.f32'), source);
    execFileSync('cargo', ['run', '--quiet', '-p', 'manifold-core', '--example',
      'render_graph_workspace', '--', mode, output], { cwd: resolve('.'), stdio: 'pipe' });
    globalThis.currentFrame = 0;
    const processor = new Processor();
    await processor.port.onmessage({ data: {
      type: 'init', wasmBytes: readFileSync('web/dist/manifold_filter.wasm'), graph: signal,
      samples: source ? [{ nodeId: 5, sourceRate: 48000,
        stereo: new Float32Array(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength)) }] : [],
    } });
    assert.deepEqual(messages.at(-1), { type: 'ready' }, `${mode} prepared`);
    if (['note-voice', 'sample-voice', 'region-voice'].includes(mode)) {
      for (const [frame, kind, note, velocity] of [[16, 0, 60, 100], [2048, 0, 64, 96],
        [4096, 1, 60, 0], [6144, 1, 64, 0]]) {
        await processor.port.onmessage({ data: { type: 'event', nodeId: 4, frame, kind,
          channel: 15, note, velocity } });
      }
    }
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
    if (type === 'gain') {
      await processor.port.onmessage({ data: { type: 'parameter-request', requestId: 1, nodeId, id: 0, value: .35 } });
      assert.deepEqual(messages.at(-1), { type: 'parameter-applied', requestId: 1, accepted: true });
      await processor.port.onmessage({ data: { type: 'parameter-request', requestId: 2, nodeId, id: 99, value: .35 } });
      assert.deepEqual(messages.at(-1), { type: 'parameter-applied', requestId: 2, accepted: false });
    }
    const left = new Float32Array(128);
    const right = new Float32Array(128);
    const source = type === 'gain' ? new Float32Array(128).fill(1) : new Float32Array(128);
    for (let block = 0; block < (type === 'gain' ? 24 : 1); block++) {
      processor.process([[source, source]], [[left, right]]);
    }
    assert.ok([...left, ...right].every(Number.isFinite), `${type} produced finite audio`);
    if (type === 'gain') assert.ok(Math.abs(left.at(-1) - .7 * .35) < .01, 'acknowledged gain reaches the audio output');
  }
  console.log(`Palette: all ${Object.values(NODE_TYPES).filter((entry) => !entry.fixedId).length} addable node kinds prepared and processed in the Wasm worklet`);
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
