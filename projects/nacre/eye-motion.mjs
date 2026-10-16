// The eye follows the pointer, glances with the sound and closes when Hold is
// engaged. These are presentation rules; they never schedule the audio engine.
export default function eyeMotion() {
  let openness = 0;
  let gaze = 0;
  let side = 0;
  let lastGlance = 0;
  let shutter = 0;
  return {
    evaluate(api, { time, delta }) {
      const energy = api.input('energy') ?? 0;
      const upper = api.input('upper') ?? 0;
      const phase = api.input('phase') ?? 0;
      const displacement = api.input('displacement') ?? 0;
      const holding = (api.input('hold') ?? 0) >= 0.5;
      const [cursor, present, reducedMotion] = api.input('pointer') ?? [0.5, 0, 0];
      const targetOpen = Math.min(
        1,
        Math.max(holding ? 0.88 : 0, present ? 0.6 : 0, (energy - 0.025) * 3.8),
      );
      openness +=
        (targetOpen - openness) * (1 - Math.exp(-delta * (targetOpen > openness ? 5 : 3)));
      const direction = present
        ? (cursor - 0.5) * 2
        : Math.sin(phase * 0.65) + displacement * 0.075 + upper * 0.35;
      const nextSide = direction > 0.08 ? 1 : 0;
      if (
        (present || !reducedMotion) &&
        time - lastGlance > (present ? 0.09 : 0.85) &&
        nextSide !== side
      ) {
        side = nextSide;
        lastGlance = time;
      }
      gaze += (side - gaze) * (1 - Math.exp(-delta * 12));
      const blink =
        !reducedMotion && openness > 0.15
          ? Math.pow(Math.max(0, Math.sin(phase * 1.83)), 36) * 0.94
          : 0;
      const visible = openness * (1 - blink);
      shutter = holding ? Math.min(1, shutter + delta * 7) : Math.max(0, shutter - delta * 8);
      if (!holding && energy > 0.12 && !reducedMotion) {
        shutter = Math.max(shutter, Math.pow(Math.max(0, Math.sin(phase * 2.3)), 28) * 0.9);
      }
      return {
        left: visible * (1 - gaze),
        right: visible * gaze,
        closed: shutter,
        light: [
          0.07 + Math.min(0.7, energy * 0.55 + upper * 0.35),
          0.49 + Math.min(0.3, upper * 0.3),
        ],
      };
    },
  };
}
