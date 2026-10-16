// The physical face. Graphics consume telemetry; named endpoints own the sound.
import * as THREE from 'three';
import { mountControlPanel, placeProjectedPanel } from '@manifold/ui-web/control-panel';
import { imagePixelPoint, imagePixelRect, followTelemetry } from '@manifold/ui-web/diegetic';

export default function createView() {
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
      api.assetUrl?.('/assets/nacre-sigil.svg').then(url=>{const sigil=face.querySelector('.nacre-sigil');sigil.src=url;sigil.hidden=false;}).catch(()=>{});
      const panelElement = face.querySelector('.nacre-controls');
      const errorElement = face.querySelector('.nacre-error');
      const spectrumElement = face.querySelector('.nacre-spectrum');
      const bars = Array.from({length:32}, () => { const bar = document.createElement('i'); spectrumElement.append(bar); return bar; });
      const reduced = matchMedia('(prefers-reduced-motion: reduce)');
      const paths = {focus:'/nacre/focus', shift:'/nacre/shift', drive:'/nacre/drive', resonance:'/nacre/resonance', mix:'/nacre/mix', afterimage:'/nacre/afterimage', grainSize:'/nacre/grain-size', scatter:'/nacre/scatter',
        prismEdge:api.layout.find(item=>item.id==='nacre-prism-edge')?.path,prismHeat:api.layout.find(item=>item.id==='nacre-prism-heat')?.path};
      const hasPrism=Boolean(paths.prismEdge&&paths.prismHeat);
      const crabXAxis=hasPrism?'prismEdge':'focus',crabYAxis=hasPrism?'prismHeat':'drive';
      const pathFor = name => paths[name] ?? '/nacre/' + name;
      const read = name => api.value(pathFor(name));
      const report = error => { errorElement.textContent = error.message; };
      const set = (name, value) => api.set(pathFor(name), value).catch(report);

      // Materials are musical presets, applied as one acknowledged parameter batch.
      const materials = [
        {name:'CHROME',note:'Cold mirror · close grain',color:'#c9e9f0',values:{focus:2100,shift:0,drive:9,resonance:.38,mix:.3,afterimage:.08,grainSize:110,scatter:.12,curve:0,prismEdge:6200,prismHeat:4}},
        {name:'PRISM',note:'Shifting colour · warm edge',color:'#cfa8ff',values:{focus:2400,shift:7,drive:18,resonance:.58,mix:.64,afterimage:.22,grainSize:85,scatter:.28,curve:0,prismEdge:4800,prismHeat:8}},
        {name:'FRACTURE',note:'Cut glass · torn spectrum',color:'#ffa486',values:{focus:6300,shift:-7,drive:27,resonance:.82,mix:.92,afterimage:.52,grainSize:54,scatter:.67,curve:4,prismEdge:1900,prismHeat:22}},
        {name:'VOID',note:'Dark well · long memory',color:'#b6d6a4',values:{focus:480,shift:-12,drive:7,resonance:.72,mix:.72,afterimage:.75,grainSize:180,scatter:.42,curve:3,prismEdge:740,prismHeat:12}},
        {name:'VESPER',note:'Hollow choir · slow glass',color:'#f1b3e1',values:{focus:970,shift:5,drive:13,resonance:.91,mix:.82,afterimage:.9,grainSize:220,scatter:.19,curve:6,prismEdge:3100,prismHeat:15}},
        {name:'RADIANT',note:'Bright splinters · short flash',color:'#f9d67e',values:{focus:7800,shift:11,drive:31,resonance:.46,mix:.88,afterimage:.16,grainSize:35,scatter:.86,curve:4,prismEdge:8700,prismHeat:28}},
      ];
      const atlas=face.querySelector('.nacre-atlas-panel');
      for(const [index,material] of materials.entries()){
        const card=document.createElement('button');card.className='nacre-atlas-card';card.dataset.preset=String(index);
        card.style.setProperty('--material-color',material.color);card.style.setProperty('--material-glow',material.color+'33');
        const title=document.createElement('strong');title.textContent=material.name;
        const note=document.createElement('span');note.textContent=material.note;card.append(title,note);atlas.append(card);
      }
      for (const button of face.querySelectorAll('[data-preset]')) {
        button.onclick = () => api.request({operation:'parameter.batch', edits:Object.entries(materials[Number(button.dataset.preset)].values)
          .filter(([name])=>hasPrism||!name.startsWith('prism')).map(([name,value])=>({path:pathFor(name),value}))}).catch(report);
      }
      const atlasToggle=face.querySelector('.nacre-atlas-toggle');
      atlasToggle.onclick=()=>{const open=face.dataset.deck!=='atlas';face.dataset.deck=open?'atlas':'controls';atlasToggle.setAttribute('aria-pressed',String(open));};
      const sourceButton = face.querySelector('.nacre-source'), activeButton = face.querySelector('.nacre-active'), holdButton=face.querySelector('.nacre-hold');
      sourceButton.disabled = true;
      sourceButton.title = 'Audio supplied by the host; Studio test sources live in the Input graph';
      activeButton.onclick = () => set('active', read('active') > 0 ? -1 : 1);
      holdButton.onclick = () => set('hold', read('hold') >= .5 ? 0 : 1);
      let panel, portrait = false, panelSignature = '';
      function mountPanel() {
        panel?.dispose();
        panelSignature = JSON.stringify(api.layout);
        const panelApi = {snapshot:api.snapshot, value:api.value, set:api.set, subscribe:api.subscribe,layout:api.layout};
        panel = mountControlPanel(panelElement, panelApi, {
          variant:portrait?'compact':'default',height:portrait?27:27,fontSize:10,accent:'#f295d8',background:'#402b6c',text:'#f9edf8',
          scales:{[paths.focus]:'log',...(hasPrism?{[paths.prismEdge]:'log'}:{})},
          formatters:{[paths.focus]:value=>value>=1000?(value/1000).toFixed(2)+'k':Math.round(value)+'Hz',
            [paths.shift]:value=>(value>0?'+':'')+value.toFixed(1)+'st',
            [paths.drive]:value=>value.toFixed(1)+'dB',
            [paths.resonance]:value=>Math.round(value*100)+'%',
            [paths.mix]:value=>Math.round((value+1)*50)+'%',
            [paths.afterimage]:value=>Math.round(value*100)+'%',
            [paths.grainSize]:value=>Math.round(value)+'ms',
            [paths.scatter]:value=>Math.round(value*100)+'%',
            ...(hasPrism?{[paths.prismEdge]:value=>value>=1000?(value/1000).toFixed(2)+'k':Math.round(value)+'Hz',
              [paths.prismHeat]:value=>value.toFixed(1)+'dB'}:{})},
        });
        panelElement.style.minHeight='0';
      }
      mountPanel();

      // A real lit, bevelled enclosure. The environment is generated here and
      // packaged with the face: no CDN images or external asset lifetime.
      const resources = new Set(), keep = value => { resources.add(value); return value; };
      const renderer = new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
      renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
      renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false; renderer.shadowMap.type=THREE.PCFShadowMap;
      const canvas=renderer.domElement; canvas.className='nacre-render';canvas.tabIndex=0;
      canvas.setAttribute('role','group');canvas.setAttribute('aria-label','Nacre spectral field: drag the portal for focus and displacement, the crystal hand for grain and scatter, its outer halo for transmutation and afterimage, or the shell crab mouth for prism edge and heat; touch the relic eye or press H to hold memory');
      face.prepend(canvas);
      const scene = new THREE.Scene();scene.background=new THREE.Color('#15101c');
      const camera = new THREE.OrthographicCamera(-3.4,3.4,2.35,-2.35,.1,40);
      const envScene = new THREE.Scene();envScene.background=new THREE.Color('#090911');
      const envBox = new THREE.Mesh(new THREE.BoxGeometry(30,30,30),new THREE.MeshBasicMaterial({color:'#10101b',side:THREE.BackSide}));envScene.add(envBox);
      for (const [x,y,z,w,h,color,intensity] of [[-5,6,2,3,9,'#e8f4f2',5],[5,2,4,1.4,10,'#ff92bc',4],[0,7,-5,8,2,'#ffe1a2',6],[-2,-4,5,8,.6,'#46e9d7',3],[4,-4,-3,3,6,'#8381fc',3]]) {
        const lightCard=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(color).multiplyScalar(intensity),side:THREE.DoubleSide}));
        lightCard.position.set(x,y,z);lightCard.lookAt(0,0,0);envScene.add(lightCard);
      }
      // Studio mounts a candidate surface before egui places its pane. Baking
      // the reflection environment at that point produced a black map. Prepare
      // it on the first visible frame, after the canvas has its real size.
      let environmentReady=false;
      function releaseEnvironmentScene(){envScene.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});envScene.clear();}
      function prepareEnvironment(){
        const pmrem=new THREE.PMREMGenerator(renderer);
        const environment=keep(pmrem.fromScene(envScene,.035));scene.environment=environment.texture;pmrem.dispose();
        releaseEnvironmentScene();environmentReady=true;face.dataset.environmentReady='true';
      }
      scene.add(new THREE.HemisphereLight('#c5e9ed','#342450',1.3));
      const key=new THREE.DirectionalLight('#d8f0ee',4.2);key.position.set(-3,6,7);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-5;key.shadow.camera.right=5;key.shadow.camera.top=5;key.shadow.camera.bottom=-5;key.shadow.normalBias=.03;scene.add(key);
      const edge=new THREE.DirectionalLight('#cd79ff',3.6);edge.position.set(5,-1,2);scene.add(edge);
      const device=new THREE.Group();scene.add(device);
      const chassis=keep(new THREE.MeshPhysicalMaterial({color:'#52273e',metalness:.82,roughness:.22,iridescence:.48,iridescenceThicknessRange:[120,400],clearcoat:.6,clearcoatRoughness:.28}));
      const chrome=keep(new THREE.MeshPhysicalMaterial({color:'#d6e4e7',metalness:1,roughness:.12,clearcoat:1,clearcoatRoughness:.08}));
      const black=keep(new THREE.MeshStandardMaterial({color:'#231a2d',metalness:.68,roughness:.23}));
      const ceramic=keep(new THREE.MeshPhysicalMaterial({color:'#b79e8c',metalness:.85,roughness:.18,iridescence:.4,iridescenceIOR:1.3,iridescenceThicknessRange:[160,420]}));
      const gold=keep(new THREE.MeshPhysicalMaterial({color:'#dfbb72',metalness:1,roughness:.17,clearcoat:.65}));
      const enamel=keep(new THREE.MeshPhysicalMaterial({color:'#291d38',metalness:.52,roughness:.18,clearcoat:1,clearcoatRoughness:.10,iridescence:.45,iridescenceThicknessRange:[180,460]}));
      const porcelain=keep(new THREE.MeshPhysicalMaterial({color:'#e2bec9',metalness:.45,roughness:.2,clearcoat:1}));
      const cableColors=['#ef7955','#e5b75b','#a9d275','#61d9ce','#709ef4','#b08cea','#ef8eca'];
      const cableUniforms={time:{value:0},energy:{value:0}};
      const cableLight=keep(new THREE.MeshPhysicalMaterial({color:'#e9e6ef',vertexColors:true,metalness:.65,roughness:.18,clearcoat:1,iridescence:.5,iridescenceThicknessRange:[140,450]}));
      cableLight.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,cableUniforms);
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 wireUv;').replace('#include <begin_vertex>','#include <begin_vertex>\nwireUv=uv;');
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 wireUv;uniform float time;uniform float energy;').replace('#include <color_fragment>',`#include <color_fragment>
          float travel=wireUv.x*1.35-time*.14;
          vec3 movingSpectrum=.5+.5*cos(6.2831853*(travel+vec3(0.,.33,.67)));
          diffuseColor.rgb=mix(diffuseColor.rgb,movingSpectrum,.15+energy*.42);
        `).replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
          float flow=pow(.5+.5*sin(wireUv.x*35.-time*2.),5.);
          totalEmissiveRadiance+=diffuseColor.rgb*(.06+flow*energy*.65);
        `);
      };
      const cabinetMaterial=keep(new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:0,depthWrite:false,toneMapped:false}));
      const crabTextures=[null,null,null];let crabFrame=0,crabLastSwitch=0;
      const crabMaterial=keep(new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:0,alphaTest:.10,depthWrite:true,toneMapped:false}));
      const crabMouthMaterial=keep(new THREE.MeshBasicMaterial({color:'#db91ff',transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));
      const heartUniforms={heartTime:{value:0},heartEnergy:{value:0},heartScatter:{value:0},heartGrain:{value:0}};
      const heartMaterial=keep(new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:1,alphaTest:.10,depthWrite:true,toneMapped:false}));
      heartMaterial.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,heartUniforms);
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float heartEnergy;uniform float heartScatter;uniform float heartGrain;');
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
          float heart=exp(-dot((uv-vec2(.36,.67))*vec2(2.1,2.5),(uv-vec2(.36,.67))*vec2(2.1,2.5))*5.0);
          transformed.z+=heart*(.006+.015*heartEnergy+.013*heartScatter+.008*heartGrain);
        `);
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float heartTime;uniform float heartEnergy;uniform float heartScatter;uniform float heartGrain;');
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          #ifdef USE_MAP
          float heart=exp(-dot((vMapUv-vec2(.36,.67))*vec2(2.1,2.5),(vMapUv-vec2(.36,.67))*vec2(2.1,2.5))*5.0);
          float facets=pow(max(0.0,sin(vMapUv.x*48.0+vMapUv.y*21.0-heartTime*(.4+heartGrain*1.5))),16.0);
          vec3 spectrum=.5+.5*cos(6.2831853*(vMapUv.y*.8+heartScatter*.2+heartTime*.025+vec3(0.0,.33,.67)));
          diffuseColor.rgb+=spectrum*heart*(facets*.10+heartEnergy*(.07+heartScatter*.18));
          #endif
        `);
      };
      // One plane owns the hand silhouette. Crossfading misregistered cutouts
      // made fingers and cabinet engraving show through one another.
      const handPoseTextures=[null,null,null];
      // Hit-test the visible cutout, so any part of the hand can be grabbed
      // without turning its transparent bounding rectangle into a control.
      const handHitPixels=[null,null,null];
      const handHitWidth=128,handHitHeight=186;
      function cacheHandHit(texture,index){
        try{
          const hitCanvas=document.createElement('canvas');hitCanvas.width=handHitWidth;hitCanvas.height=handHitHeight;
          const context=hitCanvas.getContext('2d',{willReadFrequently:true});
          context.drawImage(texture.image,0,0,handHitWidth,handHitHeight);
          handHitPixels[index]=context.getImageData(0,0,handHitWidth,handHitHeight).data;
          face.dataset.handHit='silhouette';
        }catch{face.dataset.handHit='crystal';}
      }
      // A separate photographed graft covers every grasp pose. Its centre is
      // cut out in the shader: the real 3D ferrule remains visible in the hole
      // while porcelain, gold and tendons overhang its edge.
      const wristGraftMaterial=keep(new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.98,alphaTest:.025,depthTest:false,depthWrite:false,toneMapped:false}));
      wristGraftMaterial.onBeforeCompile=shader=>{
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          #ifdef USE_MAP
          float surround=1.0-smoothstep(.76,1.0,length((vMapUv-vec2(.89,.11))/vec2(.23,.21)));
          float aperture=smoothstep(.70,1.05,length((vMapUv-vec2(.895,.067))/vec2(.061,.055)));
          diffuseColor.a*=surround*aperture;
          #endif
        `);
      };
      const mouthRelicMaterial=keep(new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:0,alphaTest:.025,depthWrite:false,toneMapped:false}));
      // PhotoCraft's grayscale plate is a real height field. Vertex relief and
      // depth gradients share this map; the jack aperture is masked from motion.
      const neutralDepth=keep(new THREE.DataTexture(new Uint8Array([128,128,128,255]),1,1));neutralDepth.needsUpdate=true;
      const relicUniforms={relicTime:{value:0},relicEnergy:{value:0},relicDepth:{value:neutralDepth}};
      mouthRelicMaterial.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,relicUniforms);
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform sampler2D relicDepth;uniform float relicEnergy;');
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
          float h=texture2D(relicDepth,uv).r;
          float anchor=smoothstep(.13,.30,distance(uv,vec2(.394,.353)));
          transformed.z+=anchor*(h-.35)*(.065+relicEnergy*.15);
        `);
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D relicDepth;uniform float relicTime;uniform float relicEnergy;');
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
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
        `);
      };
      const socketLight=keep(new THREE.MeshBasicMaterial({color:'#8ceee7',transparent:true,opacity:.12,depthWrite:false}));
      const relicEyeLight=keep(new THREE.MeshBasicMaterial({color:'#a8faff',transparent:true,opacity:.08,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
      const shutterMaterial=keep(new THREE.MeshBasicMaterial({transparent:true,opacity:0,alphaTest:.025,depthWrite:false,toneMapped:false}));
      // Two feathered photo-collage frames share the relic's height field. The
      // underlying closed eye remains in the original plate for real blinks.
      const gazeMaterials=[0,1].map(()=>{
        const material=keep(new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:0,alphaTest:.025,depthWrite:false,toneMapped:false}));
        material.onBeforeCompile=mouthRelicMaterial.onBeforeCompile;
        return material;
      });
      let gazeOpen=0,gazeBlend=0,gazeSide=0,lastGazeSwitch=0,gazeFramesReady=0;
      let cabinetTexture;
      function fitCabinetTexture() {
        if(!cabinetTexture)return;
        const imageAspect=768/512,plateAspect=(paneW-.28)/(paneH-.28);
        if(plateAspect>imageAspect){cabinetTexture.repeat.set(1,imageAspect/plateAspect);cabinetTexture.offset.set(0,(1-cabinetTexture.repeat.y)/2);}
        else{cabinetTexture.repeat.set(plateAspect/imageAspect,1);cabinetTexture.offset.set((1-cabinetTexture.repeat.x)/2,0);}
      }
      let paneW=6.8,paneH=4.7;
      // Fine machining marks catch grazing light without an image dependency.
      const brushedCanvas=document.createElement('canvas');brushedCanvas.width=512;brushedCanvas.height=512;
      const brushedPen=brushedCanvas.getContext('2d');brushedPen.fillStyle='#808080';brushedPen.fillRect(0,0,512,512);
      for(let row=0;row<512;row++){const grey=116+(row*37%29);brushedPen.strokeStyle='rgb('+grey+','+grey+','+grey+')';brushedPen.beginPath();brushedPen.moveTo(0,row);brushedPen.lineTo(512,row);brushedPen.stroke();}
      const brushed=keep(new THREE.CanvasTexture(brushedCanvas));brushed.wrapS=brushed.wrapT=THREE.RepeatWrapping;brushed.repeat.set(3,3);
      chassis.bumpMap=brushed;chassis.bumpScale=.004;chrome.bumpMap=brushed;chrome.bumpScale=.0008;
      function roundShape(w,h,r) {
        const shape=new THREE.Shape(); const x=-w/2,y=-h/2;
        shape.moveTo(x+r,y);shape.lineTo(x+w-r,y);shape.quadraticCurveTo(x+w,y,x+w,y+r);shape.lineTo(x+w,y+h-r);shape.quadraticCurveTo(x+w,y+h,x+w-r,y+h);shape.lineTo(x+r,y+h);shape.quadraticCurveTo(x,y+h,x,y+h-r);shape.lineTo(x,y+r);shape.quadraticCurveTo(x,y,x+r,y);return shape;
      }
      function block(w,h,depth,r,material,x,y,z) {
        const geometry=keep(new THREE.ExtrudeGeometry(roundShape(w,h,r),{depth,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.045,bevelThickness:.045,curveSegments:14}));
        const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;device.add(mesh);return mesh;
      }
      let assembly=new THREE.Group();device.add(assembly);
      let assemblyResources=[];
      const chamber=new THREE.Group();device.add(chamber);
      const chamberRadius=1.63;
      const torus=(radius,tube,material,z)=>{const mesh=new THREE.Mesh(keep(new THREE.TorusGeometry(radius,tube,10,180)),material);mesh.position.z=z;chamber.add(mesh);return mesh;};
      torus(1.71,.07,chrome,.24);torus(1.65,.012,gold,.29);torus(1.59,.025,ceramic,.30);
      const focusIris=torus(1.48,.017,chrome,.13);
      const well=new THREE.Mesh(keep(new THREE.CylinderGeometry(1.68,1.68,.26,160,1,true)),black);well.rotation.x=Math.PI/2;well.position.z=.08;chamber.add(well);
      const ticks=new THREE.Group();chamber.add(ticks);
      for(let i=0;i<80;i++) {
        const angle=i/80*Math.PI*2;const tick=new THREE.Mesh(keep(new THREE.BoxGeometry(i%5===0?.052:.025,.006,.012)),i%5===0?chrome:ceramic);
        tick.position.set(Math.cos(angle)*1.78,Math.sin(angle)*1.78,.22);tick.rotation.z=angle;ticks.add(tick);
      }

      // Liquid chrome uses the physical material's actual environment reflection.
      // The standing-wave normal bends it into nodal ridges and microscopic noise.
      const liquidUniforms={fieldN:{value:4},fieldM:{value:7},fieldTime:{value:0},fieldEnergy:{value:0},fieldMemory:{value:0},fieldShift:{value:.5},fieldTouch:{value:new THREE.Vector3(0,0,0)}};
      const liquid=keep(new THREE.MeshPhysicalMaterial({color:'#506c85',metalness:1,roughness:.21,clearcoat:1,clearcoatRoughness:.06,iridescence:1,iridescenceIOR:1.32,iridescenceThicknessRange:[110,530]}));
      liquid.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,liquidUniforms);
        shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
          varying vec2 fieldUv;uniform float fieldN;uniform float fieldM;uniform float fieldEnergy;uniform vec3 fieldTouch;uniform float fieldTime;
        `).replace('#include <begin_vertex>',`#include <begin_vertex>
          fieldUv=uv;vec2 waveP=(uv*2.-1.)*1.52/1.28*3.14159265;
          float waveF=cos(fieldN*waveP.x)*cos(fieldM*waveP.y)-cos(fieldM*waveP.x)*cos(fieldN*waveP.y);
          float touchD=distance((uv*2.-1.)*1.52,fieldTouch.xy);
          transformed.z+=sin(waveF*3.5)*(.006+fieldEnergy*.023)+fieldTouch.z*exp(-touchD*touchD*8.)*sin(touchD*25.-fieldTime*6.)*.035;
        `);
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
          varying vec2 fieldUv;uniform float fieldN;uniform float fieldM;uniform float fieldTime;uniform float fieldEnergy;uniform float fieldMemory;uniform float fieldShift;
          float standing(vec2 p){p*=3.14159265;return cos(fieldN*p.x)*cos(fieldM*p.y)-cos(fieldM*p.x)*cos(fieldN*p.y);}
          float relief(vec2 p){float f=standing(p);float lattice=sin(p.x*75.+fieldTime*.12)*cos(p.y*67.-fieldTime*.16);return (.018+fieldEnergy*.015)*sin(f*3.5)+.013*lattice*fieldEnergy;}
        `).replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
          if(distance(fieldUv,vec2(.5))>.5)discard;
          vec2 p=(fieldUv*2.-1.)*1.52/1.28;float h=relief(p);vec2 grad=vec2(relief(p+vec2(.002,0.))-h,relief(p+vec2(0.,.002))-h)/.002;
          normal=normalize(normal+vec3(grad*.52,0.));
        `).replace('#include <lights_physical_fragment>',`#include <lights_physical_fragment>
          #ifdef USE_IRIDESCENCE
            vec2 crystalP=fieldUv*2.-1.;
            material.iridescenceThickness=100.+620.*(.5+.5*sin(crystalP.x*3.7+crystalP.y*2.4+standing(crystalP)*1.6+fieldTime*.14));
          #endif
        `).replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
          vec2 lightP=(fieldUv*2.-1.)*1.52/1.28;
          float nodalGlow=exp(-abs(standing(lightP))*10.);
          float memoryGlow=exp(-abs(standing(lightP+vec2(.08,-.11)))*12.);
          vec3 spectralLight=.5+.5*cos(6.28318*(vec3(.08,.38,.72)+fieldUv.x*.5+fieldUv.y*.21+fieldShift*.4));
          totalEmissiveRadiance+=spectralLight*nodalGlow*(.06+fieldEnergy*.22);
          totalEmissiveRadiance+=vec3(.20,.08,.28)*memoryGlow*fieldMemory*(.06+fieldEnergy*.30);
        `);
      };
      const pool=new THREE.Mesh(keep(new THREE.PlaneGeometry(3.04,3.04,96,96)),liquid);pool.position.z=.11;chamber.add(pool);

      // A crystalline cavity extends behind the standing-wave plate.
      const crystal=keep(new THREE.MeshPhysicalMaterial({color:'#b8cddd',metalness:.6,roughness:.12,iridescence:1,iridescenceIOR:1.45,iridescenceThicknessRange:[100,660],clearcoat:1}));
      const crystals=new THREE.InstancedMesh(keep(new THREE.IcosahedronGeometry(1,0)),crystal,96);const dummy=new THREE.Object3D();
      for(let i=0;i<96;i++){const angle=i/96*Math.PI*2;const r=1.37+.08*Math.sin(i*2.3);dummy.position.set(Math.cos(angle)*r,Math.sin(angle)*r,.17+Math.sin(i*1.2)*.025);dummy.scale.set(.04+.03*(i%3),.085+.015*(i%5),.06);dummy.rotation.set(i*.43,i*.79,angle);dummy.updateMatrix();crystals.setMatrixAt(i,dummy.matrix);}chamber.add(crystals);
      // A bounded particle simulation relaxes grains toward F(x,y)=0. The force
      // is -gradient(F²), with audio energy adding agitation; it is not a DSP loop.
      const count=10000, positions=new Float32Array(count*3), velocities=new Float32Array(count*2), seeds=new Float32Array(count);
      let randomState=9137;const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)|0;return(randomState>>>0)/4294967296;};
      for(let i=0;i<count;i++){const angle=random()*Math.PI*2,r=Math.sqrt(random())*1.28;positions[i*3]=Math.cos(angle)*r;positions[i*3+1]=Math.sin(angle)*r;positions[i*3+2]=.15;seeds[i]=random();}
      const particleGeometry=keep(new THREE.BufferGeometry());particleGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));particleGeometry.setAttribute('seed',new THREE.BufferAttribute(seeds,1));
      const particleUniforms={energy:{value:0},time:{value:0},pixelRatio:{value:renderer.getPixelRatio()},hue:{value:.4}};
      const particleMaterial=keep(new THREE.ShaderMaterial({uniforms:particleUniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
        vertexShader:`attribute float seed;varying float grain;uniform float energy;uniform float pixelRatio;void main(){grain=seed;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp((1.6+seed*1.6+energy*.65)*pixelRatio,1.,5.);}`,
        fragmentShader:`varying float grain;uniform float energy;uniform float hue;void main(){vec2 p=gl_PointCoord-.5;float r=length(p);if(r>.5)discard;float a=smoothstep(.5,.05,r);vec3 c=.65+.35*cos(6.28318*(vec3(.05,.38,.7)+grain*.22+hue*.2));c=mix(vec3(.62,.82,.85),c,.55);c=mix(c,.5+.5*cos(6.28318*(vec3(.02,.35,.67)+grain*.37+hue*.26)),.7);gl_FragColor=vec4(c*(1.1+energy*1.8),a*(.55+grain*.45));}`,
      }));
      const particles=new THREE.Points(particleGeometry,particleMaterial);chamber.add(particles);
      // Iso-contours use the same standing wave as the grain force. Their
      // luminous lattice makes the nodal structure legible through the chrome.
      const contourPositions = new Float32Array(72*72*12);
      const contourGeometry=keep(new THREE.BufferGeometry());contourGeometry.setAttribute('position',new THREE.BufferAttribute(contourPositions,3));
      const contourMaterial=keep(new THREE.LineBasicMaterial({color:'#8ff4df',transparent:true,opacity:.65,depthWrite:false}));
      const contours=new THREE.LineSegments(contourGeometry,contourMaterial);chamber.add(contours);
      const corners=new Float32Array(4), crossing=new Float32Array(8);
      function drawContours(n,m) {
        let written=0;const side=72,step=2.56/side;
        const field=(x,y)=>Math.cos(n*x)*Math.cos(m*y)-Math.cos(m*x)*Math.cos(n*y);
        for(let iy=0;iy<side;iy++)for(let ix=0;ix<side;ix++) {
          const x=-1.28+ix*step,y=-1.28+iy*step;
          if(Math.hypot(x+step/2,y+step/2)>1.28)continue;
          corners[0]=field(x,y);corners[1]=field(x+step,y);corners[2]=field(x+step,y+step);corners[3]=field(x,y+step);
          let intersections=0;
          for(let edge=0;edge<4;edge++){const next=(edge+1)%4,a=corners[edge],b=corners[next];if((a>0)===(b>0))continue;const t=a/(a-b);const ax=edge===1||edge===2?1:0,ay=edge>=2?1:0,bx=next===1||next===2?1:0,by=next>=2?1:0;crossing[intersections*2]=x+(ax+(bx-ax)*t)*step;crossing[intersections*2+1]=y+(ay+(by-ay)*t)*step;intersections++;}
          for(let j=0;j+1<intersections;j+=2)for(let k=j;k<=j+1;k++){contourPositions[written++]=crossing[k*2];contourPositions[written++]=crossing[k*2+1];contourPositions[written++]=.20;}
        }
        contourGeometry.setDrawRange(0,written/3);contourGeometry.attributes.position.needsUpdate=true;
      }
      // Small crystal stars sit on a deeper optical lattice. The prismatic
      // accents come from a thin-film material, reflected in the liquid below.
      const constellation=new THREE.Group();chamber.add(constellation);
      const spectralCrystal=keep(new THREE.MeshPhysicalMaterial({color:'#b6becb',metalness:1,roughness:.07,iridescence:1,iridescenceIOR:1.7,iridescenceThicknessRange:[90,740],clearcoat:1}));
      const starGeometry=keep(new THREE.OctahedronGeometry(.034,0));
      for(let i=0;i<28;i++){const a=i*2.399963,r=.35+Math.sqrt(i/28)*.77;const star=new THREE.Mesh(starGeometry,spectralCrystal);star.position.set(Math.cos(a)*r,Math.sin(a)*r,.23+Math.sin(i)*.022);star.rotation.set(i*.6,i*.7,i);star.scale.set(1,.6+(i%3)*.4,1.2);constellation.add(star);}
      // Frequency becomes light around the chamber. Each crystal rib is one
      // measured logarithmic output band; colour locates it on the spectrum.
      const spectralRibs=[], ribBase=1.29;
      const ribGeometry=keep(new THREE.BoxGeometry(.018,.10,.025));
      for(let i=0;i<32;i++){
        const angle=i/32*Math.PI*2+Math.PI/2;
        const color=new THREE.Color().setHSL(.47+i/32*.43,.85,.61);
        const material=keep(new THREE.MeshPhysicalMaterial({color,metalness:.7,roughness:.14,emissive:color,emissiveIntensity:.1,clearcoat:1}));
        const rib=new THREE.Mesh(ribGeometry,material);rib.position.set(Math.cos(angle)*ribBase,Math.sin(angle)*ribBase,.27);rib.rotation.z=angle-Math.PI/2;chamber.add(rib);spectralRibs.push({rib,material,angle});
      }
      // The name follows the optical chamber's rim, like an inscription in
      // the reliquary, rather than sitting on an unrelated strip of casing.
      function titleGlyph(letter,color) {
        const surface=document.createElement('canvas');surface.width=192;surface.height=192;
        const pen=surface.getContext('2d');
        pen.fillStyle=color;pen.shadowColor=color;pen.shadowBlur=14;
        pen.textAlign='center';pen.textBaseline='middle';
        pen.font='600 146px ui-monospace, monospace';pen.fillText(letter,96,99);
        const texture=keep(new THREE.CanvasTexture(surface));texture.colorSpace=THREE.SRGBColorSpace;
        return keep(new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));
      }
      const titleArc=new THREE.Group();chamber.add(titleArc);
      const titleColors=['#7ee6e2','#d8ebf3','#eeacfa','#f6d48b','#9fe5df'];
      [...'NACRE'].forEach((letter,index)=>{
        const angle=Math.PI/2+(2-index)*.205;
        const glyph=new THREE.Mesh(keep(new THREE.PlaneGeometry(.33,.34)),titleGlyph(letter,titleColors[index]));
        glyph.position.set(Math.cos(angle)*1.94,Math.sin(angle)*1.94,.31);
        glyph.rotation.z=angle-Math.PI/2;titleArc.add(glyph);
      });
      const glass=keep(new THREE.MeshPhysicalMaterial({color:'#cae6eb',metalness:.08,roughness:.045,transparent:true,opacity:.055,clearcoat:1,iridescence:.6,depthWrite:false}));
      const cover=new THREE.Mesh(keep(new THREE.CircleGeometry(1.64,180)),glass);cover.position.z=.32;chamber.add(cover);

      let width=1,height=1, panelWorld, frame=0, previous=performance.now(), energy=0, peak=0, phase=0, modeN=4,modeM=7,disposed=false;
      api.assetUrl?.('/assets/nacre-cabinet-art.webp').then(url=>{
        if(disposed)return;
        keep(new THREE.TextureLoader().load(url,texture=>{
          if(disposed){texture.dispose();return;}
          texture.colorSpace=THREE.SRGBColorSpace;cabinetTexture=texture;
          cabinetMaterial.map=texture;cabinetMaterial.opacity=.9;cabinetMaterial.needsUpdate=true;
          fitCabinetTexture();face.dataset.cabinetArt='ready';
        }));
      }).catch(()=>{face.dataset.cabinetArt='unavailable';});
      for(const [index,name] of ['nacre-oracle-crab-rest.webp','nacre-oracle-crab-step.webp','nacre-oracle-crab-sing.webp'].entries()){
        api.assetUrl?.('/assets/'+name).then(url=>{
          if(disposed)return;
          keep(new THREE.TextureLoader().load(url,texture=>{
            if(disposed){texture.dispose();return;}
            texture.colorSpace=THREE.SRGBColorSpace;crabTextures[index]=texture;
            if(index===0){crabMaterial.map=texture;crabMaterial.opacity=1;crabMaterial.needsUpdate=true;}
            face.dataset.crabSprites=crabTextures.every(Boolean)?'ready':'loading';
          }));
        }).catch(()=>{face.dataset.crabSprites='unavailable';});
      }
      api.assetUrl?.('/assets/nacre-mouth-relic.webp').then(url=>{
        if(disposed)return;
        keep(new THREE.TextureLoader().load(url,texture=>{
          if(disposed){texture.dispose();return;}
          texture.colorSpace=THREE.SRGBColorSpace;
          mouthRelicMaterial.map=texture;mouthRelicMaterial.opacity=.97;mouthRelicMaterial.needsUpdate=true;
          face.dataset.mouthRelic='ready';
        }));
      }).catch(()=>{face.dataset.mouthRelic='unavailable';});
      api.assetUrl?.('/assets/nacre-reliquary-hand.webp').then(url=>{
        if(disposed)return;
        keep(new THREE.TextureLoader().load(url,texture=>{
          if(disposed){texture.dispose();return;}
          texture.colorSpace=THREE.SRGBColorSpace;
          handPoseTextures[0]=texture;heartMaterial.map=texture;heartMaterial.needsUpdate=true;
          cacheHandHit(texture,0);
          face.dataset.heartArt='ready';
        }));
      }).catch(()=>{face.dataset.heartArt='unavailable';});
      for(const [index,name] of ['nacre-hand-grasp-mid.webp','nacre-hand-grasp-open.webp'].entries()){
        api.assetUrl?.('/assets/'+name).then(url=>{
          if(disposed)return;
          keep(new THREE.TextureLoader().load(url,texture=>{
            if(disposed){texture.dispose();return;}
            texture.colorSpace=THREE.SRGBColorSpace;
            handPoseTextures[index+1]=texture;cacheHandHit(texture,index+1);
            face.dataset.handSprites=handPoseTextures.every(Boolean)?'ready':'loading';
          }));
        }).catch(()=>{face.dataset.handSprites='unavailable';});
      }
      api.assetUrl?.('/assets/nacre-wrist-graft.webp').then(url=>{
        if(disposed)return;
        keep(new THREE.TextureLoader().load(url,texture=>{
          if(disposed){texture.dispose();return;}
          texture.colorSpace=THREE.SRGBColorSpace;wristGraftMaterial.map=texture;wristGraftMaterial.needsUpdate=true;
          face.dataset.wristGraft='ready';
        }));
      }).catch(()=>{face.dataset.wristGraft='unavailable';});
      api.assetUrl?.('/assets/nacre-mouth-depth.webp').then(url=>{
        if(disposed)return;
        new THREE.TextureLoader().load(url,texture=>{if(disposed){texture.dispose();return;}keep(texture);texture.colorSpace=THREE.NoColorSpace;texture.flipY=true;relicUniforms.relicDepth.value=texture;face.dataset.depthMap='ready';});
      }).catch(()=>{face.dataset.depthMap='unavailable';});
      api.assetUrl?.('/assets/nacre-eye-closed.webp').then(url=>{
        if(disposed)return;
        new THREE.TextureLoader().load(url,texture=>{if(disposed){texture.dispose();return;}keep(texture);texture.colorSpace=THREE.SRGBColorSpace;shutterMaterial.map=texture;shutterMaterial.needsUpdate=true;face.dataset.eyeSprite='ready';});
      }).catch(()=>{face.dataset.eyeSprite='unavailable';});
      for(const [index,name] of ['nacre-eye-open-left.webp','nacre-eye-open-right.webp'].entries()){
        api.assetUrl?.('/assets/'+name).then(url=>{
          if(disposed)return;
          new THREE.TextureLoader().load(url,texture=>{if(disposed){texture.dispose();return;}keep(texture);texture.colorSpace=THREE.SRGBColorSpace;gazeMaterials[index].map=texture;gazeMaterials[index].needsUpdate=true;gazeFramesReady++;face.dataset.gazeFrames=gazeFramesReady===2?'ready':'loading';});
        }).catch(()=>{face.dataset.gazeFrames='unavailable';});
      }
      let held=null, hoverKind=null, fieldTarget=null, fieldImpulse=0, bounds, eyeTarget=null, heartTarget=null, haloTarget=null, crabTarget=null, crabRig=null, crabMouth=null, heartArt=null, heartRig=null, heartGimbal=null, heartGrainDial=null, memoryHalo=null, jewelMetal=null, haloMetal=null;
      let graspFrame=0;
      const handCorner=new THREE.Vector3();
      let previewHeart=null, previewHalo=null, previewCrab=null, gesturePending=null, gestureBusy=false, cursorX=.5, cursorAt=-Infinity;const contact=new THREE.Vector2();
      const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
      const fieldPlane=new THREE.Plane(new THREE.Vector3(0,0,1),-.2),hit=new THREE.Vector3();
      function pick(event) {
        const box=canvas.getBoundingClientRect();pointer.set((event.clientX-box.left)/box.width*2-1,-(event.clientY-box.top)/box.height*2+1);raycaster.setFromCamera(pointer,camera);
        if(!raycaster.ray.intersectPlane(fieldPlane,hit))return null;
        const local=hit.clone().sub(chamber.position).divideScalar(chamber.scale.x);
        return local.x*local.x+local.y*local.y<2.35?local:null;
      }
      function touchesEye(event){
        if(!eyeTarget)return false;
        const box=canvas.getBoundingClientRect();pointer.set((event.clientX-box.left)/box.width*2-1,-(event.clientY-box.top)/box.height*2+1);raycaster.setFromCamera(pointer,camera);
        return raycaster.intersectObject(eyeTarget,false).length>0;
      }
      function touchesHeart(event){
        if(!heartArt||!heartMaterial.map)return false;
        const box=canvas.getBoundingClientRect();pointer.set((event.clientX-box.left)/box.width*2-1,-(event.clientY-box.top)/box.height*2+1);raycaster.setFromCamera(pointer,camera);
        const imageHit=raycaster.intersectObject(heartArt,false)[0];
        const pixels=handHitPixels[graspFrame]??handHitPixels[0];
        if(imageHit&&pixels){
          const x=Math.min(handHitWidth-1,Math.max(0,Math.floor(imageHit.uv.x*handHitWidth)));
          const y=Math.min(handHitHeight-1,Math.max(0,Math.floor((1-imageHit.uv.y)*handHitHeight)));
          return pixels[(y*handHitWidth+x)*4+3]>64;
        }
        return raycaster.intersectObject(heartTarget,false).length>0;
      }
      function touchesHalo(event){
        if(!haloTarget||!heartMaterial.map)return false;
        const box=canvas.getBoundingClientRect();pointer.set((event.clientX-box.left)/box.width*2-1,-(event.clientY-box.top)/box.height*2+1);raycaster.setFromCamera(pointer,camera);
        return raycaster.intersectObject(haloTarget,false).length>0;
      }
      function touchesCrab(event){
        if(!crabTarget||!crabMaterial.map)return false;
        const box=canvas.getBoundingClientRect();pointer.set((event.clientX-box.left)/box.width*2-1,-(event.clientY-box.top)/box.height*2+1);raycaster.setFromCamera(pointer,camera);
        return raycaster.intersectObject(crabTarget,false).length>0;
      }
      function beginCrab(event){
        canvas.setPointerCapture(event.pointerId);canvas.focus({preventScroll:true});hoverKind='crab';
        held={id:event.pointerId,kind:'crab',x:event.clientX,y:event.clientY,edge:read(crabXAxis),heat:read(crabYAxis),fine:event.shiftKey};
        previewCrab={edge:held.edge,heat:held.heat};face.dataset.held='crab';
      }
      face.addEventListener('pointermove',event=>{const box=face.getBoundingClientRect();cursorX=(event.clientX-box.left)/box.width;cursorAt=performance.now();});
      canvas.onpointerdown=event=>{if(touchesEye(event)){canvas.focus({preventScroll:true});set('hold',read('hold')>=.5?0:1);face.dataset.eyeGesture='hold';return;}if(touchesHalo(event)){canvas.setPointerCapture(event.pointerId);canvas.focus({preventScroll:true});hoverKind='halo';held={id:event.pointerId,kind:'halo',x:event.clientX,y:event.clientY,mix:read('mix'),afterimage:read('afterimage'),fine:event.shiftKey};previewHalo={mix:held.mix,afterimage:held.afterimage};face.dataset.held='halo';return;}if(touchesHeart(event)){canvas.setPointerCapture(event.pointerId);canvas.focus({preventScroll:true});hoverKind='heart';held={id:event.pointerId,kind:'heart',x:event.clientX,y:event.clientY,grainSize:read('grainSize'),scatter:read('scatter'),fine:event.shiftKey};previewHeart={scatter:held.scatter,grainSize:held.grainSize};face.dataset.held='heart';return;}if(touchesCrab(event)){beginCrab(event);return;}const point=pick(event);if(!point)return;canvas.setPointerCapture(event.pointerId);canvas.focus({preventScroll:true});contact.set(point.x,point.y);held={id:event.pointerId,kind:'field',x:event.clientX,y:event.clientY,focus:read('focus'),shift:read('shift'),fine:event.shiftKey};fieldImpulse=.8;face.dataset.held='field';};
      async function publishGesture(edits) {
        gesturePending=edits;
        if(gestureBusy)return;
        gestureBusy=true;
        try{while(gesturePending){const next=gesturePending;gesturePending=null;await api.setBatch(next);}}
        catch(error){gesturePending=null;report(error);}
        finally{gestureBusy=false;previewHeart=null;previewHalo=null;previewCrab=null;}
      }
      function applyFieldTarget() {
        if(!held||!fieldTarget)return;
        const point=fieldTarget;fieldTarget=null;
        const sensitivity=held.fine?.12:1;
        if(held.kind==='heart'){
          previewHeart={scatter:THREE.MathUtils.clamp(held.scatter+(point.x-held.x)/240*sensitivity,0,1),
            grainSize:THREE.MathUtils.clamp(held.grainSize-(point.y-held.y)*.65*sensitivity,20,250)};
          publishGesture([{path:paths.scatter,value:previewHeart.scatter},{path:paths.grainSize,value:previewHeart.grainSize}]);
          return;
        }
        if(held.kind==='halo'){
          previewHalo={mix:THREE.MathUtils.clamp(held.mix+(point.x-held.x)/170*sensitivity,-1,1),
            afterimage:THREE.MathUtils.clamp(held.afterimage-(point.y-held.y)/210*sensitivity,0,1)};
          publishGesture([{path:paths.mix,value:previewHalo.mix},{path:paths.afterimage,value:previewHalo.afterimage}]);
          return;
        }
        if(held.kind==='crab'){
          previewCrab={edge:THREE.MathUtils.clamp(held.edge*Math.exp((point.x-held.x)/180*sensitivity),hasPrism?100:160,hasPrism?12000:10000),
            heat:THREE.MathUtils.clamp(held.heat-(point.y-held.y)*.18*sensitivity,0,40)};
          publishGesture([{path:pathFor(crabXAxis),value:previewCrab.edge},{path:pathFor(crabYAxis),value:previewCrab.heat}]);
          return;
        }
        const local=pick({clientX:point.x,clientY:point.y});if(local)contact.set(local.x,local.y);
        const dx=(point.x-held.x)/Math.max(200,bounds.width),dy=(point.y-held.y)/Math.max(200,bounds.height);
        api.setBatch([
          {path:paths.shift,value:THREE.MathUtils.clamp(held.shift+dx*24*sensitivity,-12,12)},
          {path:paths.focus,value:THREE.MathUtils.clamp(held.focus*Math.exp(-dy*5*sensitivity),160,10000)},
        ]).catch(report);
        fieldImpulse=.9;
      }
      // Pointer events only retain the newest position. Publishing/painting at
      // display cadence prevents high-rate touch input from starving the scene.
      canvas.onpointermove=event=>{
        if(!held){hoverKind=touchesEye(event)?'eye':touchesHalo(event)?'halo':touchesHeart(event)?'heart':touchesCrab(event)?'crab':null;face.dataset.hover=hoverKind??'none';canvas.style.cursor=hoverKind==='eye'?'pointer':hoverKind?'grab':'crosshair';return;}
        if(held.id!==event.pointerId)return;
        if(held.fine!==event.shiftKey){applyFieldTarget();held={...held,x:event.clientX,y:event.clientY,focus:read('focus'),shift:read('shift'),grainSize:read('grainSize'),scatter:read('scatter'),mix:read('mix'),afterimage:read('afterimage'),edge:read(crabXAxis),heat:read(crabYAxis),fine:event.shiftKey};return;}
        fieldTarget={x:event.clientX,y:event.clientY};
      };
      const release=()=>{applyFieldTarget();held=null;hoverKind=null;face.dataset.hover='none';face.dataset.held='false';};canvas.onpointerup=release;canvas.onpointercancel=release;canvas.onlostpointercapture=release;
      canvas.onpointerleave=()=>{if(!held){hoverKind=null;face.dataset.hover='none';}};
      canvas.onkeydown=event=>{const fine=event.shiftKey?.1:1;if(event.key.toLowerCase()==='h'){event.preventDefault();set('hold',read('hold')>=.5?0:1);}if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();set('shift',THREE.MathUtils.clamp(read('shift')+(event.key==='ArrowRight'?1:-1)*fine,-12,12));}if(['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();set('focus',THREE.MathUtils.clamp(read('focus')*Math.exp((event.key==='ArrowUp'?1:-1)*.08*fine),160,10000));}};

      function placeConsole() {
        // Project four physical corners into CSS. A homography keeps the actual
        // accessible Manifold controls on the lit panel, including perspective.
        const z=panelWorld.z;
        const project=(px,py)=>{const p=new THREE.Vector3(px,py,z).project(camera);return[(p.x*.5+.5)*width,(-p.y*.5+.5)*height];};
        const cornersFor=({x,y,w,h})=>[project(x-w/2,y+h/2),project(x+w/2,y+h/2),project(x+w/2,y-h/2),project(x-w/2,y-h/2)];
        const corners=cornersFor(panelWorld);
        placeProjectedPanel(consoleElement,corners,{width:portrait?420:460,height:portrait?230:240});
        const c=chamber.position.clone().project(camera);bounds={x:(c.x*.5+.5)*width,y:(-c.y*.5+.5)*height,width:width*(portrait?.8:.52),height:height*.6};
        face.dataset.fieldX=bounds.x;face.dataset.fieldY=bounds.y;face.dataset.panelProjection=JSON.stringify(corners);
      }
      function tube(points,radius,material,segments=64) {
        const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
        const mesh=new THREE.Mesh(keep(new THREE.TubeGeometry(curve,segments,radius,8,false)),material);device.add(mesh);return mesh;
      }
      function rainbowCable(points,radius=.065) {
        // A continuous optical braid with distinct spectral strands. It crosses
        // the panel boundary, keeping the viewport itself part of the device.
        tube(points,radius-.018,black);
        const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
        const geometry=keep(new THREE.TubeGeometry(curve,96,radius,14,false));
        const uv=geometry.attributes.uv,colors=new Float32Array(uv.count*3),color=new THREE.Color();
        for(let i=0;i<uv.count;i++){
          const hue=(uv.getY(i)+uv.getX(i)*1.35)%1,index=Math.min(6,Math.floor(hue*7));color.set(cableColors[index]);
          colors[i*3]=color.r;colors[i*3+1]=color.g;colors[i*3+2]=color.b;
        }
        geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));const mesh=new THREE.Mesh(geometry,cableLight);device.add(mesh);
      }
      function connector(x,y,size=1,direction) {
        // The socket leans out of the face, revealing its barrel and the depth
        // of the bore. A ferrule carries the cable below the mouth's raised lip.
        const normal=(direction?new THREE.Vector3(...direction):new THREE.Vector3(x<0?-.82:.82,y>0?.10:-.10,.84)).normalize();
        const socket=new THREE.Group();socket.position.set(x,y,.15);
        socket.scale.setScalar(size);
        socket.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),normal);device.add(socket);
        const mount=new THREE.Mesh(keep(new THREE.CylinderGeometry(.33,.35,.11,40)),black);
        mount.position.y=-.12;mount.castShadow=true;socket.add(mount);
        const barrel=new THREE.Mesh(keep(new THREE.CylinderGeometry(.21,.28,.50,40)),ceramic);
        barrel.position.y=.14;barrel.castShadow=true;barrel.receiveShadow=true;socket.add(barrel);
        const shoulder=new THREE.Mesh(keep(new THREE.CylinderGeometry(.23,.245,.11,40)),gold);
        shoulder.position.y=.39;shoulder.castShadow=true;socket.add(shoulder);
        const bore=new THREE.Mesh(keep(new THREE.CircleGeometry(.16,40)),black);
        bore.rotation.x=-Math.PI/2;bore.position.y=.451;socket.add(bore);
        const gasket=new THREE.Mesh(keep(new THREE.TorusGeometry(.145,.018,10,48)),black);
        gasket.rotation.x=-Math.PI/2;gasket.position.y=.456;socket.add(gasket);
        const pilot=new THREE.Mesh(keep(new THREE.TorusGeometry(.155,.012,8,48)),socketLight);
        pilot.rotation.x=-Math.PI/2;pilot.position.y=.463;socket.add(pilot);
        const lip=new THREE.Mesh(keep(new THREE.TorusGeometry(.215,.022,10,48)),chrome);
        lip.rotation.x=-Math.PI/2;lip.position.y=.462;socket.add(lip);
        const ferrule=new THREE.Mesh(keep(new THREE.CylinderGeometry(.106,.118,.24,28)),chrome);
        ferrule.position.y=.55;ferrule.castShadow=true;socket.add(ferrule);
        const boot=new THREE.Mesh(keep(new THREE.CylinderGeometry(.090,.13,.17,28)),black);
        boot.position.y=.71;boot.castShadow=true;socket.add(boot);
        for(const distance of [.51,.59]){
          const rib=new THREE.Mesh(keep(new THREE.TorusGeometry(.11,.012,8,32)),gold);
          rib.rotation.x=-Math.PI/2;rib.position.y=distance;socket.add(rib);
        }
        socket.updateMatrixWorld(true);
        const point=distance=>socket.localToWorld(new THREE.Vector3(0,distance,0)).toArray();
        return {inside:point(.36),approach:point(.95)};
      }
      function rebuildEnclosure() {
        renderer.shadowMap.needsUpdate=true;
        assembly.clear();
        for(const resource of assemblyResources){resources.delete(resource);resource.dispose();}
        const resourcesBefore=new Set(resources);
        const meshesBefore=new Set(device.children);
        // The physical face fills the pane. Insets and raised edges establish
        // scale without a separate room, floor or floating product enclosure.
        block(paneW+.14,paneH+.14,.3,.12,chassis,0,0,-.3);
        block(paneW-.10,paneH-.10,.02,.10,chrome,0,0,.02);
        block(paneW-.18,paneH-.18,.02,.09,gold,0,0,.07);
        block(paneW-.25,paneH-.25,.025,.08,enamel,0,0,.095);
        const artwork=new THREE.Mesh(keep(new THREE.PlaneGeometry(paneW-.28,paneH-.28)),cabinetMaterial);
        artwork.position.z=.176;device.add(artwork);
        // One animated creature perches on the rim. Its skull/mouth is a
        // control; the shell stays registered as the discrete art frames swap.
        const crabSize=portrait?1.04:1.58;
        crabRig=new THREE.Group();crabRig.position.set(portrait?.82:-.34,portrait?paneH/2-1.34:1.16,.52);device.add(crabRig);
        const crabArt=new THREE.Mesh(keep(new THREE.PlaneGeometry(crabSize,crabSize)),crabMaterial);
        crabArt.renderOrder=6;crabRig.add(crabArt);
        const crabFaceX=crabSize*.30,crabFaceY=-crabSize*.11;
        crabMouth=new THREE.Mesh(keep(new THREE.OctahedronGeometry(portrait?.026:.038,1)),crabMouthMaterial);
        crabMouth.position.set(crabFaceX,crabFaceY,.035);crabMouth.renderOrder=7;crabRig.add(crabMouth);
        crabTarget=new THREE.Mesh(keep(new THREE.CircleGeometry(portrait?.19:.23,32)),keep(new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false})));
        crabTarget.position.set(crabFaceX,crabFaceY+.25,.05);crabRig.add(crabTarget);
        if(portrait) {
          // Leave a distinct right-hand bay in the stacked face. The field
          // keeps its world-space touch geometry by undoing this scale in pick().
          chamber.position.set(-.28,paneH/2-2.25,.09);chamber.scale.setScalar(.82);
          panelWorld={x:0,y:-paneH/2+1.22,w:Math.min(paneW-.65,5.1),h:2.05,z:.23};
        }else{
          chamber.position.set(-paneW/2+2.04,-.03,.09);chamber.scale.setScalar(1);
          panelWorld={x:paneW/2-2.24,y:-.98,w:3.76,h:1.85,z:.23};
        }
        // The relic floats within the cabinet engraving. Its lower fingers
        // disappear behind the physical control deck in the wide composition;
        // the portrait layout gives it a separate space beside the portal.
        const heartH=portrait?1.85:2.05,heartW=heartH*1024/1536;
        const heartX=portrait?paneW/2-1.10:paneW/2-2.25,heartY=portrait?chamber.position.y-.56:paneH/2-1.18;
        // The wrist stays fixed in the cabinet while the hand turns the jewel.
        heartRig=new THREE.Group();heartRig.position.set(heartX+heartW*(535/620-.5),heartY+heartH*(.5-830/900),.195);device.add(heartRig);
        heartArt=new THREE.Mesh(keep(new THREE.PlaneGeometry(heartW,heartH,24,36)),heartMaterial);
        heartArt.position.set(-heartW*(535/620-.5),-heartH*(.5-830/900),0);heartRig.add(heartArt);
        const graft=new THREE.Mesh(heartArt.geometry,wristGraftMaterial);
        graft.position.copy(heartArt.position);graft.position.x-=heartW*.032;graft.position.y+=heartH*.011;graft.position.z+=.004;
        graft.renderOrder=10;heartRig.add(graft);
        heartTarget=new THREE.Mesh(keep(new THREE.CircleGeometry(portrait?.18:.24,32)),keep(new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false})));
        heartTarget.position.set(heartArt.position.x-heartW*.14,heartArt.position.y+heartH*.28,.06);heartRig.add(heartTarget);
        haloTarget=new THREE.Mesh(keep(new THREE.RingGeometry(.245,.43,64)),keep(new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false})));
        haloTarget.position.copy(heartTarget.position);haloTarget.position.z=.08;heartRig.add(haloTarget);
        // Two engraved bearings expose Scatter and Grain as physical settings.
        heartGimbal=new THREE.Group();heartGimbal.position.copy(heartTarget.position);heartGimbal.position.z=.075;heartRig.add(heartGimbal);
        jewelMetal=keep(new THREE.MeshPhysicalMaterial({color:'#e7c9a0',metalness:.9,roughness:.18,emissive:'#794b9a',emissiveIntensity:.08,clearcoat:1}));
        for(const start of [.15,Math.PI+.15]){
          const arc=new THREE.Mesh(keep(new THREE.TorusGeometry(.205,.007,6,44,Math.PI*.72)),jewelMetal);
          arc.rotation.z=start;heartGimbal.add(arc);
        }
        heartGrainDial=new THREE.Group();heartGimbal.add(heartGrainDial);
        for(const start of [0,Math.PI]){
          const arc=new THREE.Mesh(keep(new THREE.TorusGeometry(.153,.004,6,36,Math.PI*.38)),chrome);
          arc.rotation.z=start;arc.position.z=.004;heartGrainDial.add(arc);
        }
        // The outer split collar is a second two-axis surface: turning it blends
        // the effect, while pulling it changes how much spectral memory remains.
        memoryHalo=new THREE.Group();memoryHalo.position.copy(heartTarget.position);memoryHalo.position.z=.07;heartRig.add(memoryHalo);
        haloMetal=keep(new THREE.MeshPhysicalMaterial({color:'#dbabd6',metalness:.85,roughness:.18,transparent:true,opacity:.55,emissive:'#57225f',emissiveIntensity:.10,clearcoat:1}));
        for(const start of [.20,Math.PI+.20]){
          const arc=new THREE.Mesh(keep(new THREE.TorusGeometry(.35,.009,8,64,Math.PI*.62)),haloMetal);
          arc.rotation.z=start;memoryHalo.add(arc);
        }
        const haloIndex=new THREE.Mesh(keep(new THREE.OctahedronGeometry(.028,0)),spectralCrystal);
        haloIndex.position.set(0,.35,.012);memoryHalo.add(haloIndex);
        titleArc.scale.setScalar(1);
        titleArc.position.y=0;
        block(panelWorld.w+.16,panelWorld.h+.17,.035,.12,gold,panelWorld.x,panelWorld.y,.11);
        block(panelWorld.w+.10,panelWorld.h+.10,.03,.11,porcelain,panelWorld.x,panelWorld.y,.15);
        const inputX=-paneW/2+(portrait?.46:.55),inputY=portrait?-.16:-paneH/2+.68;
        // The output is seated inside the photographed open wrist, at the
        // same image-space landmark in both layouts. Its boot protrudes into
        // the real 3D cable; the hand's lip occludes the socket mount.
        const outputX=heartX+heartW*(535/620-.5),outputY=heartY+heartH*(.5-830/900);
        // The mouth is an authored PhotoCraft relic laid around a real socket.
        // Pixel-space alignment of the source aperture is preserved as the face
        // scales between wide and portrait panels.
        const relicW=portrait?.85:1.19,relicH=relicW*479/330;
        const relic=new THREE.Mesh(keep(new THREE.PlaneGeometry(relicW,relicH,40,56)),mouthRelicMaterial);
        const mouth=imagePixelPoint(330*.394,479*.647,330,479,relicW,relicH);
        relic.position.set(inputX-mouth.x,inputY-mouth.y,.28);
        device.add(relic);
        for(const [index,material] of gazeMaterials.entries()){
          const gaze=new THREE.Mesh(keep(new THREE.PlaneGeometry(relicW,relicH,40,56)),material);
          gaze.position.copy(relic.position);gaze.position.z+=.004+index*.0003;device.add(gaze);
        }
        const eye=new THREE.Mesh(keep(new THREE.TorusGeometry(relicW*.119,relicW*.006,8,48)),relicEyeLight);
        eye.position.set(relic.position.x+relicW*(.606-.5),relic.position.y+relicH*(.5-.44),.292);
        device.add(eye);
        const eyeSprite=imagePixelRect(163,172,94,87,330,479,relicW,relicH);
        const shutter=new THREE.Mesh(keep(new THREE.PlaneGeometry(eyeSprite.width,eyeSprite.height)),shutterMaterial);
        shutter.position.set(relic.position.x+eyeSprite.x,relic.position.y+eyeSprite.y,.305);
        device.add(shutter);
        eyeTarget=shutter;
        const inputSocket=connector(inputX,inputY,portrait?.46:.54),outputSocket=connector(outputX,outputY,portrait?.44:.40,[.65,-.45,.61]);
        // The jacks live in exposed cabinet rails. The optical loom enters
        // their ferrules without crossing the field or the parameter deck.
        rainbowCable([[-paneW/2-.40,inputY-.40,.24],[-paneW/2+.04,inputY-.30,.43],[-paneW/2+.22,inputY-.12,.61],inputSocket.approach,inputSocket.inside],.050);
        rainbowCable([[paneW/2+.40,outputY+.55,.24],[paneW/2-.04,outputY+.50,.43],[paneW/2-.48,outputY+.27,.55],outputSocket.approach,outputSocket.inside],.045);
        for(const x of [-paneW/2+.20,paneW/2-.20])for(const y of [-paneH/2+.19,paneH/2-.19]) {
          const screw=new THREE.Mesh(keep(new THREE.CylinderGeometry(.047,.047,.025,24)),chrome);screw.rotation.x=Math.PI/2;screw.position.set(x,y,.19);device.add(screw);
          const slot=new THREE.Mesh(keep(new THREE.BoxGeometry(.055,.009,.006)),black);slot.position.set(x,y,.206);device.add(slot);
        }
        for(const object of [...device.children])if(!meshesBefore.has(object)&&object!==assembly)assembly.attach(object);
        assemblyResources=[...resources].filter(resource=>!resourcesBefore.has(resource));
      }
      function resize() {
        width=face.clientWidth;height=face.clientHeight;if(!width||!height)return;
        // The 1300 × 750 face is the canonical wide composition. Keep the
        // portal, hand and control deck in this relationship at nearby sizes.
        // Studio's narrower preview uses the stacked composition.
        const aspect=width/height,nextPortrait=aspect<1.60;
        const nextH=nextPortrait?Math.max(6.25,4.45/aspect):4.7,nextW=nextH*aspect;
        const changed=nextPortrait!==portrait||!panelWorld||Math.abs(nextW-paneW)>.001||Math.abs(nextH-paneH)>.001;
        portrait=nextPortrait;paneW=nextW;paneH=nextH;face.dataset.portrait=portrait;
        fitCabinetTexture();
        if(changed){mountPanel();rebuildEnclosure();}
        renderer.setSize(width,height,false);
        camera.left=-paneW/2;camera.right=paneW/2;camera.top=paneH/2;camera.bottom=-paneH/2;
        camera.position.set(0,0,8);camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();placeConsole();
        face.dataset.framing='panel-is-device';
      }
      const observer=new ResizeObserver(resize);observer.observe(face);resize();
      function update() {
        if (JSON.stringify(api.layout) !== panelSignature) mountPanel();
        const active=read('active')>0;
        sourceButton.textContent='HOST';sourceButton.setAttribute('aria-label','Host audio input');
        activeButton.textContent=active?'ENGAGED':'BYPASSED';activeButton.setAttribute('aria-pressed',String(active));
        const holding=read('hold')>=.5;holdButton.textContent=holding?'RELEASE':'HOLD';holdButton.setAttribute('aria-pressed',String(holding));
        for(const button of face.querySelectorAll('[data-preset]')){const preset=materials[Number(button.dataset.preset)].values;button.setAttribute('aria-pressed',String(Object.entries(preset).filter(([name])=>hasPrism||!name.startsWith('prism')).every(([name,value])=>Math.abs(read(name)-value)<.001)));}
      }
      update();
      function animate(now) {
        if(disposed)return;
        if(!width||!height){previous=now;requestAnimationFrame(animate);return;}
        if(!environmentReady)prepareEnvironment();
        applyFieldTarget();
        const dt=Math.max(0,Math.min(.05,(now-previous)/1000));previous=now;
        const analysis=api.analysis();const rms=analysis?.rms??0;
        energy=followTelemetry(energy,Math.min(1,Math.sqrt(rms*12)),dt,9);peak=followTelemetry(peak,Math.max(0,analysis?.peakHz??0),dt,4);
        const bands=analysis?.bands;let upper=0,lower=0;for(let i=0;i<32;i++){const value=bands?.[i]??0;const rib=spectralRibs[i];rib.rib.scale.y=.3+value*4;rib.rib.position.x=Math.cos(rib.angle)*(ribBase+value*.12);rib.rib.position.y=Math.sin(rib.angle)*(ribBase+value*.12);rib.material.emissiveIntensity=.12+value*2.5;bars[i].style.background='hsl('+(170+i*4.8)+' 65% 70%)';bars[i].style.transform='scaleY('+Math.max(.025,value)+')';if(i>18)upper+=value/13;else lower+=value/19;}
        // Accepted focus + measured spectral peak choose nearby standing modes.
        const targetN=2+Math.log2(read('focus')/160)*.65+upper*1.8;
        const targetM=4+(read('shift')+12)/5+Math.log2(1+peak/1000)*.6;
        modeN+=(targetN-modeN)*(1-Math.exp(-dt*2));modeM+=(targetM-modeM)*(1-Math.exp(-dt*2));
        // Dragged values and panel sliders move the same engraved hardware.
        // The hand turns around its wrist rather than wobbling in the shader.
        const ease=reduced.matches?1:1-Math.exp(-dt*17);
        const focusPosition=THREE.MathUtils.clamp(Math.log(read('focus')/160)/Math.log(10000/160),0,1);
        const irisSize=.94+focusPosition*.10;
        focusIris.scale.x+=(irisSize-focusIris.scale.x)*ease;
        focusIris.scale.y+=(irisSize-focusIris.scale.y)*ease;
        const shiftAngle=read('shift')/12*.19;
        ticks.rotation.z+=(shiftAngle-ticks.rotation.z)*ease;
        const scatter=previewHeart?.scatter??read('scatter');
        const grainSize=previewHeart?.grainSize??read('grainSize');
        const grain=THREE.MathUtils.clamp((grainSize-20)/230,0,1);
        const mix=previewHalo?.mix??read('mix');
        const afterimage=previewHalo?.afterimage??read('afterimage');
        const crabEdge=previewCrab?.edge??read(crabXAxis),crabHeat=previewCrab?.heat??read(crabYAxis);
        const crabHot=THREE.MathUtils.clamp(crabHeat/40,0,1);
        const crabPose=held?.kind==='crab'?2:hoverKind==='crab'?1:crabHot>.68?2:energy>.16&&!reduced.matches?(Math.floor(now/850)%2?2:1):0;
        if(crabTextures[crabPose]&&crabPose!==crabFrame&&now-crabLastSwitch>180){
          crabFrame=crabPose;crabLastSwitch=now;crabMaterial.map=crabTextures[crabFrame];
        }
        crabRig.rotation.z+=((THREE.MathUtils.clamp(Math.log(crabEdge/4800)*.035,-.09,.09)+(held?.kind==='crab' ? .025 : 0))-crabRig.rotation.z)*ease;
        crabMouthMaterial.opacity=.08+crabHot*.55+energy*.2+(held?.kind==='crab' ? .15 : 0);
        crabMouthMaterial.color.setHSL(.79-crabHot*.20,.88,.64);
        crabMouth.scale.setScalar(1+energy*.35+(held?.kind==='crab' ? .45 : 0));
        face.dataset.crabFrame=String(crabFrame);face.dataset.crabEdge=crabEdge.toFixed(1);face.dataset.crabHeat=crabHeat.toFixed(1);
        const poseTarget=afterimage>=.70&&handPoseTextures[2]?2:afterimage>=.35&&handPoseTextures[1]?1:0;
        if(poseTarget!==graspFrame){graspFrame=poseTarget;heartMaterial.map=handPoseTextures[graspFrame];}
        face.dataset.graspFrame=String(graspFrame);
        const wristAngle=(scatter-.28)*.25+(held?.kind==='heart' ? .028 : hoverKind==='heart' ? .016 : 0);
        const wristTilt=(grainSize-85)/165*.12;
        heartRig.rotation.z+=(wristAngle-heartRig.rotation.z)*ease;
        heartRig.rotation.y+=(wristTilt-heartRig.rotation.y)*ease;
        const press=held?.kind==='heart'?1:0;
        heartRig.position.z+=(.195+((hoverKind==='heart'||press) ? .016 : 0)-press*.028-heartRig.position.z)*ease;
        // Tilting around the wrist can put the far edge behind the cabinet
        // artwork (z=.176). Keep the entire cutout in front, including while
        // pressed, without disabling depth against the socket or control deck.
        let handBack=Infinity;
        const handSize=heartArt.geometry.parameters;
        for(let corner=0;corner<4;corner++){
          handCorner.set((corner&1?.5:-.5)*handSize.width,(corner&2?.5:-.5)*handSize.height,0).add(heartArt.position).applyQuaternion(heartRig.quaternion);
          handBack=Math.min(handBack,handCorner.z);
        }
        heartRig.position.z=Math.max(heartRig.position.z,.182-handBack);
        heartGimbal.rotation.z+=((scatter-.28)*.8-heartGimbal.rotation.z)*ease;
        const jewelSize=held?.kind==='heart' ? 1.12 : hoverKind==='heart' ? 1.08 : 1;
        heartGimbal.scale.x+=(jewelSize-heartGimbal.scale.x)*ease;
        heartGimbal.scale.y+=(jewelSize-heartGimbal.scale.y)*ease;
        heartGrainDial.rotation.z+=((grain-.28)*.95-heartGrainDial.rotation.z)*ease;
        memoryHalo.rotation.z+=((mix-.64)*.75-memoryHalo.rotation.z)*ease;
        const haloSize=.93+afterimage*.20+(held?.kind==='halo' ? .035 : hoverKind==='halo' ? .015 : 0);
        memoryHalo.scale.x+=(haloSize-memoryHalo.scale.x)*ease;
        memoryHalo.scale.y+=(haloSize-memoryHalo.scale.y)*ease;
        jewelMetal.emissiveIntensity=.08+(held?.kind==='heart' ? .9 : hoverKind==='heart' ? .52 : 0)+energy*.10;
        haloMetal.emissiveIntensity=.10+(held?.kind==='halo' ? .45 : hoverKind==='halo' ? .22 : 0)+energy*.10;
        face.dataset.handAngle=heartRig.rotation.z.toFixed(4);
        face.dataset.jewelAngle=heartGimbal.rotation.z.toFixed(4);
        face.dataset.grainDialAngle=heartGrainDial.rotation.z.toFixed(4);
        face.dataset.memoryHaloAngle=memoryHalo.rotation.z.toFixed(4);
        face.dataset.memoryHaloScale=memoryHalo.scale.x.toFixed(4);
        face.dataset.irisScale=focusIris.scale.x.toFixed(4);
        face.dataset.indexAngle=ticks.rotation.z.toFixed(4);
        phase+=reduced.matches?0:dt*(.5+energy*1.1);fieldImpulse=held?.9:fieldImpulse*Math.exp(-dt*5);
        const n=modeN*Math.PI/1.28,m=modeM*Math.PI/1.28;
        if(!reduced.matches)for(let i=frame%2;i<count;i+=2){
          const index=i*3,v=i*2,x=positions[index],y=positions[index+1];
          const nx=n*x,ny=n*y,mx=m*x,my=m*y;
          const cnx=Math.cos(nx),cny=Math.cos(ny),cmx=Math.cos(mx),cmy=Math.cos(my);
          const f=cnx*cmy-cmx*cny;
          const gx=-n*Math.sin(nx)*cmy+m*Math.sin(mx)*cny,gy=-m*cnx*Math.sin(my)+n*cmx*Math.sin(ny);
          const localPressure=fieldImpulse*Math.exp(-((x-contact.x)**2+(y-contact.y)**2)*12.);
          const agitation=energy*.0006+localPressure*.002;const step=dt*2;
          velocities[v]+=(x-contact.x)*localPressure*.006;velocities[v+1]+=(y-contact.y)*localPressure*.006;
          velocities[v]=(velocities[v]-f*gx*.14*step)*.86+(random()-.5)*agitation;
          velocities[v+1]=(velocities[v+1]-f*gy*.14*step)*.86+(random()-.5)*agitation;
          positions[index]+=THREE.MathUtils.clamp(velocities[v],-.018,.018);positions[index+1]+=THREE.MathUtils.clamp(velocities[v+1],-.018,.018);
          const r=Math.hypot(positions[index],positions[index+1]);if(r>1.29){positions[index]*=1.28/r;positions[index+1]*=1.28/r;velocities[v]*=-.3;velocities[v+1]*=-.3;}
          positions[index+2]=.16+Math.exp(-Math.abs(f)*9)*.045+energy*.02*Math.sin(phase*5+seeds[i]*20);
        }
        particleGeometry.attributes.position.needsUpdate=!reduced.matches;
        if(frame%8===0)drawContours(n,m);
        liquidUniforms.fieldTouch.value.set(contact.x,contact.y,fieldImpulse);liquidUniforms.fieldN.value=modeN;liquidUniforms.fieldM.value=modeM;liquidUniforms.fieldTime.value=phase;liquidUniforms.fieldEnergy.value=energy;liquidUniforms.fieldMemory.value=afterimage;liquidUniforms.fieldShift.value=(read('shift')+12)/24;
        particleUniforms.energy.value=energy;particleUniforms.hue.value=upper;particleUniforms.time.value=phase;
        contourMaterial.opacity=.5+energy*.45;contourMaterial.color.setHSL(.46+upper*.4,.74,.64).multiplyScalar(1.6);
        constellation.rotation.z=reduced.matches?0:Math.sin(phase*.3)*.06;
        for(let i=0;i<constellation.children.length;i++){const star=constellation.children[i];star.rotation.y=reduced.matches?i*.7:phase*.35+i*.7;star.scale.z=1.2+energy*.8;}

        cableUniforms.time.value=phase;cableUniforms.energy.value=energy;
        heartUniforms.heartTime.value=phase;heartUniforms.heartEnergy.value=energy;heartUniforms.heartScatter.value=scatter;heartUniforms.heartGrain.value=grain;
        relicUniforms.relicTime.value=phase;relicUniforms.relicEnergy.value=energy;
        socketLight.opacity=.10+energy*.6;socketLight.color.setHSL(.48+upper*.2,.8,.65);
        relicEyeLight.opacity=.07+Math.min(.7,energy*.55+upper*.35);
        relicEyeLight.color.setHSL(.49+Math.min(.3,upper*.3),.9,.67);
        const holding=read('hold')>=.5;
        const cursorPresent=now-cursorAt<2200;
        const targetOpen=Math.min(1,Math.max(holding?.88:0,cursorPresent?.60:0,(energy-.025)*3.8));
        gazeOpen+=(targetOpen-gazeOpen)*(1-Math.exp(-dt*(targetOpen>gazeOpen?5:3)));
        const gazeSignal=cursorPresent?(cursorX-.5)*2:Math.sin(phase*.65)+read('shift')*.075+upper*.35;
        if((cursorPresent||!reduced.matches)&&gazeFramesReady===2&&now-lastGazeSwitch>(cursorPresent?90:850)&&((gazeSignal>.08?1:0)!==gazeSide)){
          gazeSide=gazeSignal>.08?1:0;lastGazeSwitch=now;
        }
        gazeBlend+=(gazeSide-gazeBlend)*(1-Math.exp(-dt*12));
        const blink=!reduced.matches&&gazeOpen>.15?Math.pow(Math.max(0,Math.sin(phase*1.83)),36)*.94:0;
        const visibleEye=gazeOpen*(1-blink);
        gazeMaterials[0].opacity=visibleEye*(1-gazeBlend);
        gazeMaterials[1].opacity=visibleEye*gazeBlend;
        face.dataset.gazeOpen=visibleEye.toFixed(3);face.dataset.gazeSide=gazeBlend.toFixed(3);
        shutterMaterial.opacity=holding?Math.min(1,shutterMaterial.opacity+dt*7):Math.max(0,shutterMaterial.opacity-dt*8);
        if(!holding&&energy>.12&&!reduced.matches){const blink=Math.pow(Math.max(0,Math.sin(phase*2.3)),28);shutterMaterial.opacity=Math.max(shutterMaterial.opacity,blink*.9);}
        face.dataset.reliefMotion=(energy*.15).toFixed(4);face.dataset.memoryHeld=String(holding);
        face.querySelector('.nacre-mode').textContent='MODE '+modeN.toFixed(1)+' / '+modeM.toFixed(1);
        face.querySelector('.nacre-level').textContent=rms>1e-5?(20*Math.log10(rms)).toFixed(1)+' dB':'−∞ dB';
        const status=face.querySelector('.nacre-status');status.dataset.live=String(rms>1e-5);
        status.lastElementChild.textContent=(held?.kind==='heart'||hoverKind==='heart')?'GRAIN ↕ · SCATTER ↔':(held?.kind==='halo'||hoverKind==='halo')?'MIX ↔ · MEMORY ↕':(held?.kind==='crab'||hoverKind==='crab')?(hasPrism?'EDGE ↔ · HEAT ↕':'FOCUS ↔ · DRIVE ↕'):rms>1e-5?'RESONATING':'STANDBY';
        face.dataset.contactX=contact.x.toFixed(3);face.dataset.contactY=contact.y.toFixed(3);face.dataset.contactPressure=fieldImpulse.toFixed(4);face.dataset.energy=energy.toFixed(5);face.dataset.peakHz=peak.toFixed(2);face.dataset.modeN=modeN.toFixed(3);face.dataset.modeM=modeM.toFixed(3);face.dataset.particleCount=count;face.dataset.frame=frame;
        if(frame%15===0){let residual=0;for(let i=0;i<count;i+=47){const x=positions[i*3],y=positions[i*3+1];residual+=Math.abs(Math.cos(n*x)*Math.cos(m*y)-Math.cos(m*x)*Math.cos(n*y));}face.dataset.nodalResidual=(residual/Math.ceil(count/47)).toFixed(5);}
        renderer.render(scene,camera);face.dataset.drawCalls=renderer.info.render.calls;frame++;requestAnimationFrame(animate);
      }
      requestAnimationFrame(animate);
      return {update,updateLayout:mountPanel,dispose(){disposed=true;observer.disconnect();panel.dispose();releaseEnvironmentScene();for(const resource of resources)resource.dispose();key.shadow.dispose();renderer.dispose();renderer.forceContextLoss();face.remove();}};
    },
  };
}
