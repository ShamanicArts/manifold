// Exercise the importable browser host through a real browser and private audio.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile, access } from 'node:fs/promises';
const requireWeb=createRequire(new URL('../web/package.json',import.meta.url));
const{chromium}=requireWeb('playwright-core');
const site=process.env.MANIFOLD_SITE_URL??'https://wubulon.tailfac9f9.ts.net:4174';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const label=process.env.MANIFOLD_PUBLIC_PREPARED_PROOF_LABEL??'2026-09-30-public-prepared-runtime-v2';
assert.match(label,/^[a-z0-9-]+$/);
const reportPath=new URL(`../docs/rearchitecture/evidence/${label}.json`,import.meta.url);
try { await access(reportPath); throw new Error('Measurement destination already exists'); } catch(error) { if(error.code!=='ENOENT') throw error; }
const steps=[];
try{
 const page=await browser.newPage({viewport:{width:1200,height:1100}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  const Original=window.Worker;
  window.preparedSubmissionCount=0;window.preparedDelayMs=0;
  window.Worker=class extends Original{
   postMessage(message,...rest){
    if(message.type==='prepare'){
     window.preparedSubmissionCount++;
     if(window.preparedDelayMs){setTimeout(()=>super.postMessage(message,...rest),window.preparedDelayMs);return;}
    }
    return super.postMessage(message,...rest);
   }
  };
 });
 await page.goto(`${site}/package-project.html?execution=prepared`);await page.locator('#load').click();
 await page.waitForFunction(()=>window.manifoldProject.host?.ready,null,{timeout:20_000});
 const initial=await page.evaluate(()=>({state:window.manifoldProject.controller.toProject(),parameters:window.manifoldProject.host.readPublishedParameters(),diagnostics:window.manifoldProject.host.diagnostics}));steps.push({name:'initial',...initial});
 assert.equal(initial.diagnostics.execution,'prepared');
 const f32=await page.evaluate(async()=>{const{host,controller}=window.manifoldProject;await controller.set('/dsp/live/input_gain',.123456789);return{parameters:host.readPublishedParameters(),state:controller.toProject()};});
 assert.equal(f32.parameters.find(p=>p.nodeId===4&&p.id===0).value,Math.fround(.123456789));assert.equal(f32.state.signal.initialParameters.find(p=>p.nodeId===4&&p.id===0).value,Math.fround(.123456789));steps.push({name:'actual-f32-target',...f32});
 await page.evaluate(async()=>{const{host,controller}=window.manifoldProject;await host.setParameter({nodeId:4,id:0,value:.375});await controller.synchronizeParameters();window.preparedDelayMs=100;window.preparedSubmittedBefore=window.preparedSubmissionCount;window.pendingAuthoredEdit=controller.setDistortion(true);});
 await page.waitForFunction(()=>window.preparedSubmissionCount>window.preparedSubmittedBefore);
 const concurrent=await page.evaluate(async()=>{const{host,controller}=window.manifoldProject;await host.setParameter({nodeId:4,id:0,value:.625});await window.pendingAuthoredEdit;window.preparedDelayMs=0;return{parameters:host.readPublishedParameters(),state:controller.toProject(),diagnostics:host.diagnostics};});
 assert.equal(concurrent.parameters.find(p=>p.nodeId===4&&p.id===0).value,.625);assert.equal(concurrent.state.signal.initialParameters.find(p=>p.nodeId===4&&p.id===0).value,.625);steps.push({name:'automation-during-preparation',...concurrent});
 await page.evaluate(()=>{window.preparedDelayMs=100;window.preparedSubmittedBefore=window.preparedSubmissionCount;const{controller}=window.manifoldProject;window.pendingAuthoredEdit=controller.session.transaction(graph=>{
  const previous=graph.findInstance('/dsp/live/nodes/input_trim'),current=graph.toProject();const value=current.signal.initialParameters.find(p=>p.nodeId===previous.id&&p.id===0).value;
  graph.remove(previous);const gain=graph.add('gain',{id:14});graph.registerInstance('/dsp/live/nodes/input_trim',gain);
  graph.setParameter(gain,0,value);graph.registerParameter('/dsp/live/input_gain',gain,0,{min:0,max:2,default:1});graph.bindHostSlot(0,gain,0);
  graph.connect(graph.input.output('out'),gain.input('audio'));const distortion=graph.findInstance('/dsp/live/nodes/distortion');graph.connect(gain.output('out'),distortion.input('audio'));
 });});
 await page.waitForFunction(()=>window.preparedSubmissionCount>window.preparedSubmittedBefore);
 const renamed=await page.evaluate(async()=>{const{host,controller}=window.manifoldProject;await host.setParameter({nodeId:4,id:0,value:.875});await window.pendingAuthoredEdit;window.preparedDelayMs=0;return{parameters:host.readPublishedParameters(),state:controller.toProject(),diagnostics:host.diagnostics};});
 assert.equal(renamed.parameters.find(p=>p.nodeId===14&&p.id===0).value,.875);assert.equal(renamed.state.signal.initialParameters.find(p=>p.nodeId===14&&p.id===0).value,.875);assert.ok(renamed.diagnostics.lastTransferredNodes>=2);steps.push({name:'stable-path-renumber-and-automation',...renamed});
 const explicit=await page.evaluate(async()=>{const{host,controller}=window.manifoldProject;await controller.session.transaction(graph=>graph.setParameter(graph.findInstance('/dsp/live/nodes/input_trim'),0,.5));return{parameters:host.readPublishedParameters(),state:controller.toProject(),diagnostics:host.diagnostics};});assert.equal(explicit.parameters.find(p=>p.nodeId===14&&p.id===0).value,.5);steps.push({name:'explicit-author-target',...explicit});
 const route=await page.evaluate(async()=>{const{host,controller}=window.manifoldProject;await controller.routeOutput('/dsp/live/nodes/input_trim');return{state:controller.toProject(),diagnostics:host.diagnostics};});assert.equal(route.state.signal.connections.find(e=>e.to===3).from,14);steps.push({name:'public-route',...route});
 const suspended=await page.evaluate(async()=>{const{host,controller,context}=window.manifoldProject;await context.suspend();const before=host.diagnostics;
  await host.setParameter({nodeId:14,id:0,value:.25});await controller.session.transaction(graph=>graph.setParameter(graph.findInstance('/dsp/live/nodes/input_trim'),0,.75));
  const after=host.diagnostics,state=controller.toProject(),parameters=host.readPublishedParameters();await context.resume();return{before,after,state,parameters};});assert.equal(suspended.parameters.find(p=>p.nodeId===14&&p.id===0).value,.75);assert.equal(suspended.after.audioBlocks,suspended.before.audioBlocks);steps.push({name:'suspended-authoring',...suspended});
 const rejected=await page.evaluate(async()=>{const{host,controller}=window.manifoldProject;const before=controller.toProject();let message=null;try{const bad=structuredClone(before);bad.signal.nodes.find(n=>n.id===14).a=.123;await host.replaceGraph(bad);}catch(error){message=error.message;}await controller.session.transaction(graph=>graph.setParameter(graph.findInstance('/dsp/live/nodes/input_trim'),0,.625));return{message,before,after:controller.toProject(),diagnostics:host.diagnostics};});assert.ok(rejected.message);assert.equal(rejected.after.signal.initialParameters.find(p=>p.nodeId===14&&p.id===0).value,.625);steps.push({name:'rejection-and-recovery',...rejected});
 const tail=await page.evaluate(async()=>{const{host,context}=window.manifoldProject;const before=host.diagnostics;await new Promise(r=>setTimeout(r,500));await context.suspend();const after=host.diagnostics;await context.resume();return{before,after};});assert.equal(tail.after.audioBlocks-tail.before.audioBlocks,tail.after.rustProcessedBlocks-tail.before.rustProcessedBlocks);assert.equal(tail.after.rustCallbackAllocations,0);assert.equal(tail.after.rustCallbackDeallocations,0);assert.equal(tail.after.rustProcessingFailures,0);steps.push({name:'one-rust-process-per-block',...tail});
 const shutdown=await page.evaluate(async()=>{const{host,context}=window.manifoldProject;await host.close();const before=host.diagnostics;await new Promise(r=>setTimeout(r,500));const after=host.diagnostics;return{before,after,contextState:context.state};});
 assert.equal(shutdown.contextState,'running');assert.equal(shutdown.after.audioBlocks,shutdown.before.audioBlocks);assert.equal(shutdown.after.memoryBytes,0);steps.push({name:'shutdown-with-live-context',...shutdown});
 const cold=await page.evaluate(async()=>{
  const context=new AudioContext({sampleRate:48000});await context.suspend();const state=(await(await fetch('/packages/dsp-live-scripting.manifold.json')).json()).state;
  const host=new window.manifoldProject.Host(context,{execution:'prepared'});await host.prepare(state);const before=host.diagnostics;
  await host.setParameter({nodeId:4,id:0,value:.25});state.signal.initialParameters.find(p=>p.nodeId===4&&p.id===0).value=.5;
  await host.replaceGraph(state);const parameters=host.readPublishedParameters(),after=host.diagnostics;await host.close();await context.close();return{before,after,parameters};
 });assert.equal(cold.after.audioBlocks,cold.before.audioBlocks);assert.equal(cold.parameters.find(p=>p.nodeId===4&&p.id===0).value,.5);steps.push({name:'cold-suspended-load-and-edit',...cold});
 const cancelled=await page.evaluate(async()=>{
  const context=new AudioContext({sampleRate:48000});await context.resume();const state=(await(await fetch('/packages/dsp-live-scripting.manifold.json')).json()).state;
  const host=new window.manifoldProject.Host(context,{execution:'prepared'});await host.prepare(state);
  window.preparedDelayMs=100;const submitted=window.preparedSubmissionCount;
  const pending=host.replaceGraph(state).then(()=>({accepted:true}),error=>({error:error.message}));
  while(window.preparedSubmissionCount===submitted)await new Promise(r=>setTimeout(r,2));
  const close=host.close(),same=close===host.close();await close;const result=await pending;await context.close();window.preparedDelayMs=0;return{same,result,diagnostics:host.diagnostics};
 });assert.ok(cancelled.same);assert.ok(cancelled.result.error.includes('closed'));assert.equal(cancelled.diagnostics.memoryBytes,0);steps.push({name:'close-during-preparation',...cancelled});
 await page.screenshot({path:new URL(`../docs/rearchitecture/evidence/${label}.png`,import.meta.url).pathname,fullPage:true});
 await page.locator('#stop').click();await page.waitForFunction(()=>!window.manifoldProject.host);
 const cdp=await browser.newBrowserCDPSession();const afterClose=(await cdp.send('Target.getTargets')).targetInfos.filter(t=>t.type==='worker'&&t.url.includes('prepared-compiler'));assert.deepEqual(afterClose,[]);assert.deepEqual(errors,[]);
 const report={recordedAt:new Date().toISOString(),site,chromiumVersion:browser.version(),steps,workersAfterClose:afterClose,pageErrors:errors};await writeFile(new URL(`../docs/rearchitecture/evidence/${label}.json`,import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify({steps:steps.map(s=>({name:s.name,diagnostics:s.diagnostics})),workersAfterClose:afterClose}));
}catch(error){await writeFile(new URL(`../docs/rearchitecture/evidence/${label}-failure.json`,import.meta.url),JSON.stringify({recordedAt:new Date().toISOString(),error:error.stack,completedSteps:steps},null,2));throw error;}finally{await browser.close();}
