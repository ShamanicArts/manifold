// Run only through scripts/with-private-null-audio.py; no physical playback.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const {chromium}=createRequire(new URL('../web/package.json',import.meta.url))('playwright-core');
const site=process.env.MANIFOLD_SITE_URL??'https://wubulon.tailfac9f9.ts.net:4174';
const label=process.env.MANIFOLD_IO_PROOF_LABEL??'2026-09-30-arbitrary-io-v1';assert.match(label,/^[a-z0-9-]+$/);
const root=new URL(`../web/public/arbitrary-io/${label}/`,import.meta.url);await mkdir(root,{recursive:false});
const report={accepted:false,recordedAt:new Date().toISOString(),site,scope:'explicit library/browser buses and channel routes; plug-in negotiation and arbitrary kernel/module widths remain open'};
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
report.chromiumVersion=browser.version();
try{
  const page=await browser.newPage({viewport:{width:1200,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(site+'/arbitrary-io.html');assert.equal(await page.evaluate(()=>crossOriginIsolated),true);
  await page.click('#start');await page.waitForFunction(()=>document.querySelector('#status').textContent==='Running.');
  const values=async expected=>page.waitForFunction(e=>window.manifoldArbitraryIo.values?.every((v,i)=>v===e[i]),expected);
  await values([.125,-.25,.375,-.5,.0625]);
  const project=await page.evaluate(()=>window.manifoldArbitraryIo.session.toProject());
  const recipe={project,inputValues:[.125,-.25,.375,-.5],blocks:64};
  await writeFile(new URL('recipe.json',root),JSON.stringify(recipe,null,2));
  const nativePath=new URL('../target/release/examples/render_io_graph',import.meta.url);
  report.native=JSON.parse(execFileSync(nativePath.pathname,[new URL('recipe.json',root).pathname,new URL('native.f32',root).pathname],{encoding:'utf8'}));
  const browserRecording=await page.evaluate(async()=>{
    const api=window.manifoldArbitraryIo,context=api.context;await context.suspend();
    const tape=new SharedArrayBuffer(8192*5*4),state=new SharedArrayBuffer(4);
    const code=`class Tape extends AudioWorkletProcessor{constructor(o){super();this.t=new Float32Array(o.processorOptions.tape);this.c=new Int32Array(o.processorOptions.state);}process(i,o){const start=Atomics.load(this.c,0),n=o[0][0].length;if(start<8192){for(let f=0;f<n&&start+f<8192;f++){for(let c=0;c<4;c++)this.t[(start+f)*5+c]=i[0]?.[c]?.[f]??0;this.t[(start+f)*5+4]=i[1]?.[0]?.[f]??0;}Atomics.store(this.c,0,Math.min(8192,start+n));}for(let c=0;c<o[0].length;c++)o[0][c].fill(0);return true;}}registerProcessor('manifold-io-tape',Tape);`;
    const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));await context.audioWorklet.addModule(url);URL.revokeObjectURL(url);
    const node=new AudioWorkletNode(context,'manifold-io-tape',{numberOfInputs:2,outputChannelCount:[2],channelCountMode:'max',channelInterpretation:'discrete',processorOptions:{tape,state}});
    api.host.connectOutput('stems',node,0);api.host.connectOutput('mono',node,1);node.connect(context.destination);await context.resume();
    const deadline=performance.now()+5000;while(Atomics.load(new Int32Array(state),0)<8192){if(performance.now()>deadline)throw new Error('Recording timed out');await new Promise(r=>setTimeout(r,10));}
    // Remove this probe's output connections without changing the host graph.
    node.disconnect();const bytes=new Uint8Array(tape);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);
  });
  const pcm=Buffer.from(browserRecording,'base64'),native=await readFile(new URL('native.f32',root));
  await writeFile(new URL('browser.f32',root),pcm);
  let maximum=0,different=0;for(let i=0;i<pcm.length;i+=4){const d=Math.abs(pcm.readFloatLE(i)-native.readFloatLE(i));maximum=Math.max(maximum,d);if(d!==0)different++;}
  report.comparison={frames:8192,channels:5,maximumError:maximum,differingSamples:different};assert.equal(maximum,0);assert.equal(different,0);
  await page.click('#aux');await values([.125,-.25,.375,0,.0625]);report.optionalInputAbsent=await page.evaluate(()=>window.manifoldArbitraryIo.values);
  const optionalBaseline=await page.evaluate(()=>window.manifoldArbitraryIo.session.toProject());
  await page.fill('#script',"const io=structuredClone(graph.ioLayout);io.inputs[1].optional=false;graph.setIoLayout(io);");
  await page.click('#apply');await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Rejected:'));
  report.rejectedInputRequirement=await page.locator('#status').textContent();
  assert.deepEqual(await page.evaluate(()=>window.manifoldArbitraryIo.session.toProject()),optionalBaseline);
  await page.click('#aux');await values([.125,-.25,.375,-.5,.0625]);
  for(let edit=0;edit<5;edit++){
    await page.click('#swap');await page.waitForFunction(()=>document.querySelector('#status').textContent==='Accepted routing edit.');
    await values(edit%2===0?[-.25,.125,.375,-.5,.0625]:[.125,-.25,.375,-.5,.0625]);
  }
  const before=await page.evaluate(()=>window.manifoldArbitraryIo.session.toProject());
  await page.fill('#script',"const io=structuredClone(graph.ioLayout);io.outputs[0].channels=3;io.outputBindings.splice(3,1);graph.setIoLayout(io);");
  await page.click('#apply');await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Rejected:'));
  report.rejectedLayout=await page.locator('#status').textContent();
  assert.deepEqual(await page.evaluate(()=>window.manifoldArbitraryIo.session.toProject()),before);
  await values([-.25,.125,.375,-.5,.0625]);await page.screenshot({path:new URL('creator.png',root).pathname,fullPage:true});
  report.diagnostics=await page.evaluate(()=>window.manifoldArbitraryIo.host.diagnostics);
  for(const key of ['rustCallbackAllocations','rustCallbackDeallocations','rustProcessingFailures'])assert.equal(report.diagnostics[key],0);
  await page.click('#stop');await page.waitForFunction(()=>document.querySelector('#status').textContent==='Stopped.');
  await page.click('#start');await page.waitForFunction(()=>document.querySelector('#status').textContent==='Running.');await values([-.25,.125,.375,-.5,.0625]);
  report.recall=await page.evaluate(()=>({values:window.manifoldArbitraryIo.values,project:window.manifoldArbitraryIo.session.toProject()}));
  await page.click('#stop');await page.waitForFunction(()=>document.querySelector('#status').textContent==='Stopped.');assert.deepEqual(errors,[]);report.errors=errors;
  const cdp=await page.context().newCDPSession(page),targets=await cdp.send('Target.getTargets');
  report.workersAfterClose=targets.targetInfos.filter(t=>t.type==='worker'&&/prepared-compiler/.test(t.url)).map(t=>t.url);assert.deepEqual(report.workersAfterClose,[]);
  report.sourceHashes={};
  for(const source of ['crates/manifold-core/src/io.rs','crates/manifold-core/src/graph.rs','crates/manifold-native/src/lib.rs','crates/manifold-native/src/project.rs','crates/manifold-native/src/author.rs','crates/manifold-native/examples/render_io_graph.rs','crates/manifold-project-js/src/native_host.rs','crates/manifold-project-js/tests/arbitrary_io.rs','examples/projects/arbitrary-io-project.mjs','crates/manifold-web/src/lib.rs','packages/manifold-author/index.js','packages/manifold-author/prepared-runtime.js','packages/manifold-author/prepared-compiler.js','packages/manifold-author/prepared-processor.js','packages/manifold-author/examples/arbitrary-io.mjs','web/src/arbitrary-io.js','scripts/verify-arbitrary-io-browser.mjs']){
    const data=await readFile(new URL('../'+source,import.meta.url)),path=new URL('measured-source/'+source,root);await mkdir(new URL('.',path),{recursive:true});await writeFile(path,data);report.sourceHashes[source]=createHash('sha256').update(data).digest('hex');
  }
  report.binaryHashes={native:createHash('sha256').update(await readFile(nativePath)).digest('hex'),wasm:createHash('sha256').update(await readFile(new URL('../packages/manifold-author/runtime/manifold_prepared.wasm',import.meta.url))).digest('hex')};
  report.accepted=true;console.log(JSON.stringify({comparison:report.comparison,publications:report.diagnostics.publications,workersAfterClose:report.workersAfterClose}));
}catch(error){report.failure=String(error.stack??error);throw error;}finally{await writeFile(new URL('report.json',root),JSON.stringify(report,null,2));await browser.close();}
