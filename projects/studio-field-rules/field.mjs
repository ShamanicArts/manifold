// The standing-wave expression used by Nacre's liquid field.
// This instance owns a sampled field; it does not own a canvas or a GPU handle.
export default function standingField() {
  let key = '',
    field;
  return {
    evaluate(api) {
      const n = api.parameter('n'),
        m = api.parameter('m');
      const nextKey = `${n}:${m}`;
      if (nextKey !== key) {
        key = nextKey;
        const width = 64,
          height = 64,
          values = [];
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            const px = ((x / (width - 1)) * 2 - 1) * Math.PI;
            const py = ((y / (height - 1)) * 2 - 1) * Math.PI;
            values.push(Math.cos(n * px) * Math.cos(m * py) - Math.cos(m * px) * Math.cos(n * py));
          }
        field = { width, height, values };
      }
      return { field };
    },
  };
}
