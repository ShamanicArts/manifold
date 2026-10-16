// The two modes describe the standing-wave pattern. Focus, displacement and
// measured sound move them continuously; the field consumes this named output.
export default function standingWaveModes() {
  let first = 4;
  let second = 7;
  return {
    evaluate(api, { delta }) {
      const focus = api.input('focus') ?? 2400;
      const displacement = api.input('displacement') ?? 7;
      const upper = api.input('upper') ?? 0;
      const peak = api.input('peak') ?? 0;
      const targetFirst = 2 + Math.log2(Math.max(160, focus) / 160) * 0.65 + upper * 1.8;
      const targetSecond = 4 + (displacement + 12) / 5 + Math.log2(1 + peak / 1000) * 0.6;
      const response = 1 - Math.exp(-delta * api.parameter('response'));
      first += (targetFirst - first) * response;
      second += (targetSecond - second) * response;
      return { modes: [first, second] };
    },
  };
}
