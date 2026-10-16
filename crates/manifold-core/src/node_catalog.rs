//! Stable graph ABI type codes and node construction, independent of host adapters.

use crate::graph::NodeKind;
use crate::{chorus, compressor, effect_slot, limiter, phaser, stereo_delay};

/// Constructor metadata for the portable graph-workspace subset. Browser and Rust
/// authoring both consume this table; processing rules remain in `NodeKind`.
#[derive(Clone, Copy, Debug)]
pub struct WorkspaceType {
    pub id: &'static str,
    pub code: u32,
    pub a: f64,
    pub b: f64,
    pub arg_count: u8,
}

pub const WORKSPACE_TYPES: [WorkspaceType; 71] = [
    WorkspaceType { id: "wave-shaper", code: 37, a: 0.0, b: 0.0, arg_count: 0 },
    WorkspaceType { id: "legacy-filter", code: 39, a: 0.0, b: 0.0, arg_count: 0 },
    WorkspaceType { id: "adsr", code: 12, a: 0.0, b: 0.0, arg_count: 0 },
    WorkspaceType {
        id: "input.raw",
        code: 0,
        a: 0.0,
        b: 0.0,
        arg_count: 0,
    },
    WorkspaceType {
        id: "input.sidechain",
        code: 65,
        a: 0.0,
        b: 0.0,
        arg_count: 0,
    },
    WorkspaceType {
        id: "output",
        code: 7,
        a: 0.0,
        b: 0.0,
        arg_count: 0,
    },
    WorkspaceType {
        id: "gain",
        code: 3,
        a: 0.7,
        b: 0.0,
        arg_count: 1,
    },
    WorkspaceType {
        id: "fixed-gain",
        code: 67,
        a: 4.0,
        b: 0.0,
        arg_count: 1,
    },
    WorkspaceType {
        id: "distortion",
        code: 17,
        a: 4.0,
        b: 0.7,
        arg_count: 2,
    },
    WorkspaceType {
        id: "svf",
        code: 6,
        a: 0.0,
        b: 0.0,
        arg_count: 0,
    },
    WorkspaceType {
        id: "modulated-svf",
        code: 16,
        a: 2000.0,
        b: 0.0,
        arg_count: 1,
    },
    WorkspaceType {
        id: "effect-slot-legacy",
        code: 52,
        a: 0.0,
        b: 0.0,
        arg_count: 2,
    },
    WorkspaceType {
        id: "eq8",
        code: 36,
        a: 0.0,
        b: 0.0,
        arg_count: 0,
    },
    WorkspaceType {
        id: "sum2",
        code: 4,
        a: 1.0,
        b: 1.0,
        arg_count: 2,
    },
    WorkspaceType {
        id: "mixer9",
        code: 9,
        a: 9.0,
        b: 1.0,
        arg_count: 2,
    },
    WorkspaceType { id: "mixer", code: 9, a: 32.0, b: 1.0, arg_count: 2 },
    WorkspaceType {
        id: "crossfader",
        code: 8,
        a: 0.0,
        b: 1.0,
        arg_count: 2,
    },
    WorkspaceType {
        id: "ring-modulator",
        code: 42,
        a: 0.0,
        b: 0.0,
        arg_count: 0,
    },
    WorkspaceType {
        id: "audio-fm",
        code: 71,
        a: 0.0,
        b: 0.0,
        arg_count: 0,
    },
    WorkspaceType {
        id: "audio-sync",
        code: 72,
        a: 0.0,
        b: 0.0,
        arg_count: 0,
    },
    WorkspaceType {
        id: "loop-capture",
        code: 20,
        a: 2.0,
        b: 1.0,
        arg_count: 2,
    },
    WorkspaceType {
        id: "retrospective-capture",
        code: 66,
        a: 30.0,
        b: 0.0,
        arg_count: 2,
    },
    WorkspaceType {
        id: "oscillator",
        code: 11,
        a: 220.0,
        b: 0.4,
        arg_count: 2,
    },
    WorkspaceType {
        id: "extended-oscillator",
        code: 73,
        a: 220.0,
        b: 0.0,
        arg_count: 2,
    },
    WorkspaceType {
        id: "pulse-oscillator",
        code: 70,
        a: 220.0,
        b: 0.4,
        arg_count: 2,
    },
    WorkspaceType {
        id: "noise",
        code: 13,
        a: 0.08,
        b: 0.5,
        arg_count: 2,
    },
    WorkspaceType {
        id: "lfo",
        code: 14,
        a: 2.0,
        b: 0.0,
        arg_count: 1,
    },
    WorkspaceType {
        id: "modulated-gain",
        code: 15,
        a: 0.5,
        b: 0.4,
        arg_count: 2,
    },
    WorkspaceType {
        id: "slew-control",
        code: 30,
        a: 16.0,
        b: 16.0,
        arg_count: 2,
    },
    WorkspaceType {
        id: "attenuverter-bias",
        code: 31,
        a: 1.0,
        b: 0.0,
        arg_count: 2,
    },
    WorkspaceType {
        id: "sample-hold",
        code: 32,
        a: 0.0,
        b: 0.0,
        arg_count: 1,
    },
    WorkspaceType {
        id: "cv-mix",
        code: 33,
        a: 1.0,
        b: 0.5,
        arg_count: 2,
    },
    WorkspaceType {
        id: "cv-compare",
        code: 68,
        a: 0.0,
        b: 0.0,
        arg_count: 0,
    },
    WorkspaceType {
        id: "cv-range",
        code: 69,
        a: 0.0,
        b: 0.0,
        arg_count: 0,
    },
    WorkspaceType {
        id: "stereo-widener",
        code: 38,
        a: 0.0,
        b: 0.0,
        arg_count: 0,
    },
    WorkspaceType {
        id: "midi-input",
        code: 54,
        a: 0.0,
        b: 0.0,
        arg_count: 0,
    },
    WorkspaceType {
        id: "midi-transpose",
        code: 55,
        a: 0.0,
        b: 0.0,
        arg_count: 1,
    },
    WorkspaceType {
        id: "voice-synth",
        code: 10,
        a: 0.0,
        b: 0.0,
        arg_count: 0,
    },
    WorkspaceType {
        id: "sample-instrument",
        code: 27,
        a: 0.0,
        b: 0.0,
        arg_count: 0,
    },
    WorkspaceType {
        id: "sample-region",
        code: 26,
        a: 0.0,
        b: 0.0,
        arg_count: 0,
    },
    WorkspaceType {
        id: "phase-vocoder",
        code: 62,
        a: 0.0,
        b: 0.0,
        arg_count: 0,
    },
    WorkspaceType {
        id: "granulator",
        code: 51,
        a: 0.0,
        b: 0.0,
        arg_count: 0,
    },
    WorkspaceType {
        id: "main-voice-bank",
        code: 64,
        a: 9.0,
        b: 0.0,
        arg_count: 1,
    },
    WorkspaceType { id: "compressor", code: 24, a: -12.0, b: 4.0, arg_count: 2 },
    WorkspaceType { id: "limiter", code: 25, a: -1.0, b: 60.0, arg_count: 2 },
    WorkspaceType { id: "stereo-delay", code: 18, a: 250.0, b: 375.0, arg_count: 2 },
    WorkspaceType { id: "phaser", code: 34, a: 0.4, b: 0.7, arg_count: 2 },
    WorkspaceType { id: "chorus", code: 35, a: 0.6, b: 0.45, arg_count: 2 },
    WorkspaceType { id: "reverb", code: 40, a: 0.0, b: 0.0, arg_count: 0 },
    WorkspaceType { id: "multitap-delay", code: 41, a: 0.0, b: 0.0, arg_count: 0 },
    WorkspaceType { id: "transient-shaper", code: 43, a: 0.0, b: 0.0, arg_count: 0 },
    WorkspaceType { id: "bit-crusher", code: 44, a: 0.0, b: 0.0, arg_count: 0 },
    WorkspaceType { id: "three-band-eq", code: 45, a: 0.0, b: 0.0, arg_count: 0 },
    WorkspaceType { id: "formant-filter", code: 46, a: 0.0, b: 0.0, arg_count: 0 },
    WorkspaceType { id: "resonator", code: 60, a: 0.0, b: 0.0, arg_count: 0 },
    WorkspaceType { id: "reverse-delay", code: 47, a: 0.0, b: 0.0, arg_count: 0 },
    WorkspaceType { id: "stutter", code: 48, a: 0.0, b: 0.0, arg_count: 0 },
    WorkspaceType { id: "pitch-shifter", code: 49, a: 0.0, b: 0.0, arg_count: 0 },
    WorkspaceType { id: "shimmer", code: 50, a: 0.0, b: 0.0, arg_count: 0 },
    WorkspaceType { id: "spectrum-analyzer", code: 21, a: 1.0, b: 0.85, arg_count: 2 },
    WorkspaceType { id: "fft-spectrum", code: 28, a: 0.45, b: -72.0, arg_count: 2 },
    WorkspaceType { id: "envelope-follower", code: 22, a: 10.0, b: 120.0, arg_count: 2 },
    WorkspaceType { id: "envelope-control", code: 23, a: 10.0, b: 120.0, arg_count: 2 },
    WorkspaceType { id: "midi-note-filter", code: 56, a: 36.0, b: 96.0, arg_count: 2 },
    WorkspaceType { id: "midi-scale-quantizer", code: 57, a: 0.0, b: 1.0, arg_count: 2 },
    WorkspaceType { id: "midi-velocity-mapper", code: 58, a: 1.0, b: 0.0, arg_count: 2 },
    WorkspaceType { id: "midi-arpeggiator", code: 59, a: 8.0, b: 0.0, arg_count: 2 },
    WorkspaceType { id: "constant", code: 2, a: 0.0, b: 0.0, arg_count: 1 },
    WorkspaceType { id: "linear-blend", code: 5, a: 0.5, b: 0.0, arg_count: 1 },
    WorkspaceType { id: "slew-audio", code: 29, a: 64.0, b: 64.0, arg_count: 2 },
    WorkspaceType { id: "phrase-gain", code: 63, a: 1.0, b: 0.2, arg_count: 2 },
];

pub fn workspace_type(id: &str) -> Option<&'static WorkspaceType> {
    WORKSPACE_TYPES.iter().find(|entry| entry.id == id)
}

/// Structural settings; live controls continue to use the parameter catalog.
#[derive(Clone, Copy, Debug)]
pub struct ConstructorField {
    pub name: &'static str,
    pub argument: usize,
    pub min: f64,
    pub max: Option<f64>,
}

pub fn constructor_fields(id: &str) -> &'static [ConstructorField] {
    match id {
        "mixer" => &[ConstructorField { name: "inputs", argument: 0, min: 1.0, max: None }],
        "loop-capture" => &[ConstructorField {
            name: "capacitySeconds",
            argument: 0,
            min: 0.0,
            max: None,
        }],
        "retrospective-capture" => &[ConstructorField {
            name: "capacitySeconds",
            argument: 0,
            min: 0.0,
            max: None,
        }],
        "fixed-gain" => &[ConstructorField {
            name: "gain",
            argument: 0,
            min: 0.0,
            max: Some(4.0),
        }],
        _ => &[],
    }
}

impl WorkspaceType {
    pub fn matches_kind(&self, kind: &NodeKind) -> bool {
        kind.workspace_type_id() == Some(self.id)
            || self.id == "mixer" && matches!(kind, NodeKind::Mixer { .. })
    }

    pub fn valid_arguments(&self, arguments: [f64; 2]) -> bool {
        (self.id != "mixer" || (arguments[0] >= 1.0 && arguments[0].fract() == 0.0
            && arguments[0] == (arguments[0] as f32) as f64
            && crate::parameter_catalog::mixer_input_parameter(arguments[0] as usize - 1, true).is_some()))
            && (!matches!(self.id, "loop-capture" | "retrospective-capture") || arguments[0] > 0.0) && arguments.into_iter().enumerate().all(|(index, value)| {
            if let Some(field) = constructor_fields(self.id)
                .iter()
                .find(|field| field.argument == index)
            {
                value.is_finite() && value >= field.min && field.max.is_none_or(|max| value <= max)
            } else {
                value == [self.a, self.b][index]
            }
        })
    }

    /// Validate all fields before updating an author's document.
    pub fn configure(&self, mut arguments: [f64; 2], values: &[(&str, f64)]) -> Option<[f64; 2]> {
        for (index, &(name, value)) in values.iter().enumerate() {
            if values[..index]
                .iter()
                .any(|(previous, _)| *previous == name)
            {
                return None;
            }
            let field = constructor_fields(self.id)
                .iter()
                .find(|field| field.name == name)?;
            arguments[field.argument] = value;
        }
        self.valid_arguments(arguments).then_some(arguments)
    }
}

impl NodeKind {
    /// Stable names currently accepted by the portable graph-workspace document.
    pub fn workspace_type_id(&self) -> Option<&'static str> {
        Some(match self {
            Self::InputRaw => "input.raw",
            Self::InputSidechain => "input.sidechain",
            Self::Output => "output",
            Self::AdsrEnvelope => "adsr",
            Self::Gain { .. } => "gain",
            Self::FixedGain { .. } => "fixed-gain",
            Self::Distortion { .. } => "distortion",
            Self::Svf => "svf",
            Self::ModulatedSvf { .. } => "modulated-svf",
            Self::EffectSlotLegacy { .. } => "effect-slot-legacy",
            Self::Eq8 { .. } => "eq8",
            Self::WaveShaper { .. } => "wave-shaper",
            Self::LegacyFilter { .. } => "legacy-filter",
            Self::Sum2 { .. } => "sum2",
            Self::Mixer { inputs: 9, .. } => "mixer9",
            Self::Mixer { .. } => "mixer",
            Self::Crossfader { .. } => "crossfader",
            Self::RingModulator { .. } => "ring-modulator",
            Self::AudioFm { .. } => "audio-fm",
            Self::AudioSync { .. } => "audio-sync",
            Self::LoopCapture { .. } => "loop-capture",
            Self::RetrospectiveCapture { .. } => "retrospective-capture",
            Self::Oscillator { .. } => "oscillator",
            Self::ExtendedOscillator { .. } => "extended-oscillator",
            Self::PulseOscillator { .. } => "pulse-oscillator",
            Self::NoiseGenerator { .. } => "noise",
            Self::Lfo { .. } => "lfo",
            Self::ModulatedGain { .. } => "modulated-gain",
            Self::SlewControl { .. } => "slew-control",
            Self::AttenuverterBias { .. } => "attenuverter-bias",
            Self::SampleHold { .. } => "sample-hold",
            Self::CvMix { .. } => "cv-mix",
            Self::CvCompare => "cv-compare",
            Self::CvRange => "cv-range",
            Self::StereoWidener { .. } => "stereo-widener",
            Self::MidiInput => "midi-input",
            Self::MidiTranspose { .. } => "midi-transpose",
            Self::VoiceSynth => "voice-synth",
            Self::SampleInstrument => "sample-instrument",
            Self::SampleRegion => "sample-region",
            Self::PhaseVocoder { .. } => "phase-vocoder",
            Self::Granulator { .. } => "granulator",
            Self::MainVoiceBank { .. } => "main-voice-bank",
            Self::Compressor { .. } => "compressor",
            Self::Limiter { .. } => "limiter",
            Self::StereoDelay { .. } => "stereo-delay",
            Self::Phaser { .. } => "phaser",
            Self::Chorus { .. } => "chorus",
            Self::Reverb { .. } => "reverb",
            Self::MultitapDelay { .. } => "multitap-delay",
            Self::TransientShaper { .. } => "transient-shaper",
            Self::BitCrusher { .. } => "bit-crusher",
            Self::LegacyEq { .. } => "three-band-eq",
            Self::FormantFilter { .. } => "formant-filter",
            Self::Resonator { .. } => "resonator",
            Self::ReverseDelay { .. } => "reverse-delay",
            Self::Stutter { .. } => "stutter",
            Self::PitchShifter { .. } => "pitch-shifter",
            Self::Shimmer { .. } => "shimmer",
            Self::SpectrumAnalyzer { .. } => "spectrum-analyzer",
            Self::FftSpectrum { .. } => "fft-spectrum",
            Self::EnvelopeFollower { .. } => "envelope-follower",
            Self::EnvelopeControl { .. } => "envelope-control",
            Self::MidiNoteFilter { .. } => "midi-note-filter",
            Self::MidiScaleQuantizer { .. } => "midi-scale-quantizer",
            Self::MidiVelocityMapper { .. } => "midi-velocity-mapper",
            Self::MidiArpeggiator { .. } => "midi-arpeggiator",
            Self::Constant { .. } => "constant",
            Self::LinearBlend { .. } => "linear-blend",
            Self::SlewAudio { .. } => "slew-audio",
            Self::PhraseGain { .. } => "phrase-gain",
            _ => return None,
        })
    }

    /// Decode the versioned graph ABI type in the DSP crate, shared by Wasm and catalog generation.
    pub fn from_abi_code(code: u32, a: f32, b: f32) -> Option<Self> {
        let kind = match code {
            0 => Self::InputRaw,
            1 => Self::InputMonitor { gain: a },
            2 => Self::Constant { value: a },
            3 => Self::Gain { gain: a },
            4 => Self::Sum2 {
                gain_a: a,
                gain_b: b,
            },
            5 => Self::LinearBlend { mix: a },
            6 => Self::Svf,
            7 => Self::Output,
            8 => Self::Crossfader {
                position: a,
                curve: b,
                mix: 1.0,
            },
            9 if a.is_finite() && a.fract() == 0.0 && a >= 1.0 => {
                let inputs = a as usize;
                crate::parameter_catalog::mixer_input_parameter(inputs - 1, true)?;
                let mut gains = crate::io::prepare_planar_buffer(1, inputs).ok()?;
                gains.fill(1.0);
                Self::Mixer { inputs, gains,
                    pans: crate::io::prepare_planar_buffer(1, inputs).ok()?, master: b }
            },
            10 => Self::VoiceSynth,
            11 => Self::Oscillator {
                frequency: a,
                amplitude: b,
                waveform: 0,
            },
            73 => Self::ExtendedOscillator {
                frequency: a,
                amplitude: b,
                waveform: 1,
            },
            70 => Self::PulseOscillator {
                frequency: a,
                amplitude: b,
                width: 0.25,
            },
            12 => Self::AdsrEnvelope,
            13 => Self::NoiseGenerator { level: a, color: b },
            14 => Self::Lfo {
                waveform: 0,
                rate: a,
            },
            15 => Self::ModulatedGain { base: a, depth: b },
            16 => Self::ModulatedSvf { depth_hz: a },
            17 => Self::Distortion {
                drive: a,
                mix: b,
                output: 0.8,
            },
            18 => {
                let mut params = stereo_delay::defaults();
                params[0] = a;
                params[1] = b;
                Self::StereoDelay { params }
            }
            19 | 52 | 53 => {
                let Some(selected) = effect_slot::supported_type(a) else {
                    return None;
                };
                let params = match selected {
                    effect_slot::CHORUS_TYPE => [0.5, 0.5, 0.2, 0.6, 0.4],
                    effect_slot::PHASER_TYPE => [0.5, 0.5, 0.4, 0.5, 0.4],
                    effect_slot::WAVESHAPER_TYPE => [0.3, 0.0, 0.7, 0.5, 0.5],
                    effect_slot::WIDENER_TYPE => [0.6, 0.4, 0.5, 0.5, 0.5],
                    effect_slot::LEGACY_FILTER_TYPE => [0.5, 0.2, 0.5, 0.5, 0.5],
                    effect_slot::REVERB_TYPE => [0.5, 0.4, 0.5, 0.5, 0.5],
                    effect_slot::MULTITAP_TYPE => [0.3, 0.3, 0.5, 0.5, 0.5],
                    effect_slot::RING_TYPE => [0.3, 1.0, 0.2, 0.5, 0.5],
                    effect_slot::TRANSIENT_TYPE => [0.5, 0.5, 0.5, 0.5, 0.5],
                    effect_slot::BITCRUSHER_TYPE => [0.3, 0.12, 0.55, 0.5, 0.5],
                    effect_slot::EQ_TYPE => [0.5; 5],
                    effect_slot::FORMANT_TYPE => [0.0, 0.5, 0.4, 0.3, 0.5],
                    effect_slot::REVERSE_DELAY_TYPE => [0.2, 0.25, 0.47, 0.5, 0.5],
                    effect_slot::STUTTER_TYPE => [0.05, 0.8, 0.8, 0.25, 0.5],
                    effect_slot::PITCH_SHIFT_TYPE => [0.5, 0.5, 0.2, 0.5, 0.5],
                    effect_slot::GRANULATOR_TYPE => [0.3, 0.4, 0.6, 0.25, 0.5],
                    effect_slot::SHIMMER_TYPE => [0.6, 0.75, 0.7, 0.5, 0.5],
                    effect_slot::COMPRESSOR_TYPE => [0.4, 0.3, 0.1, 0.3, 0.5],
                    effect_slot::SVF_TYPE => [0.5, 0.4, 0.1, 0.5, 0.5],
                    effect_slot::DELAY_TYPE => [0.3, 0.3, 0.5, 0.5, 0.5],
                    effect_slot::LIMITER_TYPE => [0.5, 0.3, 0.4, 0.4, 0.5],
                    _ => unreachable!(),
                };
                if code == 53 {
                    Self::EffectSlotHostSwitch {
                        selected,
                        mix: b,
                        params,
                    }
                } else if code == 52 {
                    Self::EffectSlotLegacy {
                        selected,
                        mix: b,
                        params,
                    }
                } else {
                    Self::EffectSlot {
                        selected,
                        mix: b,
                        params,
                    }
                }
            }
            20 => Self::LoopCapture {
                capacity_seconds: a,
                mix: b,
            },
            66 => Self::RetrospectiveCapture {
                capacity_seconds: a,
            },
            67 => Self::FixedGain { gain: a },
            21 => Self::SpectrumAnalyzer {
                sensitivity: a,
                smoothing: b,
                floor_db: -72.0,
            },
            22 => Self::EnvelopeFollower {
                attack_ms: a,
                release_ms: b,
                sensitivity: 1.0,
                highpass_hz: 80.0,
                mode: 0,
            },
            23 => Self::EnvelopeControl {
                attack_ms: a,
                release_ms: b,
                sensitivity: 1.0,
                highpass_hz: 80.0,
                mode: 0,
            },
            24 => {
                let mut params = compressor::defaults();
                params[0] = a;
                params[1] = b;
                Self::Compressor { params }
            }
            25 => {
                let mut params = limiter::defaults();
                params[0] = a;
                params[1] = b;
                Self::Limiter { params }
            }
            26 => Self::SampleRegion,
            27 => Self::SampleInstrument,
            28 => Self::FftSpectrum {
                smoothing: a,
                floor_db: b,
            },
            29 => Self::SlewAudio { up: a, down: b },
            30 => Self::SlewControl { up: a, down: b },
            31 => Self::AttenuverterBias { amount: a, bias: b },
            32 => Self::SampleHold {
                mode: a.round().clamp(0.0, 2.0) as u32,
            },
            33 => Self::CvMix {
                levels: [a, b, 0.0, 0.0],
                offset: 0.0,
            },
            68 => Self::CvCompare,
            69 => Self::CvRange,
            34 => {
                let mut params = phaser::defaults();
                params[0] = a;
                params[1] = b;
                Self::Phaser { params }
            }
            35 => {
                let mut params = chorus::defaults();
                params[0] = a;
                params[1] = b;
                Self::Chorus { params }
            }
            36 => Self::Eq8 {
                params: crate::eq8::defaults(),
            },
            37 => Self::WaveShaper {
                params: crate::waveshaper::DEFAULTS,
            },
            38 => Self::StereoWidener {
                params: crate::stereo_widener::DEFAULTS,
            },
            39 => Self::LegacyFilter {
                params: crate::legacy_filter::DEFAULTS,
            },
            40 => Self::Reverb {
                params: crate::reverb::DEFAULTS,
            },
            41 => Self::MultitapDelay {
                params: crate::multitap_delay::DEFAULTS,
            },
            42 => Self::RingModulator {
                params: crate::ring_modulator::DEFAULTS,
            },
            71 => Self::AudioFm {
                params: crate::audio_fm::DEFAULTS,
            },
            72 => Self::AudioSync {
                params: crate::audio_sync::DEFAULTS,
            },
            43 => Self::TransientShaper {
                params: crate::transient_shaper::DEFAULTS,
            },
            44 => Self::BitCrusher {
                params: crate::bitcrusher::DEFAULTS,
            },
            45 => Self::LegacyEq {
                params: crate::legacy_eq::DEFAULTS,
            },
            46 => Self::FormantFilter {
                params: crate::formant_filter::DEFAULTS,
            },
            60 => Self::Resonator {
                params: crate::resonator::DEFAULTS,
            },
            61 => Self::SineBank {
                params: crate::sine_bank::DEFAULTS,
            },
            47 => Self::ReverseDelay {
                params: crate::reverse_delay::DEFAULTS,
            },
            48 => Self::Stutter {
                params: crate::stutter::DEFAULTS,
            },
            49 => Self::PitchShifter {
                params: crate::pitch_shifter::DEFAULTS,
            },
            62 => Self::PhaseVocoder {
                params: crate::phase_vocoder::DEFAULTS,
            },
            63 => Self::PhraseGain {
                amount: a,
                reference: b,
            },
            64 if a.is_finite() && a.fract() == 0.0 && (9.0..=12.0).contains(&a) => {
                Self::MainVoiceBank {
                    fft_order: a as u32,
                }
            }
            65 => Self::InputSidechain,
            50 => Self::Shimmer {
                params: crate::shimmer::DEFAULTS,
            },
            51 => Self::Granulator {
                params: crate::granulator::DEFAULTS,
            },
            54 => Self::MidiInput,
            55 => Self::MidiTranspose { semitones: a },
            56 => Self::MidiNoteFilter {
                low: a,
                high: b,
                mode: 0,
            },
            57 => Self::MidiScaleQuantizer {
                root: a,
                scale: b,
                direction: 1.0,
            },
            58 => Self::MidiVelocityMapper {
                amount: a,
                curve: b,
                offset: 0.0,
            },
            59 => Self::MidiArpeggiator { rate: a, mode: b },
            _ => return None,
        };
        Some(kind)
    }
}
