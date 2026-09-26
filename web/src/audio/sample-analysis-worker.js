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
  const { id, sourceRate, stereo } = data;
  try {
    const wasm = await engine();
    const frames = stereo.length / 2;
    if (wasm.manifold_analysis_begin(frames, sourceRate) !== 1) throw new Error('Sample analysis rejected this source');
    const pointer = wasm.manifold_analysis_ptr();
    if (!pointer) throw new Error('Sample analysis storage unavailable');
    new Float32Array(wasm.memory.buffer, pointer, stereo.length).set(stereo);
    if (wasm.manifold_analysis_run() !== 1) throw new Error('Sample analysis failed');
    const peaks = new Float32Array(wasm.memory.buffer, wasm.manifold_analysis_peaks_ptr(), wasm.manifold_analysis_peaks_len()).slice();
    self.postMessage({ type: 'result', id, peaks,
      peak: wasm.manifold_analysis_metric(0), rms: wasm.manifold_analysis_metric(1),
      pitchHz: wasm.manifold_analysis_metric(2), confidence: wasm.manifold_analysis_metric(3),
    }, [peaks.buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', id, message: error.message ?? String(error) });
  }
};
