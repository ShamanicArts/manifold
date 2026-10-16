import test from 'node:test';
import assert from 'node:assert/strict';
import {GraphWorkspace,createGraphWorkspace} from '../../packages/manifold-author/index.js';
import {createArbitraryIoGraph} from '../../packages/manifold-author/examples/arbitrary-io.mjs';

test('explicit asymmetric buses round-trip, fork and retain declared channel identities',()=>{
  const graph=createArbitraryIoGraph(),project=graph.toProject();
  assert.equal(project.signal.inputs,4);assert.equal(project.signal.outputs,5);
  assert.equal(project.signal.inputSource,undefined);
  assert.throws(()=>graph.setInputSource('external'),{code:'declared-io'});
  assert.deepEqual(GraphWorkspace.fromProject(project).toProject(),project);
  assert.deepEqual(graph.fork().ioLayout,graph.ioLayout);
  const changed=structuredClone(graph.ioLayout);
  [changed.outputBindings[0],changed.outputBindings[1]]=[changed.outputBindings[1],changed.outputBindings[0]];
  const fork=graph.fork();fork.setIoLayout(changed);
  assert.deepEqual(fork.toProject().signal.io,changed);assert.deepEqual(graph.toProject(),project);
});
test('invalid routes and removal of bound nodes reject before mutating accepted graph',()=>{
  const graph=createArbitraryIoGraph(),before=graph.toProject(),revision=graph.revision;
  for(const mutate of [io=>io.inputBindings[0].channels[0].channel=3,
    io=>io.outputBindings[0].channel=2,io=>io.inputs[1].id='main',
    io=>io.inputBindings.pop(),io=>io.outputs[0].optional=true,
    io=>io.outputs[0].channels=3,io=>io.inputBindings[0].extra=true]){
    const io=structuredClone(graph.ioLayout);mutate(io);assert.throws(()=>graph.setIoLayout(io),{code:'invalid-io'});
    assert.deepEqual(graph.toProject(),before);assert.equal(graph.revision,revision);
  }
  assert.throws(()=>graph.remove(graph.find(10)),{code:'io-in-use'});assert.deepEqual(graph.toProject(),before);
  const malformed=structuredClone(before);malformed.signal.outputs=2;
  assert.throws(()=>GraphWorkspace.fromProject(malformed),{code:'invalid-io'});
});
test('generator mono and no-output documents use explicit routes and silence',()=>{
  const graph=createGraphWorkspace(),tone=graph.add('oscillator',{id:10});
  const io={version:1,inputs:[],outputs:[{id:'mono',name:'Mono',channels:1,optional:false}],
    inputBindings:[{nodeId:1,channels:[null,null]}],outputBindings:[{nodeId:tone.id,outputPort:0,channel:0}]};
  graph.setIoLayout(io);assert.equal(graph.toProject().signal.inputs,0);
  assert.deepEqual(GraphWorkspace.fromProject(graph.toProject()).ioLayout,io);
  graph.setIoLayout({...io,outputs:[],outputBindings:[]});assert.equal(graph.toProject().signal.outputs,0);
});

test('authored bus and channel counts are not project quotas', () => {
  const graph = createGraphWorkspace();
  const buses = Array.from({length: 41}, (_, i) => ({
    id: `bus-${i}-${'wide'.repeat(20)}`,
    name: `Audio bus ${i} ${'named channel group '.repeat(10).trim()}`,
    channels: i === 0 ? 300 : 9, optional: false,
  }));
  const layout = {
    version: 1, inputs: buses, outputs: buses,
    inputBindings: [{nodeId: 1, channels: [{bus: 40, channel: 8}, {bus: 0, channel: 299}]}],
    outputBindings: Array.from({length: 660}, (_, i) => ({nodeId: 1, outputPort: 0, channel: i % 2})),
  };
  graph.setIoLayout(layout);
  assert.equal(graph.toProject().signal.inputs, 660);
  assert.equal(graph.toProject().signal.outputs, 660);
  assert.deepEqual(GraphWorkspace.fromProject(graph.toProject()).ioLayout, layout);
  const invalid = structuredClone(layout);
  invalid.inputs[40].channels = Number.MAX_SAFE_INTEGER;
  assert.throws(() => graph.setIoLayout(invalid), {code: 'invalid-io'});
  assert.deepEqual(graph.ioLayout, layout);
});
