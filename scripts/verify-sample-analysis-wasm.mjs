// Compare the background Wasm source summary with the native Rust implementation.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const wasm = (await WebAssembly.instantiate(readFileSync('web/dist/manifold_filter.wasm'), {})).instance.exports;
const directory = mkdtempSync(join(tmpdir(), 'manifold-analysis-'));
try {
  const cases = [
    ['tone', () => {
      const stereo = new Float32Array(12_000 * 2);
      for (let frame = 0; frame < 12_000; frame++) {
        const value = Math.sin(2 * Math.PI * 220 * frame / 48_000) * 0.8;
        stereo[frame * 2] = value;
        stereo[frame * 2 + 1] = value * 0.5;
      }
      return stereo;
    }],
    ['transient', () => {
      const stereo = new Float32Array(8192 * 2);
      stereo[0] = 1;
      stereo[1] = -0.5;
      stereo[stereo.length - 2] = -0.75;
      stereo[stereo.length - 1] = 0.25;
      return stereo;
    }],
    ['opposite-phase', () => {
      const stereo = new Float32Array(12_000 * 2);
      for (let frame = 0; frame < 12_000; frame++) {
        const value = Math.sin(2 * Math.PI * 330 * frame / 48_000) * 0.6;
        stereo[frame * 2] = value;
        stereo[frame * 2 + 1] = -value;
      }
      return stereo;
    }],
  ];
  for (const [name, create] of cases) {
    const stereo = create();
    const input = join(directory, `${name}-input.f32`);
    const output = join(directory, `${name}-native.f32`);
    writeFileSync(input, Buffer.from(stereo.buffer));
    execFileSync('cargo', ['run', '--quiet', '-p', 'manifold-core', '--example', 'render_sample_analysis', '--', input, output, '48000']);
    const nativeBytes = readFileSync(output);
    const native = new Float32Array(nativeBytes.buffer, nativeBytes.byteOffset, nativeBytes.length / 4);
    assert.equal(wasm.manifold_analysis_begin(stereo.length / 2, 48_000), 1);
    new Float32Array(wasm.memory.buffer, wasm.manifold_analysis_ptr(), stereo.length).set(stereo);
    assert.equal(wasm.manifold_analysis_run(), 1);
    const actual = [0, 1, 2, 3].map(id => wasm.manifold_analysis_metric(id));
    actual.push(...new Float32Array(wasm.memory.buffer, wasm.manifold_analysis_peaks_ptr(), wasm.manifold_analysis_peaks_len()));
    assert.equal(actual.length, native.length);
    for (let index = 0; index < actual.length; index++) {
      assert.ok(Math.abs(actual[index] - native[index]) < 1e-3,
        `${name} value ${index}: native ${native[index]} vs Wasm ${actual[index]}`);
    }
    console.log(`${name}: ${actual[2].toFixed(1)} Hz, peak ${actual[0].toFixed(3)}, native/Wasm summary matched`);
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
