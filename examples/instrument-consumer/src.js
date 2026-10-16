import { mountCustomView } from '@manifold/ui-web/custom-view';
// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import { HostServices, ProjectServices } from '@manifold/author/host-services';
import { BrowserGraphHost } from '@manifold/author/browser';
import { LiveProjectRuntime } from '@manifold/author/live-project';
import { source } from '@manifold/author/examples/standalone-oscillator';
import { programs, getProgram } from '@manifold/author/examples/primitive-library';
import { source as mainWaveSource } from '@manifold/author/examples/main-wave-creator';
import { mountProjectView } from '@manifold/ui-web/project-view';
import { createParameterGesture } from '@manifold/ui-web/parameter-gesture';
import { AuthoredMidiInput } from '@manifold/author/midi-control';
import '@manifold/ui-web/project-view.css';
const get = (id) => document.getElementById(id);
const query = new URLSearchParams(location.search);
const primitive = query.has('program') ? getProgram(query.get('program')) : null;
const mainWave = query.get('project') === 'main-wave';
const authoredSource = primitive ? primitive.source : mainWave ? mainWaveSource : source;
for (const program of programs)
  get('product').append(new Option('DSP: ' + program.label, 'primitive:' + program.id));
get('product').value = primitive
  ? 'primitive:' + primitive.id
  : mainWave
    ? 'main-wave'
    : 'oscillator';
get('product').onchange = () => {
  const value = get('product').value;
  location.search = value.startsWith('primitive:')
    ? '?program=' + value.slice(10)
    : value === 'main-wave'
      ? '?project=main-wave'
      : '';
};
if (primitive) {
  document.querySelector('h1').textContent = 'Manifold imported ' + primitive.label;
  get('description').textContent = primitive.description;
  get('status').textContent = 'Start audio and change the authored graph controls.';
  for (const id of ['midi-connect', 'midi-input', 'midi-status']) get(id).hidden = true;
  get('input-row').hidden = false;
}

if (mainWave) {
  document.querySelector('h1').textContent = 'Manifold imported Main Wave';
  get('description').textContent =
    'Main’s eight authored Wave voices, core envelopes and signal branches.';
}
let host, context, outputStream, sourceNode, monitor;
const runtime = new LiveProjectRuntime(
  {
    get ready() {
      return host?.ready ?? false;
    },
    setParameter: (edit) => host.setParameter(edit),
    setParameterBatch: (edits) => host.setParameterBatch(edits),
    replaceGraph: (project) => host.replaceGraph(project),
    readPublishedParameters: () => host.readPublishedParameters(),
  },
  authoredSource,
);
const onError = (error) => {
  get('status').textContent = error.message;
};
const request = async (command) => {
  const result = await runtime.request(command);
  get('status').textContent = `Revision ${runtime.revision} accepted`;
  return result;
};
const gesture = createParameterGesture(runtime, request, onError);
mountProjectView(get('instrument'), gesture, {
  request: (command) =>
    ['parameter.set', 'control.set'].includes(command.operation)
      ? gesture.set(command.path, command.value, command.origin, command.operation)
      : request(command),
  onError,
});
if (runtime.snapshot().webView) {
  const surface = document.createElement('div');
  surface.id = 'custom-view';
  get('instrument').after(surface);
  mountCustomView(surface, runtime.snapshot().webView, gesture, {
    modules: {three:{version:'0.184.0',load:()=>import('three')}},
    request: command => command.operation === 'parameter.set'
      ? gesture.set(command.path,command.value,command.origin)
      : request(command),
    onError,
  }).then(view => window.addEventListener('pagehide',()=>view.dispose(),{once:true})).catch(onError);
}
get('source').textContent = authoredSource;
get('input-kind').value = runtime.project.signal.inputSource === 'external' ? 'noise' : 'none';
function connectInput() {
  sourceNode?.stop?.();
  const kind = get('input-kind').value;
  sourceNode = null;
  if (kind === 'saw') {
    sourceNode = context.createOscillator();
    sourceNode.type = 'sawtooth';
    sourceNode.frequency.value = 110;
    sourceNode.start();
  } else if (kind === 'noise') {
    const b = context.createBuffer(2, context.sampleRate * 2, context.sampleRate);
    for (let c = 0; c < 2; c++) {
      const values = b.getChannelData(c);
      for (let i = 0; i < values.length; i++) values[i] = (Math.random() * 2 - 1) * 0.2;
    }
    sourceNode = context.createBufferSource();
    sourceNode.buffer = b;
    sourceNode.loop = true;
    sourceNode.start();
  }
  host.connect(sourceNode, monitor);
}
get('input-kind').onchange = () => {
  if (host?.ready) connectInput();
};
get('start').onclick = async () => {
  try {
    context = new AudioContext();
    await context.resume();
    host = new BrowserGraphHost(context, { execution: 'prepared' });
    await host.prepare(runtime.project);
    monitor = context.createGain();
    monitor.gain.value = 0.25;
    monitor.connect(context.destination);
    if (primitive) connectInput();
    else host.connect(null, monitor);
    const capture = context.createMediaStreamDestination();
    monitor.connect(capture);
    outputStream = capture.stream;
    get('start').disabled = true;
    get('stop').disabled = false;
    get('status').textContent = primitive
      ? 'Running · change the authored graph controls'
      : 'Running · focus keyboard and play';
  } catch (error) {
    host?.close();
    await context?.close();
    host = null;
    context = null;
    onError(error);
  }
};
get('stop').onclick = async () => {
  if (runtime.snapshot().eventStateSchema)
    await request({ operation: 'event.send', event: { type: 'panic' } });
  sourceNode?.stop?.();
  await host?.close();
  await context?.close();
  host = null;
  context = null;
  get('start').disabled = false;
  get('stop').disabled = true;
  get('status').textContent = 'Stopped';
};
window.manifoldInstrument = Object.freeze({
  runtime,
  request,
  get host() {
    return host;
  },
  get outputStream() {
    return outputStream;
  },
  get audioSink() {
    return context?.sinkId?.type ?? context?.sinkId ?? null;
  },
});
const midi = new AuthoredMidiInput(
  (event) => request({ operation: 'event.send', event, origin: 'midi' }),
  (message) => {
    get('midi-status').textContent = message;
    refreshMidi();
  },
);
function refreshMidi() {
  get('midi-input').replaceChildren(new Option('Choose MIDI input', ''));
  for (const port of midi.inputs())
    get('midi-input').append(new Option(port.name ?? 'MIDI input', port.id));
  get('midi-input').value = midi.input?.id ?? '';
}
get('midi-connect').onclick = async () => {
  try {
    await midi.connect();
    refreshMidi();
    get('midi-status').textContent = 'MIDI access granted · choose an input';
  } catch (e) {
    get('midi-status').textContent = e.message;
  }
};
get('midi-input').onchange = () =>
  midi.select(get('midi-input').value || null).catch((e) => {
    get('midi-status').textContent = e.message;
    refreshMidi();
  });

let services;
get('network').hidden = !runtime.snapshot().network;
get('network-connect').onclick = async () => {
  try {
    get('network-connect').disabled = true;
    services = await new ProjectServices(runtime, new HostServices(), (state) => {
      get('network-status').textContent =
        `${state.connected ? 'Connected' : 'Disconnected'} · received ${state.received} · sent ${state.sent}${state.error ? ' · ' + state.error : ''}`;
      get('network-addresses').textContent = Object.entries(state.resources)
        .map(([name, socket]) => `${name}: ${socket.address}`)
        .join('\n');
    }).start();
    get('network-disconnect').disabled = false;
  } catch (error) {
    get('network-connect').disabled = false;
    onError(error);
  }
};
get('network-disconnect').onclick = async () => {
  await services?.close();
  services = null;
  get('network-connect').disabled = false;
  get('network-disconnect').disabled = true;
};
addEventListener('pagehide', () => services?.close());
