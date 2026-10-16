// Audio energy controls motion and light; it never determines audio timing.
export default function energyResponse() {
  let energy = 0;
  let peak = 0;
  return {
    evaluate(api, { delta }) {
      const analysis = api.input('analysis');
      const rms = Math.max(0, analysis?.rms ?? 0);
      const target = Math.min(1, Math.sqrt(rms * api.parameter('sensitivity')));
      energy += (target - energy) * (1 - Math.exp(-delta * api.parameter('response')));
      peak += (Math.max(0, analysis?.peakHz ?? 0) - peak) * (1 - Math.exp(-delta * 4));
      let upper = 0;
      for (let band = 19; band < 32; band++) upper += (analysis?.bands?.[band] ?? 0) / 13;
      return { energy, peak, upper };
    },
  };
}
