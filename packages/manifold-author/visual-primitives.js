import { projectFilePath } from './project-files.js';

const freeze = (value) => {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value);
};
const equivalent = (left, right) => {
  if (left === right) return true;
  if (
    !left ||
    !right ||
    typeof left !== 'object' ||
    typeof right !== 'object' ||
    Array.isArray(left) !== Array.isArray(right)
  )
    return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && equivalent(left[key], right[key]))
  );
};
const port = (name, type, unit) => ({ name, type, ...(unit ? { unit } : {}) });
const parameter = (name, label, min, max, value) => ({ name, label, min, max, default: value });
const definition = (name, label, description, inputs, outputs, parameters) => ({
  id: `manifold-${name}`,
  version: 1,
  label,
  description,
  category: 'Colour & layers',
  keywords: ['image', 'animation', 'asset'],
  implementation: { kind: 'visual-primitive', name },
  inputs,
  outputs,
  parameters,
});

/** Project paths stay in the saved graph. Decoded images belong to the presentation host. */
export function imageFrames({
  id = 'manifold-image-frames',
  label = 'Image frames',
  frames = [],
} = {}) {
  return {
    ...definition(
      'image-frames',
      label,
      'Provides an ordered set of project images. Connect it to Select image frame to choose the visible pose.',
      [],
      [port('frames', 'image-sequence')],
      [],
    ),
    id,
    implementation: { kind: 'visual-primitive', name: 'image-frames', frames: [...frames] },
  };
}
export const selectImageFrame = definition(
  'select-image-frame',
  'Select image frame',
  'Chooses one image from a sequence. Frame 0 is the first image; a connected value overrides the Frame control.',
  [port('frames', 'image-sequence'), port('frame', 'scalar')],
  [port('image', 'image2d')],
  [parameter('frame', 'Frame', 0, 255, 0)],
);
export const transformImage = definition(
  'transform-image',
  'Transform image',
  'Moves, rotates, scales and fades an image. Connected values override the matching controls. Position is measured in image widths.',
  [
    port('image', 'image2d'),
    port('rotation', 'scalar', '°'),
    port('scale', 'scalar'),
    port('opacity', 'scalar'),
  ],
  [port('image', 'image2d')],
  [
    parameter('x', 'Horizontal position', -2, 2, 0),
    parameter('y', 'Vertical position', -2, 2, 0),
    parameter('rotation', 'Rotation · degrees', -180, 180, 0),
    parameter('scale', 'Scale', 0, 4, 1),
    parameter('opacity', 'Opacity', 0, 1, 1),
  ],
);
export const imageLayer = definition(
  'image-layer',
  'Image layer',
  'Draws a connected image in the Presenter, preserving its aspect ratio and transparency. Its output carries the same image for reuse and inspection.',
  [port('image', 'image2d')],
  [port('image', 'image2d')],
  [],
);
export const visualPrimitives = freeze([
  imageFrames(),
  selectImageFrame,
  transformImage,
  imageLayer,
]);
export const isImageType = (type) => type === 'image2d' || type === 'image-sequence';
export const isVisualSurface = (definition) =>
  definition.implementation.kind === 'web-surface' ||
  (definition.implementation.kind === 'visual-primitive' &&
    definition.implementation.name === 'image-layer');

export function validateVisualPrimitive(value, files) {
  const canonical = visualPrimitives.find(
    (item) => item.implementation.name === value.implementation.name,
  );
  if (!canonical) throw new Error('Unknown Manifold visual primitive');
  for (const key of ['inputs', 'outputs', 'parameters'])
    if (!equivalent(value[key], canonical[key]))
      throw new Error(`${canonical.label}: ${key} must match the library definition`);
  const frames = value.implementation.frames;
  if (canonical.implementation.name !== 'image-frames') {
    if (frames !== undefined) throw new Error('Only Image frames declares asset paths');
    return;
  }
  if (!Array.isArray(frames))
    throw new Error('Expected image frames');
  for (const path of frames) {
    projectFilePath(path);
    if (!files.some((file) => file.path === path && file.mediaType.startsWith('image/')))
      throw new Error(`Missing project image: ${path}`);
  }
}

/** Renderer-neutral image values: normalized affine transform, unassociated opacity. */
export function imageValue(type, value) {
  if (type === 'image-sequence') {
    if (!value || !Array.isArray(value.frames))
      throw new Error('Expected an ordered image sequence');
    return Object.freeze({ frames: Object.freeze(value.frames.map(projectFilePath)) });
  }
  if (
    !value ||
    !Array.isArray(value.transform) ||
    value.transform.length !== 6 ||
    value.transform.some((n) => !Number.isFinite(n) || Math.abs(n) > 1000000) ||
    !Number.isFinite(value.opacity) ||
    value.opacity < 0 ||
    value.opacity > 1
  )
    throw new Error('Expected an image with a finite affine transform and opacity');
  return Object.freeze({
    asset: projectFilePath(value.asset),
    transform: Object.freeze([...value.transform]),
    opacity: value.opacity,
  });
}

export function evaluateVisualPrimitive(definition, input, parameter) {
  const read = (name) => input(name) ?? parameter(name);
  switch (definition.implementation.name) {
    case 'image-frames':
      return { frames: { frames: definition.implementation.frames } };
    case 'select-image-frame': {
      const frames = input('frames')?.frames;
      if (!frames?.length) return { image: null };
      const frame = Math.max(0, Math.min(frames.length - 1, Math.floor(read('frame'))));
      return { image: { asset: frames[frame], transform: [1, 0, 0, 1, 0, 0], opacity: 1 } };
    }
    case 'transform-image': {
      const image = input('image');
      if (!image) return { image: null };
      const angle = (read('rotation') * Math.PI) / 180,
        scale = Math.max(0, read('scale'));
      const c = Math.cos(angle) * scale,
        s = Math.sin(angle) * scale;
      const [a, b, d, e, x, y] = image.transform;
      return {
        image: {
          asset: image.asset,
          transform: [
            c * a - s * b,
            s * a + c * b,
            c * d - s * e,
            s * d + c * e,
            c * x - s * y + parameter('x'),
            s * x + c * y + parameter('y'),
          ],
          opacity: image.opacity * Math.max(0, Math.min(1, read('opacity'))),
        },
      };
    }
    case 'image-layer':
      return { image: input('image') };
    default:
      throw new Error('Unknown Manifold visual primitive');
  }
}
