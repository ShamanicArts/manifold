/** Cached project values and the same command path used by existing controls.
 * Frame reads never clone the project or publish authoring transactions.
 */
export function presentationControls(runtime, request) {
  const values = new Map(),
    controls = new Set();
  function update(state) {
    values.clear();
    controls.clear();
    const parameters = new Map(
      state.graph.signal.initialParameters.map((p) => [`${p.nodeId}:${p.id}`, p.value]),
    );
    for (const endpoint of state.graph.endpoints ?? [])
      values.set(endpoint.path, parameters.get(`${endpoint.nodeId}:${endpoint.id}`));
    for (const control of state.graph.controls ?? []) {
      values.set(control.path, control.value);
      controls.add(control.path);
    }
  }
  update(runtime.snapshot());
  const unsubscribe = runtime.subscribe(update);
  return {
    value: (path) => values.get(path),
    set: (path, value) =>
      request({ operation: controls.has(path) ? 'control.set' : 'parameter.set', path, value }),
    setBatch(edits) {
      const mapped = edits.filter((edit) => controls.has(edit.path)).length;
      if (mapped && mapped !== edits.length)
        return Promise.reject(
          new TypeError('Batch targets must all be parameters or all be mapped controls'),
        );
      return request({ operation: mapped ? 'control.batch' : 'parameter.batch', edits });
    },
    dispose: unsubscribe,
  };
}
