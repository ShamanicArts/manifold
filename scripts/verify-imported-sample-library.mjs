import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {chromium}=createRequire(new URL('../web/package.json',import.meta.url))('playwright-core');
const site=process.env.MANIFOLD_SITE_URL??'https://wubulon.tailfac9f9.ts.net:4174';
const label=process.env.MANIFOLD_SAMPLE_CONSUMER_REVIEW??'2026-09-30-imported-sample-library';assert.match(label,/^[a-z0-9-]+$/);
const reportPath=new URL(`../docs/rearchitecture/evidence/${label}.json`,import.meta.url);try{await access(reportPath);throw new Error('Evidence destination exists');}catch(error){if(error.code!=='ENOENT')throw error;}
const root='/importable-sample-library/2026-09-30-sample-library-v1/';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});let result=null;
try{
 const page=await browser.newPage({viewport:{width:1250,height:1350}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(site+root);assert.equal(await page.evaluate(()=>crossOriginIsolated),true);
 await page.locator('#start').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='Running the imported library.');await page.waitForTimeout(150);
 const before=await page.evaluate(()=>({state:window.importedManifoldSample.project.toProject(),diagnostics:window.importedManifoldSample.host.diagnostics}));
 await page.locator('#run').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='Accepted runtime graph script.');await page.waitForTimeout(100);
 const after=await page.evaluate(()=>{const {host,project,analyser}=window.importedManifoldSample;const pcm=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(pcm);return{state:project.toProject(),diagnostics:host.diagnostics,rms:Math.sqrt(pcm.reduce((sum,value)=>sum+value*value,0)/pcm.length)};});
 assert.equal(after.state.signal.nodes.length,before.state.signal.nodes.length+1);assert.equal(after.state.signal.nodes.find(node=>node.id===800).a,.6);assert.ok(after.rms>.005);
 await page.screenshot({path:new URL(`../docs/rearchitecture/evidence/${label}.png`,import.meta.url).pathname,fullPage:true});
 const script=await page.locator('#script').inputValue();await page.locator('#script').fill("graph.add('fixed-gain', { id: 901, config: { gain: Infinity } });");await page.locator('#run').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Rejected;'));const rejected=await page.locator('#status').textContent();const rollback=await page.evaluate(state=>JSON.stringify(window.importedManifoldSample.project.toProject())===JSON.stringify(state),after.state);assert.equal(rollback,true);
 await page.locator('#script').fill(script);const download=page.waitForEvent('download');await page.locator('#save').click();const saved=await download;const savedPath=new URL(`../docs/rearchitecture/evidence/${label}-saved.json`,import.meta.url);await saved.saveAs(savedPath.pathname);const savedGraph=JSON.parse(await readFile(savedPath,'utf8'));assert.equal(savedGraph.signal.nodes.find(node=>node.id===800).a,.6);assert.equal(savedGraph.sampleBindings.length,7);
 await page.locator('#stop').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='Stopped.');await page.locator('#start').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='Running the imported library.');await page.waitForTimeout(150);
 const restart=await page.evaluate(()=>({state:window.importedManifoldSample.project.toProject(),diagnostics:window.importedManifoldSample.host.diagnostics}));assert.equal(restart.state.signal.nodes.find(node=>node.id===800).a,.6);
 await page.locator('#stop').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='Stopped.');
 const cdp=await browser.newBrowserCDPSession(),workers=(await cdp.send('Target.getTargets')).targetInfos.filter(target=>target.type==='worker'&&target.url.includes('prepared-compiler'));assert.deepEqual(workers,[]);
 const proofRoot='/prepared-samples/2026-09-30-prepared-samples-v5/';await page.goto(site+proofRoot);assert.equal(await page.locator('audio').count(),7);
 await page.locator('audio').nth(0).evaluate(player=>player.play());await page.locator('audio').nth(1).evaluate(player=>player.play());await page.waitForFunction(()=>document.querySelectorAll('audio')[0].paused&&!document.querySelectorAll('audio')[1].paused);await page.locator('audio').nth(1).evaluate(player=>player.pause());
 const served=await page.evaluate(async root=>{const report=await(await fetch(root+'report.json')).json(),hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join(''),sources=[];for(const[path,expected]of Object.entries(report.hashes)){const response=await fetch(root+'measured-source/'+path);sources.push({path,status:response.status,expected,actual:await hash(await response.arrayBuffer())});}return{sources};},proofRoot);
 for(const source of served.sources){assert.equal(source.status,200);assert.equal(source.actual,source.expected);}
 await page.screenshot({path:new URL(`../docs/rearchitecture/evidence/${label}-recordings.png`,import.meta.url).pathname,fullPage:true});assert.deepEqual(errors,[]);
 for(const host of[after.diagnostics,restart.diagnostics])for(const key of['rustCallbackAllocations','rustCallbackDeallocations','rustProcessingFailures'])assert.equal(host[key],0);
 const packageBytes=await readFile(new URL('../web/public'+root+'manifold-author-0.1.0.tgz',import.meta.url));
 result={recordedAt:new Date().toISOString(),site,chromiumVersion:browser.version(),consumer:root,packageSha256:createHash('sha256').update(packageBytes).digest('hex'),before,after,rejected,rollback,restart,savedPath:savedPath.pathname,workersAfterClose:workers,pageErrors:errors,served};await writeFile(reportPath,JSON.stringify(result,null,2));console.log(JSON.stringify({beforeNodes:before.state.signal.nodes.length,afterNodes:after.state.signal.nodes.length,rms:after.rms,rollback,packageSha256:result.packageSha256,servedSources:served.sources.length,workers:workers.length}));
}catch(error){await writeFile(new URL(`../docs/rearchitecture/evidence/${label}-failure.json`,import.meta.url),JSON.stringify({error:error.stack,result},null,2));throw error;}finally{await browser.close();}
