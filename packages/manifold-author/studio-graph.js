import { parse } from 'acorn';
import { applyAudioGraphs, editAudioGraphs } from './audio-graphs.js';

// A visual edit reads the accepted source several times while planning and
// validating its metadata transaction. Keep the accepted and proposed syntax
// trees so large authored views are parsed once per source revision.
const parsedSources = new Map();
function studioTree(source) {
  if (parsedSources.has(source)) return parsedSources.get(source);
  const tree = parse(source, { ecmaVersion: 2022, sourceType: 'module' });
  if (parsedSources.size >= 2) parsedSources.delete(parsedSources.keys().next().value);
  parsedSources.set(source, tree);
  return tree;
}

// The studio owns this small literal declaration in an otherwise arbitrary project.
// GraphWorkspace remains the only graph; these edits are part of authored source.
export function validateStudioModule(definition) {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)
    || !/^[a-z][a-z0-9-]{0,63}$/.test(definition.id ?? '')
    || typeof definition.label !== 'string' || !definition.label.trim()
    || !Number.isInteger(definition.version) || definition.version < 1
    || !Array.isArray(definition.nodes) || definition.nodes.length < 1
    || !Array.isArray(definition.connections) || !Array.isArray(definition.inputs)
    || !Array.isArray(definition.outputs) || !Array.isArray(definition.parameters ?? []))
    throw new Error('Module needs an ID, label, version, 1–32 primitive nodes and declared ports');
  const keys = new Set();
  for (const node of definition.nodes) {
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(node.key ?? '') || keys.has(node.key)
      || typeof node.type !== 'string') throw new Error('Module primitive keys must be unique names');
    keys.add(node.key);
  }
  for (const edge of definition.connections) if (!keys.has(edge.from) || !keys.has(edge.to)
    || typeof edge.output !== 'string' || typeof edge.input !== 'string')
    throw new Error('Module cable must reference named primitive ports');
  for (const [ports, direction] of [[definition.inputs,'input'],[definition.outputs,'output']]) {
    const names = new Set();
    for (const port of ports) {
      if (!/^[a-z][a-zA-Z0-9]{0,31}$/.test(port.name ?? '') || names.has(port.name)
        || !keys.has(port.node) || typeof port.port !== 'string')
        throw new Error(`Module ${direction} ports need unique names and primitive targets`);
      names.add(port.name);
    }
  }
  for (const parameter of definition.parameters ?? []) if (!keys.has(parameter.node)
    || typeof parameter.name !== 'string' || typeof parameter.parameter !== 'string'
    || !Number.isFinite(parameter.min) || !Number.isFinite(parameter.max)
    || !Number.isFinite(parameter.default)) throw new Error('Module parameters need valid primitive bindings');
  return structuredClone(definition);
}

export function applyStudioGraph(graph, edits) {
  for (const path of edits.removed ?? []) {
    const node = graph.findInstance(path);
    if (!node) throw new Error(`Unknown graph instance ${path}`);
    graph.remove(node);
  }
  for (const { type, id, path } of edits.nodes ?? []) {
    const node = graph.add(type, { id });
    graph.registerInstance(path, node);
  }
  const modules = new Map();
  for (const item of edits.modules ?? []) {
    const definition = validateStudioModule(item.definition);
    const children = new Map();
    for (const [index, node] of definition.nodes.entries()) {
      const handle = graph.add(node.type, { id:item.id + index, config:node.config ?? {} });
      graph.registerInstance(`${item.path}/${node.key}`, handle);
      children.set(node.key, handle);
    }
    for (const edge of definition.connections)
      graph.connect(children.get(edge.from).output(edge.output),children.get(edge.to).input(edge.input));
    for (const parameter of definition.parameters ?? []) {
      children.get(parameter.node).parameter(parameter.parameter).expose({
        path:`${item.path}/${parameter.name}`, label:parameter.label ?? parameter.name,
        min:parameter.min,max:parameter.max,default:parameter.default,
        ...(parameter.choices ? {choices:parameter.choices} : {}),
      });
    }
    modules.set(item.path,{definition,children});
  }
  const audioGraphs = applyAudioGraphs(graph, edits.audioGraphs);
  const reference = (path, direction, port) => {
    if (audioGraphs.has(path)) return audioGraphs.get(path)[direction === 'inputs' ? 'input' : 'output'](port);
    const module = modules.get(path);
    if (module) {
      const binding = module.definition[direction].find(item => item.name === port);
      if (!binding) throw new Error(`Unknown module port ${path}:${port}`);
      return module.children.get(binding.node)[direction === 'inputs' ? 'input' : 'output'](binding.port);
    }
    const instance = path === '@input' ? graph.input : path === '@output' ? graph.output : graph.findInstance(path);
    if (!instance) throw new Error(`Unknown graph instance ${path}`);
    return instance[direction === 'inputs' ? 'input' : 'output'](port);
  };
  for (const edge of edits.connections ?? []) {
    const input = reference(edge.to,'inputs',edge.input);
    if (!input) continue;
    graph.disconnect(input);
    if (edge.from !== null) {
      const output = reference(edge.from,'outputs',edge.output);
      if (output) graph.connect(output, input);
    }
  }
  return graph;
}

function literal(node) {
  if (node.type === 'Literal') return node.value;
  if (node.type === 'UnaryExpression' && (node.operator === '-' || node.operator === '+')
    && node.argument.type === 'Literal' && typeof node.argument.value === 'number')
    return node.operator === '-' ? -node.argument.value : node.argument.value;
  if (node.type === 'ArrayExpression') return node.elements.map(literal);
  if (node.type === 'ObjectExpression') return Object.fromEntries(node.properties.map(property => {
    if (property.type !== 'Property' || property.computed || property.method || property.kind !== 'init')
      throw new Error('Visual graph edits require a literal studioGraph declaration');
    return [property.key.name ?? property.key.value, literal(property.value)];
  }));
  throw new Error('Visual graph edits require a literal studioGraph declaration');
}

export function readStudioGraph(source) {
  const tree = studioTree(source);
  const declaration = tree.body.flatMap(node => node.declarations ?? [])
    .find(node => node.id.name === 'studioGraph');
  if (!declaration?.init) throw new Error('Add a literal studioGraph declaration and call applyStudioGraph(graph, studioGraph) before returning your project');
  let applied = false;
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee?.name === 'applyStudioGraph'
      && node.arguments?.[1]?.name === 'studioGraph') applied = true;
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  };
  walk(tree);
  if (!applied) throw new Error('Call applyStudioGraph(graph, studioGraph) in the project factory before returning the graph');
  const value = literal(declaration.init);
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('studioGraph must be an object');
  for (const key of ['nodes', 'connections', 'removed', 'layout']) {
    if (!Array.isArray(value[key])) throw new Error(`studioGraph.${key} must be an array`);
  }
  return { declaration, value };
}

// A metadata-only edit may keep the current DSP/controller instances only if
// the authored declaration has no other readers that could change behavior.
export function studioGraphMetadataOnly(source) {
  const tree = studioTree(source);
  let safe = true;
  const walk = (node, parent) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Identifier' && node.name === 'studioGraph') {
      const declaration = parent?.type === 'VariableDeclarator' && parent.id === node;
      const graphApplication = parent?.type === 'CallExpression'
        && parent.callee?.name === 'applyStudioGraph' && parent.arguments?.[1] === node;
      const editorSnapshot = parent?.type === 'Property' && parent.value === node
        && !parent.computed && (parent.key?.name ?? parent.key?.value) === 'editorGraph';
      if (!declaration && !graphApplication && !editorSnapshot) safe = false;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(child=>walk(child,node));
      else if (value && typeof value === 'object') walk(value,node);
    }
  };
  walk(tree,null);
  return safe;
}

export function planStudioGraphEdit(source, command, project) {
  const { declaration, value } = readStudioGraph(source);
  const next = structuredClone(value);
  next.modules ??= [];
  next.groups ??= [];
  if (editAudioGraphs(next, command, project)) {
    return source.slice(0,declaration.init.start) + JSON.stringify(next,null,2) + source.slice(declaration.init.end);
  }
  const pathOf = id => id === 1 ? '@input' : id === 3 ? '@output'
    : project.instances?.find(item => item.nodeId === id)?.path;
  const placement = () => {
    if ((command.x === undefined) !== (command.y === undefined)) throw new Error('Provide both graph position coordinates');
    if (command.x === undefined) return null;
    const values = [command.x, command.y];
    const world = command.space === 'world';
    if (command.space && !world) throw new Error('Unknown graph position space');
    if (!values.every(value => typeof value === 'number' && Number.isFinite(value)
      && (world ? Math.abs(value) <= 1_000_000 : value >= 0 && value <= 1)))
      throw new Error(world ? 'Graph position exceeds the supported world range' : 'Graph position must be within the canvas');
    return {x:command.x,y:command.y,...(world ? {space:'world'} : {})};
  };
  if (command.operation === 'graph.add') {
    const id = command.id ?? project.signal.nodes.reduce((last, node) => Math.max(last, node.id), 3) + 1;
    const path = command.path ?? `/studio/${command.type}/${id}`;
    if (!Number.isInteger(id) || id < 4 || id > 0xffffffff) throw new Error('Use an available graph node ID in the unsigned 32-bit node ID format');
    if (project.signal.nodes.some(node => node.id === id) || project.instances?.some(item => item.path === path)) throw new Error('Graph node ID or path already exists');
    next.nodes.push({ type: command.type, id, path });
    const point = placement();
    if (point) next.layout.push({path,...point});
  } else if (command.operation === 'graph.addModule') {
    const definition = validateStudioModule(command.definition);
    const id = command.id ?? project.signal.nodes.reduce((last, node) => Math.max(last, node.id), 3) + 1;
    const path = command.path ?? `/studio/${definition.id}/${id}`;
    if (!Number.isInteger(id) || id < 4 || id + definition.nodes.length - 1 > 0xffffffff
      || project.signal.nodes.some(node=>node.id >= id && node.id < id + definition.nodes.length)
      || project.instances?.some(item=>item.path === path)) throw new Error('Module needs unused graph IDs and a unique path');
    next.modules.push({id,path,definition});
    const point = placement();
    if (point) for (const [index, node] of definition.nodes.entries())
      next.layout.push({path:`${path}/${node.key}`,x:point.x + (point.space === 'world' ? index * 220 : 0),y:point.y,
        ...(point.space ? {space:point.space} : {})});
  } else if (command.operation === 'graph.remove') {
    const id = command.id;
    const module = next.modules.find(item=>id >= item.id && id < item.id + item.definition.nodes.length);
    if (module) {
      next.modules = next.modules.filter(item=>item !== module);
      next.connections = next.connections.filter(edge=>edge.from !== module.path && edge.to !== module.path);
      next.layout = next.layout.filter(item=>item.path !== module.path && !item.path.startsWith(`${module.path}/`));
      next.groups = next.groups.map(group=>({...group,paths:group.paths.filter(path=>!path.startsWith(`${module.path}/`))}))
        .filter(group=>group.paths.length>1);
      return source.slice(0,declaration.init.start) + JSON.stringify(next,null,2) + source.slice(declaration.init.end);
    }
    const path = pathOf(id);
    if (!path || id === 1 || id === 3) throw new Error('Select a removable named graph node');
    const added = next.nodes.some(node => node.path === path);
    next.nodes = next.nodes.filter(node => node.path !== path);
    next.connections = next.connections.filter(edge => edge.from !== path && edge.to !== path);
    next.layout = next.layout.filter(item => item.path !== path);
    next.groups = next.groups.map(group=>({...group,paths:group.paths.filter(member=>member!==path)}))
      .filter(group=>group.paths.length>1);
    if (!added && !next.removed.includes(path)) next.removed.push(path);
  } else if (command.operation === 'graph.connect' || command.operation === 'graph.disconnect') {
    const to = command.to, input = command.input;
    if (typeof to !== 'string' || typeof input !== 'string') throw new Error('Use named graph ports');
    next.connections = next.connections.filter(edge => edge.to !== to || edge.input !== input);
    next.connections.push(command.operation === 'graph.disconnect' ? { to, input, from: null }
      : { from: command.from, output: command.output, to, input });
  } else if (command.operation === 'graph.position') {
    const path = command.path;
    if (!project.instances?.some(item => item.path === path) && !next.modules.some(item=>item.path === path)
      && !project.signal.nodes.some(node => path === `/${node.type}/${node.id}`)) throw new Error('Unknown graph instance');
    const point = placement();
    if (!point) throw new Error('Provide both graph position coordinates');
    next.layout = [...next.layout.filter(item => item.path !== path), {path,...point}];
  } else if (command.operation === 'graph.group') {
    const paths = command.paths;
    if (!Array.isArray(paths) || paths.length < 2 || new Set(paths).size !== paths.length
      || !paths.every(path=>typeof path==='string' && project.instances?.some(item=>item.path===path)))
      throw new Error('Group needs 2–64 distinct named graph nodes');
    const label = String(command.label ?? '').trim();
    if (!label || label.length > 64) throw new Error('Group label must be 1–64 characters');
    const used = new Set(next.groups.map(group=>group.id));
    let index = 1; while (used.has(`group-${index}`)) index++;
    next.groups.push({id:`group-${index}`,label,paths});
  } else if (command.operation === 'graph.ungroup') {
    if (typeof command.id !== 'string' || !next.groups.some(group=>group.id===command.id))
      throw new Error('Unknown graph group');
    next.groups = next.groups.filter(group=>group.id!==command.id);
  } else throw new Error(`Unknown graph edit ${command.operation}`);
  return source.slice(0, declaration.init.start) + JSON.stringify(next, null, 2)
    + source.slice(declaration.init.end);
}
