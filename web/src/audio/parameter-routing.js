// Resolve authored control macros before publishing bounded parameter updates to Wasm.
function directRoutes(parameter, value) {
  if (!Number.isInteger(parameter?.nodeId)) return [];
  return [parameter.nodeId, ...(parameter.mirrorNodeIds ?? [])]
    .map((nodeId) => ({ nodeId, id: parameter.nodeParameterId, value }));
}

export function parameterRoutes(parameters, values, id) {
  const parameter = parameters.get(id);
  if (!parameter) return [];
  const value = values.get(id);
  if (parameter.macroTargets) {
    if (values.get(parameter.enabledBy) !== 1) return [];
    return parameter.macroTargets.map((target) => ({ nodeId: target.nodeId,
      id: target.id, value: value * target.scale }));
  }
  if (parameter.enablesMacro != null) {
    const macro = parameters.get(parameter.enablesMacro);
    if (value === 1) return parameterRoutes(parameters, values, macro.id);
    return macro.overrides.flatMap((targetId) => directRoutes(parameters.get(targetId), values.get(targetId)));
  }
  for (const macro of parameters.values()) {
    if (macro.macroTargets && macro.overrides.includes(id) && values.get(macro.enabledBy) === 1) return [];
  }
  return directRoutes(parameter, value);
}
