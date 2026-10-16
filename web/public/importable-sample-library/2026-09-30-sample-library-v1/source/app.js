import {createLiveGraphSession} from '@manifold/author';
import {BrowserGraphHost} from '@manifold/author/browser';
import {buildGraph,createProject} from '@manifold/author/examples/rack-sample-eight-voice';
const base='/midi/synth/rack/sample/1',$=id=>document.getElementById(id);
const stereo=Float32Array.from({length:8192*2},(_,i)=>{const t=Math.floor(i/2)/48000;return .35*(Math.sin(t*Math.PI*440)+.2*Math.sin(t*Math.PI*660))*(i%2?.8:1);});
let graph=buildGraph(stereo,48000,'Independent library consumer source');
let context=null,host=null,analyser=null,project=null,busy=false,tick=0;
const draft=`const output = graph.findInstance('/midi/synth/rack/sample/1/nodes/output');
let trim = graph.findInstance('/consumer/trim');
if (!trim) {
  trim = graph.add('fixed-gain', { id: 800, config: { gain: 0.6 } });
  graph.registerInstance('/consumer/trim', trim);
} else graph.configure(trim, { gain: 0.6 });
graph.disconnect(graph.output.input('in'));
graph.connect(output.output('out'), trim.input('audio'));
graph.connect(trim.output('out'), graph.output.input('in'));`;
$('script').value=draft;
function show(){const state=project?.toProject()??graph.toProject();$('graph').textContent=JSON.stringify({...state,assets:state.assets.map(({pcmF32Base64,...metadata})=>metadata)},null,2);if(host)$('health').textContent=JSON.stringify(host.diagnostics,null,2);}
function buttons(){ $('start').disabled=busy||Boolean(host);$('stop').disabled=busy||!host;$('run').disabled=busy||!host;$('save').disabled=busy; }
window.importedManifoldSample={get host(){return host;},get project(){return project;},get context(){return context;},get analyser(){return analyser;}};
$('start').onclick=async()=>{if(busy||host)return;busy=true;buttons();try{context=new AudioContext({sampleRate:48000});await context.suspend();host=new BrowserGraphHost(context,{execution:'prepared'});const session=createLiveGraphSession(graph,route=>host.setRoute(route),edit=>host.setParameter(edit),state=>host.replaceGraph(state),edits=>host.setParameterBatch(edits),()=>host.readPublishedParameters());project=createProject(host,graph,session);await host.prepare(project.toProject());await project.set(`${base}/pitchMode`,1);await project.set(`${base}/unison`,3);await project.set(`${base}/voice/1/gate`,.4);await project.set(`${base}/voice/8/gate`,.3);analyser=context.createAnalyser();host.connect(null,analyser);await project.activate();await context.resume();tick=setInterval(show,200);$('status').textContent='Running the imported library.';show();}catch(error){await host?.close();host=null;await context?.close();context=null;$('status').textContent=error.message;}finally{busy=false;buttons();}};
$('run').onclick=async()=>{if(busy||!host)return;busy=true;buttons();try{const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;const script=new AsyncFunction('graph',`"use strict";${$('script').value}`);await project.session.transaction(script);show();$('status').textContent='Accepted runtime graph script.';}catch(error){$('status').textContent=`Rejected; accepted graph retained: ${error.message}`;}finally{busy=false;buttons();}};
$('stop').onclick=async()=>{if(busy||!host)return;busy=true;buttons();try{clearInterval(tick);await project.session.adoptPublishedParameters(host.readPublishedParameters());graph=project.session.forkGraph();await host.close();host=null;await context.close();context=null;$('status').textContent='Stopped.';}catch(error){$('status').textContent=error.message;}finally{busy=false;buttons();}};
$('save').onclick=async()=>{if(busy)return;busy=true;buttons();try{if(host)await project.session.adoptPublishedParameters(host.readPublishedParameters());const url=URL.createObjectURL(new Blob([JSON.stringify(project?.toProject()??graph.toProject(),null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='manifold-consumer-graph.json';link.click();URL.revokeObjectURL(url);}catch(error){$('status').textContent=error.message;}finally{busy=false;buttons();}};
show();buttons();
