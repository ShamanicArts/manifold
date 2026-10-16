// Prepare the source half of a graph Main bank off the audio thread.
// The standalone Main editor uses the same Rust/Wasm worker and target recipe.
function analyze(source, temporal = null) {
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
        const recipe = new Float32Array(temporal?.recipe ?? [0, 8, 0, 0, .5, 0, 0, .7, 2, 0, 0]);
        try {
          worker.postMessage({ type: temporal ? 'prepare-temporal-frames' : 'prepare-target',
            id: 2, sourceId: 1, mode: temporal?.mode ?? 1,
            position: 0, smooth: temporal?.smooth ?? 0, contrast: temporal?.contrast ?? 1,
            recipe }, [recipe.buffer]);
        } catch (error) { finish(error); }
      } else if (data.type === 'target' && data.id === 2) {
        if (!(data.values instanceof Float32Array) || data.values.length < 4) {
          finish(new Error('Main source has no usable prepared partials.'));
        } else {
          finish(null, { fundamental: 1, values: Array.from(data.values) });
        }
      } else if (data.type === 'temporal-frames' && data.id === 2) {
        if (!(data.packed instanceof Float32Array) || !(data.rawRecipe instanceof Float32Array)
          || !Number.isInteger(data.frames) || data.frames < 2 || data.frames > 128
          || data.packed.length !== 1 + data.frames * 131 || data.rawRecipe.length !== 10) {
          finish(new Error('Main source temporal frames are invalid.'));
        } else {
          finish(null, { frames: data.frames, rawFrames: data.packed,
            rawRecipe: data.rawRecipe, speed: temporal.speed });
        }
      }
    };
    const stereo = source.stereo.slice();
    worker.postMessage({ id: 1, sourceRate: source.sourceRate, stereo,
      temporal: { maxFrames: 128 } }, [stereo.buffer]);
  });
}

export function analyzeMainSource(source) { return analyze(source); }
export function analyzeMainTemporal(source, recipe) { return analyze(source, recipe); }
