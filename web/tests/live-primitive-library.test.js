import {test}from 'node:test';
import assert from 'node:assert/strict';
import{LiveProjectRuntime}from '../../packages/manifold-author/live-project.js';
import{getProgram}from '../../packages/manifold-author/examples/primitive-library.mjs';
const source=getProgram('fx-slots').source,select='/test/fxslot/slotA/select',width='/test/fxslot/slotA/width/amount';
const instance=p=>p.instances.find(i=>i.path==='/test/fxslot/slotA/nodes/width');
test('lazy factory waits for graph acknowledgement; inactive memory survives edits and cold recall',async()=>{
 let acknowledge,prepared;
 const runtime=new LiveProjectRuntime({ready:true,replaceGraph:p=>{prepared=p;return new Promise(resolve=>acknowledge=resolve);},setParameterBatch:async()=>true},source);
 await runtime.request({operation:'control.set',path:width,value:1.9});
 assert.equal(instance(runtime.project),undefined);
 const pending=runtime.request({operation:'control.set',path:select,value:1});await new Promise(r=>setImmediate(r));
 assert.ok(instance(prepared));assert.equal(instance(runtime.project),undefined);acknowledge(true);await pending;
 assert.equal(runtime.project.signal.initialParameters.find(p=>p.nodeId===instance(runtime.project).nodeId&&p.id===0).value,1.9);
 await runtime.request({operation:'control.set',path:select,value:0});
 const edit=runtime.request({operation:'source.apply',source:'// edit with visited inactive Width\n'+source});await new Promise(r=>setImmediate(r));acknowledge(true);await edit;
 assert.ok(instance(runtime.project));assert.equal(runtime.project.controls.find(c=>c.path===select).value,0);
 const recalled=new LiveProjectRuntime(null,runtime.source,runtime.save());await recalled.request({operation:'control.set',path:select,value:1});
 assert.equal(recalled.project.signal.initialParameters.find(p=>p.nodeId===instance(recalled.project).nodeId&&p.id===0).value,1.9);
});
test('rejected structural controls and invalid candidate graphs preserve accepted source, state and revision',async()=>{
 const runtime=new LiveProjectRuntime({ready:true,replaceGraph:async()=>false},source),before=runtime.save();
 await assert.rejects(runtime.request({operation:'control.set',path:select,value:1}),{code:'host-rejected'});
 assert.deepEqual(runtime.save(),before);assert.equal(runtime.revision,0);
 const bad=source.replace(/session\.transaction\(\(?graph\)?\s*=>\s*applySlot\(graph,\s*path,\s*value\)\)/,'session.transaction(graph=>{graph.connect(graph.find(13).output("out"),graph.find(4).input("audio"));})');
 assert.notEqual(bad,source,'The rejected candidate actually contains a cycle');
 const cycle=new LiveProjectRuntime(null,bad),prior=cycle.save();
 await assert.rejects(cycle.request({operation:'control.set',path:select,value:1}));assert.deepEqual(cycle.save(),prior);
});
