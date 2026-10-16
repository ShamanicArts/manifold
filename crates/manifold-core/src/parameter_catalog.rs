//! Numeric graph-workspace parameter contract shared by native validation and JS catalog generation.
//! Display labels and choice names belong to the authoring UI. This table owns IDs, ranges and defaults.

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ParameterSpec {
    pub id: u32,
    pub min: f64,
    pub max: f64,
    pub default: f64,
    pub discrete: bool,
}

const fn p(id: u32, min: f64, max: f64, default: f64, discrete: bool) -> ParameterSpec {
    ParameterSpec {
        id,
        min,
        max,
        default,
        discrete,
    }
}

// Live inputs can require microphone preamplification; the gain kernel already
// supports this range without changing its smoothing or callback allocation.
const GAIN: [ParameterSpec; 1] = [p(0, 0.0, 8.0, 0.7, false)];
const ADSR: [ParameterSpec; 6] = [
    p(0, 0.001, 5.0, 0.05, false),
    p(1, 0.001, 5.0, 0.2, false),
    p(2, 0.0, 1.0, 0.7, false),
    p(3, 0.001, 10.0, 0.4, false),
    p(4, 0.0, 1.0, 0.0, true),
    p(5, 0.0, 1_000_000.0, 0.0, true),
];
const MIXER9: [ParameterSpec; 1] = [p(0, 0.0, 2.0, 1.0, false)];
const fn mixer_parameters<const N: usize>(inputs: usize) -> [ParameterSpec; N] {
    let mut result = [p(0, 0.0, 2.0, 1.0, false); N];
    let mut index = 0;
    while index < inputs {
        result[index + 1] = p(index as u32 + 1, 0.0, 2.0, 1.0, false);
        result[inputs + index + 1] = p(index as u32 + 33, -1.0, 1.0, 0.0, false);
        index += 1;
    }
    result
}
const MIXER: [ParameterSpec; 65] = mixer_parameters(32);
/// Stable per-input identities: existing gain/pan IDs keep their meaning when
/// ports grow. IDs 65/66 remain the two-input mixer's linked controls.
pub fn mixer_input_parameter(index: usize, pan: bool) -> Option<u32> {
    let id = if index < 32 {
        index + if pan { 33 } else { 1 }
    } else {
        index
            .checked_sub(32)?
            .checked_mul(2)?
            .checked_add(67 + usize::from(pan))?
    };
    u32::try_from(id).ok()
}

pub fn mixer_input_for_parameter(id: u32) -> Option<(usize, bool)> {
    match id {
        1..=32 => Some((id as usize - 1, false)),
        33..=64 => Some((id as usize - 33, true)),
        67.. => Some(((id as usize - 67) / 2 + 32, id % 2 == 0)),
        _ => None,
    }
}

pub fn mixer_parameter(inputs: usize, id: u32) -> Option<ParameterSpec> {
    if id == 0 {
        return Some(MIXER[0]);
    }
    let (index, pan) = mixer_input_for_parameter(id)?;
    if index >= inputs {
        return None;
    }
    Some(if pan {
        p(id, -1.0, 1.0, 0.0, false)
    } else {
        p(id, 0.0, 2.0, 1.0, false)
    })
}

pub fn configured_mixer_parameters(inputs: usize) -> impl Iterator<Item = ParameterSpec> {
    std::iter::once(MIXER[0]).chain([false, true].into_iter().flat_map(move |pan| {
        (0..inputs).filter_map(move |index| {
            mixer_input_parameter(index, pan).and_then(|id| mixer_parameter(inputs, id))
        })
    }))
}

const CROSSFADER: [ParameterSpec; 3] = [
    p(0, -1.0, 1.0, 0.0, false),
    p(1, 0.0, 1.0, 1.0, false),
    p(2, 0.0, 1.0, 1.0, false),
];
const RING_MODULATOR: [ParameterSpec; 5] = [
    p(0, 0.1, 8000.0, 180.0, false),
    p(1, 0.0, 1.0, 1.0, false),
    p(2, 0.0, 1.0, 1.0, false),
    p(3, 0.0, 180.0, 0.0, false),
    p(4, 0.0, 1.0, 1.0, true),
];
const AUDIO_FM: [ParameterSpec; 2] = [p(0, 0.0, 1.0, 0.0, false), p(1, 0.0, 1.0, 0.0, false)];
const AUDIO_SYNC: [ParameterSpec; 2] = AUDIO_FM;

const DISTORTION: [ParameterSpec; 3] = [
    p(0, 1.0, 30.0, 4.0, false),
    p(1, 0.0, 1.0, 0.7, false),
    p(2, 0.0, 2.0, 0.8, false),
];

const WAVE_SHAPER: [ParameterSpec; 8] = [
    p(0, 0.0, 6.0, 0.0, true),
    p(1, 0.0, 40.0, 12.0, false),
    p(2, -20.0, 20.0, 0.0, false),
    p(3, 0.0, 20000.0, 0.0, false),
    p(4, 0.0, 20000.0, 0.0, false),
    p(5, -1.0, 1.0, 0.0, false),
    p(6, 0.0, 1.0, 1.0, false),
    p(7, 1.0, 4.0, 2.0, true),
];
const LEGACY_FILTER: [ParameterSpec; 3] = [
    p(0, 20.0, 18000.0, 1400.0, false),
    p(1, 0.0, 1.0, 0.1, false),
    p(2, 0.0, 1.0, 1.0, false),
];

const SVF: [ParameterSpec; 3] = [
    p(0, 0.0, 3.0, 0.0, true),
    p(1, 20.0, 20000.0, 3200.0, false),
    // Legacy authored/UI range. Filter retains its original DSP clamp at 1.
    p(2, 0.1, 2.0, 0.75, false),
];

const MODULATED_SVF: [ParameterSpec; 4] = [
    p(0, 0.0, 3.0, 0.0, true),
    p(1, 20.0, 20000.0, 3200.0, false),
    p(2, 0.1, 1.0, 0.75, false),
    p(3, 0.0, 20000.0, 2000.0, false),
];

const EFFECT_SLOT_LEGACY: [ParameterSpec; 7] = [
    p(0, 0.0, 20.0, 0.0, true),
    p(1, 0.0, 1.0, 0.0, false),
    p(2, 0.0, 1.0, 0.5, false),
    p(3, 0.0, 1.0, 0.5, false),
    p(4, 0.0, 1.0, 0.2, false),
    p(5, 0.0, 1.0, 0.6, false),
    p(6, 0.0, 1.0, 0.4, false),
];

const EQ8: [ParameterSpec; 42] = [
    p(0, 0.0, 1.0, 0.0, true),
    p(1, 0.0, 6.0, 1.0, true),
    p(2, 20.0, 20000.0, 60.0, false),
    p(3, -24.0, 24.0, 0.0, false),
    p(4, 0.1, 24.0, 1.0, false),
    p(5, 0.0, 1.0, 0.0, true),
    p(6, 0.0, 6.0, 0.0, true),
    p(7, 20.0, 20000.0, 120.0, false),
    p(8, -24.0, 24.0, 0.0, false),
    p(9, 0.1, 24.0, 1.0, false),
    p(10, 0.0, 1.0, 0.0, true),
    p(11, 0.0, 6.0, 0.0, true),
    p(12, 20.0, 20000.0, 250.0, false),
    p(13, -24.0, 24.0, 0.0, false),
    p(14, 0.1, 24.0, 1.0, false),
    p(15, 0.0, 1.0, 0.0, true),
    p(16, 0.0, 6.0, 0.0, true),
    p(17, 20.0, 20000.0, 500.0, false),
    p(18, -24.0, 24.0, 0.0, false),
    p(19, 0.1, 24.0, 1.0, false),
    p(20, 0.0, 1.0, 0.0, true),
    p(21, 0.0, 6.0, 0.0, true),
    p(22, 20.0, 20000.0, 1000.0, false),
    p(23, -24.0, 24.0, 0.0, false),
    p(24, 0.1, 24.0, 1.0, false),
    p(25, 0.0, 1.0, 0.0, true),
    p(26, 0.0, 6.0, 0.0, true),
    p(27, 20.0, 20000.0, 2500.0, false),
    p(28, -24.0, 24.0, 0.0, false),
    p(29, 0.1, 24.0, 1.0, false),
    p(30, 0.0, 1.0, 0.0, true),
    p(31, 0.0, 6.0, 0.0, true),
    p(32, 20.0, 20000.0, 6000.0, false),
    p(33, -24.0, 24.0, 0.0, false),
    p(34, 0.1, 24.0, 1.0, false),
    p(35, 0.0, 1.0, 0.0, true),
    p(36, 0.0, 6.0, 2.0, true),
    p(37, 20.0, 20000.0, 12000.0, false),
    p(38, -24.0, 24.0, 0.0, false),
    p(39, 0.1, 24.0, 1.0, false),
    p(40, -24.0, 24.0, 0.0, false),
    p(41, 0.0, 1.0, 1.0, false),
];

const LOOP_CAPTURE: [ParameterSpec; 7] = [
    p(0, 0.0, 1.0, 0.0, true),
    p(1, 0.0, 1.0, 0.0, true),
    p(2, 0.0, 1.0, 0.0, true),
    p(3, 0.25, 2.0, 1.0, false),
    p(4, 0.0, 1.0, 0.0, true),
    p(5, 0.0, 1.0, 1.0, false),
    p(6, 0.0, 1.0, 0.5, false),
];

const OSCILLATOR: [ParameterSpec; 3] = [
    p(0, 0.0, 4.0, 0.0, true),
    p(1, 20.0, 16000.0, 220.0, false),
    p(2, 0.0, 1.0, 0.4, false),
];
const EXTENDED_OSCILLATOR: [ParameterSpec; 17] = [
    p(0, 0.0, 7.0, 1.0, true),
    p(1, 20.0, 16000.0, 220.0, false),
    p(2, 0.0, 1.0, 0.0, false),
    p(3, 0.0, 1.0, 0.0, true),
    p(4, 0.01, 0.99, 0.5, false),
    p(5, 0.0, 20.0, 0.0, false),
    p(6, 0.0, 3.0, 0.0, true),
    p(7, -1.0, 1.0, 0.0, false),
    p(8, 0.0, 1.0, 1.0, false),
    p(9, 0.0, 1.0, 0.0, true),
    p(10, 1.0, 8.0, 1.0, false),
    p(11, 0.0, 100.0, 0.0, false),
    p(12, 0.0, 1.0, 0.0, false),
    p(13, 0.0, 1.0, 0.0, true),
    p(14, 1.0, 32.0, 8.0, false),
    p(15, -1.0, 1.0, 0.0, false),
    p(16, 0.0, 1.0, 0.0, false),
];
const PULSE_OSCILLATOR: [ParameterSpec; 3] = [
    p(1, 20.0, 16000.0, 220.0, false),
    p(2, 0.0, 1.0, 0.4, false),
    p(4, 0.01, 0.99, 0.25, false),
];

const NOISE: [ParameterSpec; 2] = [p(0, 0.0, 1.0, 0.08, false), p(1, 0.0, 1.0, 0.5, false)];

const LFO: [ParameterSpec; 2] = [p(0, 0.0, 2.0, 0.0, true), p(1, 0.05, 20.0, 2.0, false)];

const MODULATED_GAIN: [ParameterSpec; 2] =
    [p(0, 0.0, 2.0, 0.5, false), p(1, -2.0, 2.0, 0.4, false)];

const SLEW_CONTROL: [ParameterSpec; 2] = [
    p(0, 1.0, 1024.0, 16.0, false),
    p(1, 1.0, 1024.0, 16.0, false),
];
const ATTENUVERTER_BIAS: [ParameterSpec; 2] =
    [p(0, -1.0, 1.0, 1.0, false), p(1, -1.0, 1.0, 0.0, false)];
const SAMPLE_HOLD: [ParameterSpec; 1] = [p(0, 0.0, 2.0, 0.0, true)];
const CV_MIX: [ParameterSpec; 5] = [
    p(0, 0.0, 1.0, 1.0, false),
    p(1, 0.0, 1.0, 0.5, false),
    p(2, 0.0, 1.0, 0.0, false),
    p(3, 0.0, 1.0, 0.0, false),
    p(4, -1.0, 1.0, 0.0, false),
];
const CV_COMPARE: [ParameterSpec; 3] = [
    p(0, 0.0, 2.0, 0.0, true),
    p(1, -1.0, 1.0, 0.0, false),
    p(2, 0.0, 0.5, 0.05, false),
];
const CV_RANGE: [ParameterSpec; 3] = [
    p(0, 0.0, 1.0, 0.0, false),
    p(1, 0.0, 1.0, 1.0, false),
    p(2, 0.0, 1.0, 0.0, true),
];
const STEREO_WIDENER: [ParameterSpec; 3] = [
    p(0, 0.0, 2.0, 1.0, false),
    p(1, 20.0, 500.0, 120.0, false),
    p(2, 0.0, 1.0, 1.0, true),
];

const MIDI_TRANSPOSE: [ParameterSpec; 1] = [p(0, -24.0, 24.0, 0.0, false)];

const VOICE_SYNTH: [ParameterSpec; 6] = [
    p(0, 0.0, 3.0, 0.0, true),
    p(1, 0.001, 2.0, 0.01, false),
    p(2, 0.001, 2.0, 0.12, false),
    p(3, 0.0, 1.0, 0.65, false),
    p(4, 0.001, 3.0, 0.18, false),
    p(5, 0.0, 1.0, 0.25, false),
];

const SAMPLE_INSTRUMENT: [ParameterSpec; 14] = [
    p(0, 36.0, 84.0, 60.0, false),
    p(1, 0.0, 1.0, 1.0, false),
    p(2, 0.0, 0.5, 0.25, false),
    p(3, 0.25, 2.0, 1.0, false),
    p(4, 0.0, 1.0, 0.0, true),
    p(5, 0.0, 1.0, 0.0, true),
    p(6, 0.0, 1.0, 0.0, false),
    p(7, 0.0, 1.0, 0.0, false),
    p(8, 0.0, 1.0, 1.0, false),
    p(9, 0.0, 0.5, 0.08, false),
    p(10, 0.0, 0.2, 0.01, false),
    p(11, 1.0, 4.0, 1.0, false),
    p(12, 0.0, 100.0, 0.0, false),
    p(13, 0.0, 1.0, 0.0, false),
];

const SAMPLE_REGION: [ParameterSpec; 10] = [
    p(0, 0.25, 2.0, 1.0, false),
    p(1, 0.0, 1.0, 0.0, true),
    p(2, 0.0, 1.0, 0.0, true),
    p(3, 0.0, 1.0, 0.0, false),
    p(4, 0.0, 1.0, 0.0, false),
    p(5, 0.0, 1.0, 1.0, false),
    p(8, 0.0, 0.5, 0.08, false),
    p(9, 1.0, 8.0, 1.0, true),
    p(10, 0.0, 100.0, 0.0, false),
    p(11, 0.0, 1.0, 0.0, false),
];

const PHASE_VOCODER: [ParameterSpec; 5] = [
    p(0, 0.0, 1.0, 0.0, true),
    p(1, -24.0, 24.0, 0.0, false),
    p(2, 0.25, 4.0, 1.0, false),
    p(3, 0.0, 1.0, 0.0, false),
    p(4, 9.0, 12.0, 11.0, true),
];

const GRANULATOR: [ParameterSpec; 11] = [
    p(0, 1.0, 500.0, 80.0, false),
    p(1, 1.0, 100.0, 20.0, false),
    p(2, 0.0, 1.0, 0.5, false),
    p(3, -24.0, 24.0, 0.0, false),
    p(4, 0.0, 1.0, 0.2, false),
    p(5, 0.0, 1.0, 1.0, false),
    p(6, 0.0, 1.0, 0.0, true),
    p(7, 0.0, 4.0, 0.0, true),
    p(8, 0.0, 1.0, 1.0, true),
    p(9, 0.0, 1.0, 0.0, false),
    p(10, 0.0, 1.0, 1.0, false),
];

const MAIN_VOICE_BANK: [ParameterSpec; 20] = [
    p(0, 0.0, 4.0, 0.0, true),
    p(1, -1.0, 1.0, 0.0, false),
    p(2, 36.0, 84.0, 60.0, false),
    p(3, 0.0, 2.0, 2.0, true),
    p(4, -24.0, 24.0, 0.0, false),
    p(5, 0.0, 2.0, 0.0, true),
    p(6, 0.0, 5.0, 0.0, true),
    p(7, 0.0, 1.0, 0.5, false),
    p(8, 0.0, 1.0, 0.5, false),
    p(9, 0.0, 1.0, 0.0, false),
    p(10, 0.0, 1.0, 1.0, true),
    p(11, 0.001, 0.5, 0.005, false),
    p(12, 0.001, 1.0, 0.08, false),
    p(13, 0.0, 1.0, 0.8, false),
    p(14, 0.001, 2.0, 0.16, false),
    p(15, 0.0, 2.0, 1.0, false),
    p(16, 0.25, 4.0, 1.0, false),
    p(17, 0.0, 1.0, 0.0, false),
    p(18, 0.05, 0.6, 0.2, false),
    p(19, 0.0, 1.0, 0.0, true),
];

#[path = "parameter_catalog/extended.rs"]
mod extended;

pub fn workspace_parameters(type_id: &str) -> &'static [ParameterSpec] {
    match type_id {
        "adsr" => &ADSR,
        "gain" => &GAIN,
        "mixer9" => &MIXER9,
        "mixer" => &MIXER,
        "crossfader" => &CROSSFADER,
        "ring-modulator" => &RING_MODULATOR,
        "audio-fm" => &AUDIO_FM,
        "audio-sync" => &AUDIO_SYNC,
        "distortion" => &DISTORTION,
        "svf" => &SVF,
        "modulated-svf" => &MODULATED_SVF,
        "effect-slot-legacy" => &EFFECT_SLOT_LEGACY,
        "eq8" => &EQ8,
        "wave-shaper" => &WAVE_SHAPER,
        "legacy-filter" => &LEGACY_FILTER,
        "loop-capture" => &LOOP_CAPTURE,
        "oscillator" => &OSCILLATOR,
        "extended-oscillator" => &EXTENDED_OSCILLATOR,
        "pulse-oscillator" => &PULSE_OSCILLATOR,
        "noise" => &NOISE,
        "lfo" => &LFO,
        "modulated-gain" => &MODULATED_GAIN,
        "slew-control" => &SLEW_CONTROL,
        "attenuverter-bias" => &ATTENUVERTER_BIAS,
        "sample-hold" => &SAMPLE_HOLD,
        "cv-mix" => &CV_MIX,
        "cv-compare" => &CV_COMPARE,
        "cv-range" => &CV_RANGE,
        "stereo-widener" => &STEREO_WIDENER,
        "midi-transpose" => &MIDI_TRANSPOSE,
        "voice-synth" => &VOICE_SYNTH,
        "sample-instrument" => &SAMPLE_INSTRUMENT,
        "sample-region" => &SAMPLE_REGION,
        "phase-vocoder" => &PHASE_VOCODER,
        "granulator" => &GRANULATOR,
        "main-voice-bank" => &MAIN_VOICE_BANK,
        _ => extended::parameters(type_id),
    }
}

pub fn workspace_parameter(type_id: &str, id: u32) -> Option<ParameterSpec> {
    if type_id == "mixer" {
        return mixer_parameter(usize::MAX, id);
    }
    workspace_parameters(type_id)
        .iter()
        .find(|entry| entry.id == id)
        .copied()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::node_catalog::WORKSPACE_TYPES;

    #[test]
    fn every_workspace_parameter_has_a_valid_unique_default() {
        for kind in WORKSPACE_TYPES {
            let mut ids = std::collections::BTreeSet::new();
            for spec in workspace_parameters(kind.id) {
                assert!(ids.insert(spec.id), "{}:{} duplicate", kind.id, spec.id);
                assert!(spec.min.is_finite() && spec.max.is_finite() && spec.default.is_finite());
                assert!(spec.min <= spec.default && spec.default <= spec.max);
                if spec.discrete {
                    assert_eq!(
                        spec.default.fract(),
                        0.0,
                        "{}:{} discrete",
                        kind.id,
                        spec.id
                    );
                }
            }
        }
    }
}
