import * as THREE from 'three';

// The image nodes choose and transform the actual cutouts. This object owns
// their wrist pivot, shallow relief, engraved bearings and silhouette hit test.
export default function crystalHand() {
  return {
    create(api) {
      const scene = api.resource('scene');
      const { face } = scene;
      const { chrome } = scene.materials;
      const resources = new Set();
      const keep = (value) => {
        resources.add(value);
        return value;
      };
      const heartUniforms = {
        heartTime: { value: 0 },
        heartEnergy: { value: 0 },
        heartScatter: { value: 0 },
        heartGrain: { value: 0 },
      };
      const heartMaterial = keep(
        new THREE.MeshBasicMaterial({
          color: '#ffffff',
          transparent: true,
          opacity: 1,
          alphaTest: 0.1,
          depthWrite: true,
          toneMapped: false,
        }),
      );
      heartMaterial.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, heartUniforms);
        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          '#include <common>\nuniform float heartEnergy;uniform float heartScatter;uniform float heartGrain;',
        );
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float heart=exp(-dot((uv-vec2(.36,.67))*vec2(2.1,2.5),(uv-vec2(.36,.67))*vec2(2.1,2.5))*5.0);
          transformed.z+=heart*(.006+.015*heartEnergy+.013*heartScatter+.008*heartGrain);
        `,
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          '#include <common>\nuniform float heartTime;uniform float heartEnergy;uniform float heartScatter;uniform float heartGrain;',
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          #ifdef USE_MAP
          float heart=exp(-dot((vMapUv-vec2(.36,.67))*vec2(2.1,2.5),(vMapUv-vec2(.36,.67))*vec2(2.1,2.5))*5.0);
          float facets=pow(max(0.0,sin(vMapUv.x*48.0+vMapUv.y*21.0-heartTime*(.4+heartGrain*1.5))),16.0);
          vec3 spectrum=.5+.5*cos(6.2831853*(vMapUv.y*.8+heartScatter*.2+heartTime*.025+vec3(0.0,.33,.67)));
          diffuseColor.rgb+=spectrum*heart*(facets*.10+heartEnergy*(.07+heartScatter*.18));
          #endif
        `,
        );
      };
      // A separate photographed graft covers every grasp pose. Its centre is
      // cut out in the shader: the real 3D ferrule remains visible in the hole
      // while porcelain, gold and tendons overhang its edge.
      const wristGraftMaterial = keep(
        new THREE.MeshBasicMaterial({
          color: '#ffffff',
          transparent: true,
          opacity: 0.98,
          alphaTest: 0.025,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      wristGraftMaterial.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          #ifdef USE_MAP
          float surround=1.0-smoothstep(.76,1.0,length((vMapUv-vec2(.89,.11))/vec2(.23,.21)));
          float aperture=smoothstep(.70,1.05,length((vMapUv-vec2(.895,.067))/vec2(.061,.055)));
          diffuseColor.a*=surround*aperture;
          #endif
        `,
        );
      };

      const heartRig = new THREE.Group();
      heartRig.position.z = 0.195;
      const pose = new THREE.Group();
      pose.matrixAutoUpdate = false;
      heartRig.add(pose);
      const geometry = keep(new THREE.PlaneGeometry(1, 1, 24, 36));
      const heartArt = new THREE.Mesh(geometry, heartMaterial);
      pose.add(heartArt);
      const graftPose = new THREE.Group();
      graftPose.matrixAutoUpdate = false;
      heartRig.add(graftPose);
      const graft = new THREE.Mesh(geometry, wristGraftMaterial);
      graft.renderOrder = 10;
      graftPose.add(graft);
      const heartTarget = new THREE.Mesh(
        keep(new THREE.CircleGeometry(1, 32)),
        keep(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })),
      );
      heartRig.add(heartTarget);
      // Two engraved bearings expose Scatter and Grain as physical settings.
      const heartGimbal = new THREE.Group();
      heartGimbal.position.copy(heartTarget.position);
      heartGimbal.position.z = 0.075;
      heartRig.add(heartGimbal);
      const jewelMetal = keep(
        new THREE.MeshPhysicalMaterial({
          color: '#e7c9a0',
          metalness: 0.9,
          roughness: 0.18,
          emissive: '#794b9a',
          emissiveIntensity: 0.08,
          clearcoat: 1,
        }),
      );
      for (const start of [0.15, Math.PI + 0.15]) {
        const arc = new THREE.Mesh(
          keep(new THREE.TorusGeometry(0.205, 0.007, 6, 44, Math.PI * 0.72)),
          jewelMetal,
        );
        arc.rotation.z = start;
        heartGimbal.add(arc);
      }
      const heartGrainDial = new THREE.Group();
      heartGimbal.add(heartGrainDial);
      for (const start of [0, Math.PI]) {
        const arc = new THREE.Mesh(
          keep(new THREE.TorusGeometry(0.153, 0.004, 6, 36, Math.PI * 0.38)),
          chrome,
        );
        arc.rotation.z = start;
        arc.position.z = 0.004;
        heartGrainDial.add(arc);
      }

      const textures = new Map();
      let accepted = null,
        acceptedGraft = null,
        disposed = false;
      const corner = new THREE.Vector3();
      const hitWidth = 128,
        hitHeight = 186;
      function load(path) {
        if (textures.has(path)) return;
        const entry = { texture: null, ready: false, error: false, pixels: null };
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
                try {
                  const canvas = document.createElement('canvas');
                  canvas.width = hitWidth;
                  canvas.height = hitHeight;
                  const context = canvas.getContext('2d', { willReadFrequently: true });
                  context.drawImage(texture.image, 0, 0, hitWidth, hitHeight);
                  entry.pixels = context.getImageData(0, 0, hitWidth, hitHeight).data;
                } catch {
                  /* The crystal circle remains usable without pixel access. */
                }
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
      function hitTest(raycaster) {
        const imageHit = raycaster.intersectObject(heartArt, false)[0];
        const pixels = accepted && textures.get(accepted.asset)?.pixels;
        if (imageHit && pixels) {
          const x = Math.max(0, Math.min(hitWidth - 1, Math.floor(imageHit.uv.x * hitWidth)));
          const y = Math.max(
            0,
            Math.min(hitHeight - 1, Math.floor((1 - imageHit.uv.y) * hitHeight)),
          );
          return pixels[(y * hitWidth + x) * 4 + 3] > 64;
        }
        return raycaster.intersectObject(heartTarget, false).length > 0;
      }
      function affine(group, image, width) {
        const [a, b, c, d, x, y] = image.transform;
        group.matrix.set(a, -c, 0, x * width, -b, d, 0, -y * width, 0, 0, 1, 0, 0, 0, 0, 1);
      }
      const hand = api.exportResource('resource:nacre.hand', {
        rig: heartRig,
        anchor: heartTarget.position,
        ready: () => Boolean(accepted),
      });
      scene.device.add(heartRig);
      const unregister = scene.registerControlTarget(
        'heart',
        heartArt,
        () => Boolean(accepted),
        hitTest,
      );
      return {
        update() {
          const image = api.input('image');
          const graftImage = api.input('graft');
          const frames = api.input('frames')?.frames ?? [];
          const wanted = new Set([
            ...frames.slice(0, 3),
            ...(image ? [image.asset, ...(accepted ? [accepted.asset] : [])] : []),
            ...(graftImage
              ? [graftImage.asset, ...(acceptedGraft ? [acceptedGraft.asset] : [])]
              : []),
          ]);
          for (const [path, entry] of textures)
            if (!wanted.has(path)) {
              entry.texture?.dispose();
              textures.delete(path);
            }
          for (const path of wanted) load(path);
          const accept = (next, previous) =>
            !next
              ? null
              : textures.get(next.asset)?.ready
                ? next
                : previous
                  ? { ...next, asset: previous.asset }
                  : null;
          accepted = accept(image, accepted);
          acceptedGraft = accept(graftImage, acceptedGraft);
          const status = (paths) =>
            paths.some((path) => textures.get(path)?.error)
              ? 'unavailable'
              : paths.length && paths.every((path) => textures.get(path)?.ready)
                ? 'ready'
                : 'loading';
          face.dataset.handSprites = status(frames.slice(0, 3));
          face.dataset.heartArt = status(image ? [image.asset] : []);
          face.dataset.wristGraft = status(graftImage ? [graftImage.asset] : []);
          face.dataset.handHit =
            accepted && textures.get(accepted.asset)?.pixels ? 'silhouette' : 'crystal';
          heartRig.visible = Boolean(accepted);
          graft.visible = Boolean(acceptedGraft);
          // A hidden/cold Presenter may not have measured its pane yet.
          // This is expected preparation, not a failed script to latch.
          if (!scene.handLayout) return;
          const { width, height, x, y, wristX, wristY, portrait } = scene.handLayout;
          heartRig.position.x = x + wristX;
          heartRig.position.y = y + wristY;
          heartArt.position.set(-wristX, -wristY, 0);
          heartArt.scale.set(width, height, 1);
          graft.position.set(-wristX - width * 0.032, -wristY + height * 0.011, 0.004);
          graft.scale.set(width, height, 1);
          for (const [mesh, group, value, opacity] of [
            [heartArt, pose, accepted, 1],
            [graft, graftPose, acceptedGraft, 0.98],
          ]) {
            if (!value) continue;
            const texture = textures.get(value.asset).texture;
            if (mesh.material.map !== texture) {
              mesh.material.map = texture;
              mesh.material.needsUpdate = true;
            }
            mesh.material.opacity = value.opacity * opacity;
            affine(group, value, width);
          }
          heartTarget.position.set(-wristX - width * 0.14, -wristY + height * 0.28, 0.06);
          heartTarget.scale.setScalar(portrait ? 0.18 : 0.24);
          heartGimbal.position.copy(heartTarget.position);
          heartGimbal.position.z = 0.075;
          heartRig.rotation.set(0, api.input('tilt') ?? 0, api.input('rotation') ?? 0);
          heartRig.position.z +=
            ((api.input('height') ?? 0.195) - heartRig.position.z) * (api.input('response') ?? 1);
          // Keep all four transformed corners above the cabinet (z=.176),
          // retaining normal depth testing against the socket and control deck.
          let back = Infinity;
          for (let i = 0; i < 4; i++) {
            corner
              .set((i & 1 ? 0.5 : -0.5) * width, (i & 2 ? 0.5 : -0.5) * height, 0)
              .add(heartArt.position)
              .applyMatrix4(pose.matrix)
              .applyQuaternion(heartRig.quaternion);
            back = Math.min(back, corner.z);
          }
          heartRig.position.z = Math.max(heartRig.position.z, 0.182 - back);
          heartGimbal.rotation.z = api.input('ringRotation') ?? 0;
          heartGimbal.scale.set(api.input('ringScale') ?? 1, api.input('ringScale') ?? 1, 1);
          heartGrainDial.rotation.z = api.input('grainRotation') ?? 0;
          jewelMetal.emissiveIntensity = api.input('glow') ?? 0.08;
          heartUniforms.heartTime.value = api.input('phase') ?? 0;
          heartUniforms.heartEnergy.value = api.input('energy') ?? 0;
          heartUniforms.heartScatter.value = api.input('scatter') ?? 0.28;
          heartUniforms.heartGrain.value = api.input('grain') ?? 0.28;
          face.dataset.graspFrame = String(accepted ? frames.indexOf(accepted.asset) : -1);
          face.dataset.handAngle = heartRig.rotation.z.toFixed(4);
          face.dataset.jewelAngle = heartGimbal.rotation.z.toFixed(4);
          face.dataset.grainDialAngle = heartGrainDial.rotation.z.toFixed(4);
          if ([image, graftImage].some((value) => value && textures.get(value.asset)?.error))
            throw new Error('A hand image could not be loaded; keeping its last complete image.');
        },
        outputs: () => ({ hand, image: accepted }),
        dispose() {
          if (disposed) return;
          disposed = true;
          unregister();
          scene.device.remove(heartRig);
          for (const entry of textures.values()) entry.texture?.dispose();
          textures.clear();
          for (const resource of resources) resource.dispose();
        },
      };
    },
  };
}
