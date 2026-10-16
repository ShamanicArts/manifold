/** Shared discovery vocabulary. Origin is derived from the implementation, never authored. */
export const visualCategories = Object.freeze([
  'Sound analysis',
  'Values & motion',
  'Fields',
  'Colour & layers',
  'Objects & layout',
  'Reusable graphs',
  'Custom scripts',
]);

export function visualCategory(definition) {
  if (definition.category) return definition.category;
  if (definition.implementation.kind === 'parameter') return 'Values & motion';
  if (definition.implementation.kind === 'composition') return 'Reusable graphs';
  if (definition.outputs?.some((port) => port.type === 'field2d')) return 'Fields';
  if (definition.implementation.kind === 'presentation-script') return 'Custom scripts';
  return 'Objects & layout';
}

export function visualPreviewPort(definition) {
  const ports = definition.outputs ?? [];
  return (
    ports.find((port) => port.name === definition.preview) ??
    ports.find((port) =>
      ['scalar', 'vector2', 'vector3', 'field2d', 'image2d', 'image-sequence'].includes(port.type),
    )
  );
}
