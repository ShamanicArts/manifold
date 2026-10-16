import * as THREE from 'three/webgpu';

/** Optional presentation. No audio or parameter ownership. */
export async function createFrequencyField(element, backendLabel, readAnalyser) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0, 6.7, 18);
  camera.lookAt(0, 1.7, 0);
  const bars = [];
  const geometry = new THREE.BoxGeometry(0.38, 1, 0.38);
  for (let index = 0; index < 36; index++) {
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.53 + index / 360, 0.76, 0.56) });
    const bar = new THREE.Mesh(geometry, material);
    bar.position.x = (index - 17.5) * 0.52;
    scene.add(bar);
    bars.push(bar);
  }
  const data = new Uint8Array(512);
  let renderer;
  let frameBusy = false;
  let disposed = false;
  // `?webgl=1` is a deterministic renderer diagnostic for GPU-less test hosts.
  let forcedWebGL = new URLSearchParams(location.search).has('webgl');

  const resize = () => {
    if (!renderer) return;
    const width = Math.max(1, element.clientWidth);
    const height = Math.max(1, element.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(element);

  const startRenderer = async (forceWebGL) => {
    if (disposed) return;
    const next = new THREE.WebGPURenderer({ antialias: true, alpha: true, forceWebGL });
    await next.init();
    if (disposed) { next.dispose(); return; }
    renderer = next;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    element.appendChild(renderer.domElement);
    backendLabel.textContent = forceWebGL ? 'WEBGL2 FALLBACK' : renderer.backend?.isWebGPUBackend ? 'WEBGPU' : 'WEBGL2';
    resize();
    renderer.setAnimationLoop(() => {
      if (frameBusy || disposed) return;
      const analyser = readAnalyser();
      if (analyser) analyser.getByteFrequencyData(data);
      for (let index = 0; index < bars.length; index++) {
        const bin = Math.min(data.length - 1, Math.floor(2 * Math.pow(index + 1, 1.32)));
        const target = analyser ? Math.max(0.08, data[bin] / 255 * 7.6) : 0.1;
        bars[index].scale.y += (target - bars[index].scale.y) * 0.19;
        bars[index].position.y = bars[index].scale.y / 2;
      }
      frameBusy = true;
      renderer.renderAsync(scene, camera).then(() => { frameBusy = false; }).catch(async (error) => {
        frameBusy = false;
        renderer.setAnimationLoop(null);
        renderer.domElement.remove();
        renderer.dispose();
        renderer = null;
        if (forcedWebGL) {
          backendLabel.textContent = `VISUALIZER UNAVAILABLE: ${String(error)}`;
          return;
        }
        forcedWebGL = true;
        try { await startRenderer(true); }
        catch (fallbackError) { backendLabel.textContent = `VISUALIZER UNAVAILABLE: ${String(fallbackError)}`; }
      });
    });
  };

  try { await startRenderer(forcedWebGL); }
  catch (error) {
    forcedWebGL = true;
    await startRenderer(true);
  }
  return () => {
    disposed = true;
    observer.disconnect();
    renderer?.setAnimationLoop(null);
    renderer?.dispose();
    geometry.dispose();
    for (const bar of bars) bar.material.dispose();
  };
}
