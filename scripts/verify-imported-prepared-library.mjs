// Packed library, independent Vite project, real browser audio on private sink.
import assert from 'node:assert/strict';import{createRequire}from'node:module';import{readFile,writeFile}from'node:fs/promises';import{createHash}from'node:crypto';
const requireWeb=createRequire(new URL('../web/package.json',import.meta.url));const{chromium}=requireWeb('playwright-core');
const site=process.env.MANIFOLD_SITE_URL??'https://wubulon.tailfac9f9.ts.net:4174';const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
try{const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`${site}/importable-prepared-library/`);assert.equal(await page.evaluate(()=>crossOriginIsolated),true);
 await page.locator('#start').click();await page.waitForFunction(()=>window.genericManifold.host?.ready&&document.querySelector('#status').textContent.startsWith('Running'),null,{timeout:15_000});
 const before=await page.evaluate(()=>({state:window.genericManifold.project.toProject(),diagnostics:window.genericManifold.host.diagnostics}));assert.equal(before.state.signal.nodes.length,4);
 await page.locator('#edit').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Authored'));
 await page.waitForTimeout(250);
 const after=await page.evaluate(()=>{const{host,project,analyser}=window.genericManifold;const samples=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(samples);return{state:project.toProject(),parameters:host.readPublishedParameters(),diagnostics:host.diagnostics,rms:Math.sqrt(samples.reduce((sum,value)=>sum+value*value,0)/samples.length)};});
 assert.equal(after.state.signal.nodes.length,5);assert.equal(after.parameters.find(p=>p.nodeId===4&&p.id===0).value,.375);assert.ok(after.rms>.001);assert.equal(after.diagnostics.execution,'prepared');assert.equal(after.diagnostics.rustCallbackAllocations,0);assert.equal(after.diagnostics.rustCallbackDeallocations,0);assert.equal(after.diagnostics.rustProcessingFailures,0);
 await page.screenshot({path:new URL('../docs/rearchitecture/evidence/imported-prepared-library.png',import.meta.url).pathname,fullPage:true});
 await page.locator('#stop').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='Stopped.');
 const cdp=await browser.newBrowserCDPSession();const workers=(await cdp.send('Target.getTargets')).targetInfos.filter(t=>t.type==='worker'&&t.url.includes('prepared-compiler'));assert.deepEqual(workers,[]);assert.deepEqual(errors,[]);
 const tarball=new URL('../web/public/importable-prepared-library/manifold-author-0.1.0.tgz',import.meta.url);
 const report={recordedAt:new Date().toISOString(),site,chromiumVersion:browser.version(),packageSha256:createHash('sha256').update(await readFile(tarball)).digest('hex'),before,after,workersAfterClose:workers,pageErrors:errors};
 await writeFile(new URL('../docs/rearchitecture/evidence/2026-09-30-imported-prepared-library.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
