import { parse } from 'acorn';
import { expandComposition } from './composition-graph.js';

// Navigation metadata only. Never execute source or infer new graph authority.
let cachedSource, cachedTree, cachedIndex;
function syntax(source) {
  if (source !== cachedSource) {
    cachedSource = source;
    cachedIndex = null;
    try {
      cachedTree = parse(source, { ecmaVersion: 2022, sourceType: 'module' });
    } catch {
      cachedTree = null;
    }
  }
  return cachedTree;
}
function walk(node, visit, statement = node) {
  if (!node?.type) return;
  if (node.type.endsWith('Statement') || node.type === 'VariableDeclaration') statement = node;
  visit(node, statement);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit, statement));
    else if (value?.type) walk(value, visit, statement);
  }
}
const property = (node, name) =>
  node?.properties?.find((p) => !p.computed && (p.key?.name ?? p.key?.value) === name)?.value;
const member = (node, name) =>
  node?.type === 'MemberExpression' && !node.computed && node.property.name === name;
function createsGraph(node) {
  return (
    node?.type === 'CallExpression' &&
    (node.callee?.name === 'createGraphWorkspace' ||
      (node.callee?.type === 'MemberExpression' &&
        (node.callee.property.name === 'createGraphWorkspace' || createsGraph(node.callee.object))))
  );
}

// Build declaration lookups once per source revision. Rewalking a large source
// for each DSP node can exhaust the native control runtime's authoring budget.
function declarationIndex(source) {
  const tree = syntax(source);
  if (cachedIndex) return cachedIndex;
  const graphs = new Set(),
    devices = new Map(),
    metadata = new Set();
  const ids = new Map(),
    paths = new Map(),
    kinds = new Map();
  const add = (map, key, rank, statement) => {
    if (key === undefined) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push([rank, statement]);
  };
  const factories = new Set();
  for (const declaration of tree?.body ?? []) {
    if (
      declaration.type !== 'ImportDeclaration' ||
      !['manifold', '@manifold/author/creative'].includes(declaration.source.value)
    )
      continue;
    for (const specifier of declaration.specifiers) {
      if (
        specifier.type === 'ImportSpecifier' &&
        ['createDevice', 'createEffect', 'createInstrument'].includes(specifier.imported.name)
      )
        factories.add(specifier.local.name);
    }
  }
  walk(tree, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && createsGraph(n.init))
      graphs.add(n.id.name);
    if (
      n.type === 'VariableDeclarator' &&
      n.id.type === 'Identifier' &&
      n.init?.type === 'CallExpression' &&
      factories.has(n.init.callee?.name)
    ) {
      const identity = property(n.init.arguments[0], 'id')?.value;
      if (typeof identity === 'string') devices.set(n.id.name, `/device/${identity}`);
    }
    if (n.type === 'VariableDeclarator' && n.id.name === 'studioGraph')
      walk(n.init, (child) => metadata.add(child));
  });
  walk(tree, (n, statement) => {
    if (n.type === 'CallExpression' && n.callee?.type === 'MemberExpression') {
      const scope = devices.get(n.callee.object?.name),
        key = n.arguments[0]?.value;
      if (scope && typeof key === 'string') {
        if (member(n.callee, 'add')) add(paths, `${scope}/processors/${key}`, 0, statement);
        if (member(n.callee, 'input')) add(paths, `${scope}/inputs/${key}`, 0, statement);
      }
      if (graphs.has(n.callee.object?.name)) {
        if (member(n.callee, 'add')) add(ids, property(n.arguments[1], 'id')?.value, 0, statement);
        if (member(n.callee, 'registerInstance') && typeof key === 'string')
          add(paths, key, 1, statement);
      }
    }
    if (n.type === 'MemberExpression' && graphs.has(n.object?.name)) {
      if (member(n, 'input')) add(kinds, 'input.raw', 2, statement);
      if (member(n, 'output')) add(kinds, 'output', 2, statement);
    }
    if (
      metadata.has(n) &&
      n.type === 'ObjectExpression' &&
      (property(n, 'type') || property(n, 'definition'))
    )
      add(paths, property(n, 'path')?.value, 0, n);
  });
  cachedIndex = { ids, paths, kinds };
  return cachedIndex;
}

/** Locate supported explicit declarations; dynamic authoring falls back to its file. */
export function nodeDeclaration(source, node, graph, declarationPath) {
  const index = declarationIndex(source);
  const path = declarationPath ?? graph.instances?.find((i) => i.nodeId === node.id)?.path;
  const candidates = [
    ...(index.ids.get(node.id) ?? []),
    ...(path ? (index.paths.get(path) ?? []) : []),
    ...(index.kinds.get(node.type) ?? []),
  ];
  candidates.sort((a, b) => a[0] - b[0] || a[1].start - b[1].start);
  const best = candidates.filter(([rank]) => rank === candidates[0]?.[0]);
  const distinct = [...new Map(best.map(([, n]) => [n.start, n])).values()];
  const target = distinct.length === 1 ? distinct[0] : null;
  return {
    role: 'declaration',
    label: target ? 'Declaration' : 'Project source',
    path: '/project.mjs',
    ...(target
      ? { from: target.start, to: target.end, excerpt: source.slice(target.start, target.end) }
      : {}),
  };
}

/** Shared source relationships for native, browser, and agent inspection. */
export function describeNodeSources(source, graph, composition, definitions) {
  const links = {};
  for (const node of graph.signal.nodes) links[node.id] = [nodeDeclaration(source, node, graph)];
  const objects = expandComposition(composition).objects;
  for (const node of objects) {
    const definition = definitions.find((d) => d.id === node.definition);
    if (definition.implementation.kind === 'parameter') {
      const endpoint = graph.endpoints.find(endpoint => endpoint.path === definition.implementation.path);
      const target = graph.signal.nodes.find(node => node.id === endpoint?.nodeId);
      links[node.id] = target ? [nodeDeclaration(source, target, graph)] :
        [{ role: 'declaration', label: 'Control source', path: '/project.mjs' }];
      continue;
    }
    if (definition.implementation.kind === 'visual-primitive') {
      links[node.id] = [{ role: 'definition', label: 'Image graph definition', path: '/composition.json' },
        ...(definition.implementation.frames ?? []).map(path => ({ role: 'asset', label: 'Image frame', path }))];
      continue;
    }
    if (definition.implementation.kind === 'composition' || node.interface) {
      links[node.id] = [
        {
          role: 'definition',
          label: 'Graph definition',
          path: '/composition.json',
          sharedInstances: objects.filter((n) => !n.interface && n.definition === node.definition)
            .length,
        },
      ];
      continue;
    }
    const entry = definition.implementation.entry;
    const paths = [
      entry,
      ...Object.keys(definition.sources)
        .filter((path) => path !== entry)
        .sort(),
    ];
    links[node.id] = paths.map((path) => ({
      role: path === entry ? 'definition' : 'helper',
      label: path === entry ? 'Definition' : 'Imported helper',
      path,
      sharedInstances: objects.filter(
        (instance) =>
          !instance.interface &&
          definitions.find((d) => d.id === instance.definition)?.sources[path] !== undefined,
      ).length,
    }));
    links[node.id].push({
      role: 'instance',
      label: 'Instance settings',
      path: '/composition.json',
    });
  }
  return links;
}

/** A changed draft must never receive a stale accepted-source selection. */
export function sourceSelection(text, link) {
  return Number.isInteger(link.from) && text.slice(link.from, link.to) === link.excerpt
    ? { anchor: link.from, head: link.to }
    : null;
}
