import { GraphContractError } from './author.js';

const fail = (message) => {
  throw new GraphContractError('invalid-composition', message);
};
const isGraph = (definition) => definition.implementation.kind === 'composition';

/** Derive instance paths, canvas projections and executable leaves from ONE saved
 * graph. Numeric child IDs are canvas handles; paths are the instance identities.
 * Definitions never own runtime state. No script evaluation or host access here.
 */
export function expandComposition(composition, reservedIds = []) {
  const definitions = new Map(composition.definitions.map((d) => [d.id, d]));
  const used = new Set([...reservedIds, ...composition.nodes.map((n) => n.id)]);
  const nodes = [],
    objects = [],
    edges = [],
    groups = [],
    contexts = new Map();
  const handle = (path) => {
    let hash = 2166136261;
    for (let i = 0; i < path.length; i++) hash = Math.imul(hash ^ path.charCodeAt(i), 16777619);
    const id = ((hash >>> 0) % 0x40000000) + 0x40000000;
    if (used.has(id)) fail(`Nested canvas identity collision at ${path}`);
    used.add(id);
    return id;
  };
  function instantiate(body, parent = null, ancestors = []) {
    const scope = parent?.path ?? '';
    const owner = parent && definitions.get(parent.definition);
    const context = { body, parent, local: new Map(), input: null, output: null };
    contexts.set(scope, context);
    for (const saved of body.nodes) {
      const definition = definitions.get(saved.definition);
      if (!definition) fail(`Unknown definition ${saved.definition}`);
      const path = parent ? `${scope}/${saved.id}` : `/visual/${saved.id}`;
      const node = {
        ...saved,
        parameters: { ...saved.parameters },
        id: parent ? handle(path) : saved.id,
        path,
        scope,
        localId: saved.id,
        ownerDefinition: owner?.id ?? '',
        boundParameters: {},
      };
      for (const binding of body.bindings ?? [])
        if (binding.to === saved.id) {
          node.parameters[binding.parameter] = parent.parameters[binding.name];
          node.boundParameters[binding.parameter] = `${parent.label}.${binding.name}`;
        }
      if (node.bounds && parent) {
        const outer = parent.bounds ?? { x: 0, y: 0, width: 100, height: 100 };
        node.bounds = {
          x: outer.x + (node.bounds.x * outer.width) / 100,
          y: outer.y + (node.bounds.y * outer.height) / 100,
          width: (node.bounds.width * outer.width) / 100,
          height: (node.bounds.height * outer.height) / 100,
        };
      }
      context.local.set(saved.id, node);
      objects.push(node);
      if (isGraph(definition)) {
        if (ancestors.includes(definition.id))
          fail('Recursive composition definitions are not allowed');
        instantiate(definition.implementation.graph, node, [...ancestors, definition.id]);
      } else nodes.push(node);
    }
    for (const group of body.groups ?? [])
      groups.push({
        id: `${scope || '/visual'}/groups/${group.id}`,
        localId: group.id,
        scope,
        ownerDefinition: owner?.id ?? '',
        kind: 'visual',
        label: group.label,
        ids: group.nodes.map((id) => context.local.get(id).id),
      });
    if (parent) {
      for (const direction of ['input', 'output']) {
        const path = `${scope}/@${direction}`;
        const ports = direction === 'input' ? owner.inputs : (owner.outputs ?? []);
        const node = {
          id: handle(path),
          path,
          scope,
          localId: 0,
          ownerDefinition: owner.id,
          definition: owner.id,
          label: direction === 'input' ? 'Graph inputs' : 'Graph outputs',
          parameters: {},
          position: direction === 'input' ? [-260, 0] : [960, 0],
          interface: direction,
          inputs: direction === 'output' ? ports : [],
          outputs: direction === 'input' ? ports : [],
          boundParameters: {},
        };
        context[direction] = node;
        objects.push(node);
      }
    }
    for (const edge of body.connections) {
      const from = edge.from === 0 && parent ? context.input : context.local.get(edge.from);
      const to = edge.to === 0 && parent ? context.output : context.local.get(edge.to);
      const outputs = from?.interface
        ? from.outputs
        : (definitions.get(from?.definition)?.outputs ?? [{ name: 'analysis' }]);
      const inputs = to?.interface ? to.inputs : (definitions.get(to?.definition)?.inputs ?? []);
      edges.push({
        from: from?.id ?? edge.from,
        to: to?.id ?? edge.to,
        outputPort: outputs.findIndex((p) => p.name === edge.output),
        inputPort: inputs.findIndex((p) => p.name === edge.input),
      });
    }
  }
  instantiate(composition);
  function input(node, port) {
    const context = contexts.get(node.scope);
    const edge = context.body.connections.find((e) => e.to === node.localId && e.input === port);
    return edge ? source(context, edge) : null;
  }
  function source(context, edge) {
    if (edge.from === 0 && context.parent) return input(context.parent, edge.output);
    const from = context.local.get(edge.from);
    return from ? output(from, edge.output) : { from: edge.from, output: edge.output };
  }
  function output(node, port) {
    if (!isGraph(definitions.get(node.definition))) return { from: node.id, output: port };
    const context = contexts.get(node.path);
    const edge = context.body.connections.find((e) => e.to === 0 && e.input === port);
    return edge ? source(context, edge) : null;
  }
  const connections = [];
  for (const node of nodes)
    for (const port of definitions.get(node.definition).inputs) {
      const endpoint = input(node, port.name);
      if (endpoint) connections.push({ ...endpoint, to: node.id, input: port.name });
    }
  const compositeOutputs = {};
  const compositeMembers = {};
  for (const node of objects)
    if (!node.interface && isGraph(definitions.get(node.definition))) {
      compositeOutputs[node.id] = Object.fromEntries(
        (definitions.get(node.definition).outputs ?? []).map((p) => [p.name, output(node, p.name)]),
      );
      compositeMembers[node.id] = nodes
        .filter((child) => child.path.startsWith(`${node.path}/`))
        .map((child) => child.id);
    }
  return { nodes, connections, objects, edges, groups, compositeOutputs, compositeMembers };
}

/** Collapse a selection atomically. Boundary wires become named interface ports;
 * the same child definitions, source files and parameter values are retained.
 */
export function wrapComposition(composition, body, command, audioNodes) {
  const ids = new Set(command.ids);
  if (
    !ids.size ||
    ids.size !== command.ids?.length ||
    [...ids].some((id) => !body.nodes.some((n) => n.id === id))
  )
    fail('Wrap requires existing nodes in one graph');
  let suffix = 1;
  while (composition.definitions.some((d) => d.id === `graph-${suffix}`)) suffix++;
  const definitionId = command.definitionId ?? `graph-${suffix}`;
  if (composition.definitions.some((d) => d.id === definitionId))
    fail('Wrap requires a new definition ID');
  const definitions = new Map(composition.definitions.map((d) => [d.id, d]));
  const children = body.nodes.filter((n) => ids.has(n.id));
  // Authors can keep detailed controls inside the graph. Existing enclosing
  // bindings must still pass through its interface, even when not requested.
  const exposed = command.exposeParameters;
  if (
    exposed !== undefined &&
    (!Array.isArray(exposed) ||
      exposed.some((entry) => {
        const node = children.find((node) => node.id === entry?.id);
        return (
          !node ||
          !definitions.get(node.definition).parameters.some((p) => p.name === entry.parameter)
        );
      }))
  )
    fail('Exposed controls must name a selected node and one of its parameters');
  const definition = {
    id: definitionId,
    version: 1,
    label: command.label || 'Custom graph',
    implementation: {
      kind: 'composition',
      graph: { nodes: structuredClone(children), connections: [], bindings: [] },
    },
    inputs: [],
    outputs: [],
    parameters: [],
  };
  const nested = definition.implementation.graph;
  const fresh = (base, entries) => {
    let value = base,
      suffix = 2;
    while (entries.some((p) => p.name === value)) value = `${base}-${suffix++}`;
    return value;
  };
  const names = { input: new Map(), output: new Map() };
  const port = (direction, edge) => {
    const incoming = direction === 'input';
    const key = `${edge.from}:${edge.output}`;
    if (names[direction].has(key)) return names[direction].get(key);
    const node = body.nodes.find((n) => n.id === (incoming ? edge.to : edge.from));
    const sourcePort = (
      incoming ? definitions.get(node.definition).inputs : definitions.get(node.definition).outputs
    ).find((p) => p.name === (incoming ? edge.input : edge.output));
    const ports = incoming ? definition.inputs : definition.outputs;
    const name = fresh(sourcePort.name, ports);
    ports.push({ name, type: sourcePort.type });
    names[direction].set(key, name);
    return name;
  };
  const used = new Set([...body.nodes, ...audioNodes].map((n) => n.id));
  let id = 0x80000000;
  while (used.has(id)) id++;
  const outer = [],
    incoming = new Set();
  for (const edge of body.connections) {
    const from = ids.has(edge.from),
      to = ids.has(edge.to);
    if (from && to) nested.connections.push(edge);
    else if (!from && to) {
      const name = port('input', edge);
      nested.connections.push({ from: 0, output: name, to: edge.to, input: edge.input });
      if (!incoming.has(name)) outer.push({ ...edge, to: id, input: name });
      incoming.add(name);
    } else if (from && !to) {
      const name = port('output', edge);
      if (!nested.connections.some((e) => e.to === 0 && e.input === name))
        nested.connections.push({ from: edge.from, output: edge.output, to: 0, input: name });
      outer.push({ ...edge, from: id, output: name });
    } else outer.push(edge);
  }
  // Expose otherwise unconnected terminal results as useful reusable outputs.
  for (const node of children)
    for (const p of definitions.get(node.definition).outputs ?? [])
      if (!body.connections.some((e) => e.from === node.id && e.output === p.name)) {
        const name = port('output', { from: node.id, output: p.name });
        nested.connections.push({ from: node.id, output: p.name, to: 0, input: name });
      }
  const parameters = {};
  for (const node of children)
    for (const p of definitions.get(node.definition).parameters) {
      if (
        exposed &&
        !exposed.some((entry) => entry.id === node.id && entry.parameter === p.name) &&
        !(body.bindings ?? []).some(
          (binding) => binding.to === node.id && binding.parameter === p.name,
        )
      )
        continue;
      const name = fresh(p.name, definition.parameters);
      definition.parameters.push({
        ...p,
        name,
        label: `${node.label} · ${p.label}`,
        default: node.parameters[p.name],
      });
      parameters[name] = node.parameters[p.name];
      nested.bindings.push({ name, to: node.id, parameter: p.name });
    }
  // Bindings from a containing graph continue through the new interface.
  for (const binding of body.bindings ?? [])
    if (ids.has(binding.to)) {
      const inner = nested.bindings.find(
        (b) => b.to === binding.to && b.parameter === binding.parameter,
      );
      binding.to = id;
      binding.parameter = inner.name;
    }
  const position = [
    Math.min(...children.map((n) => n.position[0])),
    Math.min(...children.map((n) => n.position[1])),
  ];
  for (const child of nested.nodes)
    child.position = [child.position[0] - position[0], child.position[1] - position[1]];
  if (body.groups) {
    nested.groups = body.groups.filter((group) => group.nodes.every((id) => ids.has(id)));
    body.groups = body.groups
      .filter((group) => !nested.groups.includes(group))
      .map((group) => ({
        ...group,
        nodes: [...new Set(group.nodes.map((member) => (ids.has(member) ? id : member)))],
      }))
      .filter((group) => group.nodes.length > 1);
  }
  body.nodes = body.nodes.filter((n) => !ids.has(n.id));
  body.nodes.push({ id, definition: definitionId, label: definition.label, parameters, position });
  body.connections = outer;
  composition.definitions.push(definition);
  composition.version = Math.max(composition.version, 3);
}
