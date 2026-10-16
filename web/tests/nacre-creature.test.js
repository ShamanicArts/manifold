import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import creatureMotion from '../../projects/nacre/creature-motion.mjs';
import { evaluateProjectModules } from '../../packages/manifold-author/project-modules.js';
import { LiveProjectRuntime } from '../../packages/manifold-author/live-project.js';
import {
  createPresentationGraph,
  presentationResource,
} from '../../packages/manifold-ui-web/composition-runtime.js';

test('creature preserves pose timing, immediate gesture response and reduced motion', () => {
  const motion = creatureMotion();
  const values = { edge: 4800, heat: 8, energy: 0, touch: [0, 0, 0], gesture: [0, 0, 0] };
  const api = { input: (name) => values[name] };
  const frame = (time) => motion.evaluate(api, { time, delta: 1 / 60 });
  assert.equal(frame(0).frame, 0);
  values.touch = [1, 0, 0];
  assert.equal(frame(0.2).frame, 1, 'Hover selects the step pose');
  values.touch = [1, 1, 0];
  values.gesture = [9600, 32, 1];
  const dragging = frame(0.25);
  assert.equal(dragging.frame, 1, 'Pose changes retain the 180 ms minimum hold');
  assert.deepEqual(dragging.controls, [9600, 32], 'Gesture leads the unchanged host controls');
  assert.ok(dragging.rotation < 0, 'Positive scene tilt is clockwise-negative in image space');
  assert.equal(frame(0.4).frame, 2);
  values.touch = [0, 0, 1];
  values.gesture = [0, 0, 0];
  values.energy = 0.5;
  const reduced = frame(0.7);
  assert.equal(reduced.frame, 0, 'Reduced motion disables sound-driven pose cycling');
  assert.equal(Math.abs(reduced.rotation), 0);
  assert.deepEqual(reduced.controls, [4800, 8]);
  values.touch = [0, 0, 0];
  assert.equal(frame(1).frame, 2, 'Sound still animates when motion is enabled');
});

test('Nacre’s saved nested graph routes real Prism controls and scene gestures into the selected image', async () => {
  const saved = JSON.parse(
    readFileSync(
      new URL('../public/nacre/2026-10-10-graph/nacre-prism-bend.manifold.json', import.meta.url),
    ),
  );
  const runtime = new LiveProjectRuntime(null, saved.source, saved);
  assert.deepEqual(saved.composition.definitions.find((d) => d.id === 'oracle-creature').parameters.map((p) => p.name), ['x', 'y', 'scale', 'opacity']);
  const audio = runtime.project;
  const snapshot = runtime.snapshot();
  const execution = createPresentationGraph();
  execution.configure(snapshot);
  const nodes = snapshot.presentationExecution.nodes;
  const node = (definition) => nodes.find((item) => item.definition === definition);
  for (const item of nodes) {
    const definition = snapshot.visualDefinitions.find((d) => d.id === item.definition);
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
  let touch = [0, 0, 0],
    gesture = [0, 0, 0];
  execution.attach(node('nacre-scene').id, {
    outputs: () => ({
      scene: presentationResource('resource:nacre.scene', {}),
      contact: [0, 0, 0],
      phase: 0,
      eyePointer: [0.5, 0, 0],
      handTouch: [0, 0, 0],
      handGesture: [0, 0, 0],
      haloTouch: [0, 0, 0],
      haloGesture: [0, 0, 0],
      creatureTouch: touch,
      creatureGesture: gesture,
    }),
  });
  const image = () => execution.input(node('creature-artwork').id, 'image');
  execution.step(0);
  assert.match(image().asset, /rest.webp$/);
  await runtime.request({ operation: 'parameter.set', path: '/prism-bend/heat', value: 32 });
  execution.configure(runtime.snapshot());
  execution.step(250);
  assert.match(image().asset, /sing.webp$/);
  touch = [1, 1, 0];
  gesture = [9600, 30, 1];
  execution.step(300);
  assert.ok(image().transform[1] < 0);
  assert.deepEqual(execution.input(node('creature-artwork').id, 'controls'), [9600, 30]);
  await runtime.request({ operation: 'parameter.set', path: '/prism-bend/heat', value: 8 });
  assert.deepEqual(runtime.project.signal, audio.signal, 'Visual extraction does not change DSP');
  const recalled = new LiveProjectRuntime(null, runtime.source, runtime.save()).snapshot();
  assert.deepEqual(recalled.presentationExecution, runtime.snapshot().presentationExecution);
  assert.ok(
    snapshot.componentNodes.find((item) => item.type === 'creature-artwork').scope,
    'Artwork lives inside the creature graph',
  );
});

test('creature artwork preserves its position, transforms, hit target and texture ownership on resize and replacement', async () => {
  const source = readFileSync(
    new URL('../../projects/nacre/creature.mjs', import.meta.url),
    'utf8',
  );
  const factory = evaluateProjectModules(
    '/creature.mjs',
    { '/creature.mjs': source },
    { three: THREE },
  ).default();
  const pending = [],
    textures = [];
  const originalLoad = THREE.TextureLoader.prototype.load;
  THREE.TextureLoader.prototype.load = function (_url, loaded) {
    const texture = new THREE.Texture();
    texture.released = false;
    texture.addEventListener('dispose', () => {
      texture.released = true;
    });
    textures.push(texture);
    pending.push(() => loaded(texture));
    return texture;
  };
  let currentTarget;
  const scene = {
    device: new THREE.Group(),
    face: { dataset: {} },
    layout: { portrait: false, paneH: 4.7 },
    registerControlTarget(_name, object, ready) {
      const entry = { object, ready };
      currentTarget = entry;
      return () => {
        if (currentTarget === entry) currentTarget = null;
      };
    },
  };
  const values = {
    image: { asset: '/rest.webp', transform: [0, -1, 1, 0, 0, 0], opacity: 1 },
    frames: { frames: ['/rest.webp', '/sing.webp'] },
    glow: [0.5, 0.7, 1],
    controls: [6000, 12],
  };
  const api = {
    input: (name) => values[name],
    resource: () => scene,
    assetUrl: async (path) => path,
  };
  let first, second;
  try {
    first = factory.create(api);
    first.update();
    await Promise.resolve();
    pending.splice(0).forEach((complete) => complete());
    first.update();
    const rig = scene.device.children[0];
    assert.deepEqual(rig.position.toArray(), [-0.34, 1.16, 0.52]);
    assert.equal(currentTarget.ready(), true);
    assert.equal(rig.children[0].matrix.elements[1], 1, 'Converts image Y-down to scene Y-up');
    values.frames.frames.push(...Array.from({ length: 20 }, (_, index) => `/extra-${index}.webp`));
    values.image = { ...values.image, asset: '/extra-10.webp' };
    first.update();
    await Promise.resolve();
    assert.equal(
      first.outputs().image.asset,
      '/rest.webp',
      'Keep the complete pose while its replacement loads',
    );
    assert.equal(
      textures.filter((texture) => !texture.released).length,
      4,
      'Warm three poses and load only the selected additional frame',
    );
    pending.splice(0).forEach((complete) => complete());
    first.update();
    assert.equal(first.outputs().image.asset, '/extra-10.webp');
    scene.layout = { portrait: true, paneH: 7 };
    first.update();
    assert.deepEqual(rig.position.toArray(), [0.82, 2.16, 0.52]);
    assert.equal(scene.device.children.length, 1);
    second = factory.create(api);
    const replacementTarget = currentTarget;
    first.dispose();
    first = null;
    assert.equal(
      currentTarget,
      replacementTarget,
      'Retiring an old object keeps the new drag target',
    );
    assert.ok(textures.every((texture) => texture.released));
    second.update();
    await Promise.resolve();
    second.dispose();
    second = null;
    pending.splice(0).forEach((complete) => complete());
    assert.ok(
      textures.every((texture) => texture.released),
      'Late loads do not resurrect disposed textures',
    );
    assert.equal(scene.device.children.length, 0);
    assert.equal(currentTarget, null);
  } finally {
    first?.dispose();
    second?.dispose();
    THREE.TextureLoader.prototype.load = originalLoad;
  }
});
