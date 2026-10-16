import test from 'node:test';
import assert from 'node:assert/strict';
import { createGraphWorkspace, GraphWorkspace, getPrimitive } from '@manifold/author';
import { parseGraphBundle } from '../src/graph/topology.js';
import { readFileSync } from 'node:fs';

test('public constructors preserve configuration, transport controls and fork isolation', () => {
  const graph=createGraphWorkspace(), loop=graph.add('loop-capture',{id:2,config:{capacitySeconds:.05}});
  const gain=graph.add('fixed-gain',{id:4,config:{gain:.25}});
  graph.connect(graph.input.output('out'),loop.input('audio'));graph.connect(loop.output('out'),gain.input('audio'));
  graph.connect(gain.output('out'),graph.output.input('in'));
  graph.setSampleAsset(loop,new Float32Array(64).fill(.2),48000,'configured take');graph.setParameter(loop,1,1);
  const original=graph.toProject();assert.equal(graph.captureRingBytes(48000),2400*8);
  assert.equal(getPrimitive('loop-capture').configuration.capacitySeconds.max,undefined);
  assert.deepEqual(GraphWorkspace.fromProject(original).toProject(),original);
  assert.deepEqual(parseGraphBundle(original).signal.nodes,original.signal.nodes);
  assert.equal(parseGraphBundle(original).assets[0].stereo[0],Math.fround(.2));
  const clone=graph.fork();clone.configure(clone.find(2),{capacitySeconds:.1});
  assert.equal(clone.captureRingBytes(48000),4800*8);assert.deepEqual(graph.toProject(),original);
  for(const config of [{capacitySeconds:0},{capacitySeconds:-1},{capacitySeconds:NaN},{typo:2}]) {
    assert.throws(()=>graph.configure(loop,config),{code:'invalid-configuration'});assert.deepEqual(graph.toProject(),original);
  }
  assert.throws(()=>graph.add('fixed-gain',{id:10,config:{gain:4.001}}),{code:'invalid-configuration'});
  assert.equal(graph.find(10),undefined);
});

test('capture ring resource budget follows actual f32 capacities and sample rate', () => {
  const graph=createGraphWorkspace();graph.connect(graph.input.output('out'),graph.output.input('in'));
  for(let id=4;id<8;id++)graph.add('retrospective-capture',{id,config:{capacitySeconds:120}});
  assert.equal(graph.captureRingBytes(48000),4*120*48000*8);
  for(let id=4;id<8;id++)graph.configure(graph.find(id),{capacitySeconds:1});
  assert.equal(graph.captureRingBytes(48000),4*48000*8);
  assert.throws(()=>graph.captureRingBytes(Infinity),{code:'invalid-sample-rate'});
});

test('normal Wasm honors configured capture capacity through actual record and playback', async () => {
  globalThis.sampleRate=48000;globalThis.currentFrame=0;
  let Worklet;
  globalThis.AudioWorkletProcessor=class {constructor(){this.sent=[];this.port={postMessage:message=>this.sent.push(message)};}};
  globalThis.registerProcessor=(_,processor)=>{Worklet=processor;};
  await import('../src/audio/filter-processor.js');
  const graph=createGraphWorkspace(),loop=graph.add('loop-capture',{id:2,config:{capacitySeconds:.05}});
  const gain=graph.add('fixed-gain',{id:4,config:{gain:.25}});
  graph.connect(graph.input.output('out'),loop.input('audio'));graph.connect(loop.output('out'),gain.input('audio'));
  graph.connect(gain.output('out'),graph.output.input('in'));
  const worklet=new Worklet();await worklet.port.onmessage({data:{type:'init',
    wasmBytes:readFileSync(new URL('../public/manifold_filter.wasm',import.meta.url)),graph:{...graph.toProject().signal,patchable:true}}});
  assert.equal(worklet.sent.at(-1).type,'ready');
  const parameter=async(id,value)=>{await worklet.port.onmessage({data:{type:'parameter-request',requestId:id+1,nodeId:2,id,value}});assert.equal(worklet.sent.at(-1).accepted,true);};
  await parameter(0,1);
  for(let block=0;block<24;block++){
    const input=Float32Array.from({length:128},(_,frame)=>(block*128+frame)/4096),left=new Float32Array(128),right=new Float32Array(128);
    worklet.process([[input,input]],[[left,right]]);assert.deepEqual(left,input.map(value=>value*.25));
  }
  await parameter(0,0);await parameter(1,1);
  assert.equal(worklet.engine.manifold_capture_length(2),2400);
  const left=new Float32Array(128),right=new Float32Array(128);
  worklet.process([[],[]],[[left,right]]);
  assert.deepEqual(left,Float32Array.from({length:128},(_,frame)=>(672+frame)/4096*.25));
});


test('capture configuration carries long durations and windows without quota metadata', () => {
  const graph = createGraphWorkspace();
  const capture = graph.add('retrospective-capture', {id: 4, config: {capacitySeconds: 240}});
  graph.configureCaptureWindow({captureWindowSeconds: 180, captureWindowBars: 90});
  graph.connect(graph.input.output('out'), capture.input('audio'));
  graph.connect(graph.input.output('out'), graph.output.input('in'));
  assert.equal(graph.captureRingBytes(48000), 240 * 48000 * 8);
  const saved = graph.toProject();
  assert.deepEqual(GraphWorkspace.fromProject(saved).toProject(), saved);
  assert.equal(parseGraphBundle(saved).signal.captureWindowSeconds, 180);
});
