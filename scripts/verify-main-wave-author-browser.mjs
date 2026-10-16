// Run only through scripts/with-private-null-audio.py.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { access, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const {chromium}=createRequire(new URL('../web/package.json',import.meta.url))('playwright-core');
const site=process.env.MANIFOLD_SITE_URL??'https://wubulon.tailfac9f9.ts.net:4174';
const label=process.env.MANIFOLD_MAIN_WAVE_PROOF_LABEL??'2026-09-30-main-wave-author-v2';
assert.match(label,/^[a-z0-9-]+$/);
const root=new URL(`../web/public/main-wave-author/${label}/`,import.meta.url);
try{await access(new URL('browser-report.json',root));throw new Error('Use a fresh browser proof destination');}catch(e){if(e.code!=='ENOENT')throw e;}
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const report={accepted:false,site,recordedAt:new Date().toISOString(),chromiumVersion:browser.version()};
try{
  const page=await browser.newPage({viewport:{width:1250,height:1050}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(site+'/main-wave-author.html');
  assert.equal(await page.evaluate(()=>crossOriginIsolated),true);
  const click=async(id,status)=>{await page.locator('#'+id).click();await page.waitForFunction(text=>document.querySelector('#status').textContent===text,status);};
  await click('start','Running.');
  await page.locator('[data-note="60"]').click();
  await page.waitForFunction(()=>window.manifoldMainWave.project.voiceSnapshot()[0].currentAmp>.1);
  await page.locator('#script').fill("const mixer=graph.findInstance('/midi/synth/nodes/voice_mixer');graph.configure(mixer,{inputs:13});");
  await click('apply','Accepted graph script.');
  assert.equal(await page.evaluate(()=>window.manifoldMainWave.project.toProject().signal.nodes.find(n=>n.id===60).a),13);
  await click('insert','Accepted topology edit.');
  await page.locator('#monitor').fill('0');await page.locator('#monitor').dispatchEvent('change');
  await page.waitForFunction(()=>document.querySelector('#status').textContent==='Accepted control.');
  await page.waitForTimeout(160);
  report.mutedMonitorCapture=await page.evaluate(async()=>{
    const api=window.manifoldMainWave,pcm=new Float32Array(api.analyser.fftSize);api.analyser.getFloatTimeDomainData(pcm);
    const captures=[];for(let layer=0;layer<4;layer++){const clip=await api.host.captureWindow(90+layer,.1);captures.push({layer:layer+1,frames:clip.stereo.length/2,peak:clip.stereo.reduce((p,v)=>Math.max(p,Math.abs(v)),0)});}
    return {monitorPeak:pcm.reduce((p,v)=>Math.max(p,Math.abs(v)),0),captures,diagnostics:api.host.diagnostics};
  });
  assert.ok(report.mutedMonitorCapture.monitorPeak<.0001);
  for(const capture of report.mutedMonitorCapture.captures)assert.ok(capture.peak>.001);
  await page.locator('#monitor').fill('0.8');await page.locator('#monitor').dispatchEvent('change');await page.waitForFunction(()=>document.querySelector('#status').textContent==='Accepted control.');
  // Rejected user code must leave the accepted graph intact and playable.
  const before=await page.evaluate(()=>window.manifoldMainWave.project.toProject());
  await page.locator('#script').fill("graph.configure(graph.findInstance('/midi/synth/nodes/voice_mixer'),{inputs:3});");
  await page.locator('#apply').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Rejected:'));
  const after=await page.evaluate(()=>window.manifoldMainWave.project.toProject());
  assert.deepEqual(after.signal.nodes,before.signal.nodes);assert.deepEqual(after.signal.connections,before.signal.connections);
  report.rejectedEdit=await page.locator('#status').textContent();
  await page.screenshot({path:new URL('creator.png',root).pathname,fullPage:true});
  await click('stop','Stopped.');await click('start','Running.');await page.locator('[data-note="67"]').click();
  await page.waitForFunction(()=>window.manifoldMainWave.project.voiceSnapshot()[0].currentAmp>.1);
  assert.equal(await page.evaluate(()=>window.manifoldMainWave.project.toProject().signal.nodes.find(n=>n.id===60).a),13);
  await click('stop','Stopped.');
  report.paired=await page.evaluate(async()=>{
    const api=window.manifoldMainWave,context=new AudioContext({sampleRate:48000}),sleep=ms=>new Promise(r=>setTimeout(r,ms));
    await context.suspend();
    const document=await(await fetch('/packages/main-wave-author.manifold.json')).json();
    // instantiateProjectPackage accepts a parsed/validated package produced by
    // the public loader on the creator page. Obtain that same loaded format.
    const load=api.instantiateProjectPackage;
    const a=new api.BrowserGraphHost(context,{execution:'prepared'}),b=new api.BrowserGraphHost(context,{execution:'prepared'});
    const pa=(await load(document,a)).controller,pb=(await load(document,b)).controller;
    await a.prepare(pa.toProject());await b.prepare(pb.toProject());
    const capacity=480000,tape=new SharedArrayBuffer(capacity*16),control=new SharedArrayBuffer(12);
    const source=`class Recorder extends AudioWorkletProcessor{constructor(o){super();this.t=new Float32Array(o.processorOptions.tape);this.c=new Int32Array(o.processorOptions.control);}process(i,o){let n=o[0][0].length,s=Atomics.load(this.c,0);if(s+n>this.t.length/4){Atomics.store(this.c,2,1);return true;}for(let f=0;f<n;f++){const p=(s+f)*4;this.t[p]=i[0]?.[0]?.[f]??0;this.t[p+1]=i[0]?.[1]?.[f]??0;this.t[p+2]=i[1]?.[0]?.[f]??0;this.t[p+3]=i[1]?.[1]?.[f]??0;o[0][0][f]=this.t[p];o[0][1][f]=this.t[p+1];}Atomics.store(this.c,0,s+n);return true;}}registerProcessor('main-wave-recorder',Recorder);`;
    const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));await context.audioWorklet.addModule(url);URL.revokeObjectURL(url);
    const recorder=new AudioWorkletNode(context,'main-wave-recorder',{numberOfInputs:2,outputChannelCount:[2],processorOptions:{tape,control}});
    const busA=context.createGain(),busB=context.createGain();a.connect(null,busA);b.connect(null,busB);busA.connect(recorder,0,0);busB.connect(recorder,0,1);recorder.connect(context.destination);
    const values=Array.from({length:8},(_,i)=>({index:i+1,frequency:220+i*31,amplitude:.06}));
    await pa.setVoices(values);await pb.setVoices(values);await context.resume();await sleep(100);
    const edits=[];
    for(const inputs of [13,32,8,11,8]){
      await pa.session.transaction(graph=>graph.configure(graph.findInstance('/midi/synth/nodes/voice_mixer'),{inputs}));
      edits.push({inputs,diagnostics:a.diagnostics});await sleep(70);
      await pa.setInsert(true);await sleep(60);await pa.setInsert(false);await sleep(60);
    }
    await context.suspend();const frames=new Int32Array(control)[0],pcm=new Float32Array(tape,0,frames*4);
    let maxDifference=0,differingSamples=0,peak=0;for(let i=0;i<pcm.length;i+=4)for(let c=0;c<2;c++){
      const diff=Math.abs(pcm[i+c]-pcm[i+c+2]);maxDifference=Math.max(maxDifference,diff);if(diff!==0)differingSamples++;peak=Math.max(peak,Math.abs(pcm[i+c]));}
    const captures=[];for(let layer=0;layer<4;layer++){
      const ca=await a.captureWindow(90+layer,.25),cb=await b.captureWindow(90+layer,.25);let differences=0;
      for(let i=0;i<ca.stereo.length;i++)if(ca.stereo[i]!==cb.stereo[i])differences++;
      captures.push({layer:layer+1,frames:ca.stereo.length/2,referenceFrames:cb.stereo.length/2,differingSamples:differences});
    }
    const bytes=new Uint8Array(tape,0,pcm.byteLength);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const result={frames,maxDifference,differingSamples,peak,overflow:new Int32Array(control)[2]!==0,edits,captures,
      primary:a.diagnostics,reference:b.diagnostics,state:pa.toProject(),pcmBase64:btoa(binary)};
    await a.close();await b.close();await context.close();return result;
  });
  const pair=report.paired,pcm=Buffer.from(pair.pcmBase64,'base64');delete pair.pcmBase64;
  function wav(stream){const bytes=Buffer.alloc(44+pair.frames*8);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVE',8);bytes.write('fmt ',12);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(3,20);bytes.writeUInt16LE(2,22);bytes.writeUInt32LE(48000,24);bytes.writeUInt32LE(384000,28);bytes.writeUInt16LE(8,32);bytes.writeUInt16LE(32,34);bytes.write('data',36);bytes.writeUInt32LE(pair.frames*8,40);for(let frame=0;frame<pair.frames;frame++)pcm.copy(bytes,44+frame*8,frame*16+stream*8,frame*16+stream*8+8);return bytes;}
  await writeFile(new URL('edited.wav',root),wav(0));await writeFile(new URL('reference.wav',root),wav(1));
  await writeFile(new URL('browser-final-project.json',root),JSON.stringify(pair.state,null,2));delete pair.state;
  report.errors=errors;report.binaryHash=createHash('sha256').update(await readFile(new URL('../packages/manifold-author/runtime/manifold_prepared.wasm',import.meta.url))).digest('hex');
  await writeFile(new URL('browser-report.json',root),JSON.stringify(report,null,2));
  assert.deepEqual(errors,[]);assert.equal(pair.overflow,false);assert.ok(pair.frames>30000);assert.ok(pair.peak>.005);
  assert.equal(pair.maxDifference,0);assert.equal(pair.differingSamples,0);
  for(const capture of pair.captures){assert.equal(capture.frames,capture.referenceFrames);assert.equal(capture.differingSamples,0);}
  for(const d of [pair.primary,pair.reference,report.mutedMonitorCapture.diagnostics])for(const key of ['rustCallbackAllocations','rustCallbackDeallocations','rustProcessingFailures'])assert.equal(d[key],0);
  report.accepted=true;
  await writeFile(new URL('browser-report.json',root),JSON.stringify(report,null,2));
  console.log(JSON.stringify({frames:pair.frames,maxDifference:pair.maxDifference,captures:pair.captures,edits:pair.edits.length}));
}catch(error){
  report.failure=String(error.stack??error);
  await writeFile(new URL('browser-report.json',root),JSON.stringify(report,null,2));
  throw error;
}finally{await browser.close();}
