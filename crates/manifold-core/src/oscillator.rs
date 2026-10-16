//! Scalar standard-waveform port of the legacy OscillatorNode.

use crate::extended_additive::PreparedRecipe;
use std::f64::consts::TAU;

pub struct Oscillator {
    sample_rate: f64,
    phase: f64,
    waveform: u32,
    pulse_width: f32,
    target_frequency: f32,
    frequency: f32,
    target_amplitude: f32,
    amplitude: f32,
    frequency_smoothing: f32,
    amplitude_smoothing: f32,
    sync_enabled: bool,
    previous_sync_sample: f32,
    noise_state: u32,
    drive: f32,
    drive_shape: u32,
    drive_bias: f32,
    drive_mix: f32,
    retrigger_on_level_rise: bool,
    unison: usize,
    unison_phases: [f64; 8],
    unison_gains: [f32; 8],
    layout_unison: usize,
    detune_cents: f32,
    current_detune_cents: f32,
    spread: f32,
    current_spread: f32,
    detune_smoothing: f32,
    spread_smoothing: f32,
    unison_smoothing: f32,
    has_processed: bool,
    render_mode: u32,
    current_render_mix: f32,
    render_smoothing: f32,
    additive_partials: usize,
    additive_tilt: f32,
    additive_drift: f32,
    additive_recipe: Box<PreparedRecipe>,
}

impl Oscillator {
    pub fn new(sample_rate: f32, frequency: f32, amplitude: f32, waveform: u32) -> Self {
        let sample_rate = sample_rate as f64;
        let frequency = frequency.clamp(1.0, 20_000.0);
        let amplitude = amplitude.clamp(0.0, 1.0);
        Self {
            sample_rate,
            phase: 0.0,
            waveform: waveform.min(7),
            pulse_width: 0.5,
            target_frequency: frequency,
            frequency,
            target_amplitude: amplitude,
            amplitude,
            frequency_smoothing: ((1.0 - (-1.0 / (0.020 * sample_rate)).exp()) as f32)
                .clamp(0.0001, 1.0),
            amplitude_smoothing: ((1.0 - (-1.0 / (0.010 * sample_rate)).exp()) as f32)
                .clamp(0.0001, 1.0),
            sync_enabled: false,
            previous_sync_sample: 0.0,
            noise_state: 0x9e37_79b9,
            drive: 0.0,
            drive_shape: 0,
            drive_bias: 0.0,
            drive_mix: 1.0,
            retrigger_on_level_rise: false,
            unison: 1,
            unison_phases: [0.0; 8],
            unison_gains: [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
            layout_unison: 1,
            detune_cents: 0.0,
            current_detune_cents: 0.0,
            spread: 0.0,
            current_spread: 0.0,
            detune_smoothing: ((1.0 - (-1.0 / (0.012 * sample_rate)).exp()) as f32)
                .clamp(0.0001, 1.0),
            spread_smoothing: ((1.0 - (-1.0 / (0.012 * sample_rate)).exp()) as f32)
                .clamp(0.0001, 1.0),
            unison_smoothing: ((1.0 - (-1.0 / (0.008 * sample_rate)).exp()) as f32)
                .clamp(0.0001, 1.0),
            has_processed: false,
            render_mode: 0,
            current_render_mix: 0.0,
            render_smoothing: ((1.0 - (-1.0 / (0.008 * sample_rate)).exp()) as f32)
                .clamp(0.0001, 1.0),
            additive_partials: 8,
            additive_tilt: 0.0,
            additive_drift: 0.0,
            additive_recipe: Box::new(PreparedRecipe::new()),
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 => self.waveform = value.round().clamp(0.0, 7.0) as u32,
            1 => {
                self.target_frequency = value.clamp(1.0, 20_000.0);
                if !self.has_processed {
                    self.frequency = self.target_frequency;
                }
            }
            2 => {
                let next = value.clamp(0.0, 1.0);
                if self.retrigger_on_level_rise && self.target_amplitude <= 0.001 && next > 0.001 {
                    self.phase = 0.0;
                    self.unison_phases.fill(0.0);
                }
                self.target_amplitude = next;
                if !self.has_processed {
                    self.amplitude = next;
                }
            }
            3 => self.sync_enabled = value >= 0.5,
            4 => self.pulse_width = value.clamp(0.01, 0.99),
            5 => self.drive = value.clamp(0.0, 20.0),
            6 => self.drive_shape = value.round().clamp(0.0, 3.0) as u32,
            7 => self.drive_bias = value.clamp(-1.0, 1.0),
            8 => self.drive_mix = value.clamp(0.0, 1.0),
            9 => self.retrigger_on_level_rise = value >= 0.5,
            10 => self.unison = value.round().clamp(1.0, 8.0) as usize,
            11 => {
                self.detune_cents = value.clamp(0.0, 100.0);
                if !self.has_processed {
                    self.current_detune_cents = self.detune_cents;
                }
            }
            12 => {
                self.spread = value.clamp(0.0, 1.0);
                if !self.has_processed {
                    self.current_spread = self.spread;
                }
            }
            13 => {
                self.render_mode = value.round().clamp(0.0, 1.0) as u32;
                if !self.has_processed {
                    self.current_render_mix = self.render_mode as f32;
                }
            }
            14 => self.additive_partials = value.round().clamp(1.0, 12.0) as usize,
            15 => self.additive_tilt = value.clamp(-1.0, 1.0),
            16 => self.additive_drift = value.clamp(0.0, 1.0),
            _ => return false,
        }
        if matches!(id, 0 | 4 | 14 | 15 | 16) {
            self.additive_recipe.rebuild(
                self.waveform,
                self.additive_partials,
                self.additive_tilt,
                self.additive_drift,
                self.pulse_width,
            );
        }
        true
    }

    /// Restart phase and smoothing from the currently selected controls.
    pub fn reset(&mut self) {
        self.phase = 0.0;
        self.unison_phases.fill(0.0);
        self.unison_gains = [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
        self.layout_unison = 1;
        self.current_detune_cents = self.detune_cents;
        self.current_spread = self.spread;
        self.current_render_mix = self.render_mode as f32;
        self.frequency = self.target_frequency;
        self.amplitude = self.target_amplitude;
        self.previous_sync_sample = 0.0;
        self.noise_state = 0x9e37_79b9;
        self.has_processed = false;
    }

    /// After authored targets have been settled, edits are live even when no
    /// sample has rendered yet. Do not confuse first render with preparation.
    pub fn finish_preparation(&mut self) {
        self.has_processed = true;
    }

    pub fn meter(&self, band: usize) -> Option<f32> {
        match band {
            0 => Some(self.target_frequency),
            1 => Some(self.target_amplitude),
            2 => Some(f32::from(self.sync_enabled)),
            _ => None,
        }
    }

    pub fn target_parameter(&self, id: u32) -> Option<f32> {
        Some(match id {
            0 => self.waveform as f32,
            1 => self.target_frequency,
            2 => self.target_amplitude,
            3 => u32::from(self.sync_enabled) as f32,
            4 => self.pulse_width,
            5 => self.drive,
            6 => self.drive_shape as f32,
            7 => self.drive_bias,
            8 => self.drive_mix,
            9 => u32::from(self.retrigger_on_level_rise) as f32,
            10 => self.unison as f32,
            11 => self.detune_cents,
            12 => self.spread,
            13 => self.render_mode as f32,
            14 => self.additive_partials as f32,
            15 => self.additive_tilt,
            16 => self.additive_drift,
            _ => return None,
        })
    }

    /// Carry sounding history without replacing the candidate's controls or
    /// prepared additive recipe. All copied storage is scalar or fixed size.
    pub fn transfer_processing_state_from(&mut self, previous: &Self) -> bool {
        if self.sample_rate != previous.sample_rate {
            return false;
        }
        self.phase = previous.phase;
        self.frequency = previous.frequency;
        self.amplitude = previous.amplitude;
        self.previous_sync_sample = previous.previous_sync_sample;
        self.noise_state = previous.noise_state;
        self.unison_phases = previous.unison_phases;
        self.unison_gains = previous.unison_gains;
        self.layout_unison = previous.layout_unison;
        self.current_detune_cents = previous.current_detune_cents;
        self.current_spread = previous.current_spread;
        self.has_processed = previous.has_processed;
        self.current_render_mix = previous.current_render_mix;
        true
    }

    pub fn process_sample(&mut self, sync: Option<f32>) -> f32 {
        self.has_processed = true;
        if self.sync_enabled {
            if let Some(sample) = sync {
                if self.previous_sync_sample <= 0.0 && sample > 0.0 {
                    self.phase = 0.0;
                    self.unison_phases.fill(0.0);
                }
                self.previous_sync_sample = sample;
            }
        }
        self.frequency += (self.target_frequency - self.frequency) * self.frequency_smoothing;
        self.amplitude += (self.target_amplitude - self.amplitude) * self.amplitude_smoothing;
        self.current_render_mix +=
            (self.render_mode as f32 - self.current_render_mix) * self.render_smoothing;
        let waveform = self.render_waveform(self.phase, self.frequency);
        self.phase += TAU * self.frequency as f64 / self.sample_rate;
        while self.phase >= TAU {
            self.phase -= TAU;
        }
        self.shape_sample(waveform) * self.amplitude * std::f32::consts::FRAC_1_SQRT_2
    }

    /// Render prepared unison voices into a stereo frame without allocating.
    pub fn process_stereo_sample(&mut self, sync: Option<f32>) -> [f32; 2] {
        let additive_active = self.render_mode == 1 || self.current_render_mix >= 0.5;
        let effective_unison = if additive_active {
            self.unison.min(3)
        } else {
            self.unison
        };
        let extra = if additive_active && self.unison > effective_unison {
            (self.unison - effective_unison) as f32 / (8 - effective_unison) as f32
        } else {
            0.0
        };
        let target_detune = (self.detune_cents * (1.0 + extra * 1.15)).clamp(0.0, 100.0);
        let target_spread = (self.spread + extra * 0.35).clamp(0.0, 1.0);
        if effective_unison == 1 && self.layout_unison == 1 {
            self.current_detune_cents +=
                (target_detune - self.current_detune_cents) * self.detune_smoothing;
            self.current_spread += (target_spread - self.current_spread) * self.spread_smoothing;
            let value = self.process_sample(sync);
            return [value, value];
        }
        if effective_unison > self.layout_unison {
            for index in self.layout_unison..effective_unison {
                self.unison_phases[index] = self.phase;
                self.unison_gains[index] = 0.0;
            }
            self.layout_unison = effective_unison;
        }
        self.current_detune_cents +=
            (target_detune - self.current_detune_cents) * self.detune_smoothing;
        self.current_spread += (target_spread - self.current_spread) * self.spread_smoothing;
        let layout = self.layout_unison;
        let center = (layout as f32 - 1.0) * 0.5;
        let phase_before = self.phase;
        let main = self.process_sample(sync) * std::f32::consts::SQRT_2;
        let base_increment = TAU * self.frequency as f64 / self.sample_rate;
        let mut left = 0.0;
        let mut right = 0.0;
        let mut contributing = 0;
        let mut higher_active = false;
        for index in 0..layout {
            let target_gain = if index < effective_unison { 1.0 } else { 0.0 };
            self.unison_gains[index] +=
                (target_gain - self.unison_gains[index]) * self.unison_smoothing;
            let gain = self.unison_gains[index];
            if index >= effective_unison && gain > 1e-4 {
                higher_active = true;
            }
            if gain <= 1e-4 {
                continue;
            }
            contributing += 1;
            let offset = index as f32 - center;
            let frequency_multiplier = detune_multiplier(offset * self.current_detune_cents);
            let sample = if index == 0 {
                self.phase = (phase_before + base_increment * frequency_multiplier).rem_euclid(TAU);
                main
            } else {
                let phase = self.unison_phases[index];
                let wave =
                    self.render_waveform(phase, self.frequency * frequency_multiplier as f32);
                self.unison_phases[index] =
                    (phase + base_increment * frequency_multiplier).rem_euclid(TAU);
                self.shape_sample(wave) * self.amplitude
            } * gain;
            let pan = (0.5 + offset * self.current_spread / layout as f32).clamp(0.0, 1.0);
            left += sample * (1.0 - pan).sqrt();
            right += sample * pan.sqrt();
        }
        if !higher_active {
            self.layout_unison = effective_unison;
        }
        let normalization = 1.0 / (contributing as f32).sqrt();
        [left * normalization, right * normalization]
    }

    fn render_waveform(&mut self, phase: f64, frequency: f32) -> f32 {
        let mix = self.current_render_mix.clamp(0.0, 1.0);
        if mix <= 0.0001 {
            return self.waveform_at(phase);
        }
        let additive =
            self.additive_recipe
                .sample((phase / TAU) as f32, frequency, self.sample_rate);
        if mix >= 0.9999 {
            return additive;
        }
        let standard = self.waveform_at(phase);
        standard + (additive - standard) * mix
    }

    fn waveform_at(&mut self, phase: f64) -> f32 {
        let phase_norm = (phase / TAU) as f32;
        let sine = phase.sin() as f32;
        let saw = 2.0 * phase_norm - 1.0;
        let square = if phase < std::f64::consts::PI {
            1.0
        } else {
            -1.0
        };
        let triangle = 1.0 - 4.0 * (phase_norm - 0.5).abs();
        match self.waveform {
            1 => saw,
            2 => square,
            3 => triangle,
            4 => 0.45 * sine + 0.55 * saw,
            5 => {
                // The C++ standard branch uses std::rand, whose sequence varies by runtime.
                // Fixed state makes authored projects reproducible in native and Wasm.
                let mut state = self.noise_state;
                state ^= state << 13;
                state ^= state >> 17;
                state ^= state << 5;
                self.noise_state = state;
                (state as f64 / u32::MAX as f64 * 2.0 - 1.0) as f32
            }
            6 => {
                if phase_norm < self.pulse_width {
                    1.0
                } else {
                    -1.0
                }
            }
            7 => {
                let s2 = 2.0 * (phase_norm * 1.01).fract() - 1.0;
                let s3 = 2.0 * (phase_norm * 0.99).fract() - 1.0;
                (saw + 0.5 * s2 + 0.5 * s3) * 0.5
            }
            _ => sine,
        }
    }

    fn drive_transfer(&self, sample: f32) -> f32 {
        let drive = self.drive;
        if drive <= 0.0001 {
            return sample.clamp(-1.0, 1.0);
        }
        match self.drive_shape {
            1 => {
                let gain = 1.0 + drive * 1.35;
                (sample * gain).atan() / gain.atan()
            }
            2 => (sample * (1.0 + drive * 1.2)).clamp(-1.0, 1.0),
            3 => {
                let mut x = (sample * (1.0 + drive * 1.1)).clamp(-32.0, 32.0);
                while !(-1.0..=1.0).contains(&x) {
                    x = if x > 1.0 { 2.0 - x } else { -2.0 - x };
                }
                x
            }
            _ => {
                let gain = 1.0 + drive * 0.85;
                (sample * gain).tanh() / gain.tanh()
            }
        }
    }

    fn shape_sample(&self, sample: f32) -> f32 {
        if self.drive <= 0.0001 || self.drive_mix <= 0.0001 {
            return sample.clamp(-1.0, 1.0);
        }
        let bias = self.drive_bias * 0.75;
        let center = self.drive_transfer(bias);
        let positive = (self.drive_transfer(1.0 + bias) - center).abs();
        let negative = (self.drive_transfer(-1.0 + bias) - center).abs();
        let normalizer = positive.max(negative).max(1e-6);
        let wet = ((self.drive_transfer(sample + bias) - center) / normalizer).clamp(-1.0, 1.0);
        (sample + (wet - sample) * self.drive_mix).clamp(-1.0, 1.0)
    }
}

// |cents| <= 350 (8 voices, 100-cent control), so the tenth-order exponential
// series is within floating-point precision of exp2(cents / 1200). Unlike
// platform libm powf, its arithmetic is reproducible in native and Wasm.
pub(crate) fn detune_multiplier(cents: f32) -> f64 {
    let x = cents as f64 * (std::f64::consts::LN_2 / 1200.0);
    const COEFFICIENTS: [f64; 11] = [
        1.0,
        1.0,
        0.5,
        1.0 / 6.0,
        1.0 / 24.0,
        1.0 / 120.0,
        1.0 / 720.0,
        1.0 / 5040.0,
        1.0 / 40320.0,
        1.0 / 362880.0,
        1.0 / 3628800.0,
    ];
    let mut result = COEFFICIENTS[10];
    for index in (0..10).rev() {
        result = COEFFICIENTS[index] + x * result;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::{Oscillator, detune_multiplier};

    #[test]
    fn deterministic_detune_approximates_cents_ratio() {
        for cents in [-350.0, -100.0, 0.0, 100.0, 350.0] {
            let reference = 2.0_f64.powf(cents / 1200.0);
            assert!((detune_multiplier(cents as f32) - reference).abs() < 1e-12);
        }
    }

    #[test]
    fn authored_controls_settle_before_first_audio_frame() {
        let mut authored = Oscillator::new(48_000.0, 220.0, 0.0, 1);
        assert!(authored.set_parameter(1, 440.0));
        assert!(authored.set_parameter(2, 0.4));
        assert!(authored.set_parameter(10, 4.0));
        assert!(authored.set_parameter(11, 60.0));
        assert!(authored.set_parameter(12, 1.0));
        let mut prepared = Oscillator::new(48_000.0, 440.0, 0.4, 1);
        for (id, value) in [(10, 4.0), (11, 60.0), (12, 1.0)] {
            assert!(prepared.set_parameter(id, value));
        }
        prepared.reset();
        for _ in 0..128 {
            assert_eq!(
                authored.process_stereo_sample(None),
                prepared.process_stereo_sample(None)
            );
        }
    }

    #[test]
    fn reset_restarts_phase_with_the_current_frequency_and_level() {
        let mut oscillator = Oscillator::new(48_000.0, 220.0, 0.4, 0);
        assert!(oscillator.set_parameter(1, 880.0));
        assert!(oscillator.set_parameter(2, 0.6));
        for _ in 0..1000 {
            oscillator.process_sample(None);
        }
        oscillator.reset();
        let mut fresh = Oscillator::new(48_000.0, 880.0, 0.6, 0);
        for _ in 0..128 {
            assert_eq!(oscillator.process_sample(None), fresh.process_sample(None));
        }
    }

    #[test]
    fn raw_audio_rising_edge_resets_phase_only_when_sync_is_enabled() {
        let signal = [-1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0];
        let mut free = Oscillator::new(100.0, 10.0, 1.0, 0);
        let mut synced = Oscillator::new(100.0, 10.0, 1.0, 0);
        assert!(synced.set_parameter(3, 1.0));
        let free_output: Vec<_> = signal
            .iter()
            .map(|&sample| free.process_sample(Some(sample)))
            .collect();
        let sync_output: Vec<_> = signal
            .iter()
            .map(|&sample| synced.process_sample(Some(sample)))
            .collect();
        assert!(free_output[3].abs() > 0.5);
        assert!(sync_output[3].abs() < 1e-6);
        assert!(sync_output[4].abs() > 0.3);
        assert!(sync_output[6].abs() < 1e-6);
        assert!(synced.process_sample(None).is_finite());
    }

    #[test]
    fn quarter_width_pulse_matches_legacy_high_phase_fraction() {
        let mut pulse = Oscillator::new(400.0, 100.0, 1.0, 6);
        assert!(pulse.set_parameter(4, 0.25));
        let samples: Vec<_> = (0..8).map(|_| pulse.process_sample(None)).collect();
        assert!(samples[0] > 0.7 && samples[4] > 0.7);
        assert!(
            samples[1..4]
                .iter()
                .chain(&samples[5..8])
                .all(|value| *value < -0.7)
        );
    }

    #[test]
    fn extended_standard_waveforms_and_drive_are_audible_and_reproducible() {
        let mut saw = Oscillator::new(48_000.0, 220.0, 0.4, 1);
        let mut supersaw = Oscillator::new(48_000.0, 220.0, 0.4, 7);
        let mut noise = Oscillator::new(48_000.0, 220.0, 0.4, 5);
        let mut driven = Oscillator::new(48_000.0, 220.0, 0.4, 1);
        assert!(driven.set_parameter(5, 12.0));
        assert!(driven.set_parameter(6, 3.0));
        assert!(driven.set_parameter(7, 0.25));
        assert!(driven.set_parameter(8, 1.0));
        let mut saw_difference = 0.0;
        let mut drive_difference = 0.0;
        let mut noise_peak: f32 = 0.0;
        for _ in 0..256 {
            let dry = saw.process_sample(None);
            saw_difference += (dry - supersaw.process_sample(None)).abs();
            drive_difference += (dry - driven.process_sample(None)).abs();
            noise_peak = noise_peak.max(noise.process_sample(None).abs());
        }
        assert!(saw_difference > 0.01);
        assert!(drive_difference > 0.01);
        assert!(noise_peak > 0.2);
        noise.reset();
        let mut fresh = Oscillator::new(48_000.0, 220.0, 0.4, 5);
        for _ in 0..16 {
            assert_eq!(noise.process_sample(None), fresh.process_sample(None));
        }
    }

    #[test]
    fn optional_voice_level_rise_resets_phase_without_restarting_amplitude_smoothing() {
        let mut voice = Oscillator::new(400.0, 100.0, 0.0, 0);
        assert!(voice.set_parameter(9, 1.0));
        for _ in 0..3 {
            voice.process_sample(None);
        }
        assert!(voice.set_parameter(2, 0.4));
        assert!(voice.process_sample(None).abs() < 1e-6);
        assert!(voice.process_sample(None) > 0.0);
        assert!(voice.set_parameter(2, 0.0));
        for _ in 0..3 {
            voice.process_sample(None);
        }
        assert!(voice.set_parameter(2, 0.4));
        assert!(voice.process_sample(None).abs() < 1e-6);
    }

    #[test]
    fn unison_spread_separates_channels_and_returns_to_one_voice_without_phase_reset() {
        let mut oscillator = Oscillator::new(48_000.0, 220.0, 0.4, 1);
        assert!(oscillator.set_parameter(10, 4.0));
        assert!(oscillator.set_parameter(11, 60.0));
        assert!(oscillator.set_parameter(12, 1.0));
        let mut difference = 0.0;
        for _ in 0..4096 {
            let [left, right] = oscillator.process_stereo_sample(None);
            difference += (left - right).abs();
            assert!(left.is_finite() && right.is_finite());
        }
        assert!(difference > 1.0);
        assert!(oscillator.set_parameter(10, 1.0));
        for _ in 0..4096 {
            let [left, right] = oscillator.process_stereo_sample(None);
            assert!(left.is_finite() && right.is_finite());
        }
        assert_eq!(oscillator.layout_unison, 1);
        let [left, right] = oscillator.process_stereo_sample(None);
        assert!((left - right).abs() < 1e-6);
    }

    #[test]
    fn additive_render_changes_spectrum_and_accepts_live_shape_controls() {
        let mut standard = Oscillator::new(48_000.0, 220.0, 0.4, 1);
        let mut additive = Oscillator::new(48_000.0, 220.0, 0.4, 1);
        assert!(additive.set_parameter(13, 1.0));
        assert!(additive.set_parameter(14, 12.0));
        let mut unchanged = Oscillator::new(48_000.0, 220.0, 0.4, 1);
        assert!(unchanged.set_parameter(13, 1.0));
        assert!(unchanged.set_parameter(14, 12.0));
        let mut mode_difference = 0.0;
        for _ in 0..256 {
            mode_difference +=
                (standard.process_sample(None) - additive.process_sample(None)).abs();
            unchanged.process_sample(None);
        }
        assert!(mode_difference > 1.0);
        assert!(additive.set_parameter(15, 0.8));
        assert!(additive.set_parameter(16, 0.7));
        let mut difference = 0.0;
        for _ in 0..256 {
            difference += (unchanged.process_sample(None) - additive.process_sample(None)).abs();
        }
        assert!(difference > 0.1);
    }
}
