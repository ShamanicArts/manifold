import { GraphWorkspace, GraphContractError, getPrimitive } from './index.js';
import { svf, oscillator } from './primitives.js';
import { graphCanvasId } from './audio-graphs.js';

// Control-side declarations only. A lowered graph is always a detached draft.
const devices = new WeakMap();
const references = new WeakMap();
const fail = (message) => {
  throw new GraphContractError('invalid-device', message);
};
const named = (value) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value))
    fail('Use a stable name containing letters, digits, underscores or hyphens');
  return value;
};
const ordered = (map) => [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
const reference = (data, visible) => {
  const ref = Object.freeze(visible);
  references.set(ref, data);
  return ref;
};
const ownerOf = (ref, owner) => {
  const data = references.get(ref);
  if (!data || data.owner !== owner) fail('References must belong to this device');
  return data;
};
export const audio = Object.freeze({ stereo: Object.freeze({ signal: 'audio', channels: 2 }) });
export const midi = Object.freeze({ events: Object.freeze({ signal: 'midi' }) });
export const lowPassFilter = Object.freeze({
  ...svf,
  label: 'Low-pass filter',
  defaults: Object.freeze({ mode: 0 }),
});

// Named definitions use the same oscillator kernel and editable parameters.
export const sawOscillator = Object.freeze({
  ...oscillator,
  label: 'Saw oscillator',
  defaults: Object.freeze({ waveform: 1 }),
});
export const sineOscillator = Object.freeze({
  ...oscillator,
  label: 'Sine oscillator',
  defaults: Object.freeze({ waveform: 0 }),
});

/** Stable authored identity and display name are separate; neither is a plug-in export ID. */
export function createDevice({ id, name } = {}) {
  named(id);
  if (typeof name !== 'string' || !name.trim() || name !== name.trim())
    fail('Give the device a display name');
  const state = {
    id,
    name,
    nodes: new Map(),
    inputs: new Map(),
    outputs: new Map(),
    controls: new Map(),
    connections: [],
    layout: [],
    groups: [],
  };
  const boundary = (direction, key, kind) => {
    named(key);
    if (kind !== audio.stereo && kind !== midi.events)
      fail('Device boundaries support stereo audio and MIDI event inputs');
    if (direction === 'outputs' && kind !== audio.stereo)
      fail('MIDI output lowering is not implemented');
    if (state[direction].has(key)) fail(`Duplicate ${direction} name: ${key}`);
    if (kind === midi.events && [...state.inputs.values()].some((ref) => ref.signal === 'midi'))
      fail('The current host exposes one MIDI event input');
    const ref = reference(
      {
        owner: device,
        boundary: direction,
        key,
        direction: direction === 'inputs' ? 'outputs' : 'inputs',
        signal: kind.signal,
      },
      { name: key, ...kind },
    );
    state[direction].set(key, ref);
    return ref;
  };
  const device = Object.freeze({
    id,
    name,
    get inputs() {
      return Object.freeze(Object.fromEntries(state.inputs));
    },
    get outputs() {
      return Object.freeze(Object.fromEntries(state.outputs));
    },
    input: (key, kind) => boundary('inputs', key, kind),
    output: (key, kind) => boundary('outputs', key, kind),
    add(key, definition, options = {}) {
      named(key);
      if (state.nodes.has(key)) fail(`Duplicate processor name: ${key}`);
      if (devices.has(definition)) {
        if (Object.keys(options).length)
          fail('Configure a nested Device through its instance.configure method');
        return addDevice(device, state, key, definition);
      }
      if (!definition || typeof definition !== 'object' || typeof definition.type !== 'string')
        fail('Import a processor definition and pass it directly to add');
      const canonical = getPrimitive(definition.type);
      if (definition.code !== canonical.code) fail('Expected a known rich processor definition');
      if (['input.raw', 'input.sidechain', 'midi-input', 'output'].includes(definition.type))
        fail('Declare device boundaries with input/output');
      const config = options.config ?? {};
      if (Object.keys(options).some((key) => key !== 'config')) fail('Unknown processor option');
      const described = new GraphWorkspace();
      const spec = described.describeNode(described.add(canonical.type, { id: 4, config }));
      const node = {
        key,
        definition: canonical,
        config: structuredClone(config),
        values: { ...(definition.defaults ?? {}) },
      };
      const parameters = Object.fromEntries(
        (spec.parameters ?? [])
          .filter((p) => p.name)
          .map((p) => [p.name, reference({ owner: device, node, parameter: p.name }, { ...p })]),
      );
      const ports = (direction) =>
        Object.freeze(
          Object.fromEntries(
            spec[direction].map((port) => [
              port.name,
              reference(
                { owner: device, node, direction, name: port.name, signal: port.signal },
                { ...port },
              ),
            ]),
          ),
        );
      const instance = Object.freeze({
        name: key,
        definition,
        parameters: Object.freeze(parameters),
        inputs: ports('inputs'),
        outputs: ports('outputs'),
        configure(values) {
          if (!values || Array.isArray(values) || typeof values !== 'object')
            fail('configure expects named initial parameter values');
          for (const name of Object.keys(values))
            if (!Object.hasOwn(parameters, name)) fail(`Unknown ${key} parameter: ${name}`);
          Object.assign(node.values, values);
          return instance;
        },
      });
      references.set(instance, { owner: device, node });
      state.nodes.set(key, node);
      return instance;
    },
    control(key, parameter, options) {
      named(key);
      if (state.controls.has(key)) fail(`Duplicate control name: ${key}`);
      const target = ownerOf(parameter, device);
      if (!target.parameter) fail('Controls target processor parameters');
      options ??= references.get(parameter)?.options;
      if (options && references.get(parameter)?.options === options)
        options = Object.fromEntries(
          Object.entries(options).filter(([key]) =>
            ['label', 'min', 'max', 'default', 'unit', 'style'].includes(key),
          ),
        );
      if (
        [...state.controls.values()].some(
          (c) => c.target.node === target.node && c.target.parameter === target.parameter,
        )
      )
        fail('Reuse the existing control reference for this parameter');
      if (!options || typeof options.label !== 'string' || !options.label.trim())
        fail('Give the control a label');
      if (
        Object.keys(options).some(
          (k) => !['label', 'min', 'max', 'default', 'unit', 'style'].includes(k),
        )
      )
        fail('Unknown control option');
      if (options.unit !== undefined && typeof options.unit !== 'string')
        fail('Control units must be text');
      if (
        options.style !== undefined &&
        (!options.style ||
          typeof options.style !== 'object' ||
          Array.isArray(options.style) ||
          Object.entries(options.style).some(
            ([key, value]) =>
              !['accent', 'background', 'text'].includes(key) ||
              typeof value !== 'string' ||
              !/^#[0-9a-f]{6}$/i.test(value),
          ))
      )
        fail('Style accepts accent, background and text as six-digit hex colors');
      options = {
        ...options,
        ...(options.style ? { style: Object.freeze({ ...options.style }) } : {}),
      };
      const control = reference(
        { owner: device, target },
        { id: key, path: `/${key}`, parameter, ...options },
      );
      state.controls.set(key, { target, control });
      return control;
    },
    group(id, instances, { label } = {}) {
      named(id);
      if (
        !Array.isArray(instances) ||
        instances.length < 2 ||
        new Set(instances).size !== instances.length ||
        typeof label !== 'string' ||
        !label.trim() ||
        state.groups.some((group) => group.id === id)
      )
        fail('Group needs a unique name, label and at least two distinct processors');
      const keys = instances.map((instance) => ownerOf(instance, device).node?.key);
      if (keys.some((key) => !key)) fail('Group members must be processors in this Device');
      state.groups.push({ id, label, keys });
      return device;
    },
    place(instance, position) {
      const { node } = ownerOf(instance, device);
      if (
        !node ||
        !position ||
        ![position.x, position.y].every(Number.isFinite) ||
        Math.abs(position.x) > 1_000_000 ||
        Math.abs(position.y) > 1_000_000 ||
        (position.space !== undefined && position.space !== 'world')
      )
        fail('Place a processor with finite world coordinates');
      state.layout = [
        ...state.layout.filter((item) => item.key !== node.key),
        { key: node.key, ...position, space: 'world' },
      ];
      return device;
    },
    connect(from, to) {
      const source = ownerOf(from, device),
        target = ownerOf(to, device);
      if (
        source.direction !== 'outputs' ||
        target.direction !== 'inputs' ||
        source.signal !== target.signal
      )
        fail('Connect an output to an input of the same signal type');
      if (state.connections.some((edge) => edge.to === to)) fail('Input is already connected');
      state.connections.push({ from, to });
      return device;
    },
  });
  devices.set(device, state);
  return device;
}

export function createEffect(identity) {
  const device = createDevice(identity);
  device.input('audio', audio.stereo);
  device.output('audio', audio.stereo);
  return device;
}
export function createInstrument(identity) {
  const device = createDevice(identity);
  device.input('midi', midi.events);
  device.output('audio', audio.stereo);
  return device;
}
export const isDevice = (value) => devices.has(value);

// Reusing a declaration creates independent DSP instances. References always belong
// to the parent instance; the child declaration is never mutated by configuration.
function addDevice(owner, state, key, definition) {
  const child = devices.get(definition);
  const node = { key, device: definition, values: {} };
  const ports = (direction) =>
    Object.freeze(
      Object.fromEntries(
        ordered(child[direction]).map(([name, ref]) => [
          name,
          reference(
            { owner, node, direction, name, signal: ref.signal },
            { name, signal: ref.signal },
          ),
        ]),
      ),
    );
  const controls = Object.freeze(
    Object.fromEntries(
      ordered(child.controls).map(([name, entry]) => {
        const data = { owner, node, parameter: name, options: entry.control };
        const parameter = reference(data, { name, ...entry.control });
        return [
          name,
          reference(
            { ...data, target: data },
            { ...entry.control, id: name, path: `/${key}/${name}`, parameter },
          ),
        ];
      }),
    ),
  );
  const instance = Object.freeze({
    name: key,
    definition,
    inputs: ports('inputs'),
    outputs: ports('outputs'),
    controls,
    parameters: controls,
    configure(values) {
      if (
        !values ||
        Array.isArray(values) ||
        typeof values !== 'object' ||
        Object.keys(values).some((name) => !Object.hasOwn(controls, name))
      )
        fail('Configure a nested Device using its declared control names');
      for (const [name, value] of Object.entries(values)) {
        const control = controls[name];
        if (!Number.isFinite(value) || value < control.min || value > control.max)
          fail(`Invalid initial value for ${name}`);
      }
      Object.assign(node.values, values);
      return instance;
    },
  });
  references.set(instance, { owner, node });
  state.nodes.set(key, node);
  return instance;
}

// Host adapters resolve an actual authored reference, never a lookalike object.
export function deviceControlPath(device, control) {
  const state = devices.get(device);
  if (state && [...state.controls.values()].some((entry) => entry.control === control))
    return control.path;
  const ref = references.get(control);
  if (ref?.owner === device && ref.node?.device && ref.target) return control.path;
  fail('Use a control declared by the device prepared in this host');
}

/** Containers are authoring structure; the existing flat GraphWorkspace owns execution. */
export function lowerDevice(device, { previous } = {}) {
  const state = devices.get(device);
  if (!state) fail('Expected a Device declaration');
  if (previous) GraphWorkspace.fromProject(previous);
  const graph = new GraphWorkspace();
  const oldIds = new Map((previous?.instances ?? []).map((i) => [i.path, i.nodeId]));
  const occupied = new Set([1, 3, ...(previous?.signal.nodes ?? []).map((n) => n.id)]);
  let nextId = 4;
  const allocate = (path) => {
    if (oldIds.has(path)) return oldIds.get(path);
    while (occupied.has(nextId)) nextId++;
    const id = nextId++;
    if (id > 0xffffffff) fail('Device node identity capacity exceeded');
    occupied.add(id);
    return id;
  };
  const contexts = [],
    declarations = [],
    definitions = new Map();
  function expand(value, path, parent = null, instance = null, ancestors = []) {
    if (ancestors.includes(value)) fail('A Device cannot contain itself recursively');
    const state = devices.get(value);
    if (definitions.has(state.id) && definitions.get(state.id) !== value)
      fail('Different Device definitions need distinct IDs');
    definitions.set(state.id, value);
    const context = {
      state,
      path,
      parent,
      instance,
      children: new Map(),
      handles: new Map(),
      inputs: new Map(),
    };
    contexts.push(context);
    for (const [key, node] of ordered(state.nodes)) {
      if (node.device)
        context.children.set(
          node,
          expand(node.device, `${path}/processors/${key}`, context, node, [...ancestors, value]),
        );
      else
        declarations.push({
          context,
          node,
          path: `${path}/processors/${key}`,
          type: node.definition.type,
          config: node.config,
        });
    }
    if (!parent)
      for (const [key, ref] of ordered(state.inputs))
        declarations.push({
          context,
          ref,
          path: `${path}/inputs/${key}`,
          type: ref.signal === 'audio' ? 'input.raw' : 'midi-input',
        });
    return context;
  }
  const root = expand(device, `/device/${state.id}`);
  for (const declaration of declarations.sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  )) {
    const handle = graph.add(declaration.type, {
      id: allocate(declaration.path),
      config: declaration.config ?? {},
    });
    graph.registerInstance(declaration.path, handle);
    if (declaration.node) {
      declaration.context.handles.set(declaration.node, handle);
      for (const [name, value] of Object.entries(declaration.node.values))
        handle.parameter(name).set(value);
    } else declaration.context.inputs.set(declaration.ref, handle);
  }
  const incoming = (context, ref) =>
    context.state.connections.find((edge) => edge.to === ref)?.from;
  function source(context, ref, visiting = new Set()) {
    if (!ref) return null;
    const token = context.path + ':' + context.state.connections.findIndex((e) => e.from === ref);
    if (visiting.has(token)) fail('Recursive Device boundary connection');
    const trail = new Set([...visiting, token]);
    const data = references.get(ref);
    if (data.boundary === 'inputs') {
      if (!context.parent) return context.inputs.get(ref).output('out');
      const edge = context.parent.state.connections.find((e) => {
        const to = references.get(e.to);
        return to.node === context.instance && to.name === data.key;
      });
      return source(context.parent, edge?.from, trail);
    }
    if (data.node?.device) {
      const child = context.children.get(data.node);
      return source(child, incoming(child, child.state.outputs.get(data.name)), trail);
    }
    return context.handles.get(data.node).output(data.name);
  }
  function parameter(context, target) {
    if (target.node.device) {
      const child = context.children.get(target.node);
      return parameter(child, child.state.controls.get(target.parameter).target);
    }
    return context.handles.get(target.node).parameter(target.parameter);
  }
  for (const context of contexts) {
    for (const edge of context.state.connections) {
      const to = references.get(edge.to);
      if (to.boundary || to.node.device) continue;
      const from = source(context, edge.from);
      if (from) graph.connect(from, context.handles.get(to.node).input(to.name));
    }
  }
  const audioInputs = ordered(state.inputs).filter(([, ref]) => ref.signal === 'audio');
  const outputs = ordered(state.outputs);
  graph.setIoLayout({
    version: 1,
    inputs: audioInputs.map(([id]) => ({ id, name: id, channels: 2, optional: false })),
    outputs: outputs.map(([id]) => ({ id, name: id, channels: 2, optional: false })),
    inputBindings: [
      { nodeId: graph.input.id, channels: [null, null] },
      ...audioInputs.map(([, ref], bus) => ({
        nodeId: root.inputs.get(ref).id,
        channels: [
          { bus, channel: 0 },
          { bus, channel: 1 },
        ],
      })),
    ],
    outputBindings: outputs.flatMap(([, ref]) => {
      const from = source(root, incoming(root, ref));
      return [0, 1].map((channel) =>
        from ? { nodeId: from.nodeId, outputPort: from.index, channel } : null,
      );
    }),
  });
  const assignments = new Map((previous?.hostAssignments ?? []).filter(a => a.path !== undefined).map(a => [a.path, a.slot]));
  for (const endpoint of previous?.endpoints ?? []) {
    const binding = previous.hostBindings?.find(b => b.nodeId === endpoint.nodeId && b.id === endpoint.id);
    if (binding && !assignments.has(endpoint.path)) assignments.set(endpoint.path, binding.slot);
  }
  const anonymousSlots = new Set((previous?.hostAssignments ?? []).filter(a => a.path === undefined).map(a => a.slot));
  for (const binding of previous?.hostBindings ?? []) if (![...assignments.values()].includes(binding.slot)) anonymousSlots.add(binding.slot);
  graph.reserveHostSlots([...assignments].map(([path, slot]) => ({slot, path})).concat([...anonymousSlots].map(slot => ({slot}))));
  const oldSlots = assignments;
  const usedSlots = new Set([...assignments.values(), ...anonymousSlots, ...(previous?.hostBindings ?? []).map(b => b.slot)]);
  const view = [],
    exposed = new Set();
  // Outer controls deliberately promote an inner parameter. Automatic inner
  // controls fill the remaining targets, without duplicate automation bindings.
  for (const context of contexts) {
    const controlPrefix =
      context === root ? '' : context.path.slice(root.path.length).replaceAll('/processors/', '/');
    for (const [key, { target, control }] of ordered(context.state.controls)) {
      const targetParameter = parameter(context, target);
      const targetKey = targetParameter.node.id + ':' + targetParameter.description.id;
      if (exposed.has(targetKey)) continue;
      exposed.add(targetKey);
      const initial = context.instance?.values[key] ?? control.default;
      const path = `${controlPrefix}/${key}`;
      const definition = { ...control, path, default: initial };
      targetParameter.expose(definition);
      const previousEndpoint = previous?.endpoints?.find(endpoint => endpoint.path === path);
      const intentionallyUnbound = previousEndpoint && Object.hasOwn(previous, 'hostBindings')
        && !previous.hostBindings.some(binding => binding.nodeId === previousEndpoint.nodeId && binding.id === previousEndpoint.id);
      let slot = oldSlots.get(path);
      if (slot === undefined) {
        slot = 0;
        while (usedSlots.has(slot)) slot++;
      }
      if (!intentionallyUnbound) {
        usedSlots.add(slot);
        graph.bindHostSlot(slot, targetParameter.node, targetParameter.description.id);
      }
      view.push({
        id: controlPrefix ? path : control.id,
        type: 'parameter',
        path,
        label: control.label,
        ...(targetParameter.description.choices
          ? {
              choices: [...targetParameter.description.choices],
              choiceValues: targetParameter.description.choices.map((_, index) => targetParameter.description.choiceValues?.[index] ?? index),
              disabledChoices: targetParameter.description.choices.flatMap((_, index) => {
                const value = targetParameter.description.choiceValues?.[index] ?? index;
                return value < control.min || value > control.max ? [index] : [];
              }),
            }
          : {}),
        ...(control.unit ? { unit: control.unit } : {}),
        ...(control.style ? { style: { ...control.style } } : {}),
      });
    }
  }
  const project = graph.toProject();
  const layout = contexts.flatMap((context) =>
    context.state.layout.map(({ key, ...position }) => ({
      path: `${context.path}/processors/${key}`,
      ...position,
    })),
  );
  const hierarchy = contexts.map((context) => ({
    path: context.path,
    scope: context.parent?.path === root.path ? '' : (context.parent?.path ?? ''),
    root: context === root,
    definition: context.state.id,
    label: context.state.name,
    inputs: ordered(context.state.inputs).map(([name, ref]) => ({ name, signal: ref.signal })),
    outputs: ordered(context.state.outputs).map(([name, ref]) => ({ name, signal: ref.signal })),
    nodes: ordered(context.state.nodes).map(([key, node]) => ({
      key,
      path: `${context.path}/processors/${key}`,
      id: node.device
        ? graphCanvasId(`${context.path}/processors/${key}`)
        : context.handles.get(node).id,
      definition: node.device ? devices.get(node.device).id : null,
    })),
    edges: context.state.connections.map((edge) => {
      const endpoint = (ref) => {
        const data = references.get(ref);
        if (data.boundary) return { boundary: data.boundary, name: data.key };
        return { key: data.node.key, direction: data.direction, name: data.name };
      };
      return { from: endpoint(edge.from), to: endpoint(edge.to) };
    }),
  }));
  return {
    graph,
    project,
    view,
    editorGraph: {
      deviceHierarchy: hierarchy,
      layout,
      groups: contexts.flatMap((context) =>
        context.state.groups.map(({ keys, ...group }) => ({
          ...group,
          id: context.path + '/' + group.id,
          paths: keys.map((key) => `${context.path}/processors/${key}`),
        })),
      ),
    },
    identity: Object.freeze({ id: state.id, name: state.name }),
  };
}
