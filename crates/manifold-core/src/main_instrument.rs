//! Main's synth-to-looper routing, with all scratch prepared before processing.

use crate::Filter;
use crate::cv_utilities::{AttenuverterBias, CvMix, SampleHold};
use crate::effect_slot::{self, EffectSlot};
use crate::eq8::{self, Eq8};
use crate::events::EventKind;
use crate::main_compare::MainCompare;
use crate::main_control_slew::MainControlSlew;
use crate::main_lfo::{LfoOutputs, MainLfo};
use crate::main_looper::LAYERS;
use crate::main_looper::MainLooper;
use crate::main_range_mapper::MainRangeMapper;
use crate::main_sample_capture::MainSampleCapture;
use crate::main_voice_bank::MainVoiceBank;
use crate::sample_region::ValidatedStereo;

pub const MAIN_LFO_SLOTS: usize = 4;

pub struct MainInstrument {
    looper: MainLooper,
    synth: MainVoiceBank,
    filter: Filter,
    lfos: [MainLfo; MAIN_LFO_SLOTS],
    lfo_active: [bool; MAIN_LFO_SLOTS],
    modulation: [MainModulationRoute; MAIN_LFO_SLOTS],
    atv: AttenuverterBias,
    atv_source_slot: usize,
    atv_source_port: u32,
    atv_input: f32,
    atv_output: f32,
    slew: MainControlSlew,
    slew_source: MainControlSource,
    sample_hold: SampleHold,
    sample_hold_source: MainControlSource,
    sample_hold_trigger_source: u32,
    sample_hold_manual_gate: bool,
    sample_hold_input: f32,
    sample_hold_trigger: f32,
    compare: MainCompare,
    compare_source: MainControlSource,
    compare_input: f32,
    cv_mix: CvMix,
    cv_mix_sources: [MainControlSource; 4],
    cv_mix_inputs: [f32; 4],
    range: MainRangeMapper,
    range_source: MainControlSource,
    filter_cutoff_base: f32,
    filter_resonance_base: f32,
    filter_cutoff_effective: f32,
    filter_resonance_effective: f32,
    fx1_mix_base: f32,
    fx2_mix_base: f32,
    fx1_mix_effective: f32,
    fx2_mix_effective: f32,
    fx1: EffectSlot,
    fx2: EffectSlot,
    eq: Eq8,
    sample_capture: MainSampleCapture,
    layer_taps: [Vec<f32>; LAYERS],
    sample_rate: f32,
    synth_left: Vec<f32>,
    synth_right: Vec<f32>,
    filtered_left: Vec<f32>,
    filtered_right: Vec<f32>,
    fx1_left: Vec<f32>,
    fx1_right: Vec<f32>,
    fx2_left: Vec<f32>,
    fx2_right: Vec<f32>,
    equalized_left: Vec<f32>,
    equalized_right: Vec<f32>,
    capture_left: Vec<f32>,
    capture_right: Vec<f32>,
    monitor_left: Vec<f32>,
    monitor_right: Vec<f32>,
}

/// Values for one audio block. Stages read only values computed before them.
#[derive(Clone, Copy, Default)]
struct MainControlFrame {
    lfos: [LfoOutputs; MAIN_LFO_SLOTS],
    atv: f32,
    slew: f32,
    hold: f32,
    compare_gate: f32,
    compare_trigger: f32,
    cv_mix: f32,
    range: f32,
}

/// The prepared chain is acyclic: LFO -> ATV -> Slew -> Sample Hold -> Compare -> CV Mix -> Range.
#[derive(Clone, Copy)]
enum MainControlSource {
    Lfo { slot: usize, port: u32 },
    Atv,
    Slew,
    SampleHold,
    SampleHoldInv,
    CompareGate,
    CompareTrigger,
    CvMixOut,
    CvMixInv,
}

impl MainControlSource {
    fn from_id(id: u32) -> Option<Self> {
        match id {
            0..=15 => Some(Self::Lfo {
                slot: (id / 4) as usize,
                port: id % 4,
            }),
            16 => Some(Self::Atv),
            17 => Some(Self::Slew),
            18 => Some(Self::SampleHold),
            19 => Some(Self::SampleHoldInv),
            20 => Some(Self::CompareGate),
            21 => Some(Self::CompareTrigger),
            22 => Some(Self::CvMixOut),
            23 => Some(Self::CvMixInv),
            _ => None,
        }
    }

    fn sample(self, frame: &MainControlFrame) -> f32 {
        match self {
            Self::Lfo { slot, port } => {
                let source = frame.lfos[slot];
                match port {
                    0 => source.out,
                    1 => source.inv,
                    2 => source.uni,
                    _ => source.eoc,
                }
            }
            Self::Atv => frame.atv,
            Self::Slew => frame.slew,
            Self::SampleHold => frame.hold,
            Self::SampleHoldInv => -frame.hold,
            Self::CompareGate => frame.compare_gate,
            Self::CompareTrigger => frame.compare_trigger,
            Self::CvMixOut => frame.cv_mix,
            Self::CvMixInv => -frame.cv_mix,
        }
    }
}

/// One typed scalar connection from a Main control output to a continuous
/// Filter or FX mix parameter, addressed by the stable Main parameter IDs.
#[derive(Clone, Copy)]
struct MainModulationRoute {
    source: u32,
    target: u32,
    amount: f32,
    bias: f32,
    mode: u32,
    enabled: bool,
}

impl Default for MainModulationRoute {
    fn default() -> Self {
        Self {
            source: 0,
            target: 0,
            amount: 0.05,
            bias: 0.0,
            mode: 0,
            enabled: false,
        }
    }
}

impl MainModulationRoute {
    fn set(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 if (0.0..=12.0).contains(&value) && value.fract() == 0.0 => {
                self.source = value as u32
            }
            1 if [0.0, 22.0, 23.0, 129.0, 137.0].contains(&value) => self.target = value as u32,
            2 if (-1.0..=1.0).contains(&value) => self.amount = value,
            3 if (-1.0..=1.0).contains(&value) => self.bias = value,
            4 if value == 0.0 || value == 1.0 => self.mode = value as u32,
            5 if value == 0.0 || value == 1.0 => self.enabled = value == 1.0,
            _ => return false,
        }
        true
    }

    fn effective(self, base: f32, outputs: LfoOutputs, frame: &MainControlFrame) -> f32 {
        if !self.enabled || self.target == 0 {
            return base;
        }
        let (source, neutral) = match self.source {
            0 => ((outputs.out + 1.0) * 0.5, 0.5),
            1 => ((outputs.inv + 1.0) * 0.5, 0.5),
            2 => (outputs.uni, 0.0),
            3 => (outputs.eoc, 0.0),
            4 => ((frame.atv + 1.0) * 0.5, 0.5),
            5 => ((frame.slew + 1.0) * 0.5, 0.5),
            6 => ((frame.hold + 1.0) * 0.5, 0.5),
            7 => ((1.0 - frame.hold) * 0.5, 0.5),
            8 => (frame.compare_gate, 0.0),
            9 => (frame.compare_trigger, 0.0),
            10 => ((frame.cv_mix + 1.0) * 0.5, 0.5),
            11 => ((1.0 - frame.cv_mix) * 0.5, 0.5),
            _ => (frame.range, 0.0),
        };
        let (min, max): (f32, f32) = match self.target {
            22 => (80.0, 16_000.0),
            23 => (0.1, 2.0),
            _ => (0.0, 1.0),
        };
        let mapped = if self.mode == 1 {
            let t = (source * self.amount + self.bias).clamp(0.0, 1.0);
            if self.target == 22 {
                min * (max / min).powf(t)
            } else {
                min + t * (max - min)
            }
        } else {
            base + (source + self.bias - neutral) * (max - min) * self.amount
        };
        mapped.clamp(min, max)
    }
}

impl MainInstrument {
    pub fn new(sample_rate: f32, max_frames: usize) -> Self {
        Self {
            looper: MainLooper::new(sample_rate),
            synth: MainVoiceBank::new(sample_rate, max_frames, 9),
            filter: Filter::new(sample_rate),
            lfos: std::array::from_fn(|_| MainLfo::new(sample_rate)),
            lfo_active: [true, false, false, false],
            modulation: [MainModulationRoute::default(); MAIN_LFO_SLOTS],
            atv: AttenuverterBias::new(1.0, 0.0),
            atv_source_slot: 0,
            atv_source_port: 0,
            atv_input: 0.0,
            atv_output: 0.0,
            slew: MainControlSlew::new(),
            slew_source: MainControlSource::Lfo { slot: 0, port: 0 },
            sample_hold: SampleHold::new(0),
            sample_hold_source: MainControlSource::Lfo { slot: 0, port: 0 },
            sample_hold_trigger_source: 0,
            sample_hold_manual_gate: false,
            sample_hold_input: 0.0,
            sample_hold_trigger: 0.0,
            compare: MainCompare::new(),
            compare_source: MainControlSource::Lfo { slot: 0, port: 0 },
            compare_input: 0.0,
            cv_mix: CvMix::new([1.0, 0.0, 0.0, 0.0], 0.0),
            cv_mix_sources: [MainControlSource::Lfo { slot: 0, port: 0 }; 4],
            cv_mix_inputs: [0.0; 4],
            range: MainRangeMapper::new(),
            range_source: MainControlSource::Lfo { slot: 0, port: 0 },
            filter_cutoff_base: 3200.0,
            filter_resonance_base: 0.75,
            filter_cutoff_effective: 3200.0,
            filter_resonance_effective: 0.75,
            fx1_mix_base: 0.0,
            fx2_mix_base: 0.0,
            fx1_mix_effective: 0.0,
            fx2_mix_effective: 0.0,
            fx1: EffectSlot::new_legacy(
                sample_rate,
                max_frames,
                0,
                0.0,
                effect_slot::DEFAULT_TYPE_PARAMETERS[0],
            ),
            fx2: EffectSlot::new_legacy(
                sample_rate,
                max_frames,
                0,
                0.0,
                effect_slot::DEFAULT_TYPE_PARAMETERS[0],
            ),
            eq: Eq8::new(sample_rate, eq8::defaults()),
            sample_capture: MainSampleCapture::new(sample_rate),
            layer_taps: std::array::from_fn(|_| vec![0.0; max_frames * 2]),
            sample_rate,
            synth_left: vec![0.0; max_frames],
            synth_right: vec![0.0; max_frames],
            filtered_left: vec![0.0; max_frames],
            filtered_right: vec![0.0; max_frames],
            fx1_left: vec![0.0; max_frames],
            fx1_right: vec![0.0; max_frames],
            fx2_left: vec![0.0; max_frames],
            fx2_right: vec![0.0; max_frames],
            equalized_left: vec![0.0; max_frames],
            equalized_right: vec![0.0; max_frames],
            capture_left: vec![0.0; max_frames],
            capture_right: vec![0.0; max_frames],
            monitor_left: vec![0.0; max_frames],
            monitor_right: vec![0.0; max_frames],
        }
    }

    pub fn looper(&self) -> &MainLooper {
        &self.looper
    }

    pub fn looper_mut(&mut self) -> &mut MainLooper {
        &mut self.looper
    }

    pub fn set_synth_parameter(&mut self, id: u32, value: f32) -> bool {
        match id {
            21 => self.filter.set_parameter(0, value),
            22 if value.is_finite() => {
                self.filter_cutoff_base = value.clamp(80.0, 16_000.0);
                self.filter.set_parameter(1, self.filter_cutoff_base)
            }
            23 if value.is_finite() => {
                self.filter_resonance_base = value.clamp(0.1, 2.0);
                self.filter.set_parameter(2, self.filter_resonance_base)
            }
            129 if value.is_finite() => {
                self.fx1_mix_base = value.clamp(0.0, 1.0);
                self.fx1.set_parameter(1, self.fx1_mix_base)
            }
            137 if value.is_finite() => {
                self.fx2_mix_base = value.clamp(0.0, 1.0);
                self.fx2.set_parameter(1, self.fx2_mix_base)
            }
            64..=105 => self.eq.set_parameter(id - 64, value),
            128..=134 => self.fx1.set_parameter(id - 128, value),
            136..=142 => self.fx2.set_parameter(id - 136, value),
            _ => self.synth.set_parameter(id, value),
        }
    }

    pub fn set_lfo_parameter(&mut self, id: u32, value: f32) -> bool {
        self.set_lfo_slot_parameter(0, id, value)
    }

    pub fn set_lfo_gate(&mut self, id: u32, high: bool) -> bool {
        self.set_lfo_slot_gate(0, id, high)
    }

    pub fn set_modulation_route(&mut self, id: u32, value: f32) -> bool {
        self.set_modulation_slot_route(0, id, value)
    }

    pub fn lfo_status(&self, id: u32) -> f32 {
        self.lfo_slot_status(0, id)
    }

    pub fn set_lfo_slot_active(&mut self, slot: usize, active: bool) -> bool {
        let Some(enabled) = self.lfo_active.get_mut(slot) else {
            return false;
        };
        if *enabled != active {
            self.lfos[slot] = MainLfo::new(self.sample_rate);
            self.modulation[slot] = MainModulationRoute::default();
            *enabled = active;
        }
        true
    }

    pub fn set_lfo_slot_parameter(&mut self, slot: usize, id: u32, value: f32) -> bool {
        if !self.lfo_active.get(slot).copied().unwrap_or(false) {
            return false;
        }
        self.lfos[slot].set_parameter(id, value)
    }

    pub fn set_lfo_slot_gate(&mut self, slot: usize, id: u32, high: bool) -> bool {
        if !self.lfo_active.get(slot).copied().unwrap_or(false) {
            return false;
        }
        self.lfos[slot].set_gate(id, high)
    }

    pub fn set_modulation_slot_route(&mut self, slot: usize, id: u32, value: f32) -> bool {
        if !self.lfo_active.get(slot).copied().unwrap_or(false) {
            return false;
        }
        self.modulation[slot].set(id, value)
    }

    /// One prepared Control IN -> OUT utility. Its input is one active LFO
    /// output port; any active route can select the resulting OUT value.
    pub fn set_atv_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 | 1 => self.atv.set_parameter(id, value),
            2 if value.fract() == 0.0 && (0.0..MAIN_LFO_SLOTS as f32).contains(&value) => {
                self.atv_source_slot = value as usize;
                true
            }
            3 if value.fract() == 0.0 && (0.0..=3.0).contains(&value) => {
                self.atv_source_port = value as u32;
                true
            }
            _ => false,
        }
    }

    pub fn atv_status(&self, id: u32) -> f32 {
        match id {
            0 => self.atv_input,
            1 => self.atv_output,
            _ => 0.0,
        }
    }

    pub fn set_slew_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0..=2 => self.slew.set_parameter(id, value),
            3 if value.fract() == 0.0 && (0.0..=16.0).contains(&value) => {
                let Some(source) = MainControlSource::from_id(value as u32) else {
                    return false;
                };
                self.slew_source = source;
                true
            }
            _ => false,
        }
    }

    pub fn slew_status(&self, id: u32) -> f32 {
        match id {
            0 => self.slew.input(),
            1 => self.slew.output(),
            _ => 0.0,
        }
    }

    pub fn set_sample_hold_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 if value.fract() == 0.0 && (0.0..=2.0).contains(&value) => {
                self.sample_hold.set_parameter(0, value)
            }
            1 if value.fract() == 0.0 && (0.0..=17.0).contains(&value) => {
                let Some(source) = MainControlSource::from_id(value as u32) else {
                    return false;
                };
                self.sample_hold_source = source;
                true
            }
            2 if value.fract() == 0.0 && (0.0..=4.0).contains(&value) => {
                self.sample_hold_trigger_source = value as u32;
                true
            }
            3 if value == 0.0 || value == 1.0 => {
                self.sample_hold_manual_gate = value == 1.0;
                true
            }
            4 if (-1.0..=1.0).contains(&value) => self
                .sample_hold
                .restore(value, self.sample_hold.trigger_high()),
            5 if value == 0.0 || value == 1.0 => self
                .sample_hold
                .restore(self.sample_hold.meter(), value == 1.0),
            _ => false,
        }
    }

    pub fn sample_hold_status(&self, id: u32) -> f32 {
        match id {
            0 => self.sample_hold_input,
            1 => self.sample_hold_trigger,
            2 => self.sample_hold.meter(),
            3 => -self.sample_hold.meter(),
            4 => {
                if self.sample_hold.trigger_high() {
                    1.0
                } else {
                    0.0
                }
            }
            _ => 0.0,
        }
    }

    pub fn set_compare_parameter(&mut self, id: u32, value: f32) -> bool {
        if id == 3 {
            if !value.is_finite() || value.fract() != 0.0 || !(0.0..=19.0).contains(&value) {
                return false;
            }
            let Some(source) = MainControlSource::from_id(value as u32) else {
                return false;
            };
            self.compare_source = source;
            true
        } else {
            self.compare.set_parameter(id, value)
        }
    }

    pub fn compare_status(&self, id: u32) -> f32 {
        match id {
            0 => self.compare_input,
            1 => self.compare.gate(),
            2 => self.compare.trigger(),
            3 => self.compare.pulse_remaining() as f32,
            _ => 0.0,
        }
    }

    pub fn set_cv_mix_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0..=4 => self.cv_mix.set_parameter(id, value),
            5..=8 if value.fract() == 0.0 && (0.0..=21.0).contains(&value) => {
                let Some(source) = MainControlSource::from_id(value as u32) else {
                    return false;
                };
                self.cv_mix_sources[(id - 5) as usize] = source;
                true
            }
            _ => false,
        }
    }

    pub fn cv_mix_status(&self, id: u32) -> f32 {
        match id {
            0..=3 => self.cv_mix_inputs[id as usize],
            4 => self.cv_mix.meter(),
            5 => -self.cv_mix.meter(),
            _ => 0.0,
        }
    }

    pub fn set_range_parameter(&mut self, id: u32, value: f32) -> bool {
        if id == 3 {
            if !value.is_finite() || value.fract() != 0.0 || !(0.0..=23.0).contains(&value) {
                return false;
            }
            let Some(source) = MainControlSource::from_id(value as u32) else {
                return false;
            };
            self.range_source = source;
            true
        } else {
            self.range.set_parameter(id, value)
        }
    }

    pub fn range_status(&self, id: u32) -> f32 {
        match id {
            0 => self.range.input(),
            1 => self.range.output(),
            _ => 0.0,
        }
    }

    pub fn set_scale_quantizer_parameter(&mut self, id: u32, value: f32) -> bool {
        self.synth.set_scale_quantizer_parameter(id, value)
    }

    pub fn scale_quantizer_status(&self, id: u32) -> f32 {
        self.synth.scale_quantizer_status(id)
    }

    pub fn set_transpose_parameter(&mut self, id: u32, value: f32) -> bool {
        self.synth.set_transpose_parameter(id, value)
    }

    pub fn transpose_status(&self, id: u32) -> f32 {
        self.synth.transpose_status(id)
    }

    pub fn set_note_filter_parameter(&mut self, id: u32, value: f32) -> bool {
        self.synth.set_note_filter_parameter(id, value)
    }

    pub fn note_filter_status(&self, id: u32) -> f32 {
        self.synth.note_filter_status(id)
    }

    pub fn set_velocity_mapper_parameter(&mut self, id: u32, value: f32) -> bool {
        self.synth.set_velocity_mapper_parameter(id, value)
    }

    pub fn velocity_mapper_status(&self, id: u32) -> f32 {
        self.synth.velocity_mapper_status(id)
    }

    pub fn lfo_slot_status(&self, slot: usize, id: u32) -> f32 {
        if !self.lfo_active.get(slot).copied().unwrap_or(false) {
            return 0.0;
        }
        let outputs = self.lfos[slot].outputs();
        match id {
            0 => outputs.phase,
            1 => outputs.out,
            2 => outputs.inv,
            3 => outputs.uni,
            4 => outputs.eoc,
            5 => self.filter_cutoff_effective,
            6 => self.filter_resonance_effective,
            7 => self.fx1_mix_effective,
            8 => self.fx2_mix_effective,
            _ => 0.0,
        }
    }

    pub fn eq_response_db_at(&self, frequency: f32) -> Option<f32> {
        self.eq.response_db_at(frequency)
    }

    pub fn synth_event(&mut self, event: EventKind) {
        self.synth.event(event);
    }

    pub fn request_sample_source(&mut self, source: usize, bars: f32) -> usize {
        if !bars.is_finite() || !(0.0625..=16.0).contains(&bars) {
            return 0;
        }
        let frames = (bars * self.looper.samples_per_bar()).round() as usize;
        let frames = frames.min(self.sample_capture.capacity());
        if self.sample_capture.request(source, frames) {
            frames
        } else {
            0
        }
    }

    pub fn start_free_sample(&mut self, source: usize) -> bool {
        self.sample_capture.start_free(source)
    }

    pub fn finish_free_sample(&mut self) -> usize {
        self.sample_capture.finish_free()
    }

    pub fn cancel_free_sample(&mut self) {
        self.sample_capture.cancel_free();
    }

    pub fn free_sample_source(&self) -> Option<usize> {
        self.sample_capture.free_source()
    }

    pub fn free_sample_elapsed_frames(&self) -> usize {
        self.sample_capture.free_elapsed_frames()
    }

    pub fn sample_progress(&self) -> (usize, usize) {
        self.sample_capture.progress()
    }

    pub fn sample_captured_frames(&self, source: usize) -> usize {
        self.sample_capture.captured_frames(source)
    }

    pub fn copy_sample_chunk(&self, offset: usize, destination: &mut [f32]) -> bool {
        self.sample_capture.copy_frozen_chunk(offset, destination)
    }

    pub fn release_sample(&mut self) {
        self.sample_capture.release();
    }

    pub fn load_validated_sample(&mut self, sample: ValidatedStereo) {
        self.synth.load_validated(sample);
    }

    pub fn clear_sample_source(&mut self) {
        self.synth.clear_sample();
    }

    pub fn sample_rate(&self) -> f32 {
        self.sample_rate
    }

    pub fn synth_sample_frames(&self) -> usize {
        self.synth.sample_frames()
    }

    pub fn synth_sample_peak(&self, start: usize, end: usize) -> f32 {
        self.synth.sample_peak(start, end)
    }

    pub fn copy_synth_sample_interleaved(
        &self,
        start_frame: usize,
        destination: &mut [f32],
    ) -> usize {
        self.synth.copy_sample_interleaved(start_frame, destination)
    }

    pub fn process(&mut self, dry: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let frames = dry[0].len();
        assert_eq!(dry[1].len(), frames);
        assert!(frames <= self.synth_left.len());
        self.filter_cutoff_effective = self.filter_cutoff_base;
        self.filter_resonance_effective = self.filter_resonance_base;
        self.fx1_mix_effective = self.fx1_mix_base;
        self.fx2_mix_effective = self.fx2_mix_base;
        let mut frame = MainControlFrame::default();
        for slot in 0..MAIN_LFO_SLOTS {
            if self.lfo_active[slot] {
                frame.lfos[slot] = self.lfos[slot].advance(frames);
            }
        }
        self.atv_input = MainControlSource::Lfo {
            slot: self.atv_source_slot,
            port: self.atv_source_port,
        }
        .sample(&frame);
        self.atv_output = self.atv.process_sample(self.atv_input);
        frame.atv = self.atv_output;
        let slew_input = self.slew_source.sample(&frame);
        frame.slew = self
            .slew
            .process(slew_input, frames as f32 / self.sample_rate);
        self.sample_hold_input = self.sample_hold_source.sample(&frame);
        self.sample_hold_trigger = if self.sample_hold_trigger_source == 4 {
            if self.sample_hold_manual_gate {
                1.0
            } else {
                0.0
            }
        } else {
            frame.lfos[self.sample_hold_trigger_source as usize].eoc
        };
        frame.hold = self
            .sample_hold
            .process_sample(self.sample_hold_input, self.sample_hold_trigger);
        self.compare_input = self.compare_source.sample(&frame);
        (frame.compare_gate, frame.compare_trigger) = self.compare.process(self.compare_input);
        for index in 0..4 {
            self.cv_mix_inputs[index] = self.cv_mix_sources[index].sample(&frame);
        }
        frame.cv_mix = self.cv_mix.process_sample(self.cv_mix_inputs);
        frame.range = self.range.process(self.range_source.sample(&frame));
        // Stable slot order defines composition: Add applies to the current
        // value; a later Replace supersedes earlier routes to that target.
        for slot in 0..MAIN_LFO_SLOTS {
            if !self.lfo_active[slot] {
                continue;
            }
            let route = self.modulation[slot];
            match route.target {
                22 => {
                    self.filter_cutoff_effective =
                        route.effective(self.filter_cutoff_effective, frame.lfos[slot], &frame)
                }
                23 => {
                    self.filter_resonance_effective =
                        route.effective(self.filter_resonance_effective, frame.lfos[slot], &frame)
                }
                129 => {
                    self.fx1_mix_effective =
                        route.effective(self.fx1_mix_effective, frame.lfos[slot], &frame)
                }
                137 => {
                    self.fx2_mix_effective =
                        route.effective(self.fx2_mix_effective, frame.lfos[slot], &frame)
                }
                _ => {}
            }
        }
        self.filter.set_parameter(1, self.filter_cutoff_effective);
        self.filter
            .set_parameter(2, self.filter_resonance_effective);
        self.fx1.set_parameter(1, self.fx1_mix_effective);
        self.fx2.set_parameter(1, self.fx2_mix_effective);
        // The shared SVF clamps its public 0.1–2 resonance control to 1.
        // Report the target the audio processor actually received.
        self.filter_resonance_effective = self.filter.resonance();
        self.synth.process_planar([
            &mut self.synth_left[..frames],
            &mut self.synth_right[..frames],
        ]);
        self.filter.process_planar(
            [&self.synth_left[..frames], &self.synth_right[..frames]],
            [
                &mut self.filtered_left[..frames],
                &mut self.filtered_right[..frames],
            ],
        );
        self.fx1.process_planar(
            [
                &self.filtered_left[..frames],
                &self.filtered_right[..frames],
            ],
            [&mut self.fx1_left[..frames], &mut self.fx1_right[..frames]],
        );
        self.fx2.process_planar(
            [&self.fx1_left[..frames], &self.fx1_right[..frames]],
            [&mut self.fx2_left[..frames], &mut self.fx2_right[..frames]],
        );
        self.eq.process_planar(
            [&self.fx2_left[..frames], &self.fx2_right[..frames]],
            [
                &mut self.equalized_left[..frames],
                &mut self.equalized_right[..frames],
            ],
        );
        for frame in 0..frames {
            // Main/dsp/main.lua routes host input to the capture and monitor
            // branches. midisynth_integration.lua sends `spec` to every
            // capture input, and its audible `out` applies a gain of 0.8.
            self.capture_left[frame] = dry[0][frame] + self.equalized_left[frame];
            self.capture_right[frame] = dry[1][frame] + self.equalized_right[frame];
            self.monitor_left[frame] = dry[0][frame] + self.equalized_left[frame] * 0.8;
            self.monitor_right[frame] = dry[1][frame] + self.equalized_right[frame] * 0.8;
        }
        self.looper.process_routed_with_taps(
            [&self.capture_left[..frames], &self.capture_right[..frames]],
            [&self.monitor_left[..frames], &self.monitor_right[..frames]],
            output,
            Some(&mut self.layer_taps),
        );
        self.sample_capture.process(dry, &self.layer_taps);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sample_region::StereoSampleUpload;

    #[test]
    fn main_eq_changes_synth_monitor_and_capture_but_not_dry_input() {
        fn level(enabled: bool) -> (f32, f32) {
            let mut main = MainInstrument::new(48_000.0, 128);
            assert!(main.set_synth_parameter(0, 2.0)); // square wave
            assert!(main.set_synth_parameter(1, -1.0)); // wave only
            assert!(main.set_synth_parameter(22, 16_000.0)); // open shared filter
            assert!(main.set_synth_parameter(65, 3.0)); // EQ band 1 low-pass
            assert!(main.set_synth_parameter(66, 120.0));
            assert!(main.set_synth_parameter(64, if enabled { 1.0 } else { 0.0 }));
            main.synth_event(EventKind::NoteOn {
                channel: 0,
                note: 96,
                velocity: 100,
            });
            let silence = [0.0; 128];
            let mut left = [0.0; 128];
            let mut right = [0.0; 128];
            let mut energy = 0.0;
            for block in 0..240 {
                main.process([&silence, &silence], [&mut left, &mut right]);
                if block >= 200 {
                    energy += left.iter().map(|sample| sample.abs()).sum::<f32>();
                }
            }
            (energy, main.looper().peak(0, 1, 0, 512))
        }
        let (cut_monitor, cut_capture) = level(true);
        let (open_monitor, open_capture) = level(false);
        assert!(
            open_monitor > cut_monitor * 5.0,
            "monitor {open_monitor} / {cut_monitor}"
        );
        assert!(
            open_capture > cut_capture * 5.0,
            "capture {open_capture} / {cut_capture}"
        );
        let mut main = MainInstrument::new(48_000.0, 128);
        assert!(main.set_synth_parameter(65, 3.0));
        assert!(main.set_synth_parameter(66, 120.0));
        assert!(main.set_synth_parameter(64, 1.0));
        let dry = [0.25; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        main.process([&dry, &dry], [&mut left, &mut right]);
        assert!(left.iter().all(|sample| (*sample - 0.25).abs() < 1e-6));
    }

    #[test]
    fn main_fx_slots_process_in_series_before_eq_and_capture() {
        fn level(active_slots: usize) -> (f32, f32) {
            let mut main = MainInstrument::new(48_000.0, 128);
            assert!(main.set_synth_parameter(0, 2.0));
            assert!(main.set_synth_parameter(1, -1.0));
            assert!(main.set_synth_parameter(22, 16_000.0));
            for base in [128, 136].into_iter().take(active_slots) {
                assert!(main.set_synth_parameter(base, 5.0)); // original FilterNode
                assert!(main.set_synth_parameter(base + 2, 0.0)); // 80 Hz
                assert!(main.set_synth_parameter(base + 1, 1.0));
            }
            main.synth_event(EventKind::NoteOn {
                channel: 0,
                note: 96,
                velocity: 100,
            });
            let silence = [0.0; 128];
            let mut left = [0.0; 128];
            let mut right = [0.0; 128];
            let mut energy = 0.0;
            for block in 0..240 {
                main.process([&silence, &silence], [&mut left, &mut right]);
                if block >= 200 {
                    energy += left.iter().map(|sample| sample.abs()).sum::<f32>();
                }
            }
            (energy, main.looper().peak(0, 1, 0, 512))
        }
        let (dry_fx, dry_capture) = level(0);
        let (one_fx, one_capture) = level(1);
        let (two_fx, two_capture) = level(2);
        assert!(dry_fx > one_fx * 3.0, "first FX: {dry_fx} / {one_fx}");
        assert!(one_fx > two_fx * 3.0, "second FX: {one_fx} / {two_fx}");
        assert!(dry_capture > one_capture * 3.0);
        assert!(one_capture > two_capture * 3.0);
        let mut main = MainInstrument::new(48_000.0, 128);
        assert!(main.set_synth_parameter(128, 5.0));
        assert!(main.set_synth_parameter(129, 1.0));
        assert!(main.set_synth_parameter(130, 0.0));
        let dry = [0.25; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        main.process([&dry, &dry], [&mut left, &mut right]);
        assert!(left.iter().all(|sample| (*sample - 0.25).abs() < 1e-6));
    }

    #[test]
    fn shared_svf_filters_the_synth_before_main_capture_without_filtering_dry_input() {
        fn note_level(cutoff: f32) -> (f32, f32) {
            let mut main = MainInstrument::new(48_000.0, 128);
            assert!(main.set_synth_parameter(0, 2.0));
            assert!(main.set_synth_parameter(1, -1.0));
            assert!(main.set_synth_parameter(22, cutoff));
            main.synth_event(EventKind::NoteOn {
                channel: 0,
                note: 96,
                velocity: 100,
            });
            let silence = [0.0; 128];
            let mut left = [0.0; 128];
            let mut right = [0.0; 128];
            let mut energy = 0.0;
            for block in 0..240 {
                main.process([&silence, &silence], [&mut left, &mut right]);
                if block >= 200 {
                    energy += left.iter().map(|sample| sample.abs()).sum::<f32>();
                }
            }
            (energy / (40 * 128) as f32, main.looper().peak(0, 1, 0, 512))
        }
        let (low_monitor, low_capture) = note_level(80.0);
        let (open_monitor, open_capture) = note_level(16_000.0);
        assert!(
            open_monitor > low_monitor * 5.0,
            "monitor: low={low_monitor}, open={open_monitor}"
        );
        assert!(
            open_capture > low_capture * 5.0,
            "capture: low={low_capture}, open={open_capture}"
        );

        let mut main = MainInstrument::new(48_000.0, 128);
        assert!(main.set_synth_parameter(22, 80.0));
        let dry = [0.25; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        main.process([&dry, &dry], [&mut left, &mut right]);
        assert!(left.iter().all(|sample| (*sample - 0.25).abs() < 1e-6));
    }

    #[test]
    fn layer_sample_source_taps_playback_gate_before_volume() {
        let mut main = MainInstrument::new(8_000.0, 128);
        let dry = [0.4; 128];
        let silence = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        for _ in 0..12 {
            main.process([&dry, &dry], [&mut left, &mut right]);
        }
        assert!(main.looper_mut().commit(0.0625));
        assert!(main.looper_mut().set_layer_control(0, 0, 2.0));
        for _ in 0..20 {
            main.process([&silence, &silence], [&mut left, &mut right]);
        }
        assert_eq!(main.request_sample_source(1, 0.0625), 1_000);
        while main.sample_progress().0 < 1_000 {
            main.process([&silence, &silence], [&mut left, &mut right]);
        }
        let mut chunk = [0.0; 256];
        assert!(main.copy_sample_chunk(0, &mut chunk));
        assert!(chunk.iter().all(|value| (*value - 0.4).abs() < 1e-6));
        main.release_sample();
        assert!(main.looper_mut().set_layer_control(0, 2, 1.0));
        for _ in 0..10 {
            main.process([&silence, &silence], [&mut left, &mut right]);
        }
        assert_eq!(main.request_sample_source(1, 0.0625), 1_000);
        while main.sample_progress().0 < 1_000 {
            main.process([&silence, &silence], [&mut left, &mut right]);
        }
        assert!(main.copy_sample_chunk(0, &mut chunk));
        assert!(chunk.iter().all(|value| *value == 0.0));
    }

    #[test]
    fn fourth_layer_sample_source_uses_its_own_loop_playback() {
        let mut main = MainInstrument::new(8_000.0, 128);
        let silence = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        for layer in 0..4 {
            let dry = [0.1 * (layer + 1) as f32; 128];
            for _ in 0..12 {
                main.process([&dry, &dry], [&mut left, &mut right]);
            }
            assert!(main.looper_mut().set_control(0, layer as f32));
            assert!(main.looper_mut().commit(0.0625));
            for _ in 0..10 {
                main.process([&silence, &silence], [&mut left, &mut right]);
            }
        }
        assert_eq!(main.request_sample_source(4, 0.0625), 1_000);
        while main.sample_progress().0 < 1_000 {
            main.process([&silence, &silence], [&mut left, &mut right]);
        }
        let mut chunk = [0.0; 256];
        assert!(main.copy_sample_chunk(0, &mut chunk));
        assert!(chunk.iter().all(|value| (*value - 0.4).abs() < 1e-6));
        main.release_sample();
        assert_eq!(main.request_sample_source(5, 0.0625), 0);
    }

    #[test]
    fn free_sample_spans_only_audio_after_start_from_the_pinned_layer() {
        let mut main = MainInstrument::new(8_000.0, 128);
        let original = [0.4; 128];
        let other_dry = [0.9; 128];
        let silence = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        for _ in 0..12 {
            main.process([&original, &original], [&mut left, &mut right]);
        }
        assert!(main.looper_mut().commit(0.0625));
        for _ in 0..10 {
            main.process([&silence, &silence], [&mut left, &mut right]);
        }
        assert!(main.start_free_sample(1));
        assert_eq!(main.free_sample_source(), Some(1));
        for _ in 0..6 {
            main.process([&other_dry, &other_dry], [&mut left, &mut right]);
        }
        assert_eq!(main.finish_free_sample(), 768);
        while main.sample_progress().0 < 768 {
            main.process([&silence, &silence], [&mut left, &mut right]);
        }
        let mut first = [0.0; 256];
        let mut last = [0.0; 256];
        assert!(main.copy_sample_chunk(0, &mut first));
        assert!(main.copy_sample_chunk(640, &mut last));
        assert!(
            first
                .iter()
                .chain(last.iter())
                .all(|value| (*value - 0.4).abs() < 1e-6)
        );
    }

    #[test]
    fn live_sample_is_dry_input_and_plays_through_main_voice_bank() {
        let mut main = MainInstrument::new(8_000.0, 128);
        let dry = [0.35; 128];
        let silence = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        main.set_synth_parameter(1, -1.0);
        main.synth_event(EventKind::NoteOn {
            channel: 0,
            note: 60,
            velocity: 100,
        });
        for _ in 0..16 {
            main.process([&dry, &dry], [&mut left, &mut right]);
        }
        let frames = main.request_sample_source(0, 0.0625);
        assert_eq!(frames, 1_000);
        while main.sample_progress().0 < frames {
            main.process([&silence, &silence], [&mut left, &mut right]);
        }
        let mut upload = StereoSampleUpload::new(frames, 8_000.0).unwrap();
        for offset in (0..frames).step_by(128) {
            let count = (frames - offset).min(128);
            assert!(upload.prepare_next(offset, count));
            assert!(main.copy_sample_chunk(
                offset,
                &mut upload.samples_mut()[offset * 2..(offset + count) * 2]
            ));
            assert!(upload.validate_next(offset, count));
        }
        // The live source must contain only the dry input, even though the
        // oscillator was sounding in the looper's dry-plus-synth capture.
        assert!(
            upload
                .samples_mut()
                .chunks_exact(2)
                .all(|frame| frame[0] == 0.35 && frame[1] == 0.35)
        );
        main.synth_event(EventKind::AllNotesOff);
        main.load_validated_sample(upload.finish().unwrap());
        main.release_sample();
        main.set_synth_parameter(1, 1.0);
        main.synth_event(EventKind::NoteOn {
            channel: 0,
            note: 60,
            velocity: 100,
        });
        main.process([&silence, &silence], [&mut left, &mut right]);
        assert!(left.iter().any(|sample| sample.abs() > 0.001));
    }

    #[test]
    fn synth_note_is_audible_and_can_be_committed_from_every_layer_capture() {
        let mut main = MainInstrument::new(8_000.0, 128);
        main.set_synth_parameter(0, 0.0);
        main.set_synth_parameter(1, -1.0);
        main.synth_event(EventKind::NoteOn {
            channel: 0,
            note: 60,
            velocity: 100,
        });
        let silence = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        for _ in 0..20 {
            main.process([&silence, &silence], [&mut left, &mut right]);
        }
        assert!(left.iter().any(|v| v.abs() > 0.001));
        main.synth_event(EventKind::NoteOff {
            channel: 0,
            note: 60,
        });
        main.looper_mut().set_control(0, 2.0);
        assert!(main.looper_mut().commit(0.0625));
        for _ in 0..20 {
            main.process([&silence, &silence], [&mut left, &mut right]);
        }
        assert_eq!(main.looper().layer_length(2), 1_000);
        assert!(main.looper().peak(2, 0, 0, 1_000) > 0.001);
        assert_eq!(main.looper().layer_length(0), 0);
    }

    #[test]
    fn lfo_route_modulates_filter_without_overwriting_its_base_control() {
        let mut main = MainInstrument::new(8_000.0, 128);
        assert!(main.set_synth_parameter(22, 3_200.0));
        assert!(main.set_lfo_parameter(0, 3.0)); // square, positive first half cycle
        assert!(main.set_modulation_route(1, 22.0));
        assert!(main.set_modulation_route(2, -0.1));
        assert!(main.set_modulation_route(5, 1.0));
        let silence = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        main.process([&silence, &silence], [&mut left, &mut right]);
        assert!((main.lfo_status(5) - 2_404.0).abs() < 1.0);
        for _ in 0..32 {
            main.process([&silence, &silence], [&mut left, &mut right]);
        }
        assert!((main.lfo_status(5) - 3_996.0).abs() < 1.0);
        assert!(main.set_modulation_route(5, 0.0));
        main.process([&silence, &silence], [&mut left, &mut right]);
        assert_eq!(main.lfo_status(5), 3_200.0);
        assert!(!main.set_modulation_route(1, 64.0)); // EQ isn't a connected target yet
        assert!(main.set_modulation_route(1, 23.0));
        assert!(main.set_modulation_route(2, 1.0));
        assert!(main.set_modulation_route(5, 1.0));
        assert!(main.set_lfo_gate(0, true));
        assert!(main.set_lfo_gate(0, false));
        main.process([&silence, &silence], [&mut left, &mut right]);
        assert_eq!(main.lfo_status(6), 1.0); // public range reaches 2; SVF receives at most 1
    }

    #[test]
    fn separate_lfo_modules_route_to_filter_and_fx_mix_then_restore_base() {
        let mut main = MainInstrument::new(8_000.0, 128);
        assert!(main.set_synth_parameter(22, 3_200.0));
        assert!(main.set_synth_parameter(129, 0.25));
        assert!(main.set_lfo_parameter(0, 3.0));
        assert!(main.set_modulation_route(1, 22.0));
        assert!(main.set_modulation_route(2, 0.1));
        assert!(main.set_modulation_route(5, 1.0));
        assert!(main.set_lfo_slot_active(1, true));
        assert!(main.set_lfo_slot_parameter(1, 0, 3.0));
        assert!(main.set_modulation_slot_route(1, 1, 129.0));
        assert!(main.set_modulation_slot_route(1, 2, 1.0));
        assert!(main.set_modulation_slot_route(1, 5, 1.0));
        let silence = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        main.process([&silence, &silence], [&mut left, &mut right]);
        assert!((main.lfo_status(5) - 3_996.0).abs() < 1.0);
        assert_eq!(main.lfo_slot_status(1, 7), 0.75);
        assert!(main.set_lfo_slot_active(1, false));
        main.process([&silence, &silence], [&mut left, &mut right]);
        assert_eq!(main.lfo_slot_status(0, 7), 0.25);
        assert_eq!(main.lfo_slot_status(1, 7), 0.0);
        assert!(!main.set_lfo_slot_parameter(1, 0, 3.0));
        assert!(!main.set_lfo_slot_active(MAIN_LFO_SLOTS, true));
    }

    #[test]
    fn shared_target_routes_compose_in_stable_slot_order() {
        let mut main = MainInstrument::new(8_000.0, 128);
        for slot in 0..2 {
            if slot > 0 {
                assert!(main.set_lfo_slot_active(slot, true));
            }
            assert!(main.set_lfo_slot_parameter(slot, 0, 3.0));
            assert!(main.set_modulation_slot_route(slot, 1, 22.0));
            assert!(main.set_modulation_slot_route(slot, 2, 0.1));
            assert!(main.set_modulation_slot_route(slot, 5, 1.0));
        }
        let silence = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        main.process([&silence, &silence], [&mut left, &mut right]);
        assert!((main.lfo_status(5) - 4_792.0).abs() < 1.0);
        assert!(main.set_modulation_slot_route(1, 4, 1.0)); // Replace
        assert!(main.set_modulation_slot_route(1, 2, 0.5));
        main.process([&silence, &silence], [&mut left, &mut right]);
        assert!((main.lfo_status(5) - 1_131.37).abs() < 1.0);
    }

    #[test]
    fn atv_uses_a_typed_lfo_input_and_routes_its_clamped_output() {
        let mut main = MainInstrument::new(8_000.0, 128);
        assert!(main.set_lfo_parameter(0, 3.0)); // square OUT = +1
        assert!(main.set_atv_parameter(0, -0.5));
        assert!(main.set_atv_parameter(1, 0.25));
        assert!(main.set_modulation_route(0, 4.0)); // ATV OUT
        assert!(main.set_modulation_route(1, 129.0)); // FX1 mix
        assert!(main.set_modulation_route(2, 1.0));
        assert!(main.set_modulation_route(4, 1.0)); // Replace
        assert!(main.set_modulation_route(5, 1.0));
        let silence = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        main.process([&silence, &silence], [&mut left, &mut right]);
        assert_eq!(main.atv_status(0), 1.0);
        assert_eq!(main.atv_status(1), -0.25);
        assert_eq!(main.lfo_status(7), 0.375);
        assert!(main.set_atv_parameter(3, 1.0)); // INV = -1
        main.process([&silence, &silence], [&mut left, &mut right]);
        assert_eq!(main.atv_status(0), -1.0);
        assert_eq!(main.atv_status(1), 0.75);
        assert_eq!(main.lfo_status(7), 0.875);
        assert!(!main.set_atv_parameter(2, 4.0));
        assert!(!main.set_atv_parameter(3, 4.0));
    }

    #[test]
    fn main_slew_smooths_atv_output_before_a_typed_fx_route() {
        let mut main = MainInstrument::new(8_000.0, 128);
        assert!(main.set_atv_parameter(0, 0.0));
        assert!(main.set_atv_parameter(1, 1.0));
        assert!(main.set_slew_parameter(0, 1000.0));
        assert!(main.set_slew_parameter(1, 1000.0));
        assert!(main.set_slew_parameter(2, 0.0)); // Linear
        assert!(main.set_slew_parameter(3, 16.0)); // ATV OUT
        assert!(main.set_modulation_route(0, 5.0)); // Slew OUT
        assert!(main.set_modulation_route(1, 129.0)); // FX1 mix
        assert!(main.set_modulation_route(2, 1.0));
        assert!(main.set_modulation_route(4, 1.0)); // Replace
        assert!(main.set_modulation_route(5, 1.0));
        let silence = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        main.process([&silence, &silence], [&mut left, &mut right]);
        assert_eq!(main.slew_status(0), 1.0);
        assert!((main.slew_status(1) - 0.016).abs() < 1e-6);
        assert!((main.lfo_status(7) - 0.508).abs() < 1e-6);
        for _ in 0..63 {
            main.process([&silence, &silence], [&mut left, &mut right]);
        }
        let risen = main.slew_status(1);
        assert!(risen > 0.6 && risen < 0.7);
        assert!(main.set_atv_parameter(1, -1.0));
        main.process([&silence, &silence], [&mut left, &mut right]);
        assert_eq!(main.slew_status(0), -1.0);
        assert!(main.slew_status(1) < risen && main.slew_status(1) > 0.5);
        assert!(!main.set_slew_parameter(3, -1.0));
        assert!(!main.set_slew_parameter(3, 17.0));
    }

    #[test]
    fn main_sample_hold_tracks_trigger_edges_and_routes_both_polarities() {
        let mut main = MainInstrument::new(8_000.0, 128);
        assert!(main.set_atv_parameter(0, 0.0));
        assert!(main.set_atv_parameter(1, 0.75));
        assert!(main.set_sample_hold_parameter(1, 16.0)); // ATV OUT
        assert!(main.set_sample_hold_parameter(2, 4.0)); // manual trigger
        assert!(main.set_modulation_route(0, 6.0)); // Sample Hold OUT
        assert!(main.set_modulation_route(1, 129.0)); // FX1 mix
        assert!(main.set_modulation_route(2, 1.0));
        assert!(main.set_modulation_route(4, 1.0)); // Replace
        assert!(main.set_modulation_route(5, 1.0));
        let silence = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        let mut tick = |main: &mut MainInstrument| {
            main.process([&silence, &silence], [&mut left, &mut right]);
        };
        tick(&mut main);
        assert_eq!(main.sample_hold_status(2), 0.0);
        assert!(main.set_sample_hold_parameter(3, 1.0));
        tick(&mut main);
        assert_eq!(main.sample_hold_status(2), 0.75);
        assert_eq!(main.lfo_status(7), 0.875);
        assert!(main.set_atv_parameter(1, -0.4));
        tick(&mut main);
        assert_eq!(main.sample_hold_status(0), -0.4);
        assert_eq!(main.sample_hold_status(2), 0.75);
        assert!(main.set_sample_hold_parameter(3, 0.0));
        tick(&mut main);
        assert!(main.set_sample_hold_parameter(3, 1.0));
        tick(&mut main);
        assert_eq!(main.sample_hold_status(2), -0.4);
        assert!((main.lfo_status(7) - 0.3).abs() < 1e-6);
        assert!(main.set_modulation_route(0, 7.0)); // INV
        tick(&mut main);
        assert!((main.lfo_status(7) - 0.7).abs() < 1e-6);
        assert!(main.set_sample_hold_parameter(0, 1.0)); // Track while high
        assert!(main.set_atv_parameter(1, 0.2));
        tick(&mut main);
        assert_eq!(main.sample_hold_status(2), 0.2);
        assert!(main.set_sample_hold_parameter(0, 2.0)); // stepped on next edge
        assert!(main.set_sample_hold_parameter(3, 0.0));
        tick(&mut main);
        assert!(main.set_atv_parameter(1, 0.6));
        assert!(main.set_sample_hold_parameter(3, 1.0));
        tick(&mut main);
        assert!((main.sample_hold_status(2) - 2.0 / 3.0).abs() < 1e-6);
        assert!(main.set_sample_hold_parameter(4, 0.25));
        assert!(main.set_sample_hold_parameter(5, 1.0));
        tick(&mut main);
        assert_eq!(main.sample_hold_status(2), 0.25);
        assert_eq!(main.sample_hold_status(4), 1.0);
        assert!(!main.set_sample_hold_parameter(1, 18.0));
        assert!(!main.set_sample_hold_parameter(2, 5.0));
    }

    #[test]
    fn main_compare_routes_hysteretic_gate_and_both_edge_trigger() {
        let mut main = MainInstrument::new(8_000.0, 128);
        assert!(main.set_atv_parameter(0, 0.0));
        assert!(main.set_atv_parameter(1, -0.2));
        assert!(main.set_compare_parameter(3, 16.0)); // ATV OUT
        assert!(main.set_modulation_route(0, 8.0)); // Compare GATE
        assert!(main.set_modulation_route(1, 129.0)); // FX1 mix
        assert!(main.set_modulation_route(2, 1.0));
        assert!(main.set_modulation_route(4, 1.0)); // Replace
        assert!(main.set_modulation_route(5, 1.0));
        let silence = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        let mut tick = |main: &mut MainInstrument| {
            main.process([&silence, &silence], [&mut left, &mut right]);
        };
        tick(&mut main);
        assert_eq!(main.compare_status(1), 0.0);
        assert_eq!(main.lfo_status(7), 0.0);
        assert!(main.set_atv_parameter(1, 0.2));
        tick(&mut main);
        assert_eq!(main.compare_status(1), 1.0);
        assert_eq!(main.compare_status(2), 1.0);
        assert_eq!(main.lfo_status(7), 1.0);
        assert!(main.set_compare_parameter(0, 2.0)); // Both edges
        assert!(main.set_modulation_route(0, 9.0)); // Compare TRIG
        assert!(main.set_atv_parameter(1, -0.2));
        tick(&mut main);
        assert_eq!(main.compare_status(1), 0.0);
        assert_eq!(main.compare_status(2), 1.0);
        assert_eq!(main.lfo_status(7), 1.0);
        tick(&mut main);
        assert_eq!(main.compare_status(2), 1.0);
        tick(&mut main);
        assert_eq!(main.compare_status(2), 0.0);
        assert_eq!(main.lfo_status(7), 0.0);
        assert!(main.set_compare_parameter(4, 1.0));
        assert!(main.set_compare_parameter(5, 2.0));
        assert_eq!(main.compare_status(3), 2.0);
        assert!(!main.set_compare_parameter(3, 20.0));
    }

    #[test]
    fn main_cv_mix_combines_four_typed_inputs_and_routes_out_inv() {
        let mut main = MainInstrument::new(8_000.0, 128);
        assert!(main.set_atv_parameter(0, 0.0));
        assert!(main.set_atv_parameter(1, 0.8));
        assert!(main.set_sample_hold_parameter(4, -0.4));
        assert!(main.set_compare_parameter(3, 16.0)); // ATV OUT raises gate
        for (id, value) in [
            (0, 0.5),
            (1, 0.25),
            (2, 0.0),
            (3, 0.25),
            (4, 0.1),
            (5, 16.0),
            (6, 18.0),
            (7, 20.0),
            (8, 19.0),
        ] {
            assert!(main.set_cv_mix_parameter(id, value));
        }
        assert!(main.set_modulation_route(0, 10.0)); // CV Mix OUT
        assert!(main.set_modulation_route(1, 129.0)); // FX1 mix
        assert!(main.set_modulation_route(2, 1.0));
        assert!(main.set_modulation_route(4, 1.0)); // Replace
        assert!(main.set_modulation_route(5, 1.0));
        let silence = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        let mut tick = |main: &mut MainInstrument| {
            main.process([&silence, &silence], [&mut left, &mut right]);
        };
        tick(&mut main);
        assert!((main.cv_mix_status(0) - 0.8).abs() < 1e-6);
        assert!((main.cv_mix_status(1) + 0.4).abs() < 1e-6);
        assert_eq!(main.cv_mix_status(2), 1.0);
        assert!((main.cv_mix_status(3) - 0.4).abs() < 1e-6);
        assert!((main.cv_mix_status(4) - 0.5).abs() < 1e-6);
        assert!((main.lfo_status(7) - 0.75).abs() < 1e-6);
        assert!(main.set_modulation_route(0, 11.0)); // CV Mix INV
        tick(&mut main);
        assert!((main.cv_mix_status(5) + 0.5).abs() < 1e-6);
        assert!((main.lfo_status(7) - 0.25).abs() < 1e-6);
        assert!(!main.set_cv_mix_parameter(5, 22.0)); // no feedback to its own OUT
        assert!(!main.set_cv_mix_parameter(9, 1.0));
    }

    #[test]
    fn main_range_remaps_cv_mix_output_into_fx_route() {
        let mut main = MainInstrument::new(8_000.0, 128);
        assert!(main.set_cv_mix_parameter(0, 0.0));
        assert!(main.set_cv_mix_parameter(4, 0.5));
        assert!(main.set_range_parameter(0, 0.2));
        assert!(main.set_range_parameter(1, 0.7));
        assert!(main.set_range_parameter(2, 1.0)); // Remap
        assert!(main.set_range_parameter(3, 22.0)); // CV Mix OUT
        assert!(main.set_modulation_route(0, 12.0)); // Range OUT, unipolar
        assert!(main.set_modulation_route(1, 129.0)); // FX1 mix
        assert!(main.set_modulation_route(2, 1.0));
        assert!(main.set_modulation_route(4, 1.0)); // Replace
        assert!(main.set_modulation_route(5, 1.0));
        let silence = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        let mut tick = |main: &mut MainInstrument| {
            main.process([&silence, &silence], [&mut left, &mut right]);
        };
        tick(&mut main);
        assert!((main.range_status(0) - 0.5).abs() < 1e-6);
        assert!((main.range_status(1) - 0.45).abs() < 1e-6);
        assert!((main.lfo_status(7) - 0.45).abs() < 1e-6);
        assert!(main.set_range_parameter(2, 0.0)); // Clamp
        assert!(main.set_cv_mix_parameter(4, 0.9));
        tick(&mut main);
        assert!((main.range_status(1) - 0.7).abs() < 1e-6);
        assert!((main.lfo_status(7) - 0.7).abs() < 1e-6);
        assert!(main.set_range_parameter(0, 0.8)); // Reverse limits swap
        assert!(main.set_range_parameter(1, 0.1));
        tick(&mut main);
        assert!((main.range_status(1) - 0.8).abs() < 1e-6);
        assert!(!main.set_range_parameter(3, 24.0));
    }
}
