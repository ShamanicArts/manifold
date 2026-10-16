// Nacre's level mapping and exponential follower, now inspectable as a rule.
// Per-instance state lives in this factory and resets when its source is replaced.
export default function levelResponse() {
  let energy = 0;
  return {
    evaluate(api, frame) {
      const rms = Math.max(0, api.input('analysis')?.rms ?? 0);
      const target = Math.min(1, Math.sqrt(rms * api.parameter('sensitivity')));
      energy += (target - energy) * (1 - Math.exp(-frame.delta * api.parameter('response')));
      return { energy };
    },
  };
}
