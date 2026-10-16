import * as THREE from 'three';
import { imageTexture, placeImage } from './image-texture.mjs';

// The photographed relic and its height map share one relief shader with the
// eye overlays. The mouth socket stays in the cabinet's authored layout.
export default function mouthRelic() {
  return {
    create(api) {
      const scene = api.resource('scene');
      const resources = new Set();
      const keep = (value) => {
        resources.add(value);
        return value;
      };
      const mouthRelicMaterial = keep(
        new THREE.MeshBasicMaterial({
          color: '#ffffff',
          transparent: true,
          opacity: 0,
          alphaTest: 0.025,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      // PhotoCraft's grayscale plate is a real height field. Vertex relief and
      // depth gradients share this map; the jack aperture is masked from motion.
      const neutralDepth = keep(new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1));
      neutralDepth.needsUpdate = true;
      const relicUniforms = {
        relicTime: { value: 0 },
        relicEnergy: { value: 0 },
        relicDepth: { value: neutralDepth },
      };
      mouthRelicMaterial.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, relicUniforms);
        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          '#include <common>\nuniform sampler2D relicDepth;uniform float relicEnergy;',
        );
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float h=texture2D(relicDepth,uv).r;
          float anchor=smoothstep(.13,.30,distance(uv,vec2(.394,.353)));
          transformed.z+=anchor*(h-.35)*(.065+relicEnergy*.15);
        `,
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          '#include <common>\nuniform sampler2D relicDepth;uniform float relicTime;uniform float relicEnergy;',
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          #ifdef USE_MAP
          vec2 pixel=vec2(1.0/330.0,1.0/479.0);
          float west=texture2D(relicDepth,vMapUv-vec2(pixel.x,0.0)).r;
          float east=texture2D(relicDepth,vMapUv+vec2(pixel.x,0.0)).r;
          float south=texture2D(relicDepth,vMapUv-vec2(0.0,pixel.y)).r;
          float north=texture2D(relicDepth,vMapUv+vec2(0.0,pixel.y)).r;
          vec3 reliefNormal=normalize(vec3((west-east)*3.0,(south-north)*3.0,1.0));
          float distanceFromMouth=distance(vMapUv,vec2(.394,.353));
          float movingRelief=relicEnergy*smoothstep(.15,.37,distanceFromMouth)*.24;
          reliefNormal.xy+=movingRelief*vec2(sin(vMapUv.y*38.0+relicTime*2.0),cos(vMapUv.x*33.0-relicTime*1.6));
          vec2 parallax=reliefNormal.xy*relicEnergy*.024*smoothstep(.14,.32,distanceFromMouth);
          diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(map,vMapUv+parallax).rgb,relicEnergy*.7);
          vec3 grazingLight=normalize(vec3(-.7+.5*sin(relicTime*.4),.38,.65));
          float foil=pow(max(dot(normalize(reliefNormal),grazingLight),0.0),7.0);
          diffuseColor.rgb+=vec3(.14,.35,.44)*foil*(.24+relicEnergy*1.8);
          #endif
        `,
        );
      };

      const artwork = imageTexture(api);
      const depth = imageTexture(api, THREE.NoColorSpace);
      const rig = new THREE.Group();
      const surface = new THREE.Group();
      surface.matrixAutoUpdate = false;
      rig.add(surface);
      const geometry = keep(new THREE.PlaneGeometry(1, 1, 40, 56));
      const mesh = new THREE.Mesh(geometry, mouthRelicMaterial);
      surface.add(mesh);
      scene.device.add(rig);
      const relic = api.exportResource('resource:nacre.relic', {
        surface,
        get layout() {
          return scene.relicLayout;
        },
        applyRelief: mouthRelicMaterial.onBeforeCompile,
      });
      let accepted = null,
        acceptedDepth = null,
        disposed = false;
      return {
        update() {
          const image = artwork.update(api.input('image'));
          const heightMap = depth.update(api.input('depth'));
          accepted = image.image;
          acceptedDepth = heightMap.image;
          scene.face.dataset.mouthRelic = image.status;
          scene.face.dataset.depthMap = heightMap.status;
          scene.face.dataset.reliefMotion = ((api.input('energy') ?? 0) * 0.15).toFixed(4);
          const { width, height, x, y } = scene.relicLayout;
          rig.position.set(x, y, 0.28);
          mesh.scale.set(width, height, 1);
          placeImage(surface, accepted, width);
          mesh.visible = Boolean(accepted);
          if (accepted) {
            if (mouthRelicMaterial.map !== image.texture) {
              mouthRelicMaterial.map = image.texture;
              mouthRelicMaterial.needsUpdate = true;
            }
            mouthRelicMaterial.opacity = 0.97 * accepted.opacity;
          }
          relicUniforms.relicDepth.value = heightMap.texture ?? neutralDepth;
          relicUniforms.relicTime.value = api.input('phase') ?? 0;
          relicUniforms.relicEnergy.value = api.input('energy') ?? 0;
          if (image.status === 'unavailable' || heightMap.status === 'unavailable')
            throw Error('A relic image could not be loaded; keeping its last complete image.');
          // The map samples the source UVs, independent of scene placement.
          // Do not silently ignore transforms on a height-map input.
          if (
            heightMap.status === 'ready' &&
            (acceptedDepth.opacity !== 1 ||
              acceptedDepth.transform.some((value, i) => value !== [1, 0, 0, 1, 0, 0][i]))
          )
            throw Error(
              'Relic depth needs an untransformed image; place the relic through its artwork input.',
            );
        },
        outputs: () => ({ relic, image: accepted, depth: acceptedDepth }),
        dispose() {
          if (disposed) return;
          disposed = true;
          scene.device.remove(rig);
          artwork.dispose();
          depth.dispose();
          for (const resource of resources) resource.dispose();
        },
      };
    },
  };
}
