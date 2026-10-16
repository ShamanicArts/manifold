import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GraphWorkspace,createLiveGraphSession} from '@manifold/author';
import {createProject} from '@manifold/author/examples/rack-sample-eight-voice';
import {resourceTransfers} from '../../packages/manifold-author/resource-history.js';
const fixture=JSON.parse(readFileSync(new URL('../../projects/graph-workspace/authored-rack-sample-eight-voice.json',import.meta.url)));
const base='/midi/synth/rack/sample/1';
test('actual Rack controller resolves accepted instance edits, including noncontiguous voices',async()=>{
  const graph=GraphWorkspace.fromProject(fixture),batches=[],events=[];
  const host={setRoute:()=>true,setParameter:()=>true,setParameterBatch:edits=>{batches.push(edits);return true;},sendEvent:event=>events.push(event)};
  const session=createLiveGraphSession(graph,host.setRoute,host.setParameter,()=>true,host.setParameterBatch);
  const project=createProject(host,graph,session);
  await session.transaction(next=>{
    next.remove(next.find(6));const gain=next.add('gain',{id:1900});next.setParameter(gain,0,0);
    next.registerInstance(`${base}/nodes/voice_1/gain`,gain);next.connect(next.find(5).output('out'),gain.input('audio'));next.connect(gain.output('out'),next.find(28).input('in-1'));
    next.remove(next.find(7));const sample=next.add('sample-region',{id:7000});next.registerInstance(`${base}/nodes/voice_2/playback`,sample);
    next.bindSampleAsset(next.find(4),sample);next.connect(sample.output('out'),next.find(8).input('audio'));
  });
  await project.set(`${base}/voice/1/gate`,.4);
  assert.equal(project.toProject().signal.initialParameters.find(p=>p.nodeId===1900&&p.id===0).value,.4);
  await project.set(`${base}/unison`,3);assert.ok(batches.at(-1).some(p=>p.nodeId===7000&&p.id===9));assert.equal(batches.at(-1).length,8);
  await project.set(`${base}/voice/2/gate`,.4);assert.equal(events.at(-1).nodeId,7000);
  await project.set(`${base}/voice/2/vOct`,67);assert.equal(project.toProject().signal.initialParameters.find(p=>p.nodeId===7000&&p.id===0).value,2**(7/12));
});
test('shared regions compare effective PCM, while labels and binding IDs are not audio',()=>{
  const same=structuredClone(fixture),identity=fixture.signal.nodes.map(node=>({nextId:node.id,previousId:node.id}));
  same.assets[0].label='Presentation only';assert.equal(resourceTransfers(fixture,same,identity).length,16);
  const replacement=GraphWorkspace.fromProject(same);replacement.setSampleAsset(replacement.find(4),new Float32Array(256).fill(.3),48000,'New source');
  const changed=resourceTransfers(fixture,replacement.toProject(),identity);assert.equal(changed.length,8);assert.ok(changed.every(pair=>same.signal.nodes.find(n=>n.id===pair.nextId).type==='phase-vocoder'));
});
