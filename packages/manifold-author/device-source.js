import { parse } from 'acorn';
import * as primitives from './primitives.js';
import { lowPassFilter } from './device.js';
import { validateStudioModule } from './studio-graph.js';

const definitions = { lowPassFilter, ...primitives };
const quote = (value) => JSON.stringify(value);
const objectCode = (value) =>
  '{ ' +
  Object.entries(value)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(', ') +
  ' }';
function compactGaps(source) {
  const tree = parse(source, { ecmaVersion: 2022, sourceType: 'module' }),
    edits = [];
  let end = 0;
  for (const node of tree.body) {
    const gap = source.slice(end, node.start);
    if (/^\s*$/.test(gap) && gap.includes('\n\n\n'))
      edits.push({ start: end, end: node.start, text: '\n\n' });
    end = node.end;
  }
  return replace(source, edits);
}
const access = (base, key) =>
  /^[a-zA-Z_$][\w$]*$/.test(key) ? `${base}.${key}` : `${base}[${quote(key)}]`;
const fail = (message) => {
  throw new Error(message);
};
const member = (node, name) =>
  node?.type === 'MemberExpression' && !node.computed && node.property.name === name;
const field = (node, name) =>
  node?.properties?.find((p) => !p.computed && (p.key.name ?? p.key.value) === name)?.value;
const baseCall = (node) =>
  node?.type === 'CallExpression' && member(node.callee, 'configure') ? node.callee.object : node;
const statements = (tree) =>
  tree.body.map((node) => ({
    statement: node,
    node: node.type === 'ExportNamedDeclaration' ? node.declaration : node,
  }));
const replace = (source, edits) =>
  edits
    .sort((a, b) => b.start - a.start || b.end - a.end)
    .reduce((text, e) => text.slice(0, e.start) + e.text + text.slice(e.end), source);
const uses = (node, name) => {
  if (!node?.type) return false;
  if (node.type === 'Identifier' && node.name === name) return true;
  return Object.entries(node).some(
    ([key, value]) =>
      !['start', 'end'].includes(key) &&
      (Array.isArray(value) ? value.some((n) => uses(n, name)) : uses(value, name)),
  );
};

/** A conservative source adapter. Unsupported dynamic expressions remain source-editable. */
export function readDeviceSource(source) {
  const tree = parse(source, { ecmaVersion: 2022, sourceType: 'module' });
  const imports = new Map(),
    factories = new Set(),
    names = new Set();
  for (const node of tree.body)
    if (node.type === 'ImportDeclaration' && node.source.value === 'manifold')
      for (const spec of node.specifiers)
        if (spec.type === 'ImportSpecifier') {
          imports.set(spec.imported.name, spec.local.name);
          names.add(spec.local.name);
          if (['createDevice', 'createEffect', 'createInstrument'].includes(spec.imported.name))
            factories.add(spec.local.name);
        }
  const devices = new Map(),
    variables = new Map(),
    calls = [];
  for (const { statement, node } of statements(tree)) {
    for (const declaration of node?.declarations ?? []) {
      if (declaration.id.type !== 'Identifier') continue;
      const name = declaration.id.name;
      names.add(name);
      const call = baseCall(declaration.init);
      variables.set(name, { name, statement, declaration, call });
      if (call?.type === 'CallExpression' && factories.has(call.callee.name)) {
        const id = field(call.arguments[0], 'id')?.value;
        if (typeof id === 'string')
          devices.set(name, { name, id, statement, declaration, nodes: new Map() });
      }
    }
    const call =
      node?.type === 'ExpressionStatement'
        ? node.expression
        : node?.declarations?.length === 1
          ? node.declarations[0].init
          : null;
    if (call?.type === 'CallExpression') calls.push({ call, statement, node });
  }
  for (const variable of variables.values())
    if (member(variable.call?.callee, 'add')) {
      const device = devices.get(variable.call.callee.object.name),
        key = variable.call.arguments[0]?.value;
      if (device && typeof key === 'string') device.nodes.set(key, variable);
    }
  const exported = tree.body.find((n) => n.type === 'ExportDefaultDeclaration');
  const root = devices.get(exported?.declaration?.name);
  if (!root)
    fail(
      'Edit this project in source: graph tools need an explicit top-level Device declaration and default export',
    );
  return { tree, imports, devices, variables, calls, names, root };
}

export function planDeviceEdit(source, command, project, editor) {
  const model = readDeviceSource(source),
    edits = [],
    additions = [],
    identityMoves = [];
  const text = (node) => source.slice(node.start, node.end);
  const fresh = (preferred) => {
    const base =
      preferred
        .replace(/-([a-z])/g, (_, c) => c.toUpperCase())
        .replace(/[^a-zA-Z0-9_$]/g, '_')
        .replace(/^[0-9]/, '_$&') || 'processor';
    let name = base,
      n = 2;
    while (model.names.has(name)) name = base + n++;
    model.names.add(name);
    return name;
  };
  const importName = (name) => {
    if (model.imports.has(name)) return model.imports.get(name);
    const local = fresh(name);
    model.imports.set(name, local);
    additions.push(`${name}${local === name ? '' : ` as ${local}`}`);
    return local;
  };
  const contexts = editor.deviceHierarchy;
  const rootContext = contexts.find((c) => c.root);
  const context = command.scope
    ? contexts.find((c) => c.path === command.scope || c.definition === command.scope)
    : command.operation === 'graph.wrap'
      ? contexts.find((c) => c.nodes.some((n) => n.id === command.ids?.[0]))
      : rootContext;
  if (!context) fail('Unknown Device graph scope');
  const device = [...model.devices.values()].find((d) => d.id === context.definition);
  if (!device) fail('This Device is built dynamically; edit its declaration in source');
  const insert = (code, at = device.statement.end) =>
    edits.push({ start: at, end: at, text: '\n' + code + '\n' });
  const drop = (statement) => {
    if (!edits.some((e) => e.start === statement.start && e.end === statement.end))
      edits.push({ start: statement.start, end: statement.end, text: '' });
  };
  const ownerContext = (path) => contexts.find((c) => c.nodes.some((n) => n.path === path));
  const nodeAt = (path) => {
    const c = ownerContext(path),
      d = [...model.devices.values()].find((d) => d.id === c?.definition);
    const key = c?.nodes.find((n) => n.path === path)?.key;
    const node = d?.nodes.get(key);
    if (!node) fail('This node is built dynamically; edit its declaration in source');
    if ((node.statement.declaration ?? node.statement).declarations?.length !== 1)
      fail('Split combined variable declarations before editing this node visually');
    return { ...node, device: d, context: c, key };
  };
  const portExpression = (path, direction, port) => {
    if (path.startsWith('/@outputs/'))
      return access(`${model.root.name}.outputs`, path.slice('/@outputs/'.length));
    const boundaryContext = contexts.find(
      (c) => path === `${c.path}/@inputs` || path === `${c.path}/@outputs`,
    );
    if (boundaryContext) {
      const d = [...model.devices.values()].find((d) => d.id === boundaryContext.definition);
      return access(`${d.name}.${direction === 'outputs' ? 'inputs' : 'outputs'}`, port);
    }
    const input = rootContext.inputs.find((p) => path === `${rootContext.path}/inputs/${p.name}`);
    if (input) return access(`${model.root.name}.inputs`, input.name);
    return access(`${nodeAt(path).name}.${direction}`, port);
  };
  const normalized = (value) => value.replace(/\[['"]([\w-]+)['"]\]/g, '.$1').replace(/\s/g, '');
  const canonical = (node, seen = new Set()) => {
    if (node?.type === 'Identifier' && !seen.has(node.name)) {
      const variable = model.variables.get(node.name);
      if (variable) {
        const call = variable.declaration.init;
        for (const [method, direction] of [
          ['input', 'inputs'],
          ['output', 'outputs'],
        ])
          if (member(call?.callee, method) && typeof call.arguments[0]?.value === 'string')
            return normalized(
              access(call.callee.object.name + '.' + direction, call.arguments[0].value),
            );
        if (call?.type === 'Identifier' || call?.type === 'MemberExpression')
          return canonical(call, new Set([...seen, node.name]));
      }
    }
    return normalized(text(node));
  };
  const point = (nodeName) => {
    if (command.x === undefined && command.y === undefined) return '';
    if (![command.x, command.y].every(Number.isFinite)) fail('Provide both graph coordinates');
    return `${device.name}.place(${nodeName}, ${JSON.stringify({ x: command.x, y: command.y, space: 'world' })});`;
  };
  const addInstance = (definitionName, keyBase) => {
    if (command.id !== undefined)
      fail('Device source owns numeric allocation; provide a named path or omit identity');
    if (command.label !== undefined) fail('Edit the Device display name in source');
    const prefix = context.path + '/processors/';
    if (
      command.path !== undefined &&
      (!command.path.startsWith(prefix) ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(command.path.slice(prefix.length)))
    )
      fail('Use a Device instance path under ' + prefix);
    if (command.path !== undefined && device.nodes.has(command.path.slice(prefix.length)))
      fail('Device instance path already exists');
    let key = command.path?.slice(prefix.length) ?? keyBase,
      n = 2;
    while (device.nodes.has(key)) key = keyBase + '-' + n++;
    const name = fresh(
      {
        lowPassFilter: 'filter',
        gain: 'level',
        phaseVocoder: 'spectral',
        voiceSynth: 'voice',
        ringModulator: 'modulator',
      }[keyBase] ?? keyBase + 'Node',
    );
    insert(`const ${name} = ${device.name}.add(${quote(key)}, ${definitionName});\n${point(name)}`);
  };
  if (command.operation === 'graph.add') {
    const entry = Object.entries(definitions).find(([, d]) => d.type === command.type);
    if (!entry) fail('Unknown processor definition');
    addInstance(importName(entry[0]), entry[0]);
  } else if (command.operation === 'graph.addModule') {
    const module = validateStudioModule(command.definition);
    let definitionId = module.id,
      index = 2;
    while ([...model.devices.values()].some((d) => d.id === definitionId))
      definitionId = module.id + '-' + index++;
    const local = fresh(definitionId + 'Device'),
      factory = importName('createDevice');
    const nodes = new Map(module.nodes.map((node) => [node.key, { local: fresh(node.key), node }]));
    const lines = [
      `// ${module.label}, module version ${module.version}.`,
      `const ${local} = ${factory}(${JSON.stringify({ id: definitionId, name: module.label })});`,
    ];
    for (const { local: name, node } of nodes.values()) {
      const entry = Object.entries(definitions).find(([, d]) => d.type === node.type);
      if (!entry) fail('Unknown module processor');
      lines.push(
        `const ${name} = ${local}.add(${quote(node.key)}, ${importName(entry[0])}${node.config ? ', ' + JSON.stringify({ config: node.config }) : ''});`,
      );
    }
    for (const [direction, method] of [
      ['inputs', 'input'],
      ['outputs', 'output'],
    ])
      for (const port of module[direction]) {
        const child = nodes.get(port.node),
          spec = Object.values(definitions).find((d) => d.type === child.node.type);
        const signal = spec[direction].find((p) => p.name === port.port)?.signal;
        if (signal !== 'audio' && (signal !== 'midi' || direction === 'outputs'))
          fail(
            'Device modules currently expose audio inputs/outputs and MIDI inputs; retain this module in its expert graph',
          );
        const kind =
          importName(signal === 'midi' ? 'midi' : 'audio') +
          (signal === 'midi' ? '.events' : '.stereo');
        lines.push(`${local}.${method}(${quote(port.name)}, ${kind});`);
        const boundary = access(`${local}.${direction}`, port.name),
          processor = access(`${child.local}.${direction}`, port.port);
        lines.push(
          `${local}.connect(${direction === 'inputs' ? boundary : processor}, ${direction === 'inputs' ? processor : boundary});`,
        );
      }
    for (const wire of module.connections)
      lines.push(
        `${local}.connect(${access(nodes.get(wire.from).local + '.outputs', wire.output)}, ${access(nodes.get(wire.to).local + '.inputs', wire.input)});`,
      );
    for (const control of module.parameters ?? []) {
      const options = {
        label: control.label ?? control.name,
        min: control.min,
        max: control.max,
        default: control.default,
      };
      lines.push(
        `${local}.control(${quote(control.name)}, ${access(nodes.get(control.node).local + '.parameters', control.parameter)}, ${JSON.stringify(options, null, 2)});`,
      );
    }
    edits.push({
      start: device.statement.start,
      end: device.statement.start,
      text: lines.join('\n') + '\n\n',
    });
    addInstance(local, definitionId);
  } else if (command.operation === 'graph.addInstance') {
    const definition = [...model.devices.values()].find((d) => d.id === command.definitionId);
    if (!definition) fail('Unknown reusable Device definition');
    addInstance(definition.name, definition.id);
  } else if (['graph.connect', 'graph.disconnect'].includes(command.operation)) {
    const target = portExpression(command.to, 'inputs', command.input);
    for (const entry of model.calls)
      if (
        member(entry.call.callee, 'connect') &&
        canonical(entry.call.arguments[1]) === normalized(target)
      )
        drop(entry.statement);
    if (command.operation === 'graph.connect') {
      const from = portExpression(command.from, 'outputs', command.output);
      const targetContext =
        ownerContext(command.to) ??
        (command.to.startsWith('/@outputs/')
          ? rootContext
          : contexts.find((c) => command.to.startsWith(c.path + '/@')));
      const d =
        [...model.devices.values()].find((d) => d.id === targetContext?.definition) ?? device;
      insert(
        `${d.name}.connect(${from}, ${target});`,
        model.tree.body.find((n) => n.type === 'ExportDefaultDeclaration').start,
      );
    }
  } else if (command.operation === 'graph.position') {
    const node = nodeAt(command.path);
    for (const entry of model.calls)
      if (member(entry.call.callee, 'place') && entry.call.arguments[0]?.name === node.name)
        drop(entry.statement);
    insert(
      `${node.device.name}.place(${node.name}, ${JSON.stringify({ x: command.x, y: command.y, space: 'world' })});`,
      node.statement.end,
    );
  } else if (command.operation === 'parameter.expose') {
    const definition = command.definition,
      node = nodeAt(definition.instance);
    const key = definition.path.replace(/^\//, '');
    if (!/^[\w-]+$/.test(key)) fail('Give this Device control a simple path such as /brightness');
    const options = Object.fromEntries(
      ['label', 'min', 'max', 'default', 'unit']
        .filter((k) => definition[k] !== undefined)
        .map((k) => [k, definition[k]]),
    );
    insert(
      `${node.device.name}.control(${quote(key)}, ${node.name}.parameters[${quote(definition.parameter)}], ${JSON.stringify(options, null, 2)});`,
      node.statement.end,
    );
  } else if (command.operation === 'graph.remove') {
    const path =
      project.instances?.find((n) => n.nodeId === command.id)?.path ??
      contexts.find((c) => !c.root && editorNodeId(c.path) === command.id)?.path;
    const node = nodeAt(path);
    for (const { statement, node: statementNode } of statements(model.tree))
      if (uses(statementNode, node.name)) {
        const entry = model.calls.find((c) => c.statement === statement);
        const allowed =
          statement === node.statement ||
          (entry &&
            ['connect', 'control', 'place', 'configure', 'group'].some((m) =>
              member(entry.call.callee, m),
            ));
        if (!allowed)
          fail(`The variable ${node.name} is used by custom logic; remove it in source`);
        drop(statement);
      }
  } else if (command.operation === 'graph.wrap') {
    wrapDevice({
      source,
      command,
      model,
      context,
      device,
      project,
      edits,
      importName,
      fresh,
      nodeAt,
      identityMoves,
      contexts,
    });
  } else if (command.operation === 'graph.group') {
    const members = (command.paths ?? []).map(nodeAt);
    if (members.length < 2 || members.some((n) => n.device !== members[0].device))
      fail('Group processors in the same Device');
    let key = 'group',
      index = 2;
    while (editor.groups.some((g) => g.id.endsWith('/' + key))) key = 'group-' + index++;
    insert(
      `${members[0].device.name}.group(${quote(key)}, [${members.map((n) => n.name).join(', ')}], ${JSON.stringify({ label: command.label })});`,
      model.tree.body.find((n) => n.type === 'ExportDefaultDeclaration').start,
    );
  } else if (command.operation === 'graph.ungroup') {
    const key = command.id?.split('/').at(-1),
      path = command.id?.slice(0, -key.length - 1);
    const c = contexts.find((c) => c.path === path),
      d = [...model.devices.values()].find((d) => d.id === c?.definition);
    const entry = model.calls.find(
      (e) =>
        member(e.call.callee, 'group') &&
        e.call.callee.object.name === d?.name &&
        e.call.arguments[0]?.value === key,
    );
    if (!entry) fail('Unknown Device group');
    drop(entry.statement);
  } else fail('This operation needs source editing for a Device project');
  if (additions.length) {
    const existing = model.tree.body.find(
      (n) =>
        n.type === 'ImportDeclaration' &&
        n.source.value === 'manifold' &&
        n.specifiers.every((s) => s.type === 'ImportSpecifier'),
    );
    if (existing) {
      const names = existing.specifiers.map(
        (s) => s.imported.name + (s.local.name === s.imported.name ? '' : ` as ${s.local.name}`),
      );
      edits.push({
        start: existing.start,
        end: existing.end,
        text: `import { ${[...names, ...additions].join(', ')} } from 'manifold';`,
      });
    } else
      edits.push({
        start: 0,
        end: 0,
        text: `import { ${additions.join(', ')} } from 'manifold';\n`,
      });
  }
  return { source: compactGaps(replace(source, edits)), identityMoves };
}

// Kept identical to the shared presentation identity; these are UI identifiers only.
import { graphCanvasId as editorNodeId } from './audio-graphs.js';

function wrapDevice({
  source,
  command,
  model,
  context,
  device,
  project,
  edits,
  importName,
  fresh,
  nodeAt,
  identityMoves,
  contexts,
}) {
  const paths = (command.ids ?? []).map((id) => context.nodes.find((n) => n.id === id)?.path);
  if (!paths.length || paths.some((p) => !p || !context.nodes.some((n) => n.path === p)))
    fail('Select processors from one Device graph');
  const selected = paths.map(nodeAt),
    names = new Set(selected.map((n) => n.name));
  const label = String(command.label ?? 'Sound design').trim();
  const key =
    command.definitionId ??
    (label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') ||
      'sound-design');
  if (device.nodes.has(key)) fail('Choose a new Device name');
  const definition = fresh(key.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) + 'Device');
  const instance = fresh(key.replace(/-([a-z])/g, (_, c) => c.toUpperCase()));
  const factory = importName('createDevice'),
    audioName = () => importName('audio'),
    midiName = () => importName('midi');
  const inner = [],
    outer = [],
    inputs = [],
    outputs = [];
  const code = (n) => source.slice(n.start, n.end);
  const selectedPort = (node) =>
    node?.type === 'MemberExpression' &&
    node.object?.type === 'MemberExpression' &&
    names.has(node.object.object?.name);
  const signal = (node) => {
    const variable = selected.find((n) => n.name === node.object.object.name);
    const childContext = contexts.find((c) => c.path === paths[selected.indexOf(variable)]);
    const portName = node.computed ? node.property.value : node.property.name;
    const direction = node.object.property.name;
    if (childContext) return childContext[direction].find((p) => p.name === portName)?.signal;
    const id = project.instances.find((n) => n.path === paths[selected.indexOf(variable)]).nodeId;
    const type = project.signal.nodes.find((n) => n.id === id).type;
    return Object.values(definitions)
      .find((d) => d.type === type)
      [direction].find((p) => p.name === portName)?.signal;
  };
  const boundary = (list, expression, domain) => {
    let entry = list.find((p) => p.expression === expression);
    if (!entry) {
      const name = domain === 'midi' ? 'midi' : 'audio';
      entry = { expression, name: list.length ? name + (list.length + 1) : name, domain };
      list.push(entry);
    }
    return entry.name;
  };
  for (const { statement, node } of statements(model.tree)) {
    if (![...names].some((name) => uses(node, name))) continue;
    const entry = model.calls.find((c) => c.statement === statement),
      call = entry?.call;
    if (selected.some((n) => n.statement === statement))
      inner.push(code(statement).replace(`${device.name}.add`, `${definition}.add`));
    else if (member(call?.callee, 'configure') && names.has(call.callee.object.name))
      inner.push(code(statement));
    else if (member(call?.callee, 'place'))
      inner.push(code(statement).replace(`${device.name}.place`, `${definition}.place`));
    else if (member(call?.callee, 'control')) {
      const controlKey = call.arguments[0]?.value;
      if (typeof controlKey !== 'string') fail('Wrap requires named control declarations');
      inner.push(`${definition}.control(${call.arguments.map(code).join(', ')});`);
      const declaration = entry.node.declarations?.[0];
      outer.push(
        `${declaration ? `const ${declaration.id.name} = ` : ''}${device.name}.control(${quote(controlKey)}, ${access(instance + '.controls', controlKey)});`,
      );
    } else if (member(call?.callee, 'connect')) {
      const [from, to] = call.arguments,
        fromInside = selectedPort(from),
        toInside = selectedPort(to);
      if (fromInside && toInside) inner.push(`${definition}.connect(${code(from)}, ${code(to)});`);
      else if (toInside) {
        const domain = signal(to);
        if (!['audio', 'midi'].includes(domain))
          fail('Wrap supports audio and MIDI boundaries; edit other interfaces in source');
        const port = boundary(inputs, code(from), domain);
        inner.push(`${definition}.connect(${access(definition + '.inputs', port)}, ${code(to)});`);
      } else if (fromInside) {
        const domain = signal(from);
        if (domain !== 'audio') fail('Device outputs currently support audio');
        const port = boundary(outputs, code(from), domain);
        outer.push(`${device.name}.connect(${access(instance + '.outputs', port)}, ${code(to)});`);
      } else fail('Wrap cannot infer this custom connection; edit it in source');
    } else
      fail('Selected processors have custom logic; extract that logic in source before wrapping');
    edits.push({ start: statement.start, end: statement.end, text: '' });
  }
  const boundaries = [
    ...inputs.map(
      (p) =>
        `${definition}.input(${quote(p.name)}, ${p.domain === 'midi' ? midiName() + '.events' : audioName() + '.stereo'});`,
    ),
    ...outputs.map((p) => `${definition}.output(${quote(p.name)}, ${audioName()}.stereo);`),
  ];
  inner.push(
    ...outputs.map(
      (p) => `${definition}.connect(${p.expression}, ${access(definition + '.outputs', p.name)});`,
    ),
  );
  outer.unshift(
    ...inputs.map(
      (p) => `${device.name}.connect(${p.expression}, ${access(instance + '.inputs', p.name)});`,
    ),
  );
  // Declarations precede their instances; the surrounding file and unrelated logic stay intact.
  edits.push({
    start: device.statement.start,
    end: device.statement.start,
    text: `const ${definition} = ${factory}(${objectCode({ id: key, name: label })});\n${boundaries.join('\n')}\n${inner.join('\n')}\n\n`,
  });
  const exportAt = Math.min(
    model.tree.body.find((n) => n.type === 'ExportDefaultDeclaration').start,
    ...[...model.variables.values()]
      .filter((v) => member(v.call?.callee, 'add') && v.call.arguments[1]?.name === device.name)
      .map((v) => v.statement.start),
  );
  for (const c of contexts.filter((c) => c.definition === context.definition))
    for (const n of selected)
      identityMoves.push({
        from: `${c.path}/processors/${n.key}`,
        to: `${c.path}/processors/${key}/processors/${n.key}`,
      });
  edits.push({
    start: exportAt,
    end: exportAt,
    text: `const ${instance} = ${device.name}.add(${quote(key)}, ${definition});\n${outer.join('\n')}\n\n`,
  });
}
