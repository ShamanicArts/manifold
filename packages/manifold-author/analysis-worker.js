/** One-shot Rust/Wasm PCM analysis outside the AudioWorklet. */
self.onmessage = async ({ data }) => {
  try {
    const response = await fetch(new URL('./runtime/manifold_filter.wasm', import.meta.url));
    if (!response.ok) throw new Error('Manifold analysis Wasm is unavailable');
    const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), {});
    const engine = instance.exports;
    if (engine.manifold_version() !== 5) throw new Error('Manifold analysis ABI mismatch');
    const { stereo, sourceRate } = data;
    if (!(stereo instanceof Float32Array) || stereo.length < 2 || stereo.length % 2
      || engine.manifold_analysis_begin(stereo.length / 2, sourceRate) !== 1) {
      throw new Error('Sample analysis rejected the source');
    }
    const pointer = engine.manifold_analysis_ptr();
    if (!pointer) throw new Error('Sample analysis storage is unavailable');
    new Float32Array(engine.memory.buffer, pointer, stereo.length).set(stereo);
    if (engine.manifold_analysis_run() !== 1) throw new Error('Sample analysis failed');
    const peaks = new Float32Array(engine.memory.buffer, engine.manifold_analysis_peaks_ptr(),
      engine.manifold_analysis_peaks_len()).slice();
    self.postMessage({ type: 'result', peak: engine.manifold_analysis_metric(0),
      rms: engine.manifold_analysis_metric(1), pitchHz: engine.manifold_analysis_metric(2),
      confidence: engine.manifold_analysis_metric(3), peaks }, [peaks.buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message ?? String(error) });
  }
};
