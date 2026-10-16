import {BrowserGraphHost} from '@manifold/author/browser';
import {createLiveGraphSession,GraphWorkspace} from '@manifold/author';
import {createArbitraryIoGraph} from '@manifold/author/examples/arbitrary-io';
import {readProjectPackage,instantiateProjectPackage,saveProjectPackage} from '@manifold/author/package';
const $=id=>document.getElementById(id);
let graph=createArbitraryIoGraph(),host=null,context=null,session=null,sources=[],aux=null,auxConnected=true;
let display=null,recorder=null,timer=null,busy=false;
let packaged=null,controller=null;
const channelLabels=['stems / 1','stems / 2','stems / 3','stems / 4','mono / 1'];
$('channels').innerHTML=channelLabels.map((label,i)=>`<tr><td>${label}</td><td id="value-${i}">—</td></tr>`).join('');
function refresh(){
  $('download').textContent=packaged?'Download package':'Download graph';
  $('graph').textContent=JSON.stringify(session?.toProject()??graph.toProject(),null,2);
  if(display)for(let i=0;i<5;i++)$(`value-${i}`).textContent=display[i].toFixed(6);
  const d=host?.diagnostics;$('health').textContent=d?`${d.rustProcessedBlocks} blocks · ${d.publications} publications · ${d.rustCallbackAllocations} callback allocations · ${d.rustProcessingFailures} processing failures`:'';
  $('start').disabled=!!host||busy;for(const id of ['stop','aux','swap','apply'])$(id).disabled=!host||busy;
}
async function action(work){if(busy)return;busy=true;refresh();try{await work();}catch(error){$('status').textContent=`Rejected: ${error.message}`;}finally{busy=false;refresh();}}
async function start(){
  try {
  context=new AudioContext({sampleRate:48000});await context.suspend();
  host=new BrowserGraphHost(context,{execution:'prepared'});
  if(!packaged){
    const url=new URL(new URLSearchParams(location.search).get('package')??'/packages/arbitrary-io.manifold.json',location.href);
    if(url.origin!==location.origin)throw new Error('Use a package on this review server');
    const response=await fetch(url);if(!response.ok)throw new Error(`Package request failed: ${response.status}`);
    const loaded=await readProjectPackage(await response.text());
    const io=loaded.state.signal.io;
    if(JSON.stringify(io?.inputs.map(b=>[b.id,b.channels,b.optional]))!==JSON.stringify([['main',3,false],['aux',1,true]])||
       JSON.stringify(io?.outputs.map(b=>[b.id,b.channels]))!==JSON.stringify([['stems',4],['mono',1]]))throw new Error('This channel monitor requires the authored 3+1 input and 4+1 output layout');
    graph=GraphWorkspace.fromProject(loaded.state);packaged=loaded;
  }
  controller=(await instantiateProjectPackage(saveProjectPackage(packaged,graph.toProject()),host)).controller;
  session=controller.session;await host.prepare(controller.toProject());
  const merger=context.createChannelMerger(3);
  sources=[.125,-.25,.375].map((value,i)=>{const source=context.createConstantSource();source.offset.value=value;source.connect(merger,0,i);source.start();return source;});
  aux=context.createConstantSource();aux.offset.value=-.5;aux.start();sources.push(aux);
  host.connectInput('main',merger);host.connectInput('aux',aux);auxConnected=true;
  const state=new SharedArrayBuffer(24);display=new Float32Array(state,4);
  const code=`class Values extends AudioWorkletProcessor{constructor(o){super();this.v=new Float32Array(o.processorOptions.state,4);this.c=new Int32Array(o.processorOptions.state,0,1);}process(i,o){for(let c=0;c<4;c++)this.v[c]=i[0]?.[c]?.[0]??0;this.v[4]=i[1]?.[0]?.[0]??0;Atomics.add(this.c,0,1);for(let c=0;c<o[0].length;c++)o[0][c].fill(0);return true;}}registerProcessor('manifold-io-values',Values);`;
  const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));await context.audioWorklet.addModule(url);URL.revokeObjectURL(url);
  recorder=new AudioWorkletNode(context,'manifold-io-values',{numberOfInputs:2,numberOfOutputs:1,outputChannelCount:[2],channelCountMode:'max',channelInterpretation:'discrete',processorOptions:{state}});
  host.connectOutput('stems',recorder,0);host.connectOutput('mono',recorder,1);recorder.connect(context.destination);
  await context.resume();timer=setInterval(refresh,100);$('status').textContent='Running.';
  } catch(error) {
    clearInterval(timer);await host?.close().catch(()=>{});
    for(const source of sources)try{source.stop();}catch{}
    if(context?.state!=='closed')await context?.close().catch(()=>{});
    host=null;session=null;sources=[];display=null;throw error;
  }
}
async function stop(){if(!host)return;graph=GraphWorkspace.fromProject(session.toProject());clearInterval(timer);await host.close();for(const source of sources)source.stop();recorder.disconnect();await context.close();host=null;session=null;sources=[];display=null;$('status').textContent='Stopped.';}
$('start').onclick=()=>action(start);$('stop').onclick=()=>action(stop);
$('swap').onclick=()=>action(async()=>{await controller.swap();$('status').textContent='Accepted routing edit.';});
$('aux').onclick=()=>action(async()=>{host.connectInput('aux',auxConnected?null:aux);auxConnected=!auxConnected;$('aux').textContent=auxConnected?'Disconnect optional input':'Connect optional input';$('status').textContent='Accepted input connection.';});
$('apply').onclick=()=>action(async()=>{await session.transaction(g=>Function('graph',$('script').value)(g));$('status').textContent='Accepted script.';});
$('download').onclick=()=>{const projectDocument=session?.toProject()??graph.toProject();const url=URL.createObjectURL(new Blob([JSON.stringify(packaged?saveProjectPackage(packaged,projectDocument):projectDocument,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='arbitrary-io.manifold.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
window.manifoldArbitraryIo={BrowserGraphHost,GraphWorkspace,createArbitraryIoGraph,createLiveGraphSession,get host(){return host;},get context(){return context;},get session(){return session;},get values(){return display?Array.from(display):null;}};
refresh();
