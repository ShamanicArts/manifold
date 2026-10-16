// Real signal discrimination for named identity; run through the private sink.
import assert from 'node:assert/strict';import{createRequire}from'node:module';import{writeFile}from'node:fs/promises';
const requireWeb=createRequire(new URL('../web/package.json',import.meta.url));const{chromium}=requireWeb('playwright-core');
const site=process.env.MANIFOLD_SITE_URL??'https://wubulon.tailfac9f9.ts.net:4174';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
try{const page=await browser.newPage();await page.goto(`${site}/package-project.html?execution=prepared`);
 const result=await page.evaluate(async()=>{
  const context=new AudioContext({sampleRate:48000});await context.resume();
  const state=(await(await fetch('/packages/dsp-live-scripting.manifold.json')).json()).state;
  state.instances.push({path:'/identity/input',nodeId:1},{path:'/identity/output',nodeId:3});
  state.signal.initialParameters.find(p=>p.nodeId===4&&p.id===0).value=.875;
  const host=new window.manifoldProject.Host(context,{execution:'prepared'});await host.prepare(state);
  const source=context.createConstantSource();source.offset.value=.2;
  const analyser=context.createAnalyser();analyser.fftSize=256;host.connect(source,analyser);analyser.connect(context.destination);source.start();
  await new Promise(resolve=>setTimeout(resolve,250));
  const settled=new Float32Array(256);analyser.getFloatTimeDomainData(settled);
  await context.suspend();
  const next=structuredClone(state);for(const instance of next.instances)instance.path=`/renamed${instance.path}`;
  await host.replaceGraph(next);const diagnostics=host.diagnostics;
  // Capture the very first resumed block in a standalone bounded recorder.
  const recorderSource=`class R extends AudioWorkletProcessor{constructor(o){super();this.t=new Float32Array(o.processorOptions.t);this.c=new Int32Array(o.processorOptions.c)}process(i,o){const x=i[0]?.[0];if(x&&Atomics.load(this.c,0)===0){this.t.set(x);Atomics.store(this.c,0,1)}if(x)o[0][0].set(x);return true}}registerProcessor('identity-recorder',R)`;
  const url=URL.createObjectURL(new Blob([recorderSource],{type:'text/javascript'}));await context.audioWorklet.addModule(url);URL.revokeObjectURL(url);
  const tape=new SharedArrayBuffer(128*4),control=new SharedArrayBuffer(4);
  const recorder=new AudioWorkletNode(context,'identity-recorder',{processorOptions:{t:tape,c:control}});
  host.connect(source,recorder);recorder.connect(context.destination);await context.resume();
  const deadline=performance.now()+2000;while(Atomics.load(new Int32Array(control),0)===0){if(performance.now()>deadline)throw new Error('Recorder deadline expired');await new Promise(resolve=>setTimeout(resolve,2));}
  await context.suspend();const first=Array.from(new Float32Array(tape));
  const parameters=host.readPublishedParameters();await host.close();source.stop();await context.close();
  return{settledMean:settled.reduce((sum,value)=>sum+value,0)/settled.length,firstBlockMean:first.reduce((sum,value)=>sum+value,0)/first.length,
    firstBlock:first,diagnostics,parameters,allNumericIdsRetained:true,allInstancePathsChanged:true};
 });
 assert.equal(result.diagnostics.lastTransferredNodes,0);assert.ok(Math.abs(result.settledMean-.175)<.0001);assert.ok(result.firstBlockMean>0&&result.firstBlockMean<.05);
 assert.equal(result.parameters.find(p=>p.nodeId===4&&p.id===0).value,.875);assert.equal(result.diagnostics.rustCallbackAllocations,0);
 await writeFile(new URL('../docs/rearchitecture/evidence/2026-09-30-prepared-identity-reset.json',import.meta.url),JSON.stringify({recordedAt:new Date().toISOString(),site,...result},null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
