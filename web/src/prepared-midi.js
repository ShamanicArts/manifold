import { BrowserGraphHost } from '@manifold/author/browser';
import { GraphWorkspace } from '@manifold/author';
import { createProject, TRANSPOSE_PATH, INPUT_PATH, VOICE_PATH, EFFECT_PATH } from '@manifold/author/examples/transpose-audition';
const $ = id => document.getElementById(id);
let context = null, host = null, project = null, busy = false, inserted = false, recordingRequest = 0;
const held = new Set();
function controls() {
  $('start').disabled = busy || Boolean(host); $('stop').disabled = busy || !host;
  for (const id of ['insert', 'all-off', 'semitones', 'bend']) $(id).disabled = busy || !host;
  for (const key of $('keys').querySelectorAll('button')) key.disabled = !host;
}
function show() {
  if (project) $('graph').textContent = JSON.stringify(project.toProject(), null, 2);
  if (host) $('diagnostics').textContent = JSON.stringify(host.diagnostics, null, 2);
  for (const key of $('keys').querySelectorAll('button')) {
    key.setAttribute('aria-pressed', String(held.has(Number(key.dataset.note))));
    key.style.background = held.has(Number(key.dataset.note)) ? '#b75a70' : '';
  }
}
async function start() {
  if (busy || host) return;
  recordingRequest++;
  for (const recording of document.querySelectorAll('audio')) recording.pause();
  busy = true; controls(); $('status').textContent = 'Preparing authored MIDI graph…';
  try {
    context = new AudioContext({ sampleRate: 48000 }); await context.resume();
    const saved = project?.toProject();
    host = new BrowserGraphHost(context, { execution: 'prepared' });
    project = createProject(host, saved ? GraphWorkspace.fromProject(saved) : undefined);
    await host.prepare(project.toProject()); const monitor = context.createGain(); monitor.gain.value = .3;
    monitor.connect(context.destination); host.connect(null, monitor);
    inserted = Boolean(project.session.forkGraph().findInstance('/transpose/audition/nodes/insert'));
    const interval = project.toProject().signal.initialParameters.find(p => p.nodeId === project.session.forkGraph().findInstance(EFFECT_PATH).id && p.id === 0).value;
    $('semitones').value = String(interval); $('interval').textContent = String(interval); $('bend').value = '8192';
    $('status').textContent = 'Running. Hold a note while toggling the insert or changing the interval.'; show();
  } catch (error) {
    await host?.close().catch(() => {}); await context?.close(); host = null; context = null;
    $('status').textContent = error.message;
  } finally { busy = false; controls(); }
}
async function stop() {
  if (busy || !host) return;
  busy = true; controls();
  try { await project.synchronizeParameters(); await host.close(); await context.close(); host = null; context = null; held.clear(); $('status').textContent = 'Stopped.'; }
  finally { busy = false; controls(); }
}
async function event(kind, note = 0, velocity = 0) {
  if (!host) return;
  try { await project.sendEvents([{ kind, note, velocity }]); show(); }
  catch (error) { $('status').textContent = error.message; }
}
for (const [label, note] of [['C',60],['D',62],['E',64],['F',65],['G',67],['A',69],['B',71],['C↑',72]]) {
  const key = document.createElement('button'); key.textContent = label; key.dataset.note = note;
  key.onpointerdown = pointer => {
    if (!host || busy) return;
    if (held.has(note)) { if ($('latch').checked) { held.delete(note); event(1, note); } return; }
    key.setPointerCapture(pointer.pointerId); held.add(note); event(0, note, 100);
  };
  const release = () => { if (held.delete(note)) event(1, note); };
  key.onpointerup = () => { if (!$('latch').checked) release(); }; key.onpointercancel = release; $('keys').append(key);
}
$('start').onclick = start; $('stop').onclick = stop;
$('all-off').onclick = async () => { held.clear(); await event(2); };
$('semitones').onchange = async () => {
  if (!host || busy) return; busy = true; controls();
  try { await project.set(TRANSPOSE_PATH, Number($('semitones').value)); $('interval').textContent = String(host.readPublishedParameters().find(p => p.nodeId === project.session.forkGraph().findInstance(EFFECT_PATH).id && p.id === 0).value); show(); }
  catch (error) { $('status').textContent = error.message; }
  finally { busy = false; controls(); }
};
$('bend').onchange = async () => { const value = Number($('bend').value); await event(3, value & 127, value >> 7); };
$('insert').onclick = async () => {
  if (!host || busy) return; busy = true; controls();
  try { await project.setInsert(!inserted); inserted = !inserted; show(); $('status').textContent = 'Authored insert changed; compatible held voices retained.'; }
  catch (error) { $('status').textContent = error.message; }
  finally { busy = false; controls(); }
};
window.addEventListener('blur', () => { if (held.size) { held.clear(); event(2); } });
for (const recording of document.querySelectorAll('audio')) {
  recording.addEventListener('play', async () => {
    const request = ++recordingRequest;
    for (const other of document.querySelectorAll('audio')) if (other !== recording) other.pause();
    if (!host && !busy) return;
    recording.pause();
    try {
      // Wait for any graph operation before disposing its audio ownership.
      while (busy) await new Promise(resolve => setTimeout(resolve, 10));
      if (host) await stop();
      if (request === recordingRequest) await recording.play();
    } catch (error) { $('status').textContent = error.message; }
  }, { once: false });
}
setInterval(show, 250);
window.manifoldPreparedMidi = { Host: BrowserGraphHost, GraphWorkspace, createProject, TRANSPOSE_PATH, INPUT_PATH, VOICE_PATH, EFFECT_PATH,
  get host() { return host; }, get context() { return context; }, get project() { return project; }, start, stop };
controls();
