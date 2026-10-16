import { audioGraphPresentation, graphCanvasId } from './audio-graphs.js';

/** Translate Device declarations into the shared Studio graph presentation. */
export function devicePresentation(editor, project, catalog) {
  const base = audioGraphPresentation(undefined, project, catalog, editor.layout);
  const nodes = base.audioNodes;
  const processors = [...nodes];
  const contexts = editor.deviceHierarchy;
  const used = new Set(nodes.map((n) => n.id));
  const add = (node) => {
    if (used.has(node.id)) throw new Error('Device canvas identity collision');
    used.add(node.id);
    nodes.push(node);
  };
  const link = (path, definition) => [
    {
      role: 'declaration',
      label: 'Device source',
      path: '/project.mjs',
      declarationPath: `/device/${definition}/processors/${path.split('/').at(-1)}`,
    },
  ];
  for (const context of contexts) {
    const scope = context.root ? '' : context.path;
    for (const child of context.nodes) {
      const leaf = nodes.find((n) => n.id === child.id);
      if (leaf) {
        leaf.scope = scope;
        leaf.ownerDefinition = context.root ? '' : context.definition;
        leaf.label = child.key;
        leaf.sourceLinks = link(child.path, context.definition);
      }
    }
    if (context.root) continue;
    const placement = editor.layout.find((p) => p.path === context.path);
    add({
      id: graphCanvasId(context.path),
      type: context.definition,
      label: context.label,
      instance: context.path,
      scope: context.scope,
      domain: 'audio',
      implementationKind: 'composition',
      ownerDefinition: context.scope
        ? (contexts.find((c) => c.path === context.scope)?.definition ?? '')
        : '',
      inputs: context.inputs,
      outputs: context.outputs,
      parameters: processors
        .filter((n) => n.instance.startsWith(context.path + '/processors/'))
        .flatMap((n) => n.parameters),
      sourceLinks: link(
        context.path,
        contexts.find((c) => c.nodes.some((n) => n.path === context.path)).definition,
      ),
      position: placement ? [placement.x, placement.y] : null,
      positionSpace: placement?.space ?? '',
    });
    for (const direction of ['inputs', 'outputs'])
      add({
        id: graphCanvasId(context.path + '/@' + direction),
        type: 'audio-interface',
        label: direction === 'inputs' ? 'Device inputs' : 'Device outputs',
        instance: context.path + '/@' + direction,
        scope: context.path,
        domain: 'audio',
        implementationKind: direction === 'inputs' ? 'interface-input' : 'interface-output',
        inputs: direction === 'outputs' ? context.outputs : [],
        outputs: direction === 'inputs' ? context.inputs : [],
        parameters: [],
        sourceLinks: link(context.path, context.definition),
      });
  }
  const edges = [];
  for (const context of contexts) {
    const endpoint = (value) => {
      if (value.boundary) {
        if (context.root) {
          const node = nodes.find(
            (n) =>
              n.instance ===
              (value.boundary === 'inputs'
                ? `${context.path}/inputs/${value.name}`
                : `/@outputs/${value.name}`),
          );
          return { id: node.id, index: 0 };
        }
        return {
          id: graphCanvasId(context.path + '/@' + value.boundary),
          index: context[value.boundary].findIndex((p) => p.name === value.name),
        };
      }
      const child = context.nodes.find((n) => n.key === value.key),
        node = nodes.find((n) => n.id === child.id);
      return { id: child.id, index: node[value.direction].findIndex((p) => p.name === value.name) };
    };
    for (const edge of context.edges) {
      const from = endpoint(edge.from),
        to = endpoint(edge.to);
      edges.push({ from: from.id, outputPort: from.index, to: to.id, inputPort: to.index });
    }
  }
  return {
    audioNodes: nodes,
    audioEdges: edges,
    audioPalette: [
      ...new Map(
        contexts
          .filter((c) => !c.root)
          .map((c) => [
            c.definition,
            {
              type: c.definition,
              label: c.label,
              kind: 'audio-graph',
              inputs: c.inputs.length,
              outputs: c.outputs.length,
              parameters: 0,
              input_ports: c.inputs,
              output_ports: c.outputs,
            },
          ]),
      ).values(),
    ],
  };
}
