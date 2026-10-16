import { BrowserGraphHost } from '@manifold/author/browser';
import { instantiateProjectPackage, readProjectPackage, saveProjectPackage } from '@manifold/author/package';

const element = id => document.getElementById(id);
let context = null;
let host = null;
let oscillator = null;
let packaged = null;
let controller = null;
let analyser = null;
let meterFrame = 0;
let meterSamples = null;
let sourceLevel = null;
const execution = new URLSearchParams(location.search).get('execution') === 'prepared' ? 'prepared' : 'worker';

// The review page leaves the same public host/controller objects accessible to
// a user's console or agent, so scripted edits can be inspected interactively.
Object.defineProperty(window, 'manifoldProject', { configurable: true, value: Object.freeze({
  Host: BrowserGraphHost,
  get host() { return host; },
  get context() { return context; },
  get source() { return sourceLevel; },
  get controller() { return controller; },
  get package() { return packaged; },
}) });

function updateMeter() {
  if (!analyser || !meterSamples) return;
  analyser.getFloatTimeDomainData(meterSamples);
  let energy = 0;
  for (const sample of meterSamples) energy += sample * sample;
  element('audio-level').textContent = `${Math.sqrt(energy / meterSamples.length).toFixed(4)} RMS`;
  const diagnostics = host?.diagnostics;
  element('bridge-health').textContent = diagnostics
    ? diagnostics.execution === 'prepared'
      ? `${diagnostics.rustProcessingFailures} DSP failures · ${diagnostics.rustCallbackAllocations} Rust callback allocations · ${diagnostics.audioBlocks} blocks`
      : `${diagnostics.underruns} missed / ${diagnostics.audioBlocks} blocks` : '—';
  if (host && !host.ready) show('Graph audio stopped');
  meterFrame = requestAnimationFrame(updateMeter);
}

function show(message) { element('status').textContent = message; }
function project() { return controller?.toProject() ?? packaged?.state; }

function render() {
  const state = project();
  element('identity').textContent = packaged
    ? `${packaged.packageId}@${packaged.packageVersion} · ${state.signal.nodes.length} graph nodes`
    : '';
  element('document').textContent = packaged
    ? JSON.stringify({ packageId: packaged.packageId, packageVersion: packaged.packageVersion,
      controllerSha256: packaged.control.sha256, state }, null, 2)
    : '';
  const container = element('parameters');
  container.replaceChildren();
  for (const endpoint of state?.endpoints ?? []) {
    const row = document.createElement('label');
    row.className = 'parameter';
    const name = document.createElement('span');
    name.textContent = endpoint.path;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(endpoint.min);
    slider.max = String(endpoint.max);
    slider.step = 'any';
    slider.value = String(state.signal.initialParameters.find(entry =>
      entry.nodeId === endpoint.nodeId && entry.id === endpoint.id)?.value ?? endpoint.default);
    slider.disabled = typeof controller?.set !== 'function';
    const value = document.createElement('output');
    value.textContent = slider.value;
    slider.addEventListener('change', async () => {
      slider.disabled = true;
      try {
        await controller.set(endpoint.path, Number(slider.value));
        render();
        show(`Published ${endpoint.path} = ${slider.value}`);
      } catch (error) { show(`Edit rejected: ${error.message}`); slider.disabled = false; }
    });
    row.append(name, slider, value);
    container.append(row);
  }
  for (const control of state?.controls ?? []) {
    if (!control.path.endsWith('/select')) continue;
    const button = document.createElement('button');
    button.className = 'secondary';
    button.textContent = `${control.path.split('/').at(-2)}: ${control.value ? 'Width' : 'Gain'}`;
    button.disabled = typeof controller?.set !== 'function';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await controller.set(control.path, control.value ? 0 : 1);
        render();
        show(`Published ${control.path} = ${control.value ? 0 : 1}`);
      } catch (error) { show(`Edit rejected: ${error.message}`); button.disabled = false; }
    });
    container.append(button);
  }
  element('bypass').disabled = typeof controller?.routeOutput !== 'function';
  element('distortion').disabled = typeof controller?.setDistortion !== 'function';
  element('distortion').textContent = state?.instances?.some(item => item.path === '/dsp/live/nodes/distortion')
    ? 'Remove distortion' : 'Insert distortion';
  element('download').disabled = !controller;
  element('automate').disabled = !controller || typeof controller.synchronizeParameters !== 'function';
  element('host-gain').disabled = element('automate').disabled;
}

async function stop() {
  cancelAnimationFrame(meterFrame);
  analyser = null;
  sourceLevel = null;
  meterSamples = null;
  element('audio-level').textContent = '—';
  element('bridge-health').textContent = '—';
  oscillator?.stop();
  oscillator = null;
  await host?.close();
  host = null;
  await context?.close();
  context = null;
  controller = null;
  element('stop').disabled = true;
  render();
}

async function start(packageData) {
  await stop();
  packaged = await readProjectPackage(packageData);
  context = new AudioContext();
  host = new BrowserGraphHost(context, { execution });
  try {
    const loaded = await instantiateProjectPackage(packaged, {
      readPublishedParameters: () => host.readPublishedParameters(),
      setParameter: edit => host.setParameter(edit),
      setParameterBatch: edits => host.setParameterBatch(edits),
      sendEvent: event => host.sendEvent(event),
      setRoute: route => host.setRoute(route),
      replaceGraph: graph => host.replaceGraph(graph),
    });
    controller = loaded.controller;
    if (execution === 'prepared') await context.resume();
    await host.prepare(controller.toProject());
    oscillator = context.createOscillator();
    oscillator.frequency.value = 220;
    const level = context.createGain();
    sourceLevel = level;
    level.gain.value = 0.08;
    oscillator.connect(level);
    analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    meterSamples = new Float32Array(analyser.fftSize);
    host.connect(level, analyser);
    analyser.connect(context.destination);
    oscillator.start();
    await context.resume();
    updateMeter();
    element('stop').disabled = false;
    render();
    show(`Running ${packaged.packageId} from its package`);
  } catch (error) {
    await stop();
    show(`Package load failed: ${error.message}`);
  }
}

element('load').addEventListener('click', async () => {
  const name = element('example').value;
  try {
    const response = await fetch(element('example').selectedOptions[0].dataset.url ?? `/packages/${name}.manifold.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await start(await response.text());
  } catch (error) { show(`Package load failed: ${error.message}`); }
});

const selectedExample = new URLSearchParams(location.search).get('example');
if ([...element('example').options].some(option => option.value === selectedExample)) {
  element('example').value = selectedExample;
}
element('stop').addEventListener('click', () => { stop().then(() => show('Stopped')); });
element('bypass').addEventListener('click', async () => {
  try {
    await controller.routeOutput('/dsp/live/nodes/input_trim');
    render();
    show('Published the authored output route');
  } catch (error) { show(`Route rejected: ${error.message}`); }
});
element('distortion').addEventListener('click', async () => {
  const enabled = !project()?.instances?.some(item => item.path === '/dsp/live/nodes/distortion');
  try {
    await controller.setDistortion(enabled);
    render();
    show(`Published ${enabled ? 'distortion insertion' : 'distortion removal'}`);
  } catch (error) { show(`Graph edit rejected: ${error.message}`); }
});
element('host-gain').addEventListener('input', () => {
  element('host-gain-value').textContent = element('host-gain').value;
});
element('automate').addEventListener('click', async () => {
  element('automate').disabled = true;
  try {
    const endpoint = project().endpoints.find(endpoint => endpoint.path.endsWith('/input_gain'));
    if (!endpoint) throw new Error('This package has no input gain endpoint');
    const value = Number(element('host-gain').value);
    await host.setParameter({ nodeId: endpoint.nodeId, id: endpoint.id, value });
    await controller.synchronizeParameters();
    render();
    element('automation-status').textContent = `Host accepted ${value}; script and saved graph synchronized.`;
  } catch (error) { show(`Automation rejected: ${error.message}`); render(); }
});

element('download').addEventListener('click', async () => {
  await controller.synchronizeParameters?.();
  render();
  const bytes = JSON.stringify(saveProjectPackage(packaged, controller.toProject()));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${packaged.packageId}.manifold.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
element('import').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  await start(await file.text());
});

render();
