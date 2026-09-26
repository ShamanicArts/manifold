/** Background Rust/Wasm source analysis; never runs on the audio worklet. */
let enginePromise;

async function engine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const response = await fetch(`${import.meta.env.BASE_URL}manifold_filter.wasm`);
      if (!response.ok) throw new Error('Analysis Wasm module unavailable');
      const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), {});
      if (instance.exports.manifold_version() !== 3) throw new Error('Analysis module version mismatch');
      return instance.exports;
    })();
  }
  return enginePromise;
}

self.onmessage = async ({ data }) => {
  const { id, sourceRate, stereo, temporal: temporalRequest } = data;
  try {
    const wasm = await engine();
    const frames = stereo.length / 2;
    if (wasm.manifold_analysis_begin(frames, sourceRate) !== 1) throw new Error('Sample analysis rejected this source');
    const pointer = wasm.manifold_analysis_ptr();
    if (!pointer) throw new Error('Sample analysis storage unavailable');
    new Float32Array(wasm.memory.buffer, pointer, stereo.length).set(stereo);
    const temporal = Boolean(temporalRequest);
    const regionStart = temporalRequest?.regionStart ?? 0;
    const regionEnd = temporalRequest?.regionEnd ?? frames;
    const maxFrames = temporalRequest?.maxFrames ?? 128;
    const accepted = temporal
      ? wasm.manifold_analysis_run_temporal(regionStart, regionEnd, maxFrames)
      : wasm.manifold_analysis_run();
    if (accepted !== 1) throw new Error('Sample analysis failed');
    const peaks = new Float32Array(wasm.memory.buffer, wasm.manifold_analysis_peaks_ptr(), wasm.manifold_analysis_peaks_len()).slice();
    let partialFrames = null;
    let temporalMeta = null;
    if (temporal) {
      temporalMeta = {
        version: 1,
        sourceRate: wasm.manifold_analysis_temporal_meta(0),
        sourceFrames: wasm.manifold_analysis_temporal_meta(1),
        regionStart: wasm.manifold_analysis_temporal_meta(2),
        regionEnd: wasm.manifold_analysis_temporal_meta(3),
        fundamental: wasm.manifold_analysis_temporal_meta(4),
        confidence: wasm.manifold_analysis_temporal_meta(5),
        mode: wasm.manifold_analysis_temporal_meta(6) === 0 ? 'harmonic-projection' : 'spectral-peaks',
        windowSize: wasm.manifold_analysis_temporal_meta(7),
        hopSize: wasm.manifold_analysis_temporal_meta(8),
        globalValues: new Float32Array(wasm.memory.buffer, wasm.manifold_analysis_temporal_global_ptr(),
          wasm.manifold_analysis_temporal_global_count() * 4).slice(),
      };
      partialFrames = Array.from({ length: wasm.manifold_analysis_temporal_count() }, (_, index) => {
        const count = wasm.manifold_analysis_temporal_frame_field(index, 5);
        const pointer = wasm.manifold_analysis_temporal_partials_ptr(index);
        if (!Number.isInteger(count) || count < 0 || count > 32 || !pointer) throw new Error('Invalid partial frame');
        return {
          position: wasm.manifold_analysis_temporal_frame_field(index, 0),
          sourceStart: wasm.manifold_analysis_temporal_frame_field(index, 1),
          rms: wasm.manifold_analysis_temporal_frame_field(index, 2),
          brightness: wasm.manifold_analysis_temporal_frame_field(index, 3),
          fundamental: wasm.manifold_analysis_temporal_frame_field(index, 4),
          values: new Float32Array(wasm.memory.buffer, pointer, count * 4).slice(),
        };
      });
    }
    self.postMessage({ type: 'result', id, peaks,
      peak: wasm.manifold_analysis_metric(0), rms: wasm.manifold_analysis_metric(1),
      pitchHz: wasm.manifold_analysis_metric(2), confidence: wasm.manifold_analysis_metric(3),
      temporal: temporalMeta && { ...temporalMeta, frames: partialFrames },
    }, [peaks.buffer, ...(temporalMeta ? [temporalMeta.globalValues.buffer] : []),
      ...(partialFrames?.map((frame) => frame.values.buffer) ?? [])]);
  } catch (error) {
    self.postMessage({ type: 'error', id, message: error.message ?? String(error) });
  }
};
