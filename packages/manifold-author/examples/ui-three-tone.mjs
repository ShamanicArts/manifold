// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.oscillator, etc.
import { createGraphWorkspace } from '@manifold/author';
import { oscillator, svf } from '@manifold/author/primitives';

export default function createProject() {
  // Inputs — musical controls with stable names, units and useful ranges.
  const controls = {
    pitch: { path: '/ui/space/pitch', label: 'Pitch · Hz', min: 55, max: 880, default: 220 },
    cutoff: { path: '/ui/space/cutoff', label: 'Cutoff · Hz', min: 80, max: 8000, default: 2400 },
    level: { path: '/ui/space/level', label: 'Level', min: 0, max: 0.3, default: 0.12 },
  };
  // Outputs and graph — Rust owns the oscillator and filter DSP.
  const graph = createGraphWorkspace().setInputSource('none');
  const voice = graph.add(oscillator.type, { id: 4 });
  const filter = graph.add(svf.type, { id: 5 });
  graph.registerInstance('/ui/space/voice', voice);
  graph.registerInstance('/ui/space/filter', filter);
  voice.parameter('frequency').expose(controls.pitch);
  voice.parameter('level').expose(controls.level);
  voice.parameter('waveform').set(1);
  filter.parameter('cutoff').expose(controls.cutoff);
  filter.parameter('resonance').set(0.6);
  graph.connect(voice.output('out'), filter.input('audio'));
  graph.connect(filter.output('out'), graph.output.input('in'));

  // Manifold kit and custom web presentation share the same accepted controls.
  const view = Object.values(controls).map(control => ({
    id: control.path, type: 'parameter', path: control.path, label: control.label,
    group: 'Sound', style: { accent: '#38bdf8' },
  }));
  const webView = {
    version: 1, source: webViewSource, dependencies: { three: '0.184.0' }, height: 300,
  };
  return { graph, view, webView };
}

// Custom presentation is a separate module. Its explicit dependency is bundled
// by the web host; this code never runs in the DSP or orchestration thread.
const webViewSource = `import * as THREE from 'three';

export default function createView() {
  return {
    mount(element, api) {
      // Scene — replace these shapes/materials to make the instrument yours.
      const palette = { background: '#101b29', tone: '#38bdf8', rail: '#354259' };
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(palette.background);
      const camera = new THREE.OrthographicCamera(-1.6, 1.6, 1.2, -1.2, 0.1, 20);
      camera.position.set(0, 0, 5);
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      const canvas = renderer.domElement;
      canvas.setAttribute('aria-label', 'Three.js pitch and cutoff surface');
      canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:none';
      element.append(canvas);

      const geometry = new THREE.IcosahedronGeometry(0.18, 1);
      const material = new THREE.MeshNormalMaterial();
      const tone = new THREE.Mesh(geometry, material);
      scene.add(tone);
      const railGeometry = new THREE.PlaneGeometry(2.8, 1.8);
      const railMaterial = new THREE.MeshBasicMaterial({ color: palette.rail, wireframe: true });
      scene.add(new THREE.Mesh(railGeometry, railMaterial));
      const glowGeometry = new THREE.RingGeometry(0.26, 0.28, 48);
      const glowMaterial = new THREE.MeshBasicMaterial({ color: palette.tone });
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      scene.add(glow);

      // Public bindings — both the scene and Manifold sliders read these paths.
      const pitch = '/ui/space/pitch';
      const cutoff = '/ui/space/cutoff';
      const unit = (value, low, high) => Math.log(value / low) / Math.log(high / low);
      function update() {
        tone.position.x = (unit(api.value(pitch), 55, 880) - 0.5) * 2.8;
        tone.position.y = (unit(api.value(cutoff), 80, 8000) - 0.5) * 1.8;
        glow.position.copy(tone.position);
        canvas.dataset.pitch = String(api.value(pitch));
        canvas.dataset.cutoff = String(api.value(cutoff));
      }

      // Gesture — ray projection keeps dragging correct at every aspect ratio.
      const ray = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const point = new THREE.Vector3();
      let held = null;
      function move(event) {
        if (event.pointerId !== held) return;
        const rect = canvas.getBoundingClientRect();
        pointer.set((event.clientX - rect.left) / rect.width * 2 - 1,
          1 - (event.clientY - rect.top) / rect.height * 2);
        ray.setFromCamera(pointer, camera);
        ray.ray.intersectPlane(plane, point);
        const x = Math.max(0, Math.min(1, point.x / 2.8 + 0.5));
        const y = Math.max(0, Math.min(1, point.y / 1.8 + 0.5));
        api.set(pitch, 55 * Math.pow(16, x)).catch(() => {});
        api.set(cutoff, 80 * Math.pow(100, y)).catch(() => {});
      }
      function down(event) {
        if (held !== null || event.button !== 0) return;
        held = event.pointerId;
        canvas.setPointerCapture(held);
        move(event);
      }
      function up(event) {
        if (event.pointerId !== held) return;
        move(event);
        if (canvas.hasPointerCapture(held)) canvas.releasePointerCapture(held);
        held = null;
      }
      function cancel() { held = null; }
      canvas.addEventListener('pointerdown', down);
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', cancel);
      canvas.addEventListener('lostpointercapture', cancel);

      const resize = new ResizeObserver(() => {
        const width = Math.max(1, element.clientWidth);
        const height = Math.max(1, element.clientHeight);
        camera.left = -1.2 * width / height;
        camera.right = 1.2 * width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      });
      resize.observe(element);
      renderer.setAnimationLoop(() => {
        tone.rotation.y += 0.006;
        const rms = api.analysis()?.rms ?? 0;
        glow.scale.setScalar(1 + Math.min(1, rms * 8));
        renderer.render(scene, camera);
      });
      return { update, dispose() {
        resize.disconnect();
        renderer.setAnimationLoop(null);
        canvas.removeEventListener('pointerdown', down);
        canvas.removeEventListener('pointermove', move);
        canvas.removeEventListener('pointerup', up);
        canvas.removeEventListener('pointercancel', cancel);
        canvas.removeEventListener('lostpointercapture', cancel);
        geometry.dispose(); material.dispose();
        railGeometry.dispose(); railMaterial.dispose();
        glowGeometry.dispose(); glowMaterial.dispose();
        renderer.dispose(); renderer.forceContextLoss();
        canvas.remove();
      } };
    },
  };
}`;

