import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { imagePixelRect } from '../../packages/manifold-ui-web/diegetic.js';
import { evaluateProjectModules } from '../../packages/manifold-author/project-modules.js';
import {
  presentationResource,
  resourceValue,
} from '../../packages/manifold-ui-web/composition-runtime.js';

const sources = Object.fromEntries(
  ['cabinet', 'relic', 'eye', 'image-texture'].map((name) => [
    `/nacre/${name}.mjs`,
    readFileSync(new URL(`../../projects/nacre/${name}.mjs`, import.meta.url), 'utf8'),
  ]),
);
const factory = (name) =>
  evaluateProjectModules(`/nacre/${name}.mjs`, sources, {
    three: THREE,
    '@manifold/ui-web/diegetic': { imagePixelRect },
  }).default();
const image = (asset) => ({ asset, opacity: 1, transform: [1, 0, 0, 1, 0, 0] });
const flush = () => new Promise(setImmediate);

test('relic owns shared relief, carries the actual eye and preserves complete images through load failure', async () => {
  const original = THREE.TextureLoader.prototype.load;
  const textures = [],
    pending = [];
  THREE.TextureLoader.prototype.load = function (url, loaded, _, failed) {
    const texture = new THREE.Texture();
    texture.releases = 0;
    texture.addEventListener('dispose', () => texture.releases++);
    textures.push(texture);
    pending.push({ url, loaded: () => loaded(texture), failed });
    return texture;
  };
  const scene = {
    face: { dataset: {} },
    device: new THREE.Group(),
    relicLayout: { width: 1.19, height: (1.19 * 479) / 330, x: -2, y: -1 },
    registerControlTarget() {
      return () => {};
    },
  };
  const values = {
    image: image('/relic.webp'),
    depth: image('/depth.webp'),
    energy: 0.3,
    phase: 1.7,
  };
  let relic, eye;
  try {
    relic = factory('relic').create({
      resource: () => scene,
      input: (name) => values[name],
      assetUrl: async (path) => path,
      exportResource: presentationResource,
    });
    relic.update();
    await flush();
    pending.splice(0).forEach((entry) => entry.loaded());
    relic.update();
    const shared = resourceValue(relic.outputs().relic);
    const mesh = shared.surface.children[0];
    const reliefShader = {
      uniforms: {},
      vertexShader: '#include <common>\n#include <begin_vertex>',
      fragmentShader: '#include <common>\n#include <color_fragment>',
    };
    shared.applyRelief(reliefShader);
    assert.equal(reliefShader.uniforms.relicEnergy.value, 0.3);
    assert.equal(reliefShader.uniforms.relicTime.value, 1.7);
    assert.equal(reliefShader.uniforms.relicDepth.value.colorSpace, THREE.NoColorSpace);
    assert.equal(mesh.geometry.parameters.widthSegments, 40);
    assert.equal(mesh.geometry.parameters.heightSegments, 56);
    const eyeValues = {
      left: image('/left.webp'),
      right: image('/right.webp'),
      closed: image('/closed.webp'),
    };
    eye = factory('eye').create({
      resource: (name) => (name === 'relic' ? shared : scene),
      input: (name) => eyeValues[name],
      assetUrl: async (path) => path,
    });
    eye.update();
    await flush();
    pending.splice(0).forEach((entry) => entry.loaded());
    eye.update();
    const eyeRig = shared.surface.children[1];
    const left = eyeRig.children[0].children[0];
    assert.equal(
      left.material.onBeforeCompile,
      shared.applyRelief,
      'One closure and uniform set serve relic and eye',
    );
    scene.device.updateMatrixWorld(true);
    const point = left.getWorldPosition(new THREE.Vector3());
    assert.deepEqual(point.toArray().slice(0, 2), [-2, -1]);
    assert.ok(Math.abs(point.z - 0.284) < 1e-12);
    values.image = { ...values.image, transform: [1, 0, 0, 1, 0.25, 0] };
    values.energy = 0.7;
    relic.update();
    eye.update();
    scene.device.updateMatrixWorld(true);
    assert.equal(left.getWorldPosition(new THREE.Vector3()).x, -2 + 1.19 * 0.25);
    assert.equal(reliefShader.uniforms.relicEnergy.value, 0.7);
    const previous = mesh.material.map;
    values.image = image('/missing.webp');
    relic.update();
    await flush();
    pending.splice(0).forEach((entry) => entry.failed());
    assert.throws(() => relic.update(), /last complete image/);
    assert.equal(mesh.material.map, previous);
    assert.equal(scene.face.dataset.mouthRelic, 'unavailable');
    values.image = image('/relic.webp');
    relic.update();
    values.depth = { ...values.depth, transform: [1, 0, 0, 1, 0.1, 0] };
    assert.throws(() => relic.update(), /untransformed image/);
    values.depth = image('/depth.webp');
    assert.doesNotThrow(
      () => relic.update(),
      'A running depth-input error repairs without reloading',
    );
    const depth = reliefShader.uniforms.relicDepth.value;
    eye.dispose();
    eye.dispose();
    eye = null;
    assert.equal(depth.releases, 0, 'Eye borrows the relic depth texture');
    values.image = image('/late.webp');
    relic.update();
    await flush();
    relic.dispose();
    relic.dispose();
    relic = null;
    pending.splice(0).forEach((entry) => entry.loaded());
    assert.equal(scene.device.children.length, 0);
    assert.ok(textures.every((texture) => texture.releases === 1));
  } finally {
    eye?.dispose();
    relic?.dispose();
    THREE.TextureLoader.prototype.load = original;
  }
});

test('cabinet centre crop follows the actual image aspect and releases pending replacements', async () => {
  const original = THREE.TextureLoader.prototype.load;
  const textures = [],
    pending = [];
  THREE.TextureLoader.prototype.load = function (url, loaded) {
    const texture = new THREE.Texture({ width: 768, height: 512 });
    texture.releases = 0;
    texture.addEventListener('dispose', () => texture.releases++);
    textures.push(texture);
    pending.push(() => loaded(texture));
    return texture;
  };
  const scene = {
    device: new THREE.Group(),
    face: { dataset: {} },
    layout: { paneW: 8, paneH: 4.7 },
  };
  let value = image('/cabinet.webp'),
    cabinet;
  try {
    cabinet = factory('cabinet').create({
      resource: () => scene,
      input: () => value,
      assetUrl: async (path) => path,
    });
    cabinet.update();
    await flush();
    pending.splice(0).forEach((loaded) => loaded());
    cabinet.update();
    const mesh = scene.device.children[0].children[0];
    assert.equal(mesh.position.z, 0.176);
    assert.equal(mesh.material.opacity, 0.9);
    assert.equal(mesh.material.map.repeat.x, 1);
    assert.equal(mesh.material.map.repeat.y, 1.5 / ((8 - 0.28) / (4.7 - 0.28)));
    scene.layout = { paneW: 4.5, paneH: 7 };
    cabinet.update();
    assert.equal(mesh.material.map.repeat.y, 1);
    assert.equal(mesh.material.map.repeat.x, (4.5 - 0.28) / (7 - 0.28) / 1.5);
    value = image('/late.webp');
    cabinet.update();
    await flush();
    assert.equal(cabinet.outputs().image.asset, '/cabinet.webp');
    value = null;
    cabinet.update();
    assert.equal(cabinet.outputs().image, null);
    assert.equal(mesh.visible, false);
    cabinet.dispose();
    cabinet.dispose();
    cabinet = null;
    pending.splice(0).forEach((loaded) => loaded());
    assert.ok(textures.every((texture) => texture.releases === 1));
    assert.equal(scene.device.children.length, 0);
  } finally {
    cabinet?.dispose();
    THREE.TextureLoader.prototype.load = original;
  }
});
