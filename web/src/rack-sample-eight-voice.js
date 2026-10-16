import { GraphWorkspace, createLiveGraphSession } from '@manifold/author';
import { BrowserGraphHost } from '@manifold/author/browser';
import { createProject, VOICES } from '@manifold/author/examples/rack-sample-eight-voice';
import { SAMPLE_BASE } from '@manifold/author/examples/sample-voice-chain';
import fixture from '../../projects/graph-workspace/authored-rack-sample-eight-voice.json';

const $ = id => document.getElementById(id);
let context = null;
let host = null;
let busy = false;
let analyser = null;
let meterSamples = null;
let meterFrame = 0;
let peakRms = 0;
let inserted = false, replaced = false;
const execution = new URLSearchParams(location.search).get('execution') ?? 'prepared';
const adapters = {
  setRoute: route => host.setRoute(route), setParameter: edit => host.setParameter(edit),
  setParameterBatch: edits => host.setParameterBatch(edits), sendEvent: event => host.sendEvent(event),
};
function openProject(document) {
  const graph=GraphWorkspace.fromProject(document);
  const session=createLiveGraphSession(graph,adapters.setRoute,adapters.setParameter,
    state => host.replaceGraph(state),adapters.setParameterBatch,()=>host?.ready ? host.readPublishedParameters() : []);
  return createProject(adapters,graph,session);
}
let project = openProject(fixture);
Object.defineProperty(window, 'manifoldRackSample', { configurable: true, value: Object.freeze({
  get host() { return host; },
  get controller() { return project; },
  Host: BrowserGraphHost, GraphWorkspace, createLiveGraphSession, createProject, fixture,
  get context() { return context; },
  get peakRms() { return peakRms; },
}) });

for (let voice = 1; voice <= VOICES; voice++) {
  const card = document.createElement('div');
  card.className = 'voice';
  card.innerHTML = `<strong>Voice ${voice}</strong>
    <label>Gate <input id="gate-${voice}" type="range" min="0" max="1" step="0.01" value="0" disabled></label>
    <label>Pitch <input id="pitch-${voice}" type="range" min="48" max="72" step="1" value="60" disabled></label>`;
  $('voices').append(card);
}

function display() {
  const state = project.toProject();
  const values = new Map(state.controls.map(entry => [entry.path, entry.value]));
  for (let voice = 1; voice <= VOICES; voice++) {
    $(`gate-${voice}`).value = String(values.get(`${SAMPLE_BASE}/voice/${voice}/gate`));
    $(`pitch-${voice}`).value = String(values.get(`${SAMPLE_BASE}/voice/${voice}/vOct`));
  }
  $('unison').value = String(values.get(`${SAMPLE_BASE}/unison`));
  $('mode').value = String(values.get(`${SAMPLE_BASE}/pitchMode`));
  $('project').textContent = JSON.stringify({ ...state,
    assets: state.assets.map(({ pcmF32Base64: _pcm, ...metadata }) =>
      ({ ...metadata, pcm: 'embedded in downloaded project' })) }, null, 2);
}

function controls() {
  $('start').disabled = busy || Boolean(host);
  $('stop').disabled = busy || !host;
  for (const id of ['mode','unison','insert','replace']) $(id).disabled = busy || !host;
  $('load').disabled = busy || Boolean(host);
  $('download').disabled = busy;
  for (let voice = 1; voice <= VOICES; voice++) {
    $(`gate-${voice}`).disabled = busy || !host;
    $(`pitch-${voice}`).disabled = busy || !host;
  }
}

function updateMeter() {
  if (!analyser || !host || !meterSamples) return;
  analyser.getFloatTimeDomainData(meterSamples);
  let energy = 0;
  for (const sample of meterSamples) energy += sample * sample;
  const rms = Math.sqrt(energy / meterSamples.length);
  peakRms = Math.max(peakRms, rms);
  const health = host.diagnostics;
  $('diagnostics').textContent = JSON.stringify(health,null,2);
  $('meter').textContent = `${rms.toFixed(4)} RMS · peak ${peakRms.toFixed(4)} · `
    + (health.execution === 'prepared'
      ? `${health.rustProcessedBlocks} Rust blocks · ${health.rustProcessingFailures} processing failures`
      : `${health.underruns ?? 0} missed / ${health.audioBlocks ?? 0} blocks`);
  if (!host.ready) $('status').textContent = 'Graph audio worker stopped';
  meterFrame = requestAnimationFrame(updateMeter);
}

$('start').addEventListener('click', async () => {
  if (busy || host) return;
  busy = true; controls();
  $('status').textContent = 'Preparing eight public voice chains…';
  try {
    context = new AudioContext();
    host = new BrowserGraphHost(context, { execution });
    await host.prepare(project.toProject());
    const monitor = context.createGain();
    monitor.gain.value = 0.5;
    monitor.connect(context.destination);
    analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    meterSamples = new Float32Array(analyser.fftSize);
    peakRms = 0;
    if (execution !== 'prepared') analyser.connect(monitor);
    host.connect(null, analyser);
    await context.resume();
    await project.activate();
    updateMeter();
    $('status').textContent = 'Running. Raise any gate to play its voice.';
  } catch (error) {
    await host?.close(); host = null;
    cancelAnimationFrame(meterFrame);
    analyser = null; meterSamples = null;
    await context?.close(); context = null;
    $('status').textContent = `Could not start: ${error.message}`;
  } finally { busy = false; controls(); }
});

async function edit(path, value, label) {
  if (busy || !host) return;
  busy = true; controls();
  try {
    await project.set(path, value);
    display();
    $('status').textContent = `${label} accepted and saved.`;
  } catch (error) {
    display();
    $('status').textContent = `Edit rejected: ${error.message}`;
  } finally { busy = false; controls(); }
}

for (let voice = 1; voice <= VOICES; voice++) {
  for (const [control, label] of [['gate', 'Gate'], ['pitch', 'Pitch']]) {
    $(`${control}-${voice}`).addEventListener('change', event => edit(
      `${SAMPLE_BASE}/voice/${voice}/${control === 'pitch' ? 'vOct' : 'gate'}`,
      Number(event.target.value), `Voice ${voice} ${label}`));
  }
}
$('mode').addEventListener('change', event => edit(
  `${SAMPLE_BASE}/pitchMode`, Number(event.target.value), 'Pitch mode'));

$('stop').addEventListener('click', async () => {
  if (busy || !host) return;
  busy = true; controls();
  cancelAnimationFrame(meterFrame);
  analyser = null; meterSamples = null;
  $('diagnostics').textContent = JSON.stringify(host.diagnostics,null,2);
  $('meter').textContent = '—';
  await host.close(); host = null;
  await context.close(); context = null;
  busy = false; controls();
  $('status').textContent = 'Stopped. Accepted settings are retained.';
});

$('unison').addEventListener('change', event => edit(`${SAMPLE_BASE}/unison`,Number(event.target.value),'Unison'));
async function structural(operation,message) {
  if (busy || !host) return; busy=true; controls();
  try { await project.session.transaction(operation); display(); $('status').textContent=message; }
  catch(error) { $('status').textContent=`Edit rejected: ${error.message}`; }
  finally {busy=false;controls();}
}
$('insert').addEventListener('click',()=>structural(graph=>{
  const output=graph.findInstance(`${SAMPLE_BASE}/nodes/output`);
  if (!inserted) {
    const fx=graph.add('distortion',{id:900});graph.registerInstance('/review/insert',fx);graph.setParameter(fx,1,0);graph.setParameter(fx,2,1);
    graph.connect(output.output('out'),fx.input('audio'));graph.disconnect(graph.output.input('in'));graph.connect(fx.output('out'),graph.output.input('in'));
  } else {graph.disconnect(graph.output.input('in'));graph.connect(output.output('out'),graph.output.input('in'));graph.remove(graph.findInstance('/review/insert'));}
},'Graph edit accepted; sounding voices continue.').then(()=>{
  inserted=Boolean(project.session.forkGraph().findInstance('/review/insert'));
  $('insert').textContent=inserted?'Remove Distortion':'Insert Distortion (dry)';
}));
$('replace').addEventListener('click',()=>structural(graph=>{
  const stereo=Float32Array.from({length:48000*2},(_,i)=>Math.sin(Math.floor(i/2)*2*Math.PI*(replaced?220:330)/48000)*.3*(i%2?.75:1));
  graph.setSampleAsset(graph.findInstance(`${SAMPLE_BASE}/nodes/voice_1/playback`),stereo,48000,'Authored replacement source');
},'New shared PCM accepted. Lower and raise a gate to trigger it.').then(()=>{replaced=!replaced;}));
$('load').addEventListener('change',async event=>{
  if(host||busy||!event.target.files[0])return;
  try{project=openProject(JSON.parse(await event.target.files[0].text()));inserted=Boolean(project.session.forkGraph().findInstance('/review/insert'));$('insert').textContent=inserted?'Remove Distortion':'Insert Distortion (dry)';display();$('status').textContent='Loaded portable graph. Start triggers its saved gates.';}
  catch(error){$('status').textContent=`Open rejected: ${error.message}`;}
  finally{event.target.value='';controls();}
});
$('download').addEventListener('click',async()=>{
  if(busy)return;busy=true;controls();
  try {
    if(host)await project.session.adoptPublishedParameters(host.readPublishedParameters());
    const url=URL.createObjectURL(new Blob([JSON.stringify(project.toProject(),null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='rack-sample-authored.json';link.click();URL.revokeObjectURL(url);
  } catch(error){$('status').textContent=error.message;}finally{busy=false;controls();}
});
display(); controls();
