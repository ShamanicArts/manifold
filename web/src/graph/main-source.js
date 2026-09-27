// Prepare the source half of a graph Main bank off the audio thread.
// The standalone Main editor uses the same Rust/Wasm worker and target recipe.
export function analyzeMainSource(source) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../audio/sample-analysis-worker.js', import.meta.url), { type: 'module' });
    const timeout = setTimeout(() => finish(new Error('Main source analysis timed out.')), 45_000);
    let settled = false;
    function finish(error, target) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      worker.terminate();
      if (error) reject(error);
      else resolve(target);
    }
    worker.onerror = (event) => { event.preventDefault(); finish(new Error('Main source analysis worker failed.')); };
    worker.onmessage = ({ data }) => {
      if (data.type === 'error') { finish(new Error(data.message)); return; }
      if (data.type === 'result' && data.id === 1) {
        const recipe = new Float32Array([0, 8, 0, 0, .5, 0, 0, .7, 2, 0, 0]);
        try {
          worker.postMessage({ type: 'prepare-target', id: 2, sourceId: 1, mode: 1,
            position: 0, smooth: 0, contrast: 1, recipe }, [recipe.buffer]);
        } catch (error) { finish(error); }
      } else if (data.type === 'target' && data.id === 2) {
        if (!(data.values instanceof Float32Array) || data.values.length < 4) {
          finish(new Error('Main source has no usable prepared partials.'));
        } else {
          finish(null, { fundamental: 1, values: Array.from(data.values) });
        }
      }
    };
    const stereo = source.stereo.slice();
    worker.postMessage({ id: 1, sourceRate: source.sourceRate, stereo,
      temporal: { maxFrames: 128 } }, [stereo.buffer]);
  });
}
