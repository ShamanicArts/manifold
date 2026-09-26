//! Editable graph descriptions compile into a fully owned, preallocated execution plan.
//! Routing is explicit: a graph without a route to Output emits silence.

use crate::Filter;
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
use crate::lfo::Lfo;
use crate::limiter::{self, Limiter};
use crate::loop_capture::LoopCapture;
use crate::noise::NoiseGenerator;
use crate::oscillator::Oscillator;
use crate::phaser::Phaser;
use crate::sample_instrument::SampleInstrument;
use crate::sample_region::SampleRegion;
use crate::slew_limiter::SlewLimiter;
use crate::spectrum_analyzer::SpectrumAnalyzer;
use crate::stereo_delay::StereoDelay;
use crate::voice::VoiceSynth;
use std::collections::{HashMap, VecDeque};

pub type NodeId = u64;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SignalKind {
    Audio,
    Control,
}

#[derive(Clone, Debug)]
pub enum NodeKind {
    InputRaw,
    InputMonitor {
        gain: f32,
    },
    Constant {
        value: f32,
    },
    Gain {
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
    EffectSlot {
        selected: u32,
        mix: f32,
        params: [f32; 5],
    },
    LoopCapture {
        capacity_seconds: f32,
        mix: f32,
    },
    SampleRegion,
    SampleInstrument,
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
    Output,
}

impl NodeKind {
    fn input_count(&self) -> usize {
        match self {
            Self::InputRaw
            | Self::InputMonitor { .. }
            | Self::Constant { .. }
            | Self::VoiceSynth
            | Self::SampleRegion
            | Self::SampleInstrument
            | Self::Oscillator { .. } => 0,
            Self::NoiseGenerator { .. } | Self::Lfo { .. } => 0,
            Self::Sum2 { .. }
            | Self::LinearBlend { .. }
            | Self::Crossfader { .. }
            | Self::ModulatedGain { .. }
            | Self::ModulatedSvf { .. }
            | Self::SampleHold { .. } => 2,
            Self::CvMix { .. } => 4,
            Self::Mixer { inputs, .. } => *inputs,
            Self::Gain { .. }
            | Self::Svf
            | Self::SlewAudio { .. }
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
            | Self::EffectSlot { .. }
            | Self::LoopCapture { .. }
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
            Self::SlewControl { .. }
                | Self::AttenuverterBias { .. }
                | Self::SampleHold { .. }
                | Self::CvMix { .. }
        ) || matches!(self, Self::ModulatedGain { .. } | Self::ModulatedSvf { .. }) && port == 1
        {
            SignalKind::Control
        } else {
            SignalKind::Audio
        }
    }

    fn valid(&self) -> bool {
        match self {
            Self::InputMonitor { gain } | Self::Gain { gain } => gain.is_finite(),
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
            Self::NoiseGenerator { level, color } => level.is_finite() && color.is_finite(),
            Self::Lfo { waveform, rate } => *waveform <= 2 && rate.is_finite(),
            Self::ModulatedGain { base, depth } => base.is_finite() && depth.is_finite(),
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
            Self::EffectSlot {
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
    InputRaw,
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
    EffectSlot(EffectSlot),
    LoopCapture(LoopCapture),
    SampleRegion(SampleRegion),
    SampleInstrument(SampleInstrument),
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
    Output,
}

struct CrossfaderState {
    current: [f32; 3],
    target: [f32; 3],
    smoothing: f32,
}

struct MixerState {
    target_gains: Vec<f32>,
    gains: Vec<f32>,
    target_pans: Vec<f32>,
    pans: Vec<f32>,
    target_master: f32,
    master: f32,
    smoothing: f32,
}

impl Kernel {
    fn from_kind(kind: &NodeKind, sample_rate: f32, max_frames: usize) -> Self {
        match kind {
            NodeKind::InputRaw => Self::InputRaw,
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
                    target_gains: gains.clone(),
                    gains,
                    target_pans: pans.clone(),
                    pans,
                    target_master: master,
                    master,
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
            NodeKind::LoopCapture {
                capacity_seconds,
                mix,
            } => Self::LoopCapture(LoopCapture::new(sample_rate, *capacity_seconds, *mix)),
            NodeKind::SampleRegion => Self::SampleRegion(SampleRegion::new(sample_rate)),
            NodeKind::SampleInstrument => {
                Self::SampleInstrument(SampleInstrument::new(sample_rate))
            }
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
                state.target_gains[id as usize - 1] = value.clamp(0.0, 2.0)
            }
            (Self::Mixer(state), id @ 33..=64) if (id as usize - 32) <= state.pans.len() => {
                state.target_pans[id as usize - 33] = value.clamp(-1.0, 1.0)
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
            (Self::EffectSlot(slot), id) => return slot.set_parameter(id, value),
            (Self::LoopCapture(loop_node), id) => return loop_node.set_parameter(id, value),
            (Self::SampleRegion(player), id) => return player.set_parameter(id, value),
            (Self::SampleInstrument(instrument), id) => return instrument.set_parameter(id, value),
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
            _ => false,
        }
    }

    fn accepts_events(&self) -> bool {
        matches!(
            self,
            Self::VoiceSynth(_) | Self::SampleRegion(_) | Self::SampleInstrument(_)
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
    scratch: Vec<f32>,
}

pub struct ExecutionPlan {
    nodes: Vec<CompiledNode>,
    output_index: usize,
    max_frames: usize,
    silence: Vec<f32>,
    patchable: bool,
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

        // Keep only nodes that can reach Output. Unused sources cost nothing per block.
        let mut live = vec![false; self.nodes.len()];
        let mut stack = vec![output];
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
                scratch: vec![0.0; max_frames * 2],
            });
        }
        Ok(ExecutionPlan {
            output_index: old_to_new[output],
            nodes,
            max_frames,
            silence: vec![0.0; max_frames * 2],
            patchable,
        })
    }
}

impl ExecutionPlan {
    pub fn node_count(&self) -> usize {
        self.nodes.len()
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
        if expected != SignalKind::Control {
            return Err(GraphError::RouteChangeUnavailable);
        }
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
                Kernel::EnvelopeFollower(follower) if band == 0 => Some(follower.meter()),
                Kernel::EnvelopeControl(follower) if band == 0 => Some(follower.meter()),
                Kernel::Compressor(compressor) if band == 0 => Some(compressor.gain_reduction_db()),
                Kernel::Limiter(limiter) if band == 0 => Some(limiter.gain_reduction_db()),
                Kernel::SampleRegion(player) => player.meter(band),
                Kernel::SampleInstrument(instrument) => instrument.meter(band),
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

    pub fn capture_length(&self, node: NodeId) -> Option<usize> {
        self.nodes
            .iter()
            .find(|entry| entry.id == node)
            .and_then(|entry| match &entry.kernel {
                Kernel::LoopCapture(loop_node) => loop_node.capture_length(),
                _ => None,
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

    pub fn set_parameter(&mut self, node: NodeId, parameter: u32, value: f32) -> bool {
        self.nodes
            .iter_mut()
            .find(|entry| entry.id == node)
            .is_some_and(|entry| entry.kernel.set_parameter(parameter, value))
    }

    /// Replace decoded sample storage between process calls. No decoding or allocation in process.
    pub fn load_sample_stereo(&mut self, node: NodeId, stereo: Vec<f32>, source_rate: f32) -> bool {
        self.nodes
            .iter_mut()
            .find(|entry| entry.id == node)
            .is_some_and(|entry| match &mut entry.kernel {
                Kernel::SampleRegion(player) => player.load_stereo(stereo, source_rate),
                Kernel::SampleInstrument(instrument) => instrument.load_stereo(stereo, source_rate),
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
        let frames = input[0].len();
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
        let [left_in, right_in] = input;
        let [left_out, right_out] = output;
        let mut start = 0;
        let mut left_out = left_out;
        let mut right_out = right_out;
        for event in events {
            let count = event.offset - start;
            if count > 0 {
                let (segment_left, rest_left) = left_out.split_at_mut(count);
                let (segment_right, rest_right) = right_out.split_at_mut(count);
                self.process(
                    [
                        &left_in[start..event.offset],
                        &right_in[start..event.offset],
                    ],
                    [segment_left, segment_right],
                );
                left_out = rest_left;
                right_out = rest_right;
            }
            self.nodes
                .iter_mut()
                .find(|node| node.id == event.node)
                .unwrap()
                .kernel
                .send_event(event.kind);
            start = event.offset;
        }
        self.process(
            [&left_in[start..], &right_in[start..]],
            [left_out, right_out],
        );
        Ok(())
    }

    /// `frames` may be smaller than prepared capacity. Buffers are planar stereo.
    pub fn process(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
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
                Kernel::InputRaw => {
                    left.copy_from_slice(input[0]);
                    right.copy_from_slice(input[1]);
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
                    for frame in 0..frames {
                        let value = oscillator.process_sample();
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
        assert!(!plan.set_parameter(3, 65, 0.0));

        let mut invalid = description;
        invalid.connections.push(edge(1, 3, 32));
        assert!(matches!(
            invalid.compile(48_000.0, 4),
            Err(GraphError::InvalidPort(3, 32))
        ));
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
            plan.set_route(4, 0, Some(1)),
            Err(GraphError::RouteChangeUnavailable)
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
