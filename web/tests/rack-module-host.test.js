import test from 'node:test';
import assert from 'node:assert/strict';
import { GraphWorkspace } from '../../packages/manifold-author/index.js';
import { buildRackModuleHostGraph, createProject } from '../../packages/manifold-author/examples/rack-module-host.mjs';

const SELECT = '/rack_host/module/index';
const MANUAL = '/midi/synth/rack/osc/1/manualLevel';

test('historical oscillator selection survives acknowledged rack switches and save/reopen', async () => {
  const graph = buildRackModuleHostGraph({ selection: 1 });
  const initial = graph.toProject();
  assert.equal(initial.controls.find(control => control.path === SELECT).value, 1);
  assert.equal(initial.signal.nodes.filter(node => node.type === 'extended-oscillator').length, 9);
  assert.equal(initial.signal.connections.find(edge => edge.to === 3).from, 38);
  let acceptRoute = true;
  const routed = [];
  const project = createProject({
    setRoute: route => { routed.push(route); return acceptRoute; },
    setParameter: () => true,
    setParameterBatch: () => true,
  }, graph);
  await project.set(MANUAL, 0.5);
  await project.set('/midi/synth/rack/osc/1/voice/1/vOct', 69);
  await project.set('/midi/synth/rack/osc/1/voice/1/gate', 0.4);
  assert.equal(project.toProject().signal.initialParameters.find(entry => entry.nodeId === 36 && entry.id === 2).value, 0.2);
  await project.set(SELECT, 4);
  assert.equal(project.toProject().signal.connections.find(edge => edge.to === 3).from, 5);
  acceptRoute = false;
  await assert.rejects(project.set(SELECT, 1));
  assert.equal(project.toProject().controls.find(control => control.path === SELECT).value, 4);
  assert.equal(project.toProject().signal.connections.find(edge => edge.to === 3).from, 5);
  acceptRoute = true;
  const reopened = createProject({ setRoute: route => { routed.push(route); return true; },
    setParameter: () => true, setParameterBatch: () => true },
  GraphWorkspace.fromProject(project.toProject()));
  await reopened.set(SELECT, 1);
  assert.equal(reopened.toProject().signal.connections.find(edge => edge.to === 3).from, 38);
  assert.equal(reopened.toProject().controls.find(control => control.path === MANUAL).value, 0.5);
  assert.equal(reopened.toProject().controls.find(control =>
    control.path === '/midi/synth/rack/osc/1/voice/1/gate').value, 0.4);
  assert.equal(reopened.toProject().signal.initialParameters.find(entry =>
    entry.nodeId === 28 && entry.id === 1).value, 440);
  assert.equal(routed.at(-1).from, 38);
});
