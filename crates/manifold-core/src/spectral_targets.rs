//! Prepared Add and Morph partial recipes. All functions run on the control or
//! worker side; the audio callback only consumes a bounded `PartialSet`.

use crate::sine_bank::{MAX_PARTIALS, Partial, PartialSet};

#[derive(Clone, Copy, Debug, Default)]
pub struct SpectralShape {
    pub stretch: f32,
    /// 0 = neutral, 1 = brighter, 2 = darker.
    pub tilt_mode: u8,
}

#[derive(Clone, Copy, Debug)]
pub enum AddFlavor {
    SelfResynthesis,
    Driven { waveform: u8, pulse_width: f32 },
}

#[derive(Clone, Copy, Debug)]
pub struct WaveRecipe {
    pub waveform: u8,
    pub count: usize,
    pub tilt: f32,
    pub drift: f32,
    pub pulse_width: f32,
}

#[derive(Clone, Copy, Debug)]
pub struct MorphRecipe {
    pub position: f32,
    pub depth: f32,
    /// 0 = linear, 1 = eased, 2 = equal power.
    pub curve: u8,
}

fn empty() -> PartialSet {
    PartialSet {
        fundamental: 1.0,
        ..PartialSet::default()
    }
}

pub fn shape_partials(source: &PartialSet, shape: SpectralShape) -> PartialSet {
    let stretch = shape.stretch.clamp(0.0, 1.0);
    let tilt = shape.tilt_mode.min(2);
    if source.count == 0 || (stretch <= 0.001 && tilt == 0) {
        return *source;
    }
    let mut result = *source;
    for (index, partial) in result.partials[..result.count].iter_mut().enumerate() {
        let spectral_position = if result.count > 1 {
            index as f32 / (result.count - 1) as f32
        } else {
            0.0
        };
        if partial.frequency > 0.01 && stretch > 0.001 {
            let power = 1.0 + stretch * 0.65;
            let bias = 1.0 + index as f32 * stretch * 0.035;
            partial.frequency = partial.frequency.powf(power) * bias;
        }
        if partial.amplitude > 0.0 {
            partial.amplitude *= match tilt {
                1 => 0.90 + spectral_position * 1.75,
                2 => (1.12 - spectral_position * 0.78).max(0.18),
                _ => 1.0,
            };
        }
    }
    result
}

pub fn normalize_ratio(source: &PartialSet) -> PartialSet {
    if source.count == 0 {
        return empty();
    }
    let fundamental = if source.fundamental > 1e-6 {
        source.fundamental
    } else {
        source.partials[0].frequency
    };
    if fundamental <= 1e-6 {
        return empty();
    }
    let mut result = *source;
    result.fundamental = 1.0;
    for partial in &mut result.partials[..result.count] {
        partial.frequency = if partial.frequency > 0.0 {
            (partial.frequency / fundamental).max(0.01)
        } else {
            0.0
        };
        partial.amplitude = partial.amplitude.max(0.0);
        partial.decay_rate = partial.decay_rate.max(0.0);
    }
    result
}

fn driven_weight(waveform: u8, harmonic: usize, pulse_width: f32) -> f32 {
    let h = harmonic.max(1) as f32;
    match waveform.min(7) {
        0 => {
            if harmonic == 1 {
                1.0
            } else {
                0.0
            }
        }
        1 => 1.0 / h,
        2 => {
            if harmonic % 2 == 1 {
                1.0 / h
            } else {
                0.0
            }
        }
        3 => {
            if harmonic % 2 == 1 {
                1.0 / (h * h)
            } else {
                0.0
            }
        }
        4 => (if harmonic == 1 { 0.45 } else { 0.0 }) + 0.55 / h,
        5 => 1.0 / h.sqrt(),
        6 => {
            ((std::f64::consts::PI as f32) * h * pulse_width.clamp(0.01, 0.99))
                .sin()
                .abs()
                / h
        }
        _ => (1.0 / h) * (1.0 + 0.22 * (h * 0.73).cos() + 0.15 * (h * 1.11).sin()),
    }
}

pub fn driven_sample(source: &PartialSet, waveform: u8, pulse_width: f32) -> PartialSet {
    if source.count == 0 || source.fundamental <= 0.0 {
        return *source;
    }
    let mut weighted = [Partial::default(); 8];
    let count = source.count.min(8);
    let mut maximum = 0.0f32;
    for (index, slot) in weighted[..count].iter_mut().enumerate() {
        *slot = source.partials[index];
        slot.amplitude =
            slot.amplitude.max(0.0) * driven_weight(waveform, index + 1, pulse_width).max(0.0);
        maximum = maximum.max(slot.amplitude);
    }
    if maximum <= 1e-6 {
        return empty();
    }
    let mut result = PartialSet {
        fundamental: source.fundamental,
        ..PartialSet::default()
    };
    for partial in weighted[..count].iter().copied() {
        if partial.amplitude > maximum * 0.02 {
            result.partials[result.count] = Partial {
                amplitude: partial.amplitude / maximum,
                ..partial
            };
            result.count += 1;
        }
    }
    result
}

pub fn prepare_add_target(
    source: &PartialSet,
    shape: SpectralShape,
    flavor: AddFlavor,
) -> PartialSet {
    if source.count == 0 || source.fundamental <= 0.0 {
        return empty();
    }
    let shaped = shape_partials(source, shape);
    let partials = match flavor {
        AddFlavor::SelfResynthesis => shaped,
        AddFlavor::Driven {
            waveform,
            pulse_width,
        } => driven_sample(&shaped, waveform, pulse_width),
    };
    clamp_for_bank(normalize_ratio(&partials))
}

pub fn morph_ratio(wave: &PartialSet, sample: &PartialSet, recipe: MorphRecipe) -> PartialSet {
    if wave.count == 0 {
        return *sample;
    }
    if sample.count == 0 {
        return *wave;
    }
    let position = recipe.position.clamp(0.0, 1.0);
    let depth = recipe.depth.clamp(0.0, 1.0);
    let (a, b) = match recipe.curve.min(2) {
        0 => (1.0 - position, position),
        1 => {
            let t = 0.5 - 0.5 * (position * (std::f64::consts::PI as f32)).cos();
            (1.0 - t, t)
        }
        _ => (
            (position * (std::f64::consts::FRAC_PI_2 as f32)).cos(),
            (position * (std::f64::consts::FRAC_PI_2 as f32)).sin(),
        ),
    };
    let mut result = empty();
    result.count = wave.count.max(sample.count);
    let frequency_t = position * depth;
    for index in 0..result.count {
        let pa = if index < wave.count {
            wave.partials[index]
        } else {
            Partial::default()
        };
        let pb = if index < sample.count {
            sample.partials[index]
        } else {
            Partial::default()
        };
        let frequency = if pa.frequency <= 0.01 && pb.frequency <= 0.01 {
            0.0
        } else if pa.frequency <= 0.01 {
            pb.frequency
        } else if pb.frequency <= 0.01 {
            pa.frequency
        } else {
            (pa.frequency.ln() + (pb.frequency.ln() - pa.frequency.ln()) * frequency_t).exp()
        };
        result.partials[index] = Partial {
            frequency,
            amplitude: pa.amplitude * a + pb.amplitude * b,
            phase: pa.phase + (pb.phase - pa.phase) * position,
            decay_rate: pa.decay_rate + (pb.decay_rate - pa.decay_rate) * position,
        };
    }
    result
}

pub fn prepare_morph_target(
    wave: &PartialSet,
    source: &PartialSet,
    recipe: MorphRecipe,
    shape: SpectralShape,
) -> PartialSet {
    let sample_ratio = if source.count > 0 && source.fundamental > 0.0 {
        normalize_ratio(source)
    } else {
        empty()
    };
    clamp_for_bank(shape_partials(
        &morph_ratio(wave, &sample_ratio, recipe),
        shape,
    ))
}

fn clamp_for_bank(mut target: PartialSet) -> PartialSet {
    // The original SineBankNode::setPartials applies this bound after the
    // recipe pipeline, so intermediate Add ratios remain untouched.
    for partial in &mut target.partials[..target.count] {
        partial.frequency = partial.frequency.clamp(0.0, 24_000.0);
    }
    target
}

const NOISE_CLOUD: [(f32, f32, f32); 12] = [
    (1.0, 1.0, 0.0),
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

pub fn build_wave_recipe(recipe: WaveRecipe) -> PartialSet {
    let waveform = recipe.waveform.min(7);
    let limit = recipe.count.clamp(1, MAX_PARTIALS);
    let mut result = empty();
    if waveform == 0 {
        result.count = 1;
        result.partials[0] = Partial {
            frequency: 1.0,
            amplitude: 1.0,
            ..Partial::default()
        };
        return result;
    }
    let mut amplitude_sum = 0.0f32;
    if waveform == 4 {
        result.partials[0] = Partial {
            frequency: 1.0,
            amplitude: 0.45,
            ..Partial::default()
        };
        result.count = 1;
        amplitude_sum = 0.45;
    }
    let mut push = |harmonic: usize, base_amplitude: f32, base_phase: f32, ratio: f32| {
        if result.count >= MAX_PARTIALS {
            return;
        }
        let h = harmonic as f32;
        let tilt = h.powf(recipe.tilt.clamp(-1.0, 1.0) * 0.85).max(0.12);
        let drift = recipe.drift.clamp(0.0, 1.0);
        let jitter = 1.0
            + ((harmonic as f64 * 2.173 + waveform as f64 * 0.53).sin() as f32)
                * drift
                * 0.035
                * (1.0 + h * 0.05);
        let phase_jitter =
            ((harmonic as f64 * 1.618 + waveform as f64 * 0.37).sin() as f32) * drift * 0.85;
        let amplitude = base_amplitude * tilt;
        result.partials[result.count] = Partial {
            frequency: ratio * jitter,
            amplitude,
            phase: base_phase + phase_jitter,
            decay_rate: 0.0,
        };
        result.count += 1;
        amplitude_sum += amplitude;
    };
    match waveform {
        1 | 7 => {
            for h in 1..=limit {
                let scale = if waveform == 7 { 0.84 } else { 1.0 };
                push(
                    h,
                    scale / h as f32,
                    if h % 2 == 0 {
                        std::f32::consts::PI
                    } else {
                        0.0
                    },
                    h as f32,
                );
            }
        }
        2 => {
            for slot in 0..limit {
                let h = slot * 2 + 1;
                push(h, 1.0 / h as f32, 0.0, h as f32);
            }
        }
        3 => {
            for slot in 0..limit {
                let h = slot * 2 + 1;
                let phase = if slot % 2 == 1 {
                    std::f32::consts::FRAC_PI_2
                } else {
                    -std::f32::consts::FRAC_PI_2
                };
                push(h, 1.0 / (h * h) as f32, phase, h as f32);
            }
        }
        4 => {
            for h in 2..=limit + 1 {
                push(
                    h,
                    0.55 / h as f32,
                    if h % 2 == 0 {
                        std::f32::consts::PI
                    } else {
                        0.0
                    },
                    h as f32,
                );
            }
        }
        5 => {
            for (index, (ratio, amplitude, phase)) in NOISE_CLOUD.iter().copied().enumerate() {
                push(index + 1, amplitude, phase, ratio);
            }
        }
        6 => {
            for h in 1..=limit {
                let coefficient = ((std::f64::consts::PI as f32)
                    * h as f32
                    * recipe.pulse_width.clamp(0.01, 0.99))
                .sin();
                push(
                    h,
                    coefficient.abs() / h as f32,
                    if coefficient < 0.0 {
                        std::f32::consts::PI
                    } else {
                        0.0
                    },
                    h as f32,
                );
            }
        }
        _ => unreachable!(),
    }
    if amplitude_sum > 1e-6 {
        for partial in &mut result.partials[..result.count] {
            partial.amplitude /= amplitude_sum;
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_wave_recipes_produce_bounded_targets() {
        for waveform in 0..8 {
            let target = build_wave_recipe(WaveRecipe {
                waveform,
                count: 8,
                tilt: 0.2,
                drift: 0.3,
                pulse_width: 0.35,
            });
            assert!(target.count > 0 && target.count <= MAX_PARTIALS);
            assert!(target.validate());
        }
    }

    #[test]
    fn add_and_morph_have_useful_missing_source_behavior() {
        let silent = empty();
        let wave = build_wave_recipe(WaveRecipe {
            waveform: 1,
            count: 8,
            tilt: 0.0,
            drift: 0.0,
            pulse_width: 0.5,
        });
        let add = prepare_add_target(
            &silent,
            SpectralShape::default(),
            AddFlavor::SelfResynthesis,
        );
        assert_eq!(add.count, 0);
        let morph = prepare_morph_target(
            &wave,
            &silent,
            MorphRecipe {
                position: 0.7,
                depth: 0.8,
                curve: 2,
            },
            SpectralShape::default(),
        );
        assert_eq!(morph.count, wave.count);
        assert!(morph.validate());
        let mut unreliable = wave;
        unreliable.fundamental = 0.0;
        let ignored = prepare_morph_target(
            &wave,
            &unreliable,
            MorphRecipe {
                position: 0.7,
                depth: 0.8,
                curve: 2,
            },
            SpectralShape::default(),
        );
        assert_eq!(ignored.count, wave.count);
        assert_eq!(ignored.partials[0].frequency, wave.partials[0].frequency);
    }
}
