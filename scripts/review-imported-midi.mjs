// Actual imported product, Web MIDI access and owned ALSA port. Headless review.
import {chromium} from '../web/node_modules/playwright-core/index.mjs';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const mainWave=process.argv.includes('--main-wave');
const output=process.argv[2];if(!output)throw Error('Provide output directory');await mkdir(output,{recursive:true});
const fixture=spawn('/tmp/manifold-midi-fixture',['ManifoldReview browser-notes'],{stdio:['pipe','pipe','inherit']});
const lines=createInterface({input:fixture.stdout});let lineQueue=[],waiting=[];lines.on('line',line=>{const wait=waiting.shift();wait?wait(JSON.parse(line)):lineQueue.push(JSON.parse(line));});
const line=()=>lineQueue.length?Promise.resolve(lineQueue.shift()):new Promise(r=>waiting.push(r));
const address=await line(),trace=[];
const send=async command=>{fixture.stdin.write(command+'\n');assert((await line()).sent);trace.push(command);};
let browser,page,previewValidated=false;
try {
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,env:{...process.env,ALSA_CONFIG_PATH:'/usr/share/alsa/alsa.conf'},args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({permissions:['midi','midi-sysex'],viewport:{width:1100,height:1200}});
 await context.addInitScript(()=>{const C=globalThis.AudioContext;globalThis.AudioContext=class extends C{constructor(o){super({...o,sinkId:{type:'none'}});if(this.sinkId?.type!=='none')throw Error('Private audio sink required')}};});
 page=await context.newPage();await page.goto('https://wubulon.tailfac9f9.ts.net:4174/examples/instrument-import/'+(mainWave?'?project=main-wave':''));
 await page.locator('#start').click();await page.waitForFunction(()=>window.manifoldInstrument?.host?.ready);assert.equal(await page.evaluate(()=>window.manifoldInstrument.audioSink),'none');
 await page.locator('#midi-connect').click();await page.waitForFunction(()=>[...document.querySelector('#midi-input').options].some(o=>o.textContent.includes('ManifoldReview browser-notes')));
 const id=await page.locator('#midi-input option').evaluateAll(options=>options.find(o=>o.textContent.includes('ManifoldReview browser-notes')).value);await page.locator('#midi-input').selectOption(id);await page.waitForFunction(()=>document.querySelector('#midi-status').textContent.includes('MIDI connected'));
 await page.evaluate(()=>{window.reviewChunks=[];window.reviewRecorder=new MediaRecorder(window.manifoldInstrument.outputStream);reviewRecorder.ondataavailable=e=>reviewChunks.push(e.data);reviewRecorder.start();});
 const wait=async count=>{await page.waitForFunction(count=>window.manifoldInstrument.runtime.snapshot().eventState.voices.filter(v=>v.gate).length===count,count);};
 await send('on 0 60 100');await send('on 1 64 100');await wait(2);await page.waitForTimeout(500);await page.screenshot({path:output+'/midi-held.png',fullPage:true});
 const request=command=>page.evaluate(command=>window.manifoldInstrument.request(command),command);
 if(await page.locator('canvas.manifold-curve').count()) {
  await page.locator('[data-note="48"]').click();await page.keyboard.down('a');await wait(3);
  await page.evaluate(()=>{window.reviewKeyboard=document.querySelector('.manifold-keyboard');});
  await request({operation:'control.set',path:mainWave?'/midi/synth/waveform':'/midi/synth/rack/osc/1/waveform',value:6,origin:'agent-preview'});
  await wait(3);assert(await page.evaluate(()=>reviewKeyboard===document.querySelector('.manifold-keyboard')));
  assert.equal(await page.locator('canvas.manifold-curve').first().getAttribute('aria-label'),'PULSE MODE');
  previewValidated=true;await page.screenshot({path:output+'/live-preview.png',fullPage:true});await page.keyboard.up('a');await wait(2);
 }
 const source=await page.evaluate(()=>window.manifoldInstrument.runtime.source);let edited=source.replace('return { graph, view, paint,','const post=graph.add("gain",{id:22});graph.registerInstance("/midi/post",post);graph.setParameter(post,0,.7);graph.disconnect(graph.output.input("in"));graph.connect(graph.find(21).output("out"),post.input("audio"));graph.connect(post.output("out"),graph.output.input("in")); return { graph, view, paint,');
 if(mainWave)edited=source.replace('return {graph,view,paint,','const post=graph.add("gain",{id:120});graph.registerInstance("/main/post",post);graph.setParameter(post,0,.7);graph.disconnect(graph.output.input("in"));graph.connect(graph.findInstance("/main/nodes/master").output("out"),post.input("audio"));graph.connect(post.output("out"),graph.output.input("in")); return {graph,view,paint,');
 await request({operation:'source.apply',source:edited,origin:'agent-review'});await wait(2);
 await send('cc 0 64 127');await send('cc 0 123 0');await page.waitForFunction(()=>window.manifoldInstrument.runtime.snapshot().eventState.voices.some(v=>v.note===60&&v.gate&&!v.keyDown));await wait(2);
 await send('cc 0 64 0');await wait(1);assert.equal(await page.evaluate(()=>window.manifoldInstrument.runtime.snapshot().eventState.voices.find(v=>v.gate).note),64);
 await request({operation:'event.send',event:{type:'note-on',note:67,owner:'agent-review'}});await wait(2);await send('cc 1 120 0');await wait(1);assert.equal(await page.evaluate(()=>window.manifoldInstrument.runtime.snapshot().eventState.voices.find(v=>v.gate).owner),'agent-review');
 await send('on 0 69 100');await wait(2);fixture.stdin.end();await new Promise(r=>fixture.once('exit',r));await wait(1);assert.equal(await page.evaluate(()=>window.manifoldInstrument.runtime.snapshot().eventState.voices.find(v=>v.gate).owner),'agent-review');
 await page.locator('.keyboard-panic').click();await wait(0);await page.waitForTimeout(700);await page.screenshot({path:output+'/released.png',fullPage:true});
 const audio=await page.evaluate(()=>new Promise(r=>{reviewRecorder.onstop=()=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(new Blob(reviewChunks,{type:reviewRecorder.mimeType}));};reviewRecorder.stop();}));await writeFile(output+'/midi-audio.webm',Buffer.from(audio,'base64'));
 const saved=await page.evaluate(()=>window.manifoldInstrument.runtime.save());await writeFile(output+'/Oscillator-midi.live.json',JSON.stringify(saved,null,2));
 const report={accepted:true,product:mainWave?'Main Wave':'StandaloneOsc',browser:'isolated headless Chromium; not BB',input:'owned ALSA virtual sequencer; not physical hardware',actualDeviceSelection:true,channels:[0,1],heldNotesThroughSourceEdit:true,sustainAndCC123:true,channelPanicPreservesAgentVoice:true,disconnectPreservesAgentVoice:true,actualGlobalReleaseButton:true,livePreviewControlEditPreservesKeyboard:previewValidated,audioSink:'none',fixture:address,sent:trace,glitchFreeContinuityProven:false};await writeFile(output+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 await page.locator('#stop').click();
} catch(error) {
 const observed=await page?.evaluate(()=>({status:document.querySelector('#midi-status')?.textContent,options:[...document.querySelectorAll('#midi-input option')].map(o=>({id:o.value,name:o.textContent})),midiApi:!!navigator.requestMIDIAccess})).catch(()=>null);
 await writeFile(output+'/failed-review.json',JSON.stringify({accepted:false,error:String(error),observed},null,2));await page?.screenshot({path:output+'/failed-review.png',fullPage:true});throw error;
} finally {await browser?.close();if(fixture.exitCode===null)fixture.kill('SIGTERM');lines.close();}
