import { PORT_CATALOG } from '@manifold/author/catalog';

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

/** A read-only projection of the real graph, sharing Studio's source locations. */
export function mountExampleGraph(element, runtime, revealPanel) {
  const container = element.querySelector('[data-graph]');
  let scope = '';
  function follow(id) {
    const link =
      runtime.snapshot().nodeSources[id]?.find((item) => item.role === 'definition') ??
      runtime.snapshot().nodeSources[id]?.[0];
    if (!link) return;
    revealPanel('source', true);
    const files = [...element.querySelectorAll('[data-source-file]')];
    const file = files.find((file) => file.dataset.sourceFile === link.path) ?? files[0];
    file.open = true;
    element
      .querySelectorAll('.declaration')
      .forEach((line) => line.classList.remove('declaration'));
    let target = file;
    if (link.path === '/project.mjs' && link.from !== undefined) {
      const start = runtime.source.slice(0, link.from).split('\n').length;
      const end = runtime.source.slice(0, link.to).split('\n').length;
      const lines = file.querySelectorAll('.line');
      for (let i = start - 1; i < end; i++) lines[i]?.classList.add('declaration');
      target = lines[start - 1] ?? file;
    }
    target.scrollIntoView({ block: 'nearest' });
  }
  function render() {
    const state = runtime.snapshot();
    const nodes = [
      ...state.audioNodes
        .filter((node) => (node.scope ?? '') === scope)
        .map((node) => ({
          ...node,
          label:
            node.instance.startsWith('/device/') &&
            node.instance.includes('/processors/') &&
            !node.implementationKind?.startsWith('interface-')
              ? node.instance.split('/').at(-1)
              : node.label,
          endpoint: runtime.project.endpoints?.find((endpoint) => endpoint.nodeId === node.id)
            ?.path,
        })),
      ...(scope ? [] : (state.composition?.nodes ?? [])),
    ];
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const wires = [...state.audioEdges, ...(state.composition?.connections ?? [])].filter(
      (wire) => byId.has(wire.from) && byId.has(wire.to),
    );
    const depth = new Map(nodes.map((node) => [node.id, 0]));
    for (let pass = 0; pass < nodes.length; pass++)
      for (const wire of wires)
        depth.set(wire.to, Math.max(depth.get(wire.to), depth.get(wire.from) + 1));
    // Name ports on their nodes so fan-out wires cannot overprint each other's labels.
    const ports = new Map(
      nodes.map((node) => {
        const definition = state.composition?.definitions?.find(
          (definition) => definition.id === node.definition,
        );
        const catalog = node.domain === 'audio' ? node : (PORT_CATALOG[node.type] ?? definition);
        const inputs = [...new Set((catalog?.inputs ?? []).map((port) => port.name))];
        const outputs = [...new Set((catalog?.outputs ?? []).map((port) => port.name))];
        return [node.id, { inputs, outputs }];
      }),
    );
    const namedWires = wires.map((wire) => {
      const from = ports.get(wire.from),
        to = ports.get(wire.to);
      const output = wire.output ?? from.outputs[wire.outputPort];
      const input = wire.input ?? to.inputs[wire.inputPort];
      if (!from.outputs.includes(output)) from.outputs.push(output);
      if (!to.inputs.includes(input)) to.inputs.push(input);
      return { ...wire, output, input };
    });
    const counts = new Map(),
      positions = new Map();
    for (const node of nodes) {
      const column = depth.get(node.id),
        row = counts.get(column) ?? 0;
      counts.set(column, row + 1);
      positions.set(node.id, [12 + column * 246, 18 + row * 136]);
    }
    const width = 202 + Math.max(...depth.values()) * 246,
      height = Math.max(...counts.values()) * 136 + 15;
    const paths = namedWires
      .map((wire) => {
        const [x, y] = positions.get(wire.from),
          [u, v] = positions.get(wire.to);
        const fromY = y + 55 + ports.get(wire.from).outputs.indexOf(wire.output) * 17;
        const toY = v + 55 + ports.get(wire.to).inputs.indexOf(wire.input) * 17;
        return `<path d="M${x + 178} ${fromY}C${x + 210} ${fromY} ${u - 32} ${toY} ${u} ${toY}"><title>${escape(byId.get(wire.from).label)}.${escape(wire.output)} → ${escape(byId.get(wire.to).label)}.${escape(wire.input)}</title></path>`;
      })
      .join('');
    const interiors = nodes.filter((node) => node.implementationKind === 'composition');
    container.innerHTML = `<div class="lab-presets"><span>${escape(
      scope
        ? (nodes
            .find((n) => n.scope === scope)
            ?.scope.split('/')
            .at(-1) ?? 'Inside Device')
        : 'Project graph',
    )}</span>${scope ? '<button data-parent>Parent graph ↑</button>' : ''}${interiors.map((node) => `<button data-enter="${escape(node.instance)}">Enter ${escape(node.label)} →</button>`).join('')}</div><svg viewBox="0 0 ${width} ${height}" style="min-width:${Math.min(width, 1000)}px;height:${height}px" role="group" aria-label="Accepted audio and presentation graph">${paths}${nodes
      .map((node) => {
        const [x, y] = positions.get(node.id),
          { inputs, outputs } = ports.get(node.id);
        const connected = wires.some((wire) => wire.from === node.id || wire.to === node.id);
        const label =
          node.type === 'oscillator' && node.endpoint ? node.endpoint.slice(1) : node.label;
        return `<g transform="translate(${x} ${y})" role="button" tabindex="0" data-node="${node.id}" aria-label="View ${escape(label)} source"><rect width="178" height="102" rx="5"/><text x="10" y="22">${escape(label)}</text><text class="sub" x="10" y="39">${escape(node.type === 'midi-input' ? 'MIDI' : node.definition ? 'Presentation' : connected ? 'Audio' : 'Unused input')} · source ↗</text>${inputs.map((port, i) => `<text class="port-label" x="8" y="${59 + i * 17}">${escape(port)}</text>`).join('')}${outputs.map((port, i) => `<text class="port-label" text-anchor="end" x="170" y="${59 + i * 17}">${escape(port)}</text>`).join('')}</g>`;
      })
      .join('')}</svg>`;
    container.querySelector('[data-parent]')?.addEventListener('click', () => {
      scope = state.audioNodes.find((node) => node.instance === scope)?.scope ?? '';
      render();
    });
    for (const button of container.querySelectorAll('[data-enter]'))
      button.addEventListener('click', () => {
        scope = button.dataset.enter;
        render();
      });
    for (const node of container.querySelectorAll('[data-node]')) {
      node.addEventListener('click', () => follow(Number(node.dataset.node)));
      node.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          follow(Number(node.dataset.node));
        }
      });
    }
  }
  render();
  return runtime.subscribe(render);
}
