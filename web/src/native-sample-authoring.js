import { BrowserGraphHost } from '@manifold/author/browser';
import { instantiateProjectPackage, readProjectPackage, saveProjectPackage } from '@manifold/author/package';
const $=id=>document.getElementById(id);
let context=null,host=null,project=null,saved=null,packaged=null,busy=false,inserted=false,analyser=null,meterTimer=null;
const base='/midi/synth/rack/sample/1';
function display(){
  const document=project?.toProject()??saved;
  $('graph').textContent=JSON.stringify(document?{...document,assets:document.assets?.map(({pcmF32Base64,...asset})=>({...asset,pcm:'included in download'}))}:null,null,2);
  $('start').disabled=busy||Boolean(host);$('stop').disabled=busy||!host;$('mode').disabled=busy||Boolean(host);
  for(const id of ['sound','off','replace'])$(id).disabled=busy||!host;
  $('insert').disabled=busy||!host||$('mode').value!=='rack';$('save').disabled=busy||!project;
  $('load-package').disabled=busy||Boolean(host);$('package-source').disabled=busy||Boolean(host);
  $('save-package').disabled=busy||!project;
}
function health(){if(!host)return;const pcm=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(pcm);
  $('health').textContent=JSON.stringify({...host.diagnostics,rms:Math.sqrt(pcm.reduce((sum,v)=>sum+v*v,0)/pcm.length)},null,2);}
async function run(action,message){busy=true;display();try{await action();$('status').textContent=message;}catch(error){$('status').textContent=`Rejected: ${error.message}`;}finally{busy=false;display();health();}}
$('start').onclick=()=>run(async()=>{
  context=new AudioContext();host=new BrowserGraphHost(context,{execution:'prepared'});
  try{
    if(!packaged){
      const name=$('mode').value==='rack'?'rack-sample':'sample-instrument';
      const response=await fetch(`/packages/${name}-author.manifold.json`);
      if(!response.ok)throw new Error(`Package HTTP ${response.status}`);
      packaged=await readProjectPackage(await response.text());
    }
    const loaded=await instantiateProjectPackage(saved?saveProjectPackage(packaged,saved):packaged,host);
    project=loaded.controller;
    inserted=project.toProject().signal.nodes.some(node=>node.id===800);
    await host.prepare(project.toProject());analyser=context.createAnalyser();analyser.fftSize=1024;
    analyser.connect(context.destination);host.connect(null,analyser);await context.resume();
    await project.activate?.();meterTimer=setInterval(health,150);
  }catch(error){await host?.close();await context?.close();host=null;context=null;throw error;}
},'Running.');
$('stop').onclick=()=>run(async()=>{
  await project.adoptPublishedParameters(await host.readPublishedParameters());saved=project.toProject();
  clearInterval(meterTimer);await host.close();await context.close();host=null;context=null;analyser=null;
},'Stopped.');
$('sound').onclick=()=>run(async()=>{
  if($('mode').value==='rack'){
    await project.set(`${base}/pitchMode`,2);await project.set(`${base}/unison`,3);
    for(const [voice,note] of [[1,60],[2,67]]){await project.set(`${base}/voice/${voice}/vOct`,note);await project.set(`${base}/voice/${voice}/gate`,0.7);}
  }else await project.event({kind:0,note:67,velocity:100});
},'Playing.');
$('off').onclick=()=>run(async()=>{
  if($('mode').value==='rack')for(let voice=1;voice<=8;voice++)await project.set(`${base}/voice/${voice}/gate`,0);
  else await project.event({kind:2});
},'All voices off.');
$('insert').onclick=()=>run(async()=>{await project.setInsert(!inserted);inserted=!inserted;},'Accepted topology edit.');
$('replace').onclick=()=>run(async()=>{const frequency=Number($('frequency').value);if(!Number.isFinite(frequency)||frequency<40||frequency>1200)throw new Error('Choose 40–1200 Hz');await project.replaceSource(frequency);},'Published new PCM.');
$('save').onclick=()=>run(async()=>{
  if(host)await project.adoptPublishedParameters(await host.readPublishedParameters());
  const url=URL.createObjectURL(new Blob([JSON.stringify(project.toProject(),null,2)],{type:'application/json'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=`manifold-${$('mode').value}-sample.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
},'Downloaded graph and PCM.');
$('save-package').onclick=()=>run(async()=>{
  if(host)await project.adoptPublishedParameters(await host.readPublishedParameters());
  const url=URL.createObjectURL(new Blob([JSON.stringify(saveProjectPackage(packaged,project.toProject()))],{type:'application/json'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=`${packaged.packageId}.manifold.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
},'Downloaded project package.');
$('load-package').onclick=()=>run(async()=>{
  const response=await fetch($('package-source').value);if(!response.ok)throw new Error(`Package HTTP ${response.status}`);
  const candidate=await readProjectPackage(await response.text());
  const modes={'manifold.rack-sample-author':'rack','manifold.sample-instrument-author':'instrument'};
  if(!modes[candidate.packageId])throw new Error('Choose a Sample author package for this review page');
  packaged=candidate;saved=candidate.state;project=null;inserted=false;$('mode').value=modes[candidate.packageId];
},'Package loaded. Press Start.');
$('mode').onchange=()=>{saved=null;packaged=null;project=null;inserted=false;display();$('status').textContent='Ready.';};
window.manifoldSharedSample={get host(){return host;},get project(){return project;},get package(){return packaged;},get analyser(){return analyser;}};
display();
