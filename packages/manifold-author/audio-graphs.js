import { listPrimitives, createGraphWorkspace } from './index.js';
const AUDIO_CATALOG = Object.fromEntries(
  listPrimitives().map((p) => [p.type, { ...p, parameters: p.parameters ?? [] }]),
);
const configuredCatalog = new Map();
const constructorConfig = (node, catalog = AUDIO_CATALOG) =>
  Object.fromEntries(
    Object.entries(catalog[node.type].configuration ?? {}).map(([name, field]) => [
      name,
      node[field.argument],
    ]),
  );
function primitiveSpec(node) {
  const config = node.config ?? {},
    key = JSON.stringify([node.type, config]);
  if (!Object.keys(AUDIO_CATALOG[node.type].configuration ?? {}).length)
    return AUDIO_CATALOG[node.type];
  if (!configuredCatalog.has(key)) {
    // Ask the existing authoring contract for configured ports/parameters (e.g.
    // variable-width mixers); do not duplicate its DSP admission rules here.
    const graph = createGraphWorkspace();
    const described = graph.describeNode(graph.add(node.type, { id: 4, config }));
    if (configuredCatalog.size >= 256) configuredCatalog.clear();
    configuredCatalog.set(key, {
      ...AUDIO_CATALOG[node.type],
      inputs: described.inputs,
      outputs: described.outputs,
      parameters: described.parameters,
    });
  }
  return configuredCatalog.get(key);
}

// Authoring composition over GraphWorkspace. Containers and interfaces never
// become DSP kernels; the existing flat graph remains the execution contract.
const clone = (value) => structuredClone(value);
const fail = (message) => {
  throw new Error(message);
};
const name = (value) => typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value);
const label = (value) => typeof value === 'string' && !!value.trim() && value.length <= 128;
const hash = (value) => {
  let h = 2166136261;
  for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};
export const graphCanvasId = (path) => 0x40000000 + (hash(path) & 0x3fffffff);
const leafId = (path) => 4 + (hash(path) % 65532);
const empty = () => ({ version: 1, definitions: [], instances: [] });
const namedPort = (ports, value) =>
  ports.find((p) => p.name === value) ?? fail(`Unknown audio graph port ${value}`);

export function validateAudioGraphs(value = empty()) {
  const audio = clone(value);
  if (
    audio.version !== 1 ||
    !Array.isArray(audio.definitions) ||
    !Array.isArray(audio.instances)
  )
    fail('Expected version 1 audio graphs with definitions and instances');
  const defs = new Map();
  for (const d of audio.definitions) {
    if (!name(d.id) || defs.has(d.id) || !label(d.label))
      fail('Audio graph definitions need unique IDs and labels');
    if (
      !Array.isArray(d.nodes) ||
      !d.nodes.length ||
      !Array.isArray(d.connections) ||
      !Array.isArray(d.inputs) ||
      !Array.isArray(d.outputs) ||
      !Array.isArray(d.parameters ?? [])
    )
      fail('Expected audio graph nodes, connections and interface arrays');
    defs.set(d.id, d);
    const keys = new Set();
    for (const n of d.nodes) {
      if (!name(n.key) || keys.has(n.key) || Boolean(n.type) === Boolean(n.definition))
        fail('Audio graph children need unique keys and a primitive type or graph definition');
      if (
        n.type &&
        (!AUDIO_CATALOG[n.type] ||
          ['input.raw', 'output', 'monitor', 'input.sidechain'].includes(n.type))
      )
        fail(`Unsupported contained audio primitive ${n.type}`);
      keys.add(n.key);
    }
    for (const direction of ['inputs', 'outputs', 'parameters']) {
      const names = new Set();
      for (const p of d[direction] ?? []) {
        if (
          !name(p.name) ||
          names.has(p.name) ||
          (!keys.has(p.node) &&
            !(direction !== 'parameters' && p.node === null && typeof p.signal === 'string')) ||
          typeof p[direction === 'parameters' ? 'parameter' : 'port'] !== 'string'
        )
          fail(`Invalid audio graph ${direction} binding`);
        names.add(p.name);
      }
    }
    const destinations = new Set();
    for (const e of d.connections) {
      if (
        !keys.has(e.from) ||
        !keys.has(e.to) ||
        typeof e.input !== 'string' ||
        typeof e.output !== 'string'
      )
        fail('Audio graph cable needs named children and ports');
      const key = e.to + ':' + e.input;
      if (destinations.has(key)) fail('An audio input accepts only one source');
      destinations.add(key);
    }
    const inputs = new Set();
    for (const p of d.inputs) {
      if (p.node === null) continue;
      const key = p.node + ':' + p.port;
      if (inputs.has(key) || destinations.has(key))
        fail('An exposed audio input cannot also have an inner source');
      inputs.add(key);
    }
  }
  const depths = new Map();
  const visit = (id, stack = []) => {
    if (stack.includes(id)) fail('Recursive audio graph');
    if (depths.has(id)) return depths.get(id);
    const d = defs.get(id) ?? fail(`Unknown audio graph definition ${id}`);
    let depth = 1;
    for (const n of d.nodes)
      if (n.definition) depth = Math.max(depth, 1 + visit(n.definition, [...stack, id]));
    depths.set(id, depth);
    return depth;
  };
  for (const id of defs.keys()) visit(id);
  const paths = new Set();
  for (const instance of audio.instances) {
    if (
      typeof instance.path !== 'string' ||
      !/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(instance.path) ||
      paths.has(instance.path) ||
      !defs.has(instance.definition) ||
      (instance.label !== undefined && !label(instance.label))
    )
      fail('Audio graph instances need unique absolute paths and a definition');
    paths.add(instance.path);
  }
  return audio;
}

function expand(value, project = {}) {
  const audio = validateAudioGraphs(value),
    defs = new Map(audio.definitions.map((d) => [d.id, d]));
  const roots = [],
    groups = [],
    leaves = [],
    ids = new Set(),
    paths = new Set();
  // Reuse authored identities on reopen. Hashes are preferences, not a finite
  // pool: resolve collisions against every real or explicitly bound node.
  const previous = new Map((project.instances ?? []).map(node => [node.path, node.nodeId]));
  const occupied = new Set([1, 3, ...(project.signal?.nodes ?? []).map(node => node.id),
    ...audio.instances.flatMap(root => Object.values(root.nodes ?? {}).map(node => node.id))]);
  const available = preferred => {
    let id = preferred;
    while (occupied.has(id) || ids.has(id)) {
      id = id === 0xffffffff ? 4 : id + 1;
      if (id === preferred) fail('The node ID format has no unused identity');
    }
    return id;
  };
  function reserve(id, path) {
    if (ids.has(id) || paths.has(path))
      fail('Audio graph identity collision; use a different instance path');
    ids.add(id);
    paths.add(path);
  }
  function group(definition, path, scope, root, prefix = '') {
    const d = defs.get(definition),
      g = {
        id: available(graphCanvasId(path)),
        path,
        scope,
        definition,
        root,
        prefix,
        children: new Map(),
        inputs: [],
        outputs: [],
        parameters: [],
        wires: [],
      };
    reserve(g.id, path);
    groups.push(g);
    for (const n of d.nodes) {
      const key = prefix + n.key;
      if (n.definition) {
        g.children.set(n.key, group(n.definition, path + '/' + n.key, path, root, key + '/'));
        continue;
      }
      const binding = root.nodes?.[key];
      const leaf = {
        ...n,
        id: binding?.id ?? previous.get(root.path + '/' + key) ?? available(leafId(root.path + '/' + key)),
        path: binding?.path ?? root.path + '/' + key,
        scope: path,
        root,
        key,
        adopt: binding?.adopt === true,
      };
      if (
        !Number.isInteger(leaf.id) ||
        leaf.id < 4 ||
        leaf.id > 0xffffffff ||
        typeof leaf.path !== 'string'
      )
        fail('Audio graph leaf needs a stable DSP ID and path');
      reserve(leaf.id, leaf.path);
      leaves.push(leaf);
      g.children.set(n.key, leaf);
    }
    const port = (key, direction, portName) => {
      const child = g.children.get(key) ?? fail('Missing audio graph child');
      if (child.children) return namedPort(child[direction], portName).target;
      const spec = namedPort(primitiveSpec(child)[direction], portName);
      return { id: child.id, port: spec.name, signal: spec.signal, leaf: child };
    };
    for (const direction of ['inputs', 'outputs'])
      for (const p of d[direction])
        g[direction].push({
          ...p,
          target: p.node === null ? null : port(p.node, direction, p.port),
        });
    for (const p of d.parameters ?? []) {
      const child = g.children.get(p.node);
      let target;
      if (child.children) target = namedPort(child.parameters, p.parameter).target;
      else {
        const spec = namedPort(primitiveSpec(child).parameters, p.parameter);
        target = { leaf: child, spec };
      }
      g.parameters.push({ ...p, target });
    }
    for (const e of d.connections)
      g.wires.push({ from: port(e.from, 'outputs', e.output), to: port(e.to, 'inputs', e.input) });
    // Resolve interfaces before touching the caller's graph. Type and cycle
    // validation are also enforced by GraphWorkspace when wiring the candidate.
    for (const wire of g.wires)
      if (wire.from && wire.to && wire.from.signal !== wire.to.signal)
        fail('Incompatible audio graph port types');
    return g;
  }
  for (const root of audio.instances) roots.push(group(root.definition, root.path, '', root));
  return { audio, defs, roots, groups, leaves };
}

export function applyAudioGraphs(graph, value) {
  const snapshot = graph.snapshot();
  const result = expand(value, { instances: snapshot.instances, signal: { nodes: snapshot.nodes } });
  for (const leaf of result.leaves) {
    let handle = graph.find(leaf.id);
    if (leaf.adopt) {
      if (!handle || handle.type !== leaf.type || graph.findInstance(leaf.path)?.id !== leaf.id)
        fail(`The adopted audio node ${leaf.path} no longer matches its graph definition`);
      graph.configure(handle, leaf.config ?? {});
    } else {
      if (handle || graph.findInstance(leaf.path))
        fail(`Audio graph DSP identity collision at ${leaf.path}`);
      handle = graph.add(leaf.type, { id: leaf.id, config: leaf.config ?? {} });
      graph.registerInstance(leaf.path, handle);
      for (const p of leaf.values ?? []) handle.parameter(p.name).set(p.value);
    }
    for (const p of graph.describeNode(handle).inputs) graph.disconnect(handle.input(p.name));
  }
  for (const g of result.groups)
    for (const e of g.wires)
      if (e.from && e.to)
        graph.connect(
          graph.find(e.from.id).output(e.from.port),
          graph.find(e.to.id).input(e.to.port),
        );
  for (const g of result.roots)
    for (const p of g.parameters) {
      const { leaf, spec } = p.target;
      // Existing scripts may expose their controls after applyStudioGraph.
      if (leaf.adopt) continue;
      if (graph.listParameters().some((e) => e.nodeId === leaf.id && e.id === spec.id)) continue;
      graph
        .find(leaf.id)
        .parameter(spec.name)
        .expose({
          path: `${g.path}/${p.name}`,
          min: p.min ?? spec.min,
          max: p.max ?? spec.max,
          default: p.default ?? spec.default,
        });
    }
  return new Map(
    result.groups.map((g) => [
      g.path,
      {
        input: (port) => {
          const t = namedPort(g.inputs, port).target;
          return t ? graph.find(t.id).input(t.port) : null;
        },
        output: (port) => {
          const t = namedPort(g.outputs, port).target;
          return t ? graph.find(t.id).output(t.port) : null;
        },
      },
    ]),
  );
}

function primitiveDescriptor(node, project, catalog, layout) {
  const spec = primitiveSpec({ type: node.type, config: constructorConfig(node, catalog) }),
    instance =
      project.instances?.find((i) => i.nodeId === node.id)?.path ?? `/${node.type}/${node.id}`;
  const placement = layout.find((p) => p.path === instance);
  return {
    id: node.id,
    type: node.type,
    label: spec.label ?? node.type,
    category: spec.category,
    description: spec.description,
    instance,
    domain: 'audio',
    scope: '',
    inputs: spec.inputs,
    outputs: node.type === 'output' ? [{ name: 'analysis', signal: 'analysis' }] : spec.outputs,
    parameters: spec.parameters.map((p) => {
      const endpoint = project.endpoints?.find((e) => e.nodeId === node.id && e.id === p.id);
      return {
        ...p,
        label: p.label ?? p.name,
        min: endpoint?.min ?? p.min,
        max: endpoint?.max ?? p.max,
        default:
          project.signal.initialParameters.find((v) => v.nodeId === node.id && v.id === p.id)
            ?.value ?? p.default,
        path: endpoint?.path ?? '',
      };
    }),
    position: placement ? [placement.x, placement.y] : null,
    positionSpace: placement?.space ?? '',
  };
}

export function audioGraphPresentation(value, project, catalog, layout = []) {
  const io = project.signal.io;
  const usedNodes = new Set(project.signal.connections.flatMap((e) => [e.from, e.to]));
  for (const binding of io?.inputBindings ?? [])
    if (binding.channels.some((channel) => channel !== null)) usedNodes.add(binding.nodeId);
  for (const binding of io?.outputBindings ?? []) if (binding) usedNodes.add(binding.nodeId);
  const authoredNodes = new Set(project.instances?.map((instance) => instance.nodeId));
  const x = expand(value, project),
    nodes = project.signal.nodes
      .filter((n) => n.type !== 'monitor')
      // Explicit buses supersede the legacy unconnected input/output scaffolding.
      .filter(
        (n) =>
          !io ||
          authoredNodes.has(n.id) ||
          usedNodes.has(n.id) ||
          !['input.raw', 'input.sidechain', 'output'].includes(n.type),
      )
      .map((n) => primitiveDescriptor(n, project, catalog, layout));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const sourceLink = [
    { role: 'definition', label: 'Audio graph definition', path: '/audio-graphs.json' },
  ];
  for (const g of x.groups)
    if (nodes.some((n) => n.instance === g.path)) fail('Audio graph instance path already exists');
  const interfaceIds = new Set(nodes.map((n) => n.id));
  for (const leaf of x.leaves) {
    const n = byId.get(leaf.id) ?? fail(`Missing contained DSP node ${leaf.id}`);
    n.scope = leaf.scope;
    n.ownerDefinition = x.groups.find((g) => g.path === leaf.scope).definition;
    if (!leaf.adopt)
      n.sourceLinks = sourceLink.map((link) => ({
        ...link,
        sharedInstances: x.groups.filter((g) => g.definition === n.ownerDefinition).length,
      }));
  }
  for (const g of x.groups) {
    const d = x.defs.get(g.definition),
      placement = layout.find((p) => p.path === g.path);
    const parameters = g.parameters.map((p) => {
      const { leaf, spec } = p.target;
      const actual = byId.get(leaf.id).parameters.find((v) => v.name === spec.name);
      return { ...actual, name: p.name, label: p.label ?? p.name };
    });
    const sharedInstances = x.groups.filter((other) => other.definition === g.definition).length;
    nodes.push({
      id: g.id,
      type: g.definition,
      label: g.scope ? d.label : (g.root.label ?? d.label),
      instance: g.path,
      domain: 'audio',
      scope: g.scope,
      implementationKind: 'composition',
      ownerDefinition: g.scope ? x.groups.find((p) => p.path === g.scope).definition : '',
      parameters,
      inputs: g.inputs.map((p) => ({ name: p.name, signal: p.target?.signal ?? p.signal })),
      outputs: g.outputs.map((p) => ({ name: p.name, signal: p.target?.signal ?? p.signal })),
      sourceLinks: sourceLink.map((l) => ({ ...l, sharedInstances })),
      position: placement ? [placement.x, placement.y] : null,
      positionSpace: placement?.space ?? '',
    });
    for (const direction of ['inputs', 'outputs']) {
      const path = g.path + (direction === 'inputs' ? '/@inputs' : '/@outputs'),
        id = graphCanvasId(path);
      if (interfaceIds.has(id) || x.groups.some((g) => g.id === id))
        fail('Audio graph canvas identity collision');
      interfaceIds.add(id);
      g[direction + 'Id'] = id;
      nodes.push({
        id,
        type: 'audio-interface',
        label: direction === 'inputs' ? 'Graph inputs' : 'Graph outputs',
        instance: path,
        domain: 'audio',
        scope: g.path,
        implementationKind: direction === 'inputs' ? 'interface-input' : 'interface-output',
        parameters: [],
        ownerDefinition: g.definition,
        inputs:
          direction === 'outputs'
            ? g.outputs.map((p) => ({ name: p.name, signal: p.target?.signal ?? p.signal }))
            : [],
        outputs:
          direction === 'inputs'
            ? g.inputs.map((p) => ({ name: p.name, signal: p.target?.signal ?? p.signal }))
            : [],
        sourceLinks: sourceLink,
      });
    }
  }
  const edges = [];
  for (const g of x.groups) {
    const d = x.defs.get(g.definition);
    const child = (key, direction, port) => {
      const c = g.children.get(key);
      return {
        id: c.id,
        index: (c.children ? c[direction] : primitiveSpec(c)[direction]).findIndex(
          (p) => p.name === port,
        ),
      };
    };
    for (const e of d.connections) {
      const a = child(e.from, 'outputs', e.output),
        b = child(e.to, 'inputs', e.input);
      edges.push({ from: a.id, outputPort: a.index, to: b.id, inputPort: b.index });
    }
    g.inputs.forEach((p, i) => {
      if (p.node === null) return;
      const b = child(p.node, 'inputs', p.port);
      edges.push({ from: g.inputsId, outputPort: i, to: b.id, inputPort: b.index });
    });
    g.outputs.forEach((p, i) => {
      if (p.node === null) return;
      const a = child(p.node, 'outputs', p.port);
      edges.push({ from: a.id, outputPort: a.index, to: g.outputsId, inputPort: i });
    });
  }
  const owner = new Map(
    x.leaves.map((leaf) => [leaf.id, x.roots.find((g) => g.root === leaf.root)]),
  );
  const projectPort = (id, direction, index) =>
    catalog[project.signal.nodes.find((n) => n.id === id).type][direction][index]?.name;
  for (const e of project.signal.connections) {
    const from = owner.get(e.from),
      to = owner.get(e.to);
    if (from && from === to) continue;
    const boundary = (g, direction, id, index) =>
      g[direction].findIndex(
        (p) => p.target?.id === id && p.target.port === projectPort(id, direction, index),
      );
    const outputPort = from ? boundary(from, 'outputs', e.from, e.outputPort) : e.outputPort,
      inputPort = to ? boundary(to, 'inputs', e.to, e.inputPort) : e.inputPort;
    if (outputPort < 0 || inputPort < 0)
      fail('Audio cable crosses a graph boundary without an exposed port');
    edges.push({ from: from?.id ?? e.from, outputPort, to: to?.id ?? e.to, inputPort });
  }
  // Host output bindings are real signal routes, even though they need no DSP kernel.
  let channelOffset = 0;
  for (const bus of io?.outputs ?? []) {
    const bindings = io.outputBindings.slice(channelOffset, channelOffset + bus.channels);
    channelOffset += bus.channels;
    const combined = bindings.every(
      (b, index) =>
        b &&
        b.nodeId === bindings[0]?.nodeId &&
        b.outputPort === bindings[0]?.outputPort &&
        b.channel === index,
    );
    const instance = `/@outputs/${bus.id}`,
      id = graphCanvasId(instance);
    if (nodes.some((node) => node.id === id)) fail('Audio output canvas identity collision');
    nodes.push({
      id,
      type: 'audio-interface',
      label: `Output · ${bus.name}`,
      instance,
      domain: 'audio',
      scope: '',
      implementationKind: 'interface-output',
      parameters: [],
      inputs: (combined
        ? ['audio']
        : Array.from({ length: bus.channels }, (_, i) => `channel-${i + 1}`)
      ).map((name) => ({ name, signal: 'audio' })),
      outputs: bus === io.outputs[0] ? [{ name: 'analysis', signal: 'analysis' }] : [],
      sourceLinks: [{ role: 'declaration', label: 'Device source', path: '/project.mjs' }],
    });
    (combined ? bindings.slice(0, 1) : bindings).forEach((binding, inputPort) => {
      if (!binding) return;
      const group = owner.get(binding.nodeId);
      const outputPort = group
        ? group.outputs.findIndex(
            (port) =>
              port.target?.id === binding.nodeId &&
              port.target.port === projectPort(binding.nodeId, 'outputs', binding.outputPort),
          )
        : binding.outputPort;
      if (outputPort < 0) fail('Audio output crosses a graph boundary without an exposed port');
      edges.push({ from: group?.id ?? binding.nodeId, outputPort, to: id, inputPort });
    });
  }
  return {
    audioNodes: nodes,
    audioEdges: edges,
    audioPalette: x.audio.definitions.map((d) => ({
      type: d.id,
      label: d.label,
      kind: 'audio-graph',
      inputs: d.inputs.length,
      outputs: d.outputs.length,
      parameters: d.parameters?.length ?? 0,
      input_ports: d.inputs.map((p) => ({ name: p.name })),
      output_ports: d.outputs.map((p) => ({ name: p.name })),
    })),
  };
}

function writeBindings(x) {
  for (const root of x.audio.instances) {
    root.nodes = {};
    for (const leaf of x.leaves.filter((l) => l.root.path === root.path))
      root.nodes[leaf.key] = {
        id: leaf.id,
        path: leaf.path,
        ...(leaf.adopt ? { adopt: true } : {}),
      };
  }
}
function uniqueName(base, used) {
  base = base.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 52);
  if (!/^[a-zA-Z]/.test(base)) base = 'graph-' + base;
  let n = base,
    i = 2;
  while (used.has(n)) n = base + '-' + i++;
  used.add(n);
  return n;
}
function extract(nodes, connections, inputs, outputs, parameters, selected, id, label) {
  const d = {
    id,
    label,
    nodes: nodes.filter((n) => selected.has(n.key)),
    connections: connections.filter((e) => selected.has(e.from) && selected.has(e.to)),
    inputs: [],
    outputs: [],
    parameters: [],
  };
  const inNames = new Set(),
    outNames = new Set(),
    paramNames = new Set();
  const bind = (direction, node, port, signal) => {
    const found = d[direction].find((p) => p.node === node && p.port === port);
    if (found) {
      if (signal) found.signal = signal;
      return found.name;
    }
    const n = uniqueName(node + '-' + port, direction === 'inputs' ? inNames : outNames);
    d[direction].push({ name: n, node, port, ...(signal ? { signal } : {}) });
    return n;
  };
  for (const e of connections) {
    if (selected.has(e.to) && !selected.has(e.from)) bind('inputs', e.to, e.input);
    if (selected.has(e.from) && !selected.has(e.to)) bind('outputs', e.from, e.output);
  }
  for (const p of inputs) if (selected.has(p.node)) bind('inputs', p.node, p.port, p.signal);
  for (const p of outputs) if (selected.has(p.node)) bind('outputs', p.node, p.port, p.signal);
  for (const p of parameters)
    if (selected.has(p.node)) d.parameters.push({ ...p, name: uniqueName(p.name, paramNames) });
  return { d, bind };
}

/** Mutate only the literal authoring data. The caller evaluates and publishes a
 * candidate through the normal project transaction before accepting any edit. */
export function editAudioGraphs(edits, command, project, catalog = AUDIO_CATALOG) {
  const x = expand(edits.audioGraphs, project),
    view = audioGraphPresentation(edits.audioGraphs, project, catalog, edits.layout),
    nodes = view.audioNodes;
  const get = (path) =>
    nodes.find(
      (n) =>
        n.instance === path ||
        (path === '@input' && n.id === 1) ||
        (path === '@output' && n.id === 3),
    );
  const selected = command.ids?.map((id) => nodes.find((n) => n.id === id));
  const persist = () => {
    edits.audioGraphs = validateAudioGraphs(x.audio);
  };
  if (command.operation === 'graph.audio.replace') {
    edits.audioGraphs = validateAudioGraphs(command.value);
    return true;
  }
  if (command.operation === 'graph.addInstance') {
    if (!x.defs.has(command.definitionId)) fail('Unknown reusable audio graph');
    if (command.scope) {
      const d = x.defs.get(command.scope) ?? fail('Unknown containing audio graph');
      d.nodes.push({
        key: uniqueName(command.definitionId, new Set(d.nodes.map((n) => n.key))),
        definition: command.definitionId,
      });
      persist();
      return true;
    }
    const used = new Set(x.audio.instances.map((i) => i.path));
    let i = 1,
      path = command.path;
    if (!path) {
      do {
        path = `/audio/${command.definitionId}/${i++}`;
      } while (used.has(path));
    }
    if (used.has(path)) fail('Audio graph instance path already exists');
    x.audio.instances.push({
      definition: command.definitionId,
      path,
      label:
        command.label ??
        `${x.defs.get(command.definitionId).label} ${x.audio.instances.filter((i) => i.definition === command.definitionId).length + 1}`,
    });
    persist();
    return true;
  }
  if (command.operation === 'graph.add' && command.scope) {
    const d = x.defs.get(command.scope) ?? fail('Unknown containing audio graph');
    d.nodes.push({
      key: uniqueName(command.type, new Set(d.nodes.map((n) => n.key))),
      type: command.type,
    });
    persist();
    return true;
  }
  if (command.operation === 'graph.wrap') {
    if (
      !selected?.length ||
      selected.some(
        (n) => !n || n.id === 1 || n.id === 3 || n.implementationKind?.startsWith('interface-'),
      ) ||
      new Set(command.ids).size !== selected.length ||
      selected.some((n) => n.scope !== selected[0].scope)
    )
      fail('Select audio nodes from one graph to wrap');
    const labels = new Set(x.audio.definitions.map((d) => d.id));
    const id =
      command.definitionId ??
      uniqueName((command.label ?? 'audio-graph').toLowerCase(), new Set(labels));
    if (!name(id) || labels.has(id)) fail('Use a new audio graph definition ID');
    const label = command.label?.trim() || 'Audio graph';
    const scope = selected[0].scope,
      parent = x.groups.find((g) => g.path === scope);
    writeBindings(x);
    if (parent) {
      const d = x.defs.get(parent.definition),
        keys = new Set(
          [...parent.children]
            .filter(([, c]) => selected.some((n) => n.id === c.id))
            .map(([k]) => k),
        );
      const { d: inner, bind } = extract(
        d.nodes,
        d.connections,
        d.inputs,
        d.outputs,
        d.parameters ?? [],
        keys,
        id,
        label,
      );
      for (const direction of ['inputs', 'outputs'])
        for (const p of inner[direction]) {
          const child = parent.children.get(p.node),
            port = namedPort(
              child.children ? child[direction] : primitiveSpec(child)[direction],
              p.port,
            );
          p.signal = port.target?.signal ?? port.signal;
        }
      const key = uniqueName(id, new Set(d.nodes.map((n) => n.key)));
      // Preserve every occurrence's DSP identity while its authored key gains a layer.
      for (const g of x.groups.filter((g) => g.definition === parent.definition)) {
        const root = x.audio.instances.find((r) => r.path === g.root.path),
          next = {};
        for (const [k, b] of Object.entries(root.nodes)) {
          const local = k.startsWith(g.prefix) ? k.slice(g.prefix.length) : null;
          next[local !== null && keys.has(local.split('/')[0]) ? g.prefix + key + '/' + local : k] =
            b;
        }
        root.nodes = next;
      }
      d.nodes = [...d.nodes.filter((n) => !keys.has(n.key)), { key, definition: id }];
      d.connections = d.connections
        .filter((e) => !(keys.has(e.from) && keys.has(e.to)))
        .map((e) => ({
          ...e,
          ...(keys.has(e.from) ? { from: key, output: bind('outputs', e.from, e.output) } : {}),
          ...(keys.has(e.to) ? { to: key, input: bind('inputs', e.to, e.input) } : {}),
        }));
      for (const direction of ['inputs', 'outputs'])
        d[direction] = d[direction].map((p) =>
          keys.has(p.node)
            ? { ...p, node: key, port: bind(direction, p.node, p.port, p.signal) }
            : p,
        );
      d.parameters = (d.parameters ?? []).map((p) =>
        keys.has(p.node)
          ? {
              ...p,
              node: key,
              parameter: inner.parameters.find(
                (v) => v.node === p.node && v.parameter === p.parameter,
              ).name,
            }
          : p,
      );
      x.audio.definitions.push(inner);
    } else {
      const rootNodes = nodes.filter((n) => !n.scope),
        keyOf = (n) => 'n' + n.id,
        keys = new Set(selected.map(keyOf));
      const defs = selected.map((n) => {
        const g = x.roots.find((g) => g.id === n.id);
        if (g) return { key: keyOf(n), definition: g.definition };
        const actual = project.signal.nodes.find((v) => v.id === n.id);
        if (
          project.assets?.some?.((a) => a.nodeId === n.id) ||
          project.sampleBindings?.some?.(
            (a) => a.nodeId === n.id || a.sourceNodeId === n.id || a.targetNodeId === n.id,
          ) ||
          project.signal.captureSources?.some((a) => a.nodeId === n.id) ||
          project.signal.selectedCaptureNodeId === n.id ||
          project.signal.io?.inputBindings?.some((b) => b.nodeId === n.id) ||
          project.signal.io?.outputBindings?.some((b) => b.nodeId === n.id)
        )
          fail(
            'Resource and host-channel bound nodes need explicit resource authoring before cloning',
          );
        return {
          key: keyOf(n),
          type: actual.type,
          config: constructorConfig(actual, catalog),
          values: n.parameters.map((p) => ({
            name: p.name,
            value:
              project.signal.initialParameters.find((v) => v.nodeId === n.id && v.id === p.id)
                ?.value ?? p.default,
          })),
        };
      });
      const rootIds = new Map(rootNodes.map((n) => [n.id, n]));
      const edges = view.audioEdges.filter((e) => rootIds.has(e.from) && rootIds.has(e.to));
      const connections = edges.map((e) => ({
        from: keyOf(rootIds.get(e.from)),
        output: rootIds.get(e.from).outputs[e.outputPort].name,
        to: keyOf(rootIds.get(e.to)),
        input: rootIds.get(e.to).inputs[e.inputPort].name,
      }));
      const inputs = [],
        outputs = [],
        parameters = [];
      for (const n of selected) {
        for (const p of n.inputs)
          if (!connections.some((e) => e.to === keyOf(n) && e.input === p.name && keys.has(e.from)))
            inputs.push({ node: keyOf(n), port: p.name, signal: p.signal });
        for (const p of n.outputs)
          if (
            !connections.some((e) => e.from === keyOf(n) && e.output === p.name) ||
            connections.some((e) => e.from === keyOf(n) && e.output === p.name && !keys.has(e.to))
          )
            outputs.push({ node: keyOf(n), port: p.name, signal: p.signal });
        for (const p of n.parameters.filter((p) => p.path))
          parameters.push({
            name: keyOf(n) + '-' + p.name,
            node: keyOf(n),
            parameter: p.name,
            label: p.label,
            min: p.min,
            max: p.max,
            default: p.default,
            ...(p.choices ? { choices: p.choices } : {}),
            ...(p.choiceValues ? { choiceValues: p.choiceValues } : {}),
          });
      }
      const { d, bind } = extract(defs, connections, inputs, outputs, parameters, keys, id, label);
      const path = '/audio/' + id + '/1';
      if (x.audio.instances.some((i) => i.path === path))
        fail('Audio graph instance path already exists');
      const instance = { path, definition: id, nodes: {} };
      for (const n of selected) {
        const g = x.roots.find((g) => g.id === n.id);
        if (g) {
          for (const [key, binding] of Object.entries(g.root.nodes))
            instance.nodes[keyOf(n) + '/' + key] = binding;
        } else instance.nodes[keyOf(n)] = { id: n.id, path: n.instance, adopt: true };
      }
      x.audio.instances = x.audio.instances.filter(
        (i) => !selected.some((n) => n.instance === i.path),
      );
      x.audio.instances.push(instance);
      x.audio.definitions.push(d);
      const reference = (n) => (n.id === 1 ? '@input' : n.id === 3 ? '@output' : n.instance);
      // Capture accepted boundary routing as named aliases. Later edits of the
      // definition's input/output bindings now reroute all callers correctly.
      edits.connections = [];
      for (const n of rootNodes)
        for (const p of n.inputs) {
          const e = connections.find((e) => e.to === keyOf(n) && e.input === p.name);
          if (keys.has(keyOf(n)) && e && keys.has(e.from)) continue;
          const from = e && rootNodes.find((n) => keyOf(n) === e.from);
          edits.connections.push({
            to: keys.has(keyOf(n)) ? path : reference(n),
            input: keys.has(keyOf(n)) ? bind('inputs', keyOf(n), p.name, p.signal) : p.name,
            from: from ? (keys.has(keyOf(from)) ? path : reference(from)) : null,
            ...(from
              ? {
                  output: keys.has(keyOf(from))
                    ? bind(
                        'outputs',
                        keyOf(from),
                        e.output,
                        from.outputs.find((p) => p.name === e.output).signal,
                      )
                    : e.output,
                }
              : {}),
          });
        }
    }
    persist();
    return true;
  }
  const node = nodes.find((n) => n.id === command.id || n.instance === command.path);
  if (
    command.operation === 'graph.position' &&
    node &&
    (node.scope || node.implementationKind === 'composition')
  ) {
    const world = command.space === 'world';
    if (command.space && !world) fail('Unknown graph position space');
    if (
      !Number.isFinite(command.x) ||
      !Number.isFinite(command.y) ||
      ![command.x, command.y].every((v) => (world ? Math.abs(v) <= 1e6 : v >= 0 && v <= 1))
    )
      fail('Invalid graph position');
    edits.layout = [
      ...edits.layout.filter((p) => p.path !== node.instance),
      {
        path: node.instance,
        x: command.x,
        y: command.y,
        ...(command.space ? { space: command.space } : {}),
      },
    ];
    return true;
  }
  if (['graph.connect', 'graph.disconnect'].includes(command.operation)) {
    const to = get(command.to),
      from = command.from && get(command.from);
    if (!to?.scope && !from?.scope) return false;
    if (!to?.scope || (from && from.scope !== to.scope))
      fail('Connect through the audio graph interface');
    const g = x.groups.find((g) => g.path === to.scope),
      d = x.defs.get(g.definition);
    const key = (n) => [...g.children].find(([, c]) => c.id === n?.id)?.[0];
    if (to.implementationKind === 'interface-output') {
      const p = namedPort(d.outputs, command.input);
      if (command.operation === 'graph.disconnect') p.node = null;
      else {
        if (!key(from)) fail('Connect a child output to the graph output');
        p.node = key(from);
        p.port = command.output;
      }
    } else {
      if (!key(to)) fail('Select an audio input');
      d.connections = d.connections.filter((e) => e.to !== key(to) || e.input !== command.input);
      const bound = d.inputs.find((p) => p.node === key(to) && p.port === command.input);
      if (bound) bound.node = null;
      if (from?.implementationKind === 'interface-input') {
        const p = namedPort(d.inputs, command.output);
        p.node = key(to);
        p.port = command.input;
      } else if (command.operation === 'graph.connect') {
        if (!key(from)) fail('Select an audio output');
        d.connections.push({
          from: key(from),
          output: command.output,
          to: key(to),
          input: command.input,
        });
      }
    }
    persist();
    return true;
  }
  if (
    command.operation === 'graph.remove' &&
    node &&
    (node.scope || node.implementationKind === 'composition')
  ) {
    if (node.implementationKind?.startsWith('interface-'))
      fail('Edit the named interface in audio-graphs.json');
    let removed = [];
    if (node.scope) {
      const g = x.groups.find((g) => g.path === node.scope),
        d = x.defs.get(g.definition);
      const key = [...g.children].find(([, c]) => c.id === node.id)[0];
      removed = x.leaves.filter((l) =>
        x.groups.some(
          (p) =>
            p.definition === g.definition &&
            l.root === p.root &&
            (l.key === p.prefix + key || l.key.startsWith(p.prefix + key + '/')),
        ),
      );
      d.nodes = d.nodes.filter((n) => n.key !== key);
      d.connections = d.connections.filter((e) => e.from !== key && e.to !== key);
      for (const direction of ['inputs', 'outputs'])
        for (const p of d[direction]) if (p.node === key) p.node = null;
      d.parameters = (d.parameters ?? []).filter((p) => p.node !== key);
    } else {
      removed = x.leaves.filter((l) => l.root.path === node.instance);
      x.audio.instances = x.audio.instances.filter((i) => i.path !== node.instance);
      edits.connections = edits.connections.filter(
        (e) => e.from !== node.instance && e.to !== node.instance,
      );
    }
    for (const leaf of removed) {
      if (leaf.adopt) {
        if (edits.nodes.some((n) => n.path === leaf.path))
          edits.nodes = edits.nodes.filter((n) => n.path !== leaf.path);
        else if (!edits.removed.includes(leaf.path)) edits.removed.push(leaf.path);
      }
      for (const instance of x.audio.instances)
        if (instance.path === leaf.root.path) delete instance.nodes?.[leaf.key];
    }
    edits.layout = edits.layout.filter(
      (p) => p.path !== node.instance && !removed.some((l) => l.path === p.path),
    );
    persist();
    return true;
  }
  return false;
}
