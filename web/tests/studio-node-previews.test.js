import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresentationGraph } from '../../packages/manifold-ui-web/composition-runtime.js';
import { previewBudget } from '../../packages/manifold-ui-web/node-previews.js';
import { createPresentationClock } from '../../packages/manifold-ui-web/presentation-clock.js';

test('an unopened Presenter uses one bounded clock for requested graph observations and stops when hidden', () => {
  const animations = new Map(),
    timers = new Map(),
    frames = [];
  let sequence = 0;
  const clock = createPresentationClock((now) => frames.push(now), {
    animation: (callback) => {
      animations.set(++sequence, callback);
      return sequence;
    },
    cancelAnimation: (handle) => animations.delete(handle),
    timer: (callback) => {
      timers.set(++sequence, callback);
      return sequence;
    },
    cancelTimer: (handle) => timers.delete(handle),
  });
  clock.setVisible(false);
  assert.equal(animations.size + timers.size, 0);
  clock.setObserved(true);
  assert.equal(timers.size, 1);
  const [id, frame] = timers.entries().next().value;
  timers.delete(id);
  frame(100);
  assert.deepEqual(frames, [100]);
  assert.equal(timers.size, 1);
  clock.setVisible(true);
  assert.equal(timers.size, 0);
  assert.equal(
    animations.size,
    1,
    'Showing the Presenter replaces the timer, never adds a second clock',
  );
  clock.setObserved(false);
  assert.equal(animations.size, 1);
  clock.setVisible(false);
  assert.equal(animations.size + timers.size, 0);
  clock.setObserved(true);
  clock.dispose();
  assert.equal(animations.size + timers.size, 0);
});

test('a native host can advance unopened WebKit without its throttled timers', () => {
  const frames = [],
    scheduled = new Map();
  let id = 0;
  const clock = createPresentationClock((now) => frames.push(now), {
    animation: (callback) => {
      scheduled.set(++id, callback);
      return id;
    },
    cancelAnimation: (id) => scheduled.delete(id),
    timer: () => {
      throw Error('Native hidden frames must use the host clock');
    },
    hostDrivenHidden: true,
  });
  clock.setVisible(false);
  clock.setObserved(true);
  clock.advanceHidden(0);
  clock.advanceHidden(20);
  clock.advanceHidden(100);
  assert.deepEqual(frames, [0, 100]);
  assert.equal(scheduled.size, 0);
  clock.setVisible(true);
  clock.advanceHidden(200);
  assert.deepEqual(frames, [0, 100]);
  assert.equal(scheduled.size, 1);
  clock.dispose();
});

function fixture() {
  const state = {
    revision: 1,
    observationRevision: 1,
    composition: {
      nodes: [
        { id: 100, definition: 'field' },
        { id: 101, definition: 'level' },
      ],
      connections: [],
    },
    visualDefinitions: [
      {
        id: 'field',
        implementation: { kind: 'presentation-script' },
        outputs: [{ name: 'field', type: 'field2d' }],
      },
      {
        id: 'level',
        implementation: { kind: 'presentation-script' },
        outputs: [{ name: 'level', type: 'scalar', unit: 'dB' }],
      },
    ],
  };
  const graph = createPresentationGraph();
  graph.configure(state);
  let executions = 0;
  graph.attach(100, {
    evaluate: () => {
      executions++;
      return {
        field: {
          width: 128,
          height: 128,
          values: Array.from({ length: 128 * 128 }, (_, i) => i % 128),
        },
      };
    },
  });
  graph.attach(101, { evaluate: (frame) => ({ level: frame.time }) });
  return { graph, state, executions: () => executions };
}

test('node thumbnails consume the accepted field, are bounded, and never execute it again', () => {
  const { graph, executions } = fixture();
  graph.step(0);
  assert.equal(graph.inspect()[100].preview, undefined, 'No demand means no preview work');
  graph.setPreviewNodes([100, 101]);
  graph.step(100);
  const preview = graph.inspect()[100].preview;
  assert.deepEqual(preview.resolution, [128, 128]);
  assert.equal(preview.pixels.length, previewBudget.fieldSize ** 2);
  assert.equal(preview.pixels[0], 0);
  assert.equal(preview.pixels[31], 255);
  assert.equal(preview.min, 1.5, 'Area averages the original samples');
  assert.equal(graph.inspect()[101].preview.unit, 'dB');
  for (let i = 0; i < 100; i++) graph.inspect();
  assert.equal(executions(), 2, 'Inspector reads do not call evaluate');
  graph.step(110);
  assert.strictEqual(
    graph.inspect()[100].preview,
    preview,
    'Transport sampling is capped at ten Hz',
  );
  graph.setPreviewNodes([]);
  graph.step(200);
  assert.equal(graph.inspect()[100].preview, undefined, 'Hidden previews release their samples');
  assert.equal(executions(), 4, 'The actual presentation still advances');
});

test('history stays bounded and continuous through parameter revisions; structural changes invalidate it', () => {
  const { graph, state } = fixture();
  graph.setPreviewNodes([101]);
  for (let i = 0; i < 80; i++) graph.step(i * 100);
  const history = graph.inspect()[101].preview.history;
  assert.equal(history.length, previewBudget.history);
  assert.deepEqual(history.at(-1), [7.9]);
  graph.configure({ ...state, revision: 2 });
  assert.deepEqual(graph.inspect()[101].preview.history, history);
  graph.configure({ ...state, revision: 3, observationRevision: 3 });
  assert.equal(graph.inspect()[101].preview, undefined);
  graph.step(8100);
  assert.equal(graph.inspect()[101].preview.history.length, 1);
  graph.detach(101);
  assert.equal(
    graph.inspect()[101].preview,
    undefined,
    'Disposed implementations leave no stale thumbnail',
  );
});

test('a failed output removes its prior live preview', () => {
  const { graph } = fixture();
  graph.setPreviewNodes([101]);
  graph.step(0);
  graph.attach(101, { evaluate: () => ({ level: NaN }) });
  graph.step(100);
  assert.match(graph.inspect()[101].status, /Invalid scalar/);
  assert.equal(graph.inspect()[101].preview, undefined);
});

test('a wrapped graph previews its exposed child output without another evaluator', () => {
  const { graph, state, executions } = fixture();
  const nested = {
    ...state,
    componentNodes: [{ id: 102, type: 'wrapped-field' }],
    visualDefinitions: [
      ...state.visualDefinitions,
      {
        id: 'wrapped-field',
        implementation: { kind: 'composition' },
        outputs: [{ name: 'pattern', type: 'field2d' }],
      },
    ],
    composition: {
      ...state.composition,
      compositeOutputs: { 102: { pattern: { from: 100, output: 'field' } } },
      compositeMembers: { 102: [100] },
    },
  };
  graph.configure(nested);
  graph.setPreviewNodes([102]);
  graph.step(0);
  assert.equal(graph.inspect()[102].preview.output, 'pattern');
  assert.equal(graph.inspect()[102].preview.kind, 'field');
  assert.equal(graph.inspect()[100].preview, undefined);
  assert.equal(executions(), 1);
});

test('large finite field values remain a valid bounded observation', () => {
  const { graph } = fixture();
  graph.attach(100, {
    evaluate: () => ({
      field: {
        width: 128,
        height: 128,
        values: Array.from({ length: 128 * 128 }, (_, i) => (i % 128 < 64 ? -1e308 : 1e308)),
      },
    }),
  });
  graph.setPreviewNodes([100]);
  graph.step(0);
  const preview = graph.inspect()[100].preview;
  assert.ok(Number.isFinite(preview.min) && Number.isFinite(preview.max));
  assert.deepEqual([...new Set(preview.pixels)], [0, 255]);
});
