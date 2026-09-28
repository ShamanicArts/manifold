// Authored Main control bindings describe the prepared Rust stages. Browser
// cables and native session validation consume the same rack catalog entries.
export const sameEndpoint = (a, b) => a?.moduleId === b?.moduleId && a?.portId === b?.portId;
export const matchingBinding = (bindings, edge) => bindings.find(binding =>
  sameEndpoint(binding.from, edge.from) && sameEndpoint(binding.to, edge.to));

export function matchesControlState(binding, rackState) {
  return binding.when.every(({ pointer, value }) => pointer.split('/').slice(1)
    .reduce((state, key) => state?.[key], rackState) === value);
}

export function inputBindingForState(catalog, moduleId, rackState) {
  return catalog.preparedControlInputs.find(binding => binding.to.moduleId === moduleId
    && matchesControlState(binding, rackState)) ?? null;
}

export function outputBindingForRoute(catalog, route) {
  return catalog.preparedControlOutputs.find(binding => binding.slot === 0
    && binding.source === route?.source && binding.target === route?.target
    && route?.enabled === true) ?? null;
}
