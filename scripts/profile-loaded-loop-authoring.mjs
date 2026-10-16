// Profile the actual loaded project; no substitute DSP or desktop windows.
import { createRequire } from 'node:module';
import { access, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const { chromium }=createRequire(new URL('../web/package.json',import.meta.url))('playwright-core');
const label=process.env.MANIFOLD_LOOP_PROFILE_LABEL??'2026-09-30-loaded-loop-summary-ui-profile';
if(!/^[a-z0-9-]+$/.test(label))throw new Error('Invalid evidence label');
const path=new URL(`../docs/rearchitecture/evidence/${label}.json`,import.meta.url);
try{await access(path);throw new Error('Evidence exists');}catch(error){if(error.code!=='ENOENT')throw error;}
const site=process.env.MANIFOLD_SITE_URL??'https://wubulon.tailfac9f9.ts.net:4174';
const editCount=Number(process.env.MANIFOLD_LOOP_PROFILE_EDITS??3);
assert.ok(Number.isInteger(editCount)&&editCount>=3&&editCount<=100);
const sourceHashes={};
for(const source of ['packages/manifold-author/index.js','packages/manifold-author/sample-assets.js',
 'packages/manifold-author/prepared-compiler.js','packages/manifold-author/prepared-runtime.js',
 'packages/manifold-author/runtime/manifold_prepared.wasm','web/src/prepared-loops.js']){
 sourceHashes[source]=createHash('sha256').update(await readFile(new URL(`../${source}`,import.meta.url))).digest('hex');
}
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage();await page.goto(`${site}/prepared-loops.html`);await page.locator('#review-project').click();await page.waitForFunction(()=>!document.querySelector('#start').disabled);await page.locator('#start').click();await page.waitForFunction(()=>!document.querySelector('#stop').disabled);
 const result=await page.evaluate(async(editCount)=>{
  const {GraphWorkspace,project,host,context}=window.manifoldPreparedLoops,original=GraphWorkspace.fromProject;
  let calls=[];GraphWorkspace.fromProject=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{calls.push(performance.now()-start);}};
  const edits=[];
  try{for(let index=0;index<editCount;index++){
    calls=[];const requestedAudioFrame=Math.round(context.currentTime*context.sampleRate),start=performance.now();
    await project.setInsert(index%2===0,0);
    edits.push({index,totalMs:performance.now()-start,fromProjectCalls:[...calls],requestedAudioFrame,diagnostics:host.diagnostics});
  }}finally{GraphWorkspace.fromProject=original;}
  return {edits,graphAssetBytes:project.toProject().assets.reduce((sum,asset)=>sum+asset.frames*8,0),displayedGraphCharacters:document.querySelector('#graph').textContent.length};
 },editCount);
 for(const edit of result.edits){
  for(const key of ['rustCallbackAllocations','rustCallbackDeallocations','rustProcessingFailures'])assert.equal(edit.diagnostics[key],0);
  assert.equal(edit.diagnostics.compilerFailed,false);assert.equal(edit.diagnostics.processorFailed,false);
 }
 await page.locator('#stop').click();await page.waitForFunction(()=>!window.manifoldPreparedLoops.host);
 const report={recordedAt:new Date().toISOString(),site,chromiumVersion:browser.version(),sourceHashes,instrumentation:'Main-thread GraphWorkspace.fromProject wall time; wrapped without changing results or audio processing',...result};
 await writeFile(path,JSON.stringify(report,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
