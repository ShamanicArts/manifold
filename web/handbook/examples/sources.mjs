import { createDevice, audio, sawOscillator, noise, gain, crossfader } from 'manifold';

// These names are ours. The imported definitions supply the processors.
const device = createDevice({ id: 'source-laboratory', name: 'Audio Sources' });
// Studio supplies the selected microphone/interface; a plug-in host supplies its input bus.
const liveInput = device.input('live', audio.stereo);
const output = device.output('audio', audio.stereo);

const saw = device.add('saw', sawOscillator);
const noiseSource = device.add('noise', noise);
const liveLevel = device.add('live-level', gain);
const generatedBlend = device.add('saw-or-noise', crossfader);
const sourceBlend = device.add('generated-or-live', crossfader);
const outputLevel = device.add('output-level', gain);

saw.configure({ level: 0.15 });
noiseSource.configure({ level: 0.15 });
// Linear crossfades: -1 selects input A; +1 selects input B; between them mixes both.
generatedBlend.configure({ curve: 0 });
sourceBlend.configure({ curve: 0 });

device.control('frequency', saw.parameters.frequency, {
  label: 'Saw frequency',
  min: 40,
  max: 2000,
  default: 220,
  unit: 'Hz',
});
device.control('noise-level', noiseSource.parameters.level, {
  label: 'Noise level',
  min: 0,
  max: 1,
  default: 0.15,
  unit: '×',
});
device.control('noise-color', noiseSource.parameters.color, {
  label: 'Noise color',
  min: 0,
  max: 1,
  default: 0.5,
});
device.control('live-level', liveLevel.parameters.level, {
  label: 'Live input gain',
  min: 0,
  max: 4,
  default: 1,
  unit: '×',
});
device.control('generated-blend', generatedBlend.parameters.position, {
  label: 'Saw ↔ Noise',
  min: -1,
  max: 1,
  default: -1,
});
device.control('source-blend', sourceBlend.parameters.position, {
  label: 'Generated ↔ Live',
  min: -1,
  max: 1,
  default: -1,
});
device.control('level', outputLevel.parameters.level, {
  label: 'Patch level',
  min: 0,
  max: 1,
  default: 0.65,
  unit: '×',
});

device.connect(saw.outputs.out, generatedBlend.inputs.a);
device.connect(noiseSource.outputs.out, generatedBlend.inputs.b);
device.connect(liveInput, liveLevel.inputs.audio);
device.connect(generatedBlend.outputs.out, sourceBlend.inputs.a);
device.connect(liveLevel.outputs.out, sourceBlend.inputs.b);
device.connect(sourceBlend.outputs.out, outputLevel.inputs.audio);
device.connect(outputLevel.outputs.out, output);

export default device;
