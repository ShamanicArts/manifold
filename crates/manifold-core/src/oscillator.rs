//! Scalar standard-waveform port of the legacy OscillatorNode.

use std::f64::consts::TAU;

pub struct Oscillator {
    sample_rate: f64,
    phase: f64,
    waveform: u32,
    target_frequency: f32,
    frequency: f32,
    target_amplitude: f32,
    amplitude: f32,
    frequency_smoothing: f32,
    amplitude_smoothing: f32,
    sync_enabled: bool,
    previous_sync_sample: f32,
}

impl Oscillator {
    pub fn new(sample_rate: f32, frequency: f32, amplitude: f32, waveform: u32) -> Self {
        let sample_rate = sample_rate as f64;
        let frequency = frequency.clamp(1.0, 20_000.0);
        let amplitude = amplitude.clamp(0.0, 1.0);
        Self {
            sample_rate,
            phase: 0.0,
            waveform: waveform.min(4),
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
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 => self.waveform = value.round().clamp(0.0, 4.0) as u32,
            1 => self.target_frequency = value.clamp(1.0, 20_000.0),
            2 => self.target_amplitude = value.clamp(0.0, 1.0),
            3 => self.sync_enabled = value >= 0.5,
            _ => return false,
        }
        true
    }

    /// Restart phase and smoothing from the currently selected controls.
    pub fn reset(&mut self) {
        self.phase = 0.0;
        self.frequency = self.target_frequency;
        self.amplitude = self.target_amplitude;
        self.previous_sync_sample = 0.0;
    }

    pub fn meter(&self, band: usize) -> Option<f32> {
        match band {
            0 => Some(self.target_frequency),
            1 => Some(self.target_amplitude),
            2 => Some(f32::from(self.sync_enabled)),
            _ => None,
        }
    }

    pub fn process_sample(&mut self, sync: Option<f32>) -> f32 {
        if self.sync_enabled {
            if let Some(sample) = sync {
                if self.previous_sync_sample <= 0.0 && sample > 0.0 {
                    self.phase = 0.0;
                }
                self.previous_sync_sample = sample;
            }
        }
        self.frequency += (self.target_frequency - self.frequency) * self.frequency_smoothing;
        self.amplitude += (self.target_amplitude - self.amplitude) * self.amplitude_smoothing;
        let phase_norm = (self.phase / TAU) as f32;
        let sine = self.phase.sin() as f32;
        let saw = 2.0 * phase_norm - 1.0;
        let square = if self.phase < std::f64::consts::PI {
            1.0
        } else {
            -1.0
        };
        let triangle = 1.0 - 4.0 * (phase_norm - 0.5).abs();
        let waveform = match self.waveform {
            1 => saw,
            2 => square,
            3 => triangle,
            4 => 0.45 * sine + 0.55 * saw,
            _ => sine,
        };
        self.phase += TAU * self.frequency as f64 / self.sample_rate;
        while self.phase >= TAU {
            self.phase -= TAU;
        }
        waveform.clamp(-1.0, 1.0) * self.amplitude * std::f32::consts::FRAC_1_SQRT_2
    }
}

#[cfg(test)]
mod tests {
    use super::Oscillator;

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
}
