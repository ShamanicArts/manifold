// Resource values never enter a saved project or the audio engine. The suffix
// names a renderer contract; only ports with the same contract can connect.
export const isResourceType = (type) => /^resource:[a-z][a-z0-9.-]{0,79}$/.test(type);
export const isPresentationType = (type) =>
  ['analysis', 'scalar', 'field2d', 'vector2', 'vector3', 'image2d', 'image-sequence'].includes(
    type,
  ) || isResourceType(type);

export function projectParameterValue(graph, path) {
  const control = graph?.controls?.find((control) => control.path === path);
  if (control) return control.value;
  const endpoint = graph?.endpoints?.find((endpoint) => endpoint.path === path);
  return (
    endpoint &&
    graph.signal.initialParameters.find(
      (parameter) => parameter.nodeId === endpoint.nodeId && parameter.id === endpoint.id,
    )?.value
  );
}
