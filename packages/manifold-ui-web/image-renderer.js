// Images are decoded once per presentation host. No renderer objects enter the
// saved graph, the audio callback, or Studio's observation transport.
export function createImageRenderer(
  assetUrl,
  { load = loadImage, canvas = () => document.createElement('canvas') } = {},
) {
  const images = new Map();
  let disposed = false;
  function release(entry) {
    entry.cancelled = true;
    entry.image?.close?.();
  }
  function trim() {
    let pixels = 0;
    for (const entry of images.values())
      if (entry.image)
        pixels +=
          (entry.image.naturalWidth ?? entry.image.width ?? 0) *
          (entry.image.naturalHeight ?? entry.image.height ?? 0);
    while (images.size > 16 || pixels > 32 * 1024 * 1024) {
      const [path, entry] = images.entries().next().value;
      if (entry.image)
        pixels -=
          (entry.image.naturalWidth ?? entry.image.width ?? 0) *
          (entry.image.naturalHeight ?? entry.image.height ?? 0);
      release(entry);
      images.delete(path);
    }
  }
  function get(path) {
    let entry = images.get(path);
    if (!entry) {
      entry = { image: null, error: null, cancelled: false };
      images.set(path, entry);
      Promise.resolve()
        .then(() => assetUrl(path))
        .then(load)
        .then((image) => {
          if (entry.cancelled || disposed) image.close?.();
          else {
            entry.image = image;
            trim();
          }
        })
        .catch((error) => {
          if (!entry.cancelled) entry.error = error;
        });
    }
    images.delete(path);
    images.set(path, entry);
    trim();
    if (entry.error) throw entry.error;
    return entry.image;
  }
  function draw(target, value, width, height) {
    // Keep the last complete frame while a newly selected asset decodes. A
    // disconnected image clears immediately; decode failures remain explicit.
    let image;
    try {
      image = value ? get(value.asset) : null;
    } catch (error) {
      target.getContext('2d').clearRect(0, 0, target.width, target.height);
      throw error;
    }
    if (value && !image) return false;
    if (target.width !== width) target.width = width;
    if (target.height !== height) target.height = height;
    const context = target.getContext('2d', { willReadFrequently: width <= 32 && height <= 32 });
    context.clearRect(0, 0, width, height);
    if (!value) return false;
    const w = image.naturalWidth ?? image.width,
      h = image.naturalHeight ?? image.height;
    const fit = Math.min(width / w, height / h);
    const [a, b, c, d, x, y] = value.transform;
    context.save();
    context.translate(width / 2, height / 2);
    // Rotation stays geometrically correct for non-square images. Translation
    // uses the image's fitted width, not the enclosing dock size.
    context.transform(a, b, c, d, x * w * fit, y * w * fit);
    context.globalAlpha = value.opacity;
    context.drawImage(image, (-w * fit) / 2, (-h * fit) / 2, w * fit, h * fit);
    context.restore();
    return true;
  }
  let thumbnail;
  return {
    draw,
    preview(type, value) {
      if (type === 'image-sequence')
        value = value.frames.length
          ? { asset: value.frames[0], transform: [1, 0, 0, 1, 0, 0], opacity: 1 }
          : null;
      if (!value) return null;
      thumbnail ??= canvas();
      if (!draw(thumbnail, value, 32, 32)) return null;
      const bytes = thumbnail.getContext('2d').getImageData(0, 0, 32, 32).data;
      // Hex keeps sixteen RGBA thumbnails below the native 256 KiB message cap.
      const rgba = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      const image = get(value.asset);
      return {
        kind: 'image',
        width: 32,
        height: 32,
        rgba,
        asset: value.asset,
        resolution: [image.naturalWidth ?? image.width, image.naturalHeight ?? image.height],
      };
    },
    retain(paths) {
      for (const [path, entry] of images)
        if (!paths.has(path)) {
          release(entry);
          images.delete(path);
        }
      if (!paths.size) thumbnail = null;
    },
    invalidate() {
      for (const entry of images.values()) release(entry);
      images.clear();
    },
    dispose() {
      disposed = true;
      this.invalidate();
      thumbnail = null;
    },
  };
}
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight)
        reject(new Error('Image has no pixels'));
      else resolve(image);
    };
    image.onerror = () => reject(new Error('Unable to decode project image'));
    image.src = url;
  });
}
