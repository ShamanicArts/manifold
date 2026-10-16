/** Analyze a prepared stereo source on a separate Worker using the shared Rust/Wasm kernel. */
export function analyzeStereo(stereo, sourceRate) {
  if (!(stereo instanceof Float32Array) || stereo.length < 2 || stereo.length % 2
    || !Number.isFinite(sourceRate) || sourceRate < 8_000 || sourceRate > 384_000) {
    return Promise.reject(new TypeError('Provide decoded stereo PCM and a supported sample rate'));
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./analysis-worker.js', import.meta.url), { type: 'module' });
    const timeout = setTimeout(() => finish(new Error('Sample analysis timed out')), 30_000);
    let settled = false;
    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      worker.terminate();
      error ? reject(error) : resolve(result);
    }
    worker.onerror = () => finish(new Error('Sample analysis worker failed'));
    worker.onmessage = ({ data }) => data.type === 'result'
      ? finish(null, { peak: data.peak, rms: data.rms, pitchHz: data.pitchHz,
        confidence: data.confidence, peaks: data.peaks })
      : finish(new Error(data.message ?? 'Sample analysis failed'));
    const transfer = stereo.slice();
    worker.postMessage({ stereo: transfer, sourceRate }, [transfer.buffer]);
  });
}
