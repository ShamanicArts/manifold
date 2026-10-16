// Presentation time chooses a pose and an angle. It never controls audio timing.
// This is a small image-composition study, not Nacre's interactive creature rules.
export default function createCreatureMotion() {
  let phase = 0;
  return {
    evaluate(api, frame) {
      phase += frame.delta * api.parameter('speed');
      return {
        frame: Math.floor(phase * 3) % 3,
        rotation: Math.sin(phase * Math.PI * 2) * api.parameter('turn'),
      };
    },
  };
}
