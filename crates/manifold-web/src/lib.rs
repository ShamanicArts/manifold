//! Thin, single-instance AudioWorklet ABI. Graph and buffers are allocated only at prepare.

use manifold_core::chorus;
use manifold_core::compressor;
use manifold_core::effect_slot;
use manifold_core::events::{EventKind, TimedEvent};
use manifold_core::graph::{Connection, ExecutionPlan, GraphDescription, NodeKind, NodeSpec};
use manifold_core::limiter;
use manifold_core::phaser;
use manifold_core::sample_analysis::{PEAK_BINS, SampleSummary, analyze_stereo};
use manifold_core::sample_region::{MAX_SAMPLE_FRAMES, MAX_SAMPLE_SECONDS};
use manifold_core::stereo_delay;
use std::cell::RefCell;

struct WorkletEngine {
    plan: ExecutionPlan,
    capacity: usize,
    input: Vec<f32>,
    output: Vec<f32>,
    events: Vec<TimedEvent>,
    sample_upload: Option<(u32, f32, Vec<f32>)>,
}

struct AnalysisJob {
    source_rate: f32,
    stereo: Vec<f32>,
    result: Option<SampleSummary>,
}

struct GraphBuilder {
    description: GraphDescription,
    expected_nodes: usize,
    expected_connections: usize,
    patchable: bool,
}

thread_local! {
    static ENGINE: RefCell<Option<WorkletEngine>> = const { RefCell::new(None) };
    static GRAPH_BUILDER: RefCell<Option<GraphBuilder>> = const { RefCell::new(None) };
    static ANALYSIS: RefCell<Option<AnalysisJob>> = const { RefCell::new(None) };
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_version() -> u32 {
    2
}

/// Background-worker sample analysis ABI. This instance must not be the live audio worklet.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_analysis_begin(frames: u32, source_rate: f32) -> u32 {
    if frames == 0
        || frames as usize > MAX_SAMPLE_FRAMES
        || !source_rate.is_finite()
        || !(8_000.0..=384_000.0).contains(&source_rate)
        || frames as usize > (source_rate as usize).saturating_mul(MAX_SAMPLE_SECONDS)
    {
        return 0;
    }
    ANALYSIS.with(|slot| {
        *slot.borrow_mut() = Some(AnalysisJob {
            source_rate,
            stereo: vec![0.0; frames as usize * 2],
            result: None,
        });
    });
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_analysis_ptr() -> *mut f32 {
    ANALYSIS.with(|slot| {
        slot.borrow_mut()
            .as_mut()
            .map_or(std::ptr::null_mut(), |job| job.stereo.as_mut_ptr())
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_analysis_run() -> u32 {
    ANALYSIS.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |job| {
            job.result = analyze_stereo(&job.stereo, job.source_rate);
            job.stereo = Vec::new();
            u32::from(job.result.is_some())
        })
    })
}

/// Peak, RMS, pitch Hz (zero if unknown), confidence; NaN for invalid metric.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_analysis_metric(id: u32) -> f32 {
    ANALYSIS.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|job| job.result.as_ref())
            .map_or(f32::NAN, |result| match id {
                0 => result.peak,
                1 => result.rms,
                2 => result.pitch_hz.unwrap_or(0.0),
                3 => result.pitch_confidence,
                _ => f32::NAN,
            })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_analysis_peaks_ptr() -> *const f32 {
    ANALYSIS.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|job| job.result.as_ref())
            .map_or(std::ptr::null(), |result| result.peaks.as_ptr())
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_analysis_peaks_len() -> u32 {
    (PEAK_BINS * 2) as u32
}

/// Prepare-time graph ABI. Kind codes are versioned with manifold_version().
#[unsafe(no_mangle)]
pub extern "C" fn manifold_graph_begin(node_count: u32, connection_count: u32) -> u32 {
    if !(1..=64).contains(&node_count) || connection_count > 256 {
        return 0;
    }
    GRAPH_BUILDER.with(|slot| {
        *slot.borrow_mut() = Some(GraphBuilder {
            description: GraphDescription {
                nodes: Vec::with_capacity(node_count as usize),
                connections: Vec::with_capacity(connection_count as usize),
            },
            expected_nodes: node_count as usize,
            expected_connections: connection_count as usize,
            patchable: false,
        });
    });
    1
}

/// Retain prepared kernels for bounded, allocation-free route edits after start.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_graph_patchable(enabled: u32) -> u32 {
    GRAPH_BUILDER.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(builder) = slot.as_mut() else {
            return 0;
        };
        builder.patchable = enabled != 0;
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_graph_node(id: u32, kind: u32, a: f32, b: f32) -> u32 {
    let kind = match kind {
        0 => NodeKind::InputRaw,
        1 => NodeKind::InputMonitor { gain: a },
        2 => NodeKind::Constant { value: a },
        3 => NodeKind::Gain { gain: a },
        4 => NodeKind::Sum2 {
            gain_a: a,
            gain_b: b,
        },
        5 => NodeKind::LinearBlend { mix: a },
        6 => NodeKind::Svf,
        7 => NodeKind::Output,
        8 => NodeKind::Crossfader {
            position: a,
            curve: b,
            mix: 1.0,
        },
        9 if a.is_finite() && a.fract() == 0.0 && (1.0..=32.0).contains(&a) => NodeKind::Mixer {
            inputs: a as usize,
            gains: vec![1.0; a as usize],
            pans: vec![0.0; a as usize],
            master: b,
        },
        10 => NodeKind::VoiceSynth,
        11 => NodeKind::Oscillator {
            frequency: a,
            amplitude: b,
            waveform: 0,
        },
        12 => NodeKind::AdsrEnvelope,
        13 => NodeKind::NoiseGenerator { level: a, color: b },
        14 => NodeKind::Lfo {
            waveform: 0,
            rate: a,
        },
        15 => NodeKind::ModulatedGain { base: a, depth: b },
        16 => NodeKind::ModulatedSvf { depth_hz: a },
        17 => NodeKind::Distortion {
            drive: a,
            mix: b,
            output: 0.8,
        },
        18 => {
            let mut params = stereo_delay::defaults();
            params[0] = a;
            params[1] = b;
            NodeKind::StereoDelay { params }
        }
        19 | 52 => {
            let Some(selected) = effect_slot::supported_type(a) else {
                return 0;
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
            if kind == 52 {
                NodeKind::EffectSlotLegacy {
                    selected,
                    mix: b,
                    params,
                }
            } else {
                NodeKind::EffectSlot {
                    selected,
                    mix: b,
                    params,
                }
            }
        }
        20 => NodeKind::LoopCapture {
            capacity_seconds: a,
            mix: b,
        },
        21 => NodeKind::SpectrumAnalyzer {
            sensitivity: a,
            smoothing: b,
            floor_db: -72.0,
        },
        22 => NodeKind::EnvelopeFollower {
            attack_ms: a,
            release_ms: b,
            sensitivity: 1.0,
            highpass_hz: 80.0,
            mode: 0,
        },
        23 => NodeKind::EnvelopeControl {
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
            NodeKind::Compressor { params }
        }
        25 => {
            let mut params = limiter::defaults();
            params[0] = a;
            params[1] = b;
            NodeKind::Limiter { params }
        }
        26 => NodeKind::SampleRegion,
        27 => NodeKind::SampleInstrument,
        28 => NodeKind::FftSpectrum {
            smoothing: a,
            floor_db: b,
        },
        29 => NodeKind::SlewAudio { up: a, down: b },
        30 => NodeKind::SlewControl { up: a, down: b },
        31 => NodeKind::AttenuverterBias { amount: a, bias: b },
        32 => NodeKind::SampleHold {
            mode: a.round().clamp(0.0, 2.0) as u32,
        },
        33 => NodeKind::CvMix {
            levels: [a, b, 0.0, 0.0],
            offset: 0.0,
        },
        34 => {
            let mut params = phaser::defaults();
            params[0] = a;
            params[1] = b;
            NodeKind::Phaser { params }
        }
        35 => {
            let mut params = chorus::defaults();
            params[0] = a;
            params[1] = b;
            NodeKind::Chorus { params }
        }
        36 => NodeKind::Eq8 {
            params: manifold_core::eq8::defaults(),
        },
        37 => NodeKind::WaveShaper {
            params: manifold_core::waveshaper::DEFAULTS,
        },
        38 => NodeKind::StereoWidener {
            params: manifold_core::stereo_widener::DEFAULTS,
        },
        39 => NodeKind::LegacyFilter {
            params: manifold_core::legacy_filter::DEFAULTS,
        },
        40 => NodeKind::Reverb {
            params: manifold_core::reverb::DEFAULTS,
        },
        41 => NodeKind::MultitapDelay {
            params: manifold_core::multitap_delay::DEFAULTS,
        },
        42 => NodeKind::RingModulator {
            params: manifold_core::ring_modulator::DEFAULTS,
        },
        43 => NodeKind::TransientShaper {
            params: manifold_core::transient_shaper::DEFAULTS,
        },
        44 => NodeKind::BitCrusher {
            params: manifold_core::bitcrusher::DEFAULTS,
        },
        45 => NodeKind::LegacyEq {
            params: manifold_core::legacy_eq::DEFAULTS,
        },
        46 => NodeKind::FormantFilter {
            params: manifold_core::formant_filter::DEFAULTS,
        },
        47 => NodeKind::ReverseDelay {
            params: manifold_core::reverse_delay::DEFAULTS,
        },
        48 => NodeKind::Stutter {
            params: manifold_core::stutter::DEFAULTS,
        },
        49 => NodeKind::PitchShifter {
            params: manifold_core::pitch_shifter::DEFAULTS,
        },
        50 => NodeKind::Shimmer {
            params: manifold_core::shimmer::DEFAULTS,
        },
        51 => NodeKind::Granulator {
            params: manifold_core::granulator::DEFAULTS,
        },
        _ => return 0,
    };
    GRAPH_BUILDER.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(builder) = slot.as_mut() else {
            return 0;
        };
        if builder.description.nodes.len() >= builder.expected_nodes {
            return 0;
        }
        builder.description.nodes.push(NodeSpec {
            id: id.into(),
            kind,
        });
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_graph_edge(from: u32, to: u32, input_port: u32) -> u32 {
    GRAPH_BUILDER.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(builder) = slot.as_mut() else {
            return 0;
        };
        if builder.description.connections.len() >= builder.expected_connections {
            return 0;
        }
        builder.description.connections.push(Connection {
            from: from.into(),
            to: to.into(),
            input_port: input_port as usize,
        });
        1
    })
}

/// Set a node's authored value before graph compilation, without a smoothing ramp.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_graph_initial_parameter(
    node_id: u32,
    parameter: u32,
    value: f32,
) -> u32 {
    if !value.is_finite() {
        return 0;
    }
    GRAPH_BUILDER.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(builder) = slot.as_mut() else {
            return 0;
        };
        let Some(node) = builder
            .description
            .nodes
            .iter_mut()
            .find(|node| node.id == node_id.into())
        else {
            return 0;
        };
        match (&mut node.kind, parameter) {
            (NodeKind::Crossfader { position, .. }, 0) => *position = value.clamp(-1.0, 1.0),
            (NodeKind::Crossfader { curve, .. }, 1) => *curve = value.clamp(0.0, 1.0),
            (NodeKind::Crossfader { mix, .. }, 2) => *mix = value.clamp(0.0, 1.0),
            (NodeKind::Mixer { master, .. }, 0) => *master = value.clamp(0.0, 2.0),
            (NodeKind::Mixer { gains, .. }, id @ 1..=32) if (id as usize) <= gains.len() => {
                gains[id as usize - 1] = value.clamp(0.0, 2.0)
            }
            (NodeKind::Mixer { pans, .. }, id @ 33..=64) if (id as usize - 32) <= pans.len() => {
                pans[id as usize - 33] = value.clamp(-1.0, 1.0)
            }
            (NodeKind::Oscillator { waveform, .. }, 0) => {
                *waveform = value.round().clamp(0.0, 4.0) as u32
            }
            (NodeKind::Oscillator { frequency, .. }, 1) => *frequency = value.clamp(1.0, 20_000.0),
            (NodeKind::Oscillator { amplitude, .. }, 2) => *amplitude = value.clamp(0.0, 1.0),
            (NodeKind::NoiseGenerator { level, .. }, 0) => *level = value.clamp(0.0, 1.0),
            (NodeKind::NoiseGenerator { color, .. }, 1) => *color = value.clamp(0.0, 1.0),
            (NodeKind::Lfo { waveform, .. }, 0) => *waveform = value.round().clamp(0.0, 2.0) as u32,
            (NodeKind::Lfo { rate, .. }, 1) => *rate = value.clamp(0.05, 20.0),
            (NodeKind::ModulatedGain { base, .. }, 0) => *base = value.clamp(0.0, 2.0),
            (NodeKind::ModulatedGain { depth, .. }, 1) => *depth = value.clamp(-2.0, 2.0),
            (NodeKind::ModulatedSvf { depth_hz }, 3) => {
                *depth_hz = value.clamp(-20_000.0, 20_000.0)
            }
            (NodeKind::Distortion { drive, .. }, 0) => *drive = value.clamp(1.0, 30.0),
            (NodeKind::Distortion { mix, .. }, 1) => *mix = value.clamp(0.0, 1.0),
            (NodeKind::Distortion { output, .. }, 2) => *output = value.clamp(0.0, 2.0),
            (NodeKind::StereoDelay { params }, id) => {
                if !stereo_delay::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::Phaser { params }, id) => {
                if !phaser::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::Chorus { params }, id) => {
                if !chorus::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::Eq8 { params }, id @ 0..=41) => params[id as usize] = value,
            (NodeKind::WaveShaper { params }, id @ 0..=7) => params[id as usize] = value,
            (NodeKind::StereoWidener { params }, id @ 0..=2) => params[id as usize] = value,
            (NodeKind::LegacyFilter { params }, id @ 0..=2) => params[id as usize] = value,
            (NodeKind::Reverb { params }, id @ 0..=4) => params[id as usize] = value,
            (NodeKind::MultitapDelay { params }, id @ 0..=26) => {
                if !manifold_core::multitap_delay::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::RingModulator { params }, id @ 0..=4) => {
                if !manifold_core::ring_modulator::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::TransientShaper { params }, id @ 0..=3) => {
                if !manifold_core::transient_shaper::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::BitCrusher { params }, id @ 0..=4) => {
                if !manifold_core::bitcrusher::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::LegacyEq { params }, id @ 0..=8) => {
                if !manifold_core::legacy_eq::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::FormantFilter { params }, id @ 0..=4) => {
                if !manifold_core::formant_filter::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::ReverseDelay { params }, id @ 0..=3) => {
                if !manifold_core::reverse_delay::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::Stutter { params }, id @ 0..=7) => {
                if !manifold_core::stutter::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::PitchShifter { params }, id @ 0..=3) => {
                if !manifold_core::pitch_shifter::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::Shimmer { params }, id @ 0..=5) => {
                if !manifold_core::shimmer::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::Granulator { params }, id @ 0..=10) => {
                if !manifold_core::granulator::set_value(params, id, value) {
                    return 0;
                }
            }
            (
                NodeKind::EffectSlot { selected, .. } | NodeKind::EffectSlotLegacy { selected, .. },
                0,
            ) => {
                let Some(kind) = effect_slot::supported_type(value) else {
                    return 0;
                };
                *selected = kind;
            }
            (NodeKind::EffectSlot { mix, .. } | NodeKind::EffectSlotLegacy { mix, .. }, 1) => {
                *mix = value.clamp(0.0, 1.0)
            }
            (
                NodeKind::EffectSlot { params, .. } | NodeKind::EffectSlotLegacy { params, .. },
                id @ 2..=6,
            ) => params[id as usize - 2] = value.clamp(0.0, 1.0),
            (NodeKind::SpectrumAnalyzer { sensitivity, .. }, 0) => {
                *sensitivity = value.clamp(0.1, 8.0)
            }
            (NodeKind::SpectrumAnalyzer { smoothing, .. }, 1) => {
                *smoothing = value.clamp(0.0, 0.999)
            }
            (NodeKind::SpectrumAnalyzer { floor_db, .. }, 2) => {
                *floor_db = value.clamp(-96.0, -12.0)
            }
            (NodeKind::FftSpectrum { smoothing, .. }, 0) => *smoothing = value.clamp(0.0, 0.99),
            (NodeKind::FftSpectrum { floor_db, .. }, 1) => *floor_db = value.clamp(-96.0, -24.0),
            (NodeKind::SlewAudio { up, .. } | NodeKind::SlewControl { up, .. }, 0) => {
                *up = value.max(1.0)
            }
            (NodeKind::SlewAudio { down, .. } | NodeKind::SlewControl { down, .. }, 1) => {
                *down = value.max(1.0)
            }
            (NodeKind::AttenuverterBias { amount, .. }, 0) => *amount = value.clamp(-1.0, 1.0),
            (NodeKind::AttenuverterBias { bias, .. }, 1) => *bias = value.clamp(-1.0, 1.0),
            (NodeKind::SampleHold { mode }, 0) => *mode = value.round().clamp(0.0, 2.0) as u32,
            (NodeKind::CvMix { levels, .. }, id @ 0..=3) => {
                levels[id as usize] = value.clamp(0.0, 1.0)
            }
            (NodeKind::CvMix { offset, .. }, 4) => *offset = value.clamp(-1.0, 1.0),
            (
                NodeKind::EnvelopeFollower { attack_ms, .. }
                | NodeKind::EnvelopeControl { attack_ms, .. },
                0,
            ) => *attack_ms = value.clamp(0.01, 500.0),
            (
                NodeKind::EnvelopeFollower { release_ms, .. }
                | NodeKind::EnvelopeControl { release_ms, .. },
                1,
            ) => *release_ms = value.clamp(0.1, 5000.0),
            (
                NodeKind::EnvelopeFollower { sensitivity, .. }
                | NodeKind::EnvelopeControl { sensitivity, .. },
                2,
            ) => *sensitivity = value.clamp(0.01, 16.0),
            (
                NodeKind::EnvelopeFollower { highpass_hz, .. }
                | NodeKind::EnvelopeControl { highpass_hz, .. },
                3,
            ) => *highpass_hz = value.clamp(5.0, 4000.0),
            (
                NodeKind::EnvelopeFollower { mode, .. } | NodeKind::EnvelopeControl { mode, .. },
                4,
            ) => *mode = value.round().clamp(0.0, 2.0) as u32,
            (NodeKind::Compressor { params }, id) => {
                if !compressor::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::Limiter { params }, id) => {
                if !limiter::set_value(params, id, value) {
                    return 0;
                }
            }
            _ => return 0,
        }
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_prepare(sample_rate: f32, max_frames: u32) -> u32 {
    if !sample_rate.is_finite()
        || !(8_000.0..=384_000.0).contains(&sample_rate)
        || !(1..=8192).contains(&max_frames)
    {
        return 0;
    }
    let capacity = max_frames as usize;
    let fallback = GraphDescription {
        nodes: vec![
            NodeSpec {
                id: 1,
                kind: NodeKind::InputRaw,
            },
            NodeSpec {
                id: 2,
                kind: NodeKind::Svf,
            },
            NodeSpec {
                id: 3,
                kind: NodeKind::Output,
            },
        ],
        connections: vec![
            Connection {
                from: 1,
                to: 2,
                input_port: 0,
            },
            Connection {
                from: 2,
                to: 3,
                input_port: 0,
            },
        ],
    };
    let description = GRAPH_BUILDER.with(|slot| {
        let mut slot = slot.borrow_mut();
        match slot.take() {
            Some(builder)
                if builder.description.nodes.len() == builder.expected_nodes
                    && builder.description.connections.len() == builder.expected_connections =>
            {
                Some((builder.description, builder.patchable))
            }
            Some(_) => None,
            None => Some((fallback, false)),
        }
    });
    let Some((description, patchable)) = description else {
        return 0;
    };
    let plan = if patchable {
        description.compile_patchable(sample_rate, capacity)
    } else {
        description.compile(sample_rate, capacity)
    };
    let Ok(plan) = plan else {
        return 0;
    };
    ENGINE.with(|slot| {
        *slot.borrow_mut() = Some(WorkletEngine {
            plan,
            capacity,
            input: vec![0.0; capacity * 2],
            output: vec![0.0; capacity * 2],
            events: Vec::with_capacity(256),
            sample_upload: None,
        });
    });
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_input_ptr() -> *mut f32 {
    ENGINE.with(|slot| {
        slot.borrow_mut()
            .as_mut()
            .map_or(std::ptr::null_mut(), |engine| engine.input.as_mut_ptr())
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_output_ptr() -> *const f32 {
    ENGINE.with(|slot| {
        slot.borrow()
            .as_ref()
            .map_or(std::ptr::null(), |engine| engine.output.as_ptr())
    })
}

/// Reserve interleaved stereo storage before playback. Call commit after writing through the pointer.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_sample_begin(node_id: u32, frames: u32, source_rate: f32) -> u32 {
    if frames == 0
        || !source_rate.is_finite()
        || !(8_000.0..=384_000.0).contains(&source_rate)
        || frames as usize > (source_rate as usize).saturating_mul(MAX_SAMPLE_SECONDS)
        || frames as usize > MAX_SAMPLE_FRAMES
    {
        return 0;
    }
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            engine.sample_upload = Some((node_id, source_rate, vec![0.0; frames as usize * 2]));
            1
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_sample_ptr() -> *mut f32 {
    ENGINE.with(|slot| {
        slot.borrow_mut()
            .as_mut()
            .and_then(|engine| engine.sample_upload.as_mut())
            .map_or(std::ptr::null_mut(), |(_, _, samples)| samples.as_mut_ptr())
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_sample_commit() -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            let Some((node_id, source_rate, samples)) = engine.sample_upload.take() else {
                return 0;
            };
            u32::from(
                engine
                    .plan
                    .load_sample_stereo(node_id.into(), samples, source_rate),
            )
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_set_parameter(id: u32, value: f32) -> u32 {
    manifold_set_node_parameter(2, id, value)
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_set_node_parameter(node_id: u32, id: u32, value: f32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            u32::from(engine.plan.set_parameter(node_id.into(), id, value))
        })
    })
}

/// Source ID zero disconnects the target. Called between process blocks only.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_set_route(target_id: u32, port: u32, source_id: u32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            u32::from(
                engine
                    .plan
                    .set_route(
                        target_id.into(),
                        port as usize,
                        (source_id != 0).then_some(source_id.into()),
                    )
                    .is_ok(),
            )
        })
    })
}

/// 1 means reachable from Output, 0 means parked, 2 means missing.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_node_active(node_id: u32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|engine| engine.plan.node_active(node_id.into()))
            .map_or(2, u32::from)
    })
}

/// Read one bounded meter value after a process block; NaN means no such meter.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_get_node_meter(node_id: u32, band: u32) -> f32 {
    ENGINE.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|engine| engine.plan.node_meter(node_id.into(), band as usize))
            .unwrap_or(f32::NAN)
    })
}

/// Read the prepared EQ8's effective transfer magnitude without changing DSP state.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_eq8_response_db(node_id: u32, frequency: f32) -> f32 {
    ENGINE.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|engine| engine.plan.eq8_response_db(node_id.into(), frequency))
            .unwrap_or(f32::NAN)
    })
}

/// A stopped loop take's frame count; zero means empty, recording, or wrong node.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_capture_length(node_id: u32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|engine| engine.plan.capture_length(node_id.into()))
            .and_then(|frames| u32::try_from(frames).ok())
            .unwrap_or(0)
    })
}

/// Copy a chunk as interleaved stereo into the prepared output scratch buffer.
/// Call only between process blocks; the next process() overwrites this buffer.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_capture_copy(node_id: u32, start_frame: u32, frames: u32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            if frames == 0 || frames as usize > engine.capacity {
                return 0;
            }
            engine.plan.copy_capture_interleaved(
                node_id.into(),
                start_frame as usize,
                &mut engine.output[..frames as usize * 2],
            ) as u32
        })
    })
}

/// Queue a typed event at a frame offset in the next process block.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_event_push(
    node_id: u32,
    offset: u32,
    kind: u32,
    channel: u32,
    note: u32,
    velocity: u32,
) -> u32 {
    let kind = match kind {
        0 if channel <= 15 && note <= 127 && velocity <= 127 => EventKind::NoteOn {
            channel: channel as u8,
            note: note as u8,
            velocity: velocity as u8,
        },
        1 if channel <= 15 && note <= 127 => EventKind::NoteOff {
            channel: channel as u8,
            note: note as u8,
        },
        2 => EventKind::AllNotesOff,
        3 if channel <= 15 && note <= 127 && velocity <= 127 => EventKind::PitchBend {
            channel: channel as u8,
            value: ((velocity << 7) | note) as u16,
        },
        _ => return 0,
    };
    ENGINE.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(engine) = slot.as_mut() else {
            return 0;
        };
        if offset >= engine.capacity as u32
            || engine.events.len() >= 256
            || engine
                .events
                .last()
                .is_some_and(|last| last.offset > offset as usize)
        {
            return 0;
        }
        engine.events.push(TimedEvent {
            node: node_id.into(),
            offset: offset as usize,
            kind,
        });
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_process(frames: u32) -> u32 {
    ENGINE.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(engine) = slot.as_mut() else {
            return 0;
        };
        let frames = frames as usize;
        if frames > engine.capacity {
            return 0;
        }
        let (left_in, right_in) = engine.input.split_at(engine.capacity);
        let (left_out, right_out) = engine.output.split_at_mut(engine.capacity);
        let result = engine.plan.process_with_events(
            [&left_in[..frames], &right_in[..frames]],
            [&mut left_out[..frames], &mut right_out[..frames]],
            &engine.events,
        );
        engine.events.clear();
        if result.is_err() {
            left_out[..frames].fill(0.0);
            right_out[..frames].fill(0.0);
            return 0;
        }
        1
    })
}
