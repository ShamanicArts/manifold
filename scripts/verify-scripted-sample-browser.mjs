// Reopen actual CLAP/VST3 SDK saves and continue authoring their bundled code.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const { chromium } = createRequire(new URL('../web/package.json', import.meta.url))('playwright-core');
const site = process.env.MANIFOLD_SITE_URL ?? 'https://wubulon.tailfac9f9.ts.net:4174';
const label = process.env.MANIFOLD_SCRIPT_SAMPLE_LABEL ?? '2026-09-30-scripted-samples-release-v1';
assert.match(label, /^[a-z0-9-]+$/);
const root = new URL(`../web/public/scripted-samples/${label}/`, import.meta.url);
try { await access(new URL('browser-report.json', root)); throw new Error('Use a fresh browser evidence destination'); }
catch(error) { if(error.code !== 'ENOENT') throw error; }
const browser = await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const report = { site, recordedAt:new Date().toISOString(), chromiumVersion:browser.version(), recalled:[] };
try {
  const page = await browser.newPage({viewport:{width:1250,height:1250}}), errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  await page.goto(site+'/native-sample-authoring.html');
  assert.equal(await page.evaluate(()=>crossOriginIsolated),true);
  const click=async(id,status)=>{await page.locator('#'+id).click();await page.waitForFunction(text=>document.querySelector('#status').textContent===text,status);};
  const snapshot=()=>page.evaluate(()=>{
    const api=window.manifoldSharedSample, pcm=new Float32Array(api.analyser.fftSize);
    api.analyser.getFloatTimeDomainData(pcm);
    return {state:api.project.toProject(),controllerHash:api.package.control.sha256,diagnostics:api.host.diagnostics,rms:Math.sqrt(pcm.reduce((sum,v)=>sum+v*v,0)/pcm.length)};
  });
  for(const host of ['clap-sdk','vst3-sdk']) for(const kind of ['rack','instrument']) {
    const saved=JSON.parse(await readFile(new URL(`${host}/${kind}/saved.manifold.json`,root),'utf8'));
    await page.locator('#package-source').selectOption(`/scripted-samples/${label}/${host}/${kind}/saved.manifold.json`);
    await click('load-package','Package loaded. Press Start.');
    assert.equal(await page.locator('#mode').inputValue(),kind);
    await click('start','Running.');
    if(kind==='instrument')await click('sound','Playing.');
    await page.waitForFunction(()=>{const api=window.manifoldSharedSample,p=new Float32Array(api.analyser.fftSize);api.analyser.getFloatTimeDomainData(p);return p.some(v=>Math.abs(v)>.001);});
    const recalled=await snapshot();
    assert.equal(recalled.controllerHash,saved.control.sha256);
    assert.equal(recalled.state.assets[0].pcmF32Base64,saved.state.assets[0].pcmF32Base64);
    assert.ok(recalled.rms>.001);
    if(kind==='rack') {
      assert.equal(recalled.state.controls.find(c=>c.path.endsWith('/voice/1/gate')).value,.6);
      await click('insert','Accepted topology edit.');
      assert.ok((await snapshot()).state.signal.nodes.some(node=>node.id===800));
    }
    await page.locator('#frequency').fill(kind==='rack'?'550':'660');
    await click('replace','Published new PCM.');
    await click('off','All voices off.');await click('sound','Playing.');
    await page.waitForTimeout(250);
    const edited=await snapshot();assert.ok(edited.rms>.001);
    assert.match(edited.state.assets[0].label,kind==='rack'?/550/:/660/);
    const downloadEvent=page.waitForEvent('download');await click('save-package','Downloaded project package.');
    const file=await downloadEvent;await file.saveAs(new URL(`${host}-${kind}-browser.manifold.json`,root).pathname);
    const exported=JSON.parse(await readFile(new URL(`${host}-${kind}-browser.manifold.json`,root),'utf8'));
    assert.equal(exported.control.sha256,saved.control.sha256);
    assert.equal(exported.state.assets[0].pcmF32Base64,edited.state.assets[0].pcmF32Base64);
    await page.screenshot({path:new URL(`${host}-${kind}-browser.png`,root).pathname,fullPage:true});
    await click('stop','Stopped.');await click('start','Running.');
    if(kind==='instrument')await click('sound','Playing.');
    await page.waitForTimeout(250);
    const restarted=await snapshot();assert.ok(restarted.rms>.001);
    assert.equal(restarted.state.assets[0].pcmF32Base64,edited.state.assets[0].pcmF32Base64);
    for(const s of [recalled,edited,restarted])for(const key of ['rustCallbackAllocations','rustCallbackDeallocations','rustProcessingFailures'])assert.equal(s.diagnostics[key],0);
    const summarize=s=>({rms:s.rms,diagnostics:s.diagnostics,nodes:s.state.signal.nodes.length,controllerHash:s.controllerHash,assetLabel:s.state.assets[0].label,pcmHash:createHash('sha256').update(s.state.assets[0].pcmF32Base64).digest('hex')});
    report.recalled.push({host,kind,recalled:summarize(recalled),edited:summarize(edited),restarted:summarize(restarted)});
    await click('stop','Stopped.');
  }
  const cdp=await browser.newBrowserCDPSession();
  report.workersAfterClose=(await cdp.send('Target.getTargets')).targetInfos.filter(target=>target.type==='worker'&&target.url.includes('prepared-compiler'));
  assert.deepEqual(report.workersAfterClose,[]);assert.deepEqual(errors,[]);report.pageErrors=errors;
  await page.goto(`${site}/scripted-samples/${label}/`);assert.ok(await page.locator('audio').count() >= 6);
  await page.locator('audio').nth(0).evaluate(p=>p.play());await page.locator('audio').nth(1).evaluate(p=>p.play());
  await page.waitForFunction(()=>document.querySelectorAll('audio')[0].paused&&!document.querySelectorAll('audio')[1].paused);
  await page.locator('audio').nth(1).evaluate(p=>p.pause());
  await page.screenshot({path:new URL('recordings.png',root).pathname,fullPage:true});
  const publication=JSON.parse(await readFile(new URL('publication-report.json',root),'utf8'));
  report.servedHashes=[];
  for(const [path,expected] of [...Object.entries(publication.sourceHashes).map(([p,h])=>['measured-source/'+p,h]),...Object.entries(publication.binaryHashes).map(([p,h])=>['binaries/'+p,h])]) {
    const response=await page.request.get(`${site}/scripted-samples/${label}/${path}`);assert.equal(response.status(),200);
    const actual=createHash('sha256').update(await response.body()).digest('hex');assert.equal(actual,expected);report.servedHashes.push({path,sha256:actual});
  }
  await writeFile(new URL('browser-report.json',root),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report.recalled.map(r=>({host:r.host,kind:r.kind,rms:r.recalled.rms,restartedRms:r.restarted.rms}))));
} catch(error) {
  await writeFile(new URL('browser-failure.json',root),JSON.stringify({...report,error:error.stack},null,2));throw error;
} finally {await browser.close();}
