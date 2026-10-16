import * as THREE from 'three';

// Nacre's placement and mouth light are project artwork. The image arriving
// here is selected and transformed by ordinary Manifold image nodes.
export default function oracleCreature() {
  return {
    create(api) {
      const scene = api.resource('scene');
      const { face } = scene;
      const resources = new Set();
      const keep = (resource) => {
        resources.add(resource);
        return resource;
      };
      const rig = new THREE.Group();
      const pose = new THREE.Group();
      pose.matrixAutoUpdate = false;
      rig.add(pose);
      scene.device.add(rig);
      const material = keep(
        new THREE.MeshBasicMaterial({
          color: '#ffffff',
          transparent: true,
          opacity: 0,
          alphaTest: 0.1,
          depthWrite: true,
          toneMapped: false,
        }),
      );
      const mouthMaterial = keep(
        new THREE.MeshBasicMaterial({
          color: '#db91ff',
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      const art = new THREE.Mesh(keep(new THREE.PlaneGeometry(1, 1)), material);
      art.renderOrder = 6;
      const mouth = new THREE.Mesh(keep(new THREE.OctahedronGeometry(1, 1)), mouthMaterial);
      mouth.renderOrder = 7;
      const target = new THREE.Mesh(
        keep(new THREE.CircleGeometry(1, 32)),
        keep(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })),
      );
      pose.add(art, mouth, target);
      let disposed = false,
        accepted = null;
      const unregister = scene.registerControlTarget('crab', target, () => Boolean(accepted));
      const textures = new Map();
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
          const image = api.input('image');
          const frames = api.input('frames')?.frames ?? [];
          // Warm the three authored poses; a larger edited sequence loads only
          // its selected frame and retains the last complete pose while waiting.
          const wanted = new Set([
            ...frames.slice(0, 3),
            ...(image ? [image.asset] : []),
            ...(image && accepted && frames.includes(accepted.asset) ? [accepted.asset] : []),
          ]);
          // Reordering or replacing images releases unused GPU textures.
          for (const [path, entry] of textures)
            if (!wanted.has(path)) {
              entry.texture?.dispose();
              textures.delete(path);
            }
          for (const path of wanted) load(path);
          const selected = image && textures.get(image.asset);
          if (!image || selected?.error || (accepted && !wanted.has(accepted.asset)))
            accepted = null;
          if (selected?.ready) accepted = image;
          else if (accepted && image) accepted = { ...image, asset: accepted.asset };
          rig.visible = Boolean(accepted);
          face.dataset.crabSprites = [...textures.values()].some((entry) => entry.error)
            ? 'unavailable'
            : wanted.size && [...textures.values()].every((entry) => entry.ready)
              ? 'ready'
              : 'loading';
          if (!accepted) return;
          const texture = textures.get(accepted.asset)?.texture;
          if (material.map !== texture) {
            material.map = texture;
            material.needsUpdate = true;
          }
          material.opacity = accepted.opacity;
          const { portrait, paneH } = scene.layout;
          const size = portrait ? 1.04 : 1.58;
          rig.position.set(portrait ? 0.82 : -0.34, portrait ? paneH / 2 - 1.34 : 1.16, 0.52);
          art.scale.set(size, size, 1);
          mouth.position.set(size * 0.3, -size * 0.11, 0.035);
          target.position.set(size * 0.3, -size * 0.11 + 0.25, 0.05);
          target.scale.setScalar(portrait ? 0.19 : 0.23);
          // Conjugate the image's Y-down affine transform into the Y-up scene.
          const [a, b, c, d, x, y] = accepted.transform;
          pose.matrix.set(a, -c, 0, x * size, -b, d, 0, -y * size, 0, 0, 1, 0, 0, 0, 0, 1);
          const [opacity, hue, scale] = api.input('glow') ?? [0.08, 0.79, 1];
          mouthMaterial.opacity = opacity * accepted.opacity;
          mouthMaterial.color.setHSL(hue, 0.88, 0.64);
          mouth.scale.setScalar((portrait ? 0.026 : 0.038) * scale);
          const [edge, heat] = api.input('controls') ?? [4800, 8];
          face.dataset.crabFrame = String(frames.indexOf(accepted.asset));
          face.dataset.crabEdge = edge.toFixed(1);
          face.dataset.crabHeat = heat.toFixed(1);
        },
        outputs: () => ({ image: accepted }),
        dispose() {
          if (disposed) return;
          disposed = true;
          unregister();
          scene.device.remove(rig);
          for (const entry of textures.values()) entry.texture?.dispose();
          textures.clear();
          for (const resource of resources) resource.dispose();
        },
      };
    },
  };
}
