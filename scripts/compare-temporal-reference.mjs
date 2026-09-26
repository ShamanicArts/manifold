import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const base = 'web/public/reference/temporal-partials';
const manifest = JSON.parse(readFileSync(`${base}/manifest.json`, 'utf8'));
const { instance: { exports: wasm } } = await WebAssembly.instantiate(readFileSync('web/public/manifold_filter.wasm'), {});
const report = [];
for (const selected of manifest.cases) {
  const bytes = readFileSync(`${base}/${selected.input}`);
  const input = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  const legacy = JSON.parse(readFileSync(`${base}/${selected.output}`, 'utf8'));
  assert.equal(wasm.manifold_analysis_begin(selected.sourceFrames, manifest.sampleRate), 1);
  new Float32Array(wasm.memory.buffer, wasm.manifold_analysis_ptr(), input.length).set(input);
  assert.equal(wasm.manifold_analysis_run_temporal(selected.regionStart, selected.regionEnd, selected.maxFrames), 1);
  const count = wasm.manifold_analysis_temporal_count();
  assert.equal(count, legacy.frameCount);
  let oldPartials = 0;
  let rustPartials = 0;
  let matched = 0;
  let worstMatchedHz = 0;
  let worstMatchedAmplitude = 0;
  let worstMatchedPhase = 0;
  let worstPosition = 0;
  let worstRms = 0;
  let worstBrightness = 0;
  for (let index = 0; index < count; index++) {
    const before = legacy.frames[index];
    const position = wasm.manifold_analysis_temporal_frame_field(index, 0);
    worstPosition = Math.max(worstPosition, Math.abs(position - before.position));
    worstRms = Math.max(worstRms, Math.abs(wasm.manifold_analysis_temporal_frame_field(index, 2) - before.rms));
    worstBrightness = Math.max(worstBrightness, Math.abs(wasm.manifold_analysis_temporal_frame_field(index, 3) - before.brightness));
    const partialCount = wasm.manifold_analysis_temporal_frame_field(index, 5);
    assert.equal(partialCount, before.partials.length, `${selected.id} frame ${index} count`);
    const ptr = wasm.manifold_analysis_temporal_partials_ptr(index);
    const values = new Float32Array(wasm.memory.buffer, ptr, partialCount * 4);
    oldPartials += before.partials.length;
    rustPartials += partialCount;
    for (let slot = 0; slot < partialCount; slot++) {
      const [frequency, amplitude, phase] = before.partials[slot];
      const frequencyError = Math.abs(values[slot * 4] - frequency);
      const amplitudeError = Math.abs(values[slot * 4 + 1] - amplitude);
      const phaseDifference = values[slot * 4 + 2] - phase;
      const phaseError = Math.abs(Math.atan2(Math.sin(phaseDifference), Math.cos(phaseDifference)));
      assert.ok(frequencyError < 0.01, `${selected.id} frame ${index} partial ${slot} frequency error ${frequencyError}`);
      assert.ok(amplitudeError < 1e-4, `${selected.id} frame ${index} partial ${slot} amplitude error ${amplitudeError}`);
      matched++;
      worstMatchedHz = Math.max(worstMatchedHz, frequencyError);
      worstMatchedAmplitude = Math.max(worstMatchedAmplitude, amplitudeError);
      worstMatchedPhase = Math.max(worstMatchedPhase, phaseError);
    }
  }
  const result = { case: selected.id, frames: count, oldPartials, rustPartials, matched,
    matchedRatio: oldPartials ? matched / oldPartials : 1,
    worstMatchedHz, worstMatchedAmplitude, worstMatchedPhase, worstPosition, worstRms, worstBrightness,
    oldFundamental: legacy.globalFundamental,
    rustFundamental: wasm.manifold_analysis_temporal_meta(4),
    rustMode: wasm.manifold_analysis_temporal_meta(6) === 0 ? 'harmonic' : 'peaks' };
  report.push(result);
  assert.ok(worstMatchedPhase < 0.001, `${selected.id} partial phases`);
  assert.ok(worstPosition < 1e-5 && worstRms < 1e-5 && worstBrightness < 1e-5,
    `${selected.id} frame metrics`);
  assert.ok(Math.abs(result.oldFundamental - result.rustFundamental) < (selected.legacyFundamental ? 0.1 : 0.01), `${selected.id} global fundamental`);
  console.log(JSON.stringify(result));
}
writeFileSync('artifacts/reviews/checkpoint-105-temporal-comparison.json', `${JSON.stringify(report, null, 2)}\n`);
