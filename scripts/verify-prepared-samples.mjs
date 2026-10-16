import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const {chromium}=createRequire(new URL('../web/package.json',import.meta.url))('playwright-core');
const site=process.env.MANIFOLD_SITE_URL??'https://wubulon.tailfac9f9.ts.net:4174';
const label=process.env.MANIFOLD_SAMPLE_PROOF_LABEL??'2026-09-30-prepared-samples';assert.match(label,/^[a-z0-9-]+$/);
const root=new URL(`../web/public/prepared-samples/${label}/`,import.meta.url);
await mkdir(root,{recursive:true});assert.deepEqual(await readdir(root),[],'Evidence destination exists');
const paths=['crates/manifold-core/src/graph.rs','crates/manifold-core/src/sample_region.rs','crates/manifold-core/src/sample_instrument.rs','crates/manifold-core/src/phase_vocoder.rs','crates/manifold-native/src/project.rs','crates/manifold-native/src/lib.rs','crates/manifold-native/tests/owned_sample_publication.rs','crates/manifold-native/tests/support/callback_heap.rs','crates/manifold-web/src/prepared_worklet.rs','packages/manifold-author/prepared-runtime.js','packages/manifold-author/prepared-compiler.js','packages/manifold-author/prepared-processor.js','packages/manifold-author/resource-history.js','packages/manifold-author/examples/rack-sample-eight-voice.mjs','packages/manifold-author/examples/rack-sample-eight-voice.d.mts','packages/manifold-author/runtime/manifold_prepared.wasm','packages/manifold-author/runtime/manifold_filter.wasm','web/src/rack-sample-eight-voice.js','web/rack-sample-eight-voice.html','scripts/verify-prepared-samples.mjs'];
const hashes={};for(const path of paths){const bytes=await readFile(new URL(`../${path}`,import.meta.url));hashes[path]=createHash('sha256').update(bytes).digest('hex');const destination=new URL('measured-source/'+path,root);await mkdir(new URL('.',destination),{recursive:true});await writeFile(destination,bytes);}
const native=execFileSync('cargo',['test','-p','manifold-native','--test','owned_sample_publication','--','--nocapture'],{cwd:new URL('..',import.meta.url),env:{...process.env,MANIFOLD_SAMPLE_PROOF_ROOT:root.pathname},encoding:'utf8'});await writeFile(new URL('native-tests.txt',root),native);
function wave(bytes,stream){const frames=bytes.length/16,out=Buffer.alloc(44+frames*8);out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(3,20);out.writeUInt16LE(2,22);out.writeUInt32LE(48000,24);out.writeUInt32LE(384000,28);out.writeUInt16LE(8,32);out.writeUInt16LE(32,34);out.write('data',36);out.writeUInt32LE(frames*8,40);for(let frame=0;frame<frames;frame++)bytes.copy(out,44+frame*8,frame*16+stream*8,frame*16+stream*8+8);return out;}
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});let evidence=null;
try{
 const page=await browser.newPage({viewport:{width:1250,height:1450}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(site+'/rack-sample-eight-voice.html');assert.equal(await page.evaluate(()=>crossOriginIsolated),true);
 await page.locator('#start').click();await page.waitForFunction(()=>window.manifoldRackSample.host?.ready);
 for(const voice of[1,8]){await page.locator(`#gate-${voice}`).evaluate(element=>{element.value='.4';});await page.locator(`#gate-${voice}`).dispatchEvent('change');await page.waitForFunction(()=>!document.querySelector('#mode').disabled);}
 await page.locator('#mode').selectOption('1');await page.waitForFunction(()=>!document.querySelector('#mode').disabled);
 await page.locator('#unison').selectOption('3');await page.waitForFunction(()=>!document.querySelector('#unison').disabled);
 await page.locator('#insert').click();await page.waitForFunction(()=>!document.querySelector('#insert').disabled);
 await page.waitForTimeout(150);
 const ui=await page.evaluate(()=>({state:window.manifoldRackSample.controller.toProject(),peakRms:window.manifoldRackSample.peakRms,diagnostics:window.manifoldRackSample.host.diagnostics}));
 await page.screenshot({path:new URL('live-editor.png',root).pathname,fullPage:true});await page.screenshot({path:new URL(`../docs/rearchitecture/evidence/${label}.png`,import.meta.url).pathname,fullPage:true});
 await page.locator('#stop').click();await page.waitForFunction(()=>!window.manifoldRackSample.host);
 const result=await page.evaluate(async()=>{
  const {Host,GraphWorkspace,createProject,createLiveGraphSession,fixture}=window.manifoldRackSample;
  const base='/midi/synth/rack/sample/1',sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const context=new AudioContext({sampleRate:48000});await context.suspend();
  const a=new Host(context,{execution:'prepared'}),b=new Host(context,{execution:'prepared'});
  function controller(host){const graph=GraphWorkspace.fromProject(fixture);for(let voice=1;voice<=8;voice++)graph.setParameter(graph.findInstance(`${base}/nodes/voice_${voice}/vocoder`),1,(voice-4)*.7);
   const session=createLiveGraphSession(graph,route=>host.setRoute(route),edit=>host.setParameter(edit),project=>host.replaceGraph(project),edits=>host.setParameterBatch(edits),()=>host.readPublishedParameters());return createProject(host,graph,session);}
  const p=controller(a),r=controller(b);await a.prepare(p.toProject());await b.prepare(r.toProject());
  for(const project of[p,r]){await project.set(`${base}/pitchMode`,1);await project.set(`${base}/unison`,3);await project.set(`${base}/detune`,19);await project.set(`${base}/spread`,.6);for(let voice=1;voice<=8;voice++)await project.set(`${base}/voice/${voice}/gate`,.11);}
  const tape=new SharedArrayBuffer(480000*16),control=new SharedArrayBuffer(12);
  const code=`class R extends AudioWorkletProcessor{constructor(o){super();this.t=new Float32Array(o.processorOptions.t);this.c=new Int32Array(o.processorOptions.c)}process(i,o){let n=Atomics.load(this.c,0),f=o[0][0].length;if(n===0)Atomics.store(this.c,1,currentFrame);if(n+f>this.t.length/4){Atomics.store(this.c,2,1);return true;}for(let k=0;k<f;k++){let p=(n+k)*4;this.t[p]=i[0]?.[0]?.[k]??0;this.t[p+1]=i[0]?.[1]?.[k]??0;this.t[p+2]=i[1]?.[0]?.[k]??0;this.t[p+3]=i[1]?.[1]?.[k]??0;o[0][0][k]=this.t[p];o[0][1][k]=this.t[p+1];}Atomics.store(this.c,0,n+f);return true;}}registerProcessor('sample-pair-recorder',R);`;
  const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));await context.audioWorklet.addModule(url);URL.revokeObjectURL(url);
  const recorder=new AudioWorkletNode(context,'sample-pair-recorder',{numberOfInputs:2,outputChannelCount:[2],processorOptions:{t:tape,c:control}}),aa=context.createGain(),bb=context.createGain();a.connect(null,aa);b.connect(null,bb);aa.connect(recorder,0,0);bb.connect(recorder,0,1);recorder.connect(context.destination);
  let inserted=false;async function insert(){await p.session.transaction(graph=>{const output=graph.findInstance(`${base}/nodes/output`);graph.disconnect(graph.output.input('in'));if(!inserted){const fx=graph.add('distortion',{id:900});graph.registerInstance('/proof/insert',fx);graph.setParameter(fx,1,0);graph.setParameter(fx,2,1);graph.connect(output.output('out'),fx.input('audio'));graph.connect(fx.output('out'),graph.output.input('in'));}else{graph.remove(graph.findInstance('/proof/insert'));graph.connect(output.output('out'),graph.output.input('in'));}});inserted=!inserted;}
  await context.resume();await sleep(150);const edits=[];
  for(let index=0;index<10;index++){
   const start=performance.now();
   if(index===4){await p.session.transaction(graph=>{
     const document=graph.toProject(),sampleParameters=document.signal.initialParameters.filter(p=>p.nodeId===7),gainParameters=document.signal.initialParameters.filter(p=>p.nodeId===6);
     graph.remove(graph.find(6));const gain=graph.add('gain',{id:1900});graph.registerInstance(`${base}/nodes/voice_1/gain`,gain);for(const p of gainParameters)graph.setParameter(gain,p.id,p.value);graph.connect(graph.find(5).output('out'),gain.input('audio'));graph.connect(gain.output('out'),graph.find(28).input('in-1'));
     graph.remove(graph.find(7));const sample=graph.add('sample-region',{id:7000});graph.registerInstance(`${base}/nodes/voice_2/playback`,sample);for(const p of sampleParameters)graph.setParameter(sample,p.id,p.value);graph.bindSampleAsset(graph.find(4),sample);graph.connect(sample.output('out'),graph.find(8).input('audio'));
   });}else await insert();
   edits.push({index,totalMs:performance.now()-start,diagnostics:a.diagnostics});await sleep(20);
  }
  await context.suspend();for(const project of[p,r]){await project.set(`${base}/pitchMode`,2);await project.set(`${base}/pvocTimeStretch`,1.37);await project.set(`${base}/voice/1/gate`,.23);await project.set(`${base}/voice/2/vOct`,67);}
  await context.resume();await sleep(150);await insert();await sleep(100);await context.suspend();
  const frames=new Int32Array(control)[0],pcm=new Float32Array(tape,0,frames*4);let peak=0,maxDifference=0,differingSamples=0;for(let frame=0;frame<frames;frame++)for(let channel=0;channel<2;channel++){const difference=Math.abs(pcm[frame*4+channel]-pcm[frame*4+2+channel]);peak=Math.max(peak,Math.abs(pcm[frame*4+channel]));maxDifference=Math.max(maxDifference,difference);if(difference)differingSamples++;}
  function encode(bytes){let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);}
  const pair={frames,overflow:new Int32Array(control)[2]!==0,peak,maxDifference,differingSamples,edits,primary:a.diagnostics,reference:b.diagnostics,pcmBase64:encode(new Uint8Array(tape,0,pcm.byteLength))};
  await p.session.adoptPublishedParameters(a.readPublishedParameters());const saved=p.toProject();
  // A changed Region source resets all seven bindings and wet downstream tails.
  await p.session.transaction(graph=>graph.setSampleAsset(graph.find(4),new Float32Array(4096).fill(.37),48000,'Explicit shared replacement'));
  await context.resume();await sleep(100);await context.suspend();const changedStart=new Int32Array(control)[0];
  await context.resume();await sleep(100);await context.suspend();const changedEnd=new Int32Array(control)[0];let replacedPeak=0;for(let frame=changedStart;frame<changedEnd;frame++)for(let channel=0;channel<2;channel++)replacedPeak=Math.max(replacedPeak,Math.abs(new Float32Array(tape)[frame*4+channel]));
  // Script commands after noncontiguous edits resolve the accepted path.
  await p.set(`${base}/voice/2/gate`,0);await p.set(`${base}/voice/2/gate`,.3);await context.resume();await sleep(150);await context.suspend();const analyzer=context.createAnalyser();a.connect(null,analyzer);await context.resume();await sleep(100);const resumed=new Float32Array(analyzer.fftSize);analyzer.getFloatTimeDomainData(resumed);let replacementTriggeredPeak=0;for(const v of resumed)replacementTriggeredPeak=Math.max(replacementTriggeredPeak,Math.abs(v));await context.suspend();
  let rejection=null;const before=p.toProject();try{await p.session.transaction(graph=>graph.add('granulator',{id:999}));}catch(error){rejection=error.message;}const rollback=JSON.stringify(before)===JSON.stringify(p.toProject());
  const final=a.diagnostics;await a.close();await b.close();await context.close();
  const reopenedContext=new AudioContext({sampleRate:48000});await reopenedContext.suspend();const reopened=new Host(reopenedContext,{execution:'prepared'}),reopenGraph=GraphWorkspace.fromProject(saved),reopenProject=createProject(reopened,reopenGraph);await reopened.prepare(saved);await reopenProject.activate();const meter=reopenedContext.createAnalyser();reopened.connect(null,meter);await reopenedContext.resume();await sleep(200);const reopenedPCM=new Float32Array(meter.fftSize);meter.getFloatTimeDomainData(reopenedPCM);let reopenedPeak=0;for(const v of reopenedPCM)reopenedPeak=Math.max(reopenedPeak,Math.abs(v));await reopenedContext.suspend();const reopenDiagnostics=reopened.diagnostics;await reopened.close();await reopenedContext.close();
  // A generic consumer authors an Instrument directly from public primitives.
  // Held notes must stay on their old PCM through repeated authored replacements.
  const instrumentContext=new AudioContext({sampleRate:48000});await instrumentContext.suspend();
  const instrumentGraph=new GraphWorkspace(),midi=instrumentGraph.add('midi-input',{id:2}),sampler=instrumentGraph.add('sample-instrument',{id:4}),vocoder=instrumentGraph.add('phase-vocoder',{id:5}),gain=instrumentGraph.add('gain',{id:6});
  for(const [path,node]of[['/instrument/midi',midi],['/instrument/sample',sampler],['/instrument/vocoder',vocoder],['/instrument/gain',gain]])instrumentGraph.registerInstance(path,node);
  instrumentGraph.connect(midi.output('out'),sampler.input('midi'));instrumentGraph.connect(sampler.output('out'),vocoder.input('audio'));instrumentGraph.connect(vocoder.output('out'),gain.input('audio'));instrumentGraph.connect(gain.output('out'),instrumentGraph.output.input('in'));
  const instrumentPCM=Float32Array.from({length:8192*2},(_,i)=>Math.sin(Math.floor(i/2)*.057)*.4*(i%2?.71:1));instrumentGraph.setSampleAsset(sampler,instrumentPCM,48000,'Initial Instrument source');
  for(const[id,value]of[[11,4],[12,21],[13,.7],[10,.15]])instrumentGraph.setParameter(sampler,id,value);instrumentGraph.setParameter(vocoder,3,1);instrumentGraph.setParameter(vocoder,1,3);instrumentGraph.setParameter(gain,0,.25);
  const ia=new Host(instrumentContext,{execution:'prepared'}),ib=new Host(instrumentContext,{execution:'prepared'});
  await ia.prepare(instrumentGraph.toProject());await ib.prepare(instrumentGraph.toProject());
  const instrumentSession=createLiveGraphSession(instrumentGraph,route=>ia.setRoute(route),edit=>ia.setParameter(edit),state=>ia.replaceGraph(state),edits=>ia.setParameterBatch(edits),()=>ia.readPublishedParameters());
  const instrumentTape=new SharedArrayBuffer(480000*16),instrumentControl=new SharedArrayBuffer(12),instrumentUrl=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));await instrumentContext.audioWorklet.addModule(instrumentUrl);URL.revokeObjectURL(instrumentUrl);
  const instrumentRecorder=new AudioWorkletNode(instrumentContext,'sample-pair-recorder',{numberOfInputs:2,outputChannelCount:[2],processorOptions:{t:instrumentTape,c:instrumentControl}}),iga=instrumentContext.createGain(),igb=instrumentContext.createGain();ia.connect(null,iga);ib.connect(null,igb);iga.connect(instrumentRecorder,0,0);igb.connect(instrumentRecorder,0,1);instrumentRecorder.connect(instrumentContext.destination);
  for(const host of[ia,ib])await host.sendEventBatch([{nodeId:2,kind:0,channel:1,note:67,velocity:100,offset:19}]);
  await instrumentContext.resume();await sleep(150);const instrumentEdits=[];
  for(let index=0;index<8;index++){const start=performance.now();await instrumentSession.transaction(graph=>graph.setSampleAsset(graph.find(4),new Float32Array(8192*2).fill(.1+index*.03),48000,`Source ${index+1}`));instrumentEdits.push({index,totalMs:performance.now()-start,diagnostics:ia.diagnostics});await sleep(20);}
  await instrumentContext.suspend();const heldFrames=new Int32Array(instrumentControl)[0],instrumentPcm=new Float32Array(instrumentTape);let heldDifference=0,heldDifferentSamples=0,heldPeak=0;
  for(let frame=0;frame<heldFrames;frame++)for(let channel=0;channel<2;channel++){const delta=Math.abs(instrumentPcm[frame*4+channel]-instrumentPcm[frame*4+2+channel]);heldDifference=Math.max(heldDifference,delta);if(delta)heldDifferentSamples++;heldPeak=Math.max(heldPeak,Math.abs(instrumentPcm[frame*4+channel]));}
  for(const host of[ia,ib])await host.sendEventBatch([{nodeId:2,kind:0,channel:1,note:72,velocity:100,offset:19}]);
  await instrumentContext.resume();await sleep(200);await instrumentContext.suspend();const instrumentFrames=new Int32Array(instrumentControl)[0];let newNoteDifference=0;for(let frame=heldFrames;frame<instrumentFrames;frame++)for(let channel=0;channel<2;channel++)newNoteDifference=Math.max(newNoteDifference,Math.abs(instrumentPcm[frame*4+channel]-instrumentPcm[frame*4+2+channel]));
  const instrument={frames:instrumentFrames,heldFrames,heldDifference,heldDifferentSamples,heldPeak,newNoteDifference,edits:instrumentEdits,primary:ia.diagnostics,reference:ib.diagnostics,pcmBase64:encode(new Uint8Array(instrumentTape,0,instrumentFrames*16)),overflow:new Int32Array(instrumentControl)[2]!==0};
  await ia.sendEventBatch([{nodeId:2,kind:2}]);await instrumentContext.resume();await sleep(100);await instrumentContext.suspend();
  await instrumentSession.transaction(graph=>graph.setSampleAsset(graph.find(4),new Float32Array(8192*2).fill(.71),48000,'Idle voice reuse source'));
  const idleStart=new Int32Array(instrumentControl)[0],idleBefore=ia.diagnostics.eventsConsumed;
  await ia.sendEventBatch(Array.from({length:8},(_,index)=>({nodeId:2,kind:0,note:36+index,velocity:100,offset:19})));
  await instrumentContext.resume();await sleep(150);await instrumentContext.suspend();const idleEnd=new Int32Array(instrumentControl)[0];
  instrument.idleReuse={frames:idleEnd-idleStart,eventsConsumed:ia.diagnostics.eventsConsumed-idleBefore,diagnostics:ia.diagnostics};
  instrument.idlePcmBase64=encode(new Uint8Array(instrumentTape,idleStart*16,(idleEnd-idleStart)*16));
  await instrumentSession.adoptPublishedParameters(ia.readPublishedParameters());const instrumentSaved=instrumentSession.toProject();await ia.close();await ib.close();await instrumentContext.close();
  return{pair,saved,replacedPeak,replacementTriggeredPeak,rejection,rollback,final,reopenedPeak,reopenDiagnostics,instrument,instrumentSaved};
 });
 const pcm=Buffer.from(result.pair.pcmBase64,'base64');delete result.pair.pcmBase64;await writeFile(new URL('browser-edited.wav',root),wave(pcm,0));await writeFile(new URL('browser-reference.wav',root),wave(pcm,1));await writeFile(new URL('browser-saved.json',root),JSON.stringify(result.saved,null,2));delete result.saved;
 const instrumentPcm=Buffer.from(result.instrument.pcmBase64,'base64');delete result.instrument.pcmBase64;await writeFile(new URL('instrument-edited.wav',root),wave(instrumentPcm,0));await writeFile(new URL('instrument-old-source-reference.wav',root),wave(instrumentPcm,1));await writeFile(new URL('instrument-saved.json',root),JSON.stringify(result.instrumentSaved,null,2));delete result.instrumentSaved;
 const idlePcm=Buffer.from(result.instrument.idlePcmBase64,'base64');delete result.instrument.idlePcmBase64;await writeFile(new URL('instrument-idle-reuse.wav',root),wave(idlePcm,0));
 const cdp=await browser.newBrowserCDPSession(),workers=(await cdp.send('Target.getTargets')).targetInfos.filter(target=>target.type==='worker'&&target.url.includes('prepared-compiler'));
 evidence={recordedAt:new Date().toISOString(),site,chromiumVersion:browser.version(),hashes,ui,...result,workersAfterClose:workers,pageErrors:errors};
 await writeFile(new URL('report.json',root),JSON.stringify(evidence,null,2));
 assert.ok(ui.peakRms>.005);assert.equal(result.pair.overflow,false);assert.ok(result.pair.peak>.01);assert.equal(result.pair.maxDifference,0);assert.equal(result.pair.differingSamples,0);
 assert.equal(result.replacedPeak,0);assert.ok(result.replacementTriggeredPeak>.005);assert.ok(result.rejection);assert.equal(result.rollback,true);assert.ok(result.reopenedPeak>.005);
 for(const host of[result.pair.primary,result.pair.reference,result.final,result.reopenDiagnostics,result.instrument.primary,result.instrument.reference,result.instrument.idleReuse.diagnostics])for(const key of['rustCallbackAllocations','rustCallbackDeallocations','rustProcessingFailures'])assert.equal(host[key],0);
 assert.equal(result.instrument.idleReuse.eventsConsumed,8);assert.ok(result.instrument.idleReuse.frames>128);assert.equal(result.instrument.overflow,false);assert.equal(result.instrument.heldDifference,0);assert.equal(result.instrument.heldDifferentSamples,0);assert.ok(result.instrument.heldPeak>.005);assert.ok(result.instrument.newNoteDifference>.005);
 assert.deepEqual(workers,[]);assert.deepEqual(errors,[]);for(const path of paths)assert.equal(createHash('sha256').update(await readFile(new URL(`../${path}`,import.meta.url))).digest('hex'),hashes[path]);
 await writeFile(new URL(`../docs/rearchitecture/evidence/${label}.json`,import.meta.url),JSON.stringify(evidence,null,2));
 console.log(JSON.stringify({frames:result.pair.frames,maxDifference:result.pair.maxDifference,edits:result.pair.edits.length,replacedPeak:result.replacedPeak,replacementTriggeredPeak:result.replacementTriggeredPeak,reopenedPeak:result.reopenedPeak,workers:workers.length}));
}catch(error){await writeFile(new URL('failure.json',root),JSON.stringify({error:error.stack,evidence},null,2));throw error;}finally{await browser.close();}
