//! Platform-independent audio kernels. The prepared filter allocates nothing in process.

pub mod bitcrusher;
pub mod capture_timing;
pub mod chorus;
pub mod compressor;
pub mod cv_utilities;
pub mod distortion;
pub mod effect_slot;
pub mod envelope;
pub mod envelope_follower;
pub mod eq8;
pub mod events;
pub mod fft_spectrum;
pub mod formant_filter;
pub mod fx_routing;
pub mod granulator;
pub mod graph;
pub mod legacy_eq;
pub mod legacy_filter;
pub mod lfo;
pub mod limiter;
pub mod loop_capture;
pub mod main_control_slew;
pub mod main_directional;
pub mod main_instrument;
pub mod main_lfo;
pub mod main_looper;
pub mod main_pitch;
pub mod main_sample_capture;
pub mod main_voice_allocator;
pub mod main_voice_bank;
pub mod midi_arpeggiator;
pub mod midi_note_filter;
pub mod midi_note_router;
pub mod midi_scale_quantizer;
pub mod midi_transpose;
pub mod midi_velocity_mapper;
pub mod multitap_delay;
pub mod noise;
pub mod oscillator;
pub mod phase_vocoder;
pub mod phaser;
pub mod phrase_gain;
pub mod pitch_shifter;
pub mod resonator;
pub mod reverb;
pub mod reverse_delay;
pub mod ring_modulator;
pub mod sample_analysis;
pub mod sample_instrument;
pub mod sample_region;
pub mod shimmer;
pub mod sine_bank;
pub mod slew_limiter;
pub mod spectral_targets;
pub mod spectrum_analyzer;
pub mod stereo_delay;
pub mod stereo_widener;
pub mod stutter;
pub mod temporal_partials;
pub mod transient_shaper;
pub mod voice;
pub mod wave_add_oscillator;
pub mod waveshaper;

use std::f32::consts::PI;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum FilterMode {
    Lowpass = 0,
    Bandpass = 1,
    Highpass = 2,
    Notch = 3,
}

impl FilterMode {
    fn from_parameter(value: f32) -> Self {
        match value.round().clamp(0.0, 3.0) as u32 {
            1 => Self::Bandpass,
            2 => Self::Highpass,
            3 => Self::Notch,
            _ => Self::Lowpass,
        }
    }
}

#[derive(Clone, Copy, Default)]
struct ChannelState {
    ic1eq: f32,
    ic2eq: f32,
}

/// Port of the legacy Standalone Filter's `SVFNode` scalar path.
/// One instance belongs to one audio stream. Parameter changes target the next sample.
pub struct Filter {
    sample_rate: f32,
    mode: FilterMode,
    cutoff: f32,
    target_cutoff: f32,
    resonance: f32,
    target_resonance: f32,
    drive: f32,
    target_drive: f32,
    mix: f32,
    cutoff_smoothing: f32,
    resonance_smoothing: f32,
    drive_smoothing: f32,
    state: [ChannelState; 2],
}

impl Filter {
    pub fn new(sample_rate: f32) -> Self {
        let sample_rate = if sample_rate.is_finite() && sample_rate > 1.0 {
            sample_rate
        } else {
            44_100.0
        };
        Self {
            sample_rate,
            mode: FilterMode::Lowpass,
            cutoff: 3200.0,
            target_cutoff: 3200.0,
            resonance: 0.75,
            target_resonance: 0.75,
            drive: 1.0,
            target_drive: 1.0,
            mix: 1.0,
            cutoff_smoothing: (1.0 - (-1.0 / (0.020 * sample_rate)).exp()).clamp(0.0001, 1.0),
            resonance_smoothing: (1.0 - (-1.0 / (0.010 * sample_rate)).exp()).clamp(0.0001, 1.0),
            drive_smoothing: (1.0 - (-1.0 / (0.010 * sample_rate)).exp()).clamp(0.0001, 1.0),
            state: [ChannelState::default(); 2],
        }
    }

    pub fn mode(&self) -> FilterMode {
        self.mode
    }
    pub fn cutoff(&self) -> f32 {
        self.target_cutoff
    }
    pub fn resonance(&self) -> f32 {
        self.target_resonance
    }

    /// Stable project parameter IDs: 0 mode, 1 cutoff Hz, 2 resonance, 3 drive.
    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 => self.mode = FilterMode::from_parameter(value),
            1 => self.target_cutoff = value.clamp(20.0, 20_000.0),
            2 => self.target_resonance = value.clamp(0.06, 1.0),
            3 => self.target_drive = value.clamp(0.0, 10.0),
            _ => return false,
        }
        true
    }

    pub fn reset(&mut self) {
        self.state = [ChannelState::default(); 2];
    }

    /// Apply authored values before processing begins or after a slot type switch.
    pub fn settle(&mut self) {
        self.cutoff = self.target_cutoff;
        self.resonance = self.target_resonance;
        self.drive = self.target_drive;
        self.reset();
    }

    /// Planar stereo f32 buffers, equal lengths. No allocations, locks, or host calls.
    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        self.process_planar_with_cv(input, output, None, 0.0);
    }

    /// Optional bipolar control modulates the cutoff target in Hz per sample.
    /// The ordinary 20 ms cutoff smoother still applies after modulation.
    pub fn process_planar_with_cv(
        &mut self,
        input: [&[f32]; 2],
        output: [&mut [f32]; 2],
        cv: Option<&[f32]>,
        depth_hz: f32,
    ) {
        let [left_in, right_in] = input;
        let [left_out, right_out] = output;
        assert_eq!(left_in.len(), right_in.len());
        assert_eq!(left_in.len(), left_out.len());
        assert_eq!(left_in.len(), right_out.len());
        if let Some(cv) = cv {
            assert_eq!(left_in.len(), cv.len());
        }

        for index in 0..left_in.len() {
            let requested_cutoff = cv.map_or(self.target_cutoff, |cv| {
                (self.target_cutoff + cv[index] * depth_hz).clamp(20.0, 20_000.0)
            });
            self.cutoff += (requested_cutoff - self.cutoff) * self.cutoff_smoothing;
            self.resonance += (self.target_resonance - self.resonance) * self.resonance_smoothing;
            self.drive += (self.target_drive - self.drive) * self.drive_smoothing;

            let cutoff = self.cutoff.clamp(20.0, 0.42 * self.sample_rate);
            let resonance = self.resonance.clamp(0.06, 1.0);
            let g = (PI * cutoff / self.sample_rate).tan().min(8.0);
            let k = 2.0 * (1.0 - resonance * 0.85);
            let a1 = 1.0 / (1.0 + g * (g + k));
            let a2 = g * a1;
            let a3 = g * a2;

            left_out[index] = self.process_sample(left_in[index], 0, k, a1, a2, a3);
            right_out[index] = self.process_sample(right_in[index], 1, k, a1, a2, a3);
        }
    }

    #[inline]
    fn process_sample(
        &mut self,
        dry: f32,
        channel: usize,
        k: f32,
        a1: f32,
        a2: f32,
        a3: f32,
    ) -> f32 {
        // Legacy input drive: x / (1 + |x| * (1 + |x| / 3)).
        let input = if self.drive > 0.0 {
            let driven = dry * self.drive;
            let magnitude = driven.abs();
            driven / (1.0 + magnitude * (1.0 + magnitude / 3.0)) / self.drive.max(0.001)
        } else {
            dry
        };
        let state = &mut self.state[channel];
        let v3 = input - state.ic2eq;
        let v1 = a1 * state.ic1eq + a2 * v3;
        let v2 = state.ic2eq + a2 * state.ic1eq + a3 * v3;
        state.ic1eq = 2.0 * v1 - state.ic1eq;
        state.ic2eq = 2.0 * v2 - state.ic2eq;
        if !state.ic1eq.is_finite() || !state.ic2eq.is_finite() {
            *state = ChannelState::default();
            return dry;
        }
        // Avoid subnormal state values in long silent tails.
        if state.ic1eq.abs() < 1e-20 {
            state.ic1eq = 0.0;
        }
        if state.ic2eq.abs() < 1e-20 {
            state.ic2eq = 0.0;
        }
        let wet = match self.mode {
            FilterMode::Lowpass => v2,
            FilterMode::Bandpass => v1,
            FilterMode::Highpass => input - k * v1 - v2,
            FilterMode::Notch => input - k * v1,
        };
        let result = dry * (1.0 - self.mix) + wet * self.mix;
        if result.is_finite() {
            result
        } else {
            *state = ChannelState::default();
            dry
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(filter: &mut Filter, input: &[f32]) -> Vec<f32> {
        let mut left = vec![0.0; input.len()];
        let mut right = vec![0.0; input.len()];
        filter.process_planar([input, input], [&mut left, &mut right]);
        assert_eq!(left, right);
        left
    }

    #[test]
    fn block_partition_preserves_state() {
        let input: Vec<_> = (0..1024).map(|n| (n as f32 * 0.03).sin() * 0.4).collect();
        let whole = run(&mut Filter::new(48_000.0), &input);
        let mut split_filter = Filter::new(48_000.0);
        let mut split = run(&mut split_filter, &input[..127]);
        split.extend(run(&mut split_filter, &input[127..]));
        assert_eq!(whole, split);
    }

    #[test]
    fn modes_produce_distinct_finite_signals() {
        let input: Vec<_> = (0..512).map(|n| (n as f32 * 0.19).sin() * 0.2).collect();
        let outputs: Vec<_> = (0..4)
            .map(|mode| {
                let mut filter = Filter::new(48_000.0);
                assert!(filter.set_parameter(0, mode as f32));
                run(&mut filter, &input)
            })
            .collect();
        assert!(outputs.iter().flatten().all(|value| value.is_finite()));
        assert!(outputs.windows(2).all(|pair| pair[0] != pair[1]));
    }

    #[test]
    fn public_resonance_range_retains_legacy_dsp_clamp() {
        let mut filter = Filter::new(48_000.0);
        assert!(filter.set_parameter(2, 2.0));
        assert_eq!(filter.resonance(), 1.0);
        assert!(!filter.set_parameter(1, f32::NAN));
    }

    #[test]
    fn control_cutoff_changes_filter_without_changing_unmodulated_path() {
        let input: Vec<_> = (0..1024).map(|n| (n as f32 * 0.12).sin() * 0.3).collect();
        let cv = vec![1.0; input.len()];
        let mut baseline = Filter::new(48_000.0);
        baseline.set_parameter(1, 800.0);
        let ordinary = run(&mut baseline, &input);
        let mut zero_depth = Filter::new(48_000.0);
        zero_depth.set_parameter(1, 800.0);
        let mut zero = vec![0.0; input.len()];
        let mut zero_right = vec![0.0; input.len()];
        zero_depth.process_planar_with_cv(
            [&input, &input],
            [&mut zero, &mut zero_right],
            Some(&cv),
            0.0,
        );
        assert_eq!(ordinary, zero);
        let mut modulated = Filter::new(48_000.0);
        modulated.set_parameter(1, 800.0);
        let mut changed = vec![0.0; input.len()];
        let mut changed_right = vec![0.0; input.len()];
        modulated.process_planar_with_cv(
            [&input, &input],
            [&mut changed, &mut changed_right],
            Some(&cv),
            4000.0,
        );
        assert!(
            changed
                .iter()
                .zip(&ordinary)
                .any(|(a, b)| (a - b).abs() > 0.01)
        );
        assert_eq!(changed, changed_right);
    }
}
