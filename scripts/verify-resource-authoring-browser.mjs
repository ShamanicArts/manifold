import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile, access } from 'node:fs/promises';
const {chromium}=createRequire(new URL('../web/package.json',import.meta.url))('playwright-core');
const site=process.env.MANIFOLD_SITE_URL??'https://wubulon.tailfac9f9.ts.net:4174';
const label=process.env.MANIFOLD_RESOURCE_REVIEW_LABEL??'2026-09-30-resource-authoring-browser';
assert.match(label,/^[a-z0-9-]+$/);
const output=new URL(`../docs/rearchitecture/evidence/${label}.json`,import.meta.url);
try{await access(output);throw new Error('Evidence destination exists');}catch(error){if(error.code!=='ENOENT')throw error;}
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
let result=null;
try{
 const page=await browser.newPage({viewport:{width:1250,height:1400}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(site+'/prepared-loops.html');await page.locator('#review-project').click();await page.waitForFunction(()=>!document.querySelector('#start').disabled);
 await page.locator('#start').click();await page.waitForFunction(()=>!document.querySelector('#stop').disabled);
 const capacity=page.locator('input[data-layer="1"][data-configuration="capacitySeconds"]'),rebuild=page.locator('button[data-rebuild-layer="1"]');
 await capacity.fill('3');await rebuild.click();await page.waitForFunction(()=>!document.querySelector('button[data-rebuild-layer="1"]').disabled);
 assert.equal(await capacity.inputValue(),'3');assert.equal(await page.locator('#status').textContent(),'Layer rebuilt from its authored clip and controls.');
 result=await page.evaluate(async()=>{
   const {project,host,context}=window.manifoldPreparedLoops,state=project.toProject(),take=await project.snapshot();
   const expected=await(await fetch('/prepared-loops/2026-09-30-prepared-loops-v3/saved-project.json')).json();
   const takes=take.assets.map(asset=>({nodeId:asset.nodeId,frames:asset.frames,equal:asset.pcmF32Base64===expected.assets.find(old=>old.nodeId===asset.nodeId).pcmF32Base64}));
   const analyzer=context.createAnalyser();host.connect(null,analyzer);await new Promise(resolve=>setTimeout(resolve,150));
   const pcm=new Float32Array(analyzer.fftSize);analyzer.getFloatTimeDomainData(pcm);const peak=Math.max(...pcm.map(Math.abs));
   let budgetError=null;try{await project.session.transaction(graph=>{for(let id=100;id<104;id++)graph.add('retrospective-capture',{id,config:{capacitySeconds:120}});});}catch(error){budgetError=error.message;}
   const rollback=JSON.stringify(project.toProject())===JSON.stringify(state);
   return{takes,peak,budgetError,budgetRollback:rollback,diagnostics:host.diagnostics};
 });
 assert.ok(result.peak>.01);assert.ok(result.takes.every(take=>take.equal&&take.frames===20992));assert.ok(result.budgetError?.includes('budget'));assert.equal(result.budgetRollback,true);
 await capacity.fill('.05');await rebuild.click();await page.waitForFunction(()=>!document.querySelector('button[data-rebuild-layer="1"]').disabled);
 const rejected=await page.locator('#status').textContent();assert.ok(rejected.includes('Loop asset loading failed'),rejected);
 const rollback=await page.evaluate(()=>window.manifoldPreparedLoops.project.toProject().signal.nodes.find(node=>node.id===170).a);assert.equal(rollback,3);
 await page.locator('#insert').click();await page.waitForFunction(()=>!document.querySelector('#insert').disabled);
 await page.locator('#insert').click();await page.waitForFunction(()=>!document.querySelector('#insert').disabled);
 const recovery=await page.evaluate(async()=>({takes:(await window.manifoldPreparedLoops.project.snapshot()).assets.map(asset=>({nodeId:asset.nodeId,frames:asset.frames})),diagnostics:window.manifoldPreparedLoops.host.diagnostics}));
 for(const key of['rustCallbackAllocations','rustCallbackDeallocations','rustProcessingFailures'])assert.equal(recovery.diagnostics[key],0);
 // Restore the editor field after the intentionally rejected capacity for the screenshot.
 await capacity.fill('3');await page.screenshot({path:new URL(`../docs/rearchitecture/evidence/${label}.png`,import.meta.url).pathname,fullPage:true});
 await page.locator('#stop').click();await page.waitForFunction(()=>!window.manifoldPreparedLoops.host);
 const cdp=await browser.newBrowserCDPSession(),workers=(await cdp.send('Target.getTargets')).targetInfos.filter(target=>target.type==='worker'&&target.url.includes('prepared-compiler'));assert.deepEqual(workers,[]);
 const reviewRoot='/configured-resources/2026-09-30-rust-js-resources-v3/';await page.goto(site+reviewRoot);
 const served=await page.evaluate(async root=>{
   const report=await(await fetch(root+'report.json')).json(),hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join(''),sources=[],waves=[];
   for(const[path,expected]of Object.entries(report.sources)){const response=await fetch(root+'measured-source/'+path);sources.push({path,expected,actual:await hash(await response.arrayBuffer()),status:response.status});}
   for(const row of report.reports)for(const host of['native','wasm']){const response=await fetch(root+row.name+'/'+host+'.wav'),bytes=await response.arrayBuffer();waves.push({path:row.name+'/'+host+'.wav',status:response.status,frames:(bytes.byteLength-44)/8});}
   return{report,sources,waves};
 },reviewRoot);
 for(const source of served.sources){assert.equal(source.status,200);assert.equal(source.actual,source.expected);}for(const wave of served.waves){assert.equal(wave.status,200);assert.equal(wave.frames,8192);}
 assert.equal(await page.locator('audio').count(),4);await page.locator('audio').nth(0).evaluate(player=>player.play());
 await page.locator('audio').nth(1).evaluate(player=>player.play());await page.waitForFunction(()=>document.querySelectorAll('audio')[0].paused&&!document.querySelectorAll('audio')[1].paused);
 await page.locator('audio').nth(1).evaluate(player=>player.pause());assert.deepEqual(errors,[]);
 await page.screenshot({path:new URL(`../docs/rearchitecture/evidence/${label}-audio.png`,import.meta.url).pathname,fullPage:true});
 await writeFile(output,JSON.stringify({recordedAt:new Date().toISOString(),site,chromiumVersion:browser.version(),...result,rejected,rollback,recovery,workersAfterClose:workers,served,pageErrors:errors},null,2));
 console.log(JSON.stringify({takes:result.takes,peak:result.peak,budgetError:result.budgetError,rejected,recovered:true,servedSources:served.sources.length,servedWaves:served.waves.length}));
}catch(error){await writeFile(new URL(`../docs/rearchitecture/evidence/${label}-failure.json`,import.meta.url),JSON.stringify({error:error.stack,result},null,2));throw error;}finally{await browser.close();}
