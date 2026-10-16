import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiveProjectRuntime } from '@manifold/author/live-project';
import { replaceWebViewSource } from '@manifold/author/web-view';
import { getProgram } from '@manifold/author/examples/primitive-library';
import { mountCustomView } from '@manifold/ui-web/custom-view';

test('custom view source follows accepted edits, undo and cold recall; malformed edits never reach audio', async () => {
  let replacements = 0;
  const host = { ready:true, replaceGraph:async () => { replacements++; return true; }, setParameter:async()=>true };
  const runtime = new LiveProjectRuntime(host,getProgram('ui-three-tone').source);
  await runtime.request({operation:'parameter.set',path:'/ui/space/pitch',value:440});
  const before = runtime.snapshot().webView;
  assert.equal(before.dependencies.three,'0.184.0');
  const changed = before.source.replace("tone: '#38bdf8'", "tone: '#fb7185'");
  await runtime.request({operation:'source.apply',source:replaceWebViewSource(runtime.source,changed)});
  assert.equal(replacements,1);
  assert.equal(runtime.snapshot().webView.source,changed);
  const saved = runtime.save();
  assert.deepEqual(new LiveProjectRuntime(null,saved.source,saved).snapshot().webView,runtime.snapshot().webView);
  const endpoint = runtime.project.endpoints.find(e=>e.path==='/ui/space/pitch');
  assert.equal(runtime.project.signal.initialParameters.find(p=>p.nodeId===endpoint.nodeId&&p.id===endpoint.id).value,440);
  await assert.rejects(runtime.request({operation:'source.apply',source:replaceWebViewSource(runtime.source,'export default { broken:')}));
  assert.equal(replacements,1);
  assert.deepEqual(runtime.save(),saved);
  await runtime.request({operation:'project.undo'});
  assert.deepEqual(runtime.snapshot().webView,before);
  await runtime.request({operation:'project.restore',project:saved});
  assert.equal(runtime.snapshot().webView.source,changed);
});

test('custom modules use versioned explicit imports, shared controls and a disposable subscription', async () => {
  const runtime = new LiveProjectRuntime(null,getProgram('ui-three-tone').source);
  const calls = [];
  const element = {style:{},replaceChildren(){calls.push('clear');}};
  const source = `import {record} from 'test-view';
export default function createView(){return {mount(element,api){
  record.api=api;
  return {update(state){record.updates.push(state.revision);},dispose(){record.disposals++;}};
}};}`;
  const definition = {version:1,source,dependencies:{'test-view':'1.0.0'}};
  await assert.rejects(mountCustomView(element,definition,runtime),/Unavailable view dependency/);
  const record = {updates:[],disposals:0};
  const mounted = await mountCustomView(element,definition,runtime,{modules:{'test-view':{version:'1.0.0',load:async()=>({record})}}});
  assert.equal(record.api.value('/ui/space/pitch'),220);
  await record.api.set('/ui/space/pitch',330);
  assert.equal(record.api.value('/ui/space/pitch'),330);
  assert.deepEqual(record.updates,[0,1]);
  mounted.dispose();mounted.dispose();
  await runtime.request({operation:'parameter.set',path:'/ui/space/pitch',value:440});
  assert.deepEqual(record.updates,[0,1]);
  assert.equal(record.disposals,1);
  assert.deepEqual(calls,['clear']);
});

test('arranged instrument presentation survives undo and cold recall with sound targets intact', async () => {
  const { replacePresentationLayout, validateWebView } = await import('@manifold/author/web-view');
  const runtime = new LiveProjectRuntime(null,getProgram('ui-orbit').source);
  await runtime.request({operation:'parameter.set',path:'/ui/space/cutoff',value:2345});
  const before = runtime.snapshot().webView;
  assert.equal(before.role,'instrument');
  const layout = before.layout.map(item => item.path === '/ui/space/pitch' ? {...item,x:29,y:20} : item);
  await runtime.request({operation:'source.apply',source:replacePresentationLayout(runtime.source,layout)});
  const saved = runtime.save();
  const restored = new LiveProjectRuntime(null,saved.source,saved);
  assert.deepEqual(restored.snapshot().webView.layout,layout);
  assert.equal(restored.presentation().parameters.find(p=>p.path==='/ui/space/cutoff').value,2345);
  await runtime.request({operation:'project.undo'});
  assert.deepEqual(runtime.snapshot().webView,before);
  assert.throws(()=>validateWebView({...before,layout:[{...layout[0],x:99}]}),/outside/);
  assert.throws(()=>validateWebView({...before,layout:[layout[0],layout[0]]}),/unique/);
});

test('opted-in layout edits keep the mounted scene and update the public layout without extra subscriptions', async () => {
  const runtime=new LiveProjectRuntime(null,getProgram('ui-orbit').source),record={mounts:0,disposals:0,layouts:[]};
  const element={style:{},replaceChildren(){}};
  const source=`import {record} from 'test-view';export default function(){return {mount(element,api){record.mounts++;return {updateLayout(){record.layouts.push(api.layout);},dispose(){record.disposals++;}};}};}`;
  const definition={version:1,source,dependencies:{'test-view':'1.0.0'},layout:[{path:'/ui/space/pitch',x:3,y:4,width:30}]};
  const mounted=await mountCustomView(element,definition,runtime,{modules:{'test-view':{version:'1.0.0',load:async()=>({record})}}});
  const layout=[{...definition.layout[0],compact:{x:2,y:8,width:46}}];
  assert.equal(mounted.updateDefinition({...definition,layout}),true);assert.deepEqual(record.layouts,[layout]);
  assert.equal(record.mounts,1);assert.equal(record.disposals,0);
  assert.equal(mounted.updateDefinition({...definition,source:source+'// changed'}),false);
  mounted.dispose();assert.equal(record.disposals,1);
});
