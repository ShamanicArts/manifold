import { imageFrames, selectImageFrame, transformImage } from 'manifold';

// Build the initial presentation using the same public commands as Studio and
// agents. The saved /composition.json then owns editable instances and wires.
export async function assemblePresentation(runtime, files) {
  const descriptions = {
    focus: 'Reads Spectral focus in Hz. The standing-wave pattern follows this control.',
    displacement:
      'Reads pitch displacement in semitones. Moves the standing-wave pattern with the effect.',
    afterimage: "Reads the Afterimage amount. Controls the field's purple memory glow.",
    'energy-response':
      'Smooths audio energy and dominant frequency, and measures the upper frequency bands. Drives motion and light.',
    'standing-wave-modes':
      'Turns focus, pitch displacement and measured sound into two smoothly changing standing-wave modes.',
    'nacre-scene':
      'Hosts the renderer, cabinet frame, sockets and controls. Shares placement, touch and animation phase with its objects.',
    'prism-edge': 'Reads Prism edge in Hz. Tilts the Oracle creature with the effect control.',
    'prism-heat': 'Reads Prism heat in dB. Chooses the creature pose and lights its mouth.',
    'creature-motion':
      'Chooses a pose, tilt and mouth light from sound, Prism controls, hover and dragging.',
    'creature-artwork':
      'Places the selected creature image on Nacre’s rim and gives its mouth a light and drag target.',
    scatter: 'Reads Scatter. Turns the hand and its engraved bearing.',
    'grain-size': 'Reads Grain in milliseconds. Tilts the wrist and turns the inner bearing.',
    transmutation: 'Reads Transmutation. Turns the memory halo around the crystal.',
    'hand-motion':
      'Turns and presses the wrist and bearings using Grain, Scatter and touch. Local drag values lead audio acknowledgements.',
    'halo-motion':
      'Turns and expands the halo using Transmutation and Afterimage. Selects the hand’s closed, middle or open grasp.',
    'hand-artwork':
      'Draws the connected hand and wrist images, adds crystal relief and bearings, and makes the visible silhouette draggable.',
    'memory-halo':
      'Attaches the engraved memory collar to the connected hand. Drag to change Transmutation and Afterimage.',
    'cabinet-artwork':
      'Fits the connected engraving image inside the cabinet frame, preserving its centre crop and transparency.',
    'relic-artwork':
      'Draws the photographed relic with its height map. Shares its actual surface and relief shader with the eye.',
    'memory-hold': 'Reads Hold. The eyelid closes while spectral memory is held.',
    'eye-motion':
      'Follows the pointer, glances with sound and blinks. Produces separate opacities for the left gaze, right gaze and closed eyelid.',
    'eye-artwork':
      'Draws the three connected eye images on the relic, shares its relief, lights the eye and makes it clickable for Hold.',
    'standing-wave-field':
      'Draws the standing-wave surface, contours and particles. Responds to sound, the effect controls and touch.',
  };
  const input = (name, type = 'scalar', unit) => ({ name, type, ...(unit ? { unit } : {}) });
  const parameter = (name, label, min, max, value) => ({ name, label, min, max, default: value });
  async function add(id, label, implementation, inputs, outputs, parameters, position) {
    await runtime.request({
      operation: 'component.define',
      definition: {
        id,
        version: 1,
        label,
        description: descriptions[id],
        category:
          implementation.kind === 'parameter'
            ? 'Values & motion'
            : id === 'energy-response'
              ? 'Sound analysis'
              : [
                    'standing-wave-modes',
                    'creature-motion',
                    'eye-motion',
                    'hand-motion',
                    'halo-motion',
                  ].includes(id)
                ? 'Values & motion'
                : id === 'standing-wave-field'
                  ? 'Fields'
                  : 'Objects & layout',
        keywords:
          id === 'energy-response'
            ? ['loudness', 'meter', 'smooth']
            : id.startsWith('standing-wave')
              ? ['pattern', 'modes', 'contours']
              : [],
        implementation,
        inputs,
        outputs,
        parameters,
      },
      files,
    });
    await runtime.request({ operation: 'component.add', definitionId: id });
    const node = runtime.save().composition.nodes.at(-1);
    await runtime.request({
      operation: 'component.update',
      id: node.id,
      changes: {
        position,
        ...(implementation.kind === 'web-surface'
          ? { bounds: { x: 0, y: 0, width: 100, height: 100 } }
          : {}),
      },
    });
    return node.id;
  }
  const object = (name) => ({
    kind: 'scene-object',
    entry: `/nacre/${name}.mjs`,
    dependencies: { three: '0.184.0' },
    targets: ['browser', 'webview'],
  });
  const script = (name) => ({
    kind: 'presentation-script',
    entry: `/nacre/${name}.mjs`,
    dependencies: {},
    targets: ['browser', 'webview'],
  });
  const parameterSource = (id, label, path, position) =>
    add(
      id,
      label,
      { kind: 'parameter', path },
      [],
      [
        input(
          'value',
          'scalar',
          ['focus', 'prism-edge'].includes(id)
            ? 'Hz'
            : id === 'displacement'
              ? 'st'
              : id === 'prism-heat'
                ? 'dB'
                : undefined,
        ),
      ],
      [],
      position,
    );
  const focus = await parameterSource('focus', 'Spectral focus', '/focus', [0, 700]);
  const displacement = await parameterSource('displacement', 'Displacement', '/shift', [0, 880]);
  const afterimage = await parameterSource('afterimage', 'Afterimage', '/afterimage', [520, 1120]);
  const energy = await add(
    'energy-response',
    'Energy response',
    script('energy'),
    [input('analysis', 'analysis')],
    [input('energy'), input('peak'), input('upper')],
    [
      parameter('sensitivity', 'Sensitivity', 0.1, 30, 12),
      parameter('response', 'Response · per second', 0.1, 30, 9),
    ],
    [0, 1120],
  );
  const modes = await add(
    'standing-wave-modes',
    'Standing-wave modes',
    script('modes'),
    [input('focus'), input('displacement'), input('peak'), input('upper')],
    [input('modes', 'vector2')],
    [parameter('response', 'Response · per second', 0.1, 30, 2)],
    [260, 700],
  );
  const scene = await add(
    'nacre-scene',
    'Nacre scene',
    {
      kind: 'web-surface',
      entry: '/nacre/scene.mjs',
      targets: ['browser', 'webview'],
      dependencies: {
        three: '0.184.0',
        '@manifold/ui-web/control-panel': '0.1.0',
        '@manifold/ui-web/diegetic': '0.1.0',
      },
    },
    [input('analysis', 'analysis'), input('energy'), input('peak'), input('upper')],
    [
      input('scene', 'resource:nacre.scene'),
      input('contact', 'vector3'),
      input('phase'),
      input('eyePointer', 'vector3'),
      input('handTouch', 'vector3'),
      input('handGesture', 'vector3'),
      input('haloTouch', 'vector3'),
      input('haloGesture', 'vector3'),
      input('creatureTouch', 'vector3'),
      input('creatureGesture', 'vector3'),
    ],
    [],
    [520, 700],
  );
  const field = await add(
    'standing-wave-field',
    'Standing-wave field',
    {
      kind: 'scene-object',
      entry: '/nacre/field.mjs',
      dependencies: { three: '0.184.0' },
      targets: ['browser', 'webview'],
    },
    [
      input('scene', 'resource:nacre.scene'),
      input('energy'),
      input('modes', 'vector2'),
      input('focus'),
      input('shift'),
      input('afterimage'),
      input('upper'),
      input('phase'),
      input('contact', 'vector3'),
      input('analysis', 'analysis'),
    ],
    [input('object', 'resource:three.object')],
    [],
    [800, 700],
  );
  const connect = (from, output, to, input) =>
    runtime.request({ operation: 'component.connect', from, output, to, input });
  const output = runtime.project.signal.nodes.find((node) => node.type === 'output').id;
  await connect(output, 'analysis', energy, 'analysis');
  await connect(output, 'analysis', scene, 'analysis');
  await connect(output, 'analysis', field, 'analysis');
  await connect(focus, 'value', modes, 'focus');
  await connect(displacement, 'value', modes, 'displacement');
  await connect(energy, 'peak', modes, 'peak');
  await connect(energy, 'upper', modes, 'upper');
  for (const name of ['energy', 'peak', 'upper']) await connect(energy, name, scene, name);
  await connect(scene, 'scene', field, 'scene');
  await connect(scene, 'contact', field, 'contact');
  await connect(scene, 'phase', field, 'phase');
  await connect(energy, 'energy', field, 'energy');
  await connect(energy, 'upper', field, 'upper');
  await connect(modes, 'modes', field, 'modes');
  await connect(focus, 'value', field, 'focus');
  await connect(displacement, 'value', field, 'shift');
  await connect(afterimage, 'value', field, 'afterimage');
  // A real nested image graph: the outer node previews the same image that
  // Nacre displays. Enter it to inspect the image list, motion rules and layer.
  const edge = await parameterSource('prism-edge', 'Prism edge', '/prism-bend/edge', [0, 1490]);
  const heat = await parameterSource('prism-heat', 'Prism heat', '/prism-bend/heat', [0, 1660]);
  const motion = await add(
    'creature-motion',
    'Creature motion',
    script('creature-motion'),
    [
      input('energy'),
      input('edge'),
      input('heat'),
      input('touch', 'vector3'),
      input('gesture', 'vector3'),
    ],
    [
      input('frame'),
      input('rotation', 'scalar', '°'),
      input('glow', 'vector3'),
      input('controls', 'vector2'),
    ],
    [],
    [0, 260],
  );
  const primitives = [
    imageFrames({
      id: 'oracle-poses',
      label: 'Oracle poses',
      frames: [
        '/assets/nacre-oracle-crab-rest.webp',
        '/assets/nacre-oracle-crab-step.webp',
        '/assets/nacre-oracle-crab-sing.webp',
      ],
    }),
    selectImageFrame,
    transformImage,
  ];
  const primitiveIds = [];
  for (const [index, definition] of primitives.entries()) {
    await runtime.request({ operation: 'component.define', definition, files });
    await runtime.request({
      operation: 'component.add',
      definitionId: definition.id,
      x: index * 240,
      y: 0,
    });
    primitiveIds.push(runtime.save().composition.nodes.at(-1).id);
  }
  const [poses, selection, transform] = primitiveIds;
  const artwork = await add(
    'creature-artwork',
    'Creature in scene',
    {
      kind: 'scene-object',
      entry: '/nacre/creature.mjs',
      dependencies: { three: '0.184.0' },
      targets: ['browser', 'webview'],
    },
    [
      input('scene', 'resource:nacre.scene'),
      input('image', 'image2d'),
      input('frames', 'image-sequence'),
      input('glow', 'vector3'),
      input('controls', 'vector2'),
    ],
    [input('image', 'image2d')],
    [],
    [720, 0],
  );
  await connect(poses, 'frames', selection, 'frames');
  await connect(poses, 'frames', artwork, 'frames');
  await connect(motion, 'frame', selection, 'frame');
  await connect(motion, 'rotation', transform, 'rotation');
  await connect(selection, 'image', transform, 'image');
  await connect(transform, 'image', artwork, 'image');
  await connect(motion, 'glow', artwork, 'glow');
  await connect(motion, 'controls', artwork, 'controls');
  await connect(scene, 'scene', artwork, 'scene');
  await connect(scene, 'creatureTouch', motion, 'touch');
  await connect(scene, 'creatureGesture', motion, 'gesture');
  await connect(energy, 'energy', motion, 'energy');
  await connect(edge, 'value', motion, 'edge');
  await connect(heat, 'value', motion, 'heat');
  await runtime.request({
    operation: 'component.wrap',
    ids: [poses, motion, selection, transform, artwork],
    exposeParameters: ['x', 'y', 'scale', 'opacity'].map((parameter) => ({
      id: transform,
      parameter,
    })),
    definitionId: 'oracle-creature',
    label: 'Oracle creature',
  });
  const definition = runtime
    .save()
    .composition.definitions.find((item) => item.id === 'oracle-creature');
  await runtime.request({
    operation: 'component.define',
    definition: {
      ...definition,
      description:
        'The shell creature on Nacre’s rim. Enter its graph to see the pose images, touch and sound rules, tilt and mouth light.',
      category: 'Reusable graphs',
      keywords: ['shell', 'crab', 'sprite', 'animation', 'prism'],
      preview: definition.outputs.find((port) => port.type === 'image2d').name,
    },
  });
  const creature = runtime
    .save()
    .composition.nodes.find((node) => node.definition === 'oracle-creature');
  await runtime.request({
    operation: 'component.update',
    id: creature.id,
    changes: { position: [520, 1490] },
  });
  async function uploadedImage(id, label, asset, position) {
    const definition = imageFrames({ id, label, frames: [asset] });
    await runtime.request({ operation: 'component.define', definition });
    return place(definition, label, position);
  }
  async function wrapArtwork(ids, definitionId, label, description, position) {
    await runtime.request({
      operation: 'component.wrap',
      ids,
      definitionId,
      label,
      exposeParameters: [],
    });
    const definition = runtime
      .save()
      .composition.definitions.find((item) => item.id === definitionId);
    await runtime.request({
      operation: 'component.define',
      definition: {
        ...definition,
        description,
        category: 'Reusable graphs',
        keywords: definitionId.split('-'),
        preview: definition.outputs.find((port) => port.type === 'image2d').name,
      },
    });
    const node = runtime.save().composition.nodes.find((node) => node.definition === definitionId);
    await runtime.request({ operation: 'component.update', id: node.id, changes: { position } });
    return node.id;
  }
  const cabinetImages = await uploadedImage(
    'cabinet-image',
    'Cabinet engraving',
    '/assets/nacre-cabinet-art.webp',
    [0, 0],
  );
  const cabinetImage = await place(selectImageFrame, 'Engraving image', [240, 0]);
  const cabinetPlacement = await place(transformImage, 'Engraving placement', [480, 0]);
  const cabinetArtwork = await add(
    'cabinet-artwork',
    'Engraving in cabinet',
    object('cabinet'),
    [input('scene', 'resource:nacre.scene'), input('image', 'image2d')],
    [input('image', 'image2d')],
    [],
    [720, 0],
  );
  await connect(cabinetImages, 'frames', cabinetImage, 'frames');
  await connect(cabinetImage, 'image', cabinetPlacement, 'image');
  await connect(cabinetPlacement, 'image', cabinetArtwork, 'image');
  await connect(scene, 'scene', cabinetArtwork, 'scene');
  await wrapArtwork(
    [cabinetImages, cabinetImage, cabinetPlacement, cabinetArtwork],
    'cabinet-engraving',
    'Cabinet engraving',
    'The engraved background plate. Enter to inspect its uploaded image, placement and how it fits within the cabinet frame.',
    [1100, 700],
  );

  const relicImages = await uploadedImage(
    'relic-image',
    'Photographed relic',
    '/assets/nacre-mouth-relic.webp',
    [0, 0],
  );
  const relicImage = await place(selectImageFrame, 'Relic image', [240, 0]);
  const relicPlacement = await place(transformImage, 'Relic and eye placement', [480, 0]);
  const depthImages = await uploadedImage(
    'relic-depth-image',
    'Relic height map',
    '/assets/nacre-mouth-depth.webp',
    [0, 350],
  );
  const depthImage = await place(selectImageFrame, 'Depth image', [240, 350]);
  const relicArtwork = await add(
    'relic-artwork',
    'Relic relief',
    object('relic'),
    [
      input('scene', 'resource:nacre.scene'),
      input('image', 'image2d'),
      input('depth', 'image2d'),
      input('energy'),
      input('phase'),
    ],
    [input('relic', 'resource:nacre.relic'), input('image', 'image2d'), input('depth', 'image2d')],
    [],
    [720, 0],
  );
  await connect(relicImages, 'frames', relicImage, 'frames');
  await connect(relicImage, 'image', relicPlacement, 'image');
  await connect(relicPlacement, 'image', relicArtwork, 'image');
  await connect(depthImages, 'frames', depthImage, 'frames');
  await connect(depthImage, 'image', relicArtwork, 'depth');
  await connect(scene, 'scene', relicArtwork, 'scene');
  await connect(scene, 'phase', relicArtwork, 'phase');
  await connect(energy, 'energy', relicArtwork, 'energy');
  const relic = await wrapArtwork(
    [relicImages, relicImage, relicPlacement, depthImages, depthImage, relicArtwork],
    'mouth-relic',
    'Mouth relic',
    'The photographed relic around the input socket. Its height map and sound drive the relief; its surface carries the eye. Enter to inspect the images and placement.',
    [520, 2140],
  );

  // Eye images are independent layers: the full-size left/right plates share
  // the relic relief, while the small closed-eye cutout sits over both.
  const hold = await parameterSource('memory-hold', 'Memory hold', '/hold', [1180, 2140]);
  const eyeMotion = await add(
    'eye-motion',
    'Gaze and blink',
    script('eye-motion'),
    [
      input('energy'),
      input('upper'),
      input('phase'),
      input('displacement'),
      input('hold'),
      input('pointer', 'vector3'),
    ],
    [input('left'), input('right'), input('closed'), input('light', 'vector2')],
    [],
    [0, 300],
  );
  const eyeFrames = imageFrames({
    id: 'relic-eye-images',
    label: 'Eye images',
    frames: [
      '/assets/nacre-eye-open-left.webp',
      '/assets/nacre-eye-open-right.webp',
      '/assets/nacre-eye-closed.webp',
    ],
  });
  await runtime.request({ operation: 'component.define', definition: eyeFrames });
  async function place(definition, label, position, parameters = {}) {
    await runtime.request({ operation: 'component.add', definitionId: definition.id });
    const id = runtime.save().composition.nodes.at(-1).id;
    await runtime.request({
      operation: 'component.update',
      id,
      changes: { label, position, parameters },
    });
    return id;
  }
  const eyeImages = await place(eyeFrames, 'Eye images', [0, 0]);
  const eyeArtwork = await add(
    'eye-artwork',
    'Eye on relic',
    {
      kind: 'scene-object',
      entry: '/nacre/eye.mjs',
      dependencies: { three: '0.184.0', '@manifold/ui-web/diegetic': '0.1.0' },
      targets: ['browser', 'webview'],
    },
    [
      input('scene', 'resource:nacre.scene'),
      input('relic', 'resource:nacre.relic'),
      input('left', 'image2d'),
      input('right', 'image2d'),
      input('closed', 'image2d'),
      input('light', 'vector2'),
    ],
    [input('layers', 'vector3')],
    [],
    [720, 0],
  );
  const eyeChildren = [eyeImages, eyeMotion, eyeArtwork];
  for (const [index, name] of ['left', 'right', 'closed'].entries()) {
    const selected = await place(
      selectImageFrame,
      `${name === 'closed' ? 'Closed eye' : `Look ${name}`} image`,
      [240, index * 340],
      { frame: index },
    );
    const faded = await place(
      transformImage,
      `${name === 'closed' ? 'Close eyelid' : `Fade ${name} gaze`}`,
      [480, index * 340],
    );
    await connect(eyeImages, 'frames', selected, 'frames');
    await connect(selected, 'image', faded, 'image');
    await connect(eyeMotion, name, faded, 'opacity');
    await connect(faded, 'image', eyeArtwork, name);
    eyeChildren.push(selected, faded);
  }
  await connect(scene, 'scene', eyeArtwork, 'scene');
  await connect(relic, 'relic', eyeArtwork, 'relic');
  await connect(scene, 'eyePointer', eyeMotion, 'pointer');
  await connect(scene, 'phase', eyeMotion, 'phase');
  await connect(energy, 'energy', eyeMotion, 'energy');
  await connect(energy, 'upper', eyeMotion, 'upper');
  await connect(displacement, 'value', eyeMotion, 'displacement');
  await connect(hold, 'value', eyeMotion, 'hold');
  await connect(eyeMotion, 'light', eyeArtwork, 'light');
  await runtime.request({
    operation: 'component.wrap',
    ids: eyeChildren,
    exposeParameters: [],
    definitionId: 'relic-eye',
    label: 'Relic eye',
  });
  const eyeDefinition = runtime
    .save()
    .composition.definitions.find((item) => item.id === 'relic-eye');
  await runtime.request({
    operation: 'component.define',
    definition: {
      ...eyeDefinition,
      description:
        'The relic eye follows the pointer, glances with the sound, blinks and closes for Hold. Enter to inspect its three images, fades and motion script.',
      category: 'Reusable graphs',
      keywords: ['eye', 'gaze', 'blink', 'image', 'hold'],
      preview: eyeDefinition.outputs.find((port) => port.type === 'vector3').name,
    },
  });
  const eye = runtime.save().composition.nodes.find((node) => node.definition === 'relic-eye');
  await runtime.request({
    operation: 'component.update',
    id: eye.id,
    changes: { position: [1480, 2140] },
  });
  const scatter = await parameterSource('scatter', 'Scatter', '/scatter', [1180, 1490]);
  const grainSize = await parameterSource('grain-size', 'Grain', '/grain-size', [1180, 1690]);
  const mix = await parameterSource('transmutation', 'Transmutation', '/mix', [1180, 1890]);
  const handMotion = await add(
    'hand-motion',
    'Wrist and bearings',
    script('hand-motion'),
    [
      input('scatter'),
      input('grainSize'),
      input('energy'),
      input('touch', 'vector3'),
      input('gesture', 'vector3'),
    ],
    [
      'rotation',
      'tilt',
      'height',
      'response',
      'ringRotation',
      'ringScale',
      'grainRotation',
      'glow',
      'grain',
      'scatter',
    ].map((name) => input(name)),
    [],
    [0, 720],
  );
  const haloMotion = await add(
    'halo-motion',
    'Memory collar motion',
    script('halo-motion'),
    [
      input('mix'),
      input('afterimage'),
      input('energy'),
      input('touch', 'vector3'),
      input('gesture', 'vector3'),
    ],
    ['frame', 'rotation', 'scale', 'glow'].map((name) => input(name)),
    [],
    [260, 720],
  );
  const handFrames = imageFrames({
    id: 'hand-poses',
    label: 'Hand poses',
    frames: [
      '/assets/nacre-reliquary-hand.webp',
      '/assets/nacre-hand-grasp-mid.webp',
      '/assets/nacre-hand-grasp-open.webp',
    ],
  });
  const graftFrames = imageFrames({
    id: 'wrist-image',
    label: 'Wrist graft',
    frames: ['/assets/nacre-wrist-graft.webp'],
  });
  await runtime.request({ operation: 'component.define', definition: handFrames });
  await runtime.request({ operation: 'component.define', definition: graftFrames });
  const handImages = await place(handFrames, 'Hand poses', [0, 0]);
  const handSelection = await place(selectImageFrame, 'Choose grasp', [240, 0]);
  const handTransform = await place(transformImage, 'Hand image placement', [480, 0]);
  const graftImages = await place(graftFrames, 'Wrist graft', [0, 350]);
  const graftSelection = await place(selectImageFrame, 'Wrist image', [240, 350]);
  const graftTransform = await place(transformImage, 'Graft placement', [480, 350]);
  const handArtwork = await add(
    'hand-artwork',
    'Hand in scene',
    object('hand'),
    [
      input('scene', 'resource:nacre.scene'),
      input('image', 'image2d'),
      input('graft', 'image2d'),
      input('frames', 'image-sequence'),
      ...[
        'rotation',
        'tilt',
        'height',
        'response',
        'ringRotation',
        'ringScale',
        'grainRotation',
        'glow',
        'grain',
        'scatter',
        'phase',
        'energy',
      ].map((name) => input(name)),
    ],
    [input('hand', 'resource:nacre.hand'), input('image', 'image2d')],
    [],
    [720, 0],
  );
  const haloArtwork = await add(
    'memory-halo',
    'Memory halo',
    object('halo'),
    [
      input('scene', 'resource:nacre.scene'),
      input('hand', 'resource:nacre.hand'),
      input('rotation'),
      input('scale'),
      input('glow'),
    ],
    [input('rotation')],
    [],
    [720, 650],
  );
  await connect(handImages, 'frames', handSelection, 'frames');
  await connect(handImages, 'frames', handArtwork, 'frames');
  await connect(haloMotion, 'frame', handSelection, 'frame');
  await connect(handSelection, 'image', handTransform, 'image');
  await connect(handTransform, 'image', handArtwork, 'image');
  await connect(graftImages, 'frames', graftSelection, 'frames');
  await connect(graftSelection, 'image', graftTransform, 'image');
  await connect(graftTransform, 'image', handArtwork, 'graft');
  for (const name of [
    'rotation',
    'tilt',
    'height',
    'response',
    'ringRotation',
    'ringScale',
    'grainRotation',
    'glow',
    'grain',
    'scatter',
  ])
    await connect(handMotion, name, handArtwork, name);
  for (const name of ['rotation', 'scale', 'glow'])
    await connect(haloMotion, name, haloArtwork, name);
  await connect(handArtwork, 'hand', haloArtwork, 'hand');
  await connect(scatter, 'value', handMotion, 'scatter');
  await connect(grainSize, 'value', handMotion, 'grainSize');
  await connect(mix, 'value', haloMotion, 'mix');
  await connect(afterimage, 'value', haloMotion, 'afterimage');
  for (const node of [handMotion, haloMotion, handArtwork])
    await connect(energy, 'energy', node, 'energy');
  for (const node of [handArtwork, haloArtwork]) await connect(scene, 'scene', node, 'scene');
  await connect(scene, 'phase', handArtwork, 'phase');
  await connect(scene, 'handTouch', handMotion, 'touch');
  await connect(scene, 'handGesture', handMotion, 'gesture');
  await connect(scene, 'haloTouch', haloMotion, 'touch');
  await connect(scene, 'haloGesture', haloMotion, 'gesture');
  await runtime.request({
    operation: 'component.wrap',
    ids: [
      handMotion,
      haloMotion,
      handImages,
      handSelection,
      handTransform,
      graftImages,
      graftSelection,
      graftTransform,
      handArtwork,
      haloArtwork,
    ],
    definitionId: 'crystal-hand',
    label: 'Crystal hand',
    exposeParameters: [],
  });
  const handDefinition = runtime
    .save()
    .composition.definitions.find((item) => item.id === 'crystal-hand');
  await runtime.request({
    operation: 'component.define',
    definition: {
      ...handDefinition,
      description:
        'Grain and Scatter move the hand; Transmutation and Afterimage move its halo. Enter to inspect the poses, wrist graft, motion scripts and real scene attachment.',
      category: 'Reusable graphs',
      keywords: ['hand', 'wrist', 'halo', 'image', 'grasp'],
      preview: handDefinition.outputs.find((port) => port.type === 'image2d').name,
    },
  });
  const hand = runtime.save().composition.nodes.find((node) => node.definition === 'crystal-hand');
  await runtime.request({
    operation: 'component.update',
    id: hand.id,
    changes: { position: [1480, 1490] },
  });
  await runtime.request({
    operation: 'graph.group',
    label: 'Visuals',
    paths: runtime
      .snapshot()
      .componentNodes.filter((node) => !node.scope)
      .map((node) => node.instance),
  });
  // Authored positions, not a layout pass during editing. Leave clear lanes
  // between the audio chain and the visual objects that reference it.
}
