import { isImageType } from '@manifold/author/visual-primitives';
// Observation budget shared by native and browser. This consumes accepted outputs;
// it never calls a node, retains a renderer resource or advances a simulation.
export const previewBudget = Object.freeze({
  nodes: 16,
  interval: 100,
  history: 48,
  fieldSize: 32,
});
const supported = (port) =>
  ['scalar', 'vector2', 'vector3', 'field2d'].includes(port.type) || isImageType(port.type);

export function createNodePreviews({ imagePreview = () => null } = {}) {
  let interested = [],
    lastSample = -Infinity,
    revision,
    state,
    definitions;
  const samples = new Map();
  return {
    configure(next, byId) {
      const nextRevision = next.observationRevision ?? next.revision;
      if (nextRevision !== revision) {
        samples.clear();
        lastSample = -Infinity;
      }
      revision = nextRevision;
      state = next;
      definitions = byId;
    },
    setNodes(ids) {
      interested = [...new Set(ids.filter(Number.isSafeInteger))].slice(0, previewBudget.nodes);
      for (const id of samples.keys()) if (!interested.includes(id)) samples.delete(id);
    },
    sample(now, outputs) {
      if (!interested.length || now - lastSample < previewBudget.interval) return;
      lastSample = now;
      for (const id of interested) {
        const node =
          state.composition.nodes.find((node) => node.id === id) ??
          state.componentNodes?.find((node) => node.id === id);
        const definition = definitions.get(node?.definition ?? node?.type);
        const ports = definition?.outputs ?? [];
        const port =
          ports.find((port) => port.name === definition.preview && supported(port)) ??
          ports.find(supported);
        const endpoint = port && state.composition.compositeOutputs?.[id]?.[port.name];
        const value = port && outputs.get(endpoint?.from ?? id)?.[endpoint?.output ?? port.name];
        if (value == null) {
          samples.delete(id);
          continue;
        }
        const base = { output: port.name, unit: port.unit ?? '', sampledAt: now };
        if (isImageType(port.type)) {
          try {
            const image = imagePreview(port.type, value);
            if (image) samples.set(id, { ...base, ...image });
            else if (port.type === 'image-sequence' && !value.frames.length) samples.delete(id);
            else if (samples.has(id)) samples.set(id, { ...samples.get(id), pending: true });
          } catch (error) {
            samples.set(id, { ...base, kind: 'error', message: String(error.message ?? error) });
          }
        } else if (port.type === 'field2d') {
          const width = Math.min(previewBudget.fieldSize, value.width);
          const height = Math.min(previewBudget.fieldSize, value.height);
          const values = [];
          let min = Infinity,
            max = -Infinity;
          // Area averages preserve the mean of each region when reducing the grid.
          for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++) {
              const left = Math.floor((x * value.width) / width),
                right = Math.floor(((x + 1) * value.width) / width);
              const top = Math.floor((y * value.height) / height),
                bottom = Math.floor(((y + 1) * value.height) / height);
              const count = (right - left) * (bottom - top);
              let average = 0;
              for (let sy = top; sy < bottom; sy++)
                for (let sx = left; sx < right; sx++)
                  average += value.values[sy * value.width + sx] / count;
              average = Math.max(-Number.MAX_VALUE, Math.min(Number.MAX_VALUE, average));
              values.push(average);
              min = Math.min(min, average);
              max = Math.max(max, average);
            }
          const span = max - min;
          const pixels = values.map((value) =>
            Math.round(
              255 *
                (max === min
                  ? 0.5
                  : Number.isFinite(span)
                    ? (value - min) / span
                    : (value * 0.5 - min * 0.5) / (max * 0.5 - min * 0.5)),
            ),
          );
          samples.set(id, {
            ...base,
            kind: 'field',
            width,
            height,
            pixels,
            min,
            max,
            resolution: [value.width, value.height],
          });
        } else {
          const values = typeof value === 'number' ? [value] : [...value];
          const history = [
            ...(samples.get(id)?.output === port.name ? (samples.get(id).history ?? []) : []),
            values,
          ].slice(-previewBudget.history);
          samples.set(id, { ...base, kind: 'value', values, history });
        }
      }
    },
    get(id) {
      return samples.get(id);
    },
    remove(id) {
      samples.delete(id);
    },
  };
}
