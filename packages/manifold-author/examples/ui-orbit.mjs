// Examples name imports so each tool has a visible origin.
// Alternative: import * as manifold from '@manifold/author';
import { createGraphWorkspace } from '@manifold/author';
import { extendedOscillator, svf } from '@manifold/author/primitives';
import { applyStudioGraph } from '@manifold/author/studio-graph';

// Additional parameters — expose named primitive parameters while authoring.
// The studio edits this literal list; you can also write these definitions here.
const studioParameters = [];
const studioGraph = { nodes: [], connections: [], removed: [], layout: [] };

// Presentation layout — percentages inside the control panel, independent of DSP.
// Arrange controls in the studio, or edit these positions directly.
const presentationLayout = [
  { path: '/ui/space/waveform', x: 4, y: 13, width: 28, label: 'Waveform' },
  { path: '/ui/space/pitch', x: 37, y: 13, width: 28, label: 'Pitch' },
  { path: '/ui/space/detune', x: 70, y: 13, width: 26, label: 'Detune' },
  { path: '/ui/space/cutoff', x: 4, y: 41, width: 28, label: 'Brightness' },
  { path: '/ui/space/resonance', x: 37, y: 41, width: 28 },
  { path: '/ui/space/spread', x: 4, y: 69, width: 28, label: 'Stereo width' },
  { path: '/ui/space/drive', x: 37, y: 69, width: 28 },
  { path: '/ui/space/level', x: 70, y: 69, width: 26 },
];

export default function createProject() {
  // Inputs — named musical controls; these paths also bind the finished face.
  const controls = {
    waveform: { path: '/ui/space/waveform', label: 'Waveform', min: 0, max: 7, default: 7,
      choices: ['Sine', 'Saw', 'Square', 'Triangle', 'Blend', 'Noise', 'Pulse', 'Supersaw'] },
    pitch: { path: '/ui/space/pitch', label: 'Pitch · Hz', min: 55, max: 880, default: 110 },
    detune: { path: '/ui/space/detune', label: 'Detune · cents', min: 0, max: 100, default: 18 },
    spread: { path: '/ui/space/spread', label: 'Stereo spread', min: 0, max: 1, default: 0.7 },
    cutoff: { path: '/ui/space/cutoff', label: 'Cutoff · Hz', min: 80, max: 8000, default: 1200 },
    resonance: { path: '/ui/space/resonance', label: 'Resonance', min: 0.1, max: 1, default: 0.5 },
    drive: { path: '/ui/space/drive', label: 'Drive', min: 0, max: 10, default: 1.4 },
    level: { path: '/ui/space/level', label: 'Output', min: 0, max: 0.3, default: 0.08 },
  };

  // Audio interface and composition — an eight-voice drone, generated in Rust.
  const graph = createGraphWorkspace().setInputSource('none');
  const voice = graph.add(extendedOscillator.type, { id: 4 });
  const filter = graph.add(svf.type, { id: 5 });
  graph.registerInstance('/ui/space/voice', voice);
  graph.registerInstance('/ui/space/filter', filter);
  for (const name of ['waveform', 'detune', 'spread', 'drive', 'level']) {
    const parameter = { detune: 'detuneCents', spread: 'stereoSpread' }[name] ?? name;
    voice.parameter(parameter).expose(controls[name]);
  }
  voice.parameter('frequency').expose(controls.pitch);
  voice.parameter('unisonVoices').set(8);
  filter.parameter('cutoff').expose(controls.cutoff);
  filter.parameter('resonance').expose(controls.resonance);
  graph.connect(voice.output('out'), filter.input('audio'));
  graph.connect(filter.output('out'), graph.output.input('in'));
  applyStudioGraph(graph, studioGraph);

  for (const definition of studioParameters) {
    const node = graph.findInstance(definition.instance);
    node.parameter(definition.parameter).expose(definition);
  }

  // Inspector — automatic declaration order, before any authored layout is needed.
  const view = Object.values(controls).map(control => ({
    id: control.path, type: 'parameter', path: control.path, label: control.label,
    choices: control.choices, group: 'Orbit', style: { accent: '#a5c4c6', background: '#202830', text: '#dbe4ec' },
  }));
  for (const definition of studioParameters) {
    view.push({ id: definition.path, type: 'parameter', path: definition.path,
      label: definition.label, choices: definition.choices, group: 'Orbit',
      style: { accent: '#a5c4c6', background: '#202830', text: '#dbe4ec' } });
  }

  // Plugin face — separate presentation code and layout, saved with this project.
  const webView = { version: 1, role: 'instrument', height: 520,
    dependencies: { three: '0.184.0', '@manifold/ui-web/control-panel': '0.1.0' },
    layout: presentationLayout, source: webViewSource };
  return { graph, view, webView, editorGraph: studioGraph };
}

// The view explicitly imports the graphics library and Manifold's existing kit.
// Its API reads the same named controls; there is no audio implementation here.
const webViewSource = `import * as THREE from 'three';
import { mountControlPanel } from '@manifold/ui-web/control-panel';

export default function createView() {
  return {
    mount(element, api) {
      element.innerHTML = \`
        <div class="orbit-face">
          <style>
            .orbit-face{height:100%;background:oklch(18% .009 240);color:oklch(91% .01 230);font-family:system-ui,sans-serif;display:flex;flex-direction:column;overflow:hidden;container-type:inline-size}
            .orbit-face *{box-sizing:border-box}
            .orbit-head{display:flex;align-items:center;justify-content:space-between;padding:18px 24px 14px;border-bottom:1px solid #2b333d;flex-shrink:0}
            .orbit-brand{display:flex;align-items:baseline;gap:12px}.orbit-name{font-size:23px;font-weight:550;letter-spacing:.19em;line-height:1.2}.orbit-sub{font-size:10px;color:#8b9ba9;letter-spacing:.04em}.orbit-mark{font-size:10px;letter-spacing:.14em;color:#8b9ba9}
            .orbit-scene{flex:1;min-height:90px;position:relative;background:#11171e}
            .orbit-scene canvas{width:100%;height:100%;display:block;touch-action:none;cursor:grab}
            .orbit-scene[data-held=true] canvas{cursor:grabbing}
            .orbit-note{position:absolute;left:24px;top:20px;pointer-events:none}.orbit-note strong{display:block;font-size:44px;font-weight:350;letter-spacing:-.04em;line-height:1}.orbit-note small{display:block;margin-top:8px;color:#92a9bb;font-size:11px;font-variant-numeric:tabular-nums}
            .orbit-axis{position:absolute;left:24px;bottom:14px;font-size:10px;color:#8597a8;pointer-events:none}
            .orbit-coordinate{position:absolute;right:24px;bottom:14px;font-size:10px;color:#93b6c7;pointer-events:none;font-variant-numeric:tabular-nums}
            .orbit-panel{height:250px;flex-shrink:0;border-top:1px solid #2b333d;background:oklch(21% .009 240);position:relative}
            .orbit-row{position:absolute;left:4%;right:4%;font-size:9px;letter-spacing:.16em;color:#7f92a4;pointer-events:none;border-top:1px solid #303a44;padding-top:5px;line-height:1}
            .orbit-row-source{top:4%;border:0;padding-top:0}.orbit-row-filter{top:34%}.orbit-row-space{top:62%}
            .orbit-foot{height:30px;display:flex;align-items:center;justify-content:space-between;padding:0 24px;font-size:9px;letter-spacing:.06em;color:#8999a8;border-top:1px solid #2b333d;flex-shrink:0}
            .orbit-output{display:flex;align-items:center;gap:10px;font-variant-numeric:tabular-nums}.orbit-meter{width:50px;height:3px;background:#303d49;overflow:hidden}.orbit-meter i{display:block;height:100%;background:#a5c4c6;transform-origin:left;transform:scaleX(0);transition:transform 120ms ease-out}
            .orbit-face [role=slider] canvas{width:100%;height:100%;display:block}.orbit-face [role=slider]{border-radius:4px;transition:background 120ms ease-out;cursor:ew-resize}
            .orbit-face [role=slider]:hover{background:rgba(165,196,198,.04)}.orbit-face [role=slider]:focus-visible,.orbit-face select:focus-visible,.orbit-scene canvas:focus-visible{outline:2px solid #a5c4c6;outline-offset:3px}
            .orbit-face select:hover{border-color:#93acbc!important}.orbit-face select{cursor:pointer}
            .orbit-help{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
            .orbit-compact .orbit-head{padding:12px 20px 10px}.orbit-compact .orbit-name{font-size:20px}.orbit-compact .orbit-note{top:12px;left:20px}.orbit-compact .orbit-note strong{font-size:32px}.orbit-compact .orbit-panel{height:216px}.orbit-compact .orbit-scene{min-height:60px}.orbit-compact .orbit-axis{left:20px;bottom:10px}.orbit-compact .orbit-coordinate{right:20px;bottom:10px}.orbit-compact .orbit-foot{height:25px;padding:0 20px}.orbit-compact .orbit-note small{margin-top:5px}
            @container(max-width:430px){.orbit-sub,.orbit-mark{display:none}.orbit-coordinate{display:none}.orbit-head{padding-left:16px;padding-right:16px}.orbit-note,.orbit-compact .orbit-note{left:16px}.orbit-axis,.orbit-compact .orbit-axis{left:16px}}
            @media(prefers-reduced-motion:reduce){.orbit-meter i,.orbit-face [role=slider]{transition:none}}
          </style>
          <div class="orbit-head"><div class="orbit-brand"><span class="orbit-name">ORBIT</span><span class="orbit-sub">Unison synthesizer</span></div><span class="orbit-mark">MANIFOLD</span></div>
          <div class="orbit-scene"><div class="orbit-note"><strong></strong><small></small></div><span class="orbit-axis">Drag pitch + brightness · Shift for fine</span><span class="orbit-coordinate"></span><span class="orbit-help" id="orbit-pad-help">Left and right arrows change pitch. Up and down arrows change brightness. Hold Shift for fine adjustment.</span></div>
          <div class="orbit-panel"></div>
          <div class="orbit-foot"><span class="orbit-voices"></span><span class="orbit-output"><span class="orbit-meter" aria-hidden="true"><i></i></span><span class="orbit-energy">−∞ dB</span></span></div>
        </div>\`;
      const face = element.querySelector('.orbit-face');
      const surface = face.querySelector('.orbit-scene');
      const controlElement = face.querySelector('.orbit-panel');
      const pitchPath = '/ui/space/pitch', cutoffPath = '/ui/space/cutoff';
      const number = value => value.toFixed(value < 100 ? 1 : 0);
      const panel = mountControlPanel(controlElement, api, {
        height: 44, fontSize: 11, showChoiceLabels: true, accent: '#a5c4c6', background: '#28343e', text: '#dbe4ec',
        scales: { [pitchPath]: 'log', [cutoffPath]: 'log' },
        formatters: {
          [pitchPath]: value => number(value) + ' Hz',
          [cutoffPath]: value => value >= 1000 ? (value / 1000).toFixed(2) + ' kHz' : Math.round(value) + ' Hz',
          '/ui/space/detune': value => number(value) + ' ct',
          '/ui/space/spread': value => Math.round(value * 100) + '%',
          '/ui/space/drive': value => value.toFixed(2),
          '/ui/space/level': value => value > 0 ? (20 * Math.log10(value)).toFixed(1) + ' dB' : '−∞ dB',
        },
      });
      for (const [name, title] of [['source', 'SOURCE'], ['filter', 'FILTER'], ['space', 'SPACE / OUTPUT']]) {
        const label = document.createElement('div');
        label.className = 'orbit-row orbit-row-' + name; label.textContent = title; controlElement.append(label);
      }

      // The sculpture shows actual pitch, brightness, unison and output energy.
      const scene = new THREE.Scene(); scene.background = new THREE.Color('#11171e');
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50); camera.position.set(0, 0, 4.8);
      const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      const canvas = renderer.domElement; canvas.tabIndex = 0;
      canvas.setAttribute('role', 'group'); canvas.setAttribute('aria-label', 'Orbit pitch and brightness pad');
      const help = face.querySelector('.orbit-help'); help.id = 'orbit-pad-' + crypto.randomUUID();
      canvas.setAttribute('aria-describedby', help.id); surface.prepend(canvas);
      scene.add(new THREE.HemisphereLight('#d1e6ed', '#19232e', 2.2));
      const light = new THREE.DirectionalLight('#b2d6db', 4); light.position.set(2, 3, 4); scene.add(light);
      const rim = new THREE.DirectionalLight('#748fae', 3); rim.position.set(-3, 1, -2); scene.add(rim);
      const body = new THREE.Group(); body.position.x = .5; scene.add(body);
      const resources = [], keep = resource => { resources.push(resource); return resource; };
      const core = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(.49, 1)),
        keep(new THREE.MeshStandardMaterial({ color: '#719ba8', roughness: .28, metalness: .8, flatShading: true })));
      body.add(core);
      const shell = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(.55, 1)),
        keep(new THREE.MeshBasicMaterial({ color: '#8cabb9', wireframe: true, transparent: true, opacity: .26 })));
      body.add(shell);
      const rings = [];
      for (let index = 0; index < 8; index++) {
        const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(.77 + index * .065, .0045 + index * .0007, 6, 120)),
          keep(new THREE.MeshStandardMaterial({ color: index % 2 ? '#9aafbb' : '#a5c4c6', roughness: .35, metalness: .65 })));
        ring.rotation.set(index * .24, index * .16, 0); body.add(ring); rings.push(ring);
      }
      const note = face.querySelector('.orbit-note strong'), hz = face.querySelector('.orbit-note small');
      const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
      const motion = matchMedia('(prefers-reduced-motion: reduce)');
      let targetY = 0, targetZ = 0;
      function update() {
        const pitch = api.value(pitchPath), cutoff = api.value(cutoffPath);
        const voices = api.value('/ui/space/voices') ?? 8;
        const midi = Math.round(69 + 12 * Math.log2(pitch / 440));
        note.textContent = names[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
        hz.textContent = pitch.toFixed(1) + ' Hz';
        face.querySelector('.orbit-coordinate').textContent = Math.round(cutoff) + ' Hz brightness';
        face.querySelector('.orbit-voices').textContent = voices + ' voices';
        targetY = Math.log(cutoff / 80) / Math.log(100) * 1.8;
        targetZ = (Math.log(pitch / 55) / Math.log(16) - .5) * .8;
        rings.forEach((ring, index) => { ring.visible = index < voices; ring.rotation.x = index * (.08 + api.value('/ui/space/detune') / 150); });
        canvas.dataset.pitch = String(pitch); canvas.dataset.cutoff = String(cutoff);
      }

      // Relative gestures preserve the sound on contact. All edits use live bindings.
      let held = null, anchor;
      function move(event) {
        if (event.pointerId !== held) return;
        const rect = canvas.getBoundingClientRect(), fine = event.shiftKey ? .15 : 1;
        const dx = (event.clientX - anchor.x) / rect.width * fine;
        const dy = (anchor.y - event.clientY) / rect.height * fine;
        api.set(pitchPath, Math.max(55, Math.min(880, anchor.pitch * Math.pow(16, dx)))).catch(console.error);
        api.set(cutoffPath, Math.max(80, Math.min(8000, anchor.cutoff * Math.pow(100, dy)))).catch(console.error);
      }
      const down = event => {
        if (held !== null || event.button !== 0) return;
        held = event.pointerId; anchor = {x:event.clientX,y:event.clientY,pitch:api.value(pitchPath),cutoff:api.value(cutoffPath)};
        canvas.focus({preventScroll:true}); canvas.setPointerCapture(held); surface.dataset.held = 'true';
      };
      const cancel = () => { held = null; surface.dataset.held = 'false'; };
      const up = event => { if (event.pointerId !== held) return; move(event); if(canvas.hasPointerCapture(held))canvas.releasePointerCapture(held); cancel(); };
      const key = event => {
        const direction = {ArrowRight:1,ArrowLeft:-1,ArrowUp:1,ArrowDown:-1}[event.key];
        if (!direction) return; event.preventDefault();
        const path = event.key === 'ArrowRight' || event.key === 'ArrowLeft' ? pitchPath : cutoffPath;
        const min = path === pitchPath ? 55 : 80, max = path === pitchPath ? 880 : 8000;
        const value = api.value(path) * Math.pow(2, direction / (event.shiftKey ? 120 : 12));
        api.set(path, Math.max(min, Math.min(max, value))).catch(console.error);
      };
      const events = {pointerdown:down,pointermove:move,pointerup:up,pointercancel:cancel,lostpointercapture:cancel,keydown:key};
      for (const [name, handler] of Object.entries(events)) canvas.addEventListener(name, handler);
      const resize = new ResizeObserver(() => {
        face.classList.toggle('orbit-compact', element.clientHeight < 470);
        camera.aspect = surface.clientWidth / Math.max(1, surface.clientHeight);
        camera.position.z = Math.max(4.8, 1.7 / (Math.tan(camera.fov * Math.PI / 360) * camera.aspect));
        body.position.x = Math.min(.55, Math.tan(camera.fov * Math.PI / 360) * camera.position.z * camera.aspect * .18);
        camera.updateProjectionMatrix();
        renderer.setSize(surface.clientWidth, surface.clientHeight, false);
      });
      resize.observe(element); resize.observe(surface);
      const meter = face.querySelector('.orbit-meter i'), energy = face.querySelector('.orbit-energy');
      renderer.setAnimationLoop(() => {
        const rms = api.analysis()?.rms ?? 0, db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
        const easing = motion.matches ? 1 : .18;
        body.rotation.y += (targetY - body.rotation.y) * easing;
        body.rotation.z += (targetZ - body.rotation.z) * easing;
        core.scale.setScalar(motion.matches ? 1 : 1 + Math.min(.08, rms));
        energy.textContent = Number.isFinite(db) ? db.toFixed(1) + ' dB' : '−∞ dB';
        meter.style.transform = 'scaleX(' + Math.max(0, Math.min(1, (db + 60) / 60)) + ')';
        renderer.render(scene, camera);
      });
      return { update, dispose() {
        panel.dispose(); resize.disconnect(); renderer.setAnimationLoop(null);
        for (const [name, handler] of Object.entries(events)) canvas.removeEventListener(name, handler);
        resources.forEach(resource => resource.dispose()); renderer.dispose(); renderer.forceContextLoss(); face.remove();
      } };
    },
  };
}
`;
