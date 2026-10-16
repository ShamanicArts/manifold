import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiveProjectRuntime } from '../../packages/manifold-author/live-project.js';
import { source } from '../../packages/manifold-author/examples/standalone-oscillator.mjs';
const base='/midi/synth/rack/osc/1';
test('original oscillator control fanout is acknowledged atomically and survives source/recall',async()=>{
  let acknowledge, batches=[];
  const runtime=new LiveProjectRuntime({ready:true,setParameterBatch(edits){batches.push(edits);return new Promise(resolve=>acknowledge=resolve);},replaceGraph:async()=>true},source);
  const pending=runtime.request({operation:'control.set',path:base+'/unison',value:4});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(batches[0].length,9);
  assert.equal(runtime.project.controls.find(c=>c.path===base+'/unison').value,1);
  acknowledge(true);await pending;
  assert.equal(runtime.project.signal.initialParameters.filter(p=>p.id===10&&p.value===4).length,9);
  await runtime.request({operation:'source.apply',source:'// user edit\n'+source});
  const restored=new LiveProjectRuntime(null,runtime.source,runtime.save());
  assert.equal(restored.project.controls.find(c=>c.path===base+'/unison').value,4);
  assert.equal(restored.project.signal.initialParameters.filter(p=>p.id===10&&p.value===4).length,9);
  assert.equal(restored.presentation().parameters.find(p=>p.path===base+'/unison').operation,'control.set');
});
test('rejected authored control transactions retain graph and revision',async()=>{
  const runtime=new LiveProjectRuntime({ready:true,setParameterBatch:async()=>false},source);
  const before=runtime.save();
  await assert.rejects(runtime.request({operation:'control.set',path:base+'/waveform',value:3}),{code:'host-rejected'});
  await assert.rejects(runtime.request({operation:'control.batch',edits:[{path:base+'/unison',value:4},{path:base+'/detune',value:20}]}),{code:'host-rejected'});
  await assert.rejects(runtime.request({operation:'control.set',path:base+'/unison',value:2.5}),{code:'invalid-control'});
  assert.deepEqual(runtime.save(),before);assert.equal(runtime.revision,0);
});
