// Local touch previews lead host acknowledgements. Each output names the
// physical part it moves; the scene object owns wrist placement and clearance.
export default function handMotion() {
  let rotation = 0,
    tilt = 0,
    ringRotation = 0,
    ringScale = 1,
    grainRotation = 0;
  return {
    evaluate(api, { delta }) {
      const [hover, held, reduced] = api.input('touch') ?? [0, 0, 0];
      const [gestureScatter, gestureGrain, dragging] = api.input('gesture') ?? [0, 0, 0];
      const scatter = dragging ? gestureScatter : (api.input('scatter') ?? 0.28);
      const grainSize = dragging ? gestureGrain : (api.input('grainSize') ?? 85);
      const grain = Math.max(0, Math.min(1, (grainSize - 20) / 230));
      const response = reduced ? 1 : 1 - Math.exp(-delta * 17);
      rotation +=
        ((scatter - 0.28) * 0.25 + (held ? 0.028 : hover ? 0.016 : 0) - rotation) * response;
      tilt += (((grainSize - 85) / 165) * 0.12 - tilt) * response;
      ringRotation += ((scatter - 0.28) * 0.8 - ringRotation) * response;
      ringScale += ((held ? 1.12 : hover ? 1.08 : 1) - ringScale) * response;
      grainRotation += ((grain - 0.28) * 0.95 - grainRotation) * response;
      return {
        rotation,
        tilt,
        ringRotation,
        ringScale,
        grainRotation,
        response,
        height: 0.195 + (hover || held ? 0.016 : 0) - (held ? 0.028 : 0),
        glow: 0.08 + (held ? 0.9 : hover ? 0.52 : 0) + (api.input('energy') ?? 0) * 0.1,
        grain,
        scatter,
      };
    },
  };
}
