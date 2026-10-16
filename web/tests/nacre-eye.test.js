import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { imagePixelRect } from '../../packages/manifold-ui-web/diegetic.js';
import eyeMotion from '../../projects/nacre/eye-motion.mjs';
import { evaluateProjectModules } from '../../packages/manifold-author/project-modules.js';
import { LiveProjectRuntime } from '../../packages/manifold-author/live-project.js';
import {
  createPresentationGraph,
  presentationResource,
} from '../../packages/manifold-ui-web/composition-runtime.js';

const saved = JSON.parse(
  readFileSync(
    new URL('../public/nacre/2026-10-10-graph/nacre-prism-bend.manifold.json', import.meta.url),
  ),
);

test('eye follows pointer, blinks with motion, closes for Hold and releases without audio', () => {
  const motion = eyeMotion();
  const values = { energy: 0, upper: 0, phase: 0, displacement: 0, hold: 0, pointer: [0.1, 0, 0] };
  const api = { input: (name) => values[name] };
  let time = 0;
  const step = (count = 1) => {
    let result;
    while (count--) result = motion.evaluate(api, { time: (time += 1 / 60), delta: 1 / 60 });
    return result;
  };
  assert.equal(step().left, 0);
  values.pointer = [0.1, 1, 0];
  assert.ok(step(60).left > 0.59);
  values.pointer = [0.9, 1, 0];
  assert.ok(step(60).right > 0.59, 'Rightward pointer changes the actual faded layer');
  values.hold = 1;
  assert.equal(step(15).closed, 1);
  values.hold = 0;
  assert.equal(step(15).closed, 0);
  values.phase = Math.PI / 2 / 1.83;
  const blinking = step();
  values.pointer[2] = 1;
  const reduced = step();
  assert.ok(reduced.left + reduced.right > 10 * (blinking.left + blinking.right));
  values.pointer = [0.5, 0, 1];
  values.energy = 0.2;
  assert.ok(step(90).right > 0.6, 'Sound still opens the eye with reduced motion');
  values.energy = 0;
  assert.ok(
    step(180).left + step().right < 0.001,
    'Eye settles closed after silence and pointer expiry',
  );
});

test('saved eye graph drives three real image fades and keeps private controls editable', async () => {
  const runtime = new LiveProjectRuntime(null, saved.source, saved);
  const audio = runtime.project.signal;
  const state = runtime.snapshot();
  const execution = createPresentationGraph();
  execution.configure(state);
  const node = (type) => state.presentationExecution.nodes.find((item) => item.definition === type);
  for (const item of state.presentationExecution.nodes) {
    const definition = state.visualDefinitions.find((d) => d.id === item.definition);
    if (definition.implementation.kind !== 'presentation-script') continue;
    const script = evaluateProjectModules(
      definition.implementation.entry,
      definition.sources,
    ).default();
    execution.attach(item.id, {
      evaluate: (frame) =>
        script.evaluate(
          {
            input: (name) => execution.input(item.id, name),
            parameter: (name) => execution.parameter(item.id, name),
          },
          frame,
        ),
    });
  }
  execution.attach(node('nacre-scene').id, {
    outputs: () => ({
      scene: presentationResource('resource:nacre.scene', {}),
      contact: [0, 0, 0],
      phase: 0,
      eyePointer: [0.1, 1, 0],
      handTouch: [0, 0, 0],
      handGesture: [0, 0, 0],
      haloTouch: [0, 0, 0],
      haloGesture: [0, 0, 0],
      creatureTouch: [0, 0, 0],
      creatureGesture: [0, 0, 0],
    }),
  });
  for (let time = 0; time <= 1000; time += 20) execution.step(time);
  const artwork = node('eye-artwork');
  assert.match(execution.input(artwork.id, 'left').asset, /open-left/);
  assert.ok(execution.input(artwork.id, 'left').opacity > 0.59);
  assert.equal(execution.input(artwork.id, 'closed').opacity, 0);
  await runtime.request({ operation: 'parameter.set', path: '/hold', value: 1 });
  execution.configure(runtime.snapshot());
  for (let time = 1020; time <= 1300; time += 20) execution.step(time);
  assert.equal(execution.input(artwork.id, 'closed').opacity, 1);
  assert.match(execution.input(artwork.id, 'closed').asset, /eye-closed/);
  const definition = runtime.save().composition.definitions.find((d) => d.id === 'relic-eye');
  assert.deepEqual(
    definition.parameters,
    [],
    'Image placement stays inside, not 21 controls on the outer node',
  );
  const fade = definition.implementation.graph.nodes.find((n) => n.label === 'Fade left gaze');
  await runtime.request({
    operation: 'component.update',
    scope: 'relic-eye',
    id: fade.id,
    changes: { parameters: { x: 0.25 } },
  });
  execution.configure(runtime.snapshot());
  execution.step(1320);
  assert.equal(execution.input(artwork.id, 'left').transform[4], 0.25);
  await runtime.request({ operation: 'parameter.set', path: '/hold', value: 0 });
  assert.deepEqual(runtime.project.signal, audio);
  const recall = new LiveProjectRuntime(null, runtime.source, runtime.save());
  assert.deepEqual(
    recall.snapshot().presentationExecution,
    runtime.snapshot().presentationExecution,
  );
});

test('eye layers preserve alignment, accept image edits, retain complete images and release late loads', async () => {
  const source = readFileSync(new URL('../../projects/nacre/eye.mjs', import.meta.url), 'utf8');
  const factory = evaluateProjectModules(
    '/eye.mjs',
    { '/eye.mjs': source },
    { three: THREE, '@manifold/ui-web/diegetic': { imagePixelRect } },
  ).default();
  const pending = [],
    textures = [];
  const original = THREE.TextureLoader.prototype.load;
  THREE.TextureLoader.prototype.load = function (url, loaded, _progress, failed) {
    const texture = new THREE.Texture();
    texture.released = false;
    texture.addEventListener('dispose', () => {
      texture.released = true;
    });
    textures.push(texture);
    pending.push({ url, loaded: () => loaded(texture), failed });
    return texture;
  };
  let target;
  const scene = {
    device: new THREE.Group(),
    face: { dataset: {} },
    registerControlTarget(_name, object, ready) {
      const entry = { object, ready };
      target = entry;
      return () => {
        if (target === entry) target = null;
      };
    },
  };
  const relic = {
    layout: { width: 1.19, height: (1.19 * 479) / 330 },
    surface: new THREE.Group(),
    applyRelief() {},
  };
  relic.surface.position.set(-2, -1, 0.28);
  scene.device.add(relic.surface);
  const image = (asset, opacity) => ({ asset, opacity, transform: [1, 0, 0, 1, 0, 0] });
  const values = {
    left: image('/left.webp', 0.4),
    right: image('/right.webp', 0.2),
    closed: image('/closed.webp', 0),
    light: [0.2, 0.6],
  };
  const api = {
    resource: (name) => (name === 'relic' ? relic : scene),
    input: (name) => values[name],
    assetUrl: async (path) => path,
  };
  let first, second;
  try {
    first = factory.create(api);
    first.update();
    await Promise.resolve();
    pending.splice(0).forEach((entry) => entry.loaded());
    first.update();
    assert.equal(relic.surface.children.length, 1);
    assert.deepEqual(first.outputs().layers, [0.4, 0.2, 0]);
    const rig = relic.surface.children[0],
      left = rig.children[0].children[0];
    scene.device.updateMatrixWorld(true);
    assert.equal(rig.children[0].getWorldPosition(new THREE.Vector3()).x, -2);
    assert.equal(left.material.onBeforeCompile, relic.applyRelief);
    assert.equal(left.matrix.elements[0], 1.19);
    relic.layout = { width: 0.85, height: (0.85 * 479) / 330 };
    relic.surface.position.set(-1, 1, 0.28);
    first.update();
    assert.equal(left.matrix.elements[0], 0.85);
    scene.device.updateMatrixWorld(true);
    assert.equal(rig.children[0].getWorldPosition(new THREE.Vector3()).x, -1);
    const previous = left.material.map;
    values.left = image('/new.webp', 0.7);
    first.update();
    await Promise.resolve();
    assert.equal(left.material.map, previous);
    assert.equal(left.material.opacity, 0.7, 'Gestures continue while replacement loads');
    pending.splice(0).forEach((entry) => entry.failed());
    assert.throws(() => first.update(), /last complete image/);
    assert.equal(scene.face.dataset.gazeFrames, 'unavailable');
    assert.equal(scene.face.dataset.eyeSprite, 'ready');
    assert.equal(left.material.map, previous);
    values.left = image('/left.webp', 0.4);
    first.update();
    values.right = image('/pending.webp', 0.2);
    first.update();
    await Promise.resolve();
    second = factory.create(api);
    const newTarget = target;
    first.dispose();
    first = null;
    assert.equal(target, newTarget, 'Retiring instance does not unregister its replacement');
    pending.splice(0).forEach((entry) => entry.loaded());
    assert.ok(
      textures.every((texture) => texture.released),
      'Even a late texture completion remains released',
    );
    assert.equal(relic.surface.children.length, 1);
    second.dispose();
    second = null;
    assert.equal(target, null);
    assert.equal(relic.surface.children.length, 0);
  } finally {
    first?.dispose();
    second?.dispose();
    THREE.TextureLoader.prototype.load = original;
  }
});
