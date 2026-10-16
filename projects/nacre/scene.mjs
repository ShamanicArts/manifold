// The physical face. Graphics consume telemetry; named endpoints own the sound.
import * as THREE from 'three';
import { mountControlPanel, placeProjectedPanel } from '@manifold/ui-web/control-panel';
import { imagePixelPoint } from '@manifold/ui-web/diegetic';

import { paths, panelLayout } from './controls.mjs';

export default function nacreScene() {
  return {
    mount(element, api) {
      element.innerHTML = `<div class="nacre-face">
        <style>
          .nacre-face{height:100%;position:relative;overflow:hidden;background:#15101c;color:#e9dcea;font-family:system-ui,sans-serif;isolation:isolate}
          .nacre-face *{box-sizing:border-box}.nacre-face>.nacre-render{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:crosshair}
          .nacre-console{position:absolute;left:0;top:0;transform-origin:0 0;width:460px;height:240px;display:flex;flex-direction:column;padding:12px;gap:8px;background:linear-gradient(135deg,#2d2034f5,#17121dfb);border:1px solid #9c7185;border-radius:12px 12px 24px 12px;box-shadow:inset 0 1px 1px #edb9c958,inset 0 0 18px #0e091c,0 2px 2px #090817;color:#efdeef}
          .nacre-console header{padding:0;border:0;background:none;min-height:12px;height:12px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;font-size:9px;letter-spacing:.14em;color:#d9bdae}.nacre-insignia{display:flex;align-items:center;gap:5px}.nacre-sigil{width:18px;height:18px;object-fit:contain;filter:drop-shadow(0 0 4px #a7e9fa80)}.nacre-status{display:flex;align-items:center;gap:5px;font-size:8px;letter-spacing:.1em}.nacre-status i{width:4px;height:4px;background:#f7d277;border-radius:50%;box-shadow:0 0 6px #ff9b84}.nacre-status[data-live=false] i{background:#56666c;box-shadow:none}
          .nacre-face:is([data-hover=heart],[data-hover=halo],[data-hover=crab],[data-held=heart],[data-held=halo],[data-held=crab]) .nacre-insignia span{display:none}
          .nacre-presets{position:absolute;right:12px;top:9px;width:210px;display:flex;gap:4px}.nacre-face button{font:9px/1.2 system-ui;letter-spacing:.06em;background:linear-gradient(#403146,#241a32);color:#e9c5dc;border:1px solid #8e647f;border-radius:3px;padding:8px 4px;cursor:pointer;box-shadow:inset 0 1px 0 #9b7487,0 2px 2px #090e12;transition:background 120ms,color 120ms}
          .nacre-face button:hover{color:#e1f6ef;border-color:#86cbb9}.nacre-face button[aria-pressed=true]{color:#fff1be;border-color:#e2bd72;background:linear-gradient(#665039,#392339);box-shadow:inset 0 0 10px #4c9a8b22,0 0 8px #93dcbb10}.nacre-presets button[data-preset="0"]{color:#d7e8f3}.nacre-presets button[data-preset="1"]{color:#ccadff}.nacre-presets button[data-preset="2"]{color:#ffab87}.nacre-presets button[data-preset="3"]{color:#c3da9f}.nacre-presets button{flex:1;padding:7px 2px;font-size:8px}.nacre-face button:focus-visible,.nacre-face [role=slider]:focus-visible,.nacre-render:focus-visible{outline:2px solid #b5f6df;outline-offset:2px}
          .nacre-console header{justify-content:flex-start;gap:8px;width:220px;font-size:8px;white-space:nowrap}.nacre-controls{position:relative;flex:1;min-height:0!important;margin-top:8px}.nacre-controls canvas{width:100%;height:100%;display:block}.nacre-controls [role=slider]{border-radius:3px;cursor:ew-resize;box-shadow:inset 0 0 0 1px #48636744}
          .nacre-actions{position:absolute;bottom:9px;right:12px;width:205px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px}.nacre-actions button{font-size:8px}.nacre-hold{color:#ffb6dc!important}.nacre-hold[aria-pressed=true]{color:#fff!important;background:linear-gradient(#912e68,#4b205a)!important;box-shadow:0 0 12px #fc59c799!important}.nacre-readout{display:flex;align-items:center;justify-content:space-between;font-size:9px;font-variant-numeric:tabular-nums;letter-spacing:.03em;color:#cbb1c7;border:0;width:195px;padding-top:4px}
          .nacre-spectrum{position:absolute;left:12px;bottom:34px;width:195px;height:12px;display:flex;align-items:flex-end;gap:2px;pointer-events:none}.nacre-spectrum i{flex:1;height:100%;background:#9deee3;transform-origin:bottom;transform:scaleY(.02);opacity:.8}
          .nacre-presets .nacre-atlas-toggle{flex:0 0 22px;color:#f7dcb2;border-color:#a89074}
          .nacre-atlas-panel{display:none;flex:1;min-height:0;margin-top:8px;padding-bottom:33px;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:5px}.nacre-face[data-deck=atlas] .nacre-controls{display:none}.nacre-face[data-deck=atlas] .nacre-atlas-panel{display:grid}.nacre-face[data-deck=atlas] .nacre-atlas-toggle{background:linear-gradient(#826345,#3c2736);color:#fff1d5}
          .nacre-atlas-card{min-width:0;display:flex;flex-direction:column;align-items:flex-start;text-align:left;justify-content:center;gap:4px;padding:6px 8px!important;background:linear-gradient(120deg,var(--material-glow),#1b1723 42%)!important;border:1px solid var(--material-color)!important;border-radius:5px!important;color:#f5eaf3!important}.nacre-atlas-card strong{font-size:9px;letter-spacing:.12em;color:var(--material-color)}.nacre-atlas-card span{font-size:8px;line-height:1.25;letter-spacing:0;color:#d2c4d4}.nacre-atlas-card[aria-pressed=true]{box-shadow:inset 0 0 0 1px var(--material-color),0 0 12px var(--material-glow)!important}

          .nacre-error{position:absolute;left:20px;bottom:40px;right:20px;font:11px system-ui;color:#efb2a6}.nacre-error:empty{display:none}
          .nacre-face[data-portrait=true] .nacre-console{width:420px;height:230px}.nacre-face[data-portrait=true] .nacre-presets{width:200px}.nacre-face[data-portrait=true] .nacre-status{font-size:7px}.nacre-face[data-portrait=true] .nacre-spectrum{display:none}.nacre-face[data-portrait=true] .nacre-actions{width:195px}.nacre-face[data-portrait=true] .nacre-readout{width:170px}
          @media(prefers-reduced-motion:reduce){.nacre-face button{transition:none}}
        </style>
        
        <section class="nacre-console" aria-label="Nacre physical control panel">
          <header><span class="nacre-insignia"><img class="nacre-sigil" hidden alt=""><span>SPECTRAL ENGINE</span></span><span class="nacre-status" data-live="false"><i></i><span>STANDBY</span></span></header>
          <div class="nacre-presets" aria-label="Spectral materials"><button data-preset="0">CHROME</button><button data-preset="1">PRISM</button><button data-preset="2">FRACTURE</button><button data-preset="3">VOID</button><button class="nacre-atlas-toggle" aria-label="Explore material presets" aria-pressed="false" title="Explore materials">✦</button></div>
          <div class="nacre-controls"></div>
          <div class="nacre-atlas-panel" aria-label="Material atlas"></div>
          <div class="nacre-spectrum" aria-label="Actual output spectrum"></div>
          <div class="nacre-actions"><button class="nacre-source">AUDITION</button><button class="nacre-hold" aria-label="Hold the spectral memory">HOLD</button><button class="nacre-active">ENGAGED</button></div>
          <div class="nacre-readout"><span class="nacre-mode">MODE 04 / 07</span><span class="nacre-level">−∞ dB</span></div>
        </section>
        <div class="nacre-error" role="status"></div>
      </div>`;
      const face = element.querySelector('.nacre-face');
      const consoleElement = face.querySelector('.nacre-console');
      api
        .assetUrl?.('/assets/nacre-sigil.svg')
        .then((url) => {
          const sigil = face.querySelector('.nacre-sigil');
          sigil.src = url;
          sigil.hidden = false;
        })
        .catch(() => {});
      const panelElement = face.querySelector('.nacre-controls');
      const errorElement = face.querySelector('.nacre-error');
      const spectrumElement = face.querySelector('.nacre-spectrum');
      const bars = Array.from({ length: 32 }, () => {
        const bar = document.createElement('i');
        spectrumElement.append(bar);
        return bar;
      });
      const reduced = matchMedia('(prefers-reduced-motion: reduce)');
      const hasPrism = Boolean(paths.prismEdge && paths.prismHeat);
      const crabXAxis = hasPrism ? 'prismEdge' : 'focus',
        crabYAxis = hasPrism ? 'prismHeat' : 'drive';
      const pathFor = (name) => paths[name] ?? '/' + name;
      const read = (name) => api.value(pathFor(name));
      const report = (error) => {
        errorElement.textContent = error.message;
      };
      const set = (name, value) => api.set(pathFor(name), value).catch(report);

      // Materials are musical presets, applied as one acknowledged parameter batch.
      const materials = [
        {
          name: 'CHROME',
          note: 'Cold mirror · close grain',
          color: '#c9e9f0',
          values: {
            focus: 2100,
            shift: 0,
            drive: 9,
            resonance: 0.38,
            mix: 0.3,
            afterimage: 0.08,
            grainSize: 110,
            scatter: 0.12,
            curve: 0,
            prismEdge: 6200,
            prismHeat: 4,
          },
        },
        {
          name: 'PRISM',
          note: 'Shifting colour · warm edge',
          color: '#cfa8ff',
          values: {
            focus: 2400,
            shift: 7,
            drive: 18,
            resonance: 0.58,
            mix: 0.64,
            afterimage: 0.22,
            grainSize: 85,
            scatter: 0.28,
            curve: 0,
            prismEdge: 4800,
            prismHeat: 8,
          },
        },
        {
          name: 'FRACTURE',
          note: 'Cut glass · torn spectrum',
          color: '#ffa486',
          values: {
            focus: 6300,
            shift: -7,
            drive: 27,
            resonance: 0.82,
            mix: 0.92,
            afterimage: 0.52,
            grainSize: 54,
            scatter: 0.67,
            curve: 4,
            prismEdge: 1900,
            prismHeat: 22,
          },
        },
        {
          name: 'VOID',
          note: 'Dark well · long memory',
          color: '#b6d6a4',
          values: {
            focus: 480,
            shift: -12,
            drive: 7,
            resonance: 0.72,
            mix: 0.72,
            afterimage: 0.75,
            grainSize: 180,
            scatter: 0.42,
            curve: 3,
            prismEdge: 740,
            prismHeat: 12,
          },
        },
        {
          name: 'VESPER',
          note: 'Hollow choir · slow glass',
          color: '#f1b3e1',
          values: {
            focus: 970,
            shift: 5,
            drive: 13,
            resonance: 0.91,
            mix: 0.82,
            afterimage: 0.9,
            grainSize: 220,
            scatter: 0.19,
            curve: 6,
            prismEdge: 3100,
            prismHeat: 15,
          },
        },
        {
          name: 'RADIANT',
          note: 'Bright splinters · short flash',
          color: '#f9d67e',
          values: {
            focus: 7800,
            shift: 11,
            drive: 31,
            resonance: 0.46,
            mix: 0.88,
            afterimage: 0.16,
            grainSize: 35,
            scatter: 0.86,
            curve: 4,
            prismEdge: 8700,
            prismHeat: 28,
          },
        },
      ];
      const atlas = face.querySelector('.nacre-atlas-panel');
      for (const [index, material] of materials.entries()) {
        const card = document.createElement('button');
        card.className = 'nacre-atlas-card';
        card.dataset.preset = String(index);
        card.style.setProperty('--material-color', material.color);
        card.style.setProperty('--material-glow', material.color + '33');
        const title = document.createElement('strong');
        title.textContent = material.name;
        const note = document.createElement('span');
        note.textContent = material.note;
        card.append(title, note);
        atlas.append(card);
      }
      for (const button of face.querySelectorAll('[data-preset]')) {
        button.onclick = () =>
          api
            .request({
              operation: 'parameter.batch',
              edits: Object.entries(materials[Number(button.dataset.preset)].values)
                .filter(([name]) => hasPrism || !name.startsWith('prism'))
                .map(([name, value]) => ({ path: pathFor(name), value })),
            })
            .catch(report);
      }
      const atlasToggle = face.querySelector('.nacre-atlas-toggle');
      atlasToggle.onclick = () => {
        const open = face.dataset.deck !== 'atlas';
        face.dataset.deck = open ? 'atlas' : 'controls';
        atlasToggle.setAttribute('aria-pressed', String(open));
      };
      const sourceButton = face.querySelector('.nacre-source'),
        activeButton = face.querySelector('.nacre-active'),
        holdButton = face.querySelector('.nacre-hold');
      sourceButton.disabled = true;
      sourceButton.title =
        'Audio supplied by the host; Studio test sources live in the Input graph';
      activeButton.onclick = () => set('active', read('active') > 0 ? -1 : 1);
      holdButton.onclick = () => set('hold', read('hold') >= 0.5 ? 0 : 1);
      let panel,
        portrait = false,
        panelSignature = '';
      function mountPanel() {
        panel?.dispose();
        panelSignature = JSON.stringify(panelLayout);
        const panelApi = {
          snapshot: api.snapshot,
          value: api.value,
          set: api.set,
          subscribe: api.subscribe,
          layout: panelLayout,
        };
        panel = mountControlPanel(panelElement, panelApi, {
          variant: portrait ? 'compact' : 'default',
          height: portrait ? 27 : 27,
          fontSize: 10,
          accent: '#f295d8',
          background: '#402b6c',
          text: '#f9edf8',
          scales: { [paths.focus]: 'log', ...(hasPrism ? { [paths.prismEdge]: 'log' } : {}) },
          formatters: {
            [paths.focus]: (value) =>
              value >= 1000 ? (value / 1000).toFixed(2) + 'k' : Math.round(value) + 'Hz',
            [paths.shift]: (value) => (value > 0 ? '+' : '') + value.toFixed(1) + 'st',
            [paths.drive]: (value) => value.toFixed(1) + 'dB',
            [paths.resonance]: (value) => Math.round(value * 100) + '%',
            [paths.mix]: (value) => Math.round((value + 1) * 50) + '%',
            [paths.afterimage]: (value) => Math.round(value * 100) + '%',
            [paths.grainSize]: (value) => Math.round(value) + 'ms',
            [paths.scatter]: (value) => Math.round(value * 100) + '%',
            ...(hasPrism
              ? {
                  [paths.prismEdge]: (value) =>
                    value >= 1000 ? (value / 1000).toFixed(2) + 'k' : Math.round(value) + 'Hz',
                  [paths.prismHeat]: (value) => value.toFixed(1) + 'dB',
                }
              : {}),
          },
        });
        panelElement.style.minHeight = '0';
      }
      mountPanel();

      // A real lit, bevelled enclosure. The environment is generated here and
      // packaged with the face: no CDN images or external asset lifetime.
      const resources = new Set(),
        keep = (value) => {
          resources.add(value);
          return value;
        };
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      const canvas = renderer.domElement;
      canvas.className = 'nacre-render';
      canvas.tabIndex = 0;
      canvas.setAttribute('role', 'group');
      canvas.setAttribute(
        'aria-label',
        'Nacre spectral field: drag the portal for focus and displacement, the crystal hand for grain and scatter, its outer halo for transmutation and afterimage, or the shell crab mouth for prism edge and heat; touch the relic eye or press H to hold memory',
      );
      face.prepend(canvas);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#15101c');
      const camera = new THREE.OrthographicCamera(-3.4, 3.4, 2.35, -2.35, 0.1, 40);
      const envScene = new THREE.Scene();
      envScene.background = new THREE.Color('#090911');
      const envBox = new THREE.Mesh(
        new THREE.BoxGeometry(30, 30, 30),
        new THREE.MeshBasicMaterial({ color: '#10101b', side: THREE.BackSide }),
      );
      envScene.add(envBox);
      for (const [x, y, z, w, h, color, intensity] of [
        [-5, 6, 2, 3, 9, '#e8f4f2', 5],
        [5, 2, 4, 1.4, 10, '#ff92bc', 4],
        [0, 7, -5, 8, 2, '#ffe1a2', 6],
        [-2, -4, 5, 8, 0.6, '#46e9d7', 3],
        [4, -4, -3, 3, 6, '#8381fc', 3],
      ]) {
        const lightCard = new THREE.Mesh(
          new THREE.PlaneGeometry(w, h),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(color).multiplyScalar(intensity),
            side: THREE.DoubleSide,
          }),
        );
        lightCard.position.set(x, y, z);
        lightCard.lookAt(0, 0, 0);
        envScene.add(lightCard);
      }
      // Studio mounts a candidate surface before egui places its pane. Baking
      // the reflection environment at that point produced a black map. Prepare
      // it on the first visible frame, after the canvas has its real size.
      let environmentReady = false;
      function releaseEnvironmentScene() {
        envScene.traverse((object) => {
          object.geometry?.dispose();
          object.material?.dispose();
        });
        envScene.clear();
      }
      function prepareEnvironment() {
        const pmrem = new THREE.PMREMGenerator(renderer);
        const environment = keep(pmrem.fromScene(envScene, 0.035));
        scene.environment = environment.texture;
        pmrem.dispose();
        releaseEnvironmentScene();
        environmentReady = true;
        face.dataset.environmentReady = 'true';
      }
      scene.add(new THREE.HemisphereLight('#c5e9ed', '#342450', 1.3));
      const key = new THREE.DirectionalLight('#d8f0ee', 4.2);
      key.position.set(-3, 6, 7);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.left = -5;
      key.shadow.camera.right = 5;
      key.shadow.camera.top = 5;
      key.shadow.camera.bottom = -5;
      key.shadow.normalBias = 0.03;
      scene.add(key);
      const edge = new THREE.DirectionalLight('#cd79ff', 3.6);
      edge.position.set(5, -1, 2);
      scene.add(edge);
      const device = new THREE.Group();
      scene.add(device);
      const chassis = keep(
        new THREE.MeshPhysicalMaterial({
          color: '#52273e',
          metalness: 0.82,
          roughness: 0.22,
          iridescence: 0.48,
          iridescenceThicknessRange: [120, 400],
          clearcoat: 0.6,
          clearcoatRoughness: 0.28,
        }),
      );
      const chrome = keep(
        new THREE.MeshPhysicalMaterial({
          color: '#d6e4e7',
          metalness: 1,
          roughness: 0.12,
          clearcoat: 1,
          clearcoatRoughness: 0.08,
        }),
      );
      const black = keep(
        new THREE.MeshStandardMaterial({ color: '#231a2d', metalness: 0.68, roughness: 0.23 }),
      );
      const ceramic = keep(
        new THREE.MeshPhysicalMaterial({
          color: '#b79e8c',
          metalness: 0.85,
          roughness: 0.18,
          iridescence: 0.4,
          iridescenceIOR: 1.3,
          iridescenceThicknessRange: [160, 420],
        }),
      );
      const gold = keep(
        new THREE.MeshPhysicalMaterial({
          color: '#dfbb72',
          metalness: 1,
          roughness: 0.17,
          clearcoat: 0.65,
        }),
      );
      const enamel = keep(
        new THREE.MeshPhysicalMaterial({
          color: '#291d38',
          metalness: 0.52,
          roughness: 0.18,
          clearcoat: 1,
          clearcoatRoughness: 0.1,
          iridescence: 0.45,
          iridescenceThicknessRange: [180, 460],
        }),
      );
      const porcelain = keep(
        new THREE.MeshPhysicalMaterial({
          color: '#e2bec9',
          metalness: 0.45,
          roughness: 0.2,
          clearcoat: 1,
        }),
      );
      const cableColors = [
        '#ef7955',
        '#e5b75b',
        '#a9d275',
        '#61d9ce',
        '#709ef4',
        '#b08cea',
        '#ef8eca',
      ];
      const cableUniforms = { time: { value: 0 }, energy: { value: 0 } };
      const cableLight = keep(
        new THREE.MeshPhysicalMaterial({
          color: '#e9e6ef',
          vertexColors: true,
          metalness: 0.65,
          roughness: 0.18,
          clearcoat: 1,
          iridescence: 0.5,
          iridescenceThicknessRange: [140, 450],
        }),
      );
      cableLight.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, cableUniforms);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec2 wireUv;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nwireUv=uv;');
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            '#include <common>\nvarying vec2 wireUv;uniform float time;uniform float energy;',
          )
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
          float travel=wireUv.x*1.35-time*.14;
          vec3 movingSpectrum=.5+.5*cos(6.2831853*(travel+vec3(0.,.33,.67)));
          diffuseColor.rgb=mix(diffuseColor.rgb,movingSpectrum,.15+energy*.42);
        `,
          )
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
          float flow=pow(.5+.5*sin(wireUv.x*35.-time*2.),5.);
          totalEmissiveRadiance+=diffuseColor.rgb*(.06+flow*energy*.65);
        `,
          );
      };
      const socketLight = keep(
        new THREE.MeshBasicMaterial({
          color: '#8ceee7',
          transparent: true,
          opacity: 0.12,
          depthWrite: false,
        }),
      );
      let handLayout;
      let relicLayout = { width: 1.19, height: (1.19 * 479) / 330, x: 0, y: 0 };
      let paneW = 6.8,
        paneH = 4.7;
      // Fine machining marks catch grazing light without an image dependency.
      const brushedCanvas = document.createElement('canvas');
      brushedCanvas.width = 512;
      brushedCanvas.height = 512;
      const brushedPen = brushedCanvas.getContext('2d');
      brushedPen.fillStyle = '#808080';
      brushedPen.fillRect(0, 0, 512, 512);
      for (let row = 0; row < 512; row++) {
        const grey = 116 + ((row * 37) % 29);
        brushedPen.strokeStyle = 'rgb(' + grey + ',' + grey + ',' + grey + ')';
        brushedPen.beginPath();
        brushedPen.moveTo(0, row);
        brushedPen.lineTo(512, row);
        brushedPen.stroke();
      }
      const brushed = keep(new THREE.CanvasTexture(brushedCanvas));
      brushed.wrapS = brushed.wrapT = THREE.RepeatWrapping;
      brushed.repeat.set(3, 3);
      chassis.bumpMap = brushed;
      chassis.bumpScale = 0.004;
      chrome.bumpMap = brushed;
      chrome.bumpScale = 0.0008;
      function roundShape(w, h, r) {
        const shape = new THREE.Shape();
        const x = -w / 2,
          y = -h / 2;
        shape.moveTo(x + r, y);
        shape.lineTo(x + w - r, y);
        shape.quadraticCurveTo(x + w, y, x + w, y + r);
        shape.lineTo(x + w, y + h - r);
        shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        shape.lineTo(x + r, y + h);
        shape.quadraticCurveTo(x, y + h, x, y + h - r);
        shape.lineTo(x, y + r);
        shape.quadraticCurveTo(x, y, x + r, y);
        return shape;
      }
      function block(w, h, depth, r, material, x, y, z) {
        const geometry = keep(
          new THREE.ExtrudeGeometry(roundShape(w, h, r), {
            depth,
            bevelEnabled: true,
            bevelSegments: 3,
            steps: 1,
            bevelSize: 0.045,
            bevelThickness: 0.045,
            curveSegments: 14,
          }),
        );
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.castShadow = mesh.receiveShadow = true;
        device.add(mesh);
        return mesh;
      }
      let assembly = new THREE.Group();
      device.add(assembly);
      let assemblyResources = [];
      const chamber = new THREE.Group();
      device.add(chamber);
      const spectralCrystal = keep(
        new THREE.MeshPhysicalMaterial({
          color: '#b6becb',
          metalness: 1,
          roughness: 0.07,
          iridescence: 1,
          iridescenceIOR: 1.7,
          iridescenceThicknessRange: [90, 740],
          clearcoat: 1,
        }),
      );
      let width = 1,
        height = 1,
        panelWorld,
        frame = 0,
        previous = performance.now(),
        energy = 0,
        peak = 0,
        phase = 0,
        disposed = false;
      let held = null,
        hoverKind = null,
        fieldTarget = null,
        fieldImpulse = 0,
        bounds;
      let previewHeart = null,
        previewHalo = null,
        previewCrab = null,
        gesturePending = null,
        gestureBusy = false,
        cursorX = 0.5,
        cursorAt = -Infinity,
        cursorPresent = false;
      const contact = new THREE.Vector2();
      const raycaster = new THREE.Raycaster(),
        pointer = new THREE.Vector2();
      const fieldPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.2),
        hit = new THREE.Vector3();
      function pick(event) {
        const box = canvas.getBoundingClientRect();
        pointer.set(
          ((event.clientX - box.left) / box.width) * 2 - 1,
          (-(event.clientY - box.top) / box.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);
        if (!raycaster.ray.intersectPlane(fieldPlane, hit)) return null;
        const local = hit.clone().sub(chamber.position).divideScalar(chamber.scale.x);
        return local.x * local.x + local.y * local.y < 2.35 ? local : null;
      }
      // Targets belong to their graph objects, including image alpha hit tests.
      const controlTargets = new Map();
      function touchesControl(name, event) {
        const target = controlTargets.get(name);
        if (!target?.ready()) return false;
        const box = canvas.getBoundingClientRect();
        pointer.set(
          ((event.clientX - box.left) / box.width) * 2 - 1,
          (-(event.clientY - box.top) / box.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);
        return target.hitTest
          ? target.hitTest(raycaster)
          : raycaster.intersectObject(target.object, false).length > 0;
      }
      const touchesEye = (event) => touchesControl('eye', event);
      const touchesHeart = (event) => touchesControl('heart', event);
      const touchesHalo = (event) => touchesControl('halo', event);
      const touchesCrab = (event) => touchesControl('crab', event);
      function beginCrab(event) {
        canvas.setPointerCapture(event.pointerId);
        canvas.focus({ preventScroll: true });
        hoverKind = 'crab';
        held = {
          id: event.pointerId,
          kind: 'crab',
          x: event.clientX,
          y: event.clientY,
          edge: read(crabXAxis),
          heat: read(crabYAxis),
          fine: event.shiftKey,
        };
        previewCrab = { edge: held.edge, heat: held.heat };
        face.dataset.held = 'crab';
      }
      face.addEventListener('pointermove', (event) => {
        const box = face.getBoundingClientRect();
        cursorX = (event.clientX - box.left) / box.width;
        cursorAt = performance.now();
      });
      canvas.onpointerdown = (event) => {
        if (touchesEye(event)) {
          canvas.focus({ preventScroll: true });
          set('hold', read('hold') >= 0.5 ? 0 : 1);
          face.dataset.eyeGesture = 'hold';
          return;
        }
        if (touchesHalo(event)) {
          canvas.setPointerCapture(event.pointerId);
          canvas.focus({ preventScroll: true });
          hoverKind = 'halo';
          held = {
            id: event.pointerId,
            kind: 'halo',
            x: event.clientX,
            y: event.clientY,
            mix: read('mix'),
            afterimage: read('afterimage'),
            fine: event.shiftKey,
          };
          previewHalo = { mix: held.mix, afterimage: held.afterimage };
          face.dataset.held = 'halo';
          return;
        }
        if (touchesHeart(event)) {
          canvas.setPointerCapture(event.pointerId);
          canvas.focus({ preventScroll: true });
          hoverKind = 'heart';
          held = {
            id: event.pointerId,
            kind: 'heart',
            x: event.clientX,
            y: event.clientY,
            grainSize: read('grainSize'),
            scatter: read('scatter'),
            fine: event.shiftKey,
          };
          previewHeart = { scatter: held.scatter, grainSize: held.grainSize };
          face.dataset.held = 'heart';
          return;
        }
        if (touchesCrab(event)) {
          beginCrab(event);
          return;
        }
        const point = pick(event);
        if (!point) return;
        canvas.setPointerCapture(event.pointerId);
        canvas.focus({ preventScroll: true });
        contact.set(point.x, point.y);
        held = {
          id: event.pointerId,
          kind: 'field',
          x: event.clientX,
          y: event.clientY,
          focus: read('focus'),
          shift: read('shift'),
          fine: event.shiftKey,
        };
        fieldImpulse = 0.8;
        face.dataset.held = 'field';
      };
      async function publishGesture(edits) {
        gesturePending = edits;
        if (gestureBusy) return;
        gestureBusy = true;
        try {
          while (gesturePending) {
            const next = gesturePending;
            gesturePending = null;
            await api.setBatch(next);
          }
        } catch (error) {
          gesturePending = null;
          report(error);
        } finally {
          gestureBusy = false;
          previewHeart = null;
          previewHalo = null;
          previewCrab = null;
        }
      }
      function applyFieldTarget() {
        if (!held || !fieldTarget) return;
        const point = fieldTarget;
        fieldTarget = null;
        const sensitivity = held.fine ? 0.12 : 1;
        if (held.kind === 'heart') {
          previewHeart = {
            scatter: THREE.MathUtils.clamp(
              held.scatter + ((point.x - held.x) / 240) * sensitivity,
              0,
              1,
            ),
            grainSize: THREE.MathUtils.clamp(
              held.grainSize - (point.y - held.y) * 0.65 * sensitivity,
              20,
              250,
            ),
          };
          publishGesture([
            { path: paths.scatter, value: previewHeart.scatter },
            { path: paths.grainSize, value: previewHeart.grainSize },
          ]);
          return;
        }
        if (held.kind === 'halo') {
          previewHalo = {
            mix: THREE.MathUtils.clamp(held.mix + ((point.x - held.x) / 170) * sensitivity, -1, 1),
            afterimage: THREE.MathUtils.clamp(
              held.afterimage - ((point.y - held.y) / 210) * sensitivity,
              0,
              1,
            ),
          };
          publishGesture([
            { path: paths.mix, value: previewHalo.mix },
            { path: paths.afterimage, value: previewHalo.afterimage },
          ]);
          return;
        }
        if (held.kind === 'crab') {
          previewCrab = {
            edge: THREE.MathUtils.clamp(
              held.edge * Math.exp(((point.x - held.x) / 180) * sensitivity),
              hasPrism ? 100 : 160,
              hasPrism ? 12000 : 10000,
            ),
            heat: THREE.MathUtils.clamp(held.heat - (point.y - held.y) * 0.18 * sensitivity, 0, 40),
          };
          publishGesture([
            { path: pathFor(crabXAxis), value: previewCrab.edge },
            { path: pathFor(crabYAxis), value: previewCrab.heat },
          ]);
          return;
        }
        const local = pick({ clientX: point.x, clientY: point.y });
        if (local) contact.set(local.x, local.y);
        const dx = (point.x - held.x) / Math.max(200, bounds.width),
          dy = (point.y - held.y) / Math.max(200, bounds.height);
        api
          .setBatch([
            {
              path: paths.shift,
              value: THREE.MathUtils.clamp(held.shift + dx * 24 * sensitivity, -12, 12),
            },
            {
              path: paths.focus,
              value: THREE.MathUtils.clamp(
                held.focus * Math.exp(-dy * 5 * sensitivity),
                160,
                10000,
              ),
            },
          ])
          .catch(report);
        fieldImpulse = 0.9;
      }
      // Pointer events only retain the newest position. Publishing/painting at
      // display cadence prevents high-rate touch input from starving the scene.
      canvas.onpointermove = (event) => {
        if (!held) {
          hoverKind = touchesEye(event)
            ? 'eye'
            : touchesHalo(event)
              ? 'halo'
              : touchesHeart(event)
                ? 'heart'
                : touchesCrab(event)
                  ? 'crab'
                  : null;
          face.dataset.hover = hoverKind ?? 'none';
          canvas.style.cursor = hoverKind === 'eye' ? 'pointer' : hoverKind ? 'grab' : 'crosshair';
          return;
        }
        if (held.id !== event.pointerId) return;
        if (held.fine !== event.shiftKey) {
          applyFieldTarget();
          held = {
            ...held,
            x: event.clientX,
            y: event.clientY,
            focus: read('focus'),
            shift: read('shift'),
            grainSize: read('grainSize'),
            scatter: read('scatter'),
            mix: read('mix'),
            afterimage: read('afterimage'),
            edge: read(crabXAxis),
            heat: read(crabYAxis),
            fine: event.shiftKey,
          };
          return;
        }
        fieldTarget = { x: event.clientX, y: event.clientY };
      };
      const release = () => {
        applyFieldTarget();
        held = null;
        hoverKind = null;
        face.dataset.hover = 'none';
        face.dataset.held = 'false';
      };
      canvas.onpointerup = release;
      canvas.onpointercancel = release;
      canvas.onlostpointercapture = release;
      canvas.onpointerleave = () => {
        if (!held) {
          hoverKind = null;
          face.dataset.hover = 'none';
        }
      };
      canvas.onkeydown = (event) => {
        const fine = event.shiftKey ? 0.1 : 1;
        if (event.key.toLowerCase() === 'h') {
          event.preventDefault();
          set('hold', read('hold') >= 0.5 ? 0 : 1);
        }
        if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
          event.preventDefault();
          set(
            'shift',
            THREE.MathUtils.clamp(
              read('shift') + (event.key === 'ArrowRight' ? 1 : -1) * fine,
              -12,
              12,
            ),
          );
        }
        if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
          event.preventDefault();
          set(
            'focus',
            THREE.MathUtils.clamp(
              read('focus') * Math.exp((event.key === 'ArrowUp' ? 1 : -1) * 0.08 * fine),
              160,
              10000,
            ),
          );
        }
      };

      function placeConsole() {
        // Project four physical corners into CSS. A homography keeps the actual
        // accessible Manifold controls on the lit panel, including perspective.
        const z = panelWorld.z;
        const project = (px, py) => {
          const p = new THREE.Vector3(px, py, z).project(camera);
          return [(p.x * 0.5 + 0.5) * width, (-p.y * 0.5 + 0.5) * height];
        };
        const cornersFor = ({ x, y, w, h }) => [
          project(x - w / 2, y + h / 2),
          project(x + w / 2, y + h / 2),
          project(x + w / 2, y - h / 2),
          project(x - w / 2, y - h / 2),
        ];
        const corners = cornersFor(panelWorld);
        placeProjectedPanel(consoleElement, corners, {
          width: portrait ? 420 : 460,
          height: portrait ? 230 : 240,
        });
        const c = chamber.position.clone().project(camera);
        bounds = {
          x: (c.x * 0.5 + 0.5) * width,
          y: (-c.y * 0.5 + 0.5) * height,
          width: width * (portrait ? 0.8 : 0.52),
          height: height * 0.6,
        };
        face.dataset.fieldX = bounds.x;
        face.dataset.fieldY = bounds.y;
        face.dataset.panelProjection = JSON.stringify(corners);
      }
      function tube(points, radius, material, segments = 64) {
        const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
        const mesh = new THREE.Mesh(
          keep(new THREE.TubeGeometry(curve, segments, radius, 8, false)),
          material,
        );
        device.add(mesh);
        return mesh;
      }
      function rainbowCable(points, radius = 0.065) {
        // A continuous optical braid with distinct spectral strands. It crosses
        // the panel boundary, keeping the viewport itself part of the device.
        tube(points, radius - 0.018, black);
        const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
        const geometry = keep(new THREE.TubeGeometry(curve, 96, radius, 14, false));
        const uv = geometry.attributes.uv,
          colors = new Float32Array(uv.count * 3),
          color = new THREE.Color();
        for (let i = 0; i < uv.count; i++) {
          const hue = (uv.getY(i) + uv.getX(i) * 1.35) % 1,
            index = Math.min(6, Math.floor(hue * 7));
          color.set(cableColors[index]);
          colors[i * 3] = color.r;
          colors[i * 3 + 1] = color.g;
          colors[i * 3 + 2] = color.b;
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const mesh = new THREE.Mesh(geometry, cableLight);
        device.add(mesh);
      }
      function connector(x, y, size = 1, direction) {
        // The socket leans out of the face, revealing its barrel and the depth
        // of the bore. A ferrule carries the cable below the mouth's raised lip.
        const normal = (
          direction
            ? new THREE.Vector3(...direction)
            : new THREE.Vector3(x < 0 ? -0.82 : 0.82, y > 0 ? 0.1 : -0.1, 0.84)
        ).normalize();
        const socket = new THREE.Group();
        socket.position.set(x, y, 0.15);
        socket.scale.setScalar(size);
        socket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
        device.add(socket);
        const mount = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.33, 0.35, 0.11, 40)), black);
        mount.position.y = -0.12;
        mount.castShadow = true;
        socket.add(mount);
        const barrel = new THREE.Mesh(
          keep(new THREE.CylinderGeometry(0.21, 0.28, 0.5, 40)),
          ceramic,
        );
        barrel.position.y = 0.14;
        barrel.castShadow = true;
        barrel.receiveShadow = true;
        socket.add(barrel);
        const shoulder = new THREE.Mesh(
          keep(new THREE.CylinderGeometry(0.23, 0.245, 0.11, 40)),
          gold,
        );
        shoulder.position.y = 0.39;
        shoulder.castShadow = true;
        socket.add(shoulder);
        const bore = new THREE.Mesh(keep(new THREE.CircleGeometry(0.16, 40)), black);
        bore.rotation.x = -Math.PI / 2;
        bore.position.y = 0.451;
        socket.add(bore);
        const gasket = new THREE.Mesh(keep(new THREE.TorusGeometry(0.145, 0.018, 10, 48)), black);
        gasket.rotation.x = -Math.PI / 2;
        gasket.position.y = 0.456;
        socket.add(gasket);
        const pilot = new THREE.Mesh(
          keep(new THREE.TorusGeometry(0.155, 0.012, 8, 48)),
          socketLight,
        );
        pilot.rotation.x = -Math.PI / 2;
        pilot.position.y = 0.463;
        socket.add(pilot);
        const lip = new THREE.Mesh(keep(new THREE.TorusGeometry(0.215, 0.022, 10, 48)), chrome);
        lip.rotation.x = -Math.PI / 2;
        lip.position.y = 0.462;
        socket.add(lip);
        const ferrule = new THREE.Mesh(
          keep(new THREE.CylinderGeometry(0.106, 0.118, 0.24, 28)),
          chrome,
        );
        ferrule.position.y = 0.55;
        ferrule.castShadow = true;
        socket.add(ferrule);
        const boot = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.09, 0.13, 0.17, 28)), black);
        boot.position.y = 0.71;
        boot.castShadow = true;
        socket.add(boot);
        for (const distance of [0.51, 0.59]) {
          const rib = new THREE.Mesh(keep(new THREE.TorusGeometry(0.11, 0.012, 8, 32)), gold);
          rib.rotation.x = -Math.PI / 2;
          rib.position.y = distance;
          socket.add(rib);
        }
        socket.updateMatrixWorld(true);
        const point = (distance) =>
          socket.localToWorld(new THREE.Vector3(0, distance, 0)).toArray();
        return { inside: point(0.36), approach: point(0.95) };
      }
      function rebuildEnclosure() {
        renderer.shadowMap.needsUpdate = true;
        assembly.clear();
        for (const resource of assemblyResources) {
          resources.delete(resource);
          resource.dispose();
        }
        const resourcesBefore = new Set(resources);
        const meshesBefore = new Set(device.children);
        // The physical face fills the pane. Insets and raised edges establish
        // scale without a separate room, floor or floating product enclosure.
        block(paneW + 0.14, paneH + 0.14, 0.3, 0.12, chassis, 0, 0, -0.3);
        block(paneW - 0.1, paneH - 0.1, 0.02, 0.1, chrome, 0, 0, 0.02);
        block(paneW - 0.18, paneH - 0.18, 0.02, 0.09, gold, 0, 0, 0.07);
        block(paneW - 0.25, paneH - 0.25, 0.025, 0.08, enamel, 0, 0, 0.095);
        if (portrait) {
          // Leave a distinct right-hand bay in the stacked face. The field
          // keeps its world-space touch geometry by undoing this scale in pick().
          chamber.position.set(-0.28, paneH / 2 - 2.25, 0.09);
          chamber.scale.setScalar(0.82);
          panelWorld = {
            x: 0,
            y: -paneH / 2 + 1.22,
            w: Math.min(paneW - 0.65, 5.1),
            h: 2.05,
            z: 0.23,
          };
        } else {
          chamber.position.set(-paneW / 2 + 2.04, -0.03, 0.09);
          chamber.scale.setScalar(1);
          panelWorld = { x: paneW / 2 - 2.24, y: -0.98, w: 3.76, h: 1.85, z: 0.23 };
        }
        // The relic floats within the cabinet engraving. Its lower fingers
        // disappear behind the physical control deck in the wide composition;
        // the portrait layout gives it a separate space beside the portal.
        const heartH = portrait ? 1.85 : 2.05,
          heartW = (heartH * 1024) / 1536;
        const heartX = portrait ? paneW / 2 - 1.1 : paneW / 2 - 2.25,
          heartY = portrait ? chamber.position.y - 0.56 : paneH / 2 - 1.18;
        handLayout = {
          width: heartW,
          height: heartH,
          x: heartX,
          y: heartY,
          portrait,
          wristX: heartW * (535 / 620 - 0.5),
          wristY: heartH * (0.5 - 830 / 900),
        };
        block(
          panelWorld.w + 0.16,
          panelWorld.h + 0.17,
          0.035,
          0.12,
          gold,
          panelWorld.x,
          panelWorld.y,
          0.11,
        );
        block(
          panelWorld.w + 0.1,
          panelWorld.h + 0.1,
          0.03,
          0.11,
          porcelain,
          panelWorld.x,
          panelWorld.y,
          0.15,
        );
        const inputX = -paneW / 2 + (portrait ? 0.46 : 0.55),
          inputY = portrait ? -0.16 : -paneH / 2 + 0.68;
        // The output is seated inside the photographed open wrist, at the
        // same image-space landmark in both layouts. Its boot protrudes into
        // the real 3D cable; the hand's lip occludes the socket mount.
        const outputX = heartX + heartW * (535 / 620 - 0.5),
          outputY = heartY + heartH * (0.5 - 830 / 900);
        // The mouth is an authored PhotoCraft relic laid around a real socket.
        // Pixel-space alignment of the source aperture is preserved as the face
        // scales between wide and portrait panels.
        const relicW = portrait ? 0.85 : 1.19,
          relicH = (relicW * 479) / 330;
        const mouth = imagePixelPoint(330 * 0.394, 479 * 0.647, 330, 479, relicW, relicH);
        relicLayout = { width: relicW, height: relicH, x: inputX - mouth.x, y: inputY - mouth.y };
        const inputSocket = connector(inputX, inputY, portrait ? 0.46 : 0.54),
          outputSocket = connector(outputX, outputY, portrait ? 0.44 : 0.4, [0.65, -0.45, 0.61]);
        // The jacks live in exposed cabinet rails. The optical loom enters
        // their ferrules without crossing the field or the parameter deck.
        rainbowCable(
          [
            [-paneW / 2 - 0.4, inputY - 0.4, 0.24],
            [-paneW / 2 + 0.04, inputY - 0.3, 0.43],
            [-paneW / 2 + 0.22, inputY - 0.12, 0.61],
            inputSocket.approach,
            inputSocket.inside,
          ],
          0.05,
        );
        rainbowCable(
          [
            [paneW / 2 + 0.4, outputY + 0.55, 0.24],
            [paneW / 2 - 0.04, outputY + 0.5, 0.43],
            [paneW / 2 - 0.48, outputY + 0.27, 0.55],
            outputSocket.approach,
            outputSocket.inside,
          ],
          0.045,
        );
        for (const x of [-paneW / 2 + 0.2, paneW / 2 - 0.2])
          for (const y of [-paneH / 2 + 0.19, paneH / 2 - 0.19]) {
            const screw = new THREE.Mesh(
              keep(new THREE.CylinderGeometry(0.047, 0.047, 0.025, 24)),
              chrome,
            );
            screw.rotation.x = Math.PI / 2;
            screw.position.set(x, y, 0.19);
            device.add(screw);
            const slot = new THREE.Mesh(keep(new THREE.BoxGeometry(0.055, 0.009, 0.006)), black);
            slot.position.set(x, y, 0.206);
            device.add(slot);
          }
        for (const object of [...device.children])
          if (!meshesBefore.has(object) && object !== assembly) assembly.attach(object);
        assemblyResources = [...resources].filter((resource) => !resourcesBefore.has(resource));
      }
      function resize() {
        width = face.clientWidth;
        height = face.clientHeight;
        if (!width || !height) return;
        // The 1300 × 750 face is the canonical wide composition. Keep the
        // portal, hand and control deck in this relationship at nearby sizes.
        // Studio's narrower preview uses the stacked composition.
        const aspect = width / height,
          nextPortrait = aspect < 1.6;
        const nextH = nextPortrait ? Math.max(6.25, 4.45 / aspect) : 4.7,
          nextW = nextH * aspect;
        const changed =
          nextPortrait !== portrait ||
          !panelWorld ||
          Math.abs(nextW - paneW) > 0.001 ||
          Math.abs(nextH - paneH) > 0.001;
        portrait = nextPortrait;
        paneW = nextW;
        paneH = nextH;
        face.dataset.portrait = portrait;
        if (changed) {
          mountPanel();
          rebuildEnclosure();
        }
        renderer.setSize(width, height, false);
        camera.left = -paneW / 2;
        camera.right = paneW / 2;
        camera.top = paneH / 2;
        camera.bottom = -paneH / 2;
        camera.position.set(0, 0, 8);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        placeConsole();
        face.dataset.framing = 'panel-is-device';
      }
      const observer = new ResizeObserver(resize);
      observer.observe(face);
      resize();
      function update() {
        if (JSON.stringify(panelLayout) !== panelSignature) mountPanel();
        const active = read('active') > 0;
        sourceButton.textContent = 'HOST';
        sourceButton.setAttribute('aria-label', 'Host audio input');
        activeButton.textContent = active ? 'ENGAGED' : 'BYPASSED';
        activeButton.setAttribute('aria-pressed', String(active));
        const holding = read('hold') >= 0.5;
        holdButton.textContent = holding ? 'RELEASE' : 'HOLD';
        holdButton.setAttribute('aria-pressed', String(holding));
        for (const button of face.querySelectorAll('[data-preset]')) {
          const preset = materials[Number(button.dataset.preset)].values;
          button.setAttribute(
            'aria-pressed',
            String(
              Object.entries(preset)
                .filter(([name]) => hasPrism || !name.startsWith('prism'))
                .every(([name, value]) => Math.abs(read(name) - value) < 0.001),
            ),
          );
        }
      }
      update();
      function advance({ time, delta: dt }) {
        const now = time * 1000;
        if (disposed) return;
        if (!width || !height) return;
        if (!environmentReady) prepareEnvironment();
        applyFieldTarget();
        const analysis = api.input('analysis');
        const rms = analysis?.rms ?? 0;
        energy = api.input('energy') ?? 0;
        peak = api.input('peak') ?? 0;
        const upper = api.input('upper') ?? 0;
        const bands = analysis?.bands;
        for (let i = 0; i < 32; i++) {
          bars[i].style.background = 'hsl(' + (170 + i * 4.8) + ' 65% 70%)';
          bars[i].style.transform = 'scaleY(' + Math.max(0.025, bands?.[i] ?? 0) + ')';
        }
        phase += reduced.matches ? 0 : dt * (0.5 + energy * 1.1);
        fieldImpulse = held ? 0.9 : fieldImpulse * Math.exp(-dt * 5);

        cableUniforms.time.value = phase;
        cableUniforms.energy.value = energy;
        socketLight.opacity = 0.1 + energy * 0.6;
        socketLight.color.setHSL(0.48 + upper * 0.2, 0.8, 0.65);
        const holding = read('hold') >= 0.5;
        cursorPresent = now - cursorAt < 2200;
        face.dataset.memoryHeld = String(holding);
        face.querySelector('.nacre-level').textContent =
          rms > 1e-5 ? (20 * Math.log10(rms)).toFixed(1) + ' dB' : '−∞ dB';
        const status = face.querySelector('.nacre-status');
        status.dataset.live = String(rms > 1e-5);
        status.lastElementChild.textContent =
          held?.kind === 'heart' || hoverKind === 'heart'
            ? 'GRAIN ↕ · SCATTER ↔'
            : held?.kind === 'halo' || hoverKind === 'halo'
              ? 'MIX ↔ · MEMORY ↕'
              : held?.kind === 'crab' || hoverKind === 'crab'
                ? hasPrism
                  ? 'EDGE ↔ · HEAT ↕'
                  : 'FOCUS ↔ · DRIVE ↕'
                : rms > 1e-5
                  ? 'RESONATING'
                  : 'STANDBY';
        face.dataset.contactX = contact.x.toFixed(3);
        face.dataset.contactY = contact.y.toFixed(3);
        face.dataset.contactPressure = fieldImpulse.toFixed(4);
        face.dataset.energy = energy.toFixed(5);
        face.dataset.peakHz = peak.toFixed(2);
        face.dataset.frame = frame;
      }

      const unsubscribe = api.subscribe(update);
      const sceneResource = api.exportResource('resource:nacre.scene', {
        renderer,
        scene,
        camera,
        chamber,
        device,
        get layout() {
          return { portrait, paneW, paneH };
        },
        registerControlTarget(name, object, ready, hitTest) {
          const owners = controlTargets.get(name)?.owners ?? [];
          const target = { object, ready, hitTest, owners };
          owners.push(target);
          controlTargets.set(name, target);
          return () => {
            const index = owners.indexOf(target);
            if (index < 0) return;
            owners.splice(index, 1);
            // Failed candidates return interaction to the last working object.
            // Retiring an old owner cannot remove the replacement's target.
            if (owners.length) controlTargets.set(name, owners.at(-1));
            else controlTargets.delete(name);
          };
        },
        get handLayout() {
          return handLayout;
        },
        get relicLayout() {
          return relicLayout;
        },
        face,
        reduced,
        materials: { chrome, gold, ceramic, black, spectralCrystal },
      });
      return {
        outputs: () => ({
          scene: sceneResource,
          contact: [contact.x, contact.y, fieldImpulse],
          phase,
          eyePointer: [cursorX, cursorPresent ? 1 : 0, reduced.matches ? 1 : 0],
          handTouch: [
            hoverKind === 'heart' ? 1 : 0,
            held?.kind === 'heart' ? 1 : 0,
            reduced.matches ? 1 : 0,
          ],
          handGesture: [
            previewHeart?.scatter ?? 0,
            previewHeart?.grainSize ?? 0,
            previewHeart ? 1 : 0,
          ],
          haloTouch: [
            hoverKind === 'halo' ? 1 : 0,
            held?.kind === 'halo' ? 1 : 0,
            reduced.matches ? 1 : 0,
          ],
          haloGesture: [previewHalo?.mix ?? 0, previewHalo?.afterimage ?? 0, previewHalo ? 1 : 0],
          creatureTouch: [
            hoverKind === 'crab' ? 1 : 0,
            held?.kind === 'crab' ? 1 : 0,
            reduced.matches ? 1 : 0,
          ],
          creatureGesture: [previewCrab?.edge ?? 0, previewCrab?.heat ?? 0, previewCrab ? 1 : 0],
        }),
        update: advance,
        render() {
          renderer.render(scene, camera);
          face.dataset.drawCalls = renderer.info.render.calls;
          face.dataset.frame = frame++;
        },
        dispose() {
          unsubscribe();
          disposed = true;
          observer.disconnect();
          panel.dispose();
          releaseEnvironmentScene();
          for (const resource of resources) resource.dispose();
          key.shadow.dispose();
          renderer.dispose();
          renderer.forceContextLoss();
          face.remove();
        },
      };
    },
  };
}
