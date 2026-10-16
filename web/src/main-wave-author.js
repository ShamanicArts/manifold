import { BrowserGraphHost } from '@manifold/author/browser';
import { readProjectPackage, instantiateProjectPackage, saveProjectPackage } from '@manifold/author/package';
const $=id=>document.getElementById(id);
let context,host,project,packaged,saved,busy=false,running=false,tickPromise=Promise.resolve(),timer,lastTime=0,lastRefresh=0,insert=false,analyser,captureUrl;
const held=new Set();
function refresh(){
  $('start').disabled=busy||Boolean(host);$('stop').disabled=busy||!host;
  for(const id of ['panic','insert','save','apply','waveform','blend','unison','detune','monitor'])$(id).disabled=busy||!host;
  for(const button of document.querySelectorAll('#keys button,#captures button'))button.disabled=busy||!host;
  if(!project)return;
  $('graph').textContent=JSON.stringify(project.toProject(),null,2);
  const mixer=project.session.forkGraph().findInstance('/midi/synth/nodes/voice_mixer');
  const graph=mixer.graph;$('ports').textContent=JSON.stringify(graph.describeNode(mixer),null,2);
  const voices=project.voiceSnapshot();$('voices').replaceChildren(...voices.map((voice,index)=>{
    const div=document.createElement('div');div.className='voice'+(voice.active&&voice.envelopeStage!=='idle'?' active':'');
    div.textContent=`${index+1}: ${voice.note??'—'} · ${voice.envelopeStage} · ${voice.currentAmp.toFixed(3)}`;return div;
  }));
  $('health').textContent=JSON.stringify(host?.diagnostics??{},null,2);
}
async function run(action,message){busy=true;refresh();try{await action();$('status').textContent=message;}
  catch(error){$('status').textContent=`Rejected: ${error.message}`;throw error;}finally{busy=false;refresh();}}
async function tick(){
  if(!running)return;
  const now=context.currentTime;
  tickPromise=project.advance(Math.max(0,now-lastTime),now);lastTime=now;
  try{await tickPromise;if(now-lastRefresh>=0.1){lastRefresh=now;refresh();}}catch(error){running=false;$('status').textContent=`Clock stopped: ${error.message}`;return;}
  if(running)timer=setTimeout(tick,1000/60);
}
function pauseClock(){running=false;clearTimeout(timer);return tickPromise;}
function startClock(){lastTime=context.currentTime;running=true;timer=setTimeout(tick,1000/60);}
$('start').onclick=()=>run(async()=>{
  context=new AudioContext();host=new BrowserGraphHost(context,{execution:'prepared'});
  try{
    packaged??=await readProjectPackage(await(await fetch('/packages/main-wave-author.manifold.json')).text());
    project=(await instantiateProjectPackage(saved?saveProjectPackage(packaged,saved):packaged,host)).controller;
    await host.prepare(project.toProject());analyser=context.createAnalyser();analyser.fftSize=2048;
    host.connect(null,analyser);analyser.connect(context.destination);await context.resume();
    insert=project.toProject().signal.nodes.some(node=>node.id===100);startClock();
  }catch(error){await host.close();await context.close();host=null;context=null;throw error;}
},'Running.').catch(()=>{});
$('stop').onclick=()=>run(async()=>{
  await pauseClock();await project.panic();await project.adoptPublishedParameters(host.readPublishedParameters());saved=project.toProject();
  held.clear();await host.close();await context.close();host=null;context=null;analyser=null;
},'Stopped.').catch(()=>{});
$('panic').onclick=()=>run(async()=>{await project.panic();held.clear();},'All voices off.').catch(()=>{});
$('insert').onclick=()=>run(async()=>{await pauseClock();try{await project.setInsert(!insert);insert=!insert;}finally{startClock();}},'Accepted topology edit.').catch(()=>{});
$('apply').onclick=()=>run(async()=>{
  await pauseClock();try{await project.session.transaction(graph=>Function('graph',`"use strict";\n${$('script').value}`)(graph));}finally{startClock();}
},'Accepted graph script.').catch(()=>{});
$('save').onclick=()=>run(async()=>{
  await project.adoptPublishedParameters(host.readPublishedParameters());
  const blob=new Blob([JSON.stringify(saveProjectPackage(packaged,project.toProject()))],{type:'application/json'}),url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');anchor.href=url;anchor.download='main-wave.manifold.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
},'Downloaded package.').catch(()=>{});
for(const [id,path] of [['waveform','waveform'],['blend','blend/amount'],['unison','unison'],['detune','detune'],['monitor','output']]){
  $(id).onchange=()=>run(async()=>{await project.set(`/midi/synth/${path}`,Number($(id).value));if($(id+'-value'))$(id+'-value').value=$(id).value;},'Accepted control.').catch(()=>{});
}
for(const [note,name] of [[60,'C4'],[62,'D4'],[64,'E4'],[65,'F4'],[67,'G4'],[69,'A4'],[71,'B4'],[72,'C5'],[74,'D5']]){
  const button=document.createElement('button');button.textContent=name;button.dataset.note=note;button.disabled=true;
  button.onclick=()=>run(async()=>{if(held.has(note)){await project.noteOff(note);held.delete(note);}else{await project.noteOn(note,100);held.add(note);}},held.has(note)?'Released note.':'Note accepted.').catch(()=>{});
  $('keys').append(button);
}
for(let index=0;index<4;index++){
  const button=document.createElement('button');button.textContent=`Listen to layer ${index+1} input`;button.disabled=true;
  button.onclick=()=>run(async()=>{
    const {stereo,sourceRate}=await host.captureWindow(90+index,.5);
    const buffer=new ArrayBuffer(44+stereo.byteLength),view=new DataView(buffer),bytes=new Uint8Array(buffer);
    const text=(at,s)=>[...s].forEach((c,i)=>bytes[at+i]=c.charCodeAt(0));text(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');
    view.setUint32(16,16,true);view.setUint16(20,3,true);view.setUint16(22,2,true);view.setUint32(24,sourceRate,true);view.setUint32(28,sourceRate*8,true);
    view.setUint16(32,8,true);view.setUint16(34,32,true);text(36,'data');view.setUint32(40,stereo.byteLength,true);for(let i=0;i<stereo.length;i++)view.setFloat32(44+i*4,stereo[i],true);
    if(captureUrl)URL.revokeObjectURL(captureUrl);captureUrl=URL.createObjectURL(new Blob([buffer],{type:'audio/wav'}));$('capture-audio').src=captureUrl;
  },`Layer ${index+1} capture ready.`).catch(()=>{});$('captures').append(button);
}
window.manifoldMainWave={BrowserGraphHost,instantiateProjectPackage,saveProjectPackage,get host(){return host;},get project(){return project;},get context(){return context;},get analyser(){return analyser;},pauseClock,startClock};
refresh();
