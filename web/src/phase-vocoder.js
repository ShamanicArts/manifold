import { BrowserGraphHost } from '@manifold/author/browser';
import { createProject } from '@manifold/author/examples/phase-vocoder-chain';

const $ = id => document.getElementById(id);
let context = null;
let host = null;
let busy = false;
const project = createProject({
  setRoute: route => host.setRoute(route),
  setParameter: edit => host.setParameter(edit),
});

function display() {
  const state = project.toProject();
  $('project').textContent = JSON.stringify(state, null, 2);
  const pitch = state.signal.initialParameters.find(entry => entry.nodeId === 5 && entry.id === 1).value;
  const mix = state.signal.initialParameters.find(entry => entry.nodeId === 5 && entry.id === 3).value;
  $('pitch').value = String(pitch);
  $('pitch-value').textContent = `${pitch >= 0 ? '+' : ''}${pitch} st`;
  $('mix').value = String(mix);
  $('mix-value').textContent = `${Math.round(mix * 100)}%`;
}

function controls() {
  $('start').disabled = busy || Boolean(host);
  for (const id of ['stop', 'pitch', 'mix']) $(id).disabled = busy || !host;
}

$('start').addEventListener('click', async () => {
  if (busy || host) return;
  busy = true; controls();
  $('status').textContent = 'Preparing the authored graph…';
  try {
    context = new AudioContext();
    host = new BrowserGraphHost(context);
    await host.prepare(project.toProject());
    const monitor = context.createGain();
    monitor.gain.value = 0.25;
    monitor.connect(context.destination);
    host.connect(null, monitor);
    await context.resume();
    $('status').textContent = 'Running. Pitch and mix edits are acknowledged by the Rust/Wasm graph.';
  } catch (error) {
    host?.close(); host = null;
    await context?.close(); context = null;
    $('status').textContent = `Could not start: ${error.message}`;
  } finally { busy = false; controls(); }
});

for (const [id, path] of [['pitch', '/sample/voice/pitch'], ['mix', '/sample/voice/mix']]) {
  $(id).addEventListener('change', async event => {
    if (busy || !host) return;
    busy = true; controls();
    try {
      await project.set(path, Number(event.target.value));
      display();
      $('status').textContent = `${id === 'pitch' ? 'Pitch' : 'Wet mix'} accepted and saved.`;
    } catch (error) {
      display();
      $('status').textContent = `Edit rejected: ${error.message}`;
    } finally { busy = false; controls(); }
  });
}

$('stop').addEventListener('click', async () => {
  if (busy || !host) return;
  busy = true; controls();
  host.close(); host = null;
  await context.close(); context = null;
  busy = false; controls();
  $('status').textContent = 'Stopped. Accepted settings are retained.';
});

display();
controls();
