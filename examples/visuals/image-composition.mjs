import { imageFrames, selectImageFrame, transformImage, imageLayer } from 'manifold';

// These are library definitions. The creature's timing below is project code.
// The strings in frames are paths to images uploaded into this project.
export async function assembleImageComposition(runtime, files) {
  const poses = imageFrames({
    id: 'oracle-poses',
    label: 'Oracle poses',
    frames: [
      '/assets/nacre-oracle-crab-rest.webp',
      '/assets/nacre-oracle-crab-step.webp',
      '/assets/nacre-oracle-crab-sing.webp',
    ],
  });
  const motion = {
    id: 'creature-motion',
    version: 1,
    label: 'Creature motion',
    description:
      'Cycles through the three poses and gently turns the image. Open the script to change these rules.',
    category: 'Values & motion',
    implementation: {
      kind: 'presentation-script',
      entry: '/nodes/creature-motion.mjs',
      dependencies: {},
      targets: ['browser', 'webview'],
    },
    inputs: [],
    outputs: [
      { name: 'frame', type: 'scalar' },
      { name: 'rotation', type: 'scalar', unit: '°' },
    ],
    parameters: [
      { name: 'speed', label: 'Speed · cycles per second', min: 0, max: 2, default: 0.5 },
      { name: 'turn', label: 'Turn · degrees', min: 0, max: 20, default: 5 },
    ],
  };
  const definitions = [poses, motion, selectImageFrame, transformImage, imageLayer];
  const positions = [
    [0, 0],
    [0, 250],
    [280, 0],
    [560, 0],
    [900, 0],
  ];
  const ids = [];
  for (const [index, definition] of definitions.entries()) {
    await runtime.request({ operation: 'component.define', definition, files });
    await runtime.request({
      operation: 'component.add',
      definitionId: definition.id,
      x: positions[index][0],
      y: positions[index][1],
    });
    ids.push(runtime.save().composition.nodes.at(-1).id);
  }
  // Numeric node handles come back from Studio; authored names remain readable.
  const [poseImages, animation, frameSelection, placement, presenter] = ids;
  const connect = (from, output, to, input) =>
    runtime.request({ operation: 'component.connect', from, output, to, input });
  await connect(poseImages, 'frames', frameSelection, 'frames');
  await connect(animation, 'frame', frameSelection, 'frame');
  await connect(animation, 'rotation', placement, 'rotation');
  await connect(frameSelection, 'image', placement, 'image');
  await connect(placement, 'image', presenter, 'image');
  await runtime.request({
    operation: 'component.update',
    id: presenter,
    changes: { bounds: { x: 0, y: 0, width: 100, height: 100 } },
  });
  // The existing Enter graph action opens these four parts. Its image output
  // also supplies the live viewer on the outer node.
  await runtime.request({
    operation: 'component.wrap',
    ids: ids.slice(0, 4),
    definitionId: 'oracle-creature',
    label: 'Oracle creature',
  });
  const creature = runtime
    .save()
    .composition.nodes.find((node) => node.definition === 'oracle-creature');
  await runtime.request({
    operation: 'component.update',
    id: creature.id,
    changes: { position: [0, 260] },
  });
  await runtime.request({
    operation: 'component.update',
    id: presenter,
    changes: { position: [360, 260] },
  });
}
