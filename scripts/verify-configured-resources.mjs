// Offline native/Wasm signal and Rust/JS authoring comparison. No audio device.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { GraphWorkspace, decodeSampleAsset } from '../packages/manifold-author/index.js';
import { PORT_CATALOG } from '../packages/manifold-author/catalog.generated.js';
import { createProject as createRackSampleProject } from '../packages/manifold-author/examples/rack-sample-eight-voice.mjs';
const label=process.argv[2];assert.match(label??'',/^[a-z0-9-]+$/);
const root=new URL('../',import.meta.url),out=new URL(`web/public/configured-resources/${label}/`,root);
await mkdir(out,{recursive:false});
globalThis.sampleRate=48000;globalThis.currentFrame=0;
let Worklet;globalThis.AudioWorkletProcessor=class{constructor(){this.sent=[];this.port={postMessage:message=>this.sent.push(message)};}};
globalThis.registerProcessor=(_,processor)=>{Worklet=processor;};
await import('../web/src/audio/filter-processor.js');
const cases=[['loops','web/public/prepared-loops/2026-09-30-prepared-loops-v3/saved-project.json'],
  ['rack-sample','projects/graph-workspace/authored-rack-sample-eight-voice.json']];
const reports=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const wave=bytes=>{const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(bytes.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(3,20);header.writeUInt16LE(2,22);header.writeUInt32LE(48000,24);header.writeUInt32LE(384000,28);header.writeUInt16LE(8,32);header.writeUInt16LE(32,34);header.write('data',36);header.writeUInt32LE(bytes.length,40);return Buffer.concat([header,bytes]);};
for(const[name,input]of cases){
  const folder=new URL(`${name}/`,out);await mkdir(folder);
  const original=JSON.parse(await readFile(new URL(input,root))),graph=GraphWorkspace.fromProject(original);
  for(const asset of original.assets){const decoded=decodeSampleAsset(asset);graph.setSampleAsset(graph.find(asset.nodeId),decoded.stereo,decoded.sourceRate,asset.label);}
  for(const node of original.signal.nodes){if(node.type==='loop-capture')graph.configure(graph.find(node.id),{capacitySeconds:3});if(node.type==='fixed-gain')graph.configure(graph.find(node.id),{gain:.25});}
  const events=[];let js=graph.toProject();
  if(name==='rack-sample'){
    const project=createRackSampleProject({setRoute:()=>true,setParameter:()=>true,setParameterBatch:()=>true,sendEvent:event=>events.push({...event,channel:event.channel??0,offset:16})},graph);
    for(const voice of[1,8])await project.set(`/midi/synth/rack/sample/1/voice/${voice}/gate`,.8);
    js=project.toProject();
  }
  await writeFile(new URL('js-project.json',folder),JSON.stringify(js));
  const nativePath=new URL('native-project.json',folder),pcmPath=new URL('native.f32',folder);
  const command=['run','--quiet','--release','-p','manifold-native','--example','reauthor_resources','--',new URL(input,root).pathname,nativePath.pathname,pcmPath.pathname];
  const result=spawnSync('cargo',command,{cwd:root.pathname,encoding:'utf8',env:{...process.env,CARGO_BUILD_JOBS:'2'}});
  await writeFile(new URL('native-build.txt',folder),result.stdout+result.stderr);
  assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(await readFile(nativePath)),js);
  const worklet=new Worklet();await worklet.port.onmessage({data:{type:'init',wasmBytes:await readFile(new URL('web/public/manifold_filter.wasm',root)),
    graph:{...js.signal,patchable:true},samples:js.assets.map(decodeSampleAsset),sampleBindings:js.sampleBindings??[],kindCodes:Object.fromEntries(Object.entries(PORT_CATALOG).map(([type,spec])=>[type,spec.code]))}});
  assert.equal(worklet.sent.at(-1).type,'ready');
  for(const event of events)await worklet.port.onmessage({data:{type:'event',...event}});
  const wasm=Buffer.alloc(8192*8);
  for(let block=0;block<64;block++){const left=new Float32Array(128),right=new Float32Array(128);worklet.process([[],[]],[[left,right]]);for(let i=0;i<128;i++){wasm.writeFloatLE(left[i],(block*128+i)*8);wasm.writeFloatLE(right[i],(block*128+i)*8+4);}}
  const native=await readFile(pcmPath);assert.equal(native.length,wasm.length);
  let maxDifference=0,differingSamples=0,peak=0;for(let i=0;i<native.length;i+=4){const a=native.readFloatLE(i),b=wasm.readFloatLE(i),difference=Math.abs(a-b);assert.ok(Number.isFinite(a)&&Number.isFinite(b));maxDifference=Math.max(maxDifference,difference);if(difference)differingSamples++;peak=Math.max(peak,Math.abs(a));}
  await writeFile(new URL('wasm.f32',folder),wasm);
  if(!(peak>.01&&maxDifference<=1e-6))await writeFile(new URL('failure.json',folder),JSON.stringify({peak,maxDifference,differingSamples},null,2));
  assert.ok(peak>.01);assert.ok(maxDifference<=1e-6,`${name}: ${maxDifference}`);
  await writeFile(new URL('native.wav',folder),wave(native));await writeFile(new URL('wasm.wav',folder),wave(wasm));
  reports.push({name,input,inputSha256:hash(await readFile(new URL(input,root))),frames:8192,sampleRate:48000,peak,maxDifference,differingSamples,jsAndRustGraphsEqual:true,captureRingBytes:graph.captureRingBytes(48000),nativePcmSha256:hash(native),wasmPcmSha256:hash(wasm),command:['cargo',...command]});
}
const sourcePaths=['crates/manifold-core/src/node_catalog.rs','crates/manifold-core/src/graph.rs','crates/manifold-native/src/author.rs','crates/manifold-native/src/project.rs','crates/manifold-native/examples/reauthor_resources.rs','packages/manifold-author/index.js','packages/manifold-author/catalog.generated.js','web/src/audio/filter-processor.js','web/public/manifold_filter.wasm','scripts/verify-configured-resources.mjs'];
const sources={};for(const path of sourcePaths){const bytes=await readFile(new URL(path,root)),dest=new URL('measured-source/'+path,out);await mkdir(new URL('./',dest),{recursive:true});await writeFile(dest,bytes);sources[path]=hash(bytes);}
const report={scope:'Offline release Rust authoring/native rendering and normal Wasm AudioWorklet adapter under Node. Not an actual browser callback, legacy C++ comparison or performance benchmark.',reports,sources};
await writeFile(new URL('report.json',out),JSON.stringify(report,null,2));
await writeFile(new URL('index.html',out),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Manifold resource authoring</title><style>body{background:#111820;color:#eee;max-width:900px;margin:40px auto;padding:24px;font:16px/1.5 system-ui}a{color:#9dcfff}audio{display:block;width:100%;margin:12px 0}section{border-top:1px solid #445;padding:16px 0}</style><h1>Shared Rust / JavaScript resource authoring</h1><p>Both author APIs rebuild real saved loop and eight-voice Sample graphs, preserving PCM and shared bindings. Listen to the native/Wasm renderings. Playback is manual.</p><p><a href="/prepared-loops.html">Live capacity editor</a> · <a href="report.json">Raw comparison and sources</a></p><p>${report.scope}</p>${reports.map(r=>`<section><h2>${r.name}</h2><p>${r.frames} stereo frames · maximum difference ${r.maxDifference} · ${r.differingSamples} differing samples.</p><p><a href="${r.name}/js-project.json">JS authored project</a> · <a href="${r.name}/native-project.json">Rust authored project</a></p>Native<audio controls preload="none" src="${r.name}/native.wav"></audio>Wasm<audio controls preload="none" src="${r.name}/wasm.wav"></audio></section>`).join('')}<script>for(const a of document.querySelectorAll('audio'))a.onplay=()=>{for(const b of document.querySelectorAll('audio'))if(b!==a)b.pause()}</script></html>`);
console.log(JSON.stringify(report.reports));
