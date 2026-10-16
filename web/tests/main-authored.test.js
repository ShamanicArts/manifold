import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createGraphWorkspace, GraphWorkspace, createLiveGraphSession } from '../../packages/manifold-author/index.js';
import { parseGraphBundle } from '../src/graph/topology.js';
import { createMainVoiceControl } from '../../packages/manifold-author/examples/main-voice-control.mjs';
import { buildGraph, createProject } from '../../packages/manifold-author/examples/main-wave-graph.mjs';

test('configured mixer ports/parameters grow, round-trip and reject removal of used I/O', () => {
  for (const inputs of [1, 2, 3, 4, 7, 8, 9, 13, 32, 33, 128, 257, 513]) {
    const graph = createGraphWorkspace(), mixer = graph.add('mixer', { id: 4, config: { inputs } });
    assert.equal(graph.describeNode(mixer).inputs.length, inputs);
    assert.equal(graph.describeNode(mixer).parameters.length, 1 + inputs * 2);
    graph.connect(graph.input.output('out'), mixer.input(`in-${inputs}`));
    graph.connect(mixer.output('out'), graph.output.input('in'));
    mixer.parameter(`input${inputs}Gain`).set(0.5);
    mixer.parameter(`input${inputs}Pan`).set(-0.5);
    const saved = graph.toProject();
    assert.deepEqual(GraphWorkspace.fromProject(saved).toProject(), saved);
    assert.deepEqual(parseGraphBundle(saved).signal.nodes, saved.signal.nodes);
    assert.throws(() => mixer.input(`in-${inputs + 1}`));
    if (inputs < 32) assert.throws(() => graph.setParameter(mixer, inputs + 1, 0.5));
    if (inputs > 1) {
      assert.throws(() => graph.configure(mixer, { inputs: inputs - 1 }));
      assert.deepEqual(graph.toProject(), saved);
      const removed = mixer.input(`in-${inputs}`);
      graph.disconnect(removed); graph.configure(mixer, { inputs: inputs - 1 });
      assert.throws(() => graph.connect(graph.input.output('out'), removed));
      graph.configure(mixer, { inputs });
      assert.equal(graph.describeNode(mixer).parameters.length, 1 + inputs * 2);
    }
  }
  assert.throws(() => createGraphWorkspace().add('mixer', { id: 4, config: { inputs: 3.5 } }));
});

test('direct batch saves only acknowledged targets and needs no synthetic project control', async () => {
  const graph = buildGraph(), before = graph.toProject();
  const session = createLiveGraphSession(graph, () => true, () => true, null, () => false);
  await assert.rejects(session.parameters([{ nodeId: 10, id: 2, value: 0.4 }]));
  assert.deepEqual(session.toProject(), before);
  const accepted = createLiveGraphSession(graph, () => true, () => true, null, () => true);
  const saved = await accepted.parameters([{ nodeId: 10, id: 2, value: 0.4 }]);
  assert.equal(saved.signal.initialParameters.find(p => p.nodeId === 10 && p.id === 2).value, 0.4);
  assert.deepEqual(saved.controls, before.controls);
});

test('authored Main voice allocation, ADSR and emitted targets match actual old Lua', async () => {
  const actions = [['on',60,127], ['on',60,83], ['tick',0,1]];
  for (let tick=1; tick<=30; tick++) actions.push(['tick',1/60,1+tick/60]);
  for (const note of [62,64,65,67,69,71,72]) actions.push(['on',note,100]);
  actions.push(['off',60,0], ['tick',1/60,2], ['tick',0.15,2.15], ['on',74,95],
    ['off',74,0], ['tick',0.02,2.2], ['tick',0.6,2.8], ['tick',0.02,2.82], ['on',40,64], ['panic',0,0]);
  const temp=mkdtempSync(join(tmpdir(),'manifold-main-voice-'));
  try {
    const path=join(temp,'actions.csv');writeFileSync(path,actions.map(a=>a.join(',')).join('\n')+'\n');
    const old=execFileSync('lua',[new URL('../../tools/legacy-main-voice-control-trace.lua',import.meta.url).pathname,
      '/home/shamanic/dev/my-plugin/UserScripts/projects/Main',path],{encoding:'utf8'}).trim().split(/action\|[^\n]+\n/).filter(Boolean);
    let pushes=[];
    const project=createProject({ setRoute:()=>true,setParameter:()=>true,replaceGraph:()=>true,
      setParameterBatch:edits=>{pushes.push(...edits.map(edit=>{
        const index=(edit.nodeId-10)/6+1;
        return [`/midi/synth/voice/${index}/${edit.id===1?'freq':'amp'}`,edit.value];
      }));return true;} });
    const voices=createMainVoiceControl(project);
    for (const [index,[action,a,b]] of actions.entries()) {
      pushes=[];
      if(action==='on')await voices.on(a,b);else if(action==='off')await voices.off(a);
      else if(action==='tick')await voices.advance(a,b);else await voices.panic();
      const lines=old[index].trim().split('\n'), oldPushes=lines.filter(l=>l.startsWith('push|')).map(l=>l.split('|').slice(1));
      // Legacy panic also sends Wave-independent sample gates; compare the
      // actual amplitude/frequency targets exercised by this Wave-only slice.
      const expected=oldPushes.filter(([path])=>!path.endsWith('/gate'));
      assert.equal(pushes.length,expected.length,`action ${index} ${action}`);
      expected.forEach(([path,value],i)=>{assert.equal(pushes[i][0],path);assert.ok(Math.abs(pushes[i][1]-Number(value))<1e-12);});
      const snapshots=voices.snapshot();
      lines.filter(l=>l.startsWith('voice|')).forEach(line=>{
        const [,i,active,note,gate,target,stage,level,current]=line.split('|'), v=snapshots[Number(i)-1];
        assert.equal(v.active,active==='true');assert.equal(v.note??-1,Number(note));assert.equal(v.gate,Number(gate));
        assert.equal(v.envelopeStage,stage);for(const [got,want] of [[v.targetAmp,target],[v.envelopeLevel,level],[v.currentAmp,current]])
          assert.ok(Math.abs(got-Number(want))<1e-12,`action ${index} voice ${i}`);
      });
    }
  } finally {rmSync(temp,{recursive:true,force:true});}
});
