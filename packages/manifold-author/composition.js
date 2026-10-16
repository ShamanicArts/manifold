import {
  isImageType,
  isVisualSurface,
  validateVisualPrimitive,
  visualPrimitives,
} from './visual-primitives.js';
import { visualCategories, visualCategory, visualPreviewPort } from './visual-metadata.js';
import { GraphContractError } from './author.js';
import { prepareProjectModules } from './project-modules.js';
import { projectFilePath, validateProjectFiles } from './project-files.js';
import { expandComposition, wrapComposition } from './composition-graph.js';
import { isPresentationType, isResourceType, projectParameterValue } from './presentation-types.js';
export { expandComposition } from './composition-graph.js';

const fail = (message) => {
  throw new GraphContractError('invalid-composition', message);
};
const clone = (value) => structuredClone(value);
export const emptyComposition = () => ({ version: 1, definitions: [], nodes: [], connections: [] });
const name = (value) => typeof value === 'string' && /^[a-zA-Z][\w.-]{0,63}$/.test(value);
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
function object(value, keys, label) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    fail(`Invalid ${label} fields`);
}
function unique(entries, key, label) {
  if (
    !Array.isArray(entries) ||
    new Set(entries.map((entry) => entry?.[key])).size !== entries.length
  )
    fail(`Expected unique ${label}`);
}

/** The language-neutral saved contract; no DOM, GPU or audio execution here. */
export function validateComposition(value, files, graph) {
  value ??= emptyComposition();
  object(value, ['version', 'definitions', 'nodes', 'connections', 'groups'], 'composition');
  if (![1, 2, 3, 4].includes(value.version)) fail('Unsupported composition version');
  unique(value.definitions, 'id', 'definitions');
  unique(value.nodes, 'id', 'visual nodes');
  if (!Array.isArray(value.connections))
    fail('Expected visual connections');
  const definitions = new Map();
  for (const definition of value.definitions) {
    object(
      definition,
      [
        'id',
        'version',
        'label',
        'description',
        'category',
        'keywords',
        'preview',
        'implementation',
        'inputs',
        'outputs',
        'parameters',
      ],
      'definition',
    );
    if (
      !name(definition.id) ||
      !Number.isSafeInteger(definition.version) ||
      definition.version < 1 ||
      typeof definition.label !== 'string' ||
      !definition.label.trim()
    )
      fail('Invalid definition identity');
    if (definition.category !== undefined && !visualCategories.includes(definition.category))
      fail('Choose a visual category: ' + visualCategories.join(', '));
    if (
      definition.keywords !== undefined &&
      (!Array.isArray(definition.keywords) ||
        definition.keywords.some(
          (term) => typeof term !== 'string' || !term.trim(),
        ))
    )
      fail('Expected non-empty search terms');
    if (
      definition.preview !== undefined &&
      !definition.outputs?.some(
        (port) =>
          port.name === definition.preview &&
          (['scalar', 'vector2', 'vector3', 'field2d'].includes(port.type) ||
            isImageType(port.type)),
      )
    )
      fail('Preview must name a scalar, vector, field or image output');
    const implementation = definition.implementation;
    const nested = implementation?.kind === 'composition';
    const primitive = implementation?.kind === 'visual-primitive';
    const parameterSource = implementation?.kind === 'parameter';
    object(
      implementation,
      primitive
        ? ['kind', 'name', 'frames']
        : nested
          ? ['kind', 'graph']
          : parameterSource
            ? ['kind', 'path']
            : ['kind', 'entry', 'dependencies', 'targets'],
      'implementation',
    );
    if (
      ![
        'web-surface',
        'presentation-script',
        'scene-object',
        'parameter',
        'composition',
        'visual-primitive',
      ].includes(implementation.kind)
    )
      fail('Unknown presentation implementation');
    if (
      (primitive || parameterSource || implementation.kind === 'scene-object') &&
      value.version < 4
    )
      fail('Scene objects and parameter sources require composition version 4');
    if (nested && value.version < 3) fail('Nested graphs require composition version 3');
    if (
      definition.description !== undefined &&
      (typeof definition.description !== 'string')
    )
      fail('Expected a short component description');
    if (
      value.version === 1 &&
      (implementation.kind !== 'web-surface' ||
        definition.outputs?.length ||
        definition.inputs?.some?.((port) => port.type !== 'analysis'))
    )
      fail('Typed presentation computation requires composition version 2');
    if (!nested && !parameterSource && !primitive) {
      projectFilePath(implementation.entry);
      if (
        !Array.isArray(implementation.targets) ||
        !implementation.targets.length ||
        implementation.targets.some((target) => !['browser', 'webview'].includes(target)) ||
        new Set(implementation.targets).size !== implementation.targets.length
      )
        fail('Declare browser and/or webview targets');
      if (
        !implementation.dependencies ||
        typeof implementation.dependencies !== 'object' ||
        Array.isArray(implementation.dependencies)
      )
        fail('Expected exact dependency versions');
      for (const [key, version] of Object.entries(implementation.dependencies))
        if (
          !key ||
          key.startsWith('.') ||
          key.startsWith('/') ||
          typeof version !== 'string' ||
          !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)
        )
          fail('Visual dependencies require exact versions');
    }
    unique(definition.inputs, 'name', 'visual inputs');
    for (const port of definition.inputs) {
      object(port, ['name', 'type', 'unit'], 'visual input');
      if (port.unit !== undefined && (typeof port.unit !== 'string'))
        fail('Expected a short port unit');
      if (!name(port.name) || !isPresentationType(port.type)) fail('Invalid presentation input');
      if (value.version < 4 && !['analysis', 'scalar', 'field2d'].includes(port.type))
        fail('This port type requires composition version 4');
    }
    unique(definition.outputs ?? [], 'name', 'presentation outputs');
    for (const port of definition.outputs ?? []) {
      object(port, ['name', 'type', 'unit'], 'presentation output');
      if (port.unit !== undefined && (typeof port.unit !== 'string'))
        fail('Expected a short port unit');
      if (
        !name(port.name) ||
        !isPresentationType(port.type) ||
        (!nested && port.type === 'analysis')
      )
        fail('Invalid presentation output');
      if (
        value.version < 4 &&
        !(nested ? ['analysis', 'scalar', 'field2d'] : ['scalar', 'field2d']).includes(port.type)
      )
        fail('This port type requires composition version 4');
      if (implementation.kind === 'presentation-script' && isResourceType(port.type))
        fail('Renderer resources belong to surfaces and scene objects');
    }
    if (value.version < 4 && implementation.kind === 'web-surface' && definition.outputs?.length)
      fail('Web surfaces consume values; use a presentation script to produce them');
    if (
      parameterSource &&
      (definition.inputs.length ||
        definition.parameters.length ||
        definition.outputs?.length !== 1 ||
        definition.outputs[0].name !== 'value' ||
        definition.outputs[0].type !== 'scalar' ||
        !Number.isFinite(projectParameterValue(graph, implementation.path)))
    )
      fail('A parameter source reads an existing project parameter and outputs its scalar value');
    if (
      implementation.kind === 'scene-object' &&
      !definition.inputs.some((port) => isResourceType(port.type))
    )
      fail('A scene object requires a renderer resource input');
    if (implementation.kind === 'presentation-script' && !definition.outputs?.length)
      fail('A presentation script needs a named output');
    unique(definition.parameters, 'name', 'visual parameters');
    for (const parameter of definition.parameters) {
      object(parameter, ['name', 'label', 'min', 'max', 'default'], 'visual parameter');
      if (
        !name(parameter.name) ||
        typeof parameter.label !== 'string' ||
        !Number.isFinite(parameter.min) ||
        !Number.isFinite(parameter.max) ||
        parameter.min >= parameter.max ||
        !finite(parameter.default, parameter.min, parameter.max)
      )
        fail('Invalid visual parameter range');
    }
    if (!nested && !parameterSource && !primitive)
      prepareProjectModules(implementation.entry, files, implementation.dependencies);
    if (primitive) validateVisualPrimitive(definition, files);
    definitions.set(definition.id, definition);
  }
  const audioIds = new Set(graph.signal.nodes.map((node) => node.id));
  function validateGraph(body, owner) {
    if (owner) {
      object(body, ['nodes', 'connections', 'bindings', 'groups'], 'nested graph');
      unique(body.nodes, 'id', 'nested nodes');
      if (!Array.isArray(body.connections))
        fail('Expected nested connections');
    }
    unique(body.groups ?? [], 'id', 'graph groups');
    for (const group of body.groups ?? []) {
      object(group, ['id', 'label', 'nodes'], 'graph group');
      if (
        !name(group.id) ||
        typeof group.label !== 'string' ||
        !group.label.trim() ||
        !Array.isArray(group.nodes) ||
        group.nodes.length < 2 ||
        new Set(group.nodes).size !== group.nodes.length ||
        !group.nodes.every((id) => body.nodes.some((node) => node.id === id))
      )
        fail('A group needs a name and at least two distinct nodes in the same graph');
    }
    const nodes = new Map();
    for (const node of body.nodes) {
      object(
        node,
        ['id', 'definition', 'label', 'parameters', 'position', 'bounds'],
        'visual node',
      );
      if (
        !Number.isInteger(node.id) ||
        node.id < 1 ||
        node.id > 0xffffffff ||
        (!owner && audioIds.has(node.id))
      )
        fail('Visual node IDs must be unique and distinct from audio nodes');
      const definition = definitions.get(node.definition);
      if (!definition) fail(`Unknown visual definition ${node.definition}`);
      if (typeof node.label !== 'string' || !node.label.trim())
        fail('Invalid visual node label');
      object(
        node.parameters,
        definition.parameters.map((parameter) => parameter.name),
        'visual values',
      );
      for (const parameter of definition.parameters)
        if (!finite(node.parameters[parameter.name], parameter.min, parameter.max))
          fail(`Invalid visual value ${parameter.name}`);
      if (
        !Array.isArray(node.position) ||
        node.position.length !== 2 ||
        node.position.some((coordinate) => !finite(coordinate, -100000, 100000))
      )
        fail('Invalid visual graph position');
      if (!isVisualSurface(definition) && node.bounds === undefined) {
        nodes.set(node.id, node);
        continue;
      }
      object(node.bounds, ['x', 'y', 'width', 'height'], 'visual bounds');
      const { x, y, width, height } = node.bounds;
      if (
        !finite(x, 0, 100) ||
        !finite(y, 0, 100) ||
        !finite(width, 1, 100) ||
        !finite(height, 1, 100) ||
        x + width > 100 ||
        y + height > 100
      )
        fail('Visual bounds must fit the Presenter (percent)');
      nodes.set(node.id, node);
    }
    const destinations = new Set();
    for (const edge of body.connections) {
      object(edge, ['from', 'output', 'to', 'input'], 'visual connection');
      const source = nodes.get(edge.from);
      const output = source
        ? definitions.get(source.definition).outputs?.find((port) => port.name === edge.output)
        : owner && edge.from === 0
          ? owner.inputs.find((port) => port.name === edge.output)
          : !owner &&
              graph.signal.nodes.some((node) => node.id === edge.from && node.type === 'output') &&
              edge.output === 'analysis'
            ? { type: 'analysis' }
            : null;
      if (!output) fail('Unknown presentation output (audio analysis is available on Output)');
      const node = nodes.get(edge.to),
        definition = definitions.get(node?.definition);
      const input =
        owner && edge.to === 0
          ? owner.outputs?.find((port) => port.name === edge.input)
          : definition?.inputs.find((port) => port.name === edge.input);
      if (!input) fail('Unknown visual input');
      if (input.type !== output.type)
        fail(`Incompatible presentation ports: ${output.type} to ${input.type}`);
      const key = `${edge.to}:${edge.input}`;
      if (destinations.has(key)) fail('A visual input accepts one connection');
      destinations.add(key);
    }
    compositionOrder(body);
    if (owner) {
      if (!Array.isArray(body.bindings))
        fail('Expected parameter bindings');
      const targets = new Set();
      for (const binding of body.bindings) {
        object(binding, ['name', 'to', 'parameter'], 'parameter binding');
        const exposed = owner.parameters.find((p) => p.name === binding.name);
        const target = definitions
          .get(nodes.get(binding.to)?.definition)
          ?.parameters.find((p) => p.name === binding.parameter);
        if (!exposed || !target || exposed.min < target.min || exposed.max > target.max)
          fail('Parameter binding must target a compatible child parameter range');
        const key = `${binding.to}:${binding.parameter}`;
        if (targets.has(key)) fail('A child parameter accepts one binding');
        targets.add(key);
      }
    }
  }
  for (const definition of definitions.values())
    if (definition.implementation.kind === 'composition')
      validateGraph(definition.implementation.graph, definition);
  validateGraph(value, null);
  // Reject recursive definitions, including unused ones.
  const depths = new Map(),
    visiting = new Set();
  const visit = (id) => {
    if (visiting.has(id)) fail('Recursive composition definitions are not allowed');
    if (depths.has(id)) return depths.get(id);
    visiting.add(id);
    const definition = definitions.get(id);
    const depth =
      definition.implementation.kind === 'composition'
        ? 1 +
          Math.max(
            0,
            ...definition.implementation.graph.nodes.map((node) => visit(node.definition)),
          )
        : 0;
    visiting.delete(id);
    depths.set(id, depth);
    return depth;
  };
  for (const id of definitions.keys()) visit(id);
  expandComposition(value, [...audioIds]);
  return clone(value);
}

/** Dependency order is shared by validation and the presentation-frame executor. */
export function compositionOrder(composition) {
  const remaining = new Set(composition.nodes.map((node) => node.id)),
    order = [];
  while (remaining.size) {
    const ready = [...remaining].filter(
      (id) => !composition.connections.some((edge) => edge.to === id && remaining.has(edge.from)),
    );
    if (!ready.length) fail('Presentation connections must be acyclic');
    for (const id of ready) {
      remaining.delete(id);
      order.push(id);
    }
  }
  return order;
}

export const visualStarterSource = `export default function createVisual() {
  return {
    mount(element, api) {
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'width:100%;height:100%;display:block';
      element.append(canvas);
      const context = canvas.getContext('2d');
      let frame;
      function draw() {
        const ratio = Math.min(devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(element.clientWidth * ratio));
        const height = Math.max(1, Math.round(element.clientHeight * ratio));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width; canvas.height = height;
        }
        const signal = api.input('signal');
        const level = signal?.rms ?? 0;
        const size = api.parameter('size');
        context.clearRect(0, 0, width, height);
        context.fillStyle = 'hsl(' + api.parameter('hue') + ' 65% 65%)';
        context.beginPath();
        context.arc(width / 2, height / 2,
          Math.min(width, height) * Math.min(0.45, (0.12 + level * 0.8) * size), 0, Math.PI * 2);
        context.fill();
        canvas.dataset.rms = String(level);
        frame = requestAnimationFrame(draw);
      }
      draw();
      return { dispose() { cancelAnimationFrame(frame); canvas.remove(); } };
    },
  };
}
`;

/** Plan an atomic document edit. Caller validates and publishes before adoption. */
export function editComposition(composition, files, graph, command) {
  const next = clone(composition),
    // File entries contain strings only. Keep immutable asset content shared
    // while editing the graph instead of copying megabytes per command.
    nextFiles = files.map((file) => ({ ...file }));
  const owner = command.scope && next.definitions.find((d) => d.id === command.scope);
  if (command.scope && owner?.implementation.kind !== 'composition')
    fail('Unknown composition edit scope');
  const body = owner ? owner.implementation.graph : next;
  if (command.operation === 'component.wrap') {
    wrapComposition(next, body, command, graph.signal.nodes);
    return { composition: validateComposition(next, nextFiles, graph), files: nextFiles };
  }
  if (command.operation === 'component.group') {
    const label = String(command.label ?? '').trim();
    let index = 1;
    while (body.groups?.some((group) => group.id === `group-${index}`)) index++;
    body.groups = [...(body.groups ?? []), { id: `group-${index}`, label, nodes: command.ids }];
    return { composition: validateComposition(next, nextFiles, graph), files: nextFiles };
  }
  if (command.operation === 'component.ungroup') {
    if (!body.groups?.some((group) => group.id === command.group)) fail('Unknown graph group');
    body.groups = body.groups.filter((group) => group.id !== command.group);
    return { composition: validateComposition(next, nextFiles, graph), files: nextFiles };
  }
  if (command.operation === 'component.reference') {
    const parameter = [...(graph.controls ?? []), ...(graph.endpoints ?? [])].find(
      (item) => item.path === command.path,
    );
    if (!parameter) fail('Choose an existing project parameter');
    let definition = next.definitions.find(
      (item) =>
        item.implementation.kind === 'parameter' && item.implementation.path === command.path,
    );
    if (!definition) {
      const base = `reference-${command.path.split('/').filter(Boolean).join('-')}`
        .replace(/[^a-zA-Z0-9.-]/g, '-')
        .slice(0, 55);
      let id = base,
        index = 2;
      while (next.definitions.some((item) => item.id === id)) id = `${base}-${index++}`;
      definition = {
        id,
        version: 1,
        label: parameter.label || command.path,
        implementation: { kind: 'parameter', path: command.path },
        inputs: [],
        outputs: [{ name: 'value', type: 'scalar' }],
        parameters: [],
      };
      next.definitions.push(definition);
    }
    next.version = 4;
    if (command.id !== undefined) {
      const node = body.nodes.find((node) => node.id === command.id);
      if (
        !node ||
        next.definitions.find((item) => item.id === node.definition)?.implementation.kind !==
          'parameter'
      )
        fail('Select a parameter reference to change its target');
      node.definition = definition.id;
      node.label = definition.label;
      return { composition: validateComposition(next, nextFiles, graph), files: nextFiles };
    }
    return editComposition(next, nextFiles, graph, {
      ...command,
      operation: 'component.add',
      definitionId: definition.id,
    });
  }
  if (command.operation === 'component.frames') {
    const definition = next.definitions.find((item) => item.id === command.definitionId);
    if (
      definition?.implementation.kind !== 'visual-primitive' ||
      definition.implementation.name !== 'image-frames'
    )
      fail('Choose an Image frames definition');
    definition.implementation.frames = clone(command.frames);
    return { composition: validateComposition(next, nextFiles, graph), files: nextFiles };
  }
  let definition;
  if (command.operation === 'component.create') {
    let suffix = 1;
    while (
      next.definitions.some((item) => item.id === `visual-${suffix}`) ||
      nextFiles.some((item) => item.path === `/nodes/visual-${suffix}.mjs`)
    )
      suffix++;
    definition = {
      id: `visual-${suffix}`,
      version: 1,
      label: `Custom visual ${suffix}`,
      description:
        'Draws a circle that grows with the audio level. Edit its script to change the drawing.',
      implementation: {
        kind: 'web-surface',
        entry: `/nodes/visual-${suffix}.mjs`,
        dependencies: {},
        targets: ['browser', 'webview'],
      },
      inputs: [{ name: 'signal', type: 'analysis' }],
      parameters: [
        { name: 'size', label: 'Size', min: 0.1, max: 3, default: 1 },
        { name: 'hue', label: 'Hue', min: 0, max: 360, default: 195 },
      ],
    };
    next.definitions.push(definition);
    nextFiles.push({
      path: definition.implementation.entry,
      mediaType: 'text/javascript',
      encoding: 'utf8',
      content: visualStarterSource,
    });
  } else if (command.operation === 'component.define') {
    if (
      command.definition?.implementation?.kind === 'presentation-script' ||
      command.definition?.inputs?.some((port) => port.type !== 'analysis')
    )
      next.version = Math.max(next.version, 2);
    if (command.definition?.implementation?.kind === 'composition')
      next.version = Math.max(next.version, 3);
    if (
      ['scene-object', 'parameter', 'visual-primitive'].includes(
        command.definition?.implementation?.kind,
      ) ||
      [...(command.definition?.inputs ?? []), ...(command.definition?.outputs ?? [])].some(
        (port) =>
          ['vector2', 'vector3'].includes(port.type) ||
          isImageType(port.type) ||
          isResourceType(port.type),
      ) ||
      (command.definition?.implementation?.kind === 'web-surface' &&
        command.definition?.outputs?.length)
    )
      next.version = 4;
    const index = next.definitions.findIndex((item) => item.id === command.definition?.id);
    if (index < 0) next.definitions.push(clone(command.definition));
    else next.definitions[index] = clone(command.definition);
    for (const file of command.files ?? []) {
      const index = nextFiles.findIndex((item) => item.path === file.path);
      if (index < 0) nextFiles.push(clone(file));
      else nextFiles[index] = clone(file);
    }
  }
  if (command.operation === 'component.add' || command.operation === 'component.create') {
    definition ??= next.definitions.find((item) => item.id === command.definitionId);
    if (!definition) {
      definition = visualPrimitives.find((item) => item.id === command.definitionId);
      if (!definition) fail('Unknown visual definition');
      definition = clone(definition);
      next.definitions.push(definition);
      next.version = 4;
    }
    const ids = new Set([...graph.signal.nodes, ...body.nodes].map((node) => node.id));
    let id = 0x80000000;
    while (ids.has(id) && id <= 0xffffffff) id++;
    const count = body.nodes.filter((node) => node.definition === definition.id).length;
    body.nodes.push({
      id,
      definition: definition.id,
      label: count ? `${definition.label} (${count + 1})` : definition.label,
      parameters: Object.fromEntries(
        definition.parameters.map((parameter) => [parameter.name, parameter.default]),
      ),
      position: [command.x ?? 760, command.y ?? body.nodes.length * 170],
      ...(isVisualSurface(definition)
        ? { bounds: { x: (body.nodes.length % 2) * 50, y: 0, width: 50, height: 100 } }
        : {}),
    });
  } else if (command.operation === 'component.remove') {
    if (!body.nodes.some((node) => node.id === command.id)) fail('Unknown visual node');
    body.nodes = body.nodes.filter((node) => node.id !== command.id);
    if (body.groups)
      body.groups = body.groups
        .map((group) => ({ ...group, nodes: group.nodes.filter((id) => id !== command.id) }))
        .filter((group) => group.nodes.length > 1);
    if (owner) body.bindings = body.bindings.filter((binding) => binding.to !== command.id);
    body.connections = body.connections.filter(
      (edge) => edge.to !== command.id && edge.from !== command.id,
    );
  } else if (command.operation === 'component.update') {
    const node = body.nodes.find((node) => node.id === command.id);
    if (!node) fail('Unknown visual node');
    object(command.changes, ['label', 'parameters', 'position', 'bounds'], 'visual edit');
    Object.assign(
      node,
      clone(command.changes),
      command.changes.parameters
        ? { parameters: { ...node.parameters, ...command.changes.parameters } }
        : {},
    );
  } else if (
    command.operation === 'component.connect' ||
    command.operation === 'component.disconnect'
  ) {
    const { from, output, to, input } = command;
    const node = body.nodes.find((node) => node.id === to),
      definition = next.definitions.find((definition) => definition.id === node?.definition);
    const ports = owner && to === 0 ? owner.outputs : definition?.inputs;
    if (!ports?.some((port) => port.name === input)) fail('Unknown visual input');
    body.connections = body.connections.filter((edge) => !(edge.to === to && edge.input === input));
    if (command.operation === 'component.connect')
      body.connections.push({ from, output, to, input });
  } else if (!['component.create', 'component.add', 'component.define'].includes(command.operation))
    fail('Unknown component operation');
  const validatedFiles = validateProjectFiles(nextFiles);
  return { composition: validateComposition(next, validatedFiles, graph), files: validatedFiles };
}

/** Shared browser/native canvas descriptors, derived from the accepted document. */
export function compositionPresentation(composition, files) {
  const prepared = composition.definitions.map((definition) => ({
    ...definition,
    sources: ['composition', 'parameter', 'visual-primitive'].includes(
      definition.implementation.kind,
    )
      ? {}
      : prepareProjectModules(
          definition.implementation.entry,
          files,
          definition.implementation.dependencies,
        ),
  }));
  const byId = new Map(prepared.map((definition) => [definition.id, definition]));
  const expanded = expandComposition(composition);
  return {
    visualDefinitions: prepared,
    presentationExecution: {
      nodes: expanded.nodes,
      connections: expanded.connections,
      compositeOutputs: expanded.compositeOutputs,
      compositeMembers: expanded.compositeMembers,
    },
    componentNodes: expanded.objects.map((node) => {
      const definition = byId.get(node.definition);
      const inputs = node.interface ? node.inputs : definition.inputs;
      const outputs = node.interface ? node.outputs : (definition.outputs ?? []);
      return {
        id: node.id,
        localId: node.localId,
        scope: node.scope,
        ownerDefinition: node.ownerDefinition,
        boundParameters: node.boundParameters,
        type: definition.id,
        ...(definition.implementation.name === 'image-frames'
          ? { imageFrames: definition.implementation.frames }
          : {}),
        category: visualCategory(definition),
        preview: visualPreviewPort(definition)?.name ?? '',
        domain: 'visual',
        label: node.label,
        instance: node.path,
        sourcePath: definition.implementation.entry ?? '/composition.json',
        referencePath:
          definition.implementation.kind === 'parameter' ? definition.implementation.path : '',
        implementationKind: node.interface
          ? `interface-${node.interface}`
          : definition.implementation.kind,
        description: node.interface
          ? 'Named boundary of this reusable graph.'
          : (definition.description ?? ''),
        inputs: inputs.map((port) => ({
          name: port.name,
          signal: port.type,
          unit: port.unit ?? '',
        })),
        outputs: outputs.map((port) => ({
          name: port.name,
          signal: port.type,
          unit: port.unit ?? '',
        })),
        parameters: node.interface
          ? []
          : definition.parameters.map((parameter) => ({
              ...parameter,
              default: node.parameters[parameter.name],
            })),
        position: node.position,
        positionSpace: 'world',
      };
    }),
    componentEdges: expanded.edges.map((edge) => {
      const source = expanded.objects.find((node) => node.id === edge.from);
      const outputs = source?.interface ? source.outputs : byId.get(source?.definition)?.outputs;
      const type = outputs?.[edge.outputPort]?.type ?? 'analysis';
      return { ...edge, reference: type === 'analysis' || isResourceType(type) };
    }),
    componentGroups: expanded.groups,
    componentPalette: [...prepared, ...visualPrimitives.filter((item) => !byId.has(item.id))].map(
      (definition) => ({
        type: definition.id,
        label: definition.label,
        category: visualCategory(definition),
        keywords: definition.keywords ?? [],
        description: definition.description ?? '',
        implementationKind: definition.implementation.kind,
        sourcePath: definition.implementation.entry ?? '',
        referencePath:
          definition.implementation.kind === 'parameter' ? definition.implementation.path : '',
        kind: definition.implementation.kind === 'composition' ? 'visual-graph' : 'visual',
        inputs: definition.inputs.length,
        outputs: definition.outputs?.length ?? 0,
        input_ports: definition.inputs.map((port) => ({
          name: port.name,
          signal: port.type,
          unit: port.unit ?? '',
        })),
        output_ports: (definition.outputs ?? []).map((port) => ({
          name: port.name,
          signal: port.type,
          unit: port.unit ?? '',
        })),
        parameters: definition.parameters.length,
      }),
    ),
  };
}
