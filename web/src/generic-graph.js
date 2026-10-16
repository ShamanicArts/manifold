import { BrowserGraphHost } from '@manifold/author/browser';
import { buildGraph, createProject } from '@manifold/author/examples/dsp-live-scripting';

const $ = id => document.getElementById(id);
let context = null;
let host = null;
let project = null;
let bypassed = false;
let busy = false;
const initial = buildGraph().toProject();
const controlsByPath = new Map();

for (const endpoint of initial.endpoints ?? []) {
  const label = window.document.createElement('label');
  label.append(endpoint.path.split('/').at(-1).replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase()));
  const input = window.document.createElement('input');
  input.type = 'range';
  input.min = String(endpoint.min);
  input.max = String(endpoint.max);
  input.step = '0.01';
  input.value = String(endpoint.default);
  input.dataset.path = endpoint.path;
  const output = window.document.createElement('output');
  output.dataset.path = endpoint.path;
  controlsByPath.set(endpoint.path, { input, output });
  label.append(input, output);
  $('parameter-controls').append(label);
  input.addEventListener('input', async () => {
    paint();
    if (!host) return;
    try { await project.set(endpoint.path, Number(input.value)); paint(); }
    catch (error) { status(`Edit rejected: ${error.message}`); }
  });
}

function paint() {
  const document = project?.toProject() ?? initial;
  $('project').textContent = JSON.stringify(document, null, 2);
  $('endpoints').replaceChildren(...(document.endpoints ?? []).map(endpoint => {
    const item = window.document.createElement('li');
    const slot = document.hostBindings?.find(binding =>
      binding.nodeId === endpoint.nodeId && binding.id === endpoint.id)?.slot;
    item.textContent = `${endpoint.path} → node ${endpoint.nodeId}, parameter ${endpoint.id} (${endpoint.min}–${endpoint.max})${slot === undefined ? '' : ` · host slot ${slot + 1}`}`;
    return item;
  }));
  $('instances').replaceChildren(...(document.instances ?? []).map(instance => {
    const item = window.document.createElement('li');
    const node = document.signal.nodes.find(node => node.id === instance.nodeId);
    item.textContent = `${instance.path} → ${node?.type ?? 'missing node'} ${instance.nodeId}`;
    return item;
  }));
  for (const { input, output } of controlsByPath.values()) {
    output.value = Number(input.value).toFixed(2);
  }
}
function status(message) { $('status').textContent = message; }
function controls() {
  $('start').disabled = Boolean(host) || busy;
  $('stop').disabled = !host || busy;
  $('bypass').disabled = !host || busy;
}

$('start').addEventListener('click', async () => {
  if (host || busy) return;
  busy = true; controls(); status('Preparing Rust/Wasm graph…');
  let prepared = null;
  try {
    bypassed = false;
    $('bypass').textContent = 'Bypass widener';
    for (const endpoint of initial.endpoints ?? []) {
      controlsByPath.get(endpoint.path).input.value = String(endpoint.default);
    }
    context = new AudioContext();
    prepared = new BrowserGraphHost(context);
    project = createProject(prepared);
    await prepared.prepare(project.toProject());
    const left = context.createOscillator();
    const right = context.createOscillator();
    left.frequency.value = 220;
    right.frequency.value = 330;
    const source = context.createChannelMerger(2);
    const leftLevel = context.createGain();
    const rightLevel = context.createGain();
    leftLevel.gain.value = 0.15;
    rightLevel.gain.value = 0.15;
    left.connect(leftLevel);
    right.connect(rightLevel);
    leftLevel.connect(source, 0, 0);
    rightLevel.connect(source, 0, 1);
    prepared.connect(source);
    left.start(); right.start();
    await context.resume();
    host = prepared;
    status('Graph running: external stereo → gain → widener → output. Route and parameter edits are acknowledged.');
  } catch (error) {
    prepared?.close();
    project = null;
    await context?.close();
    context = null; host = null;
    status(`Could not start: ${error.message}`);
  } finally { busy = false; controls(); paint(); }
});

$('stop').addEventListener('click', async () => {
  host?.close(); host = null;
  await context?.close(); context = null;
  status('Graph stopped. The authored project remains inspectable.');
  controls();
});

$('bypass').addEventListener('click', async () => {
  if (!project || busy) return;
  busy = true; controls();
  try {
    if (!bypassed) await project.session.route({ to: 3, input: 'in', from: 4, output: 'out' });
    else await project.session.route({ to: 3, input: 'in', from: 5, output: 'out' });
    bypassed = !bypassed;
    $('bypass').textContent = bypassed ? 'Reconnect widener' : 'Bypass widener';
    status(bypassed ? 'Output now receives gain directly.' : 'Output receives the widener again.');
    paint();
  } catch (error) { status(`Route rejected: ${error.message}`); }
  finally { busy = false; controls(); }
});

$('download').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(project?.toProject() ?? buildGraph().toProject(), null, 2)], { type: 'application/json' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = 'manifold-dsp-live-scripting.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
});

paint();
