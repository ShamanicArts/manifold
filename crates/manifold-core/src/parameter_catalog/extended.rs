//! Additional authorable kernels. Numeric ranges follow the existing DSP/workbench contracts.
use super::{ParameterSpec, p};

const COMPRESSOR: [ParameterSpec; 4] = [
    p(0, -60.0, 0.0, -12.0, false),
    p(1, 1.0, 100.0, 4.0, false),
    p(5, 0.0, 40.0, 0.0, false),
    p(10, 0.0, 1.0, 1.0, false),
];

const LIMITER: [ParameterSpec; 5] = [
    p(0, -24.0, 0.0, -1.0, false),
    p(1, 1.0, 500.0, 60.0, false),
    p(2, 0.0, 18.0, 0.0, false),
    p(3, 0.0, 1.0, 0.2, false),
    p(4, 0.0, 1.0, 1.0, false),
];

const STEREO_DELAY: [ParameterSpec; 15] = [
    p(0, 1.0, 5000.0, 250.0, false),
    p(1, 1.0, 5000.0, 375.0, false),
    p(2, 0.0, 1.2, 0.3, false),
    p(3, 0.0, 1.0, 0.0, false),
    p(4, 0.0, 1.0, 0.0, true),
    p(5, 20.0, 20000.0, 4000.0, false),
    p(7, 0.0, 1.0, 0.5, false),
    p(8, 0.0, 1.0, 0.0, true),
    p(9, 0.0, 1.0, 1.0, false),
    p(10, 0.0, 1.0, 0.0, true),
    p(11, 0.0, 1.0, 0.0, false),
    p(12, 0.0, 1.0, 0.0, true),
    p(13, 0.0, 10.0, 3.0, true),
    p(14, 0.0, 10.0, 6.0, true),
    p(15, 20.0, 300.0, 120.0, false),
];

const PHASER: [ParameterSpec; 5] = [
    p(0, 0.1, 10.0, 0.4, false),
    p(1, 0.0, 1.0, 0.7, false),
    p(2, 6.0, 12.0, 6.0, true),
    p(3, -0.95, 0.95, 0.2, false),
    p(4, 0.0, 180.0, 90.0, false),
];

const CHORUS: [ParameterSpec; 7] = [
    p(0, 0.05, 10.0, 0.6, false),
    p(1, 0.0, 1.0, 0.45, false),
    p(2, 1.0, 4.0, 3.0, true),
    p(3, 0.0, 1.0, 0.7, false),
    p(4, 0.0, 0.95, 0.1, false),
    p(5, 0.0, 1.0, 0.0, true),
    p(6, 0.0, 1.0, 0.5, false),
];

const REVERB: [ParameterSpec; 5] = [
    p(0, 0.0, 1.0, 0.5, false),
    p(1, 0.0, 1.0, 0.5, false),
    p(2, 0.0, 1.0, 0.33, false),
    p(3, 0.0, 1.0, 0.4, false),
    p(4, 0.0, 1.0, 1.0, false),
];

const MULTITAP_DELAY: [ParameterSpec; 27] = [
    p(0, 1.0, 8.0, 4.0, true),
    p(1, 0.0, 0.95, 0.3, false),
    p(2, 0.0, 1.0, 0.5, false),
    p(3, 1.0, 3000.0, 120.0, false),
    p(4, 0.0, 1.0, 0.5, false),
    p(5, -1.0, 1.0, -0.5, false),
    p(6, 1.0, 3000.0, 240.0, false),
    p(7, 0.0, 1.0, 0.25, false),
    p(8, -1.0, 1.0, 0.5, false),
    p(9, 1.0, 3000.0, 360.0, false),
    p(10, 0.0, 1.0, 0.16666666666666666, false),
    p(11, -1.0, 1.0, -0.5, false),
    p(12, 1.0, 3000.0, 480.0, false),
    p(13, 0.0, 1.0, 0.125, false),
    p(14, -1.0, 1.0, 0.5, false),
    p(15, 1.0, 3000.0, 600.0, false),
    p(16, 0.0, 1.0, 0.1, false),
    p(17, -1.0, 1.0, -0.5, false),
    p(18, 1.0, 3000.0, 720.0, false),
    p(19, 0.0, 1.0, 0.08333333333333333, false),
    p(20, -1.0, 1.0, 0.5, false),
    p(21, 1.0, 3000.0, 840.0, false),
    p(22, 0.0, 1.0, 0.07142857142857142, false),
    p(23, -1.0, 1.0, -0.5, false),
    p(24, 1.0, 3000.0, 960.0, false),
    p(25, 0.0, 1.0, 0.0625, false),
    p(26, -1.0, 1.0, 0.5, false),
];

const TRANSIENT_SHAPER: [ParameterSpec; 4] = [
    p(0, -1.0, 1.0, 0.5, false),
    p(1, -1.0, 1.0, 0.0, false),
    p(2, 0.1, 4.0, 1.0, false),
    p(3, 0.0, 1.0, 1.0, false),
];

const BIT_CRUSHER: [ParameterSpec; 5] = [
    p(0, 2.0, 16.0, 8.0, false),
    p(1, 1.0, 64.0, 4.0, false),
    p(2, 0.0, 1.0, 1.0, false),
    p(3, 0.0, 2.0, 0.8, false),
    p(4, 0.0, 2.0, 0.0, true),
];

const THREE_BAND_EQ: [ParameterSpec; 9] = [
    p(0, -24.0, 24.0, 0.0, false),
    p(1, 20.0, 400.0, 120.0, false),
    p(2, -24.0, 24.0, 0.0, false),
    p(3, 120.0, 8000.0, 1000.0, false),
    p(4, 0.2, 12.0, 0.7, false),
    p(5, -24.0, 24.0, 0.0, false),
    p(6, 2000.0, 16000.0, 8000.0, false),
    p(7, -24.0, 24.0, 0.0, false),
    p(8, 0.0, 1.0, 1.0, false),
];

const FORMANT_FILTER: [ParameterSpec; 5] = [
    p(0, 0.0, 4.0, 0.0, false),
    p(1, -12.0, 12.0, 0.0, false),
    p(2, 1.0, 20.0, 6.0, false),
    p(3, 0.5, 8.0, 1.2, false),
    p(4, 0.0, 1.0, 1.0, false),
];

const RESONATOR: [ParameterSpec; 3] = [
    p(0, 0.0, 4.0, 1.0, false),
    p(1, 20.0, 20000.0, 1000.0, false),
    p(2, 0.01, 500.0, 10.0, false),
];

const REVERSE_DELAY: [ParameterSpec; 4] = [
    p(0, 50.0, 2000.0, 420.0, false),
    p(1, 20.0, 400.0, 120.0, false),
    p(2, 0.0, 0.95, 0.35, false),
    p(3, 0.0, 1.0, 0.5, false),
];

const STUTTER: [ParameterSpec; 8] = [
    p(0, 0.125, 8.0, 0.5, false),
    p(1, 0.0, 1.0, 0.8, false),
    p(2, 0.0, 1.0, 0.3, false),
    p(3, 0.0, 1.0, 0.2, false),
    p(4, 0.0, 1.0, 0.5, false),
    p(5, 0.0, 255.0, 255.0, true),
    p(6, 20.0, 300.0, 120.0, false),
    p(7, 0.0, 1.0, 1.0, false),
];

const PITCH_SHIFTER: [ParameterSpec; 4] = [
    p(0, -24.0, 24.0, 0.0, false),
    p(1, 20.0, 200.0, 80.0, false),
    p(2, 0.0, 0.95, 0.0, false),
    p(3, 0.0, 1.0, 1.0, false),
];

const SHIMMER: [ParameterSpec; 6] = [
    p(0, 0.0, 1.0, 0.6, false),
    p(1, -12.0, 12.0, 12.0, false),
    p(2, 0.0, 0.99, 0.65, false),
    p(3, 0.0, 1.0, 0.45, false),
    p(4, 0.0, 1.0, 0.25, false),
    p(5, 100.0, 12000.0, 6000.0, false),
];

const SPECTRUM_ANALYZER: [ParameterSpec; 3] = [
    p(0, 0.1, 8.0, 1.0, false),
    p(1, 0.0, 0.999, 0.85, false),
    p(2, -96.0, -12.0, -72.0, false),
];

const FFT_SPECTRUM: [ParameterSpec; 2] = [
    p(0, 0.0, 0.99, 0.45, false),
    p(1, -96.0, -24.0, -72.0, false),
];

const ENVELOPE_FOLLOWER: [ParameterSpec; 5] = [
    p(0, 0.01, 500.0, 10.0, false),
    p(1, 0.1, 5000.0, 120.0, false),
    p(2, 0.01, 16.0, 1.0, false),
    p(3, 5.0, 4000.0, 80.0, false),
    p(4, 0.0, 2.0, 0.0, true),
];

const ENVELOPE_CONTROL: [ParameterSpec; 5] = [
    p(0, 0.01, 500.0, 10.0, false),
    p(1, 0.1, 5000.0, 120.0, false),
    p(2, 0.01, 16.0, 1.0, false),
    p(3, 5.0, 4000.0, 80.0, false),
    p(4, 0.0, 2.0, 0.0, true),
];

const MIDI_NOTE_FILTER: [ParameterSpec; 3] = [
    p(0, 0.0, 127.0, 36.0, true),
    p(1, 0.0, 127.0, 96.0, true),
    p(2, 0.0, 1.0, 0.0, true),
];

const MIDI_SCALE_QUANTIZER: [ParameterSpec; 3] = [
    p(0, 0.0, 11.0, 0.0, true),
    p(1, 1.0, 6.0, 1.0, true),
    p(2, 1.0, 3.0, 1.0, true),
];

const MIDI_VELOCITY_MAPPER: [ParameterSpec; 3] = [
    p(0, 0.0, 1.0, 1.0, false),
    p(1, 0.0, 2.0, 0.0, true),
    p(2, -1.0, 1.0, 0.0, false),
];

const MIDI_ARPEGGIATOR: [ParameterSpec; 5] = [
    p(0, 0.25, 20.0, 8.0, false),
    p(1, 0.0, 3.0, 0.0, true),
    p(2, 1.0, 4.0, 1.0, true),
    p(3, 0.05, 1.0, 0.6, false),
    p(4, 0.0, 1.0, 0.0, true),
];

const CONSTANT: [ParameterSpec; 1] = [p(0, -1.0, 1.0, 0.0, false)];

const LINEAR_BLEND: [ParameterSpec; 1] = [p(0, 0.0, 1.0, 0.5, false)];

const SLEW_AUDIO: [ParameterSpec; 2] = [
    p(0, 1.0, 96000.0, 64.0, false),
    p(1, 1.0, 96000.0, 64.0, false),
];

const PHRASE_GAIN: [ParameterSpec; 2] = [p(0, 0.0, 1.0, 1.0, false), p(1, 0.05, 0.6, 0.2, false)];

pub(super) fn parameters(id: &str) -> &'static [ParameterSpec] {
    match id {
        "compressor" => &COMPRESSOR,
        "limiter" => &LIMITER,
        "stereo-delay" => &STEREO_DELAY,
        "phaser" => &PHASER,
        "chorus" => &CHORUS,
        "reverb" => &REVERB,
        "multitap-delay" => &MULTITAP_DELAY,
        "transient-shaper" => &TRANSIENT_SHAPER,
        "bit-crusher" => &BIT_CRUSHER,
        "three-band-eq" => &THREE_BAND_EQ,
        "formant-filter" => &FORMANT_FILTER,
        "resonator" => &RESONATOR,
        "reverse-delay" => &REVERSE_DELAY,
        "stutter" => &STUTTER,
        "pitch-shifter" => &PITCH_SHIFTER,
        "shimmer" => &SHIMMER,
        "spectrum-analyzer" => &SPECTRUM_ANALYZER,
        "fft-spectrum" => &FFT_SPECTRUM,
        "envelope-follower" => &ENVELOPE_FOLLOWER,
        "envelope-control" => &ENVELOPE_CONTROL,
        "midi-note-filter" => &MIDI_NOTE_FILTER,
        "midi-scale-quantizer" => &MIDI_SCALE_QUANTIZER,
        "midi-velocity-mapper" => &MIDI_VELOCITY_MAPPER,
        "midi-arpeggiator" => &MIDI_ARPEGGIATOR,
        "constant" => &CONSTANT,
        "linear-blend" => &LINEAR_BLEND,
        "slew-audio" => &SLEW_AUDIO,
        "phrase-gain" => &PHRASE_GAIN,
        _ => &[],
    }
}
