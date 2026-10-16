import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import handMotion from '../../projects/nacre/hand-motion.mjs';
import haloMotion from '../../projects/nacre/halo-motion.mjs';
import { evaluateProjectModules } from '../../packages/manifold-author/project-modules.js';
import { LiveProjectRuntime } from '../../packages/manifold-author/live-project.js';
import {
  createPresentationGraph,
  presentationResource,
  resourceValue,
} from '../../packages/manifold-ui-web/composition-runtime.js';
const saved = JSON.parse(
  readFileSync(
    new URL('../public/nacre/2026-10-10-graph/nacre-prism-bend.manifold.json', import.meta.url),
  ),
);

test('hand and halo respond to local touch before host acknowledgement and retain reduced-motion controls', () => {
  const values = {
    scatter: 0.28,
    grainSize: 85,
    energy: 0,
    mix: 0.64,
    afterimage: 0.22,
    touch: [0, 0, 1],
    gesture: [0, 0, 0],
  };
  const api = { input: (name) => values[name] },
    frame = { delta: 1 / 60 };
  const hand = handMotion(),
    halo = haloMotion();
  assert.equal(hand.evaluate(api, frame).rotation, 0);
  assert.equal(halo.evaluate(api, frame).frame, 0);
  values.touch = [1, 1, 1];
  values.gesture = [1, 250, 1];
  const held = hand.evaluate(api, frame);
  assert.ok(Math.abs(held.rotation - 0.208) < 1e-12);
  assert.equal(held.tilt, 0.12);
  assert.equal(held.ringScale, 1.12);
  assert.equal(held.grain, 1);
  assert.equal(held.scatter, 1);
  values.gesture = [-1, 0.8, 1];
  const grasp = halo.evaluate(api, frame);
  assert.equal(grasp.frame, 2);
  assert.ok(grasp.rotation < -1.2);
  values.gesture = [0, 0, 0];
  values.touch = [0, 0, 0];
  const settling = hand.evaluate(api, frame);
  assert.ok(
    settling.rotation > 0 && settling.rotation < held.rotation,
    'Normal motion eases instead of jumping',
  );
  values.touch = [0, 0, 1];
  assert.equal(hand.evaluate(api, frame).rotation, 0);
  values.afterimage = 0.35;
  assert.equal(halo.evaluate(api, frame).frame, 1);
  values.afterimage = 0.7;
  assert.equal(halo.evaluate(api, frame).frame, 2);
});

test('saved hand graph selects actual images, wires halo attachment and preserves audio on edits and recall', async () => {
  const runtime = new LiveProjectRuntime(null, saved.source, saved);
  const audio = runtime.project.signal,
    state = runtime.snapshot();
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
      eyePointer: [0.5, 0, 0],
      creatureTouch: [0, 0, 0],
      creatureGesture: [0, 0, 0],
      handTouch: [0, 0, 1],
      handGesture: [0, 0, 0],
      haloTouch: [0, 0, 1],
      haloGesture: [0, 0, 0],
    }),
  });
  execution.step(0);
  execution.step(20);
  const hand = node('hand-artwork');
  assert.match(execution.input(hand.id, 'image').asset, /reliquary-hand/);
  await runtime.request({ operation: 'parameter.set', path: '/afterimage', value: 0.9 });
  execution.configure(runtime.snapshot());
  execution.step(40);
  assert.match(execution.input(hand.id, 'image').asset, /grasp-open/);
  assert.match(execution.input(hand.id, 'graft').asset, /wrist-graft/);
  const definition = runtime.save().composition.definitions.find((d) => d.id === 'crystal-hand');
  assert.deepEqual(definition.parameters, []);
  const graph = definition.implementation.graph;
  const handInner = graph.nodes.find((n) => n.definition === 'hand-artwork');
  const haloInner = graph.nodes.find((n) => n.definition === 'memory-halo');
  assert.ok(
    graph.connections.some(
      (edge) => edge.from === handInner.id && edge.to === haloInner.id && edge.output === 'hand',
    ),
  );
  await runtime.request({ operation: 'parameter.set', path: '/afterimage', value: 0.22 });
  assert.deepEqual(runtime.project.signal, audio);
  assert.deepEqual(
    new LiveProjectRuntime(null, runtime.source, runtime.save()).snapshot().presentationExecution,
    runtime.snapshot().presentationExecution,
  );
});

test('hand and halo preserve wrist placement, depth clearance, silhouette targeting and resource ownership', async () => {
  const factory = (name) =>
    evaluateProjectModules(
      `/${name}.mjs`,
      {
        [`/${name}.mjs`]: readFileSync(
          new URL(`../../projects/nacre/${name}.mjs`, import.meta.url),
          'utf8',
        ),
      },
      { three: THREE },
    ).default();
  const pending = [],
    textures = [];
  const original = THREE.TextureLoader.prototype.load,
    originalDocument = globalThis.document;
  const pixels = new Uint8Array(128 * 186 * 4);
  pixels[(93 * 128 + 64) * 4 + 3] = 255;
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({ drawImage() {}, getImageData: () => ({ data: pixels }) }),
    }),
  };
  THREE.TextureLoader.prototype.load = function (url, loaded, _, failed) {
    const texture = new THREE.Texture();
    texture.releases = 0;
    texture.addEventListener('dispose', () => texture.releases++);
    textures.push(texture);
    pending.push({ url, loaded: () => loaded(texture), failed });
    return texture;
  };
  const targets = new Map();
  const scene = {
    device: new THREE.Group(),
    face: { dataset: {} },
    materials: {
      chrome: new THREE.MeshBasicMaterial(),
      spectralCrystal: new THREE.MeshBasicMaterial(),
    },
    handLayout: {
      width: (2.05 * 1024) / 1536,
      height: 2.05,
      x: 1,
      y: 1,
      wristX: ((2.05 * 1024) / 1536) * (535 / 620 - 0.5),
      wristY: 2.05 * (0.5 - 830 / 900),
      portrait: false,
    },
    registerControlTarget(name, object, ready, hitTest) {
      const value = { object, ready, hitTest };
      targets.set(name, value);
      return () => {
        if (targets.get(name) === value) targets.delete(name);
      };
    },
  };
  const image = (asset) => ({ asset, transform: [1, 0, 0, 1, 0, 0], opacity: 1 });
  const values = {
    image: image('/hand.webp'),
    graft: image('/graft.webp'),
    frames: { frames: ['/hand.webp', '/mid.webp', '/open.webp'] },
    rotation: 0.2,
    tilt: 0.12,
    height: 0.183,
    response: 1,
  };
  const api = {
    resource: () => scene,
    input: (name) => values[name],
    assetUrl: async (path) => path,
    exportResource: presentationResource,
  };
  let hand, halo;
  try {
    const layout = scene.handLayout;
    scene.handLayout = undefined;
    hand = factory('hand').create(api);
    assert.doesNotThrow(() => hand.update(), 'Cold hidden Presenter can wait for layout');
    scene.handLayout = layout;
    hand.update();
    await Promise.resolve();
    pending.splice(0).forEach((p) => p.loaded());
    hand.update();
    const resource = resourceValue(hand.outputs().hand),
      rig = resource.rig;
    assert.equal(rig.position.x, scene.handLayout.x + scene.handLayout.wristX);
    assert.equal(rig.position.y, scene.handLayout.y + scene.handLayout.wristY);
    const art = rig.children[0].children[0];
    rig.updateMatrixWorld(true);
    for (let i = 0; i < 4; i++) {
      const point = art.localToWorld(new THREE.Vector3(i & 1 ? 0.5 : -0.5, i & 2 ? 0.5 : -0.5, 0));
      assert.ok(point.z >= 0.182 - 1e-12, 'Every corner stays above the cabinet');
    }
    assert.ok(
      targets.get('heart').hitTest({ intersectObject: () => [{ uv: { x: 0.5, y: 0.5 } }] }),
    );
    assert.equal(
      targets.get('heart').hitTest({ intersectObject: () => [{ uv: { x: 0, y: 0 } }] }),
      false,
      'Transparent cutout is not a rectangular control',
    );
    halo = factory('halo').create({
      resource: (name) => (name === 'scene' ? scene : resource),
      input: (name) => ({ rotation: 0.4, scale: 1.1, glow: 0.5 })[name],
    });
    halo.update();
    assert.equal(targets.get('halo').object.parent, rig);
    assert.equal(scene.face.dataset.memoryHaloAngle, '0.4000');
    const old = art.material.map;
    values.image = image('/broken.webp');
    hand.update();
    await Promise.resolve();
    pending.splice(0).forEach((p) => p.failed());
    assert.throws(() => hand.update(), /last complete image/);
    assert.equal(art.material.map, old);
    assert.equal(scene.face.dataset.heartArt, 'unavailable');
    assert.ok(targets.get('heart').ready());
    values.image = image('/open.webp');
    hand.update();
    assert.equal(hand.outputs().image.asset, '/open.webp');
    scene.handLayout = {
      ...scene.handLayout,
      width: (1.85 * 1024) / 1536,
      height: 1.85,
      portrait: true,
    };
    hand.update();
    halo.update();
    assert.equal(art.scale.y, 1.85);
    values.image = image('/late.webp');
    hand.update();
    await Promise.resolve();
    halo.dispose();
    halo.dispose();
    hand.dispose();
    hand.dispose();
    pending.splice(0).forEach((p) => p.loaded());
    assert.equal(targets.size, 0);
    assert.equal(scene.device.children.length, 0);
    assert.ok(textures.every((texture) => texture.releases === 1));
    assert.equal(scene.materials.chrome.version, 0, 'Borrowed materials survive');
  } finally {
    halo?.dispose();
    hand?.dispose();
    THREE.TextureLoader.prototype.load = original;
    globalThis.document = originalDocument;
  }
});
