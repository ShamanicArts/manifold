// Isolate source extraction from the prepared-target and playback comparison.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const wasm = readFileSync('web/dist/manifold_filter.wasm');
const { instance: { exports: engine } } = await WebAssembly.instantiate(wasm, {});
for (const variant of ['voice', 'rhythmic']) {
  const root = `web/public/reference/main-temporal-${variant}/`;
  const raw = readFileSync(`${root}sample.f32`);
  const sample = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  const frames = sample.length / 2;
  assert.equal(engine.manifold_analysis_begin(frames, 48_000), 1);
  new Float32Array(engine.memory.buffer, engine.manifold_analysis_ptr(), sample.length).set(sample);
  assert.equal(engine.manifold_analysis_run_temporal(0, frames, 128), 1);
  const original = JSON.parse(readFileSync(`${root}old-temporal-frames.json`, 'utf8'));
  assert.equal(engine.manifold_analysis_temporal_count(), original.frameCount);
  assert.equal(original.frameCount, 45);
  const max = [0, 0, 0, 0];
  let positionMax = 0;
  for (const [index, frame] of original.frames.entries()) {
    const position = engine.manifold_analysis_temporal_frame_field(index, 0);
    positionMax = Math.max(positionMax, Math.abs(position - frame.position));
    const count = engine.manifold_analysis_temporal_frame_field(index, 5);
    assert.equal(count, frame.partials.length, `${variant} frame ${index}: partial count`);
    const partials = new Float32Array(engine.memory.buffer,
      engine.manifold_analysis_temporal_partials_ptr(index), count * 4);
    for (const [partial, values] of frame.partials.entries()) {
      for (let field = 0; field < 4; field++) {
        max[field] = Math.max(max[field], Math.abs(partials[partial * 4 + field] - values[field]));
      }
    }
  }
  assert.ok(positionMax < 1e-6, `${variant}: frame positions differ`);
  assert.ok(max[0] < .05 && max[1] < 1e-5 && max[2] < .006 && max[3] < 1e-6,
    `${variant}: raw extraction differs: ${max}`);
  console.log(`${variant}: 45 matching frame/partial counts; max frequency ${max[0].toExponential(3)} Hz, amplitude ${max[1].toExponential(3)}, phase ${max[2].toExponential(3)} rad`);
}
