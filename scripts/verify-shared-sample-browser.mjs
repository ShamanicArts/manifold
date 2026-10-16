import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {chromium}=createRequire(new URL('../web/package.json',import.meta.url))('playwright-core');
const site=process.env.MANIFOLD_SITE_URL??'https://wubulon.tailfac9f9.ts.net:4174';
const label=process.env.MANIFOLD_SHARED_SAMPLE_LABEL??'2026-09-30-shared-sample-browser-v3';
const nativeReview=process.env.MANIFOLD_NATIVE_REVIEW_LABEL??'2026-09-30-native-samples-v3';assert.match(nativeReview,/^[a-z0-9-]+$/);
assert.match(label,/^[a-z0-9-]+$/);
const reportPath=new URL(`../docs/rearchitecture/evidence/${label}.json`,import.meta.url);
try{await access(reportPath);throw new Error('Use a fresh evidence destination');}catch(error){if(error.code!=='ENOENT')throw error;}
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const result={site,recordedAt:new Date().toISOString(),chromiumVersion:browser.version(),modes:[]};
try{
  const page=await browser.newPage({viewport:{width:1250,height:1250}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(site+'/native-sample-authoring.html');assert.equal(await page.evaluate(()=>crossOriginIsolated),true);
  const click=async(id,status)=>{await page.locator('#'+id).click();await page.waitForFunction(text=>document.querySelector('#status').textContent===text,status);};
  const sample=()=>page.evaluate(()=>{const api=window.manifoldSharedSample,pcm=new Float32Array(api.analyser.fftSize);api.analyser.getFloatTimeDomainData(pcm);return{rms:Math.sqrt(pcm.reduce((sum,v)=>sum+v*v,0)/pcm.length),diagnostics:api.host.diagnostics,state:api.project.toProject()};});
  for(const mode of ['rack','instrument']){
    await page.locator('#mode').selectOption(mode);
    await click('start','Running.');await click('sound','Playing.');await page.waitForTimeout(250);
    const playing=await sample();assert.ok(playing.rms>.001,mode);
    if(mode==='rack'){await click('insert','Accepted topology edit.');assert.equal((await sample()).state.signal.nodes.find(node=>node.id===800).a,1);}
    await page.locator('#frequency').fill(mode==='rack'?'330':'440');await click('replace','Published new PCM.');
    await click('off','All voices off.');await click('sound','Playing.');await page.waitForTimeout(250);
    const replaced=await sample();assert.ok(replaced.rms>.001,mode);
    assert.match(replaced.state.assets[0].label,mode==='rack'?/330/:/440/);
    const downloaded=page.waitForEvent('download');await click('save','Downloaded graph and PCM.');const download=await downloaded;
    const savedPath=new URL(`../docs/rearchitecture/evidence/${label}-${mode}-saved.json`,import.meta.url);await download.saveAs(savedPath.pathname);
    assert.equal(JSON.parse(await readFile(savedPath)).assets[0].pcmF32Base64,replaced.state.assets[0].pcmF32Base64);
    await page.screenshot({path:new URL(`../docs/rearchitecture/evidence/${label}-${mode}.png`,import.meta.url).pathname,fullPage:true});
    await click('stop','Stopped.');await click('start','Running.');
    if(mode==='instrument')await click('sound','Playing.');await page.waitForTimeout(250);
    const reopened=await sample();assert.ok(reopened.rms>.001,mode);assert.equal(reopened.state.assets[0].pcmF32Base64,replaced.state.assets[0].pcmF32Base64);
    if(mode==='rack')assert.equal(reopened.state.signal.nodes.find(node=>node.id===800).a,1);
    for(const snapshot of [playing,replaced,reopened])for(const key of ['rustCallbackAllocations','rustCallbackDeallocations','rustProcessingFailures'])assert.equal(snapshot.diagnostics[key],0);
    const summarize=({rms,diagnostics,state})=>({rms,diagnostics,nodes:state.signal.nodes.length,assets:state.assets.map(({pcmF32Base64,...asset})=>({...asset,sha256:createHash('sha256').update(pcmF32Base64).digest('hex')}))});
    result.modes.push({mode,playing:summarize(playing),replaced:summarize(replaced),reopened:summarize(reopened)});
    await click('stop','Stopped.');
  }
  const cdp=await browser.newBrowserCDPSession();const workers=(await cdp.send('Target.getTargets')).targetInfos.filter(target=>target.type==='worker'&&target.url.includes('prepared-compiler'));
  assert.deepEqual(workers,[]);assert.deepEqual(errors,[]);result.workersAfterClose=workers;result.pageErrors=errors;
  const root=`/native-samples/${nativeReview}/`;await page.goto(site+root);assert.equal(await page.locator('audio').count(),5);
  await page.locator('audio').nth(0).evaluate(player=>player.play());await page.locator('audio').nth(1).evaluate(player=>player.play());
  await page.waitForFunction(()=>document.querySelectorAll('audio')[0].paused&&!document.querySelectorAll('audio')[1].paused);await page.locator('audio').nth(1).evaluate(player=>player.pause());
  const served=await page.evaluate(async root=>{
    const report=await(await fetch(root+'publication-report.json')).json(),rows=[];
    for(const[path,expected]of Object.entries(report.sourceHashes)){
      const response=await fetch(root+'measured-source/'+path),bytes=await response.arrayBuffer();
      const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');rows.push({path,expected,actual,status:response.status});
    }return rows;
  },root);
  for(const row of served){assert.equal(row.status,200);assert.equal(row.actual,row.expected);}result.servedSources=served;
  await page.screenshot({path:new URL(`../docs/rearchitecture/evidence/${label}-recordings.png`,import.meta.url).pathname,fullPage:true});
  await writeFile(reportPath,JSON.stringify(result,null,2));console.log(JSON.stringify(result.modes.map(({mode,playing,reopened})=>({mode,rms:playing.rms,reopenedRms:reopened.rms}))));
}catch(error){await writeFile(new URL(`../docs/rearchitecture/evidence/${label}-failure.json`,import.meta.url),JSON.stringify({...result,error:error.stack},null,2));throw error;}finally{await browser.close();}
