//! Bounded additive oscillator recipes from the historical OscillatorNode.
//! The renderer uses fixed harmonic limits and never allocates in the audio callback.

use crate::oscillator::detune_multiplier;
use std::f64::consts::{FRAC_PI_2, PI, TAU};

const MAX_HARMONICS: usize = 12;
const NOISE_CLOUD: [(f64, f32, f64); 12] = [
    (1.00, 1.00, 0.00),
    (1.37, 0.91, 0.63),
    (1.93, 0.82, 1.42),
    (2.58, 0.74, 2.17),
    (3.11, 0.67, 0.88),
    (3.93, 0.60, 2.74),
    (5.17, 0.52, 1.11),
    (6.44, 0.45, 2.49),
    (8.13, 0.38, 0.37),
    (10.37, 0.31, 1.96),
    (13.11, 0.25, 2.81),
    (16.51, 0.20, 0.94),
];
const SUPER_SAW: [(f64, f32, f64); 5] = [
    (-18.0, 0.55, 0.17),
    (-7.0, 0.82, 0.51),
    (0.0, 1.0, 0.0),
    (8.0, 0.79, 0.33),
    (19.0, 0.50, 0.74),
];

const TABLE_SIZE: usize = 2048;

#[derive(Clone, Copy, Default)]
struct PreparedPartial {
    raw_ratio: f64,
    shaped_ratio: f64,
    phase_cycles: f64,
    weight: f32,
}

#[derive(Clone, Copy, Default)]
struct Layer {
    start: usize,
    length: usize,
    ratio: f64,
    phase_cycles: f64,
    gain: f32,
}

/// Fixed-capacity additive recipe. Control edits rebuild only coefficients;
/// rendering reads a prepared sine table and never allocates or calls libm.
pub struct PreparedRecipe {
    sine: Box<[f32; TABLE_SIZE + 1]>,
    entries: [PreparedPartial; 60],
    layers: [Layer; 5],
    layer_count: usize,
    waveform: u32,
    tilt: f32,
    drift: f32,
}

impl PreparedRecipe {
    pub fn new() -> Self {
        let mut sine = Box::new([0.0; TABLE_SIZE + 1]);
        for (index, value) in sine.iter_mut().enumerate() {
            *value = (TAU * index as f64 / TABLE_SIZE as f64).sin() as f32;
        }
        let mut recipe = Self {
            sine,
            entries: [PreparedPartial::default(); 60],
            layers: [Layer::default(); 5],
            layer_count: 0,
            waveform: 0,
            tilt: 0.0,
            drift: 0.0,
        };
        recipe.rebuild(0, 8, 0.0, 0.0, 0.5);
        recipe
    }

    fn insert(&mut self, index: usize, raw_ratio: f64, amplitude: f32, offset: f64) {
        let ratio = raw_ratio.max(0.1);
        let scale = (ratio as f32).powf(self.tilt * 0.85).max(0.12);
        let ratio_jitter = (ratio * 2.173 + self.waveform as f64 * 0.53).sin();
        let phase_jitter = (ratio * 1.618 + self.waveform as f64 * 0.37).sin();
        let shaped_ratio = (ratio
            * (1.0 + ratio_jitter * self.drift as f64 * 0.035 * (1.0 + ratio * 0.05)))
            .max(0.1);
        self.entries[index] = PreparedPartial {
            raw_ratio,
            shaped_ratio,
            phase_cycles: (offset + phase_jitter * self.drift as f64 * 0.85) / TAU,
            weight: amplitude * scale,
        };
    }

    pub fn rebuild(
        &mut self,
        waveform: u32,
        partials: usize,
        tilt: f32,
        drift: f32,
        pulse_width: f32,
    ) {
        self.waveform = waveform.min(7);
        self.tilt = tilt.clamp(-1.0, 1.0);
        self.drift = drift.clamp(0.0, 1.0);
        let partials = partials.clamp(1, MAX_HARMONICS);
        self.layer_count = 1;
        self.layers[0] = Layer {
            start: 0,
            length: 0,
            ratio: 1.0,
            phase_cycles: 0.0,
            gain: 1.0,
        };
        match self.waveform {
            1 | 4 => {
                for harmonic in 1..=partials {
                    self.insert(
                        harmonic - 1,
                        harmonic as f64,
                        1.0 / harmonic as f32,
                        if harmonic % 2 == 0 { PI } else { 0.0 },
                    );
                }
                self.layers[0].length = partials;
            }
            2 | 3 => {
                for index in 0..partials {
                    let harmonic = index * 2 + 1;
                    let offset = if self.waveform == 3 {
                        if index % 2 == 1 {
                            FRAC_PI_2
                        } else {
                            -FRAC_PI_2
                        }
                    } else {
                        0.0
                    };
                    let amplitude = if self.waveform == 3 {
                        1.0 / (harmonic * harmonic) as f32
                    } else {
                        1.0 / harmonic as f32
                    };
                    self.insert(index, harmonic as f64, amplitude, offset);
                }
                self.layers[0].length = partials;
            }
            5 => {
                for (index, &(ratio, gain, offset)) in NOISE_CLOUD.iter().take(partials).enumerate()
                {
                    self.insert(index, ratio, gain, offset);
                }
                self.layers[0].length = partials;
            }
            6 => {
                for harmonic in 1..=partials {
                    let coeff = (PI * harmonic as f64 * pulse_width.clamp(0.01, 0.99) as f64).sin();
                    self.insert(
                        harmonic - 1,
                        harmonic as f64,
                        coeff.abs() as f32 / harmonic as f32,
                        if coeff < 0.0 { PI } else { 0.0 },
                    );
                }
                self.layers[0].length = partials;
            }
            7 => {
                self.layer_count = partials.min(5);
                for index in 0..self.layer_count {
                    let (cents, gain, offset) = SUPER_SAW[index];
                    self.layers[index] = Layer {
                        start: index * MAX_HARMONICS,
                        length: partials,
                        ratio: detune_multiplier(cents as f32),
                        phase_cycles: offset / TAU,
                        gain,
                    };
                    for harmonic in 1..=partials {
                        self.insert(
                            index * MAX_HARMONICS + harmonic - 1,
                            harmonic as f64,
                            1.0 / harmonic as f32,
                            if harmonic % 2 == 0 { PI } else { 0.0 },
                        );
                    }
                }
            }
            _ => {}
        }
    }

    fn lookup(&self, phase: f64) -> f32 {
        let position = phase.rem_euclid(1.0) * TABLE_SIZE as f64;
        let index = (position as usize).min(TABLE_SIZE - 1);
        let frac = (position - index as f64) as f32;
        self.sine[index] + (self.sine[index + 1] - self.sine[index]) * frac
    }

    fn group(&self, layer: Layer, phase: f64, ratio_limit: f64) -> f32 {
        let mut sum = 0.0;
        let mut weight = 0.0;
        for part in &self.entries[layer.start..layer.start + layer.length] {
            if part.raw_ratio > ratio_limit || part.weight <= 1e-6 {
                continue;
            }
            sum += self.lookup(phase * part.shaped_ratio + part.phase_cycles) * part.weight;
            weight += part.weight;
        }
        if weight > 1e-6 { sum / weight } else { 0.0 }
    }

    pub fn sample(&self, phase: f32, frequency: f32, sample_rate: f64) -> f32 {
        let max_ratio = ((sample_rate * 0.475) / frequency.abs().max(1.0) as f64).max(1.0);
        let harmonic_limit = max_ratio.floor().clamp(1.0, MAX_HARMONICS as f64);
        let sine = self.lookup(phase as f64);
        let value = match self.waveform {
            1 | 2 | 3 | 6 => self.group(self.layers[0], phase as f64, harmonic_limit),
            4 => (sine * 0.45 + self.group(self.layers[0], phase as f64, harmonic_limit) * 0.55)
                .clamp(-1.0, 1.0),
            5 => self.group(self.layers[0], phase as f64, max_ratio),
            7 => {
                let mut sum = 0.0;
                let mut weight = 0.0;
                for layer in self.layers.iter().take(self.layer_count) {
                    let limit = (max_ratio / layer.ratio)
                        .max(1.0)
                        .floor()
                        .clamp(1.0, MAX_HARMONICS as f64);
                    let layer_phase =
                        (phase as f64 * layer.ratio + layer.phase_cycles).rem_euclid(1.0);
                    sum += self.group(*layer, layer_phase, limit) * layer.gain;
                    weight += layer.gain;
                }
                if weight > 1e-6 { sum / weight } else { 0.0 }
            }
            _ => sine,
        };
        let trim = match self.waveform {
            1 => 0.96,
            2 => 0.98,
            3 => 1.06,
            4 => 0.94,
            5 => 0.78,
            6 => 1.0,
            7 => 0.84,
            _ => 1.0,
        };
        (value * trim * (1.0 + (-self.tilt * 0.10).clamp(-0.12, 0.10)) * (1.0 - self.drift * 0.08))
            .clamp(-1.0, 1.0)
    }
}

struct Accumulator {
    sum: f32,
    weight: f32,
    tilt: f32,
    drift: f32,
    waveform: u32,
}

impl Accumulator {
    fn new(tilt: f32, drift: f32, waveform: u32) -> Self {
        Self {
            sum: 0.0,
            weight: 0.0,
            tilt,
            drift,
            waveform,
        }
    }

    fn add(&mut self, phase: f32, ratio: f64, amplitude: f32, offset: f64) {
        if amplitude <= 1e-6 {
            return;
        }
        let ratio = ratio.max(0.1);
        let scale = (ratio as f32).powf(self.tilt * 0.85).max(0.12);
        let ratio_jitter = (ratio * 2.173 + self.waveform as f64 * 0.53).sin();
        let phase_jitter = (ratio * 1.618 + self.waveform as f64 * 0.37).sin();
        let shaped_ratio = (ratio
            * (1.0 + ratio_jitter * self.drift as f64 * 0.035 * (1.0 + ratio * 0.05)))
            .max(0.1);
        let shaped_phase = offset + phase_jitter * self.drift as f64 * 0.85;
        let weight = amplitude * scale;
        self.sum += (TAU * phase as f64 * shaped_ratio + shaped_phase).sin() as f32 * weight;
        self.weight += weight;
    }

    fn value(&self) -> f32 {
        if self.weight > 1e-6 {
            self.sum / self.weight
        } else {
            0.0
        }
    }
}

fn saw(phase: f32, limit: usize, partials: usize, tilt: f32, drift: f32, waveform: u32) -> f32 {
    let mut acc = Accumulator::new(tilt, drift, waveform);
    for harmonic in 1..=limit.min(partials) {
        acc.add(
            phase,
            harmonic as f64,
            1.0 / harmonic as f32,
            if harmonic % 2 == 0 { PI } else { 0.0 },
        );
    }
    acc.value()
}

/// Render the old wave recipe without a dynamic table or audio-thread allocation.
pub fn sample(
    waveform: u32,
    phase: f32,
    frequency: f32,
    sample_rate: f64,
    pulse_width: f32,
    partials: usize,
    tilt: f32,
    drift: f32,
) -> f32 {
    let partials = partials.clamp(1, MAX_HARMONICS);
    let max_ratio = ((sample_rate * 0.475) / frequency.abs().max(1.0) as f64).max(1.0);
    let harmonic_limit = (max_ratio.floor() as usize).clamp(1, MAX_HARMONICS);
    let sine = (TAU * phase as f64).sin() as f32;
    let mut acc = Accumulator::new(tilt, drift, waveform);
    let value = match waveform {
        1 => saw(phase, harmonic_limit, partials, tilt, drift, waveform),
        2 | 3 => {
            for index in 0..partials {
                let harmonic = index * 2 + 1;
                if harmonic > harmonic_limit {
                    break;
                }
                let offset = if waveform == 3 {
                    if index % 2 == 1 {
                        FRAC_PI_2
                    } else {
                        -FRAC_PI_2
                    }
                } else {
                    0.0
                };
                let amplitude = if waveform == 3 {
                    1.0 / (harmonic * harmonic) as f32
                } else {
                    1.0 / harmonic as f32
                };
                acc.add(phase, harmonic as f64, amplitude, offset);
            }
            acc.value()
        }
        4 => (sine * 0.45 + saw(phase, harmonic_limit, partials, tilt, drift, waveform) * 0.55)
            .clamp(-1.0, 1.0),
        5 => {
            for &(ratio, amplitude, offset) in NOISE_CLOUD.iter().take(partials) {
                if ratio <= max_ratio {
                    acc.add(phase, ratio, amplitude, offset);
                }
            }
            acc.value()
        }
        6 => {
            for harmonic in 1..=harmonic_limit.min(partials) {
                let coefficient =
                    (PI * harmonic as f64 * pulse_width.clamp(0.01, 0.99) as f64).sin();
                acc.add(
                    phase,
                    harmonic as f64,
                    coefficient.abs() as f32 / harmonic as f32,
                    if coefficient < 0.0 { PI } else { 0.0 },
                );
            }
            acc.value()
        }
        7 => {
            let mut sum = 0.0;
            let mut weight = 0.0;
            for &(cents, gain, offset) in SUPER_SAW.iter().take(partials) {
                let ratio = detune_multiplier(cents as f32);
                let layer_limit =
                    ((max_ratio / ratio).max(1.0).floor() as usize).clamp(1, MAX_HARMONICS);
                let layer_phase = (phase as f64 * ratio + offset / TAU).rem_euclid(1.0) as f32;
                sum += saw(layer_phase, layer_limit, partials, tilt, drift, waveform) * gain;
                weight += gain;
            }
            if weight > 1e-6 { sum / weight } else { 0.0 }
        }
        _ => sine,
    };
    let trim = match waveform {
        1 => 0.96,
        2 => 0.98,
        3 => 1.06,
        4 => 0.94,
        5 => 0.78,
        6 => 1.0,
        7 => 0.84,
        _ => 1.0,
    };
    (value * trim * (1.0 + (-tilt * 0.10).clamp(-0.12, 0.10)) * (1.0 - drift * 0.08))
        .clamp(-1.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::{PreparedRecipe, sample};

    #[test]
    fn recipes_are_finite_and_nyquist_bounded() {
        for waveform in 0..8 {
            for frequency in [30.0, 220.0, 4_000.0, 16_000.0] {
                for index in 0..128 {
                    let value = sample(
                        waveform,
                        index as f32 / 128.0,
                        frequency,
                        48_000.0,
                        0.25,
                        12,
                        0.4,
                        0.8,
                    );
                    assert!(value.is_finite() && value.abs() <= 1.0);
                }
            }
        }
    }

    #[test]
    fn prepared_lookup_tracks_direct_legacy_recipe_for_all_waveforms() {
        let mut prepared = PreparedRecipe::new();
        for waveform in 0..8 {
            prepared.rebuild(waveform, 8, 0.3, 0.2, 0.35);
            for frequency in [110.0, 440.0, 4_000.0] {
                for index in 0..64 {
                    let phase = index as f32 / 64.0;
                    let direct = sample(waveform, phase, frequency, 48_000.0, 0.35, 8, 0.3, 0.2);
                    let table = prepared.sample(phase, frequency, 48_000.0);
                    assert!(
                        (direct - table).abs() < 0.015,
                        "waveform {waveform} frequency {frequency} phase {phase}: {direct} {table}"
                    );
                }
            }
        }
    }
}
