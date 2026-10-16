import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { access, writeFile } from 'node:fs/promises';
const { chromium }=createRequire(new URL('../web/package.json',import.meta.url))('playwright-core');
const site=process.env.MANIFOLD_SITE_URL??'https://wubulon.tailfac9f9.ts.net:4174';
const label=process.env.MANIFOLD_LOOP_DELIVERABLE_LABEL??'2026-09-30-prepared-loop-deliverables';
assert.match(label,/^[a-z0-9-]+$/);const reportPath=new URL(`../docs/rearchitecture/evidence/${label}.json`,import.meta.url);
try{await access(reportPath);throw new Error('Evidence destination exists');}catch(error){if(error.code!=='ENOENT')throw error;}
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
let result=null;
try{
 const page=await browser.newPage({viewport:{width:1250,height:1200}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`${site}/prepared-loops.html`);await page.locator('#review-project').click();await page.waitForFunction(()=>!document.querySelector('#start').disabled);
 await page.locator('#start').click();await page.waitForFunction(()=>!document.querySelector('#stop').disabled);
 result=await page.evaluate(async()=>{
  const root='/prepared-loops/2026-09-30-prepared-loops-v3/',{host,context,project}=window.manifoldPreparedLoops;
  const analyser=context.createAnalyser(),monitor=context.createGain();monitor.gain.value=.5;host.connect(null,analyser);analyser.connect(monitor);monitor.connect(context.destination);
  await new Promise(resolve=>setTimeout(resolve,150));const signal=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(signal);let peak=0;for(const value of signal)peak=Math.max(peak,Math.abs(value));
  await project.setInsert(true,0);await project.setInsert(false,0);
  const saved=await(await fetch(root+'saved-project.json')).json(),live=await project.snapshot();
  const takes=live.assets.map(asset=>{const expected=saved.assets.find(old=>old.nodeId===asset.nodeId);return{nodeId:asset.nodeId,frames:asset.frames,expectedFrames:expected.frames,pcmEqual:asset.pcmF32Base64===expected.pcmF32Base64};});
  const sourceReport=await(await fetch(root+'report.json')).json(),capsule=[];
  const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
  for(const[path,expected]of Object.entries(sourceReport.hashes)){const response=await fetch(root+'measured-source/'+path.split('/').at(-1));capsule.push({path,expected,actual:await hash(await response.arrayBuffer()),status:response.status});}
  const recordings=[];for(const name of['edited.wav','reference.wav']){const response=await fetch(root+name),bytes=await response.arrayBuffer(),audio=await context.decodeAudioData(bytes.slice(0));recordings.push({name,status:response.status,sha256:await hash(bytes),frames:audio.length,sampleRate:audio.sampleRate,channels:audio.numberOfChannels});}
  // Hold one snapshot chunk until a real overdub changes its revision.
  const original=MessagePort.prototype.postMessage;let intercepted=false;
  MessagePort.prototype.postMessage=function(message,...rest){if(!intercepted&&message.type==='loop-copy'){intercepted=true;setTimeout(()=>original.call(this,message,...rest),100);return;}return original.call(this,message,...rest);};
  let interrupted;
  try{
    const pending=host.snapshotLoop(170).then(()=>({accepted:true}),error=>({error:error.message}));
    const deadline=performance.now()+3000;while(!intercepted){if(performance.now()>deadline)throw new Error('Snapshot chunk not observed');await new Promise(resolve=>setTimeout(resolve,2));}
    await host.setParameter({nodeId:170,id:2,value:1});interrupted=await pending;await host.setParameter({nodeId:170,id:2,value:0});
  }finally{MessagePort.prototype.postMessage=original;}
  return{peak,takes,capsule,recordings,interrupted,diagnostics:host.diagnostics,restoredSpeed:document.querySelector('input[data-layer="2"][data-parameter="3"]').value};
 });
 assert.ok(result.peak>.01);assert.ok(Math.abs(Number(result.restoredSpeed)-1.33)<1e-6);
 for(const take of result.takes){assert.equal(take.frames,take.expectedFrames);assert.equal(take.pcmEqual,true);}
 for(const source of result.capsule){assert.equal(source.status,200);assert.equal(source.actual,source.expected);}
 assert.equal(result.recordings[0].sha256,result.recordings[1].sha256);for(const recording of result.recordings){assert.equal(recording.status,200);assert.equal(recording.frames,73088);assert.equal(recording.sampleRate,48000);assert.equal(recording.channels,2);}
 assert.ok(result.interrupted.error?.includes('Loop changed'));for(const field of['rustCallbackAllocations','rustCallbackDeallocations','rustProcessingFailures'])assert.equal(result.diagnostics[field],0);
 await page.screenshot({path:new URL(`../docs/rearchitecture/evidence/${label}.png`,import.meta.url).pathname,fullPage:true});
 await page.locator('audio').nth(0).evaluate(player=>{player.play().catch(error=>{if(error.name!=='AbortError')throw error;});});
 await page.waitForFunction(()=>!window.manifoldPreparedLoops.host&&!document.querySelector('audio').paused);
 await page.locator('audio').nth(1).evaluate(player=>player.play());await page.waitForFunction(()=>document.querySelectorAll('audio')[0].paused&&!document.querySelectorAll('audio')[1].paused);
 await page.locator('audio').nth(1).evaluate(player=>player.pause());
 const players=await page.evaluate(()=>Array.from(document.querySelectorAll('audio'),player=>({autoplay:player.autoplay,paused:player.paused})));assert.ok(players.every(player=>!player.autoplay&&player.paused));
 const cdp=await browser.newBrowserCDPSession(),workers=(await cdp.send('Target.getTargets')).targetInfos.filter(target=>target.type==='worker'&&target.url.includes('prepared-compiler'));
 assert.deepEqual(workers,[]);assert.deepEqual(errors,[]);
 const report={recordedAt:new Date().toISOString(),site,chromiumVersion:browser.version(),...result,players,workersAfterClose:workers,pageErrors:errors};await writeFile(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify({peak:result.peak,takes:result.takes,interrupted:result.interrupted,workersAfterClose:workers}));
}catch(error){await writeFile(new URL(`../docs/rearchitecture/evidence/${label}-failure.json`,import.meta.url),JSON.stringify({error:error.stack,result},null,2));throw error;}finally{await browser.close();}
