import { BrowserGraphHost } from '@manifold/author/browser';
import { createProject } from '@manifold/author/examples/rack-oscillator';

const $ = id => document.getElementById(id);
const base = '/midi/synth/rack/osc/1';
const fields = [
  ['waveform', `${base}/waveform`], ['driveShape', `${base}/driveShape`],
  ['drive', `${base}/drive`], ['manualPitch', `${base}/manualPitch`],
  ['unison', `${base}/unison`], ['detune', `${base}/detune`], ['spread', `${base}/spread`],
  ['renderMode', `${base}/renderMode`], ['additivePartials', `${base}/additivePartials`],
  ['additiveTilt', `${base}/additiveTilt`], ['additiveDrift', `${base}/additiveDrift`],
  ['manualLevel', `${base}/manualLevel`],
  ['voicePitch', `${base}/voice/1/vOct`], ['voiceGate', `${base}/voice/1/gate`],
];
let context;
let host;
let busy = false;
const prepared = new URLSearchParams(location.search).get('execution') === 'prepared';
const project = createProject({
  setRoute: route => host.setRoute(route),
  setParameter: edit => host.setParameter(edit),
  setParameterBatch: edits => host.setParameterBatch(edits),
  replaceGraph: graph => host.replaceGraph(graph),
  readPublishedParameters: () => host.readPublishedParameters(),
});

function display() {
  const saved = project.toProject();
  $('project').textContent = JSON.stringify(saved, null, 2);
  for (const [id, path] of fields) {
    const value = saved.controls.find(control => control.path === path).value;
    $(id).value = String(value);
    const output = $(`${id}-value`);
    if (output) output.textContent = id.endsWith('Level') || id.endsWith('Gate')
      ? `${Math.round(value * 100)}%` : String(value);
  }
}
function enabled() {
  $('start').disabled = busy || Boolean(host);
  $('stop').disabled = busy || !host;
  $('insert').disabled = busy || !host || !prepared;
  for (const [id] of fields) $(id).disabled = busy || !host;
}
$('start').addEventListener('click', async () => {
  if (busy || host) return;
  for (const player of document.querySelectorAll('audio')) player.pause();
  busy = true; enabled();
  $('status').textContent = 'Preparing nine oscillator nodes…';
  try {
    context = new AudioContext();
    host = new BrowserGraphHost(context, { execution: prepared ? 'prepared' : 'worklet' });
    await host.prepare(project.toProject());
    const monitor = context.createGain();
    monitor.gain.value = 0.3;
    monitor.connect(context.destination);
    host.connect(null, monitor);
    await context.resume();
    $('status').textContent = 'Running. Raise manual level or voice gate to audition.';
  } catch (error) {
    await host?.close(); host = null;
    await context?.close(); context = null;
    $('status').textContent = `Could not start: ${error.message}`;
  } finally { busy = false; enabled(); }
});
$('stop').addEventListener('click', async () => {
  if (busy || !host) return;
  busy = true; enabled();
  await host.close(); host = null;
  await context.close(); context = null;
  busy = false; enabled();
  $('status').textContent = 'Stopped. Last accepted project state retained.';
});
for (const [id, path] of fields) $(id).addEventListener('change', async event => {
  if (busy || !host) return;
  busy = true; enabled();
  try {
    await project.set(path, Number(event.target.value));
    display();
    $('status').textContent = `${id} accepted and saved.`;
  } catch (error) {
    display();
    $('status').textContent = `${id} rejected: ${error.message}`;
  } finally { busy = false; enabled(); }
});
$('insert').addEventListener('click', async () => {
  if (busy || !host || !prepared) return;
  busy = true; enabled();
  try {
    await project.session.transaction(graph => {
      const path = `${base}/nodes/insert`, existing = graph.findInstance(path);
      const output = graph.findInstance(`${base}/nodes/output`);
      graph.disconnect(graph.output.input('in'));
      if (existing) { graph.remove(existing); graph.connect(output.output('out'), graph.output.input('in')); }
      else {
        const distortion = graph.add('distortion', { id: 22 });
        graph.registerInstance(path, distortion);
        graph.setParameter(distortion, 0, 4); graph.setParameter(distortion, 1, .4);
        graph.connect(output.output('out'), distortion.input('audio'));
        graph.connect(distortion.output('out'), graph.output.input('in'));
      }
    });
    display(); $('status').textContent = 'Live insert changed; authored oscillator instances retained.';
  } catch (error) { $('status').textContent = `Insert rejected: ${error.message}`; }
  finally { busy = false; enabled(); }
});
window.manifoldRackOscillator = { project, createProject, Host: BrowserGraphHost,
  get host() { return host; }, get context() { return context; } };
for (const player of document.querySelectorAll('audio')) player.addEventListener('play', () => {
  for (const other of document.querySelectorAll('audio')) if (other !== player) other.pause();
});
display(); enabled();
