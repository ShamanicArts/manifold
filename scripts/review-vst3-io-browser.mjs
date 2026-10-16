// Actual DAW save -> browser scripting, audition playback and archive retrieval.
// Run through with-private-null-audio.py; headless Chromium only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {chromium}=createRequire(new URL('../web/package.json',import.meta.url))('playwright-core');
const site=process.env.MANIFOLD_SITE_URL??'https://wubulon.tailfac9f9.ts.net:4174';
const label=process.env.MANIFOLD_VST3_IO_LABEL??'2026-10-01-vst3-io-v3';
assert.match(label,/^[a-z0-9-]+$/);
const path=`/vst3-io/${label}/`,root=new URL(`../web/public${path}`,import.meta.url);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
  const page=await browser.newPage({viewport:{width:1200,height:1050}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  assert.equal((await page.goto(site+path)).status(),200);
  const manifest=await(await page.request.get(site+path+'review-manifest.json')).json();
  assert.equal(manifest.dawReport.accepted,true);
  assert.equal(manifest.dawReport.actualDawSaveRetainedControllerAndIo,true);
  const archive=await page.request.get(site+path+'Manifold-authored-io-linux-x86_64.tgz');
  assert.equal(createHash('sha256').update(await archive.body()).digest('hex'),manifest.archiveSha256);
  assert.equal(await page.locator('audio').count(),3);
  for(const player of await page.locator('audio').all()) {
    await page.locator('h1').click();await player.evaluate(async audio=>await audio.play());
    await page.waitForFunction(()=>[...document.querySelectorAll('audio')].some(a=>!a.paused&&a.currentTime>0));
    assert.equal(await player.evaluate(a=>a.duration),2);await player.evaluate(a=>a.pause());
  }
  await page.screenshot({path:new URL('review.png',root).pathname,fullPage:true});
  const actualPackage=await(await page.request.get(site+path+'reaper-review/recalled.manifold.json')).json();
  await page.getByRole('link',{name:'Open the actual DAW save in the live editor'}).click();
  assert.equal(await page.evaluate(()=>crossOriginIsolated),true);
  await page.click('#start');await page.waitForFunction(()=>document.querySelector('#status').textContent==='Running.');
  const values=async expected=>page.waitForFunction(e=>window.manifoldArbitraryIo.values?.every((v,i)=>v===e[i]),expected);
  await values([-.25,.125,.375,-.5,.0625]);
  await page.click('#apply');await values([.125,-.25,.375,-.5,.0625]);
  await page.click('#aux');await values([.125,-.25,.375,0,.0625]);
  await page.click('#aux');await values([.125,-.25,.375,-.5,.0625]);
  await page.click('#swap');await values([-.25,.125,.375,-.5,.0625]);
  const [download]=await Promise.all([page.waitForEvent('download'),page.click('#download')]);
  const saved=JSON.parse(await readFile(await download.path(),'utf8'));
  assert.deepEqual(saved.control,actualPackage.control);
  assert.deepEqual(saved.state.signal.io,actualPackage.state.signal.io);
  const diagnostics=await page.evaluate(()=>window.manifoldArbitraryIo.host.diagnostics);
  for(const key of ['rustCallbackAllocations','rustCallbackDeallocations','rustProcessingFailures'])assert.equal(diagnostics[key],0);
  await page.screenshot({path:new URL('daw-package-live.png',root).pathname,fullPage:true});
  await page.click('#stop');await page.waitForFunction(()=>document.querySelector('#status').textContent==='Stopped.');
  await page.click('#start');await values([-.25,.125,.375,-.5,.0625]);
  await page.click('#stop');await page.waitForFunction(()=>document.querySelector('#status').textContent==='Stopped.');
  assert.deepEqual(errors,[]);
  const report={accepted:true,label,site,actualDawPackageId:actualPackage.packageId,actualDawControllerRetained:true,liveScriptAndControllerEdits:true,optionalDisconnectionAndReconnection:true,downloadRetainedEditedIo:true,restartRetainedState:true,archiveHashVerified:manifest.archiveSha256,auditionsPlayedSeconds:[2,2,2],diagnostics,errors};
  await writeFile(new URL('browser-review.json',root),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
