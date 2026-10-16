import { createDevice, audio, sineOscillator, gain } from 'manifold';

// The sound is authored here. /composition.json owns field → relief → renderer.
const probe = createDevice({ id: 'field-audio', name: 'Field audio' });
const probeOutput = probe.output('audio', audio.stereo);
const tone = probe.add('tone', sineOscillator);
tone.configure({ frequency: 220, level: 0.12 });
const level = probe.add('level', gain);
probe.control('gain', level.parameters.level, {
  label: 'Output gain', min: 0, max: 2, default: 0.5,
});
probe.connect(tone.outputs.out, level.inputs.audio);
probe.connect(level.outputs.out, probeOutput);

const device = createDevice({ id: 'field-rules', name: 'Standing field and relief' });
const output = device.output('audio', audio.stereo);
// This instance retains the existing /probe/gain control path.
const fieldAudio = device.add('probe', probe);
device.connect(fieldAudio.outputs.audio, output);
device.place(fieldAudio, { x: 0, y: 0 });
export default device;
