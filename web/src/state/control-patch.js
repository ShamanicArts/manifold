const VERSION = 1;

function portKey(to, inputPort) { return `${to}:${inputPort}`; }

export function parseControlPatchState(document, project) {
  if (document?.schemaVersion !== VERSION || document?.projectId !== project.id) {
    throw new Error('This state belongs to a different Manifold v2 patch.');
  }
  const ports = new Map(project.patch.inputs.map((port) => [portKey(port.to, port.inputPort), port]));
  const routes = document.routes;
  if (!Array.isArray(routes) || routes.length !== ports.size) {
    throw new Error(`State needs ${ports.size} routes.`);
  }
  const seen = new Set();
  const validatedRoutes = routes.map((route) => {
    const key = portKey(route?.to, route?.inputPort);
    const port = ports.get(key);
    if (!port || seen.has(key) || !(route.from === null || port.sources.some(([id]) => id === route.from))) {
      throw new Error(`Invalid or repeated route ${key}.`);
    }
    seen.add(key);
    return { to: port.to, inputPort: port.inputPort, from: route.from };
  });
  const parameters = document.parameters;
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)
    || Object.keys(parameters).length !== project.parameters.length) {
    throw new Error(`State needs ${project.parameters.length} parameter values.`);
  }
  const validatedParameters = {};
  for (const parameter of project.parameters) {
    const value = parameters[parameter.hostId];
    const valid = typeof value === 'number' && Number.isFinite(value)
      && (parameter.kind === 'choice'
        ? (parameter.choiceValues ?? parameter.choices.map((_, index) => index)).includes(value)
        : parameter.kind === 'toggle' ? value === 0 || value === 1
        : value >= parameter.min && value <= parameter.max);
    if (!valid) throw new Error(`Invalid ${parameter.label} value.`);
    validatedParameters[parameter.hostId] = value;
  }
  return { schemaVersion: VERSION, projectId: project.id, routes: validatedRoutes, parameters: validatedParameters };
}

export function captureControlPatchState(project, values) {
  const routes = project.patch.inputs.map((port) => ({
    to: port.to,
    inputPort: port.inputPort,
    from: project.signal.connections.find((edge) => edge.to === port.to && edge.inputPort === port.inputPort)?.from ?? null,
  }));
  const parameters = Object.fromEntries(project.parameters.map((parameter) => [parameter.hostId, values.get(parameter.id)]));
  return parseControlPatchState({ schemaVersion: VERSION, projectId: project.id, routes, parameters }, project);
}
