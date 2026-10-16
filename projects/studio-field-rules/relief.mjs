// Nacre's field relief law, applied downstream to a named field object.
// Edit or bypass this rule without editing the field generator or renderer.
export default function fieldRelief() {
  return {
    evaluate(api) {
      const field = api.input('field');
      if (!field) return { relief: null };
      const energy = api.input('energy') ?? 0;
      const depth = api.parameter('restDepth') + energy * api.parameter('audioDepth');
      return {
        relief: {
          width: field.width,
          height: field.height,
          values: field.values.map((value) => Math.sin(value * api.parameter('folds')) * depth),
        },
      };
    },
  };
}
