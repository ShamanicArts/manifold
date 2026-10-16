import { BrowserGraphHost } from '@manifold/author/browser';
import { GraphWorkspace } from '@manifold/author';
import { createProject } from '@manifold/author/examples/loop-authoring';
const $ = id => document.getElementById(id);
let context = null, host = null, project = null, saved = null, busy = false, inserted = false, recordingRequest = 0;
function show() {
  const state=project?.toProject(),targets=host?.readPublishedParameters()??[];
  // Keep full PCM in the exported project. Rendering hundreds of thousands of
  // base64 glyphs every refresh stalls the browser's layout/control thread.
  if (state) $('graph').textContent = JSON.stringify({...state,
    ...(state.assets?{assets:state.assets.map(({pcmF32Base64,...metadata})=>metadata)}:{})},null,2);
  if (host) $('diagnostics').textContent = JSON.stringify(host.diagnostics,null,2);
  for (const control of $('layers').querySelectorAll('input')) {
    const nodeId=state?.instances.find(instance=>instance.path===`/rack_host/layers/${control.dataset.layer}/loop`)?.nodeId;
    const value=control.dataset.configuration==='capacitySeconds'
      ? state?.signal.nodes.find(node=>node.id===nodeId)?.a??2
      : targets.find(parameter=>parameter.nodeId===nodeId&&parameter.id===Number(control.dataset.parameter))?.value??0;
    if (control.type === 'checkbox') control.checked = value >= .5;
    else if(host && document.activeElement !== control && !control.dataset.pending) control.value=String(value);
  }
}
function controls() {
  $('start').disabled = busy || Boolean(host); $('stop').disabled = busy || !host;
  $('insert').disabled = busy || !host; $('save').disabled = busy || !host; $('load').disabled = busy || Boolean(host);
  $('review-project').disabled = busy || Boolean(host);
  for (const input of $('layers').querySelectorAll('input')) input.disabled = busy || !host;
  for (const button of $('layers').querySelectorAll('button')) button.disabled = busy || !host;
}
async function run(operation) {
  if (busy) return; busy=true; controls();
  try { await operation(); show(); } catch(error) { $('status').textContent=error.message; }
  finally { busy=false; controls(); }
}
async function start() {
  if(host) return;
  recordingRequest++;for(const recording of document.querySelectorAll('audio'))recording.pause();
  await run(async()=>{
    context = new AudioContext({sampleRate:48000}); await context.resume();
    host = new BrowserGraphHost(context,{execution:'prepared'});
    try {
      project=createProject(host,saved ? GraphWorkspace.fromProject(saved) : undefined);
      await host.prepare(project.toProject()); const monitor=context.createGain();monitor.gain.value=.5;monitor.connect(context.destination);host.connect(null,monitor);
      inserted=Boolean(project.session.forkGraph().findInstance('/loop/audition/insert'));
      $('status').textContent='Running. Loop storage follows stable graph instances through compatible edits.';
    } catch(error) { await host.close().catch(()=>{});await context.close();host=null;context=null;throw error; }
  });
}
async function stop() {
  if(!host) return;
  await run(async()=>{await host.close();await context.close();host=null;context=null;$('status').textContent='Stopped. Reopen a saved file to restore its takes.';});
}
for(let layer=1;layer<=4;layer++){
  const row=document.createElement('div');row.className='layer';row.append(`Layer ${layer} `);
  for(const [name,id,method] of [['Record',0,'record'],['Play',1,'play'],['Overdub',2,'overdub'],['Reverse',4,'reverse']]){
    const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.dataset.layer=layer;input.dataset.parameter=id;
    input.onchange=()=>run(()=>project.layers[method](layer,input.checked));label.append(input,name);row.append(label);
  }
  const speed=document.createElement('input');speed.type='range';speed.min='.25';speed.max='2';speed.step='.01';speed.value='1';speed.dataset.layer=layer;speed.dataset.parameter=3;
  speed.onchange=()=>run(()=>project.layers.speed(layer,Number(speed.value)));const label=document.createElement('label');label.append('Speed',speed);row.append(label);$('layers').append(row);
  const capacity=document.createElement('input');capacity.type='number';capacity.min='0';capacity.step='any';capacity.value='2';capacity.style.width='5em';capacity.dataset.layer=layer;capacity.dataset.configuration='capacitySeconds';
  capacity.oninput=()=>{capacity.dataset.pending='true';};
  const capacityLabel=document.createElement('label');capacityLabel.append('Capacity (s)',capacity);row.append(capacityLabel);
  const rebuild=document.createElement('button');rebuild.textContent='Rebuild layer';rebuild.dataset.rebuildLayer=layer;rebuild.disabled=true;
  rebuild.onclick=()=>run(async()=>{await project.setLayerCapacity(layer,Number(capacity.value));delete capacity.dataset.pending;$('status').textContent='Layer rebuilt from its authored clip and controls.';});row.append(rebuild);
}
$('start').onclick=start;$('stop').onclick=stop;
$('insert').onclick=()=>run(async()=>{await project.setInsert(!inserted);inserted=!inserted;$('status').textContent='Insert changed; compatible loop takes, cursors and recording state retained.';});
$('save').onclick=()=>run(async()=>{
  saved=await project.snapshot(); const link=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(saved,null,2)],{type:'application/json'}));
  link.href=url;link.download='authored-four-loops.manifold.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('status').textContent='Saved stopped takes. Playback may continue while saving.';
});
$('load').onchange=()=>run(async()=>{saved=GraphWorkspace.fromProject(JSON.parse(await $('load').files[0].text())).toProject();$('status').textContent='Loaded saved graph and takes. Start audio to reopen.';});
$('review-project').onclick=()=>run(async()=>{const response=await fetch('/prepared-loops/2026-09-30-prepared-loops-v3/saved-project.json');if(!response.ok)throw new Error('Saved review project unavailable');saved=GraphWorkspace.fromProject(await response.json()).toProject();$('status').textContent='Loaded four recorded takes. Start audio to reopen and edit them.';});
for(const recording of document.querySelectorAll('audio'))recording.addEventListener('play',async()=>{
  const request=++recordingRequest;for(const other of document.querySelectorAll('audio'))if(other!==recording)other.pause();
  if(!host&&!busy)return;recording.pause();
  try{while(busy)await new Promise(resolve=>setTimeout(resolve,10));if(host)await stop();if(request===recordingRequest)await recording.play();}
  catch(error){$('status').textContent=error.message;}
});
setInterval(()=>{if(!busy)show();},250);
window.manifoldPreparedLoops={Host:BrowserGraphHost,GraphWorkspace,createProject,get host(){return host;},get context(){return context;},get project(){return project;},start,stop};
controls();
