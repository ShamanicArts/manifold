import { BrowserGraphHost } from '@manifold/author/browser';
import { buildGraph, createProject } from '@manifold/author/examples/fx-slot-swap';

const $ = id => document.getElementById(id);
const initial = buildGraph().toProject();
let context = null;
let host = null;
let sources = [];
let busy = false;

function displayProject(project) {
  $('project').textContent = JSON.stringify(project, null, 2);
  $('instances').replaceChildren(...(project.instances ?? []).map(instance => {
    const item = document.createElement('li');
    item.textContent = `${instance.path} → node ${instance.nodeId}`;
    return item;
  }));
}

function controls() {
  $('gain').disabled = busy;
  $('width').disabled = busy;
  $('stop').disabled = busy || !host;
}

async function stop() {
  for (const source of sources) source.stop();
  sources = [];
  host?.close();
  host = null;
  await context?.close();
  context = null;
  controls();
}

async function start(widthSelected) {
  if (busy) return;
  busy = true;
  controls();
  $('status').textContent = 'Preparing authored Rust/Wasm graph…';
  try {
    await stop();
    const project = createProject({ setRoute: () => {}, setParameter: () => {}, replaceGraph: () => true });
    if (widthSelected) {
      await project.set('/test/fxslot/slotA/width/amount', 1.9);
      await project.set('/test/fxslot/slotA/select', 1);
    }
    const document = project.toProject();
    context = new AudioContext();
    host = new BrowserGraphHost(context);
    await host.prepare(document);
    const stereo = context.createChannelMerger(2);
    for (const [channel, frequency] of [220, 330].entries()) {
      const source = context.createOscillator();
      const level = context.createGain();
      source.frequency.value = frequency;
      level.gain.value = 0.12;
      source.connect(level);
      level.connect(stereo, 0, channel);
      source.start();
      sources.push(source);
    }
    host.connect(stereo);
    await context.resume();
    displayProject(document);
    $('status').textContent = widthSelected
      ? 'Running: width instance in slot A, gain in slot B. Saved selection and inactive gain state are visible below.'
      : 'Running: gain in both slots. Width instances have not been created.';
  } catch (error) {
    await stop();
    $('status').textContent = `Could not start: ${error.message}`;
  } finally {
    busy = false;
    controls();
  }
}

$('gain').addEventListener('click', () => start(false));
$('width').addEventListener('click', () => start(true));
$('stop').addEventListener('click', async () => { await stop(); $('status').textContent = 'Stopped.'; });
displayProject(initial);
controls();
