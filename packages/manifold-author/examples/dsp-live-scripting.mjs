// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import {
  distortion as distortionDefinition,
  gain as gainDefinition,
  stereoWidener as stereoWidenerDefinition,
} from '@manifold/author/primitives';
import { source as generatedSource } from './dsp-live-creator-source.generated.mjs';
// Behavior transposed from DspLiveScripting/dsp/default_dsp.lua.
// A generic host supplies audio I/O and the acknowledged route/parameter callbacks.
import { GraphWorkspace, createGraphWorkspace, createLiveGraphSession } from '@manifold/author';
export const parameters = Object.freeze({
  '/dsp/live/input_gain': Object.freeze({
    nodeId: 4,
    id: 0,
    min: 0,
    max: 2,
    default: 1,
  }),
  '/dsp/live/width': Object.freeze({
    nodeId: 5,
    id: 0,
    min: 0,
    max: 1,
    default: 0.25,
  }),
});
// Graph definition — construct inspectable primitives with stable identities.
export function buildGraph() {
  const graph = createGraphWorkspace().setInputSource('external');
  const gain = graph.add(gainDefinition.type, { id: 4 });
  const width = graph.add(stereoWidenerDefinition.type, { id: 5 });
  graph.registerInstance('/dsp/live/nodes/input_trim', gain);
  graph.registerInstance('/dsp/live/nodes/width', width);
  gain.parameter('level').set(parameters['/dsp/live/input_gain'].default);
  width.parameter('width').set(parameters['/dsp/live/width'].default);
  graph.registerParameter(
    '/dsp/live/input_gain',
    gain,
    gain.parameter('level').description.id,
    parameters['/dsp/live/input_gain'],
  );
  graph.registerParameter(
    '/dsp/live/width',
    width,
    width.parameter('width').description.id,
    parameters['/dsp/live/width'],
  );
  graph.bindHostSlot(0, gain, gain.parameter('level').description.id);
  graph.bindHostSlot(1, width, width.parameter('width').description.id);
  graph.connect(graph.input.output('out'), gain.input('audio'));
  graph.connect(gain.output('out'), width.input('audio'));
  graph.connect(width.output('out'), graph.output.input('in'));
  return graph;
}
// Host integration — the session publishes edits only after audio acceptance.
export function createProject(host, graph = buildGraph()) {
  const session = createLiveGraphSession(
    graph,
    (route) => host.setRoute(route),
    (edit) => host.setParameter(edit),
    typeof host.replaceGraph === 'function' ? (graph) => host.replaceGraph(graph) : null,
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
    set: (path, value) => session.parameterPath(path, value),
    routeOutput: (sourcePath) => {
      const source = session.forkGraph().findInstance(sourcePath);
      if (!source) throw new Error(`Unknown graph instance: ${sourcePath}`);
      return session.route({
        to: 3,
        input: 'in',
        from: source.id,
        output: 'out',
      });
    },
    setDistortion: (enabled) =>
      session.transaction((graph) => {
        const gain = graph.findInstance('/dsp/live/nodes/input_trim');
        const width = graph.findInstance('/dsp/live/nodes/width');
        const existing = graph.findInstance('/dsp/live/nodes/distortion');
        if (enabled && !existing) {
          const distortion = graph.add(distortionDefinition.type, { id: 6 });
          graph.registerInstance('/dsp/live/nodes/distortion', distortion);
          distortion.parameter('drive').set(4);
          distortion.parameter('wetMix').set(1);
          distortion.parameter('output').set(1);
          graph.disconnect(width.input('audio'));
          graph.connect(gain.output('out'), distortion.input('audio'));
          graph.connect(distortion.output('out'), width.input('audio'));
        } else if (!enabled && existing) {
          graph.remove(existing);
          graph.connect(gain.output('out'), width.input('audio'));
        }
      }),
  });
}
// Recall — validate portable state through the same graph contract.
export function restoreProject(host, saved) {
  const graph = GraphWorkspace.fromProject(saved);
  if (graph.findInstance('/dsp/live/nodes/input_trim')?.type !== 'gain') {
    throw new Error('Saved DspLiveScripting graph is missing its input trim');
  }
  return createProject(host, graph);
}
// Editable creator transcription of the original default graph. The optional
// distortion uses the same insertion/removal behavior as createProject above.
export function creatorSource() {
  return `// Imports — public graph tools and the DSP definitions this sketch uses.
import { createGraphWorkspace } from '@manifold/author';
import { gain as gainDefinition, stereoWidener as stereoWidenerDefinition, distortion as distortionDefinition } from '@manifold/author/primitives';

export default function createProject() {
// Interface and reusable graph definition — stable paths retain saved controls.
const parameters=${JSON.stringify(parameters, null, 2)};
${buildGraph.toString()}
// Composition — prepare the authored input-to-output graph.
const graph=buildGraph();
const enablePath='/dsp/live/distortion_enabled';
graph.registerControl(enablePath,{min:0,max:1,default:0,discrete:true});
function reconcile(graph){
  const enabled=graph.findControl(enablePath).value===1;
  const gain=graph.findInstance('/dsp/live/nodes/input_trim');
  const width=graph.findInstance('/dsp/live/nodes/width');
  const existing=graph.findInstance('/dsp/live/nodes/distortion');
  if(enabled && !existing){
    const distortion=graph.add(distortionDefinition.type,{id:6});
    graph.registerInstance('/dsp/live/nodes/distortion',distortion);
    distortion.parameter('drive').set(4);
distortion.parameter('wetMix').set(1);
distortion.parameter('output').set(1);
    graph.disconnect(width.input('audio'));
    graph.connect(gain.output('out'),distortion.input('audio'));
    graph.connect(distortion.output('out'),width.input('audio'));
  }else if(!enabled && existing){
    graph.remove(existing);graph.connect(gain.output('out'),width.input('audio'));
  }
}
// Live behavior — submit edits through the acknowledged session.
function onControl(session){session.transaction(reconcile);}
// Presentation — retained and immediate views share these paths.
const view=[
  {id:'gain',type:'parameter',path:'/dsp/live/input_gain',label:'Input gain'},
  {id:'width',type:'parameter',path:'/dsp/live/width',label:'Width'},
  {id:'insert',type:'control',path:enablePath,label:'Distortion insert',choices:['Off','On']},
];
function paint(ui){for(const component of view)ui[component.type](component.path,component);}
// Host hooks — live controls call onControl; paint renders accepted state.
return {graph,view,paint,onControl,reconcile};
}`;
}
export const source = generatedSource;
