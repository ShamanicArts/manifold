import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GraphWorkspace } from '@manifold/author';

const multisource = JSON.parse(readFileSync(new URL(
  '../../projects/graph-workspace/retrospective-multisource.json', import.meta.url)));

test('JS authoring reopens and edits the existing two-source retrospective project', () => {
  const graph = GraphWorkspace.fromProject(multisource);
  assert.deepEqual(graph.listCaptureSources(), multisource.signal.captureSources);
  const first = graph.toProject();
  assert.equal(first.signal.sidechainSource, 'oscillator');
  assert.equal(first.signal.captureWindowMode, 'bars');
  assert.equal(first.signal.captureWindowBars, 1);
  assert.equal(first.signal.selectedCaptureNodeId, 6);
  assert.deepEqual(GraphWorkspace.fromProject(first).toProject(), first);

  const edited = graph.fork();
  edited.selectCaptureSource(1);
  edited.configureCaptureWindow({ captureWindowMode: 'seconds', captureWindowSeconds: 0.5 });
  edited.setSidechainSource('none');
  const saved = edited.toProject();
  assert.equal(saved.signal.selectedCaptureSourceId, 1);
  assert.equal(saved.signal.selectedCaptureNodeId, 10);
  assert.equal(saved.signal.captureWindowSeconds, 0.5);
  assert.equal(saved.signal.captureWindowBars, undefined);
  assert.equal(saved.signal.sidechainSource, 'none');
  assert.deepEqual(GraphWorkspace.fromProject(saved).toProject(), saved);
  assert.equal(graph.toProject().signal.selectedCaptureSourceId, 0);
});

test('capture registry rejects mismatched selection and invalid source metadata', () => {
  for (const signal of [
    { ...multisource.signal, selectedCaptureSourceId: 0, selectedCaptureNodeId: 10 },
    { ...multisource.signal, captureSources: [
      multisource.signal.captureSources[0], { ...multisource.signal.captureSources[1], id: 0 },
    ] },
    { ...multisource.signal, captureWindowMode: 'bars', captureWindowBars: 0 },
  ]) {
    assert.throws(() => GraphWorkspace.fromProject({ ...multisource, signal }));
  }
});
