// Touch and sound choose a pose. Prism edge tilts the creature; heat lights
// its mouth. The local gesture value arrives in the same presentation frame,
// before a round trip to the audio host, so dragging never waits for an ack.
export default function creatureMotion() {
  let frame = 0;
  let lastSwitch = 0;
  let tilt = 0;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  return {
    evaluate(api, { time, delta }) {
      const energy = api.input('energy') ?? 0;
      const [hover, held, reducedMotion] = api.input('touch') ?? [0, 0, 0];
      const [gestureEdge, gestureHeat, dragging] = api.input('gesture') ?? [0, 0, 0];
      const edge = dragging ? gestureEdge : (api.input('edge') ?? 4800);
      const heat = dragging ? gestureHeat : (api.input('heat') ?? 8);
      const hot = clamp(heat / 40, 0, 1);
      const now = time * 1000;
      const pose = held
        ? 2
        : hover
          ? 1
          : hot > 0.68
            ? 2
            : energy > 0.16 && !reducedMotion
              ? Math.floor(now / 850) % 2
                ? 2
                : 1
              : 0;
      if (pose !== frame && now - lastSwitch > 180) {
        frame = pose;
        lastSwitch = now;
      }
      const response = reducedMotion ? 1 : 1 - Math.exp(-delta * 17);
      tilt +=
        (clamp(Math.log(Math.max(edge, 1) / 4800) * 0.035, -0.09, 0.09) +
          (held ? 0.025 : 0) -
          tilt) *
        response;
      return {
        frame,
        // Image coordinates turn clockwise; the scene's Y axis points up.
        rotation: (-tilt * 180) / Math.PI,
        glow: [
          0.08 + hot * 0.55 + energy * 0.2 + (held ? 0.15 : 0),
          0.79 - hot * 0.2,
          1 + energy * 0.35 + (held ? 0.45 : 0),
        ],
        controls: [edge, heat],
      };
    },
  };
}
