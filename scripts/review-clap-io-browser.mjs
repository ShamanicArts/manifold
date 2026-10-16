// Run through scripts/with-private-null-audio.py. Only headless Chromium.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {chromium}=createRequire(new URL('../web/package.json',import.meta.url))('playwright-core');
const site='https://wubulon.tailfac9f9.ts.net:4174';
const root=new URL('../web/public/clap-io/2026-09-30-clap-io-v1/',import.meta.url);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
  const page=await browser.newPage({viewport:{width:1200,height:1050}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(site+'/arbitrary-io.html');
  await page.click('#start');await page.waitForFunction(()=>document.querySelector('#status').textContent==='Running.');
  await page.click('#swap');await page.waitForFunction(()=>window.manifoldArbitraryIo.values?.every((v,i)=>v===[-.25,.125,.375,-.5,.0625][i]));
  assert.equal(await page.locator('#download').textContent(),'Download package');
  const [download]=await Promise.all([page.waitForEvent('download'),page.click('#download')]);
  const packaged=JSON.parse(await readFile(await download.path(),'utf8'));
  assert.equal(packaged.format,'manifold.package');
  assert.equal(packaged.state.signal.io.outputBindings[0].channel,1);
  const diagnostics=await page.evaluate(()=>window.manifoldArbitraryIo.host.diagnostics);
  for(const key of ['rustCallbackAllocations','rustCallbackDeallocations','rustProcessingFailures'])assert.equal(diagnostics[key],0);
  await page.screenshot({path:new URL('live-package.png',root).pathname,fullPage:true});
  await page.click('#stop');await page.waitForFunction(()=>document.querySelector('#status').textContent==='Stopped.');
  const response=await page.goto(site+'/clap-io/2026-09-30-clap-io-v1/');assert.equal(response.status(),200);
  assert.equal(await page.locator('audio').count(),3);
  for(const player of await page.locator('audio').all()) {
    await page.locator('h1').click();
    await player.evaluate(async audio=>{await audio.play();});
    await page.waitForFunction(()=>[...document.querySelectorAll('audio')].some(audio=>!audio.paused&&audio.currentTime>0));
    assert.equal(await player.evaluate(audio=>audio.duration),2);
    await player.evaluate(audio=>audio.pause());
  }
  const manifest=await(await page.request.get(site+'/clap-io/2026-09-30-clap-io-v1/review-manifest.json')).json();
  const archive=await page.request.get(site+'/clap-io/2026-09-30-clap-io-v1/Manifold-declared-io-linux-x86_64.tgz');
  assert.equal(createHash('sha256').update(await archive.body()).digest('hex'),manifest.archiveSha256);
  await page.screenshot({path:new URL('review.png',root).pathname,fullPage:true});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({packageId:packaged.packageId,swappedOutputChannel:packaged.state.signal.io.outputBindings[0].channel,diagnostics,manualAuditions:3,playedAuditionSeconds:[2,2,2],archiveHashVerified:true,errors}));
}finally{await browser.close();}
