import * as THREE from 'three';

// One field object, in the same lit scene as Nacre's enclosure and controls.
// Its named graph inputs own the response; geometry and shaders remain authored.
export default function standingWaveField() {
  return {
    create(api) {
      const scene = api.resource('scene');
      const { renderer, face, reduced } = scene;
      const { chrome, gold, ceramic, black, spectralCrystal } = scene.materials;
      const chamber = new THREE.Group();
      scene.chamber.add(chamber);
      const resources = new Set();
      const keep = (resource) => {
        resources.add(resource);
        return resource;
      };
      let frame = 0;
      const chamberRadius = 1.63;
      const torus = (radius, tube, material, z) => {
        const mesh = new THREE.Mesh(keep(new THREE.TorusGeometry(radius, tube, 10, 180)), material);
        mesh.position.z = z;
        chamber.add(mesh);
        return mesh;
      };
      torus(1.71, 0.07, chrome, 0.24);
      torus(1.65, 0.012, gold, 0.29);
      torus(1.59, 0.025, ceramic, 0.3);
      const focusIris = torus(1.48, 0.017, chrome, 0.13);
      const well = new THREE.Mesh(
        keep(new THREE.CylinderGeometry(1.68, 1.68, 0.26, 160, 1, true)),
        black,
      );
      well.rotation.x = Math.PI / 2;
      well.position.z = 0.08;
      chamber.add(well);
      const ticks = new THREE.Group();
      chamber.add(ticks);
      for (let i = 0; i < 80; i++) {
        const angle = (i / 80) * Math.PI * 2;
        const tick = new THREE.Mesh(
          keep(new THREE.BoxGeometry(i % 5 === 0 ? 0.052 : 0.025, 0.006, 0.012)),
          i % 5 === 0 ? chrome : ceramic,
        );
        tick.position.set(Math.cos(angle) * 1.78, Math.sin(angle) * 1.78, 0.22);
        tick.rotation.z = angle;
        ticks.add(tick);
      }

      // Liquid chrome uses the physical material's actual environment reflection.
      // The standing-wave normal bends it into nodal ridges and microscopic noise.
      const liquidUniforms = {
        fieldN: { value: 4 },
        fieldM: { value: 7 },
        fieldTime: { value: 0 },
        fieldEnergy: { value: 0 },
        fieldMemory: { value: 0 },
        fieldShift: { value: 0.5 },
        fieldTouch: { value: new THREE.Vector3(0, 0, 0) },
      };
      const liquid = keep(
        new THREE.MeshPhysicalMaterial({
          color: '#506c85',
          metalness: 1,
          roughness: 0.21,
          clearcoat: 1,
          clearcoatRoughness: 0.06,
          iridescence: 1,
          iridescenceIOR: 1.32,
          iridescenceThicknessRange: [110, 530],
        }),
      );
      liquid.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, liquidUniforms);
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            `#include <common>
          varying vec2 fieldUv;uniform float fieldN;uniform float fieldM;uniform float fieldEnergy;uniform vec3 fieldTouch;uniform float fieldTime;
        `,
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
          fieldUv=uv;vec2 waveP=(uv*2.-1.)*1.52/1.28*3.14159265;
          float waveF=cos(fieldN*waveP.x)*cos(fieldM*waveP.y)-cos(fieldM*waveP.x)*cos(fieldN*waveP.y);
          float touchD=distance((uv*2.-1.)*1.52,fieldTouch.xy);
          transformed.z+=sin(waveF*3.5)*(.006+fieldEnergy*.023)+fieldTouch.z*exp(-touchD*touchD*8.)*sin(touchD*25.-fieldTime*6.)*.035;
        `,
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
          varying vec2 fieldUv;uniform float fieldN;uniform float fieldM;uniform float fieldTime;uniform float fieldEnergy;uniform float fieldMemory;uniform float fieldShift;
          float standing(vec2 p){p*=3.14159265;return cos(fieldN*p.x)*cos(fieldM*p.y)-cos(fieldM*p.x)*cos(fieldN*p.y);}
          float relief(vec2 p){float f=standing(p);float lattice=sin(p.x*75.+fieldTime*.12)*cos(p.y*67.-fieldTime*.16);return (.018+fieldEnergy*.015)*sin(f*3.5)+.013*lattice*fieldEnergy;}
        `,
          )
          .replace(
            '#include <normal_fragment_maps>',
            `#include <normal_fragment_maps>
          if(distance(fieldUv,vec2(.5))>.5)discard;
          vec2 p=(fieldUv*2.-1.)*1.52/1.28;float h=relief(p);vec2 grad=vec2(relief(p+vec2(.002,0.))-h,relief(p+vec2(0.,.002))-h)/.002;
          normal=normalize(normal+vec3(grad*.52,0.));
        `,
          )
          .replace(
            '#include <lights_physical_fragment>',
            `#include <lights_physical_fragment>
          #ifdef USE_IRIDESCENCE
            vec2 crystalP=fieldUv*2.-1.;
            material.iridescenceThickness=100.+620.*(.5+.5*sin(crystalP.x*3.7+crystalP.y*2.4+standing(crystalP)*1.6+fieldTime*.14));
          #endif
        `,
          )
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
          vec2 lightP=(fieldUv*2.-1.)*1.52/1.28;
          float nodalGlow=exp(-abs(standing(lightP))*10.);
          float memoryGlow=exp(-abs(standing(lightP+vec2(.08,-.11)))*12.);
          vec3 spectralLight=.5+.5*cos(6.28318*(vec3(.08,.38,.72)+fieldUv.x*.5+fieldUv.y*.21+fieldShift*.4));
          totalEmissiveRadiance+=spectralLight*nodalGlow*(.06+fieldEnergy*.22);
          totalEmissiveRadiance+=vec3(.20,.08,.28)*memoryGlow*fieldMemory*(.06+fieldEnergy*.30);
        `,
          );
      };
      const pool = new THREE.Mesh(keep(new THREE.PlaneGeometry(3.04, 3.04, 96, 96)), liquid);
      pool.position.z = 0.11;
      chamber.add(pool);

      // A crystalline cavity extends behind the standing-wave plate.
      const crystal = keep(
        new THREE.MeshPhysicalMaterial({
          color: '#b8cddd',
          metalness: 0.6,
          roughness: 0.12,
          iridescence: 1,
          iridescenceIOR: 1.45,
          iridescenceThicknessRange: [100, 660],
          clearcoat: 1,
        }),
      );
      const crystals = new THREE.InstancedMesh(
        keep(new THREE.IcosahedronGeometry(1, 0)),
        crystal,
        96,
      );
      const dummy = new THREE.Object3D();
      for (let i = 0; i < 96; i++) {
        const angle = (i / 96) * Math.PI * 2;
        const r = 1.37 + 0.08 * Math.sin(i * 2.3);
        dummy.position.set(
          Math.cos(angle) * r,
          Math.sin(angle) * r,
          0.17 + Math.sin(i * 1.2) * 0.025,
        );
        dummy.scale.set(0.04 + 0.03 * (i % 3), 0.085 + 0.015 * (i % 5), 0.06);
        dummy.rotation.set(i * 0.43, i * 0.79, angle);
        dummy.updateMatrix();
        crystals.setMatrixAt(i, dummy.matrix);
      }
      chamber.add(crystals);
      // A bounded particle simulation relaxes grains toward F(x,y)=0. The force
      // is -gradient(F²), with audio energy adding agitation; it is not a DSP loop.
      const count = 10000,
        positions = new Float32Array(count * 3),
        velocities = new Float32Array(count * 2),
        seeds = new Float32Array(count);
      let randomState = 9137;
      const random = () => {
        randomState = (Math.imul(randomState, 1664525) + 1013904223) | 0;
        return (randomState >>> 0) / 4294967296;
      };
      for (let i = 0; i < count; i++) {
        const angle = random() * Math.PI * 2,
          r = Math.sqrt(random()) * 1.28;
        positions[i * 3] = Math.cos(angle) * r;
        positions[i * 3 + 1] = Math.sin(angle) * r;
        positions[i * 3 + 2] = 0.15;
        seeds[i] = random();
      }
      const particleGeometry = keep(new THREE.BufferGeometry());
      particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      particleGeometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
      const particleUniforms = {
        energy: { value: 0 },
        time: { value: 0 },
        pixelRatio: { value: renderer.getPixelRatio() },
        hue: { value: 0.4 },
      };
      const particleMaterial = keep(
        new THREE.ShaderMaterial({
          uniforms: particleUniforms,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          vertexShader: `attribute float seed;varying float grain;uniform float energy;uniform float pixelRatio;void main(){grain=seed;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp((1.6+seed*1.6+energy*.65)*pixelRatio,1.,5.);}`,
          fragmentShader: `varying float grain;uniform float energy;uniform float hue;void main(){vec2 p=gl_PointCoord-.5;float r=length(p);if(r>.5)discard;float a=smoothstep(.5,.05,r);vec3 c=.65+.35*cos(6.28318*(vec3(.05,.38,.7)+grain*.22+hue*.2));c=mix(vec3(.62,.82,.85),c,.55);c=mix(c,.5+.5*cos(6.28318*(vec3(.02,.35,.67)+grain*.37+hue*.26)),.7);gl_FragColor=vec4(c*(1.1+energy*1.8),a*(.55+grain*.45));}`,
        }),
      );
      const particles = new THREE.Points(particleGeometry, particleMaterial);
      chamber.add(particles);
      // Iso-contours use the same standing wave as the grain force. Their
      // luminous lattice makes the nodal structure legible through the chrome.
      const contourPositions = new Float32Array(72 * 72 * 12);
      const contourGeometry = keep(new THREE.BufferGeometry());
      contourGeometry.setAttribute('position', new THREE.BufferAttribute(contourPositions, 3));
      const contourMaterial = keep(
        new THREE.LineBasicMaterial({
          color: '#8ff4df',
          transparent: true,
          opacity: 0.65,
          depthWrite: false,
        }),
      );
      const contours = new THREE.LineSegments(contourGeometry, contourMaterial);
      chamber.add(contours);
      const corners = new Float32Array(4),
        crossing = new Float32Array(8);
      function drawContours(n, m) {
        let written = 0;
        const side = 72,
          step = 2.56 / side;
        const field = (x, y) =>
          Math.cos(n * x) * Math.cos(m * y) - Math.cos(m * x) * Math.cos(n * y);
        for (let iy = 0; iy < side; iy++)
          for (let ix = 0; ix < side; ix++) {
            const x = -1.28 + ix * step,
              y = -1.28 + iy * step;
            if (Math.hypot(x + step / 2, y + step / 2) > 1.28) continue;
            corners[0] = field(x, y);
            corners[1] = field(x + step, y);
            corners[2] = field(x + step, y + step);
            corners[3] = field(x, y + step);
            let intersections = 0;
            for (let edge = 0; edge < 4; edge++) {
              const next = (edge + 1) % 4,
                a = corners[edge],
                b = corners[next];
              if (a > 0 === b > 0) continue;
              const t = a / (a - b);
              const ax = edge === 1 || edge === 2 ? 1 : 0,
                ay = edge >= 2 ? 1 : 0,
                bx = next === 1 || next === 2 ? 1 : 0,
                by = next >= 2 ? 1 : 0;
              crossing[intersections * 2] = x + (ax + (bx - ax) * t) * step;
              crossing[intersections * 2 + 1] = y + (ay + (by - ay) * t) * step;
              intersections++;
            }
            for (let j = 0; j + 1 < intersections; j += 2)
              for (let k = j; k <= j + 1; k++) {
                contourPositions[written++] = crossing[k * 2];
                contourPositions[written++] = crossing[k * 2 + 1];
                contourPositions[written++] = 0.2;
              }
          }
        contourGeometry.setDrawRange(0, written / 3);
        contourGeometry.attributes.position.needsUpdate = true;
      }
      // Small crystal stars sit on a deeper optical lattice. The prismatic
      // accents come from a thin-film material, reflected in the liquid below.
      const constellation = new THREE.Group();
      chamber.add(constellation);
      const starGeometry = keep(new THREE.OctahedronGeometry(0.034, 0));
      for (let i = 0; i < 28; i++) {
        const a = i * 2.399963,
          r = 0.35 + Math.sqrt(i / 28) * 0.77;
        const star = new THREE.Mesh(starGeometry, spectralCrystal);
        star.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.23 + Math.sin(i) * 0.022);
        star.rotation.set(i * 0.6, i * 0.7, i);
        star.scale.set(1, 0.6 + (i % 3) * 0.4, 1.2);
        constellation.add(star);
      }
      // Frequency becomes light around the chamber. Each crystal rib is one
      // measured logarithmic output band; colour locates it on the spectrum.
      const spectralRibs = [],
        ribBase = 1.29;
      const ribGeometry = keep(new THREE.BoxGeometry(0.018, 0.1, 0.025));
      for (let i = 0; i < 32; i++) {
        const angle = (i / 32) * Math.PI * 2 + Math.PI / 2;
        const color = new THREE.Color().setHSL(0.47 + (i / 32) * 0.43, 0.85, 0.61);
        const material = keep(
          new THREE.MeshPhysicalMaterial({
            color,
            metalness: 0.7,
            roughness: 0.14,
            emissive: color,
            emissiveIntensity: 0.1,
            clearcoat: 1,
          }),
        );
        const rib = new THREE.Mesh(ribGeometry, material);
        rib.position.set(Math.cos(angle) * ribBase, Math.sin(angle) * ribBase, 0.27);
        rib.rotation.z = angle - Math.PI / 2;
        chamber.add(rib);
        spectralRibs.push({ rib, material, angle });
      }
      // The name follows the optical chamber's rim, like an inscription in
      // the reliquary, rather than sitting on an unrelated strip of casing.
      function titleGlyph(letter, color) {
        const surface = document.createElement('canvas');
        surface.width = 192;
        surface.height = 192;
        const pen = surface.getContext('2d');
        pen.fillStyle = color;
        pen.shadowColor = color;
        pen.shadowBlur = 14;
        pen.textAlign = 'center';
        pen.textBaseline = 'middle';
        pen.font = '600 146px ui-monospace, monospace';
        pen.fillText(letter, 96, 99);
        const texture = keep(new THREE.CanvasTexture(surface));
        texture.colorSpace = THREE.SRGBColorSpace;
        return keep(
          new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
        );
      }
      const titleArc = new THREE.Group();
      chamber.add(titleArc);
      const titleColors = ['#7ee6e2', '#d8ebf3', '#eeacfa', '#f6d48b', '#9fe5df'];
      [...'NACRE'].forEach((letter, index) => {
        const angle = Math.PI / 2 + (2 - index) * 0.205;
        const glyph = new THREE.Mesh(
          keep(new THREE.PlaneGeometry(0.33, 0.34)),
          titleGlyph(letter, titleColors[index]),
        );
        glyph.position.set(Math.cos(angle) * 1.94, Math.sin(angle) * 1.94, 0.31);
        glyph.rotation.z = angle - Math.PI / 2;
        titleArc.add(glyph);
      });
      const glass = keep(
        new THREE.MeshPhysicalMaterial({
          color: '#cae6eb',
          metalness: 0.08,
          roughness: 0.045,
          transparent: true,
          opacity: 0.055,
          clearcoat: 1,
          iridescence: 0.6,
          depthWrite: false,
        }),
      );
      const cover = new THREE.Mesh(keep(new THREE.CircleGeometry(1.64, 180)), glass);
      cover.position.z = 0.32;
      chamber.add(cover);

      const object = api.exportResource('resource:three.object', chamber);
      return {
        outputs: () => ({ object }),
        update({ delta: dt }) {
          const energy = api.input('energy') ?? 0;
          const [modeN, modeM] = api.input('modes') ?? [4, 7];
          const focus = api.input('focus') ?? 2400;
          const shift = api.input('shift') ?? 7;
          const afterimage = api.input('afterimage') ?? 0.22;
          const upper = api.input('upper') ?? 0;
          const phase = api.input('phase') ?? 0;
          const [contactX, contactY, fieldImpulse] = api.input('contact') ?? [0, 0, 0];
          const contact = { x: contactX, y: contactY };
          const ease = reduced.matches ? 1 : 1 - Math.exp(-dt * 17);
          const bands = api.input('analysis')?.bands;
          for (let i = 0; i < 32; i++) {
            const value = bands?.[i] ?? 0;
            const { rib, material, angle } = spectralRibs[i];
            rib.scale.y = 0.3 + value * 4;
            rib.position.x = Math.cos(angle) * (ribBase + value * 0.12);
            rib.position.y = Math.sin(angle) * (ribBase + value * 0.12);
            material.emissiveIntensity = 0.12 + value * 2.5;
          }
          const focusPosition = THREE.MathUtils.clamp(
            Math.log(focus / 160) / Math.log(10000 / 160),
            0,
            1,
          );
          const irisSize = 0.94 + focusPosition * 0.1;
          focusIris.scale.x += (irisSize - focusIris.scale.x) * ease;
          focusIris.scale.y += (irisSize - focusIris.scale.y) * ease;
          const shiftAngle = (shift / 12) * 0.19;
          ticks.rotation.z += (shiftAngle - ticks.rotation.z) * ease;
          const n = (modeN * Math.PI) / 1.28,
            m = (modeM * Math.PI) / 1.28;
          if (!reduced.matches)
            for (let i = frame % 2; i < count; i += 2) {
              const index = i * 3,
                v = i * 2,
                x = positions[index],
                y = positions[index + 1];
              const nx = n * x,
                ny = n * y,
                mx = m * x,
                my = m * y;
              const cnx = Math.cos(nx),
                cny = Math.cos(ny),
                cmx = Math.cos(mx),
                cmy = Math.cos(my);
              const f = cnx * cmy - cmx * cny;
              const gx = -n * Math.sin(nx) * cmy + m * Math.sin(mx) * cny,
                gy = -m * cnx * Math.sin(my) + n * cmx * Math.sin(ny);
              const localPressure =
                fieldImpulse * Math.exp(-((x - contact.x) ** 2 + (y - contact.y) ** 2) * 12);
              const agitation = energy * 0.0006 + localPressure * 0.002;
              const step = dt * 2;
              velocities[v] += (x - contact.x) * localPressure * 0.006;
              velocities[v + 1] += (y - contact.y) * localPressure * 0.006;
              velocities[v] =
                (velocities[v] - f * gx * 0.14 * step) * 0.86 + (random() - 0.5) * agitation;
              velocities[v + 1] =
                (velocities[v + 1] - f * gy * 0.14 * step) * 0.86 + (random() - 0.5) * agitation;
              positions[index] += THREE.MathUtils.clamp(velocities[v], -0.018, 0.018);
              positions[index + 1] += THREE.MathUtils.clamp(velocities[v + 1], -0.018, 0.018);
              const r = Math.hypot(positions[index], positions[index + 1]);
              if (r > 1.29) {
                positions[index] *= 1.28 / r;
                positions[index + 1] *= 1.28 / r;
                velocities[v] *= -0.3;
                velocities[v + 1] *= -0.3;
              }
              positions[index + 2] =
                0.16 +
                Math.exp(-Math.abs(f) * 9) * 0.045 +
                energy * 0.02 * Math.sin(phase * 5 + seeds[i] * 20);
            }
          particleGeometry.attributes.position.needsUpdate = !reduced.matches;
          if (frame % 8 === 0) drawContours(n, m);
          liquidUniforms.fieldTouch.value.set(contact.x, contact.y, fieldImpulse);
          liquidUniforms.fieldN.value = modeN;
          liquidUniforms.fieldM.value = modeM;
          liquidUniforms.fieldTime.value = phase;
          liquidUniforms.fieldEnergy.value = energy;
          liquidUniforms.fieldMemory.value = afterimage;
          liquidUniforms.fieldShift.value = (shift + 12) / 24;
          particleUniforms.energy.value = energy;
          particleUniforms.hue.value = upper;
          particleUniforms.time.value = phase;
          contourMaterial.opacity = 0.5 + energy * 0.45;
          contourMaterial.color.setHSL(0.46 + upper * 0.4, 0.74, 0.64).multiplyScalar(1.6);
          constellation.rotation.z = reduced.matches ? 0 : Math.sin(phase * 0.3) * 0.06;
          for (let i = 0; i < constellation.children.length; i++) {
            const star = constellation.children[i];
            star.rotation.y = reduced.matches ? i * 0.7 : phase * 0.35 + i * 0.7;
            star.scale.z = 1.2 + energy * 0.8;
          }

          face.querySelector('.nacre-mode').textContent =
            'MODE ' + modeN.toFixed(1) + ' / ' + modeM.toFixed(1);
          face.dataset.modeN = modeN.toFixed(3);
          face.dataset.modeM = modeM.toFixed(3);
          face.dataset.irisScale = focusIris.scale.x.toFixed(4);
          face.dataset.indexAngle = ticks.rotation.z.toFixed(4);
          face.dataset.particleCount = count;
          face.dataset.fieldFrame = frame++;
        },
        dispose() {
          chamber.removeFromParent();
          for (const resource of resources) resource.dispose();
        },
      };
    },
  };
}
