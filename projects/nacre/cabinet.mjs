import * as THREE from 'three';
import { imageTexture, placeImage } from './image-texture.mjs';

// The engraving fills the cabinet plate. The frame, sockets and deck remain
// independent scene geometry; replacing this image changes only the engraving.
export default function cabinetArtwork() {
  return {
    create(api) {
      const scene = api.resource('scene');
      const texture = imageTexture(api);
      const material = new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      });
      const geometry = new THREE.PlaneGeometry(1, 1);
      const mesh = new THREE.Mesh(geometry, material);
      const placement = new THREE.Group();
      placement.matrixAutoUpdate = false;
      placement.add(mesh);
      scene.device.add(placement);
      let accepted = null,
        disposed = false;
      return {
        update() {
          const result = texture.update(api.input('image'));
          accepted = result.image;
          scene.face.dataset.cabinetArt = result.status;
          mesh.visible = Boolean(accepted);
          if (accepted) {
            const { paneW, paneH } = scene.layout;
            const width = paneW - 0.28,
              height = paneH - 0.28;
            mesh.scale.set(width, height, 1);
            mesh.position.z = 0.176;
            placeImage(placement, accepted, width);
            if (material.map !== result.texture) {
              material.map = result.texture;
              material.needsUpdate = true;
            }
            material.opacity = 0.9 * accepted.opacity;
            // Preserve the original centre crop at the plate's aspect ratio.
            const pixels = result.texture.image;
            const imageAspect =
                pixels?.width && pixels?.height ? pixels.width / pixels.height : 768 / 512,
              plateAspect = width / height;
            if (plateAspect > imageAspect) {
              result.texture.repeat.set(1, imageAspect / plateAspect);
              result.texture.offset.set(0, (1 - result.texture.repeat.y) / 2);
            } else {
              result.texture.repeat.set(plateAspect / imageAspect, 1);
              result.texture.offset.set((1 - result.texture.repeat.x) / 2, 0);
            }
          }
          if (result.status === 'unavailable')
            throw Error('The cabinet image could not be loaded; keeping its last complete image.');
        },
        outputs: () => ({ image: accepted }),
        dispose() {
          if (disposed) return;
          disposed = true;
          scene.device.remove(placement);
          texture.dispose();
          geometry.dispose();
          material.dispose();
        },
      };
    },
  };
}
