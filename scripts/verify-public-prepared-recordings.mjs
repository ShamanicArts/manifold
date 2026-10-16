// Run through scripts/with-private-null-audio.py only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdir,readFile,readdir,writeFile } from 'node:fs/promises';
const requireWeb=createRequire(new URL('../web/package.json',import.meta.url));
const{chromium}=requireWeb('playwright-core');
const site=process.env.MANIFOLD_SITE_URL??'https://wubulon.tailfac9f9.ts.net:4174';
const label=process.env.MANIFOLD_PUBLIC_PREPARED_RECORDING_LABEL??'2026-09-30-public-prepared-recordings';
assert.match(label,/^[a-z0-9-]+$/);
const output=new URL(`../web/public/prepared-worklet-prototype/${label}/`,import.meta.url);
await mkdir(output,{recursive:true});assert.deepEqual(await readdir(output),[],'measurement destination is not empty');
const hashes={};for(const path of['crates/manifold-web/src/prepared_worklet.rs','crates/manifold-web/src/lib.rs',
  'packages/manifold-author/browser.js','packages/manifold-author/prepared-runtime.js','packages/manifold-author/prepared-processor.js',
  'packages/manifold-author/prepared-compiler.js','packages/manifold-author/index.js','web/src/prepared-worklet-prototype.js',
  'packages/manifold-author/runtime/manifold_prepared.wasm','web/public/packages/dsp-live-scripting.manifold.json','web/public/packages/fx-slot-swap.manifold.json']){
  hashes[path]=createHash('sha256').update(await readFile(new URL(`../${path}`,import.meta.url))).digest('hex');
}
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const runs=[];
try{
  const page=await browser.newPage({viewport:{width:1200,height:1100},acceptDownloads:true}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const cdp=await browser.newBrowserCDPSession();
  const workers=async()=>(await cdp.send('Target.getTargets')).targetInfos.filter(t=>t.type==='worker'&&t.url.includes('prepared-compiler')).map(t=>({id:t.targetId,url:t.url}));
  for(const example of['dsp-live-scripting','fx-slot-swap']){
    await page.goto(`${site}/prepared-worklet-prototype.html?execution=prepared`);assert.equal(await page.evaluate(()=>crossOriginIsolated),true);
    await page.locator('#example').selectOption(example);await page.locator('#run').click();
    try{await page.waitForFunction(()=>!window.manifoldPreparedPrototype.busy,null,{timeout:60_000});}
    catch(error){await writeFile(new URL(`${example}-failure.json`,output),JSON.stringify({error:error.message,status:await page.locator('#status').textContent(),errors,failure:await page.evaluate(()=>window.manifoldPreparedFailure??null),workers:await workers()},null,2));throw error;}
    const report=await page.evaluate(()=>window.manifoldPreparedPrototype.report);
    if(!report){await writeFile(new URL(`${example}-failure.json`,output),JSON.stringify({status:await page.locator('#status').textContent(),errors,failure:await page.evaluate(()=>window.manifoldPreparedFailure??null),workers:await workers()},null,2));throw new Error(await page.locator('#status').textContent());}
    const afterClose=await workers();
    // Persist the actual report and audio before judging deadline results.
    for(const[id,suffix]of[['wav','.wav'],['wav-secondary','-secondary.wav'],['json','.json'],['package','.manifold.json']]){
      const[download]=await Promise.all([page.waitForEvent('download'),page.locator(`#${id}`).click()]);await download.saveAs(new URL(`${example}${suffix}`,output).pathname);
    }
    await page.screenshot({path:new URL(`../docs/rearchitecture/evidence/${label}-${example}.png`,import.meta.url).pathname,fullPage:true});
    const audio=`/prepared-worklet-prototype/${label}/${example}.wav`,secondaryAudio=`/prepared-worklet-prototype/${label}/${example}-secondary.wav`;
    const run={...report,hashes,workersAfterClose:afterClose,pageErrors:[...errors],audio,secondaryAudio,
      report:`/prepared-worklet-prototype/${label}/${example}.json`,package:`/prepared-worklet-prototype/${label}/${example}.manifold.json`};
    runs.push(run);await writeFile(new URL('summary.json',output),JSON.stringify({recordedAt:new Date().toISOString(),site,chromiumVersion:browser.version(),runs},null,2));
    assert.equal(report.editCount,24);assert.deepEqual(errors,[]);assert.deepEqual(afterClose,[]);
    assert.ok(report.recovery.preflight);
    assert.equal(report.runtime,'public-prepared-library');
    assert.equal(report.recovery.compilerFailure,null);
    assert.ok(report.latency.p50Ms >= 12);
    assert.equal(report.compilerStall,null);
    for(const name of['primary','secondary']){
      assert.equal(report.after[name].rustCallbackAllocations,0);assert.equal(report.after[name].rustCallbackDeallocations,0);
      assert.equal(report.after[name].rustProcessingFailures,0);assert.equal(report.after[name].outputLatencyBlocks,0);
      assert.equal(report.after[name].execution,'prepared');
      const recording=report[`${name}Recording`];assert.equal(recording.overflow,false);assert.ok(recording.signal.rms>.001);
      assert.equal(recording.lastContextFrame-recording.firstContextFrame,recording.signal.frames);
      // Any PCM gaps are retained, rather than rerunning until they disappear.
    }
    assert.equal(report.finalGraph.signal.initialParameters.find(p=>p.nodeId===4&&p.id===0).value,.375);
    console.log(JSON.stringify({example,latency:report.latency,after:report.after,
      zeroRuns:[report.primaryRecording.signal.zeroRunsAtLeast128Frames,report.secondaryRecording.signal.zeroRunsAtLeast128Frames],compilerStall:report.compilerStall,workersAfterClose:afterClose}));
  }
  await writeFile(new URL(`../docs/rearchitecture/evidence/${label}.json`,import.meta.url),JSON.stringify({site,chromiumVersion:browser.version(),runs},null,2));
}finally{await browser.close();}
