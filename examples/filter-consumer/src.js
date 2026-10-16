// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import { BrowserGraphHost } from '@manifold/author/browser';
import { LiveProjectRuntime } from '@manifold/author/live-project';
import { source } from '@manifold/author/examples/standalone-filter';
import { mountMainFilter } from '@manifold/ui-web/filter';
import { mountCompactSlider } from '@manifold/ui-web/slider';
import { createParameterGesture } from '@manifold/ui-web/parameter-gesture';

const get = (id) => document.getElementById(id);
let host;
const runtime = new LiveProjectRuntime(
  {
    get ready() {
      return host?.ready ?? false;
    },
    setParameter: (edit) => host.setParameter(edit),
    setParameterBatch: (edits) => host.setParameterBatch(edits),
    replaceGraph: (graph) => host.replaceGraph(graph),
    readPublishedParameters: () => host.readPublishedParameters(),
  },
  source,
);
const paths = ['/plugin/params/type', '/plugin/params/cutoff', '/plugin/params/resonance'];
const request = async (command) => {
  try {
    const result = await runtime.request(command);
    get('status').textContent = `Revision ${runtime.revision} accepted`;
    return result;
  } catch (error) {
    get('status').textContent = error.message;
    throw error;
  }
};
const gesture = createParameterGesture(runtime, request, (error) => {
  get('status').textContent = error.message;
});
const set = (path, value) => gesture.set(path, value, 'retained').catch(() => {});
const filter = mountMainFilter(get, (id, value) => set(paths[id], value), {
  filterMode: 0,
  filterCutoff: 1,
  filterResonance: 2,
});
const level = mountCompactSlider(get('level'), {
  label: 'Output level',
  min: 0,
  max: 2,
  step: 0.01,
  value: 0.65,
  style: { colour: '#a78bfa', bg: '#1e1b33' },
});
level.onChange((value) => set('/plugin/params/level', value));
gesture.subscribe(({ graph }) => {
  const value = (path) => {
    const e = graph.endpoints.find((e) => e.path === path);
    return (
      e && graph.signal.initialParameters.find((p) => p.nodeId === e.nodeId && p.id === e.id)?.value
    );
  };
  filter.sync({
    mode: value(paths[0]),
    cutoff: value(paths[1]),
    resonance: value(paths[2]),
  });
  if (value('/plugin/params/level') !== undefined) {
    get('level').hidden = false;
    level.setValue(value('/plugin/params/level'));
    level.paint();
  }
});
get('start').onclick = async () => {
  try {
    const context = new AudioContext();
    await context.resume();
    host = new BrowserGraphHost(context, { execution: 'prepared' });
    await host.prepare(runtime.project);
    const oscillator = context.createOscillator();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = 110;
    const monitor = context.createGain();
    monitor.gain.value = 0.12;
    monitor.connect(context.destination);
    host.connect(oscillator, monitor);
    oscillator.start();
    get('start').disabled = true;
    get('status').textContent = 'Running';
  } catch (error) {
    get('status').textContent = error.message;
  }
};
get('add').onclick = async () => {
  const edited = source
    .replace(
      'graph.connect(filter.output("out"), graph.output.input("in"));',
      `
const level = graph.add("gain", {id:6});
graph.registerInstance("/plugin/output-level",level);
graph.setParameter(level,0,.65);
graph.registerParameter("/plugin/params/level",level,0,{min:0,max:2,default:.65});
graph.connect(filter.output("out"),level.input("audio"));
graph.connect(level.output("out"),graph.output.input("in"));`,
    )
    .replace(
      '// JS-authored immediate GUI',
      'view.push({id:"level",type:"parameter",path:"/plugin/params/level",label:"Output level"});\n// JS-authored immediate GUI',
    )
    .replace(
      'ui.filterResponse();',
      'ui.filterResponse();\n  ui.parameter("/plugin/params/level",{label:"Output level"});',
    );
  await request({
    operation: 'source.apply',
    source: edited,
    expectedRevision: runtime.revision,
  }).catch(() => {});
};
get('save').onclick = async () => {
  const project = await runtime.request({ operation: 'project.save' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }),
  );
  link.href = url;
  link.download = 'Filter.manifold.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
window.manifoldConsumer = {
  runtime,
  get host() {
    return host;
  },
};
