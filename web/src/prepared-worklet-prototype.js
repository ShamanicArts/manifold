import { BrowserGraphHost } from '@manifold/author/browser';
import { PreparedGraphHostPrototype } from '../../packages/manifold-author/experimental/prepared-host-prototype.js';
import { instantiateProjectPackage, saveProjectPackage } from '@manifold/author/package';
const element = id => document.getElementById(id);
const publicMode=new URLSearchParams(location.search).get('execution')==='prepared';
let busy = false, report = null;
if(publicMode){document.title='Manifold importable prepared runtime';document.querySelector('h1').textContent='Importable Rust graph runtime';
  document.querySelectorAll('body>p')[0].textContent='The public BrowserGraphHost prepares authored graphs in a Worker and renders Rust on the audio thread. This review imports the library and packaged project controllers.';
  document.querySelectorAll('body>p')[1].textContent='Two independent graphs, 24 live authored edits, host gain adoption, invalid-input rejection and recovery. Both outputs are recorded; Gain/Widener history is retained. Wider resource continuity remains open.';}
const downloads = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function wav(samples, rate) {
  const bytes = new ArrayBuffer(44 + samples.length * 4), view = new DataView(bytes);
  const label = (at, text) => { for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i)); };
  label(0,'RIFF'); view.setUint32(4,bytes.byteLength-8,true); label(8,'WAVE'); label(12,'fmt ');
  view.setUint32(16,16,true); view.setUint16(20,3,true); view.setUint16(22,2,true);
  view.setUint32(24,rate,true); view.setUint32(28,rate*8,true); view.setUint16(32,8,true); view.setUint16(34,32,true);
  label(36,'data'); view.setUint32(40,samples.length*4,true);
  for (let i = 0; i < samples.length; i++) view.setFloat32(44+i*4,samples[i],true);
  return bytes;
}
function download(id, content, type, filename) {
  const url = URL.createObjectURL(new Blob([content], { type })); downloads.push(url);
  const link = document.createElement('a'); link.id = id; link.href = url; link.download = filename; link.textContent = filename;
  element('downloads').append(link); return url;
}
function recorder(context) {
  const tape = new SharedArrayBuffer(context.sampleRate*45*2*4);
  const control = new Int32Array(new SharedArrayBuffer(7*4));
  const cadence = new Int32Array(new SharedArrayBuffer(Math.ceil(context.sampleRate*45/128)*5*4));
  const node = new AudioWorkletNode(context,'manifold-runtime-review-recorder', {
    numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],
    processorOptions:{tape,control:control.buffer,cadence:cadence.buffer,clockOriginUnixMs:Date.now()},
  });
  return {node,tape,control,cadence};
}
function readTape(recorded, rate) {
  const frames = Atomics.load(recorded.control,0), samples = new Float32Array(recorded.tape,0,frames*2).slice();
  let energy = 0, peak = 0, zero = 0; const zeroRuns = [];
  for (let frame = 0; frame <= frames; frame++) {
    if (frame < frames) { const left=samples[frame*2],right=samples[frame*2+1]; energy+=left*left+right*right;peak=Math.max(peak,Math.abs(left),Math.abs(right));
      if (left===0 && right===0) {zero++;continue;} }
    if (zero>=128) zeroRuns.push({startFrame:frame-zero,frames:zero}); zero=0;
  }
  return {samples,signal:{frames,seconds:frames/rate,rms:Math.sqrt(energy/samples.length),peak,zeroRunsAtLeast128Frames:zeroRuns},
    overflow:Boolean(Atomics.load(recorded.control,2)),firstContextFrame:Atomics.load(recorded.control,3),lastContextFrame:Atomics.load(recorded.control,4)};
}
function plot(samples) {
  const pen=element('wave').getContext('2d');pen.clearRect(0,0,1000,120);pen.strokeStyle='#8fd8c7';pen.beginPath();
  for(let x=0;x<1000;x++){let lo=0,hi=0;for(let i=Math.floor(x*samples.length/1000/2)*2;i<Math.floor((x+1)*samples.length/1000/2)*2;i+=2){lo=Math.min(lo,samples[i]);hi=Math.max(hi,samples[i]);}pen.moveTo(x,60-lo*550);pen.lineTo(x,60-hi*550);}pen.stroke();
}
async function instance(context,name) {
  const host=publicMode?new BrowserGraphHost(context,{execution:'prepared'}):new PreparedGraphHostPrototype(context);
  const pkg=await (await fetch(`/packages/${name}.manifold.json`)).text();
  const loaded=await instantiateProjectPackage(pkg,{readPublishedParameters:()=>host.readPublishedParameters(),
    setParameter:edit=>host.setParameter(edit),setRoute:route=>host.setRoute(route),replaceGraph:graph=>host.replaceGraph(graph)});
  try { await host.prepare(loaded.controller.toProject()); } catch(error) { error.prototypeStage=host.stage; throw error; } return {host,...loaded};
}
async function run() {
  if(busy)return;busy=true;report=null;element('run').disabled=true;element('status').textContent='Preparing isolated graph arenas…';
  for(const player of document.querySelectorAll('audio'))player.pause();
  for(const url of downloads)URL.revokeObjectURL(url);downloads.length=0;element('downloads').replaceChildren();
  let context,primary,secondary,oscillator;
  try {
    const example=element('example').value;
    context=new AudioContext({sampleRate:48000});await context.resume();
    await context.audioWorklet.addModule(new URL('./runtime-review-recorder.js',import.meta.url));
    primary=await instance(context,example);secondary=await instance(context,'dsp-live-scripting');
    const first=recorder(context),second=recorder(context);
    const level=context.createGain();level.gain.value=.08;oscillator=context.createOscillator();oscillator.frequency.value=220;oscillator.connect(level);
    primary.host.connect(level,first.node);secondary.host.connect(level,second.node);first.node.connect(context.destination);second.node.connect(context.destination);
    oscillator.start();await pause(1000);
    await primary.host.setParameter({nodeId:4,id:0,value:.375});await pause(50);
    const before={primary:primary.host.diagnostics,secondary:secondary.host.diagnostics};
    Atomics.store(first.control,1,1);Atomics.store(second.control,1,1);
    const edits=[];
    for(let index=0;index<24;index++){
      element('status').textContent=`Authoring ${index+1}/24 while both Rust graphs render…`;
      const started=performance.now();
      const pending=example==='dsp-live-scripting'?primary.controller.setDistortion(index%2===0)
        :primary.controller.set(`/test/fxslot/slot${Math.floor(index/2)%2?'B':'A'}/select`,index%2===0?1:0);
      const load=performance.now();while(performance.now()-load<12){}
      await pending;
      const accepted=primary.controller.toProject();
      if(accepted.signal.initialParameters.find(p=>p.nodeId===4&&p.id===0).value!==.375)throw new Error('Graph edit lost host gain');
      edits.push({index:index+1,...primary.host.lastEdit,totalMs:performance.now()-started,
        nodes:accepted.signal.nodes.length,primary:primary.host.diagnostics,secondary:secondary.host.diagnostics});
      await pause(100);
    }
    const bad=structuredClone(primary.controller.toProject());bad.signal.nodes.find(n=>n.type==='gain').a=.123;
    let rejected=null;try{await primary.host.replaceGraph(bad);}catch(error){rejected=error.message;}
    if(!rejected)throw new Error('Invalid constructor was accepted');
    const compilerFailure=publicMode?null:await primary.host.probeRustPreparationRejection(primary.controller.toProject());
    await primary.host.replaceGraph(primary.controller.toProject());
    const recovery={rejected,preflight:true,compilerFailure,lastEdit:primary.host.lastEdit,diagnostics:primary.host.diagnostics};
    const stallBefore={primary:primary.host.diagnostics,secondary:secondary.host.diagnostics};
    const stalled=publicMode?null:await primary.host.probeCompilerStall(250);
    const compilerStall=stalled?{durationMs:stalled.durationMs,before:stallBefore,
      after:{primary:primary.host.diagnostics,secondary:secondary.host.diagnostics}}:null;
    await pause(750);await context.suspend();
    const a=readTape(first,context.sampleRate),b=readTape(second,context.sampleRate);
    const saved=saveProjectPackage(primary.package,primary.controller.toProject());
    const times=edits.map(e=>e.totalMs).sort((a,b)=>a-b);
    report={recordedAt:new Date().toISOString(),runtime:publicMode?'public-prepared-library':'experimental-prepared-audio-thread',example,editCount:24,sourceHz:220,sourceGain:.08,hostGain:.375,
      sampleRate:context.sampleRate,renderQuantum:128,mainThreadWorkMs:12,bridgeLatencyBlocks:0,contextBaseLatencySeconds:context.baseLatency,
      before,after:{primary:primary.host.diagnostics,secondary:secondary.host.diagnostics},edits,recovery,compilerStall,
      latency:{p50Ms:times[11],p95Ms:times[22],maxMs:times[23]},primaryRecording:{...a,samples:undefined},secondaryRecording:{...b,samples:undefined},finalGraph:saved.state};
    element('audio').src=download('wav',wav(a.samples,context.sampleRate),'audio/wav',`${example}-prepared.wav`);
    element('secondary-audio').src=download('wav-secondary',wav(b.samples,context.sampleRate),'audio/wav',`${example}-prepared-secondary.wav`);
    download('json',JSON.stringify(report,null,2),'application/json',`${example}-prepared.json`);
    download('package',JSON.stringify(saved,null,2),'application/json',`${example}-prepared.manifold.json`);
    plot(a.samples);element('report').textContent=JSON.stringify(report,null,2);
    element('stats').textContent=`24 edits · p95 ${report.latency.p95Ms.toFixed(1)} ms · Rust callback allocations ${report.after.primary.rustCallbackAllocations}/${report.after.secondary.rustCallbackAllocations} · recorded zero blocks ${a.signal.zeroRunsAtLeast128Frames.length}/${b.signal.zeroRunsAtLeast128Frames.length}`;
    element('status').textContent='Recorded both outputs and recovered from a rejected graph. Measurement is a short experiment, not a sustained deadline guarantee.';
    return report;
  }catch(error){window.manifoldPreparedFailure={name:error.name,message:error.message,stack:error.stack,stage:error.prototypeStage};element('status').textContent=`Experiment failed: ${error.name} ${error.message} (${error.prototypeStage??'run'})`;throw error;}
  finally{oscillator?.stop();if(context?.state==='suspended')await context.resume();await primary?.host.close();await secondary?.host.close();await context?.close();busy=false;element('run').disabled=false;}
}
element('run').addEventListener('click',()=>run().catch(console.error));
window.manifoldPreparedPrototype={run,get busy(){return busy;},get report(){return report;},Host:publicMode?BrowserGraphHost:PreparedGraphHostPrototype};
document.addEventListener('play',event=>{if(!(event.target instanceof HTMLMediaElement))return;if(busy){event.target.pause();return;}for(const player of document.querySelectorAll('audio'))if(player!==event.target)player.pause();},true);
fetch(publicMode?'/prepared-worklet-prototype/2026-09-30-public-prepared-recordings/summary.json':'/prepared-worklet-prototype/2026-09-30-prepared-audio-thread-v2/summary.json').then(r=>r.ok?r.json():null).then(summary=>{
  if(!summary)return;element('retained').replaceChildren();
  for(const run of summary.runs){const p=document.createElement('p');p.textContent=`${run.example} · 24 edits · p95 ${run.latency.p95Ms.toFixed(1)} ms · zero recorded blocks ${run.primaryRecording.signal.zeroRunsAtLeast128Frames.length}/${run.secondaryRecording.signal.zeroRunsAtLeast128Frames.length}`;element('retained').append(p);
    for(const src of[run.audio,run.secondaryAudio]){const player=document.createElement('audio');player.controls=true;player.preload='none';player.src=src;element('retained').append(player);}for(const[label,href]of[['Raw report',run.report],['Saved package',run.package]]){const link=document.createElement('a');link.href=href;link.textContent=label;link.style.marginRight='15px';element('retained').append(link);}}
}).catch(error=>{element('retained').textContent=error.message;});
