//! Editable graph descriptions compile into a fully owned, preallocated execution plan.
//! Routing is explicit: a graph without a route to Output emits silence.

use crate::Filter;
use crate::bitcrusher::{self, BitCrusher};
use crate::chorus::{self, Chorus};
use crate::compressor::{self, Compressor};
use crate::cv_utilities::{AttenuverterBias, CvMix, SampleHold};
use crate::distortion::Distortion;
use crate::effect_slot::{self, EffectSlot};
use crate::envelope::AdsrEnvelope;
use crate::envelope_follower::EnvelopeFollower;
use crate::eq8::{self, Eq8};
use crate::events::{EventError, EventKind, TimedEvent};
use crate::fft_spectrum::FftSpectrum;
use crate::formant_filter::{self, FormantFilter};
use crate::granulator::{self, Granulator};
use crate::legacy_eq::{self, LegacyEq};
use crate::legacy_filter::{self, LegacyFilter};
use crate::lfo::Lfo;
use crate::limiter::{self, Limiter};
use crate::loop_capture::LoopCapture;
use crate::main_directional::{DirectionalUpdate, MainDirectionalMotion};
use crate::main_pitch::route_main_pitch;
use crate::main_voice_bank::{MainTemporalRecipe, MainVoiceBank};
use crate::midi_arpeggiator::MidiArpeggiator;
use crate::midi_note_filter::MidiNoteFilter;
use crate::midi_scale_quantizer::MidiScaleQuantizer;
use crate::midi_transpose::{MAX_OUTPUT_EVENTS, MidiTranspose};
use crate::midi_velocity_mapper::MidiVelocityMapper;
use crate::multitap_delay::{self, MultitapDelay};
use crate::noise::NoiseGenerator;
use crate::oscillator::Oscillator;
use crate::phase_vocoder::{self, PhaseVocoder};
use crate::phaser::Phaser;
use crate::phrase_gain::PhraseGain;
use crate::pitch_shifter::{self, PitchShifter};
use crate::resonator::{self, Resonator};
use crate::reverb::{self, Reverb};
use crate::reverse_delay::{self, ReverseDelay};
use crate::ring_modulator::{self, RingModulator};
use crate::sample_instrument::SampleInstrument;
use crate::sample_region::{SampleRegion, ValidatedStereo};
use crate::shimmer::{self, Shimmer};
use crate::sine_bank::{self, PartialSet, SineBank};
use crate::slew_limiter::SlewLimiter;
use crate::spectrum_analyzer::SpectrumAnalyzer;
use crate::stereo_delay::StereoDelay;
use crate::stereo_widener::{self, StereoWidener};
use crate::stutter::{self, Stutter};
use crate::temporal_partials::TemporalFrame;
use crate::transient_shaper::{self, TransientShaper};
use crate::voice::VoiceSynth;
use crate::waveshaper::{self, WaveShaper};
use std::collections::{HashMap, VecDeque};

pub type NodeId = u64;
pub const MIDI_TRACE_CAPACITY: usize = 32;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MidiTraceEntry {
    pub sequence: u32,
    pub node: NodeId,
    pub offset: usize,
    pub kind: EventKind,
    pub emitted: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SignalKind {
    Audio,
    Control,
    Midi,
}

#[derive(Clone, Debug)]
pub enum NodeKind {
    MidiInput,
    MidiArpeggiator {
        rate: f32,
        mode: f32,
    },
    MidiTranspose {
        semitones: f32,
    },
    MidiNoteFilter {
        low: f32,
        high: f32,
        mode: u32,
    },
    MidiScaleQuantizer {
        root: f32,
        scale: f32,
        direction: f32,
    },
    MidiVelocityMapper {
        amount: f32,
        curve: f32,
        offset: f32,
    },
    InputRaw,
    InputSidechain,
    InputMonitor {
        gain: f32,
    },
    Constant {
        value: f32,
    },
    Gain {
        gain: f32,
    },
    FixedGain {
        gain: f32,
    },
    Sum2 {
        gain_a: f32,
        gain_b: f32,
    },
    LinearBlend {
        mix: f32,
    },
    Crossfader {
        position: f32,
        curve: f32,
        mix: f32,
    },
    Mixer {
        inputs: usize,
        gains: Vec<f32>,
        pans: Vec<f32>,
        master: f32,
    },
    Svf,
    ModulatedSvf {
        depth_hz: f32,
    },
    SlewAudio {
        up: f32,
        down: f32,
    },
    SlewControl {
        up: f32,
        down: f32,
    },
    AttenuverterBias {
        amount: f32,
        bias: f32,
    },
    SampleHold {
        mode: u32,
    },
    CvMix {
        levels: [f32; 4],
        offset: f32,
    },
    Distortion {
        drive: f32,
        mix: f32,
        output: f32,
    },
    Compressor {
        params: [f32; compressor::PARAM_COUNT],
    },
    Limiter {
        params: [f32; limiter::PARAM_COUNT],
    },
    StereoDelay {
        params: [f32; 16],
    },
    Phaser {
        params: [f32; 5],
    },
    Chorus {
        params: [f32; chorus::PARAM_COUNT],
    },
    Eq8 {
        params: [f32; eq8::PARAM_COUNT],
    },
    WaveShaper {
        params: [f32; waveshaper::PARAM_COUNT],
    },
    StereoWidener {
        params: [f32; stereo_widener::PARAM_COUNT],
    },
    LegacyFilter {
        params: [f32; legacy_filter::PARAM_COUNT],
    },
    Reverb {
        params: [f32; reverb::PARAM_COUNT],
    },
    MultitapDelay {
        params: [f32; multitap_delay::PARAM_COUNT],
    },
    RingModulator {
        params: [f32; ring_modulator::PARAM_COUNT],
    },
    TransientShaper {
        params: [f32; transient_shaper::PARAM_COUNT],
    },
    BitCrusher {
        params: [f32; bitcrusher::PARAM_COUNT],
    },
    LegacyEq {
        params: [f32; legacy_eq::PARAM_COUNT],
    },
    FormantFilter {
        params: [f32; formant_filter::PARAM_COUNT],
    },
    Resonator {
        params: [f32; resonator::PARAM_COUNT],
    },
    SineBank {
        params: [f32; sine_bank::PARAM_COUNT],
    },
    ReverseDelay {
        params: [f32; reverse_delay::PARAM_COUNT],
    },
    Stutter {
        params: [f32; stutter::PARAM_COUNT],
    },
    PitchShifter {
        params: [f32; pitch_shifter::PARAM_COUNT],
    },
    PhaseVocoder {
        params: [f32; phase_vocoder::PARAM_COUNT],
    },
    Shimmer {
        params: [f32; shimmer::PARAM_COUNT],
    },
    Granulator {
        params: [f32; granulator::PARAM_COUNT],
    },
    EffectSlot {
        selected: u32,
        mix: f32,
        params: [f32; 5],
    },
    EffectSlotLegacy {
        selected: u32,
        mix: f32,
        params: [f32; 5],
    },
    EffectSlotHostSwitch {
        selected: u32,
        mix: f32,
        params: [f32; 5],
    },
    LoopCapture {
        capacity_seconds: f32,
        mix: f32,
    },
    RetrospectiveCapture {
        capacity_seconds: f32,
    },
    SampleRegion,
    SampleInstrument,
    MainVoiceBank {
        fft_order: u32,
    },
    SpectrumAnalyzer {
        sensitivity: f32,
        smoothing: f32,
        floor_db: f32,
    },
    FftSpectrum {
        smoothing: f32,
        floor_db: f32,
    },
    EnvelopeFollower {
        attack_ms: f32,
        release_ms: f32,
        sensitivity: f32,
        highpass_hz: f32,
        mode: u32,
    },
    EnvelopeControl {
        attack_ms: f32,
        release_ms: f32,
        sensitivity: f32,
        highpass_hz: f32,
        mode: u32,
    },
    VoiceSynth,
    Oscillator {
        frequency: f32,
        amplitude: f32,
        waveform: u32,
    },
    AdsrEnvelope,
    NoiseGenerator {
        level: f32,
        color: f32,
    },
    Lfo {
        waveform: u32,
        rate: f32,
    },
    ModulatedGain {
        base: f32,
        depth: f32,
    },
    PhraseGain {
        amount: f32,
        reference: f32,
    },
    Output,
}

impl NodeKind {
    fn input_count(&self) -> usize {
        match self {
            Self::InputRaw
            | Self::InputSidechain
            | Self::InputMonitor { .. }
            | Self::Constant { .. }
            | Self::MidiInput => 0,
            Self::NoiseGenerator { .. } | Self::Lfo { .. } => 0,
            Self::Sum2 { .. }
            | Self::LinearBlend { .. }
            | Self::Crossfader { .. }
            | Self::ModulatedGain { .. }
            | Self::PhraseGain { .. }
            | Self::ModulatedSvf { .. }
            | Self::SampleHold { .. }
            | Self::RingModulator { .. }
            | Self::BitCrusher { .. } => 2,
            Self::CvMix { .. } => 4,
            Self::Mixer { inputs, .. } => *inputs,
            Self::Gain { .. }
            | Self::FixedGain { .. }
            | Self::MidiTranspose { .. }
            | Self::MidiNoteFilter { .. }
            | Self::MidiArpeggiator { .. }
            | Self::MidiScaleQuantizer { .. }
            | Self::MidiVelocityMapper { .. }
            | Self::VoiceSynth
            | Self::Oscillator { .. }
            | Self::SampleRegion
            | Self::SampleInstrument
            | Self::MainVoiceBank { .. }
            | Self::Svf
            | Self::SlewAudio { .. }
            | Self::LegacyEq { .. }
            | Self::FormantFilter { .. }
            | Self::Resonator { .. }
            | Self::SineBank { .. }
            | Self::ReverseDelay { .. }
            | Self::Stutter { .. }
            | Self::PitchShifter { .. }
            | Self::PhaseVocoder { .. }
            | Self::Shimmer { .. }
            | Self::Granulator { .. }
            | Self::SlewControl { .. }
            | Self::AttenuverterBias { .. }
            | Self::AdsrEnvelope
            | Self::Distortion { .. }
            | Self::Compressor { .. }
            | Self::Limiter { .. }
            | Self::StereoDelay { .. }
            | Self::Phaser { .. }
            | Self::Chorus { .. }
            | Self::Eq8 { .. }
            | Self::WaveShaper { .. }
            | Self::StereoWidener { .. }
            | Self::LegacyFilter { .. }
            | Self::Reverb { .. }
            | Self::MultitapDelay { .. }
            | Self::TransientShaper { .. }
            | Self::EffectSlot { .. }
            | Self::EffectSlotLegacy { .. }
            | Self::EffectSlotHostSwitch { .. }
            | Self::LoopCapture { .. }
            | Self::RetrospectiveCapture { .. }
            | Self::SpectrumAnalyzer { .. }
            | Self::FftSpectrum { .. }
            | Self::EnvelopeFollower { .. }
            | Self::EnvelopeControl { .. }
            | Self::Output => 1,
        }
    }

    fn output_signal(&self) -> SignalKind {
        if matches!(
            self,
            Self::MidiInput
                | Self::MidiTranspose { .. }
                | Self::MidiNoteFilter { .. }
                | Self::MidiArpeggiator { .. }
                | Self::MidiScaleQuantizer { .. }
                | Self::MidiVelocityMapper { .. }
        ) {
            return SignalKind::Midi;
        }
        if matches!(
            self,
            Self::Lfo { .. }
                | Self::EnvelopeControl { .. }
                | Self::SlewControl { .. }
                | Self::AttenuverterBias { .. }
                | Self::SampleHold { .. }
                | Self::CvMix { .. }
        ) {
            SignalKind::Control
        } else {
            SignalKind::Audio
        }
    }

    fn input_signal(&self, port: usize) -> SignalKind {
        if matches!(
            self,
            Self::MidiTranspose { .. }
                | Self::MidiNoteFilter { .. }
                | Self::MidiArpeggiator { .. }
                | Self::MidiScaleQuantizer { .. }
                | Self::MidiVelocityMapper { .. }
                | Self::VoiceSynth
                | Self::SampleRegion
                | Self::SampleInstrument
                | Self::MainVoiceBank { .. }
        ) && port == 0
        {
            return SignalKind::Midi;
        }
        if matches!(
            self,
            Self::SlewControl { .. }
                | Self::AttenuverterBias { .. }
                | Self::SampleHold { .. }
                | Self::CvMix { .. }
        ) || matches!(
            self,
            Self::ModulatedGain { .. } | Self::ModulatedSvf { .. } | Self::PhraseGain { .. }
        ) && port == 1
        {
            SignalKind::Control
        } else {
            SignalKind::Audio
        }
    }

    fn valid(&self) -> bool {
        match self {
            Self::MidiTranspose { semitones } => semitones.is_finite(),
            Self::MidiArpeggiator { rate, mode } => rate.is_finite() && mode.is_finite(),
            Self::MidiNoteFilter { low, high, mode } => {
                low.is_finite() && high.is_finite() && *mode <= 1
            }
            Self::MidiScaleQuantizer {
                root,
                scale,
                direction,
            } => root.is_finite() && scale.is_finite() && direction.is_finite(),
            Self::MidiVelocityMapper {
                amount,
                curve,
                offset,
            } => amount.is_finite() && curve.is_finite() && offset.is_finite(),
            Self::InputMonitor { gain } | Self::Gain { gain } => gain.is_finite(),
            Self::FixedGain { gain } => gain.is_finite() && (0.0..=4.0).contains(gain),
            Self::Constant { value } => value.is_finite(),
            Self::Sum2 { gain_a, gain_b } => gain_a.is_finite() && gain_b.is_finite(),
            Self::LinearBlend { mix } => mix.is_finite(),
            Self::Crossfader {
                position,
                curve,
                mix,
            } => position.is_finite() && curve.is_finite() && mix.is_finite(),
            Self::Mixer {
                inputs,
                gains,
                pans,
                master,
            } => {
                (1..=32).contains(inputs)
                    && gains.len() == *inputs
                    && pans.len() == *inputs
                    && master.is_finite()
                    && gains.iter().all(|value| value.is_finite())
                    && pans.iter().all(|value| value.is_finite())
            }
            Self::Oscillator {
                frequency,
                amplitude,
                waveform,
            } => frequency.is_finite() && amplitude.is_finite() && *waveform <= 4,
            Self::MainVoiceBank { fft_order } => (9..=12).contains(fft_order),
            Self::NoiseGenerator { level, color } => level.is_finite() && color.is_finite(),
            Self::Lfo { waveform, rate } => *waveform <= 2 && rate.is_finite(),
            Self::ModulatedGain { base, depth } => base.is_finite() && depth.is_finite(),
            Self::PhraseGain { amount, reference } => amount.is_finite() && reference.is_finite(),
            Self::ModulatedSvf { depth_hz } => depth_hz.is_finite(),
            Self::SlewAudio { up, down } | Self::SlewControl { up, down } => {
                up.is_finite() && down.is_finite()
            }
            Self::AttenuverterBias { amount, bias } => amount.is_finite() && bias.is_finite(),
            Self::SampleHold { mode } => *mode <= 2,
            Self::CvMix { levels, offset } => {
                levels.iter().all(|value| value.is_finite()) && offset.is_finite()
            }
            Self::Distortion { drive, mix, output } => {
                drive.is_finite() && mix.is_finite() && output.is_finite()
            }
            Self::Compressor { params } => params.iter().all(|value| value.is_finite()),
            Self::Limiter { params } => params.iter().all(|value| value.is_finite()),
            Self::StereoDelay { params } => params.iter().all(|value| value.is_finite()),
            Self::Phaser { params } => params.iter().all(|value| value.is_finite()),
            Self::Chorus { params } => params.iter().all(|value| value.is_finite()),
            Self::Eq8 { params } => params.iter().all(|value| value.is_finite()),
            Self::WaveShaper { params } => params.iter().all(|value| value.is_finite()),
            Self::StereoWidener { params } => params.iter().all(|value| value.is_finite()),
            Self::LegacyFilter { params } => params.iter().all(|value| value.is_finite()),
            Self::Reverb { params } => params.iter().all(|value| value.is_finite()),
            Self::MultitapDelay { params } => params.iter().all(|value| value.is_finite()),
            Self::RingModulator { params } => params.iter().all(|value| value.is_finite()),
            Self::TransientShaper { params } => params.iter().all(|value| value.is_finite()),
            Self::BitCrusher { params } => params.iter().all(|value| value.is_finite()),
            Self::LegacyEq { params } => params.iter().all(|value| value.is_finite()),
            Self::FormantFilter { params } => params.iter().all(|value| value.is_finite()),
            Self::Resonator { params } => params.iter().all(|value| value.is_finite()),
            Self::SineBank { params } => params.iter().all(|value| value.is_finite()),
            Self::ReverseDelay { params } => params.iter().all(|value| value.is_finite()),
            Self::Stutter { params } => params.iter().all(|value| value.is_finite()),
            Self::PitchShifter { params } => params.iter().all(|value| value.is_finite()),
            Self::PhaseVocoder { params } => params.iter().all(|value| value.is_finite()),
            Self::Shimmer { params } => params.iter().all(|value| value.is_finite()),
            Self::Granulator { params } => params.iter().all(|value| value.is_finite()),
            Self::EffectSlot {
                selected,
                mix,
                params,
            }
            | Self::EffectSlotLegacy {
                selected,
                mix,
                params,
            }
            | Self::EffectSlotHostSwitch {
                selected,
                mix,
                params,
            } => {
                effect_slot::supported_type(*selected as f32).is_some()
                    && mix.is_finite()
                    && params.iter().all(|value| value.is_finite())
            }
            Self::LoopCapture {
                capacity_seconds,
                mix,
            } => {
                capacity_seconds.is_finite()
                    && (0.05..=30.0).contains(capacity_seconds)
                    && mix.is_finite()
            }
            Self::RetrospectiveCapture { capacity_seconds } => {
                capacity_seconds.is_finite() && (1.0..=120.0).contains(capacity_seconds)
            }
            Self::SpectrumAnalyzer {
                sensitivity,
                smoothing,
                floor_db,
            } => sensitivity.is_finite() && smoothing.is_finite() && floor_db.is_finite(),
            Self::FftSpectrum {
                smoothing,
                floor_db,
            } => smoothing.is_finite() && floor_db.is_finite(),
            Self::EnvelopeFollower {
                attack_ms,
                release_ms,
                sensitivity,
                highpass_hz,
                mode,
            }
            | Self::EnvelopeControl {
                attack_ms,
                release_ms,
                sensitivity,
                highpass_hz,
                mode,
            } => {
                attack_ms.is_finite()
                    && release_ms.is_finite()
                    && sensitivity.is_finite()
                    && highpass_hz.is_finite()
                    && *mode <= 2
            }
            _ => true,
        }
    }
}

#[derive(Clone, Debug)]
pub struct NodeSpec {
    pub id: NodeId,
    pub kind: NodeKind,
}

#[derive(Clone, Copy, Debug)]
pub struct Connection {
    pub from: NodeId,
    pub to: NodeId,
    pub input_port: usize,
}

#[derive(Clone, Default)]
pub struct GraphDescription {
    pub nodes: Vec<NodeSpec>,
    pub connections: Vec<Connection>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum GraphError {
    InvalidPreparation,
    RouteChangeUnavailable,
    DuplicateNode(NodeId),
    MissingNode(NodeId),
    InvalidParameter(NodeId),
    InvalidPort(NodeId, usize),
    OutputAsSource(NodeId),
    OccupiedPort(NodeId, usize),
    SignalTypeMismatch(NodeId, NodeId, usize),
    WrongOutputCount,
    Cycle,
}

impl std::fmt::Display for GraphError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{self:?}")
    }
}

impl std::error::Error for GraphError {}

enum Kernel {
    MidiInput,
    MidiArpeggiator(MidiArpeggiator),
    MidiTranspose(MidiTranspose),
    MidiNoteFilter(MidiNoteFilter),
    MidiScaleQuantizer(MidiScaleQuantizer),
    MidiVelocityMapper(MidiVelocityMapper),
    InputRaw,
    InputSidechain,
    InputMonitor {
        gain: f32,
    },
    Constant {
        value: f32,
    },
    Gain {
        target: f32,
        current: f32,
        smoothing: f32,
        muted: bool,
    },
    FixedGain {
        gain: f32,
    },
    Sum2 {
        gain_a: f32,
        gain_b: f32,
    },
    LinearBlend {
        mix: f32,
    },
    Crossfader(CrossfaderState),
    Mixer(MixerState),
    Svf(Filter),
    ModulatedSvf {
        filter: Filter,
        depth_hz: f32,
    },
    Slew(SlewLimiter),
    AttenuverterBias(AttenuverterBias),
    SampleHold(SampleHold),
    CvMix(CvMix),
    Distortion(Distortion),
    Compressor(Compressor),
    Limiter(Limiter),
    StereoDelay(StereoDelay),
    Phaser(Phaser),
    Chorus(Chorus),
    Eq8(Eq8),
    WaveShaper(WaveShaper),
    StereoWidener(StereoWidener),
    LegacyFilter(LegacyFilter),
    Reverb(Reverb),
    MultitapDelay(MultitapDelay),
    RingModulator(RingModulator),
    TransientShaper(TransientShaper),
    BitCrusher(BitCrusher),
    LegacyEq(LegacyEq),
    FormantFilter(FormantFilter),
    Resonator(Resonator),
    SineBank(SineBank),
    ReverseDelay(ReverseDelay),
    Stutter(Stutter),
    PitchShifter(PitchShifter),
    PhaseVocoder(PhaseVocoder),
    Shimmer(Shimmer),
    Granulator(Granulator),
    EffectSlot(EffectSlot),
    LoopCapture(LoopCapture),
    SampleRegion(SampleRegion),
    SampleInstrument(SampleInstrument),
    MainVoiceBank(Box<MainVoiceBank>),
    SpectrumAnalyzer(SpectrumAnalyzer),
    FftSpectrum(Box<FftSpectrum>),
    EnvelopeFollower(EnvelopeFollower),
    EnvelopeControl(EnvelopeFollower),
    VoiceSynth(VoiceSynth),
    Oscillator(Oscillator),
    AdsrEnvelope(AdsrEnvelope),
    NoiseGenerator(NoiseGenerator),
    Lfo(Lfo),
    ModulatedGain {
        current: [f32; 2],
        target: [f32; 2],
        smoothing: f32,
        last_effective: f32,
    },
    PhraseGain(PhraseGain),
    Output,
}

struct CrossfaderState {
    current: [f32; 3],
    target: [f32; 3],
    smoothing: f32,
}

struct MixerState {
    independent_gains: Vec<f32>,
    target_gains: Vec<f32>,
    gains: Vec<f32>,
    target_pans: Vec<f32>,
    pans: Vec<f32>,
    target_master: f32,
    master: f32,
    linked_depth: f32,
    linked_enabled: bool,
    smoothing: f32,
}

impl Kernel {
    fn reset_processing(&mut self) {
        match self {
            Self::MidiInput
            | Self::InputRaw
            | Self::InputSidechain
            | Self::InputMonitor { .. }
            | Self::Constant { .. }
            | Self::Sum2 { .. }
            | Self::LinearBlend { .. }
            | Self::Output => {}
            Self::MidiArpeggiator(node) => node.reset(),
            Self::MidiTranspose(node) => node.reset(),
            Self::MidiNoteFilter(node) => node.reset(),
            Self::MidiScaleQuantizer(node) => node.reset(),
            Self::MidiVelocityMapper(node) => node.reset(),
            Self::Gain {
                target, current, ..
            } => *current = *target,
            Self::FixedGain { .. } => {}
            Self::Crossfader(state) => state.current = state.target,
            Self::Mixer(state) => {
                state.gains.copy_from_slice(&state.target_gains);
                state.pans.copy_from_slice(&state.target_pans);
                state.master = state.target_master;
            }
            Self::Svf(node) => node.settle(),
            Self::ModulatedSvf { filter, .. } => filter.settle(),
            Self::Slew(node) => node.reset(),
            Self::AttenuverterBias(node) => node.reset(),
            Self::SampleHold(node) => node.reset(),
            Self::CvMix(node) => node.reset(),
            Self::Distortion(node) => node.reset(),
            Self::Compressor(node) => node.reset(),
            Self::Limiter(node) => node.reset(),
            Self::StereoDelay(node) => node.reset(),
            Self::Phaser(node) => node.reset(),
            Self::Chorus(node) => node.reset(),
            Self::Eq8(node) => node.reset(),
            Self::WaveShaper(node) => node.reset(),
            Self::StereoWidener(node) => node.reset(),
            Self::LegacyFilter(node) => node.reset(),
            Self::Reverb(node) => node.reset(),
            Self::MultitapDelay(node) => node.reset(),
            Self::RingModulator(node) => node.reset(),
            Self::TransientShaper(node) => node.reset(),
            Self::BitCrusher(node) => node.reset(),
            Self::LegacyEq(node) => node.reset(),
            Self::FormantFilter(node) => node.reset(),
            Self::Resonator(node) => node.reset(),
            Self::SineBank(node) => node.reset(),
            Self::ReverseDelay(node) => node.reset(),
            Self::Stutter(node) => node.reset(),
            Self::PitchShifter(node) => node.reset(),
            Self::PhaseVocoder(node) => node.reset(),
            Self::Shimmer(node) => node.reset(),
            Self::Granulator(node) => node.reset(),
            Self::EffectSlot(node) => node.reset_processing(),
            Self::LoopCapture(node) => node.reset(),
            Self::SampleRegion(node) => node.reset(),
            Self::SampleInstrument(node) => node.reset(),
            Self::MainVoiceBank(node) => node.reset_processing(),
            Self::SpectrumAnalyzer(node) => node.reset(),
            Self::FftSpectrum(node) => node.reset(),
            Self::EnvelopeFollower(node) | Self::EnvelopeControl(node) => node.reset(),
            Self::VoiceSynth(node) => node.reset(),
            Self::Oscillator(node) => node.reset(),
            Self::AdsrEnvelope(node) => node.reset(),
            Self::NoiseGenerator(node) => node.reset(),
            Self::Lfo(node) => node.reset(),
            Self::ModulatedGain {
                current,
                target,
                last_effective,
                ..
            } => {
                *current = *target;
                *last_effective = target[0];
            }
            Self::PhraseGain(node) => node.reset(),
        }
    }

    fn from_kind(kind: &NodeKind, sample_rate: f32, max_frames: usize) -> Self {
        match kind {
            NodeKind::MidiInput => Self::MidiInput,
            NodeKind::MidiArpeggiator { rate, mode } => {
                Self::MidiArpeggiator(MidiArpeggiator::new(sample_rate, *rate, *mode))
            }
            NodeKind::MidiTranspose { semitones } => {
                let mut effect = MidiTranspose::new();
                let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
                effect.set_semitones(*semitones, &mut out);
                Self::MidiTranspose(effect)
            }
            NodeKind::MidiNoteFilter { low, high, mode } => {
                Self::MidiNoteFilter(MidiNoteFilter::new(*low, *high, *mode as f32))
            }
            NodeKind::MidiScaleQuantizer {
                root,
                scale,
                direction,
            } => Self::MidiScaleQuantizer(MidiScaleQuantizer::new(*root, *scale, *direction)),
            NodeKind::MidiVelocityMapper {
                amount,
                curve,
                offset,
            } => Self::MidiVelocityMapper(MidiVelocityMapper::new(*amount, *curve, *offset)),
            NodeKind::InputRaw => Self::InputRaw,
            NodeKind::InputSidechain => Self::InputSidechain,
            NodeKind::InputMonitor { gain } => Self::InputMonitor { gain: *gain },
            NodeKind::Constant { value } => Self::Constant { value: *value },
            NodeKind::Gain { gain } => {
                let target = gain.max(0.0);
                Self::Gain {
                    target,
                    current: target,
                    smoothing: ((1.0 - (-1.0 / (0.010 * sample_rate as f64)).exp()) as f32)
                        .clamp(0.0001, 1.0),
                    muted: false,
                }
            }
            NodeKind::FixedGain { gain } => Self::FixedGain { gain: *gain },
            NodeKind::Sum2 { gain_a, gain_b } => Self::Sum2 {
                gain_a: *gain_a,
                gain_b: *gain_b,
            },
            NodeKind::LinearBlend { mix } => Self::LinearBlend { mix: *mix },
            NodeKind::Crossfader {
                position,
                curve,
                mix,
            } => {
                let values = [
                    position.clamp(-1.0, 1.0),
                    curve.clamp(0.0, 1.0),
                    mix.clamp(0.0, 1.0),
                ];
                Self::Crossfader(CrossfaderState {
                    current: values,
                    target: values,
                    smoothing: ((1.0 - (-1.0 / (0.010 * sample_rate as f64)).exp()) as f32)
                        .clamp(0.0001, 1.0),
                })
            }
            NodeKind::Mixer {
                inputs: _,
                gains,
                pans,
                master,
            } => {
                let gains: Vec<_> = gains.iter().map(|value| value.clamp(0.0, 2.0)).collect();
                let pans: Vec<_> = pans.iter().map(|value| value.clamp(-1.0, 1.0)).collect();
                let master = master.clamp(0.0, 2.0);
                Self::Mixer(MixerState {
                    independent_gains: gains.clone(),
                    target_gains: gains.clone(),
                    gains,
                    target_pans: pans.clone(),
                    pans,
                    target_master: master,
                    master,
                    linked_depth: 0.5,
                    linked_enabled: false,
                    smoothing: ((1.0 - (-1.0 / (0.010 * sample_rate as f64)).exp()) as f32)
                        .clamp(0.0001, 1.0),
                })
            }
            NodeKind::Svf => Self::Svf(Filter::new(sample_rate)),
            NodeKind::ModulatedSvf { depth_hz } => Self::ModulatedSvf {
                filter: Filter::new(sample_rate),
                depth_hz: depth_hz.clamp(-20_000.0, 20_000.0),
            },
            NodeKind::SlewAudio { up, down } | NodeKind::SlewControl { up, down } => {
                Self::Slew(SlewLimiter::new(*up, *down))
            }
            NodeKind::AttenuverterBias { amount, bias } => {
                Self::AttenuverterBias(AttenuverterBias::new(*amount, *bias))
            }
            NodeKind::SampleHold { mode } => Self::SampleHold(SampleHold::new(*mode)),
            NodeKind::CvMix { levels, offset } => Self::CvMix(CvMix::new(*levels, *offset)),
            NodeKind::Distortion { drive, mix, output } => {
                Self::Distortion(Distortion::new(sample_rate, *drive, *mix, *output))
            }
            NodeKind::Compressor { params } => {
                Self::Compressor(Compressor::new(sample_rate, *params))
            }
            NodeKind::Limiter { params } => Self::Limiter(Limiter::new(sample_rate, *params)),
            NodeKind::StereoDelay { params } => {
                Self::StereoDelay(StereoDelay::new(sample_rate, *params))
            }
            NodeKind::Phaser { params } => Self::Phaser(Phaser::new(sample_rate, *params)),
            NodeKind::Chorus { params } => {
                Self::Chorus(Chorus::new(sample_rate, max_frames, *params))
            }
            NodeKind::Eq8 { params } => Self::Eq8(Eq8::new(sample_rate, *params)),
            NodeKind::WaveShaper { params } => {
                Self::WaveShaper(WaveShaper::new(sample_rate, *params))
            }
            NodeKind::StereoWidener { params } => {
                Self::StereoWidener(StereoWidener::new(sample_rate, *params))
            }
            NodeKind::LegacyFilter { params } => {
                Self::LegacyFilter(LegacyFilter::new(sample_rate, *params))
            }
            NodeKind::Reverb { params } => Self::Reverb(Reverb::new(sample_rate, *params)),
            NodeKind::MultitapDelay { params } => {
                Self::MultitapDelay(MultitapDelay::new(sample_rate, max_frames, *params))
            }
            NodeKind::RingModulator { params } => {
                Self::RingModulator(RingModulator::new(sample_rate, *params))
            }
            NodeKind::TransientShaper { params } => {
                Self::TransientShaper(TransientShaper::new(sample_rate, *params))
            }
            NodeKind::BitCrusher { params } => {
                Self::BitCrusher(BitCrusher::new(sample_rate, *params))
            }
            NodeKind::LegacyEq { params } => Self::LegacyEq(LegacyEq::new(sample_rate, *params)),
            NodeKind::FormantFilter { params } => {
                Self::FormantFilter(FormantFilter::new(sample_rate, *params))
            }
            NodeKind::Resonator { params } => Self::Resonator(Resonator::new(sample_rate, *params)),
            NodeKind::SineBank { params } => Self::SineBank(SineBank::new(sample_rate, *params)),
            NodeKind::ReverseDelay { params } => {
                Self::ReverseDelay(ReverseDelay::new(sample_rate, max_frames, *params))
            }
            NodeKind::Stutter { params } => {
                Self::Stutter(Stutter::new(sample_rate, max_frames, *params))
            }
            NodeKind::PitchShifter { params } => {
                Self::PitchShifter(PitchShifter::new(sample_rate, max_frames, *params))
            }
            NodeKind::PhaseVocoder { params } => {
                Self::PhaseVocoder(PhaseVocoder::new(sample_rate, *params))
            }
            NodeKind::Shimmer { params } => {
                Self::Shimmer(Shimmer::new(sample_rate, max_frames, *params))
            }
            NodeKind::Granulator { params } => {
                Self::Granulator(Granulator::new(sample_rate, max_frames, *params))
            }
            NodeKind::EffectSlot {
                selected,
                mix,
                params,
            } => Self::EffectSlot(EffectSlot::new(
                sample_rate,
                max_frames,
                *selected,
                *mix,
                *params,
            )),
            NodeKind::EffectSlotLegacy {
                selected,
                mix,
                params,
            } => Self::EffectSlot(EffectSlot::new_legacy(
                sample_rate,
                max_frames,
                *selected,
                *mix,
                *params,
            )),
            NodeKind::EffectSlotHostSwitch {
                selected,
                mix,
                params,
            } => Self::EffectSlot(EffectSlot::new_host_switch(
                sample_rate,
                max_frames,
                *selected,
                *mix,
                *params,
            )),
            NodeKind::LoopCapture {
                capacity_seconds,
                mix,
            } => Self::LoopCapture(LoopCapture::new(sample_rate, *capacity_seconds, *mix)),
            NodeKind::RetrospectiveCapture { capacity_seconds } => Self::LoopCapture(
                LoopCapture::new_retrospective(sample_rate, *capacity_seconds),
            ),
            NodeKind::SampleRegion => Self::SampleRegion(SampleRegion::new(sample_rate)),
            NodeKind::SampleInstrument => {
                Self::SampleInstrument(SampleInstrument::new(sample_rate))
            }
            NodeKind::MainVoiceBank { fft_order } => Self::MainVoiceBank(Box::new(
                MainVoiceBank::new(sample_rate, max_frames, *fft_order),
            )),
            NodeKind::SpectrumAnalyzer {
                sensitivity,
                smoothing,
                floor_db,
            } => Self::SpectrumAnalyzer(SpectrumAnalyzer::new(
                sample_rate,
                *sensitivity,
                *smoothing,
                *floor_db,
            )),
            NodeKind::FftSpectrum {
                smoothing,
                floor_db,
            } => Self::FftSpectrum(Box::new(FftSpectrum::new(
                sample_rate,
                *smoothing,
                *floor_db,
            ))),
            NodeKind::EnvelopeFollower {
                attack_ms,
                release_ms,
                sensitivity,
                highpass_hz,
                mode,
            }
            | NodeKind::EnvelopeControl {
                attack_ms,
                release_ms,
                sensitivity,
                highpass_hz,
                mode,
            } => {
                let mut follower = EnvelopeFollower::new(sample_rate, *attack_ms, *release_ms);
                follower.set_parameter(2, *sensitivity);
                follower.set_parameter(3, *highpass_hz);
                follower.set_parameter(4, *mode as f32);
                // Authored values are settled before the first block.
                follower.settle();
                if matches!(kind, NodeKind::EnvelopeControl { .. }) {
                    Self::EnvelopeControl(follower)
                } else {
                    Self::EnvelopeFollower(follower)
                }
            }
            NodeKind::VoiceSynth => Self::VoiceSynth(VoiceSynth::new(sample_rate)),
            NodeKind::Oscillator {
                frequency,
                amplitude,
                waveform,
            } => Self::Oscillator(Oscillator::new(
                sample_rate,
                *frequency,
                *amplitude,
                *waveform,
            )),
            NodeKind::AdsrEnvelope => Self::AdsrEnvelope(AdsrEnvelope::new(sample_rate)),
            NodeKind::NoiseGenerator { level, color } => {
                Self::NoiseGenerator(NoiseGenerator::new(sample_rate, *level, *color))
            }
            NodeKind::Lfo { waveform, rate } => Self::Lfo(Lfo::new(sample_rate, *waveform, *rate)),
            NodeKind::ModulatedGain { base, depth } => {
                let values = [base.clamp(0.0, 2.0), depth.clamp(-2.0, 2.0)];
                Self::ModulatedGain {
                    current: values,
                    target: values,
                    smoothing: ((1.0 - (-1.0 / (0.010 * sample_rate as f64)).exp()) as f32)
                        .clamp(0.0001, 1.0),
                    last_effective: values[0],
                }
            }
            NodeKind::PhraseGain { amount, reference } => {
                Self::PhraseGain(PhraseGain::new(sample_rate, *amount, *reference))
            }
            NodeKind::Output => Self::Output,
        }
    }

    fn set_parameter(&mut self, parameter: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match (self, parameter) {
            (Self::InputMonitor { gain }, 0) => *gain = value,
            (Self::Gain { target, .. }, 0) => *target = value.max(0.0),
            (Self::Gain { muted, .. }, 1) => *muted = value >= 0.5,
            (Self::Constant { value: current }, 0) => *current = value,
            (Self::Sum2 { gain_a, .. }, 0) => *gain_a = value,
            (Self::Sum2 { gain_b, .. }, 1) => *gain_b = value,
            (Self::LinearBlend { mix }, 0) => *mix = value.clamp(0.0, 1.0),
            (Self::Crossfader(state), id @ 0..=2) => {
                state.target[id as usize] = if id == 0 {
                    value.clamp(-1.0, 1.0)
                } else {
                    value.clamp(0.0, 1.0)
                }
            }
            (Self::Mixer(state), 0) => state.target_master = value.clamp(0.0, 2.0),
            (Self::Mixer(state), id @ 1..=32) if (id as usize) <= state.gains.len() => {
                let gain = value.clamp(0.0, 2.0);
                state.independent_gains[id as usize - 1] = gain;
                if !state.linked_enabled {
                    state.target_gains[id as usize - 1] = gain;
                }
            }
            (Self::Mixer(state), id @ 33..=64) if (id as usize - 32) <= state.pans.len() => {
                state.target_pans[id as usize - 33] = value.clamp(-1.0, 1.0)
            }
            (Self::Mixer(state), 65) if state.gains.len() == 2 => {
                state.linked_depth = value.clamp(0.0, 1.0);
                if state.linked_enabled {
                    state.target_gains[0] = 1.0 - state.linked_depth;
                    state.target_gains[1] = state.linked_depth;
                }
            }
            (Self::Mixer(state), 66) if state.gains.len() == 2 => {
                state.linked_enabled = value >= 0.5;
                if state.linked_enabled {
                    state.target_gains[0] = 1.0 - state.linked_depth;
                    state.target_gains[1] = state.linked_depth;
                } else {
                    state.target_gains.copy_from_slice(&state.independent_gains);
                }
            }
            (Self::Svf(filter), id) => return filter.set_parameter(id, value),
            (Self::ModulatedSvf { filter, .. }, id @ 0..=2) => {
                return filter.set_parameter(id, value);
            }
            (Self::ModulatedSvf { depth_hz, .. }, 3) => {
                *depth_hz = value.clamp(-20_000.0, 20_000.0)
            }
            (Self::Slew(slew), id) => return slew.set_parameter(id, value),
            (Self::AttenuverterBias(control), id) => return control.set_parameter(id, value),
            (Self::SampleHold(control), id) => return control.set_parameter(id, value),
            (Self::CvMix(control), id) => return control.set_parameter(id, value),
            (Self::Distortion(distortion), id) => return distortion.set_parameter(id, value),
            (Self::Compressor(compressor), id) => return compressor.set_parameter(id, value),
            (Self::Limiter(limiter), id) => return limiter.set_parameter(id, value),
            (Self::StereoDelay(delay), id) => return delay.set_parameter(id, value),
            (Self::Phaser(phaser), id) => return phaser.set_parameter(id, value),
            (Self::Chorus(chorus), id) => return chorus.set_parameter(id, value),
            (Self::Eq8(eq), id) => return eq.set_parameter(id, value),
            (Self::WaveShaper(shaper), id) => return shaper.set_parameter(id, value),
            (Self::StereoWidener(widener), id) => return widener.set_parameter(id, value),
            (Self::LegacyFilter(filter), id) => return filter.set_parameter(id, value),
            (Self::Reverb(reverb), id) => return reverb.set_parameter(id, value),
            (Self::MultitapDelay(delay), id) => return delay.set_parameter(id, value),
            (Self::RingModulator(ring), id) => return ring.set_parameter(id, value),
            (Self::TransientShaper(transient), id) => return transient.set_parameter(id, value),
            (Self::BitCrusher(crusher), id) => return crusher.set_parameter(id, value),
            (Self::LegacyEq(eq), id) => return eq.set_parameter(id, value),
            (Self::FormantFilter(formant), id) => return formant.set_parameter(id, value),
            (Self::Resonator(resonator), id) => return resonator.set_parameter(id, value),
            (Self::SineBank(bank), id) => return bank.set_parameter(id, value),
            (Self::ReverseDelay(delay), id) => return delay.set_parameter(id, value),
            (Self::Stutter(stutter), id) => return stutter.set_parameter(id, value),
            (Self::PitchShifter(shifter), id) => return shifter.set_parameter(id, value),
            (Self::PhaseVocoder(vocoder), id) => return vocoder.set_parameter(id, value),
            (Self::Shimmer(shimmer), id) => return shimmer.set_parameter(id, value),
            (Self::Granulator(granulator), id) => return granulator.set_parameter(id, value),
            (Self::EffectSlot(slot), id) => return slot.set_parameter(id, value),
            (Self::LoopCapture(loop_node), id) => return loop_node.set_parameter(id, value),
            (Self::SampleRegion(player), id) => return player.set_parameter(id, value),
            (Self::SampleInstrument(instrument), id) => return instrument.set_parameter(id, value),
            (Self::MainVoiceBank(bank), id) => return bank.set_parameter(id, value),
            (Self::SpectrumAnalyzer(analyzer), id) => return analyzer.set_parameter(id, value),
            (Self::FftSpectrum(analyzer), id) => return analyzer.set_parameter(id, value),
            (Self::EnvelopeFollower(follower), id) => return follower.set_parameter(id, value),
            (Self::EnvelopeControl(follower), id) => return follower.set_parameter(id, value),
            (Self::VoiceSynth(synth), id) => return synth.set_parameter(id, value),
            (Self::Oscillator(oscillator), id) => return oscillator.set_parameter(id, value),
            (Self::AdsrEnvelope(envelope), id) => return envelope.set_parameter(id, value),
            (Self::NoiseGenerator(noise), id) => return noise.set_parameter(id, value),
            (Self::Lfo(lfo), id) => return lfo.set_parameter(id, value),
            (Self::ModulatedGain { target, .. }, id @ 0..=1) => {
                target[id as usize] = if id == 0 {
                    value.clamp(0.0, 2.0)
                } else {
                    value.clamp(-2.0, 2.0)
                }
            }
            (Self::PhraseGain(gain), id) => return gain.set_parameter(id, value),
            _ => return false,
        }
        true
    }

    fn send_event(&mut self, event: EventKind) -> bool {
        match self {
            Self::VoiceSynth(synth) => {
                synth.event(event);
                true
            }
            Self::SampleRegion(player) => {
                player.event(event);
                true
            }
            Self::SampleInstrument(instrument) => {
                instrument.event(event);
                true
            }
            Self::MainVoiceBank(bank) => {
                bank.event(event);
                true
            }
            _ => false,
        }
    }

    fn accepts_events(&self) -> bool {
        matches!(
            self,
            Self::MidiInput
                | Self::MidiArpeggiator(_)
                | Self::MidiTranspose(_)
                | Self::MidiNoteFilter(_)
                | Self::MidiScaleQuantizer(_)
                | Self::MidiVelocityMapper(_)
                | Self::VoiceSynth(_)
                | Self::SampleRegion(_)
                | Self::SampleInstrument(_)
                | Self::MainVoiceBank(_)
        )
    }
}

struct CompiledNode {
    id: NodeId,
    kernel: Kernel,
    sources: Vec<Option<usize>>,
    input_signals: Vec<SignalKind>,
    output_signal: SignalKind,
    active: bool,
    always_active: bool,
    scratch: Vec<f32>,
}

pub struct ExecutionPlan {
    nodes: Vec<CompiledNode>,
    main_directional: Option<MainDirectionalBinding>,
    sample_rate: f32,
    output_index: usize,
    max_frames: usize,
    silence: Vec<f32>,
    patchable: bool,
    midi_stack: Vec<(usize, EventKind)>,
    midi_trace: [Option<MidiTraceEntry>; MIDI_TRACE_CAPACITY],
    midi_trace_write: usize,
    midi_trace_count: usize,
    midi_trace_sequence: u32,
    frame_clock: u64,
}

struct MainDirectionalBinding {
    oscillator_index: usize,
    sample_index: usize,
    motion: MainDirectionalMotion,
    was_active: bool,
    manual_sync: bool,
    pitch: Option<MainPitchBinding>,
}

struct MainPitchBinding {
    vocoder_index: usize,
    enabled: bool,
    root_note: f32,
    keytrack: u32,
    semitones: f32,
    mode: u32,
    manual_vocoder: [f32; 3],
}

impl GraphDescription {
    pub fn compile(
        &self,
        sample_rate: f32,
        max_frames: usize,
    ) -> Result<ExecutionPlan, GraphError> {
        self.compile_inner(sample_rate, max_frames, false)
    }

    /// Retain disconnected kernels so a bounded route change can activate them later.
    pub fn compile_patchable(
        &self,
        sample_rate: f32,
        max_frames: usize,
    ) -> Result<ExecutionPlan, GraphError> {
        self.compile_inner(sample_rate, max_frames, true)
    }

    fn compile_inner(
        &self,
        sample_rate: f32,
        max_frames: usize,
        patchable: bool,
    ) -> Result<ExecutionPlan, GraphError> {
        if !sample_rate.is_finite()
            || sample_rate <= 1.0
            || max_frames == 0
            || max_frames.checked_mul(2).is_none()
        {
            return Err(GraphError::InvalidPreparation);
        }
        let mut index_by_id = HashMap::with_capacity(self.nodes.len());
        let mut output = None;
        for (index, spec) in self.nodes.iter().enumerate() {
            if index_by_id.insert(spec.id, index).is_some() {
                return Err(GraphError::DuplicateNode(spec.id));
            }
            if !spec.kind.valid() {
                return Err(GraphError::InvalidParameter(spec.id));
            }
            if matches!(spec.kind, NodeKind::Output) {
                if output.replace(index).is_some() {
                    return Err(GraphError::WrongOutputCount);
                }
            }
        }
        let output = output.ok_or(GraphError::WrongOutputCount)?;
        let mut sources: Vec<Vec<Option<usize>>> = self
            .nodes
            .iter()
            .map(|spec| vec![None; spec.kind.input_count()])
            .collect();
        let mut children = vec![Vec::new(); self.nodes.len()];
        let mut indegree = vec![0usize; self.nodes.len()];
        for edge in &self.connections {
            let from = *index_by_id
                .get(&edge.from)
                .ok_or(GraphError::MissingNode(edge.from))?;
            let to = *index_by_id
                .get(&edge.to)
                .ok_or(GraphError::MissingNode(edge.to))?;
            if matches!(self.nodes[from].kind, NodeKind::Output) {
                return Err(GraphError::OutputAsSource(edge.from));
            }
            if edge.input_port >= self.nodes[to].kind.input_count() {
                return Err(GraphError::InvalidPort(edge.to, edge.input_port));
            }
            if self.nodes[from].kind.output_signal()
                != self.nodes[to].kind.input_signal(edge.input_port)
            {
                return Err(GraphError::SignalTypeMismatch(
                    edge.from,
                    edge.to,
                    edge.input_port,
                ));
            }
            if sources[to][edge.input_port].replace(from).is_some() {
                return Err(GraphError::OccupiedPort(edge.to, edge.input_port));
            }
            children[from].push(to);
            indegree[to] += 1;
        }

        let mut ready: VecDeque<_> = indegree
            .iter()
            .enumerate()
            .filter_map(|(index, count)| (*count == 0).then_some(index))
            .collect();
        let mut order = Vec::with_capacity(self.nodes.len());
        while let Some(index) = ready.pop_front() {
            order.push(index);
            for &child in &children[index] {
                indegree[child] -= 1;
                if indegree[child] == 0 {
                    ready.push_back(child);
                }
            }
        }
        if order.len() != self.nodes.len() {
            return Err(GraphError::Cycle);
        }

        // Retrospective captures are processing roots even without an audible route.
        // Their ancestors provide input, while unrelated sources remain parked.
        let mut live = vec![false; self.nodes.len()];
        let mut stack = vec![output];
        stack.extend(self.nodes.iter().enumerate().filter_map(|(index, node)| {
            matches!(node.kind, NodeKind::RetrospectiveCapture { .. }).then_some(index)
        }));
        while let Some(index) = stack.pop() {
            if live[index] {
                continue;
            }
            live[index] = true;
            for source in sources[index].iter().flatten() {
                stack.push(*source);
            }
        }
        let mut old_to_new = vec![usize::MAX; self.nodes.len()];
        let mut nodes = Vec::new();
        for index in order.into_iter().filter(|index| patchable || live[*index]) {
            old_to_new[index] = nodes.len();
            nodes.push(CompiledNode {
                id: self.nodes[index].id,
                kernel: Kernel::from_kind(&self.nodes[index].kind, sample_rate, max_frames),
                sources: sources[index]
                    .iter()
                    .map(|source| source.map(|old| old_to_new[old]))
                    .collect(),
                input_signals: (0..self.nodes[index].kind.input_count())
                    .map(|port| self.nodes[index].kind.input_signal(port))
                    .collect(),
                output_signal: self.nodes[index].kind.output_signal(),
                active: live[index],
                always_active: matches!(
                    self.nodes[index].kind,
                    NodeKind::RetrospectiveCapture { .. }
                ),
                scratch: vec![0.0; max_frames * 2],
            });
        }
        Ok(ExecutionPlan {
            output_index: old_to_new[output],
            nodes,
            main_directional: None,
            sample_rate,
            max_frames,
            silence: vec![0.0; max_frames * 2],
            patchable,
            midi_stack: Vec::with_capacity(
                self.nodes.len().saturating_mul(MAX_OUTPUT_EVENTS).max(1),
            ),
            midi_trace: [None; MIDI_TRACE_CAPACITY],
            midi_trace_write: 0,
            midi_trace_count: 0,
            midi_trace_sequence: 0,
            frame_clock: 0,
        })
    }
}

impl ExecutionPlan {
    /// Preparation constraints for a host that embeds this plan in a larger
    /// preallocated instrument. Read on the control side before publication.
    pub fn preparation(&self) -> (f32, usize) {
        (self.sample_rate, self.max_frames)
    }

    /// Retain compatible retrospective rings when a host publishes a prepared
    /// replacement. This runs at a block boundary and moves only owned ring
    /// buffers and cursors; it never compiles or allocates.
    pub fn transfer_retrospective_history_from(&mut self, previous: &mut Self) -> usize {
        if self.sample_rate != previous.sample_rate {
            return 0;
        }
        let mut transferred = 0;
        for node in &mut self.nodes {
            if !node.always_active {
                continue;
            }
            let Some(old) = previous
                .nodes
                .iter_mut()
                .find(|old| old.id == node.id && old.always_active)
            else {
                continue;
            };
            if let (Kernel::LoopCapture(next), Kernel::LoopCapture(old)) =
                (&mut node.kernel, &mut old.kernel)
            {
                transferred += usize::from(next.transfer_retrospective_history_from(old));
            }
        }
        transferred
    }

    /// Clear signal history in place while retaining compiled routing, assets,
    /// and current parameter targets. No allocation or host synchronization.
    pub fn reset_processing(&mut self) {
        for node in &mut self.nodes {
            node.kernel.reset_processing();
        }
        if let Some(binding) = &mut self.main_directional {
            binding.motion.reset();
            binding.was_active = false;
        }
        self.midi_stack.clear();
        self.midi_trace.fill(None);
        self.midi_trace_write = 0;
        self.midi_trace_count = 0;
        self.midi_trace_sequence = 0;
        self.frame_clock = 0;
    }

    pub fn configure_main_directional(&mut self, oscillator: NodeId, sample: NodeId) -> bool {
        let Some(oscillator_index) = self.nodes.iter().position(|node| {
            node.id == oscillator && node.active && matches!(node.kernel, Kernel::Oscillator(_))
        }) else {
            return false;
        };
        let Some(sample_index) = self.nodes.iter().position(|node| {
            node.id == sample && node.active && matches!(node.kernel, Kernel::SampleRegion(_))
        }) else {
            return false;
        };
        self.main_directional = Some(MainDirectionalBinding {
            oscillator_index,
            sample_index,
            motion: MainDirectionalMotion::new(self.sample_rate),
            was_active: false,
            manual_sync: false,
            pitch: None,
        });
        true
    }

    pub fn configure_main_pitch(&mut self, vocoder: NodeId) -> bool {
        let Some(binding) = &mut self.main_directional else {
            return false;
        };
        let Some(vocoder_index) = self.nodes.iter().position(|node| {
            node.id == vocoder && node.active && matches!(node.kernel, Kernel::PhaseVocoder(_))
        }) else {
            return false;
        };
        let manual_vocoder = match &self.nodes[vocoder_index].kernel {
            Kernel::PhaseVocoder(vocoder) => [
                vocoder.target_parameter(0),
                vocoder.target_parameter(1),
                vocoder.target_parameter(3),
            ],
            _ => return false,
        };
        binding.pitch = Some(MainPitchBinding {
            vocoder_index,
            enabled: false,
            root_note: 60.0,
            keytrack: 0,
            semitones: 0.0,
            mode: 0,
            manual_vocoder,
        });
        true
    }

    pub fn set_main_pitch_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        let Some(pitch) = self
            .main_directional
            .as_mut()
            .and_then(|binding| binding.pitch.as_mut())
        else {
            return false;
        };
        match id {
            0 if value == 0.0 || value == 1.0 => pitch.enabled = value == 1.0,
            1 if (12.0..=96.0).contains(&value) => pitch.root_note = value,
            2 if (0.0..=2.0).contains(&value) && value.fract() == 0.0 => {
                pitch.keytrack = value as u32;
            }
            3 if (-24.0..=24.0).contains(&value) => pitch.semitones = value,
            4 if (0.0..=2.0).contains(&value) && value.fract() == 0.0 => {
                pitch.mode = value as u32;
            }
            _ => return false,
        }
        true
    }

    pub fn set_main_directional_parameter(&mut self, id: u32, value: f32) -> bool {
        self.main_directional
            .as_mut()
            .is_some_and(|binding| binding.motion.set_parameter(id, value))
    }

    fn apply_main_directional(&mut self, frames: usize) {
        let Some(binding) = &mut self.main_directional else {
            return;
        };
        let sample_position = match &self.nodes[binding.sample_index].kernel {
            Kernel::SampleRegion(sample) => sample.legacy_normalized_position(),
            _ => return,
        };
        let voice_frequency = binding.motion.base_frequency();
        let pitch_route = binding
            .pitch
            .as_ref()
            .filter(|pitch| pitch.enabled)
            .map(|pitch| {
                route_main_pitch(
                    voice_frequency,
                    pitch.root_note,
                    pitch.keytrack,
                    pitch.semitones,
                    pitch.mode,
                )
            });
        let base_speed =
            pitch_route.map_or(binding.motion.base_speed(), |route| route.sample_speed);
        let update = if let Some(update) =
            binding
                .motion
                .tick_with_speed(frames, sample_position, base_speed)
        {
            binding.was_active = true;
            update
        } else if pitch_route.is_some() {
            binding.was_active = true;
            let mut baseline = binding.motion.baseline();
            baseline.sample_speed = base_speed;
            baseline.sync_enabled = binding.manual_sync;
            baseline
        } else if binding.was_active {
            binding.was_active = false;
            let mut baseline = binding.motion.baseline();
            baseline.sync_enabled = binding.manual_sync;
            baseline
        } else {
            return;
        };
        let mut update = update;
        if let (Some(pitch), Some(route)) = (&binding.pitch, pitch_route) {
            update.oscillator_frequency = route.wave_after_modulation(
                update.oscillator_frequency,
                voice_frequency,
                pitch.keytrack,
            );
            if let Kernel::PhaseVocoder(vocoder) = &mut self.nodes[pitch.vocoder_index].kernel {
                vocoder.set_parameter(0, route.vocoder_mode as f32);
                vocoder.set_parameter(1, route.vocoder_semitones);
                vocoder.set_parameter(3, route.vocoder_mix);
            }
        } else if let Some(pitch) = &binding.pitch {
            if let Kernel::PhaseVocoder(vocoder) = &mut self.nodes[pitch.vocoder_index].kernel {
                for (id, value) in [
                    (0, pitch.manual_vocoder[0]),
                    (1, pitch.manual_vocoder[1]),
                    (3, pitch.manual_vocoder[2]),
                ] {
                    vocoder.set_parameter(id, value);
                }
            }
        }
        Self::apply_directional_update(
            &mut self.nodes,
            binding.oscillator_index,
            binding.sample_index,
            update,
        );
    }

    fn apply_directional_update(
        nodes: &mut [CompiledNode],
        oscillator: usize,
        sample: usize,
        update: DirectionalUpdate,
    ) {
        if let Kernel::SampleRegion(player) = &mut nodes[sample].kernel {
            if update.sample_retrigger {
                player.set_parameter(7, 1.0);
            }
            if update.sample_play {
                player.set_parameter(6, 1.0);
            }
            player.set_parameter(0, update.sample_speed);
        }
        if let Kernel::Oscillator(osc) = &mut nodes[oscillator].kernel {
            osc.set_parameter(1, update.oscillator_frequency);
            osc.set_parameter(3, f32::from(update.sync_enabled));
        }
    }

    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }

    pub fn midi_trace_count(&self) -> usize {
        self.midi_trace_count
    }

    pub fn midi_trace_entry(&self, index: usize) -> Option<MidiTraceEntry> {
        if index >= self.midi_trace_count {
            return None;
        }
        let oldest = (self.midi_trace_write + MIDI_TRACE_CAPACITY - self.midi_trace_count)
            % MIDI_TRACE_CAPACITY;
        self.midi_trace[(oldest + index) % MIDI_TRACE_CAPACITY]
    }

    pub fn accepts_events(&self, node: NodeId) -> bool {
        self.nodes
            .iter()
            .any(|entry| entry.id == node && entry.kernel.accepts_events())
    }

    pub fn node_active(&self, node: NodeId) -> Option<bool> {
        self.nodes
            .iter()
            .find(|entry| entry.id == node)
            .map(|entry| entry.active)
    }

    /// Change one prepared route between blocks. Sources must already precede the target.
    /// Recomputes reachability without allocation; untouched kernels retain their state.
    pub fn set_route(
        &mut self,
        target: NodeId,
        port: usize,
        source: Option<NodeId>,
    ) -> Result<(), GraphError> {
        if !self.patchable {
            return Err(GraphError::RouteChangeUnavailable);
        }
        let target_index = self
            .nodes
            .iter()
            .position(|node| node.id == target)
            .ok_or(GraphError::MissingNode(target))?;
        let expected = *self.nodes[target_index]
            .input_signals
            .get(port)
            .ok_or(GraphError::InvalidPort(target, port))?;
        let source_index = if let Some(source) = source {
            let index = self
                .nodes
                .iter()
                .position(|node| node.id == source)
                .ok_or(GraphError::MissingNode(source))?;
            if self.nodes[index].output_signal != expected {
                return Err(GraphError::SignalTypeMismatch(source, target, port));
            }
            if index >= target_index {
                return Err(GraphError::Cycle);
            }
            Some(index)
        } else {
            None
        };
        self.nodes[target_index].sources[port] = source_index;
        for node in &mut self.nodes {
            node.active = false;
        }
        self.nodes[self.output_index].active = true;
        for node in &mut self.nodes {
            if node.always_active {
                node.active = true;
            }
        }
        for index in (0..self.nodes.len()).rev() {
            if self.nodes[index].active {
                for port in 0..self.nodes[index].sources.len() {
                    if let Some(source) = self.nodes[index].sources[port] {
                        self.nodes[source].active = true;
                    }
                }
            }
        }
        Ok(())
    }

    /// Snapshot one analyzer band after a completed block. No audio-thread allocation.
    pub fn node_meter(&self, node: NodeId, band: usize) -> Option<f32> {
        self.nodes
            .iter()
            .find(|entry| entry.id == node)
            .and_then(|entry| match &entry.kernel {
                Kernel::SpectrumAnalyzer(analyzer) => analyzer.band(band),
                Kernel::FftSpectrum(analyzer) => analyzer.meter(band),
                Kernel::AttenuverterBias(control) if band == 0 => Some(control.meter()),
                Kernel::SampleHold(control) if band == 0 => Some(control.meter()),
                Kernel::CvMix(control) if band == 0 => Some(control.meter()),
                Kernel::ModulatedGain { last_effective, .. } if band == 0 => Some(*last_effective),
                Kernel::PhraseGain(gain) if band == 0 => Some(gain.last_gain()),
                Kernel::EnvelopeFollower(follower) if band == 0 => Some(follower.meter()),
                Kernel::EnvelopeControl(follower) if band == 0 => Some(follower.meter()),
                Kernel::Compressor(compressor) if band == 0 => Some(compressor.gain_reduction_db()),
                Kernel::TransientShaper(transient) if band == 0 => Some(transient.meter()),
                Kernel::Limiter(limiter) if band == 0 => Some(limiter.gain_reduction_db()),
                Kernel::StereoWidener(widener) if band == 0 => Some(widener.correlation()),
                Kernel::SampleRegion(player) => player.meter(band),
                Kernel::Oscillator(oscillator) => oscillator.meter(band),
                Kernel::PhaseVocoder(vocoder) if band <= 3 => Some(vocoder.target_parameter(band)),
                Kernel::SampleInstrument(instrument) => instrument.meter(band),
                Kernel::MainVoiceBank(bank) => bank.meter(band),
                _ => None,
            })
    }

    pub fn eq8_response_db(&self, node: NodeId, frequency: f32) -> Option<f32> {
        self.nodes
            .iter()
            .find(|entry| entry.id == node)
            .and_then(|entry| match &entry.kernel {
                Kernel::Eq8(eq) => eq.response_db_at(frequency),
                _ => None,
            })
    }

    pub fn effect_slot_params(&self, node: NodeId, effect_type: u32) -> Option<[f32; 5]> {
        self.nodes
            .iter()
            .find(|entry| entry.id == node)
            .and_then(|entry| match &entry.kernel {
                Kernel::EffectSlot(slot) => slot.params_for_type(effect_type),
                _ => None,
            })
    }

    pub fn restore_effect_slot_params(
        &mut self,
        node: NodeId,
        effect_type: u32,
        values: [f32; 5],
    ) -> bool {
        self.nodes
            .iter_mut()
            .find(|entry| entry.id == node)
            .is_some_and(|entry| match &mut entry.kernel {
                Kernel::EffectSlot(slot) => slot.restore_stored_params(effect_type, values),
                _ => false,
            })
    }

    pub fn reset_effect_slot(&mut self, node: NodeId) -> bool {
        self.nodes
            .iter_mut()
            .find(|entry| entry.id == node)
            .is_some_and(|entry| match &mut entry.kernel {
                Kernel::EffectSlot(slot) => {
                    slot.reset_processing();
                    true
                }
                _ => false,
            })
    }

    pub fn capture_length(&self, node: NodeId) -> Option<usize> {
        self.nodes
            .iter()
            .find(|entry| entry.id == node)
            .and_then(|entry| match &entry.kernel {
                Kernel::LoopCapture(loop_node) => loop_node.capture_length(),
                _ => None,
            })
    }

    pub fn retrospective_cursor(&self, node: NodeId) -> Option<(usize, usize)> {
        self.nodes
            .iter()
            .find(|entry| entry.id == node)
            .and_then(|entry| match &entry.kernel {
                Kernel::LoopCapture(loop_node) => loop_node.retrospective_cursor(),
                _ => None,
            })
    }

    pub fn begin_capture_staging(&mut self, node: NodeId, requested_frames: usize) -> bool {
        self.nodes
            .iter_mut()
            .find(|entry| entry.id == node)
            .is_some_and(|entry| match &mut entry.kernel {
                Kernel::LoopCapture(loop_node) => {
                    loop_node.begin_staged_snapshot_recent(requested_frames)
                }
                _ => false,
            })
    }

    pub fn reserve_capture_staging(&mut self, node: NodeId, frames: usize) -> bool {
        self.nodes
            .iter_mut()
            .find(|entry| entry.id == node)
            .is_some_and(|entry| match &mut entry.kernel {
                Kernel::LoopCapture(loop_node) => loop_node.reserve_staging_capacity(frames),
                _ => false,
            })
    }

    pub fn begin_prepared_capture_staging(
        &mut self,
        node: NodeId,
        requested_frames: usize,
    ) -> bool {
        self.nodes
            .iter_mut()
            .find(|entry| entry.id == node)
            .is_some_and(|entry| match &mut entry.kernel {
                Kernel::LoopCapture(loop_node) => {
                    loop_node.begin_prepared_staged_snapshot_recent(requested_frames)
                }
                _ => false,
            })
    }

    pub fn capture_staging_status(&self, node: NodeId) -> Option<bool> {
        self.nodes
            .iter()
            .find(|entry| entry.id == node)
            .and_then(|entry| match &entry.kernel {
                Kernel::LoopCapture(loop_node) => loop_node.staged_status(),
                _ => None,
            })
    }

    pub fn capture_staged_length(&self, node: NodeId) -> Option<usize> {
        self.nodes
            .iter()
            .find(|entry| entry.id == node)
            .and_then(|entry| match &entry.kernel {
                Kernel::LoopCapture(loop_node) => loop_node.staged_length(),
                _ => None,
            })
    }

    pub fn copy_capture_staged_interleaved(
        &self,
        node: NodeId,
        start_frame: usize,
        output: &mut [f32],
    ) -> usize {
        self.nodes
            .iter()
            .find(|entry| entry.id == node)
            .map_or(0, |entry| match &entry.kernel {
                Kernel::LoopCapture(loop_node) => {
                    loop_node.copy_staged_interleaved(start_frame, output)
                }
                _ => 0,
            })
    }

    pub fn cancel_capture_staging(&mut self, node: NodeId) -> bool {
        self.nodes
            .iter_mut()
            .find(|entry| entry.id == node)
            .is_some_and(|entry| match &mut entry.kernel {
                Kernel::LoopCapture(loop_node) => {
                    loop_node.cancel_staged();
                    true
                }
                _ => false,
            })
    }

    /// Move a frozen capture buffer into the instrument. The caller has already
    /// exported its project asset; held notes retain the previous shared PCM.
    pub fn publish_staged_capture_to_instrument(
        &mut self,
        capture: NodeId,
        instrument: NodeId,
    ) -> bool {
        if capture == instrument || !self.accepts_sample_instrument(instrument) {
            return false;
        }
        let Some(stereo) = self
            .nodes
            .iter_mut()
            .find(|entry| entry.id == capture)
            .and_then(|entry| match &mut entry.kernel {
                Kernel::LoopCapture(loop_node) => loop_node.take_staged(),
                _ => None,
            })
        else {
            return false;
        };
        self.nodes
            .iter_mut()
            .find(|entry| entry.id == instrument)
            .is_some_and(|entry| match &mut entry.kernel {
                Kernel::SampleInstrument(player) => player.publish_stereo(stereo, self.sample_rate),
                _ => false,
            })
    }

    pub fn accepts_sample_instrument(&self, node: NodeId) -> bool {
        self.nodes
            .iter()
            .any(|entry| entry.id == node && matches!(entry.kernel, Kernel::SampleInstrument(_)))
    }

    /// Publish already prepared PCM without restarting voices that use the
    /// previous source. The caller owns the complete buffer off process().
    pub fn publish_prepared_sample_to_instrument(
        &mut self,
        instrument: NodeId,
        stereo: Vec<f32>,
        source_rate: f32,
    ) -> bool {
        self.nodes
            .iter_mut()
            .find(|entry| entry.id == instrument)
            .is_some_and(|entry| match &mut entry.kernel {
                Kernel::SampleInstrument(player) => player.publish_stereo(stereo, source_rate),
                _ => false,
            })
    }

    /// Publish a source whose complete PCM was validated in bounded control
    /// steps. The final switch does not scan the full file on the render thread.
    pub fn publish_validated_sample_to_instrument(
        &mut self,
        instrument: NodeId,
        source: ValidatedStereo,
    ) -> bool {
        self.nodes
            .iter_mut()
            .find(|entry| entry.id == instrument)
            .is_some_and(|entry| match &mut entry.kernel {
                Kernel::SampleInstrument(player) => player.publish_validated(source),
                _ => false,
            })
    }

    pub fn copy_capture_interleaved(
        &self,
        node: NodeId,
        start_frame: usize,
        output: &mut [f32],
    ) -> usize {
        self.nodes
            .iter()
            .find(|entry| entry.id == node)
            .map_or(0, |entry| match &entry.kernel {
                Kernel::LoopCapture(loop_node) => {
                    loop_node.copy_capture_interleaved(start_frame, output)
                }
                _ => 0,
            })
    }

    /// Publish a stopped capture to a sample instrument between process calls.
    /// The source ring is copied once; held notes retain their previous PCM.
    pub fn publish_capture_to_instrument(&mut self, capture: NodeId, instrument: NodeId) -> bool {
        if capture == instrument
            || !self.nodes.iter().any(|entry| {
                entry.id == instrument && matches!(entry.kernel, Kernel::SampleInstrument(_))
            })
        {
            return false;
        }
        let Some(frames) = self.capture_length(capture).filter(|frames| *frames > 0) else {
            return false;
        };
        let mut stereo = vec![0.0; frames * 2];
        if self.copy_capture_interleaved(capture, 0, &mut stereo) != frames {
            return false;
        }
        self.nodes
            .iter_mut()
            .find(|entry| entry.id == instrument)
            .is_some_and(|entry| match &mut entry.kernel {
                Kernel::SampleInstrument(player) => player.publish_stereo(stereo, self.sample_rate),
                _ => false,
            })
    }

    pub fn set_parameter(&mut self, node: NodeId, parameter: u32, value: f32) -> bool {
        let Some(index) = self.nodes.iter().position(|entry| entry.id == node) else {
            return false;
        };
        if parameter == 3 && value.is_finite() {
            if let Some(binding) = &mut self.main_directional {
                if binding.oscillator_index == index {
                    binding.manual_sync = value >= 0.5;
                }
            }
        }
        if value.is_finite() && matches!(parameter, 0 | 1 | 3) {
            if let Some(pitch) = self
                .main_directional
                .as_mut()
                .and_then(|binding| binding.pitch.as_mut())
            {
                if pitch.vocoder_index == index {
                    let slot = match parameter {
                        0 => 0,
                        1 => 1,
                        _ => 2,
                    };
                    pitch.manual_vocoder[slot] = value;
                }
            }
        }
        if let Kernel::MidiTranspose(effect) = &mut self.nodes[index].kernel {
            if parameter != 0 || !value.is_finite() {
                return false;
            }
            let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
            let count = effect.set_semitones(value, &mut out);
            self.record_midi_effect(index, None, &out[..count], 0);
            self.route_midi_outputs(index, &out[..count], 0);
            true
        } else if let Kernel::MidiNoteFilter(effect) = &mut self.nodes[index].kernel {
            let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
            let Some(count) = effect.set_parameter(parameter, value, &mut out) else {
                return false;
            };
            self.record_midi_effect(index, None, &out[..count], 0);
            self.route_midi_outputs(index, &out[..count], 0);
            true
        } else if let Kernel::MidiScaleQuantizer(effect) = &mut self.nodes[index].kernel {
            let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
            let Some(count) = effect.set_parameter(parameter, value, &mut out) else {
                return false;
            };
            self.record_midi_effect(index, None, &out[..count], 0);
            self.route_midi_outputs(index, &out[..count], 0);
            true
        } else if let Kernel::MidiVelocityMapper(effect) = &mut self.nodes[index].kernel {
            let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
            let Some(count) = effect.set_parameter(parameter, value, &mut out) else {
                return false;
            };
            self.record_midi_effect(index, None, &out[..count], 0);
            self.route_midi_outputs(index, &out[..count], 0);
            true
        } else if let Kernel::MidiArpeggiator(effect) = &mut self.nodes[index].kernel {
            let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
            let Some(count) = effect.set_parameter(parameter, value, self.frame_clock, &mut out)
            else {
                return false;
            };
            self.record_midi_effect(index, None, &out[..count], 0);
            self.route_midi_outputs(index, &out[..count], 0);
            true
        } else {
            self.nodes[index].kernel.set_parameter(parameter, value)
        }
    }

    /// Traverse the prepared MIDI graph without allocating in the audio callback.
    fn record_midi_effect(
        &mut self,
        index: usize,
        input: Option<EventKind>,
        events: &[EventKind],
        offset: usize,
    ) {
        if events.is_empty() {
            if let Some(kind @ (EventKind::NoteOn { .. } | EventKind::NoteOff { .. })) = input {
                self.push_midi_trace(index, kind, false, offset);
            }
        } else {
            for &kind in events {
                self.push_midi_trace(index, kind, true, offset);
            }
        }
    }

    fn push_midi_trace(&mut self, index: usize, kind: EventKind, emitted: bool, offset: usize) {
        self.midi_trace_sequence = self.midi_trace_sequence.wrapping_add(1);
        self.midi_trace[self.midi_trace_write] = Some(MidiTraceEntry {
            sequence: self.midi_trace_sequence,
            node: self.nodes[index].id,
            offset,
            kind,
            emitted,
        });
        self.midi_trace_write = (self.midi_trace_write + 1) % MIDI_TRACE_CAPACITY;
        self.midi_trace_count = (self.midi_trace_count + 1).min(MIDI_TRACE_CAPACITY);
    }

    fn route_midi_outputs(&mut self, source: usize, events: &[EventKind], offset: usize) {
        self.midi_stack.clear();
        self.push_midi_children(source, events);
        while let Some((index, event)) = self.midi_stack.pop() {
            let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
            let now = self.frame_clock.saturating_add(offset as u64);
            let count = match &mut self.nodes[index].kernel {
                Kernel::MidiInput => {
                    out[0] = event;
                    1
                }
                Kernel::MidiTranspose(effect) => effect.handle(event, &mut out),
                Kernel::MidiNoteFilter(effect) => effect.handle(event, &mut out),
                Kernel::MidiScaleQuantizer(effect) => effect.handle(event, &mut out),
                Kernel::MidiVelocityMapper(effect) => effect.handle(event, &mut out),
                Kernel::MidiArpeggiator(effect) => effect.handle(event, now, &mut out),
                kernel => {
                    kernel.send_event(event);
                    0
                }
            };
            if matches!(
                &self.nodes[index].kernel,
                Kernel::MidiTranspose(_)
                    | Kernel::MidiNoteFilter(_)
                    | Kernel::MidiScaleQuantizer(_)
                    | Kernel::MidiVelocityMapper(_)
            ) {
                self.record_midi_effect(index, Some(event), &out[..count], offset);
            } else if matches!(&self.nodes[index].kernel, Kernel::MidiArpeggiator(_)) && count > 0 {
                self.record_midi_effect(index, None, &out[..count], offset);
            }
            self.push_midi_children(index, &out[..count]);
        }
    }

    fn push_midi_children(&mut self, source: usize, events: &[EventKind]) {
        for event in events.iter().rev() {
            for index in (source + 1..self.nodes.len()).rev() {
                let child = &self.nodes[index];
                if child.active
                    && child.input_signals.first() == Some(&SignalKind::Midi)
                    && child.sources.first() == Some(&Some(source))
                {
                    debug_assert!(self.midi_stack.len() < self.midi_stack.capacity());
                    self.midi_stack.push((index, *event));
                }
            }
        }
    }

    fn dispatch_event(&mut self, target: NodeId, event: EventKind, offset: usize) {
        let index = self
            .nodes
            .iter()
            .position(|node| node.id == target)
            .unwrap();
        let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
        let now = self.frame_clock.saturating_add(offset as u64);
        let count = match &mut self.nodes[index].kernel {
            Kernel::MidiInput => {
                out[0] = event;
                1
            }
            Kernel::MidiTranspose(effect) => effect.handle(event, &mut out),
            Kernel::MidiNoteFilter(effect) => effect.handle(event, &mut out),
            Kernel::MidiScaleQuantizer(effect) => effect.handle(event, &mut out),
            Kernel::MidiVelocityMapper(effect) => effect.handle(event, &mut out),
            Kernel::MidiArpeggiator(effect) => effect.handle(event, now, &mut out),
            kernel => {
                kernel.send_event(event);
                0
            }
        };
        if matches!(
            &self.nodes[index].kernel,
            Kernel::MidiTranspose(_)
                | Kernel::MidiNoteFilter(_)
                | Kernel::MidiScaleQuantizer(_)
                | Kernel::MidiVelocityMapper(_)
        ) {
            self.record_midi_effect(index, Some(event), &out[..count], offset);
        } else if matches!(&self.nodes[index].kernel, Kernel::MidiArpeggiator(_)) && count > 0 {
            self.record_midi_effect(index, None, &out[..count], offset);
        }
        self.route_midi_outputs(index, &out[..count], offset);
    }

    /// Replace decoded sample storage between process calls. No decoding or allocation in process.
    pub fn load_sample_stereo(&mut self, node: NodeId, stereo: Vec<f32>, source_rate: f32) -> bool {
        self.nodes
            .iter_mut()
            .find(|entry| entry.id == node)
            .is_some_and(|entry| match &mut entry.kernel {
                Kernel::SampleRegion(player) => player.load_stereo(stereo, source_rate),
                Kernel::SampleInstrument(instrument) => instrument.load_stereo(stereo, source_rate),
                Kernel::MainVoiceBank(bank) => bank.load_stereo(stereo, source_rate),
                Kernel::Granulator(granulator) => granulator.load_stereo(stereo, source_rate),
                _ => false,
            })
    }

    /// Atomically replace a prepared sine bank's fixed partial target between blocks.
    pub fn load_partials(&mut self, node: NodeId, partials: PartialSet) -> bool {
        self.load_partials_target(node, 0, partials)
    }

    pub fn load_partials_target(
        &mut self,
        node: NodeId,
        target: u32,
        partials: PartialSet,
    ) -> bool {
        self.nodes
            .iter_mut()
            .find(|entry| entry.id == node)
            .is_some_and(|entry| match &mut entry.kernel {
                Kernel::SineBank(bank) if target == 0 => bank.load_partials(partials),
                Kernel::MainVoiceBank(bank) => bank.load_partials(target, partials),
                _ => false,
            })
    }

    /// Install prepared Main source spectra between process calls. Each voice
    /// then follows its own sample playhead through the shared target table.
    pub fn load_main_temporal_targets(&mut self, node: NodeId, targets: Vec<PartialSet>) -> bool {
        self.nodes
            .iter_mut()
            .find(|entry| entry.id == node)
            .is_some_and(|entry| match &mut entry.kernel {
                Kernel::MainVoiceBank(bank) => bank.load_temporal_source_targets(targets),
                _ => false,
            })
    }

    pub fn load_main_temporal_frames(
        &mut self,
        node: NodeId,
        frames: Vec<TemporalFrame>,
        recipe: MainTemporalRecipe,
    ) -> bool {
        self.nodes
            .iter_mut()
            .find(|entry| entry.id == node)
            .is_some_and(|entry| match &mut entry.kernel {
                Kernel::MainVoiceBank(bank) => bank.load_temporal_source_frames(frames, recipe),
                _ => false,
            })
    }

    pub fn clear_main_temporal_targets(&mut self, node: NodeId) -> bool {
        self.nodes
            .iter_mut()
            .find(|entry| entry.id == node)
            .is_some_and(|entry| match &mut entry.kernel {
                Kernel::MainVoiceBank(bank) => {
                    bank.clear_temporal_source_targets();
                    true
                }
                _ => false,
            })
    }

    pub fn set_main_temporal_speed(&mut self, node: NodeId, speed: f32) -> bool {
        self.nodes
            .iter_mut()
            .find(|entry| entry.id == node)
            .is_some_and(|entry| match &mut entry.kernel {
                Kernel::MainVoiceBank(bank) => bank.set_temporal_speed(speed),
                _ => false,
            })
    }

    /// Events must be ordered by offset. All targets and offsets are checked before processing.
    pub fn process_with_events(
        &mut self,
        input: [&[f32]; 2],
        output: [&mut [f32]; 2],
        events: &[TimedEvent],
    ) -> Result<(), EventError> {
        self.process_with_events_sidechain(input, None, output, events)
    }

    /// An optional independent stereo bus. Missing sidechain input is silence.
    pub fn process_with_events_sidechain(
        &mut self,
        input: [&[f32]; 2],
        sidechain: Option<[&[f32]; 2]>,
        output: [&mut [f32]; 2],
        events: &[TimedEvent],
    ) -> Result<(), EventError> {
        let frames = input[0].len();
        if let Some([left, right]) = sidechain {
            assert_eq!(left.len(), frames);
            assert_eq!(right.len(), frames);
        }
        self.validate_events(events, frames)?;
        self.apply_main_directional(frames);
        let [left_in, right_in] = input;
        let [left_out, right_out] = output;
        let mut position = 0;
        let mut event_index = 0;
        while position < frames {
            let external = events.get(event_index).map_or(frames, |event| event.offset);
            let internal = self
                .next_arpeggiator_deadline()
                .map_or(frames, |deadline| {
                    deadline.saturating_sub(self.frame_clock).min(frames as u64) as usize
                })
                .max(position);
            let at = external.min(internal).min(frames);
            if at > position {
                self.render_audio_span(
                    [&left_in[position..at], &right_in[position..at]],
                    sidechain.map(|[left, right]| [&left[position..at], &right[position..at]]),
                    [&mut left_out[position..at], &mut right_out[position..at]],
                );
            }
            position = at;
            while event_index < events.len() && events[event_index].offset == at {
                let event = events[event_index];
                self.dispatch_event(event.node, event.kind, at);
                event_index += 1;
            }
            if at < frames {
                self.fire_due_arpeggiators(at);
            }
        }
        self.frame_clock = self.frame_clock.saturating_add(frames as u64);
        Ok(())
    }

    /// Validate the whole host event queue before a split block changes output.
    pub fn validate_events(&self, events: &[TimedEvent], frames: usize) -> Result<(), EventError> {
        let mut previous_offset = 0;
        for event in events {
            if event.offset >= frames {
                return Err(EventError::OffsetOutOfRange);
            }
            if event.offset < previous_offset {
                return Err(EventError::Unsorted);
            }
            if !self
                .nodes
                .iter()
                .any(|node| node.id == event.node && node.kernel.accepts_events())
            {
                return Err(EventError::UnknownTarget);
            }
            previous_offset = event.offset;
        }
        Ok(())
    }

    /// `frames` may be smaller than prepared capacity. Buffers are planar stereo.
    pub fn process(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        self.process_with_events(input, output, &[])
            .expect("empty event list is valid");
    }

    pub fn process_with_sidechain(
        &mut self,
        input: [&[f32]; 2],
        sidechain: [&[f32]; 2],
        output: [&mut [f32]; 2],
    ) {
        self.process_with_events_sidechain(input, Some(sidechain), output, &[])
            .expect("empty event list is valid");
    }

    fn next_arpeggiator_deadline(&self) -> Option<u64> {
        self.nodes
            .iter()
            .filter(|node| node.active)
            .filter_map(|node| match &node.kernel {
                Kernel::MidiArpeggiator(arp) => arp.next_deadline(),
                _ => None,
            })
            .min()
    }

    fn fire_due_arpeggiators(&mut self, offset: usize) {
        let now = self.frame_clock.saturating_add(offset as u64);
        for index in 0..self.nodes.len() {
            if !self.nodes[index].active {
                continue;
            }
            let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
            let count = match &mut self.nodes[index].kernel {
                Kernel::MidiArpeggiator(arp)
                    if arp.next_deadline().is_some_and(|deadline| deadline <= now) =>
                {
                    arp.fire_due(now, &mut out)
                }
                _ => 0,
            };
            if count > 0 {
                self.record_midi_effect(index, None, &out[..count], offset);
                self.route_midi_outputs(index, &out[..count], offset);
            }
        }
    }

    fn render_audio_span(
        &mut self,
        input: [&[f32]; 2],
        sidechain: Option<[&[f32]; 2]>,
        output: [&mut [f32]; 2],
    ) {
        let frames = input[0].len();
        assert!(frames <= self.max_frames);
        assert_eq!(frames, input[1].len());
        assert_eq!(frames, output[0].len());
        assert_eq!(frames, output[1].len());
        for index in 0..self.nodes.len() {
            if !self.nodes[index].active {
                continue;
            }
            let (previous, current_and_later) = self.nodes.split_at_mut(index);
            let current = &mut current_and_later[0];
            let source = |port: usize, channel: usize| -> &[f32] {
                current.sources[port]
                    .map(|source| {
                        &previous[source].scratch
                            [channel * self.max_frames..channel * self.max_frames + frames]
                    })
                    .unwrap_or(
                        &self.silence
                            [channel * self.max_frames..channel * self.max_frames + frames],
                    )
            };
            let (left, right) = current.scratch.split_at_mut(self.max_frames);
            let left = &mut left[..frames];
            let right = &mut right[..frames];
            match &mut current.kernel {
                Kernel::MidiInput
                | Kernel::MidiTranspose(_)
                | Kernel::MidiNoteFilter(_)
                | Kernel::MidiArpeggiator(_)
                | Kernel::MidiScaleQuantizer(_)
                | Kernel::MidiVelocityMapper(_) => {
                    left.fill(0.0);
                    right.fill(0.0);
                }
                Kernel::InputRaw => {
                    left.copy_from_slice(input[0]);
                    right.copy_from_slice(input[1]);
                }
                Kernel::InputSidechain => {
                    if let Some([side_left, side_right]) = sidechain {
                        left.copy_from_slice(side_left);
                        right.copy_from_slice(side_right);
                    } else {
                        left.fill(0.0);
                        right.fill(0.0);
                    }
                }
                Kernel::InputMonitor { gain } => {
                    for frame in 0..frames {
                        left[frame] = input[0][frame] * *gain;
                        right[frame] = input[1][frame] * *gain;
                    }
                }
                Kernel::Constant { value } => {
                    left.fill(*value);
                    right.fill(*value);
                }
                Kernel::Gain {
                    target,
                    current,
                    smoothing,
                    muted,
                } => {
                    let from_left = source(0, 0);
                    let from_right = source(0, 1);
                    let requested = if *muted { 0.0 } else { *target };
                    for frame in 0..frames {
                        *current += (requested - *current) * *smoothing;
                        left[frame] = from_left[frame] * *current;
                        right[frame] = from_right[frame] * *current;
                    }
                }
                Kernel::FixedGain { gain } => {
                    let from_left = source(0, 0);
                    let from_right = source(0, 1);
                    for frame in 0..frames {
                        left[frame] = from_left[frame] * *gain;
                        right[frame] = from_right[frame] * *gain;
                    }
                }
                Kernel::Sum2 { gain_a, gain_b } => {
                    for channel in 0..2 {
                        let a = source(0, channel);
                        let b = source(1, channel);
                        let to = if channel == 0 {
                            &mut *left
                        } else {
                            &mut *right
                        };
                        for frame in 0..frames {
                            to[frame] = a[frame] * *gain_a + b[frame] * *gain_b;
                        }
                    }
                }
                Kernel::LinearBlend { mix } => {
                    for channel in 0..2 {
                        let a = source(0, channel);
                        let b = source(1, channel);
                        let to = if channel == 0 {
                            &mut *left
                        } else {
                            &mut *right
                        };
                        for frame in 0..frames {
                            to[frame] = a[frame] * (1.0 - *mix) + b[frame] * *mix;
                        }
                    }
                }
                Kernel::Crossfader(state) => {
                    let a_left = source(0, 0);
                    let a_right = source(0, 1);
                    let b_left = source(1, 0);
                    let b_right = source(1, 1);
                    for frame in 0..frames {
                        for index in 0..3 {
                            state.current[index] +=
                                (state.target[index] - state.current[index]) * state.smoothing;
                        }
                        let t = (0.5 * (state.current[0] + 1.0)).clamp(0.0, 1.0);
                        let linear_a = 1.0 - t;
                        let linear_b = t;
                        let power_a = (0.5 * std::f32::consts::PI * t).cos();
                        let power_b = (0.5 * std::f32::consts::PI * t).sin();
                        let curve = state.current[1].clamp(0.0, 1.0);
                        let gain_a = linear_a * (1.0 - curve) + power_a * curve;
                        let gain_b = linear_b * (1.0 - curve) + power_b * curve;
                        let mix = state.current[2];
                        let dry = 1.0 - mix;
                        left[frame] = a_left[frame] * dry
                            + (a_left[frame] * gain_a + b_left[frame] * gain_b) * mix;
                        right[frame] = a_right[frame] * dry
                            + (a_right[frame] * gain_a + b_right[frame] * gain_b) * mix;
                    }
                }
                Kernel::Mixer(state) => {
                    for frame in 0..frames {
                        let mut out_left = 0.0;
                        let mut out_right = 0.0;
                        for bus in 0..state.gains.len() {
                            state.gains[bus] +=
                                (state.target_gains[bus] - state.gains[bus]) * state.smoothing;
                            state.pans[bus] +=
                                (state.target_pans[bus] - state.pans[bus]) * state.smoothing;
                            let t = 0.5 * (state.pans[bus].clamp(-1.0, 1.0) + 1.0);
                            let pan_left = (0.5 * std::f32::consts::PI * t).cos();
                            let pan_right = (0.5 * std::f32::consts::PI * t).sin();
                            out_left += source(bus, 0)[frame] * state.gains[bus] * pan_left;
                            out_right += source(bus, 1)[frame] * state.gains[bus] * pan_right;
                        }
                        state.master += (state.target_master - state.master) * state.smoothing;
                        left[frame] = out_left * state.master;
                        right[frame] = out_right * state.master;
                    }
                }
                Kernel::Svf(filter) => {
                    filter.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::ModulatedSvf { filter, depth_hz } => filter.process_planar_with_cv(
                    [source(0, 0), source(0, 1)],
                    [left, right],
                    Some(source(1, 0)),
                    *depth_hz,
                ),
                Kernel::Slew(slew) => {
                    slew.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::AttenuverterBias(control) => {
                    let cv = source(0, 0);
                    for frame in 0..frames {
                        let value = control.process_sample(cv[frame]);
                        left[frame] = value;
                        right[frame] = value;
                    }
                }
                Kernel::SampleHold(control) => {
                    let cv = source(0, 0);
                    let trigger = source(1, 0);
                    for frame in 0..frames {
                        let value = control.process_sample(cv[frame], trigger[frame]);
                        left[frame] = value;
                        right[frame] = value;
                    }
                }
                Kernel::CvMix(control) => {
                    let inputs = [source(0, 0), source(1, 0), source(2, 0), source(3, 0)];
                    for frame in 0..frames {
                        let value = control.process_sample([
                            inputs[0][frame],
                            inputs[1][frame],
                            inputs[2][frame],
                            inputs[3][frame],
                        ]);
                        left[frame] = value;
                        right[frame] = value;
                    }
                }
                Kernel::Distortion(distortion) => {
                    let from_left = source(0, 0);
                    let from_right = source(0, 1);
                    for frame in 0..frames {
                        let value =
                            distortion.process_sample([from_left[frame], from_right[frame]]);
                        left[frame] = value[0];
                        right[frame] = value[1];
                    }
                }
                Kernel::Compressor(compressor) => {
                    compressor.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::Limiter(limiter) => {
                    limiter.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::StereoDelay(delay) => {
                    delay.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::Phaser(phaser) => {
                    phaser.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::Chorus(chorus) => {
                    chorus.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::Eq8(eq) => eq.process_planar([source(0, 0), source(0, 1)], [left, right]),
                Kernel::WaveShaper(shaper) => {
                    shaper.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::StereoWidener(widener) => {
                    widener.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::LegacyFilter(filter) => {
                    filter.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::Reverb(reverb) => {
                    reverb.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::MultitapDelay(delay) => {
                    delay.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::RingModulator(ring) => {
                    let modulator = current.sources[1].map(|_| [source(1, 0), source(1, 1)]);
                    ring.process_planar([source(0, 0), source(0, 1)], modulator, [left, right])
                }
                Kernel::TransientShaper(transient) => {
                    transient.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::BitCrusher(crusher) => {
                    let bus_b = current.sources[1].map(|_| [source(1, 0), source(1, 1)]);
                    crusher.process_planar([source(0, 0), source(0, 1)], bus_b, [left, right])
                }
                Kernel::LegacyEq(eq) => {
                    eq.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::FormantFilter(formant) => {
                    formant.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::Resonator(resonator) => {
                    resonator.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::SineBank(bank) => {
                    let sync = current.sources[0].map(|_| source(0, 0));
                    bank.process_planar(sync, [left, right])
                }
                Kernel::ReverseDelay(delay) => {
                    delay.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::Stutter(stutter) => {
                    stutter.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::PitchShifter(shifter) => {
                    shifter.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::PhaseVocoder(vocoder) => {
                    vocoder.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::Shimmer(shimmer) => {
                    shimmer.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::Granulator(granulator) => {
                    granulator.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::EffectSlot(slot) => {
                    slot.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::LoopCapture(loop_node) => {
                    loop_node.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::SampleRegion(player) => {
                    for frame in 0..frames {
                        let value = player.process_sample();
                        left[frame] = value[0];
                        right[frame] = value[1];
                    }
                }
                Kernel::SampleInstrument(instrument) => {
                    for frame in 0..frames {
                        let value = instrument.process_sample();
                        left[frame] = value[0];
                        right[frame] = value[1];
                    }
                }
                Kernel::MainVoiceBank(bank) => bank.process_planar([left, right]),
                Kernel::SpectrumAnalyzer(analyzer) => {
                    analyzer.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::FftSpectrum(analyzer) => {
                    analyzer.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::EnvelopeFollower(follower) => {
                    follower.process_planar([source(0, 0), source(0, 1)], [left, right])
                }
                Kernel::EnvelopeControl(follower) => {
                    let from_left = source(0, 0);
                    let from_right = source(0, 1);
                    for frame in 0..frames {
                        let value = follower.process_sample([from_left[frame], from_right[frame]]);
                        left[frame] = value;
                        right[frame] = value;
                    }
                }
                Kernel::VoiceSynth(synth) => {
                    for frame in 0..frames {
                        let value = synth.process_sample() * std::f32::consts::FRAC_1_SQRT_2;
                        left[frame] = value;
                        right[frame] = value;
                    }
                }
                Kernel::Oscillator(oscillator) => {
                    let sync = current.sources[0].map(|_| source(0, 0));
                    for frame in 0..frames {
                        let value = oscillator.process_sample(sync.map(|samples| samples[frame]));
                        left[frame] = value;
                        right[frame] = value;
                    }
                }
                Kernel::AdsrEnvelope(envelope) => {
                    let from_left = source(0, 0);
                    let from_right = source(0, 1);
                    for frame in 0..frames {
                        let level = envelope.process_sample();
                        left[frame] = from_left[frame] * level;
                        right[frame] = from_right[frame] * level;
                    }
                }
                Kernel::NoiseGenerator(noise) => {
                    for frame in 0..frames {
                        let value = noise.process_sample();
                        left[frame] = value[0];
                        right[frame] = value[1];
                    }
                }
                Kernel::Lfo(lfo) => {
                    for frame in 0..frames {
                        let value = lfo.process_sample();
                        left[frame] = value;
                        right[frame] = value;
                    }
                }
                Kernel::ModulatedGain {
                    current,
                    target,
                    smoothing,
                    last_effective,
                } => {
                    let from_left = source(0, 0);
                    let from_right = source(0, 1);
                    let cv = source(1, 0);
                    for frame in 0..frames {
                        for index in 0..2 {
                            current[index] += (target[index] - current[index]) * *smoothing;
                        }
                        let effective = (current[0] + current[1] * cv[frame]).clamp(0.0, 2.0);
                        *last_effective = effective;
                        left[frame] = from_left[frame] * effective;
                        right[frame] = from_right[frame] * effective;
                    }
                }
                Kernel::PhraseGain(gain) => {
                    gain.process_planar([source(0, 0), source(0, 1)], source(1, 0), [left, right])
                }
                Kernel::Output => {
                    left.copy_from_slice(source(0, 0));
                    right.copy_from_slice(source(0, 1));
                }
            }
        }
        let result = &self.nodes[self.output_index].scratch;
        output[0].copy_from_slice(&result[..frames]);
        output[1].copy_from_slice(&result[self.max_frames..self.max_frames + frames]);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stopped_loop_take_publishes_to_running_instrument() {
        let description = GraphDescription {
            nodes: vec![
                node(1, NodeKind::InputRaw),
                node(3, NodeKind::Output),
                node(4, NodeKind::MidiInput),
                node(5, NodeKind::SampleInstrument),
                node(
                    6,
                    NodeKind::LoopCapture {
                        capacity_seconds: 0.05,
                        mix: 1.0,
                    },
                ),
                node(
                    7,
                    NodeKind::Sum2 {
                        gain_a: 1.0,
                        gain_b: 1.0,
                    },
                ),
            ],
            connections: vec![
                edge(1, 6, 0),
                edge(4, 5, 0),
                edge(6, 7, 0),
                edge(5, 7, 1),
                edge(7, 3, 0),
            ],
        };
        let mut plan = description.compile(8_000.0, 16).unwrap();
        assert!(plan.load_sample_stereo(5, vec![1.0; 32], 8_000.0));
        assert!(plan.set_parameter(5, 2, 1.0));
        assert!(plan.set_parameter(5, 10, 0.0));
        assert!(!plan.publish_capture_to_instrument(6, 5));
        assert!(plan.set_parameter(6, 0, 1.0));
        let input = [0.25; 16];
        process(&mut plan, &input, &input);
        assert!(!plan.publish_capture_to_instrument(6, 5));
        assert!(plan.set_parameter(6, 0, 0.0));
        assert_eq!(plan.capture_length(6), Some(16));
        assert!(!plan.publish_capture_to_instrument(6, 3));
        assert!(plan.publish_capture_to_instrument(6, 5));
        let on = TimedEvent {
            offset: 0,
            node: 4,
            kind: EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 127,
            },
        };
        let silence = [0.0; 16];
        let mut left = [0.0; 16];
        let mut right = [0.0; 16];
        plan.process_with_events([&silence, &silence], [&mut left, &mut right], &[on])
            .unwrap();
        assert_eq!(left, [0.25; 16]);
        assert_eq!(right, left);
    }

    #[test]
    fn sidechain_capture_reads_only_the_second_stereo_bus() {
        let description = GraphDescription {
            nodes: vec![
                node(1, NodeKind::InputRaw),
                node(2, NodeKind::InputSidechain),
                node(3, NodeKind::Output),
                node(
                    6,
                    NodeKind::LoopCapture {
                        capacity_seconds: 0.05,
                        mix: 1.0,
                    },
                ),
            ],
            connections: vec![edge(2, 6, 0), edge(6, 3, 0)],
        };
        let mut plan = description.compile(8_000.0, 16).unwrap();
        let main = [0.25; 16];
        let side_left = [0.75; 16];
        let side_right = [-0.5; 16];
        assert!(plan.set_parameter(6, 0, 1.0));
        let mut left = [0.0; 16];
        let mut right = [0.0; 16];
        plan.process_with_sidechain(
            [&main, &main],
            [&side_left, &side_right],
            [&mut left, &mut right],
        );
        assert_eq!(left, side_left);
        assert_eq!(right, side_right);
        assert!(plan.set_parameter(6, 0, 0.0));
        let mut copied = [0.0; 32];
        assert_eq!(plan.copy_capture_interleaved(6, 0, &mut copied), 16);
        assert_eq!(&copied[..4], &[0.75, -0.5, 0.75, -0.5]);
        let silent = process(&mut plan, &main, &main);
        assert_eq!(silent[0], vec![0.0; 16]);
    }

    fn node(id: NodeId, kind: NodeKind) -> NodeSpec {
        NodeSpec { id, kind }
    }

    fn edge(from: NodeId, to: NodeId, input_port: usize) -> Connection {
        Connection {
            from,
            to,
            input_port,
        }
    }

    fn process(plan: &mut ExecutionPlan, left: &[f32], right: &[f32]) -> [Vec<f32>; 2] {
        let mut out_left = vec![0.0; left.len()];
        let mut out_right = vec![0.0; right.len()];
        plan.process([left, right], [&mut out_left, &mut out_right]);
        [out_left, out_right]
    }

    #[test]
    fn host_input_has_no_implicit_output_route() {
        let description = GraphDescription {
            nodes: vec![node(1, NodeKind::InputRaw), node(2, NodeKind::Output)],
            connections: vec![],
        };
        let mut plan = description.compile(48_000.0, 8).unwrap();
        assert_eq!(plan.node_count(), 1); // input is unreachable and pruned
        assert_eq!(
            process(&mut plan, &[1.0; 8], &[0.5; 8]),
            [vec![0.0; 8], vec![0.0; 8]]
        );
    }

    #[test]
    fn disconnected_retrospective_root_records_without_audible_input() {
        let graph = GraphDescription {
            nodes: vec![
                node(1, NodeKind::InputRaw),
                node(3, NodeKind::Output),
                node(
                    6,
                    NodeKind::RetrospectiveCapture {
                        capacity_seconds: 1.0,
                    },
                ),
            ],
            connections: vec![edge(1, 6, 0)],
        };
        let mut plan = graph.compile(100.0, 8).unwrap();
        assert_eq!(plan.node_count(), 3);
        assert_eq!(
            process(&mut plan, &[1., 2., 3.], &[4., 5., 6.]),
            [vec![0.; 3], vec![0.; 3]]
        );
        assert!(plan.begin_capture_staging(6, 5));
        assert_eq!(
            process(&mut plan, &[7.; 3], &[8.; 3]),
            [vec![0.; 3], vec![0.; 3]]
        );
        let mut stereo = [0.; 10];
        assert_eq!(plan.copy_capture_staged_interleaved(6, 0, &mut stereo), 5);
        assert_eq!(stereo, [0., 0., 0., 0., 1., 4., 2., 5., 3., 6.]);
    }

    #[test]
    fn monitor_input_is_an_explicit_gain_controlled_route() {
        let description = GraphDescription {
            nodes: vec![
                node(1, NodeKind::InputRaw),
                node(2, NodeKind::InputMonitor { gain: 0.0 }),
                node(3, NodeKind::Output),
            ],
            connections: vec![edge(2, 3, 0)],
        };
        let mut plan = description.compile(48_000.0, 4).unwrap();
        assert_eq!(plan.node_count(), 2); // raw input is not part of the audible path
        assert_eq!(
            process(&mut plan, &[0.5; 4], &[1.0; 4]),
            [vec![0.0; 4], vec![0.0; 4]]
        );
        assert!(plan.set_parameter(2, 0, 0.25));
        assert_eq!(
            process(&mut plan, &[0.5; 4], &[1.0; 4]),
            [vec![0.125; 4], vec![0.25; 4]]
        );
    }

    #[test]
    fn main_directional_updates_sample_cursor_and_sync_retrigger_before_each_block() {
        let description = GraphDescription {
            nodes: vec![
                node(2, NodeKind::SampleRegion),
                node(
                    11,
                    NodeKind::Oscillator {
                        frequency: 220.0,
                        amplitude: 0.5,
                        waveform: 1,
                    },
                ),
                node(
                    12,
                    NodeKind::Sum2 {
                        gain_a: 1.0,
                        gain_b: 0.1,
                    },
                ),
                node(5, NodeKind::Output),
            ],
            connections: vec![
                edge(2, 11, 0),
                edge(2, 12, 0),
                edge(11, 12, 1),
                edge(12, 5, 0),
            ],
        };
        let mut plan = description.compile(48_000.0, 128).unwrap();
        assert!(!plan.configure_main_directional(99, 2));
        assert!(plan.configure_main_directional(11, 2));
        assert!(plan.load_sample_stereo(2, vec![0.25; 48_000 * 2], 48_000.0));
        assert!(plan.set_parameter(2, 6, 1.0));
        for (id, value) in [(0, 2.0), (1, 220.0), (2, 1.0), (3, 1.0), (4, 1.0), (5, 1.0)] {
            assert!(plan.set_main_directional_parameter(id, value));
        }
        let silence = [0.0; 128];
        let _ = process(&mut plan, &silence, &silence);
        let fm_position = plan.node_meter(2, 0).unwrap();
        assert!(fm_position > 0.001 && fm_position < 110.0 / 47_999.0);

        for (id, value) in [(0, 3.0), (1, 1000.0), (6, 1.0), (7, -0.5)] {
            assert!(plan.set_main_directional_parameter(id, value));
        }
        let _ = process(&mut plan, &silence, &silence);
        let first_cycle = plan.node_meter(2, 0).unwrap();
        let _ = process(&mut plan, &silence, &silence);
        let second_cycle = plan.node_meter(2, 0).unwrap();
        assert!(
            (first_cycle - second_cycle).abs() < 1e-6,
            "retrigger restarts each block"
        );
        assert!(plan.set_main_directional_parameter(6, 0.0));
        let _ = process(&mut plan, &silence, &silence);
        assert!(
            plan.node_meter(2, 0).unwrap() > second_cycle * 1.9,
            "play resumes without resetting"
        );
        assert!(plan.set_parameter(11, 3, 1.0));
        assert!(plan.set_main_directional_parameter(7, 0.5));
        let _ = process(&mut plan, &silence, &silence);
        assert_eq!(
            plan.node_meter(11, 2),
            Some(0.0),
            "sample-facing Sync suppresses hard sync"
        );
        assert!(plan.set_main_directional_parameter(0, 0.0));
        let _ = process(&mut plan, &silence, &silence);
        assert_eq!(
            plan.node_meter(11, 2),
            Some(1.0),
            "normal mode restores manual hard sync"
        );
    }

    #[test]
    fn main_pitch_binding_routes_note_to_wave_sample_and_vocoder_then_restores_manual_targets() {
        let description = GraphDescription {
            nodes: vec![
                node(2, NodeKind::SampleRegion),
                node(
                    6,
                    NodeKind::PhaseVocoder {
                        params: [0.0, 0.0, 1.0, 0.0, 11.0],
                    },
                ),
                node(
                    11,
                    NodeKind::Oscillator {
                        frequency: 330.0,
                        amplitude: 0.5,
                        waveform: 1,
                    },
                ),
                node(
                    12,
                    NodeKind::Sum2 {
                        gain_a: 1.0,
                        gain_b: 1.0,
                    },
                ),
                node(5, NodeKind::Output),
            ],
            connections: vec![
                edge(2, 6, 0),
                edge(6, 12, 0),
                edge(11, 12, 1),
                edge(12, 5, 0),
            ],
        };
        let mut plan = description.compile(48_000.0, 128).unwrap();
        assert!(!plan.configure_main_pitch(6));
        assert!(plan.configure_main_directional(11, 2));
        assert!(!plan.configure_main_pitch(11));
        assert!(plan.configure_main_pitch(6));
        assert!(!plan.set_main_pitch_parameter(2, -1.0));
        assert!(plan.load_sample_stereo(2, vec![0.25; 48_000 * 2], 48_000.0));
        assert!(plan.set_parameter(2, 6, 1.0));
        assert!(plan.set_parameter(2, 0, 0.5));
        assert!(plan.set_main_directional_parameter(1, 330.0));
        assert!(plan.set_main_directional_parameter(2, 0.5));
        for (id, value) in [(0, 1.0), (1, 69.0), (2, 2.0), (3, 12.0), (4, 2.0)] {
            assert!(plan.set_main_pitch_parameter(id, value));
        }
        let silence = [0.0; 128];
        let _ = process(&mut plan, &silence, &silence);
        assert_eq!(plan.node_meter(11, 0), Some(660.0));
        assert_eq!(plan.node_meter(6, 0), Some(1.0));
        assert!((plan.node_meter(6, 1).unwrap() - 7.01955).abs() < 0.001);
        assert_eq!(plan.node_meter(6, 3), Some(1.0));
        let mapped_position = plan.node_meter(2, 0).unwrap();
        assert!((mapped_position - 128.0 / 47_999.0).abs() < 1e-6);

        assert!(plan.set_parameter(6, 1, 7.0));
        assert!(plan.set_parameter(6, 3, 0.25));
        assert!(plan.set_main_pitch_parameter(0, 0.0));
        let _ = process(&mut plan, &silence, &silence);
        assert_eq!(plan.node_meter(11, 0), Some(330.0));
        assert_eq!(plan.node_meter(6, 1), Some(7.0));
        assert_eq!(plan.node_meter(6, 3), Some(0.25));
        let manual_delta = plan.node_meter(2, 0).unwrap() - mapped_position;
        assert!((manual_delta - 64.0 / 47_999.0).abs() < 1e-6);
    }

    #[test]
    fn gain_filter_chain_matches_standalone_filter() {
        let description = GraphDescription {
            nodes: vec![
                node(9, NodeKind::Output),
                node(3, NodeKind::Svf),
                node(2, NodeKind::Gain { gain: 0.5 }),
                node(1, NodeKind::InputRaw),
            ],
            connections: vec![edge(1, 2, 0), edge(2, 3, 0), edge(3, 9, 0)],
        };
        let mut plan = description.compile(48_000.0, 256).unwrap();
        assert_eq!(plan.node_count(), 4);
        assert!(plan.set_parameter(3, 0, 2.0));
        assert!(plan.set_parameter(3, 1, 1500.0));
        assert!(!plan.set_parameter(999, 0, 1.0));
        let left: Vec<_> = (0..256).map(|i| (i as f32 * 0.21).sin()).collect();
        let right: Vec<_> = (0..256).map(|i| (i as f32 * 0.09).cos()).collect();
        let actual = process(&mut plan, &left, &right);
        let scaled_left: Vec<_> = left.iter().map(|value| value * 0.5).collect();
        let scaled_right: Vec<_> = right.iter().map(|value| value * 0.5).collect();
        let mut expected_left = vec![0.0; 256];
        let mut expected_right = vec![0.0; 256];
        let mut filter = Filter::new(48_000.0);
        filter.set_parameter(0, 2.0);
        filter.set_parameter(1, 1500.0);
        filter.process_planar(
            [&scaled_left, &scaled_right],
            [&mut expected_left, &mut expected_right],
        );
        assert_eq!(actual, [expected_left, expected_right]);
    }

    #[test]
    fn gain_smooths_parameter_and_mute_changes() {
        let description = GraphDescription {
            nodes: vec![
                node(1, NodeKind::InputRaw),
                node(2, NodeKind::Gain { gain: 1.0 }),
                node(3, NodeKind::Output),
            ],
            connections: vec![edge(1, 2, 0), edge(2, 3, 0)],
        };
        let mut plan = description.compile(48_000.0, 128).unwrap();
        assert!(plan.set_parameter(2, 0, -1.0)); // legacy Gain clamps to zero
        let [left, right] = process(&mut plan, &[1.0; 128], &[0.5; 128]);
        assert!(left[0] < 1.0 && left[0] > left[127] && left[127] > 0.0);
        assert_eq!(right[0], left[0] * 0.5);
        assert!(plan.set_parameter(2, 0, 1.0));
        let [recovered, _] = process(&mut plan, &[1.0; 128], &[1.0; 128]);
        assert!(recovered[0] > left[127] && recovered[127] > recovered[0]);
        assert!(plan.set_parameter(2, 1, 1.0));
        let [muted, _] = process(&mut plan, &[1.0; 128], &[1.0; 128]);
        assert!(muted[127] < muted[0]);
    }

    #[test]
    fn branch_sum_and_linear_blend_route_explicit_sources() {
        let description = GraphDescription {
            nodes: vec![
                node(1, NodeKind::InputRaw),
                node(2, NodeKind::Gain { gain: 0.5 }),
                node(3, NodeKind::Constant { value: 0.25 }),
                node(
                    4,
                    NodeKind::Sum2 {
                        gain_a: 1.0,
                        gain_b: 1.0,
                    },
                ),
                node(5, NodeKind::LinearBlend { mix: 0.5 }),
                node(6, NodeKind::Output),
            ],
            connections: vec![
                edge(1, 2, 0),
                edge(2, 4, 0),
                edge(3, 4, 1),
                edge(4, 5, 0),
                edge(1, 5, 1),
                edge(5, 6, 0),
            ],
        };
        let mut plan = description.compile(48_000.0, 4).unwrap();
        assert_eq!(
            process(&mut plan, &[1.0; 4], &[0.0; 4]),
            [vec![0.875; 4], vec![0.125; 4]]
        );
        assert!(plan.set_parameter(5, 0, 1.0));
        assert_eq!(
            process(&mut plan, &[1.0; 4], &[0.0; 4]),
            [vec![1.0; 4], vec![0.0; 4]]
        );
    }

    #[test]
    fn prepared_graph_reset_discards_reverb_tail_and_preserves_route() {
        let description = GraphDescription {
            nodes: vec![
                node(1, NodeKind::InputRaw),
                node(
                    2,
                    NodeKind::Reverb {
                        params: reverb::DEFAULTS,
                    },
                ),
                node(3, NodeKind::Output),
            ],
            connections: vec![edge(1, 2, 0), edge(2, 3, 0)],
        };
        let mut plan = description.compile(8_000.0, 128).unwrap();
        let mut fresh = description.compile(8_000.0, 128).unwrap();
        let mut impulse = [0.0; 128];
        impulse[0] = 1.0;
        process(&mut plan, &impulse, &impulse);
        let silence = [0.0; 128];
        let mut tail = false;
        for _ in 0..30 {
            let [left, _] = process(&mut plan, &silence, &silence);
            tail |= left.iter().any(|sample| sample.abs() > 0.000001);
        }
        assert!(tail);
        plan.reset_processing();
        assert_eq!(
            process(&mut plan, &silence, &silence),
            process(&mut fresh, &silence, &silence)
        );
        assert_eq!(
            process(&mut plan, &impulse, &impulse),
            process(&mut fresh, &impulse, &impulse)
        );
    }

    #[test]
    fn crossfader_uses_stereo_sources_and_smooths_position() {
        let description = GraphDescription {
            nodes: vec![
                node(1, NodeKind::InputRaw),
                node(2, NodeKind::Constant { value: 0.25 }),
                node(
                    3,
                    NodeKind::Crossfader {
                        position: -1.0,
                        curve: 0.0,
                        mix: 1.0,
                    },
                ),
                node(4, NodeKind::Output),
            ],
            connections: vec![edge(1, 3, 0), edge(2, 3, 1), edge(3, 4, 0)],
        };
        let mut plan = description.compile(48_000.0, 128).unwrap();
        assert_eq!(
            process(&mut plan, &[1.0; 128], &[0.5; 128]),
            [vec![1.0; 128], vec![0.5; 128]]
        );
        assert!(plan.set_parameter(3, 0, 1.0));
        let [left, right] = process(&mut plan, &[1.0; 128], &[0.5; 128]);
        assert!(left[0] > left[127] && left[127] > 0.25);
        assert!(right[0] > right[127] && right[127] > 0.25);
        assert!(!plan.set_parameter(3, 3, 0.5));
    }

    #[test]
    fn mixer_routes_first_and_last_of_thirty_two_stereo_busses() {
        let mut gains = vec![0.0; 32];
        gains[0] = 1.0;
        gains[31] = 1.0;
        let mut pans = vec![0.0; 32];
        pans[0] = -1.0;
        pans[31] = 1.0;
        let description = GraphDescription {
            nodes: vec![
                node(1, NodeKind::InputRaw),
                node(2, NodeKind::Constant { value: 0.25 }),
                node(
                    3,
                    NodeKind::Mixer {
                        inputs: 32,
                        gains,
                        pans,
                        master: 1.0,
                    },
                ),
                node(4, NodeKind::Output),
            ],
            connections: vec![edge(1, 3, 0), edge(2, 3, 31), edge(3, 4, 0)],
        };
        let mut plan = description.compile(48_000.0, 4).unwrap();
        let [left, right] = process(&mut plan, &[1.0; 4], &[0.5; 4]);
        assert!(left.iter().all(|value| (value - 1.0).abs() < 1e-6));
        assert!(right.iter().all(|value| (value - 0.25).abs() < 1e-6));
        assert!(plan.set_parameter(3, 64, 0.0));
        assert!(!plan.set_parameter(3, 65, 0.0)); // linked depth requires exactly two buses

        let mut invalid = description;
        invalid.connections.push(edge(1, 3, 32));
        assert!(matches!(
            invalid.compile(48_000.0, 4),
            Err(GraphError::InvalidPort(3, 32))
        ));
    }

    #[test]
    fn two_bus_mixer_links_depth_and_restores_independent_gains() {
        let description = GraphDescription {
            nodes: vec![
                node(1, NodeKind::InputRaw),
                node(2, NodeKind::Constant { value: 0.25 }),
                node(
                    3,
                    NodeKind::Mixer {
                        inputs: 2,
                        gains: vec![0.25, 0.75],
                        pans: vec![0.0, 0.0],
                        master: 1.0,
                    },
                ),
                node(4, NodeKind::Output),
            ],
            connections: vec![edge(1, 3, 0), edge(2, 3, 1), edge(3, 4, 0)],
        };
        let mut plan = description.compile(48_000.0, 128).unwrap();
        let input = [1.0; 128];
        let settle = |plan: &mut ExecutionPlan| {
            let mut output = [Vec::new(), Vec::new()];
            for _ in 0..128 {
                output = process(plan, &input, &input);
            }
            output[0][127]
        };
        let independent = settle(&mut plan);
        assert!(
            (independent - (0.25 + 0.75 * 0.25) * std::f32::consts::FRAC_1_SQRT_2).abs() < 1e-5
        );
        assert!(plan.set_parameter(3, 65, 0.0));
        assert!(plan.set_parameter(3, 66, 1.0));
        let base = settle(&mut plan);
        assert!(
            (base - std::f32::consts::FRAC_1_SQRT_2).abs() < 5e-5,
            "base {base}"
        );
        assert!(plan.set_parameter(3, 65, 1.0));
        let additive = settle(&mut plan);
        assert!((additive - 0.25 * std::f32::consts::FRAC_1_SQRT_2).abs() < 5e-5);
        assert!(plan.set_parameter(3, 1, 0.4));
        assert!(plan.set_parameter(3, 2, 0.6));
        assert!((settle(&mut plan) - additive).abs() < 5e-5);
        assert!(plan.set_parameter(3, 66, 0.0));
        assert!(
            (settle(&mut plan) - (0.4 + 0.6 * 0.25) * std::f32::consts::FRAC_1_SQRT_2).abs() < 5e-5
        );
        assert!(!plan.set_parameter(3, 67, 0.5));
    }

    #[test]
    fn main_voice_bank_renders_timed_chord_and_releases_one_note() {
        let description = GraphDescription {
            nodes: vec![
                node(1, NodeKind::MainVoiceBank { fft_order: 9 }),
                node(2, NodeKind::Output),
            ],
            connections: vec![edge(1, 2, 0)],
        };
        let mut plan = description.compile(8_000.0, 128).unwrap();
        assert!(plan.load_sample_stereo(1, vec![0.5; 8_000 * 2], 8_000.0));
        assert!(plan.set_parameter(1, 1, 1.0));
        assert!(plan.set_parameter(1, 11, 0.001));
        assert!(plan.set_parameter(1, 14, 0.001));
        let silence = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        let events = [
            TimedEvent {
                offset: 10,
                node: 1,
                kind: EventKind::NoteOn {
                    channel: 0,
                    note: 60,
                    velocity: 100,
                },
            },
            TimedEvent {
                offset: 32,
                node: 1,
                kind: EventKind::NoteOn {
                    channel: 0,
                    note: 67,
                    velocity: 100,
                },
            },
            TimedEvent {
                offset: 64,
                node: 1,
                kind: EventKind::NoteOff {
                    channel: 0,
                    note: 60,
                },
            },
        ];
        plan.process_with_events([&silence, &silence], [&mut left, &mut right], &events)
            .unwrap();
        assert!(left[..10].iter().all(|value| *value == 0.0));
        assert!(left[18..32].iter().any(|value| *value > 0.01));
        assert!(left[40] > left[25]);
        assert_eq!(plan.node_meter(1, 0), Some(1.0));
        assert!(left[100] > 0.01);
        assert_eq!(left, right);
    }

    #[test]
    fn note_events_take_effect_at_sample_offsets() {
        let description = GraphDescription {
            nodes: vec![node(1, NodeKind::VoiceSynth), node(2, NodeKind::Output)],
            connections: vec![edge(1, 2, 0)],
        };
        let mut plan = description.compile(48_000.0, 128).unwrap();
        plan.set_parameter(1, 1, 0.001);
        plan.set_parameter(1, 4, 0.001);
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        let input = [0.0; 128];
        let events = [
            TimedEvent {
                offset: 10,
                node: 1,
                kind: EventKind::NoteOn {
                    channel: 0,
                    note: 69,
                    velocity: 127,
                },
            },
            TimedEvent {
                offset: 40,
                node: 1,
                kind: EventKind::NoteOff {
                    channel: 0,
                    note: 69,
                },
            },
        ];
        plan.process_with_events([&input, &input], [&mut left, &mut right], &events)
            .unwrap();
        assert!(left[..10].iter().all(|value| *value == 0.0));
        assert_eq!(left[10], 0.0); // phase and envelope both start at zero
        assert!(left[12..40].iter().any(|value| value.abs() > 0.001));
        assert!(left[90..].iter().all(|value| *value == 0.0));
        assert_eq!(left, right);

        let invalid = [TimedEvent {
            offset: 128,
            node: 1,
            kind: EventKind::AllNotesOff,
        }];
        assert_eq!(
            plan.process_with_events([&input, &input], [&mut left, &mut right], &invalid),
            Err(EventError::OffsetOutOfRange)
        );
    }

    #[test]
    fn typed_midi_chain_matches_direct_timed_voice_events_and_held_remap() {
        let routed = GraphDescription {
            nodes: vec![
                node(1, NodeKind::MidiInput),
                node(2, NodeKind::MidiTranspose { semitones: 7.0 }),
                node(3, NodeKind::VoiceSynth),
                node(4, NodeKind::Output),
            ],
            connections: vec![edge(1, 2, 0), edge(2, 3, 0), edge(3, 4, 0)],
        };
        let direct = GraphDescription {
            nodes: vec![node(3, NodeKind::VoiceSynth), node(4, NodeKind::Output)],
            connections: vec![edge(3, 4, 0)],
        };
        let mut routed = routed.compile(48_000.0, 128).unwrap();
        let mut direct = direct.compile(48_000.0, 128).unwrap();
        let silence = [0.0; 128];
        let mut routed_audio = [0.0; 128];
        let mut routed_right = [0.0; 128];
        let mut direct_audio = [0.0; 128];
        let mut direct_right = [0.0; 128];
        for (plan, target, note, left, right) in [
            (&mut routed, 1, 60, &mut routed_audio, &mut routed_right),
            (&mut direct, 3, 67, &mut direct_audio, &mut direct_right),
        ] {
            plan.process_with_events(
                [&silence, &silence],
                [left, right],
                &[TimedEvent {
                    offset: 10,
                    node: target,
                    kind: EventKind::NoteOn {
                        channel: 0,
                        note,
                        velocity: 100,
                    },
                }],
            )
            .unwrap();
        }
        assert_eq!(routed_audio, direct_audio);
        assert_eq!(routed_right, direct_right);

        assert!(routed.set_parameter(2, 0, 12.0));
        let remap = [
            TimedEvent {
                offset: 0,
                node: 3,
                kind: EventKind::NoteOff {
                    channel: 0,
                    note: 67,
                },
            },
            TimedEvent {
                offset: 0,
                node: 3,
                kind: EventKind::NoteOn {
                    channel: 0,
                    note: 72,
                    velocity: 100,
                },
            },
        ];
        direct
            .process_with_events(
                [&silence, &silence],
                [&mut direct_audio, &mut direct_right],
                &remap,
            )
            .unwrap();
        routed.process([&silence, &silence], [&mut routed_audio, &mut routed_right]);
        assert_eq!(routed_audio, direct_audio);

        let wrong_type = GraphDescription {
            nodes: vec![node(1, NodeKind::MidiInput), node(2, NodeKind::Output)],
            connections: vec![edge(1, 2, 0)],
        };
        assert!(matches!(
            wrong_type.compile(48_000.0, 128),
            Err(GraphError::SignalTypeMismatch(1, 2, 0))
        ));
    }

    #[test]
    fn arpeggiator_deadlines_and_audio_do_not_depend_on_block_size() {
        fn run(block: usize) -> (Vec<f32>, Vec<(usize, EventKind)>) {
            let graph = GraphDescription {
                nodes: vec![
                    node(1, NodeKind::MidiInput),
                    node(
                        2,
                        NodeKind::MidiArpeggiator {
                            rate: 8.0,
                            mode: 0.0,
                        },
                    ),
                    node(3, NodeKind::VoiceSynth),
                    node(4, NodeKind::Output),
                ],
                connections: vec![edge(1, 2, 0), edge(2, 3, 0), edge(3, 4, 0)],
            };
            let mut plan = graph.compile(48_000.0, block).unwrap();
            let silence = vec![0.0; block];
            let mut audio = Vec::with_capacity(12_288);
            let mut trace = Vec::new();
            let mut last_sequence = 0;
            for start in (0..12_288).step_by(block) {
                let mut events = Vec::new();
                for (frame, kind) in [
                    (
                        0,
                        EventKind::NoteOn {
                            channel: 0,
                            note: 60,
                            velocity: 90,
                        },
                    ),
                    (
                        480,
                        EventKind::NoteOn {
                            channel: 0,
                            note: 64,
                            velocity: 100,
                        },
                    ),
                    (9500, EventKind::AllNotesOff),
                ] {
                    if (start..start + block).contains(&frame) {
                        events.push(TimedEvent {
                            offset: frame - start,
                            node: 1,
                            kind,
                        });
                    }
                }
                let mut left = vec![0.0; block];
                let mut right = vec![0.0; block];
                plan.process_with_events([&silence, &silence], [&mut left, &mut right], &events)
                    .unwrap();
                audio.extend_from_slice(&left);
                for index in 0..plan.midi_trace_count() {
                    let entry = plan.midi_trace_entry(index).unwrap();
                    if entry.sequence > last_sequence {
                        assert!(
                            entry.offset < block,
                            "trace offset must belong to this block"
                        );
                        trace.push((start + entry.offset, entry.kind));
                        last_sequence = entry.sequence;
                    }
                }
            }
            (audio, trace)
        }
        let expected = vec![
            (
                1440,
                EventKind::NoteOn {
                    channel: 0,
                    note: 60,
                    velocity: 90,
                },
            ),
            (
                5040,
                EventKind::NoteOff {
                    channel: 0,
                    note: 60,
                },
            ),
            (
                7440,
                EventKind::NoteOn {
                    channel: 0,
                    note: 64,
                    velocity: 100,
                },
            ),
            (
                9500,
                EventKind::NoteOff {
                    channel: 0,
                    note: 64,
                },
            ),
        ];
        let (audio, trace) = run(64);
        assert_eq!(trace, expected);
        assert!(audio[1500..4500].iter().any(|sample| sample.abs() > 0.001));
        for block in [128, 256] {
            let (other_audio, other_trace) = run(block);
            assert_eq!(other_trace, expected);
            assert_eq!(other_audio, audio);
        }
    }

    #[test]
    fn midi_trace_distinguishes_suppressed_and_emitted_notes_at_their_offsets() {
        let graph = GraphDescription {
            nodes: vec![
                node(1, NodeKind::MidiInput),
                node(
                    2,
                    NodeKind::MidiNoteFilter {
                        low: 36.0,
                        high: 96.0,
                        mode: 0,
                    },
                ),
                node(3, NodeKind::VoiceSynth),
                node(4, NodeKind::Output),
            ],
            connections: vec![edge(1, 2, 0), edge(2, 3, 0), edge(3, 4, 0)],
        };
        let mut plan = graph.compile(48_000.0, 128).unwrap();
        let silence = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        let events = [
            TimedEvent {
                offset: 7,
                node: 1,
                kind: EventKind::NoteOn {
                    channel: 0,
                    note: 20,
                    velocity: 90,
                },
            },
            TimedEvent {
                offset: 9,
                node: 1,
                kind: EventKind::NoteOn {
                    channel: 0,
                    note: 60,
                    velocity: 100,
                },
            },
        ];
        plan.process_with_events([&silence, &silence], [&mut left, &mut right], &events)
            .unwrap();
        assert_eq!(plan.midi_trace_count(), 2);
        assert_eq!(
            plan.midi_trace_entry(0),
            Some(MidiTraceEntry {
                sequence: 1,
                node: 2,
                offset: 7,
                kind: events[0].kind,
                emitted: false,
            })
        );
        assert_eq!(
            plan.midi_trace_entry(1),
            Some(MidiTraceEntry {
                sequence: 2,
                node: 2,
                offset: 9,
                kind: events[1].kind,
                emitted: true,
            })
        );
        assert!(plan.set_parameter(2, 2, 1.0));
        assert_eq!(
            plan.midi_trace_entry(2).unwrap().kind,
            EventKind::NoteOff {
                channel: 0,
                note: 60
            }
        );
        assert_eq!(
            plan.midi_trace_entry(3).unwrap().kind,
            EventKind::NoteOn {
                channel: 0,
                note: 20,
                velocity: 90
            }
        );
        assert_eq!(plan.midi_trace_entry(4), None);
        for mode in (0..20).map(|index| (index % 2) as f32) {
            assert!(plan.set_parameter(2, 2, mode));
        }
        assert_eq!(plan.midi_trace_count(), MIDI_TRACE_CAPACITY);
        assert_eq!(plan.midi_trace_entry(0).unwrap().sequence, 13);
        assert_eq!(
            plan.midi_trace_entry(MIDI_TRACE_CAPACITY - 1)
                .unwrap()
                .sequence,
            44
        );
    }

    #[test]
    fn oscillator_phase_continues_across_block_boundaries() {
        let description = GraphDescription {
            nodes: vec![
                node(
                    1,
                    NodeKind::Oscillator {
                        frequency: 440.0,
                        amplitude: 0.5,
                        waveform: 0,
                    },
                ),
                node(2, NodeKind::Output),
            ],
            connections: vec![edge(1, 2, 0)],
        };
        let mut whole = description.compile(48_000.0, 128).unwrap();
        let mut split = description.compile(48_000.0, 128).unwrap();
        let silence = [0.0; 128];
        let [expected, _] = process(&mut whole, &silence, &silence);
        let [first, _] = process(&mut split, &silence[..64], &silence[..64]);
        let [second, _] = process(&mut split, &silence[..64], &silence[..64]);
        assert_eq!(expected, [first, second].concat());
    }

    #[test]
    fn control_ports_are_typed_and_modulate_audio_per_sample() {
        let nodes = vec![
            node(1, NodeKind::Constant { value: 1.0 }),
            node(
                2,
                NodeKind::Lfo {
                    waveform: 0,
                    rate: 10.0,
                },
            ),
            node(
                3,
                NodeKind::ModulatedGain {
                    base: 0.5,
                    depth: 0.4,
                },
            ),
            node(4, NodeKind::Output),
        ];
        let wrong = GraphDescription {
            nodes: nodes.clone(),
            connections: vec![edge(2, 4, 0)],
        };
        assert!(matches!(
            wrong.compile(1_000.0, 100),
            Err(GraphError::SignalTypeMismatch(2, 4, 0))
        ));
        let graph = GraphDescription {
            nodes,
            connections: vec![edge(1, 3, 0), edge(2, 3, 1), edge(3, 4, 0)],
        };
        let mut plan = graph.compile(1_000.0, 100).unwrap();
        let input = [0.0; 100];
        let [left, right] = process(&mut plan, &input, &input);
        assert_eq!(left, right);
        assert!((left[0] - 0.5).abs() < 1e-6);
        assert!((left[25] - 0.9).abs() < 1e-5);
        assert!((left[75] - 0.1).abs() < 1e-5);
    }

    #[test]
    fn slew_control_preserves_cv_type_and_changes_modulation_shape() {
        let make_graph = |up, down| GraphDescription {
            nodes: vec![
                node(1, NodeKind::Constant { value: 0.5 }),
                node(
                    2,
                    NodeKind::Lfo {
                        waveform: 2,
                        rate: 20.0,
                    },
                ),
                node(3, NodeKind::SlewControl { up, down }),
                node(
                    4,
                    NodeKind::ModulatedGain {
                        base: 0.5,
                        depth: 0.5,
                    },
                ),
                node(5, NodeKind::Output),
            ],
            connections: vec![edge(1, 4, 0), edge(2, 3, 0), edge(3, 4, 1), edge(4, 5, 0)],
        };
        let mut direct = make_graph(1.0, 1.0).compile(1_000.0, 100).unwrap();
        let mut smoothed = make_graph(12.0, 40.0).compile(1_000.0, 100).unwrap();
        let silence = [0.0; 100];
        let [dry, _] = process(&mut direct, &silence, &silence);
        let [slewed, _] = process(&mut smoothed, &silence, &silence);
        assert!(
            dry.iter()
                .zip(slewed.iter())
                .any(|(a, b)| (a - b).abs() > 0.02)
        );
        let mut invalid = make_graph(12.0, 40.0);
        invalid.connections[1] = edge(1, 3, 0);
        assert!(matches!(
            invalid.compile(1_000.0, 100),
            Err(GraphError::SignalTypeMismatch(1, 3, 0))
        ));
    }

    #[test]
    fn scalar_cv_chain_routes_hold_transform_and_four_input_mix() {
        let graph = GraphDescription {
            nodes: vec![
                node(1, NodeKind::Constant { value: 0.5 }),
                node(
                    2,
                    NodeKind::Lfo {
                        waveform: 1,
                        rate: 5.0,
                    },
                ),
                node(
                    3,
                    NodeKind::Lfo {
                        waveform: 2,
                        rate: 10.0,
                    },
                ),
                node(4, NodeKind::SampleHold { mode: 0 }),
                node(
                    5,
                    NodeKind::AttenuverterBias {
                        amount: -0.5,
                        bias: 0.2,
                    },
                ),
                node(
                    6,
                    NodeKind::CvMix {
                        levels: [0.8, 0.2, 0.0, 0.0],
                        offset: 0.1,
                    },
                ),
                node(
                    7,
                    NodeKind::ModulatedGain {
                        base: 0.5,
                        depth: 0.5,
                    },
                ),
                node(8, NodeKind::Output),
            ],
            connections: vec![
                edge(1, 7, 0),
                edge(2, 4, 0),
                edge(3, 4, 1),
                edge(4, 5, 0),
                edge(5, 6, 0),
                edge(2, 6, 1),
                edge(6, 7, 1),
                edge(7, 8, 0),
            ],
        };
        let mut plan = graph.clone().compile(1_000.0, 100).unwrap();
        let silence = [0.0; 100];
        let [left, right] = process(&mut plan, &silence, &silence);
        assert_eq!(left, right);
        assert!(left.iter().all(|sample| sample.is_finite()));
        assert!(plan.node_meter(4, 0).unwrap().abs() <= 1.0);
        assert!(plan.node_meter(5, 0).unwrap().abs() <= 1.0);
        assert!(plan.node_meter(6, 0).unwrap().abs() <= 1.0);
        assert!((0.0..=2.0).contains(&plan.node_meter(7, 0).unwrap()));
        let mut invalid = graph;
        invalid.connections[3] = edge(1, 5, 0);
        assert!(matches!(
            invalid.compile(1_000.0, 100),
            Err(GraphError::SignalTypeMismatch(1, 5, 0))
        ));
    }

    #[test]
    fn patchable_routes_preserve_kernels_and_recompute_reachability() {
        let graph = GraphDescription {
            nodes: vec![
                node(1, NodeKind::Constant { value: 0.5 }),
                node(
                    2,
                    NodeKind::Lfo {
                        waveform: 0,
                        rate: 2.0,
                    },
                ),
                node(
                    3,
                    NodeKind::AttenuverterBias {
                        amount: 1.0,
                        bias: 0.0,
                    },
                ),
                node(
                    4,
                    NodeKind::ModulatedGain {
                        base: 0.5,
                        depth: 0.5,
                    },
                ),
                node(5, NodeKind::Output),
                node(
                    6,
                    NodeKind::Lfo {
                        waveform: 1,
                        rate: 3.0,
                    },
                ),
            ],
            connections: vec![edge(1, 4, 0), edge(2, 3, 0), edge(3, 4, 1), edge(4, 5, 0)],
        };
        let mut plan = graph.compile_patchable(1_000.0, 100).unwrap();
        assert_eq!(plan.node_count(), 6);
        assert!(!plan.nodes.iter().find(|node| node.id == 6).unwrap().active);
        let silence = [0.0; 100];
        process(&mut plan, &silence, &silence);
        let scaled = plan.node_meter(3, 0).unwrap();
        assert!(plan.set_route(4, 1, None).is_ok());
        assert!(!plan.nodes.iter().find(|node| node.id == 3).unwrap().active);
        assert_eq!(plan.node_meter(3, 0), Some(scaled));
        assert!(plan.set_route(4, 1, Some(6)).is_ok());
        assert!(plan.nodes.iter().find(|node| node.id == 6).unwrap().active);
        assert!(!plan.nodes.iter().find(|node| node.id == 3).unwrap().active);
        assert_eq!(
            plan.set_route(4, 1, Some(1)),
            Err(GraphError::SignalTypeMismatch(1, 4, 1))
        );
        assert_eq!(
            plan.set_route(4, 0, Some(2)),
            Err(GraphError::SignalTypeMismatch(2, 4, 0))
        );
        assert_eq!(plan.set_route(3, 0, Some(3)), Err(GraphError::Cycle));
        let [left, right] = process(&mut plan, &silence, &silence);
        assert_eq!(left, right);
        assert!(left.iter().all(|value| value.is_finite()));
        assert_eq!(plan.node_meter(3, 0), Some(scaled));
        assert_eq!(plan.node_active(3), Some(false));
        assert!(plan.set_route(4, 1, Some(3)).is_ok());
        process(&mut plan, &silence, &silence);
        assert_ne!(plan.node_meter(3, 0), Some(scaled));
        assert_eq!(plan.node_active(3), Some(true));
        let mut fixed = graph.compile(1_000.0, 100).unwrap();
        assert_eq!(
            fixed.set_route(4, 1, Some(2)),
            Err(GraphError::RouteChangeUnavailable)
        );
    }

    #[test]
    fn patchable_ring_audio_route_switches_modulator_and_resumes_phase() {
        let graph = GraphDescription {
            nodes: vec![
                node(1, NodeKind::InputRaw),
                node(
                    2,
                    NodeKind::RingModulator {
                        params: [180.0, 1.0, 1.0, 0.0, 1.0],
                    },
                ),
                node(3, NodeKind::Output),
                node(
                    4,
                    NodeKind::Lfo {
                        waveform: 0,
                        rate: 2.0,
                    },
                ),
            ],
            connections: vec![edge(1, 2, 0), edge(2, 3, 0)],
        };
        let mut switched = graph.clone().compile_patchable(48_000.0, 128).unwrap();
        let mut internal = graph.compile_patchable(48_000.0, 128).unwrap();
        let carrier = [0.5; 128];
        let first = process(&mut switched, &carrier, &carrier);
        assert_eq!(first, process(&mut internal, &carrier, &carrier));
        assert!(switched.set_route(2, 1, Some(1)).is_ok());
        assert_eq!(
            switched.set_route(2, 1, Some(4)),
            Err(GraphError::SignalTypeMismatch(4, 2, 1))
        );
        assert_eq!(switched.set_route(2, 1, Some(2)), Err(GraphError::Cycle));
        let [left, right] = process(&mut switched, &carrier, &carrier);
        assert!(
            left.iter()
                .chain(right.iter())
                .all(|sample| (*sample - 0.25).abs() < 1e-6)
        );
        assert!(switched.set_route(2, 1, None).is_ok());
        assert_eq!(
            process(&mut switched, &carrier, &carrier),
            process(&mut internal, &carrier, &carrier)
        );
    }

    #[test]
    fn envelope_control_routes_audio_detector_to_cv_without_host_messages() {
        let nodes = vec![
            node(1, NodeKind::InputRaw),
            node(
                2,
                NodeKind::EnvelopeControl {
                    attack_ms: 0.1,
                    release_ms: 20.0,
                    sensitivity: 1.0,
                    highpass_hz: 5.0,
                    mode: 0,
                },
            ),
            node(
                3,
                NodeKind::ModulatedGain {
                    base: 1.0,
                    depth: -1.0,
                },
            ),
            node(4, NodeKind::Output),
        ];
        let description = GraphDescription {
            nodes: nodes.clone(),
            connections: vec![edge(1, 2, 0), edge(1, 3, 0), edge(2, 3, 1), edge(3, 4, 0)],
        };
        let mut plan = description.compile(48_000.0, 256).unwrap();
        let [left, right] = process(&mut plan, &[0.6; 256], &[0.4; 256]);
        assert!(left[255] < left[0]);
        assert!(right[255] < right[0]);
        assert!(plan.node_meter(2, 0).unwrap() > 0.0);
        let bad = GraphDescription {
            nodes,
            connections: vec![edge(1, 2, 0), edge(2, 4, 0)],
        };
        assert_eq!(
            bad.compile(48_000.0, 256).err(),
            Some(GraphError::SignalTypeMismatch(2, 4, 0))
        );
    }

    #[test]
    fn rejects_cycles_and_duplicate_input_ports() {
        let nodes = vec![
            node(1, NodeKind::Gain { gain: 1.0 }),
            node(2, NodeKind::Gain { gain: 1.0 }),
            node(3, NodeKind::Output),
        ];
        let cyclic = GraphDescription {
            nodes: nodes.clone(),
            connections: vec![edge(1, 2, 0), edge(2, 1, 0), edge(2, 3, 0)],
        };
        assert!(matches!(
            cyclic.compile(48_000.0, 128),
            Err(GraphError::Cycle)
        ));
        let double = GraphDescription {
            nodes,
            connections: vec![edge(1, 3, 0), edge(2, 3, 0)],
        };
        assert!(matches!(
            double.compile(48_000.0, 128),
            Err(GraphError::OccupiedPort(3, 0))
        ));
        let invalid_output = GraphDescription {
            nodes: vec![
                node(1, NodeKind::Output),
                node(2, NodeKind::Gain { gain: 1.0 }),
            ],
            connections: vec![edge(1, 2, 0)],
        };
        assert!(matches!(
            invalid_output.compile(48_000.0, 128),
            Err(GraphError::OutputAsSource(1))
        ));
    }
}
