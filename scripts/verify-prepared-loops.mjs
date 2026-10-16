import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const { chromium } = createRequire(new URL('../web/package.json', import.meta.url))('playwright-core');
const site = process.env.MANIFOLD_SITE_URL ?? 'https://wubulon.tailfac9f9.ts.net:4174';
const label = process.env.MANIFOLD_PREPARED_LOOP_PROOF_LABEL ?? '2026-09-30-prepared-loops';
assert.match(label,/^[a-z0-9-]+$/);
const output = new URL(`../web/public/prepared-loops/${label}/`,import.meta.url);
await mkdir(output,{recursive:true});assert.deepEqual(await readdir(output),[],'Evidence destination exists');
const paths=['crates/manifold-core/src/graph.rs','crates/manifold-core/src/loop_capture.rs','crates/manifold-web/src/prepared_worklet.rs',
  'packages/manifold-author/prepared-runtime.js','packages/manifold-author/prepared-compiler.js','packages/manifold-author/prepared-processor.js',
  'packages/manifold-author/browser.js','packages/manifold-author/index.js','packages/manifold-author/sample-assets.js',
  'packages/manifold-author/examples/four-layer-loops.mjs','packages/manifold-author/examples/loop-authoring.mjs',
  'packages/manifold-author/runtime/manifold_prepared.wasm','web/src/prepared-loops.js'];
const hashes={};await mkdir(new URL('measured-source/',output));
for(const path of paths){const bytes=await readFile(new URL(`../${path}`,import.meta.url));hashes[path]=createHash('sha256').update(bytes).digest('hex');await writeFile(new URL(`measured-source/${path.split('/').at(-1)}`,output),bytes);}
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
let evidence=null;
function wave(bytes,stream){const frames=bytes.length/16,out=Buffer.alloc(44+frames*8);out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVE',8);out.write('fmt ',12);out.writeUInt32LE(16,16);out.writeUInt16LE(3,20);out.writeUInt16LE(2,22);out.writeUInt32LE(48000,24);out.writeUInt32LE(384000,28);out.writeUInt16LE(8,32);out.writeUInt16LE(32,34);out.write('data',36);out.writeUInt32LE(frames*8,40);for(let frame=0;frame<frames;frame++)bytes.copy(out,44+frame*8,frame*16+stream*8,frame*16+stream*8+8);return out;}
try{
  const page=await browser.newPage({viewport:{width:1250,height:1200}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${site}/prepared-loops.html`);assert.equal(await page.evaluate(()=>crossOriginIsolated),true);
  await page.locator('#start').click();await page.waitForFunction(()=>!document.querySelector('#stop').disabled||!document.querySelector('#start').disabled);
  assert.equal(await page.evaluate(()=>Boolean(window.manifoldPreparedLoops.host?.ready)),true,await page.locator('#status').textContent());
  await page.locator('input[data-layer="1"][data-parameter="0"]').check();await page.waitForFunction(()=>!document.querySelector('#insert').disabled);
  await page.waitForTimeout(150);await page.locator('#insert').click();await page.waitForFunction(()=>!document.querySelector('#insert').disabled);
  await page.locator('input[data-layer="1"][data-parameter="0"]').uncheck();await page.waitForFunction(()=>!document.querySelector('#insert').disabled);
  await page.locator('input[data-layer="1"][data-parameter="1"]').check();await page.waitForFunction(()=>!document.querySelector('#insert').disabled);
  const ui=await page.evaluate(()=>({graph:window.manifoldPreparedLoops.project.toProject(),diagnostics:window.manifoldPreparedLoops.host.diagnostics}));
  await page.screenshot({path:new URL(`../docs/rearchitecture/evidence/${label}.png`,import.meta.url).pathname,fullPage:true});
  await page.locator('#stop').click();await page.waitForFunction(()=>!window.manifoldPreparedLoops.host);
  const result=await page.evaluate(async()=>{
    const{Host,createProject}=window.manifoldPreparedLoops,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const context=new AudioContext({sampleRate:48000});await context.suspend();
    const a=new Host(context,{execution:'prepared'}),b=new Host(context,{execution:'prepared'}),p=createProject(a),r=createProject(b);
    await a.prepare(p.toProject());await b.prepare(r.toProject());
    const tape=new SharedArrayBuffer(480000*16),control=new SharedArrayBuffer(12);
    const code=`class R extends AudioWorkletProcessor{constructor(o){super();this.t=new Float32Array(o.processorOptions.t);this.c=new Int32Array(o.processorOptions.c)}process(i,o){let n=Atomics.load(this.c,0),f=o[0][0].length;if(n===0)Atomics.store(this.c,1,currentFrame);if(n+f>this.t.length/4){Atomics.store(this.c,2,1);return true;}for(let k=0;k<f;k++){let p=(n+k)*4;this.t[p]=i[0]?.[0]?.[k]??0;this.t[p+1]=i[0]?.[1]?.[k]??0;this.t[p+2]=i[1]?.[0]?.[k]??0;this.t[p+3]=i[1]?.[1]?.[k]??0;o[0][0][k]=this.t[p];o[0][1][k]=this.t[p+1];}Atomics.store(this.c,0,n+f);return true;}}registerProcessor('loop-pair-recorder',R);`;
    const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));await context.audioWorklet.addModule(url);URL.revokeObjectURL(url);
    const recorder=new AudioWorkletNode(context,'loop-pair-recorder',{numberOfInputs:2,outputChannelCount:[2],processorOptions:{t:tape,c:control}});
    const aa=context.createGain(),bb=context.createGain();a.connect(null,aa);b.connect(null,bb);aa.connect(recorder,0,0);bb.connect(recorder,0,1);recorder.connect(context.destination);
    const record=Array.from({length:4},(_,i)=>({nodeId:70+i,id:0,value:1}));await a.setParameterBatch(record);await b.setParameterBatch(record);
    let activeSaveError=null;try{await p.snapshot();}catch(error){activeSaveError=error.message;}
    await context.resume();await sleep(150);const edits=[];
    for(let i=0;i<4;i++){const start=performance.now();await p.setInsert(i%2===0,0);edits.push({stage:'recording',index:i,totalMs:performance.now()-start,diagnostics:a.diagnostics});await sleep(50);}
    await context.suspend();const transport=Array.from({length:4},(_,i)=>[{nodeId:70+i,id:0,value:0},{nodeId:70+i,id:1,value:1}]).flat();
    await a.setParameterBatch(transport);await b.setParameterBatch(transport);await context.resume();await sleep(150);
    for(let i=0;i<8;i++){const start=performance.now();await p.setInsert(i%2===0,0);edits.push({stage:'playing',index:i,totalMs:performance.now()-start,diagnostics:a.diagnostics});await sleep(50);}
    await context.suspend();const cursorBefore=await a.captureCursor(80);
    await p.session.transaction(graph=>{
      const loop=graph.findInstance('/rack_host/layers/1/loop'),parameters=graph.toProject().signal.initialParameters.filter(entry=>entry.nodeId===loop.id);
      graph.remove(loop);const next=graph.add('loop-capture',{id:170});graph.registerInstance('/rack_host/layers/1/loop',next);
      for(const entry of parameters)graph.setParameter(next,entry.id,entry.value);
      graph.connect(graph.findInstance('/loop/audition/trim').output('out'),next.input('audio'));graph.connect(next.output('out'),graph.findInstance('/loop/audition/mix').input('in-1'));
    });
    const cursorAfter=await a.captureCursor(80);await context.resume();await sleep(150);
    // Match control edits and overdub scheduling at an exact suspended boundary.
    await context.suspend();for(const h of[a,b])await h.setParameterBatch([{nodeId:71,id:2,value:1},{nodeId:71,id:3,value:1.33},{nodeId:71,id:4,value:1}]);
    await context.resume();await sleep(60);await p.setInsert(true,0);await sleep(100);await p.setInsert(false,0);await sleep(60);
    await context.suspend();for(const h of[a,b])await h.setParameter({nodeId:71,id:2,value:0});
    const frames=new Int32Array(control)[0],pcm=new Float32Array(tape,0,frames*4);let maxDifference=0,differingSamples=0,peak=0;
    for(let i=0;i<pcm.length;i+=4)for(let c=0;c<2;c++){const d=Math.abs(pcm[i+c]-pcm[i+c+2]);maxDifference=Math.max(maxDifference,d);if(d!==0)differingSamples++;peak=Math.max(peak,Math.abs(pcm[i+c]));}
    const bytes=new Uint8Array(tape,0,pcm.byteLength);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const takes=[];for(let layer=0;layer<4;layer++){const primary=await a.snapshotLoop(layer===0?170:70+layer),reference=await b.snapshotLoop(70+layer);let mismatch=0;for(let i=0;i<primary.stereo.length;i++)if(primary.stereo[i]!==reference.stereo[i])mismatch++;takes.push({layer:layer+1,frames:primary.stereo.length/2,referenceFrames:reference.stereo.length/2,differingSamples:mismatch});}
    const saved=await p.snapshot(),pair={frames,overflow:new Int32Array(control)[2]!==0,maxDifference,differingSamples,peak,edits,cursorBefore,cursorAfter,takes,activeSaveError,
      primary:a.diagnostics,reference:b.diagnostics,pcmBase64:btoa(binary)};
    // Explicit PCM changes must not inherit the previous take.
    const replacement=new Float32Array(64);for(let i=0;i<replacement.length;i++)replacement[i]=i%2===0?.23:-.17;
    // A real old-owner record command arrives after replacement intent was
    // prepared. Changed PCM must retain candidate transport instead of inheriting
    // that command and clearing its explicitly authored clip.
    const originalPost=Worker.prototype.postMessage;let recordingRaced=false;
    Worker.prototype.postMessage=function(message,...rest){
      if(!recordingRaced&&message.type==='prepare'&&message.project?.assets?.some(asset=>asset.label==='Explicit new take')){
        recordingRaced=true;const worker=this;
        a.setParameter({nodeId:170,id:0,value:1}).then(()=>originalPost.call(worker,message,...rest));return;
      }
      return originalPost.call(this,message,...rest);
    };
    try{await p.session.transaction(graph=>graph.setSampleAsset(graph.findInstance('/rack_host/layers/1/loop'),replacement,48000,'Explicit new take'));}
    finally{Worker.prototype.postMessage=originalPost;}
    const replaced=await a.snapshotLoop(170);let replacementMismatch=0;for(let i=0;i<replacement.length;i++)if(replaced.stereo[i]!==replacement[i])replacementMismatch++;
    const replacementProof={frames:replaced.stereo.length/2,differingSamples:replacementMismatch,recordingRaced,
      recordTarget:a.readPublishedParameters().find(p=>p.nodeId===170&&p.id===0).value,diagnostics:a.diagnostics};
    let rejected=null;try{await p.session.transaction(graph=>graph.setSampleAsset(graph.findInstance('/rack_host/layers/1/loop'),new Float32Array(48000*3*2),48000,'Too long for prepared ring'));}catch(error){rejected=error.message;}
    const afterRejected=await a.snapshotLoop(170),rejection={message:rejected,frames:afterRejected.stereo.length/2,first:afterRejected.stereo[0],diagnostics:a.diagnostics};
    await a.close();await b.close();await context.close();
    // Fresh host restores the saved stopped takes with their authored play flags.
    const reopenContext=new AudioContext({sampleRate:48000});await reopenContext.suspend();const reopened=new Host(reopenContext,{execution:'prepared'});await reopened.prepare(saved);
    const restore=[];for(const asset of saved.assets){const snapshot=await reopened.snapshotLoop(asset.nodeId),bytes=Uint8Array.from(atob(asset.pcmF32Base64),c=>c.charCodeAt(0)),view=new DataView(bytes.buffer);let differingSamples=0;for(let i=0;i<snapshot.stereo.length;i++)if(snapshot.stereo[i]!==view.getFloat32(i*4,true))differingSamples++;restore.push({nodeId:asset.nodeId,frames:snapshot.stereo.length/2,expectedFrames:asset.frames,differingSamples,play:reopened.readPublishedParameters().find(p=>p.nodeId===asset.nodeId&&p.id===1).value});}
    const analyser=reopenContext.createAnalyser();reopened.connect(null,analyser);analyser.connect(reopenContext.destination);await reopenContext.resume();await sleep(150);const restoredSignal=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(restoredSignal);let restorePeak=0;for(const value of restoredSignal)restorePeak=Math.max(restorePeak,Math.abs(value));
    await reopened.close();await reopenContext.close();return{pair,saved,replacementProof,rejection,restore,restorePeak};
  });
  const pcm=Buffer.from(result.pair.pcmBase64,'base64');delete result.pair.pcmBase64;
  await writeFile(new URL('edited.wav',output),wave(pcm,0));await writeFile(new URL('reference.wav',output),wave(pcm,1));
  await writeFile(new URL('saved-project.json',output),JSON.stringify(result.saved,null,2));delete result.saved;
  const cdp=await browser.newBrowserCDPSession(),workers=(await cdp.send('Target.getTargets')).targetInfos.filter(t=>t.type==='worker'&&t.url.includes('prepared-compiler'));
  evidence={recordedAt:new Date().toISOString(),site,chromiumVersion:browser.version(),hashes,ui,...result,workersAfterClose:workers,pageErrors:errors};
  await writeFile(new URL('report.json',output),JSON.stringify(evidence,null,2));await writeFile(new URL(`../docs/rearchitecture/evidence/${label}.json`,import.meta.url),JSON.stringify(evidence,null,2));
  assert.equal(result.pair.overflow,false);assert.equal(result.pair.maxDifference,0);assert.equal(result.pair.differingSamples,0);assert.ok(result.pair.peak>.01);assert.ok(result.pair.activeSaveError);
  assert.deepEqual(result.pair.cursorBefore,result.pair.cursorAfter);
  for(const take of result.pair.takes){assert.ok(take.frames>128);assert.equal(take.frames,take.referenceFrames);assert.equal(take.differingSamples,0);}
  for(const host of[result.pair.primary,result.pair.reference]){assert.equal(host.rustCallbackAllocations,0);assert.equal(host.rustCallbackDeallocations,0);assert.equal(host.rustProcessingFailures,0);assert.equal(host.audioBlocks,host.rustProcessedBlocks);}
  assert.equal(result.replacementProof.frames,32);assert.equal(result.replacementProof.differingSamples,0);assert.equal(result.replacementProof.recordingRaced,true);assert.equal(result.replacementProof.recordTarget,0);assert.ok(result.rejection.message);assert.equal(result.rejection.frames,32);assert.equal(result.rejection.first,Math.fround(.23));
  for(const take of result.restore){assert.equal(take.frames,take.expectedFrames);assert.equal(take.differingSamples,0);assert.equal(take.play,1);}assert.ok(result.restorePeak>.01);
  assert.deepEqual(workers,[]);assert.deepEqual(errors,[]);console.log(JSON.stringify({frames:result.pair.frames,maxDifference:result.pair.maxDifference,takes:result.pair.takes,primary:result.pair.primary,restore:result.restore}));
}catch(error){await writeFile(new URL('failure.json',output),JSON.stringify({error:error.stack,evidence},null,2));throw error;}finally{await browser.close();}
