// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import {
  gain as gainDefinition,
  stereoWidener as stereoWidenerDefinition,
  sum2 as sum2Definition,
} from '@manifold/author/primitives';
import { source as generatedSource } from './fx-slot-creator-source.generated.mjs';
// Port of DspLiveScripting/dsp/fx_slot_swap_harness.lua orchestration.
// Each effect becomes a normal authored graph instance only when selected.
import {
  GraphWorkspace,
  createGraphWorkspace,
  createLiveGraphSession,
  GraphContractError,
} from '@manifold/author';
const SLOT = Object.freeze({
  slotA: { source: 4, gain: 6, gate: 7, mix: 8, width: 14, widthGate: 15 },
  slotB: { source: 8, gain: 10, gate: 11, mix: 12, width: 16, widthGate: 17 },
});
const selectPath = (name) => `/test/fxslot/${name}/select`;
const amountPath = (name, effect) => `/test/fxslot/${name}/${effect}/amount`;
const nodePath = (name, role) => `/test/fxslot/${name}/nodes/${role}`;
const inputPath = '/test/fxslot/nodes/input_trim';
const masterPath = '/test/fxslot/nodes/master';
const required = (graph, path) => {
  const node = graph.findInstance(path);
  if (!node) throw new GraphContractError('missing-instance', `Missing graph instance: ${path}`);
  return node;
};
const nextId = (graph, preferred) => {
  if (!graph.find(preferred)) return preferred;
  for (let id = 2; id <= 65535; id++) if (!graph.find(id)) return id;
  throw new GraphContractError('project-size', 'No free graph node IDs');
};
function restoreLegacyInstancePaths(graph) {
  if (graph.listInstances().length) return graph;
  const requiredNodes = [
    [inputPath, 4, 'gain'],
    [masterPath, 13, 'gain'],
    ...Object.entries(SLOT).flatMap(([name, ids]) => [
      [nodePath(name, 'gain'), ids.gain, 'gain'],
      [nodePath(name, 'gain_gate'), ids.gate, 'gain'],
      [nodePath(name, 'mix'), ids.mix, 'sum2'],
    ]),
  ];
  if (!requiredNodes.every(([, id, type]) => graph.find(id)?.type === type)) {
    throw new GraphContractError(
      'unsupported-project',
      'Unidentified FX slot graph needs instance paths',
    );
  }
  for (const ids of Object.values(SLOT)) {
    const width = graph.find(ids.width);
    const gate = graph.find(ids.widthGate);
    if (
      Boolean(width) !== Boolean(gate) ||
      (width && width.type !== 'stereo-widener') ||
      (gate && gate.type !== 'gain')
    ) {
      throw new GraphContractError(
        'unsupported-project',
        'Legacy FX slot has an incomplete effect pair',
      );
    }
  }
  for (const [path, id] of requiredNodes) graph.registerInstance(path, graph.find(id));
  for (const [name, ids] of Object.entries(SLOT)) {
    if (
      graph.find(ids.width)?.type === 'stereo-widener' &&
      graph.find(ids.widthGate)?.type === 'gain'
    ) {
      graph.registerInstance(nodePath(name, 'width'), graph.find(ids.width));
      graph.registerInstance(nodePath(name, 'width_gate'), graph.find(ids.widthGate));
    }
  }
  return graph;
}
function validateProjectGraph(graph) {
  const requiredNodes = [
    [inputPath, 'gain'],
    [masterPath, 'gain'],
    ...Object.keys(SLOT).flatMap((name) => [
      [nodePath(name, 'gain'), 'gain'],
      [nodePath(name, 'gain_gate'), 'gain'],
      [nodePath(name, 'mix'), 'sum2'],
    ]),
  ];
  if (
    requiredNodes.some(([path, type]) => graph.findInstance(path)?.type !== type) ||
    graph.findParameter('/test/fxslot/input_gain')?.nodeId !== graph.findInstance(inputPath).id
  ) {
    throw new GraphContractError(
      'unsupported-project',
      'FX slot graph is missing its named nodes or input endpoint',
    );
  }
  for (const name of Object.keys(SLOT)) {
    const width = graph.findInstance(nodePath(name, 'width'));
    const gate = graph.findInstance(nodePath(name, 'width_gate'));
    if (
      Boolean(width) !== Boolean(gate) ||
      (width && width.type !== 'stereo-widener') ||
      (gate && gate.type !== 'gain')
    ) {
      throw new GraphContractError(
        'unsupported-project',
        'FX slot has an incomplete named effect pair',
      );
    }
    if (
      ![selectPath(name), amountPath(name, 'gain'), amountPath(name, 'width')].every((path) =>
        graph.findControl(path),
      )
    ) {
      throw new GraphContractError(
        'unsupported-project',
        'FX slot graph is missing project controls',
      );
    }
  }
  return graph;
}
// Graph definition — construct inspectable primitives with stable identities.
export function buildGraph() {
  const graph = createGraphWorkspace().setInputSource('external');
  const inputTrim = graph.add(gainDefinition.type, { id: 4 });
  graph.registerInstance(inputPath, inputTrim);
  inputTrim.parameter('level').set(1);
  graph.registerParameter(
    '/test/fxslot/input_gain',
    inputTrim,
    inputTrim.parameter('level').description.id,
    { min: 0, max: 2, default: 1 },
  );
  graph.bindHostSlot(0, inputTrim, inputTrim.parameter('level').description.id);
  graph.connect(graph.input.output('out'), inputTrim.input('audio'));
  for (const [name, ids] of Object.entries(SLOT)) {
    const source = graph.find(ids.source);
    const gain = graph.add(gainDefinition.type, { id: ids.gain });
    const gate = graph.add(gainDefinition.type, { id: ids.gate });
    const mix = graph.add(sum2Definition.type, { id: ids.mix });
    graph.registerInstance(nodePath(name, 'gain'), gain);
    graph.registerInstance(nodePath(name, 'gain_gate'), gate);
    graph.registerInstance(nodePath(name, 'mix'), mix);
    gain.parameter('level').set(0.8);
    gate.parameter('level').set(1);
    graph.connect(source.output('out'), gain.input('audio'));
    graph.connect(gain.output('out'), gate.input('audio'));
    graph.connect(gate.output('out'), mix.input('a'));
    graph.registerControl(selectPath(name), {
      min: 0,
      max: 1,
      default: 0,
      discrete: true,
    });
    graph.registerControl(amountPath(name, 'gain'), {
      min: 0,
      max: 2,
      default: 0.8,
    });
    graph.registerControl(amountPath(name, 'width'), {
      min: 0,
      max: 2,
      default: 1.6,
    });
  }
  const master = graph.add(gainDefinition.type, { id: 13 });
  graph.registerInstance(masterPath, master);
  master.parameter('level').set(1);
  graph.connect(graph.find(12).output('out'), master.input('audio'));
  graph.connect(master.output('out'), graph.output.input('in'));
  return graph;
}
function slotName(path) {
  return Object.keys(SLOT).find((name) => path.startsWith(`/test/fxslot/${name}/`));
}
export function applySlot(graph, path, value) {
  const name = slotName(path);
  if (!name || !Number.isFinite(value)) {
    throw new GraphContractError('unknown-control', `Unknown FX slot control: ${path}`);
  }
  const ids = SLOT[name];
  if (path === selectPath(name)) {
    const selected = Math.max(0, Math.min(1, Math.floor(value + 0.5)));
    graph.setControl(path, selected);
    const widthPath = nodePath(name, 'width');
    const gatePath = nodePath(name, 'width_gate');
    if (selected === 1 && !graph.findInstance(widthPath)) {
      const width = graph.add(stereoWidenerDefinition.type, {
        id: nextId(graph, ids.width),
      });
      const gate = graph.add(gainDefinition.type, {
        id: nextId(graph, ids.widthGate),
      });
      graph.registerInstance(widthPath, width);
      graph.registerInstance(gatePath, gate);
      width.parameter('width').set(graph.findControl(amountPath(name, 'width')).value);
      width.parameter('monoLowCutoff').set(160);
      width.parameter('monoLow').set(1);
      gate.parameter('level').set(0);
      const source = name === 'slotA' ? inputPath : nodePath('slotA', 'mix');
      graph.connect(required(graph, source).output('out'), width.input('audio'));
      graph.connect(width.output('out'), gate.input('audio'));
      graph.connect(gate.output('out'), required(graph, nodePath(name, 'mix')).input('b'));
    }
    graph.setParameter(required(graph, nodePath(name, 'gain_gate')), 0, selected === 0 ? 1 : 0);
    if (graph.findInstance(gatePath)) {
      graph.setParameter(required(graph, gatePath), 0, selected === 1 ? 1 : 0);
    }
    return;
  }
  for (const effect of ['gain', 'width']) {
    if (path !== amountPath(name, effect)) continue;
    graph.setControl(path, value);
    const node = graph.findInstance(nodePath(name, effect));
    if (node) graph.setParameter(node, 0, value);
    return;
  }
  throw new GraphContractError('unknown-control', `Unknown FX slot control: ${path}`);
}
export function reconcileSlots(graph, previous) {
  for (const name of Object.keys(SLOT)) {
    const visited = previous.instances?.some((entry) => entry.path === nodePath(name, 'width'));
    const selection = graph.findControl(selectPath(name)).value;
    if (visited && !graph.findInstance(nodePath(name, 'width')))
      applySlot(graph, selectPath(name), 1);
    // Stored amounts are the canonical per-effect memory, including inactive effects.
    for (const effect of ['gain', 'width'])
      applySlot(graph, amountPath(name, effect), graph.findControl(amountPath(name, effect)).value);
    applySlot(graph, selectPath(name), selection);
  }
}
// Host integration — the session publishes edits only after audio acceptance.
export function createProject(host, graph = buildGraph()) {
  if (typeof host.replaceGraph !== 'function') {
    throw new GraphContractError(
      'structural-unavailable',
      'FX swap requires prepared graph replacement',
    );
  }
  const session = createLiveGraphSession(
    validateProjectGraph(restoreLegacyInstancePaths(graph)),
    (route) => host.setRoute(route),
    (edit) => host.setParameter(edit),
    (graph) => host.replaceGraph(graph),
    null,
    typeof host.readPublishedParameters === 'function'
      ? () => host.readPublishedParameters()
      : null,
  );
  return Object.freeze({
    session,
    toProject: () => session.toProject(),
    adoptPublishedParameters: (edits) => session.adoptPublishedParameters(edits),
    synchronizeParameters: () => session.adoptPublishedParameters([]),
    async set(path, value) {
      if (path === '/test/fxslot/input_gain') return session.parameterPath(path, value);
      return session.transaction((graph) => applySlot(graph, path, value));
    },
  });
}
// Recall — validate portable state through the same graph contract.
export function restoreProject(host, saved) {
  return createProject(host, GraphWorkspace.fromProject(saved));
}
// The editor displays the exact public factories used above, without a hidden
// fixed effect engine. The same source is saved in portable native packages.
export function creatorSource() {
  return `// Imports — public graph tools and the DSP definitions this sketch uses.
import { createGraphWorkspace, GraphContractError } from '@manifold/author';
import { gain as gainDefinition, stereoWidener as stereoWidenerDefinition, sum2 as sum2Definition } from '@manifold/author/primitives';

export default function createProject() {
// Interface and reusable graph definition — stable paths retain saved controls.
const SLOT=${JSON.stringify(SLOT, null, 2)};
${[selectPath, amountPath, nodePath, required, nextId].map((fn, i) => `const ${['selectPath', 'amountPath', 'nodePath', 'required', 'nextId'][i]}=(${fn.toString()});`).join('\n')}
const inputPath=${JSON.stringify(inputPath)}, masterPath=${JSON.stringify(masterPath)};
${buildGraph.toString()}
${slotName.toString()}
${applySlot.toString()}
${reconcileSlots.toString()}
// Composition — prepare the authored input-to-output graph.
const graph=buildGraph();
// Presentation — retained and immediate views share these paths.
const view=[{id:'input',type:'parameter',path:'/test/fxslot/input_gain',label:'Input gain',group:'Routing'}];
for(const name of Object.keys(SLOT)){
  const group=name==='slotA'?'Slot A':'Slot B';
  view.push({id:name+'-select',type:'control',path:selectPath(name),label:'Effect',choices:['Gain','Width'],group});
  for(const effect of ['gain','width'])view.push({id:name+'-'+effect,type:'control',path:amountPath(name,effect),label:effect==='gain'?'Gain amount':'Width amount',group});
}
// Live behavior — submit edits through the acknowledged session.
function onControl(session,path,value){session.transaction(graph=>applySlot(graph,path,value));}
function paint(ui){for(const component of view)ui[component.type](component.path,component);}
// Host hooks — live controls call onControl; paint renders accepted state.
return {graph,view,paint,onControl,reconcile:reconcileSlots};
}`;
}
export const source = generatedSource;
