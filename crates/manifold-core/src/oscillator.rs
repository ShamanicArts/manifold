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
            _ => return false,
        }
        true
    }

    pub fn process_sample(&mut self) -> f32 {
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
