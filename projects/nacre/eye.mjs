import * as THREE from 'three';
import { imagePixelRect } from '@manifold/ui-web/diegetic';

// Three independently inspectable images share the relic's relief and location.
// Nacre owns this placement; ordinary image nodes own selection and opacity.
export default function relicEye() {
  return {
    create(api) {
      const scene = api.resource('scene');
      const relic = api.resource('relic');
      const { face } = scene;
      const rig = new THREE.Group();
      relic.surface.add(rig);
      const resources = new Set();
      const keep = (value) => {
        resources.add(value);
        return value;
      };
      const layers = ['left', 'right', 'closed'].map((name, index) => {
        const material = keep(
          new THREE.MeshBasicMaterial({
            color: '#ffffff',
            transparent: true,
            opacity: 0,
            alphaTest: 0.025,
            depthWrite: false,
            toneMapped: false,
          }),
        );
        if (name !== 'closed') material.onBeforeCompile = relic.applyRelief;
        const geometry = keep(
          new THREE.PlaneGeometry(1, 1, index < 2 ? 40 : 1, index < 2 ? 56 : 1),
        );
        const mesh = new THREE.Mesh(geometry, material);
        // Keep each image's transform separate from its authored placement.
        const placement = new THREE.Group();
        mesh.matrixAutoUpdate = false;
        placement.add(mesh);
        rig.add(placement);
        return { name, material, mesh, placement, accepted: null };
      });
      const lightMaterial = keep(
        new THREE.MeshBasicMaterial({
          color: '#a8faff',
          transparent: true,
          opacity: 0.08,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      );
      const light = new THREE.Mesh(
        keep(new THREE.TorusGeometry(0.119, 0.006, 8, 48)),
        lightMaterial,
      );
      rig.add(light);
      const unregister = scene.registerControlTarget('eye', layers[2].mesh, () =>
        Boolean(layers[2].accepted),
      );
      const textures = new Map();
      let disposed = false;
      function load(path) {
        if (textures.has(path)) return;
        const entry = { texture: null, ready: false, error: false };
        textures.set(path, entry);
        Promise.resolve(api.assetUrl(path))
          .then((url) => {
            if (disposed || textures.get(path) !== entry) return;
            entry.texture = new THREE.TextureLoader().load(
              url,
              (texture) => {
                if (disposed || textures.get(path) !== entry) return;
                texture.colorSpace = THREE.SRGBColorSpace;
                entry.ready = true;
              },
              undefined,
              () => {
                entry.error = true;
              },
            );
          })
          .catch(() => {
            entry.error = true;
          });
      }
      return {
        update() {
          const inputs = layers.map((layer) => api.input(layer.name));
          const wanted = new Set();
          for (const [index, layer] of layers.entries()) {
            if (!inputs[index]) continue;
            wanted.add(inputs[index].asset);
            if (layer.accepted) wanted.add(layer.accepted.asset);
          }
          // At most three incoming and three last-complete images are resident.
          for (const [path, entry] of textures)
            if (!wanted.has(path)) {
              entry.texture?.dispose();
              textures.delete(path);
            }
          for (const path of wanted) load(path);
          const { width, height } = relic.layout;
          const eyeRect = imagePixelRect(163, 172, 94, 87, 330, 479, width, height);
          for (const [index, layer] of layers.entries()) {
            const image = inputs[index];
            const selected = image && textures.get(image.asset);
            if (!image) layer.accepted = null;
            else if (selected?.ready) layer.accepted = image;
            else if (layer.accepted) layer.accepted = { ...image, asset: layer.accepted.asset };
            const accepted = layer.accepted;
            layer.mesh.visible = Boolean(accepted);
            if (!accepted) continue;
            const texture = textures.get(accepted.asset).texture;
            if (layer.material.map !== texture) {
              layer.material.map = texture;
              layer.material.needsUpdate = true;
            }
            layer.material.opacity = accepted.opacity;
            const closed = layer.name === 'closed';
            const w = closed ? eyeRect.width : width;
            const h = closed ? eyeRect.height : height;
            layer.placement.position.set(
              closed ? eyeRect.x : 0,
              closed ? eyeRect.y : 0,
              closed ? 0.025 : 0.004 + index * 0.0003,
            );
            const [a, b, c, d, dx, dy] = accepted.transform;
            layer.mesh.matrix.set(
              a * w,
              -c * h,
              0,
              dx * w,
              -b * w,
              d * h,
              0,
              -dy * w,
              0,
              0,
              1,
              0,
              0,
              0,
              0,
              1,
            );
          }
          light.position.set(width * (0.606 - 0.5), height * (0.5 - 0.44), 0.012);
          light.scale.setScalar(width);
          const [opacity, hue] = api.input('light') ?? [0.07, 0.49];
          lightMaterial.opacity = opacity;
          lightMaterial.color.setHSL(hue, 0.9, 0.67);
          const left = layers[0].accepted?.opacity ?? 0;
          const right = layers[1].accepted?.opacity ?? 0;
          face.dataset.gazeOpen = (left + right).toFixed(3);
          face.dataset.gazeSide = (left + right ? right / (left + right) : 0).toFixed(3);
          face.dataset.eyeClosed = (layers[2].accepted?.opacity ?? 0).toFixed(3);
          const status = (images) =>
            images.some((image) => image && textures.get(image.asset)?.error)
              ? 'unavailable'
              : images.every((image) => image && textures.get(image.asset)?.ready)
                ? 'ready'
                : 'loading';
          face.dataset.gazeFrames = status(inputs.slice(0, 2));
          face.dataset.eyeSprite = status(inputs.slice(2));
          if ([...textures.values()].some((entry) => entry.error))
            throw new Error('An eye image could not be loaded; keeping its last complete image.');
        },
        outputs: () => ({ layers: layers.map((layer) => layer.accepted?.opacity ?? 0) }),
        dispose() {
          if (disposed) return;
          disposed = true;
          unregister();
          relic.surface.remove(rig);
          for (const entry of textures.values()) entry.texture?.dispose();
          textures.clear();
          for (const resource of resources) resource.dispose();
        },
      };
    },
  };
}
