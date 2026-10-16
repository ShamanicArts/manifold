// Transmutation turns the collar; Afterimage opens its grasp and expands it.
export default function haloMotion() {
  let rotation = 0,
    scale = 1;
  return {
    evaluate(api, { delta }) {
      const [hover, held, reduced] = api.input('touch') ?? [0, 0, 0];
      const [gestureMix, gestureAfterimage, dragging] = api.input('gesture') ?? [0, 0, 0];
      const mix = dragging ? gestureMix : (api.input('mix') ?? 0.64);
      const afterimage = dragging ? gestureAfterimage : (api.input('afterimage') ?? 0.22);
      const response = reduced ? 1 : 1 - Math.exp(-delta * 17);
      rotation += ((mix - 0.64) * 0.75 - rotation) * response;
      scale += (0.93 + afterimage * 0.2 + (held ? 0.035 : hover ? 0.015 : 0) - scale) * response;
      return {
        frame: afterimage >= 0.7 ? 2 : afterimage >= 0.35 ? 1 : 0,
        rotation,
        scale,
        glow: 0.1 + (held ? 0.45 : hover ? 0.22 : 0) + (api.input('energy') ?? 0) * 0.1,
      };
    },
  };
}
