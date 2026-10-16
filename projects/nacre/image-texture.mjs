import * as THREE from 'three';

// One image input owns its requested texture and its last complete texture.
// The caller chooses colour or data sampling; decoded pixels never enter the graph.
export function imageTexture(api, colorSpace = THREE.SRGBColorSpace) {
  const textures = new Map();
  let accepted = null,
    disposed = false;
  function load(path) {
    if (textures.has(path)) return;
    const entry = { texture: null, ready: false, error: false };
    textures.set(path, entry);
    Promise.resolve()
      .then(() => api.assetUrl(path))
      .then((url) => {
        if (disposed || textures.get(path) !== entry) return;
        entry.texture = new THREE.TextureLoader().load(
          url,
          (texture) => {
            if (disposed || textures.get(path) !== entry) return;
            texture.colorSpace = colorSpace;
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
    update(image) {
      if (disposed) return { image: null, texture: null, status: 'disconnected' };
      if (!image) accepted = null;
      else {
        load(image.asset);
        if (textures.get(image.asset).ready) accepted = image;
        else if (accepted) accepted = { ...image, asset: accepted.asset };
      }
      const wanted = new Set([image?.asset, accepted?.asset]);
      for (const [path, entry] of textures)
        if (!wanted.has(path)) {
          entry.texture?.dispose();
          textures.delete(path);
        }
      return {
        image: accepted,
        texture: accepted ? textures.get(accepted.asset).texture : null,
        status: !image
          ? 'disconnected'
          : textures.get(image.asset).error
            ? 'unavailable'
            : textures.get(image.asset).ready
              ? 'ready'
              : 'loading',
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of textures.values()) entry.texture?.dispose();
      textures.clear();
      accepted = null;
    },
  };
}

// Image coordinates point down; the scene points up. Translation uses image width.
export function placeImage(group, image, width) {
  const [a, b, c, d, x, y] = image?.transform ?? [1, 0, 0, 1, 0, 0];
  group.matrix.set(a, -c, 0, x * width, -b, d, 0, -y * width, 0, 0, 1, 0, 0, 0, 0, 1);
}
