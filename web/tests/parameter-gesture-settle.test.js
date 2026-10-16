import test from 'node:test';
import assert from 'node:assert/strict';
import {createParameterGesture} from '../../packages/manifold-ui-web/parameter-gesture.js';

test('program retirement waits for the latest coalesced pointer target',async()=>{
  const previous=globalThis.requestAnimationFrame,frames=[],receipts=[],sent=[];
  globalThis.requestAnimationFrame=callback=>frames.push(callback);
  const snapshot=()=>({graph:{signal:{initialParameters:[]}},view:[]});
  const runtime={snapshot,presentation:snapshot,subscribe:()=>()=>{}};
  const gesture=createParameterGesture(runtime,command=>{
    sent.push(command);return new Promise(resolve=>receipts.push(resolve));
  },error=>{throw error;});
  try{
    const first=gesture.set('/old-program/gain',.3);
    frames.shift()();
    const latest=gesture.set('/old-program/gain',.8);
    let retired=false;
    const retirement=gesture.settled().then(()=>{retired=true;});
    receipts.shift()();await Promise.resolve();await Promise.resolve();
    assert.equal(retired,false,'the first receipt must not discard the newer target');
    frames.shift()();
    assert.equal(sent[1].edits[0].value,.8);
    receipts.shift()();
    await Promise.all([first,latest,retirement]);
    assert.equal(retired,true);
  }finally{gesture.destroy();globalThis.requestAnimationFrame=previous;}
});

test('XY intent publishes once, coalesces both targets and preserves the final pair during acknowledgement',async()=>{
  const previous=globalThis.requestAnimationFrame,frames=[],receipts=[],sent=[];
  globalThis.requestAnimationFrame=callback=>frames.push(callback);
  const snapshot=()=>({graph:{endpoints:[{path:'/focus',nodeId:1,id:0},{path:'/shift',nodeId:2,id:0}],signal:{initialParameters:[{nodeId:1,id:0,value:100},{nodeId:2,id:0,value:0}]}}});
  const runtime={snapshot,presentation:snapshot,subscribe:()=>()=>{}};
  const gesture=createParameterGesture(runtime,command=>{sent.push(command);return new Promise(resolve=>receipts.push(resolve));});
  const views=[];gesture.subscribe(state=>views.push(state.graph.signal.initialParameters.map(p=>p.value)));
  try{
    const first=gesture.setBatch([{path:'/focus',value:200},{path:'/shift',value:3}]);
    assert.deepEqual(views,[[200,3]],'never paint a half-updated XY target');frames.shift()();
    const next=gesture.setBatch([{path:'/focus',value:300},{path:'/shift',value:6}]);
    const latest=gesture.setBatch([{path:'/focus',value:400},{path:'/shift',value:9}]);
    receipts.shift()();await Promise.resolve();await Promise.resolve();
    assert.deepEqual(views.at(-1),[400,9],'old acknowledgement cannot move the pad backwards');
    frames.shift()();assert.deepEqual(sent[1].edits,[{path:'/focus',value:400},{path:'/shift',value:9}]);
    receipts.shift()();await Promise.all([first,next,latest,gesture.settled()]);
    assert.equal(sent.length,2);
  }finally{gesture.destroy();globalThis.requestAnimationFrame=previous;}
});
