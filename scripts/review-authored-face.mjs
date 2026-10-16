// Drive an explicitly leased BB automation tab. Connection JSON is private.
// This uses BB's scoped CDP connection, never the user's personal browser.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const [connection, output, ...targets] = process.argv.slice(2);
const platforms = targets.filter(value => !value.startsWith('--'));
if (!connection || !output) throw new Error('Usage: review-authored-face.mjs CONNECTION.json OUTPUT [linux windows macos]');
await mkdir(output, { recursive: true });
const { wsEndpoint } = JSON.parse(await readFile(connection, 'utf8'));
const ws = new WebSocket(wsEndpoint);
await new Promise((yes, no) => { ws.onopen = yes; ws.onerror = no; });
let nextId = 0;
const waiting = new Map();
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const pair = waiting.get(message.id); waiting.delete(message.id);
    if (message.error) pair?.reject(new Error(JSON.stringify(message.error)));
    else pair?.resolve(message.result);
  }
};
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++nextId; waiting.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});
const pause = ms => new Promise(yes => setTimeout(yes, ms));
const target = (await send('Target.getTargets')).targetInfos.find(t => t.url.includes('ui-orbit'));
if (!target) throw new Error('Leased Three Tone creator tab not found');
const { sessionId } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
}
async function until(expression, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await evaluate(expression);
    if (result) return result;
    await pause(300);
  }
  throw new Error('Browser wait timed out: ' + expression);
}
async function click(selector) {
  const point = await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', {type, ...point, button:'left', clickCount:1}, sessionId);
}
async function fill(selector, text) {
  await click(selector);
  await send('Input.dispatchKeyEvent', {type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2}, sessionId);
  await send('Input.dispatchKeyEvent', {type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2}, sessionId);
  await send('Input.insertText', {text}, sessionId);
}
async function picture(name) {
  const result = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  await writeFile(resolve(output, name), Buffer.from(result.data, 'base64'));
}
try {
  await send('Page.addScriptToEvaluateOnNewDocument', {source:`const NativeAudioContext=window.AudioContext;window.AudioContext=class extends NativeAudioContext{constructor(options={}){super({...options,sinkId:{type:'none'}})}};`}, sessionId);
  await send('Page.reload', {}, sessionId);
  await until('!!window.manifold && !!document.querySelector("#export-build") && !document.querySelector("#plugin-export-form select[name=target]").disabled');
  // BB's scoped endpoint does not install new-document scripts. Verify the
  // silent sink in this actual page before any playback or host connection.
  await evaluate(`(()=>{const Native=window.AudioContext;window.AudioContext=class extends Native{constructor(options={}){super({...options,sinkId:{type:'none'}});if(this.sinkId?.type!=='none'){void this.close();throw new Error('Private silent audio sink unavailable')}}};return true})()`);
  await click('#show-script');
  await click('#reset');
  await until('window.manifold.runtime.source.includes("camera.position.set(0, 0, 4.8)")');
  await click('#show-script');
  await click('#start');
  await until('window.manifold.host?.ready && window.manifold.audioSink === "none"');
  await until('!!document.querySelector(".orbit-face")');
  await picture('studio.png');
  await click('#arrange-controls');
  const previousLayout=await evaluate('window.manifold.runtime.snapshot().webView.layout');
  const handle=await evaluate(`(()=>{const el=document.querySelector('[data-layout-path="/ui/space/pitch"]');const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...handle,button:'left',clickCount:1},sessionId);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:handle.x+15,y:handle.y+8,button:'left',buttons:1},sessionId);
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:handle.x+15,y:handle.y+8,button:'left',clickCount:1},sessionId);
  await until('window.manifold.runtime.snapshot().webView.layout.find(c=>c.path==="/ui/space/pitch").y > 12');
  await click('#arrange-controls');
  const arranged=await evaluate('window.manifold.runtime.snapshot().webView.layout');
  await writeFile(resolve(output,'layout-proof.json'),JSON.stringify({before:previousLayout,after:arranged},null,2));
  await click('#show-script');
  const original = await evaluate('window.manifold.runtime.source');
  const source = `// Exported from the website at ${new Date().toISOString()}.\n` + original.replace(/^\/\/ Exported from the website[^\n]*\n/, '');
  await fill('#editor .cm-content', source);
  await until('!document.querySelector("#export-draft").hidden');
  await click('#run');
  await until('window.manifold.runtime.source.startsWith("// Exported from the website") && document.querySelector("#export-draft").hidden');
  // Live values differ from the default preset; native default recall must match.
  const agentAddress = await evaluate('document.getElementById("agent-address").textContent');
  async function agent(command) {
    const response = await fetch(agentAddress,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)});
    const value = await response.json();
    if(!response.ok || value.error)throw new Error(JSON.stringify(value));
    return value.result;
  }
  const snapshot = await evaluate('window.manifold.runtime.snapshot()');
  const changed = await fetch(agentAddress, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'parameter.batch',expectedRevision:snapshot.revision,edits:[{path:'/ui/space/pitch',value:440},{path:'/ui/space/cutoff',value:1234}]})});
  if (!changed.ok) throw new Error(await changed.text());
  await until('window.manifold.runtime.presentation().parameters.find(p=>p.path==="/ui/space/cutoff").value === 1234');
  await click('#show-script');
  await click('#plugin-export summary');
  await fill('#plugin-export-form input[name=name]', 'Manifold Orbit');
  await fill('#plugin-export-form input[name=id]', 'local.manifold.orbit');
  await fill('#plugin-export-form input[name=vendor]', 'Manifold Creator');
  await picture('browser-ready.png');
  const captured = await evaluate('({revision:window.manifold.runtime.revision,project:window.manifold.runtime.save(),webView:window.manifold.runtime.snapshot().webView,audioSink:window.manifold.audioSink})');
  await writeFile(resolve(output,'captured.json'), JSON.stringify(captured,null,2)+'\n');
  const results=[];
  for (const platform of platforms.length ? platforms : ['linux']) {
    // Choose through the native select keyboard to exercise the actual form.
    await click('#plugin-export-form select[name=target]');
    const index = ['linux','windows','macos'].indexOf(platform);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Home',code:'Home',windowsVirtualKeyCode:36},sessionId);
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Home',code:'Home',windowsVirtualKeyCode:36},sessionId);
    for(let i=0;i<index;i++) {
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40},sessionId);
      await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40},sessionId);
    }
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
    await until(`document.querySelector('#plugin-export-form select[name=target]').value === ${JSON.stringify(platform)}`);
    const previousJob = await evaluate('document.getElementById("export-history").value');
    await click('#export-build');
    const jobId = await until(`document.getElementById('export-status').textContent.includes(${JSON.stringify(platform)}) && document.getElementById('export-history').value !== ${JSON.stringify(previousJob)} && document.getElementById('export-history').value`);
    console.log(JSON.stringify({platform,job:jobId,stage:'browser submission accepted'}));
    await pause(1600); await picture(platform+'-building.png');
    const origin = new URL(target.url).origin;
    let job;
    const deadline=Date.now()+25*60*1000;
    do {
      await pause(1500);
      job = await (await fetch(origin+'/__manifold/exports/'+jobId)).json();
      if (job.status==='failed') throw new Error(JSON.stringify(job));
    } while(job.status!=='complete' && Date.now()<deadline);
    if(job.status!=='complete')throw new Error('Native build timed out');
    await until('document.getElementById("export-status").textContent.startsWith("Ready to download")');
    await picture(platform+'-complete.png');
    const download=await fetch(origin+job.downloads['plugin.tar.gz']);
    const bytes=Buffer.from(await download.arrayBuffer());
    const sha=createHash('sha256').update(bytes).digest('hex');
    if(sha!==job.archiveSha256)throw new Error('Downloaded archive hash mismatch');
    await writeFile(resolve(output,platform+'.tar.gz'),bytes);
    const packageDocument=await (await fetch(origin+job.downloads['project.manifold.json'])).json();
    if(packageDocument.state.liveAuthoring.source!==captured.project.source)throw new Error('Downloaded package lost edited source');
    if(!isDeepStrictEqual(packageDocument.state.signal,captured.project.graph.signal))throw new Error('Downloaded package lost live signal graph/values');
    const receipt=await (await fetch(origin+job.downloads['receipt.json'])).json();
    const result={...job,receipt,downloadVerified:true,editedSourceAndValuesVerified:true};
    await writeFile(resolve(output,platform+'-job.json'),JSON.stringify(result,null,2)+'\n');
    results.push(result);
    console.log(JSON.stringify({platform,job:jobId,status:job.status,archiveSha256:sha}));
  }
  // Reload really reconnects to the job and leaves downloadable state visible.
  await send('Page.reload', {}, sessionId);
  await until('document.getElementById("export-status")?.textContent.startsWith("Ready to download")');
  await click('#plugin-export summary');
  await picture('browser-reconnected.png');
  await writeFile(resolve(output,'report.json'),JSON.stringify({actualBbBrowser:true,actualExportButton:true,audioSink:'none',capturedRevision:captured.revision,editedSourceAndLiveValues:true,reconnectedAfterReload:true,jobs:results.map(r=>({id:r.id,target:r.target,archiveSha256:r.archiveSha256}))},null,2)+'\n');
} finally { ws.close(); }
