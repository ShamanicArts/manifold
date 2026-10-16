//! Prepared band-limited waveform tables for Main's original Add wave path.
//! Tables are built on the control side and shared between voices. Rendering
//! only selects a band, interpolates a sample, and advances one phase.

use std::f64::consts::TAU;
use std::sync::Arc;

const TABLE_SIZE: usize = 2048;
const BAND_COUNT: usize = 20;
const PARTIAL_COUNT: usize = 8;

pub struct WaveAddTable {
    bands: Box<[[f32; TABLE_SIZE + 1]; BAND_COUNT]>,
}

fn harmonic_sample(phase: f32, waveform: usize, limit: usize) -> f32 {
    let mut sum = 0.0_f32;
    let mut amplitude_sum = 0.0_f32;
    let mut added = 0;
    for harmonic in 1..=limit {
        if (waveform == 2 || waveform == 3) && harmonic % 2 == 0 {
            continue;
        }
        if added == PARTIAL_COUNT {
            break;
        }
        let h = harmonic as f32;
        let amplitude = if waveform == 3 {
            1.0 / (h * h)
        } else {
            1.0 / h
        };
        let offset = match waveform {
            1 if harmonic % 2 == 0 => std::f64::consts::PI,
            3 if (harmonic / 2) % 2 == 1 => std::f64::consts::FRAC_PI_2,
            3 => -std::f64::consts::FRAC_PI_2,
            _ => 0.0,
        };
        sum += (TAU * phase as f64 * harmonic as f64 + offset).sin() as f32 * amplitude;
        amplitude_sum += amplitude;
        added += 1;
    }
    if amplitude_sum > 1e-6 {
        sum / amplitude_sum
    } else {
        0.0
    }
}

fn recipe_sample(waveform: usize, phase: f32, limit: usize) -> f32 {
    // The table has twenty frequency bands, but the original recipe itself
    // caps harmonic numbers at twelve before choosing its eight partials.
    let limit = limit.min(12);
    let sine = (TAU * phase as f64).sin() as f32;
    let value = match waveform {
        0 => sine,
        1..=3 => harmonic_sample(phase, waveform, limit),
        4 => (sine * 0.45 + harmonic_sample(phase, 1, limit) * 0.55).clamp(-1.0, 1.0),
        _ => sine,
    };
    let trim = match waveform {
        1 => 0.96,
        2 => 0.98,
        3 => 1.06,
        4 => 0.94,
        _ => 1.0,
    };
    (value * trim).clamp(-1.0, 1.0)
}

impl WaveAddTable {
    pub fn prepare(waveform: usize) -> Self {
        let mut bands = Box::new([[0.0; TABLE_SIZE + 1]; BAND_COUNT]);
        for (index, band) in bands.iter_mut().enumerate() {
            for (sample, value) in band[..TABLE_SIZE].iter_mut().enumerate() {
                *value = recipe_sample(waveform, sample as f32 / TABLE_SIZE as f32, index + 1);
            }
            band[TABLE_SIZE] = band[0];
        }
        Self { bands }
    }

    fn lookup(&self, phase: f32, band: usize) -> f32 {
        let position = phase.rem_euclid(1.0) * TABLE_SIZE as f32;
        let index = (position as usize).min(TABLE_SIZE - 1);
        let frac = position - index as f32;
        let values = &self.bands[band.min(BAND_COUNT - 1)];
        values[index] + (values[index + 1] - values[index]) * frac
    }
}

pub fn prepare_default_tables() -> [Arc<WaveAddTable>; 5] {
    std::array::from_fn(|waveform| Arc::new(WaveAddTable::prepare(waveform)))
}

pub struct WaveAddOscillator {
    sample_rate: f64,
    tables: [Arc<WaveAddTable>; 5],
    waveform: usize,
    phase: f64,
    frequency: f32,
    target_frequency: f32,
    amplitude: f32,
    target_amplitude: f32,
    frequency_smoothing: f32,
    amplitude_smoothing: f32,
}

impl WaveAddOscillator {
    pub fn new(sample_rate: f32, tables: [Arc<WaveAddTable>; 5]) -> Self {
        let rate = sample_rate as f64;
        Self {
            sample_rate: rate,
            tables,
            waveform: 0,
            phase: 0.0,
            frequency: 220.0,
            target_frequency: 220.0,
            amplitude: 0.0,
            target_amplitude: 0.0,
            frequency_smoothing: ((1.0 - (-1.0 / (0.020 * rate)).exp()) as f32).clamp(0.0001, 1.0),
            amplitude_smoothing: ((1.0 - (-1.0 / (0.010 * rate)).exp()) as f32).clamp(0.0001, 1.0),
        }
    }

    pub fn set_waveform(&mut self, waveform: u32) {
        self.waveform = waveform.min(4) as usize;
    }

    pub fn set_frequency(&mut self, frequency: f32) {
        self.target_frequency = frequency.clamp(1.0, 20_000.0);
    }

    pub fn set_amplitude(&mut self, amplitude: f32) {
        self.target_amplitude = amplitude.clamp(0.0, 1.0);
    }

    pub fn reset_phase(&mut self) {
        self.phase = 0.0;
    }

    pub fn process_sample(&mut self) -> f32 {
        self.frequency += (self.target_frequency - self.frequency) * self.frequency_smoothing;
        self.amplitude += (self.target_amplitude - self.amplitude) * self.amplitude_smoothing;
        let phase = (self.phase / TAU) as f32;
        let max_ratio =
            ((self.sample_rate * 0.475) / self.frequency.abs().max(1.0) as f64).max(1.0) as f32;
        let band = max_ratio.min(BAND_COUNT as f32).floor() as usize - 1;
        let value = self.tables[self.waveform].lookup(phase, band);
        self.phase += TAU * self.frequency as f64 / self.sample_rate;
        while self.phase >= TAU {
            self.phase -= TAU;
        }
        value * self.amplitude * std::f32::consts::FRAC_1_SQRT_2
    }
}
