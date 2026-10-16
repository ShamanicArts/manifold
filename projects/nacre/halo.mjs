import * as THREE from 'three';

// A separate draggable collar attaches to the real hand's wrist assembly.
export default function memoryHalo() {
  return {
    create(api) {
      const scene = api.resource('scene');
      const hand = api.resource('hand');
      const { spectralCrystal } = scene.materials;
      const resources = new Set();
      const keep = (value) => {
        resources.add(value);
        return value;
      };
      // The outer split collar is a second two-axis surface: turning it blends
      // the effect, while pulling it changes how much spectral memory remains.
      const memoryHalo = new THREE.Group();
      memoryHalo.position.copy(hand.anchor);
      memoryHalo.position.z = 0.07;
      hand.rig.add(memoryHalo);
      const haloMetal = keep(
        new THREE.MeshPhysicalMaterial({
          color: '#dbabd6',
          metalness: 0.85,
          roughness: 0.18,
          transparent: true,
          opacity: 0.55,
          emissive: '#57225f',
          emissiveIntensity: 0.1,
          clearcoat: 1,
        }),
      );
      for (const start of [0.2, Math.PI + 0.2]) {
        const arc = new THREE.Mesh(
          keep(new THREE.TorusGeometry(0.35, 0.009, 8, 64, Math.PI * 0.62)),
          haloMetal,
        );
        arc.rotation.z = start;
        memoryHalo.add(arc);
      }
      const haloIndex = new THREE.Mesh(
        keep(new THREE.OctahedronGeometry(0.028, 0)),
        spectralCrystal,
      );
      haloIndex.position.set(0, 0.35, 0.012);
      memoryHalo.add(haloIndex);

      const target = new THREE.Mesh(
        keep(new THREE.RingGeometry(0.245, 0.43, 64)),
        keep(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })),
      );
      hand.rig.add(target);
      const unregister = scene.registerControlTarget('halo', target, hand.ready);
      let disposed = false;
      return {
        update() {
          target.position.copy(hand.anchor);
          target.position.z = 0.08;
          memoryHalo.position.copy(hand.anchor);
          memoryHalo.position.z = 0.07;
          memoryHalo.rotation.z = api.input('rotation') ?? 0;
          const scale = api.input('scale') ?? 1;
          memoryHalo.scale.set(scale, scale, 1);
          haloMetal.emissiveIntensity = api.input('glow') ?? 0.1;
          scene.face.dataset.memoryHaloAngle = memoryHalo.rotation.z.toFixed(4);
          scene.face.dataset.memoryHaloScale = scale.toFixed(4);
        },
        outputs: () => ({ rotation: memoryHalo.rotation.z }),
        dispose() {
          if (disposed) return;
          disposed = true;
          unregister();
          hand.rig.remove(memoryHalo, target);
          for (const resource of resources) resource.dispose();
        },
      };
    },
  };
}
