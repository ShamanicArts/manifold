//! Scalar port of the legacy CompressorNode. The detector envelope is shared by
//! the two channels and attack/release coefficients are fixed at preparation.

pub const PARAM_COUNT: usize = 11;

pub fn defaults() -> [f32; PARAM_COUNT] {
    [-12.0, 4.0, 10.0, 100.0, 6.0, 0.0, 1.0, 0.0, 0.0, 20.0, 1.0]
}

pub fn set_value(params: &mut [f32; PARAM_COUNT], id: u32, value: f32) -> bool {
    if !value.is_finite() {
        return false;
    }
    let index = id as usize;
    if index >= PARAM_COUNT {
        return false;
    }
    params[index] = match id {
        0 => value.clamp(-60.0, 0.0),
        1 => value.clamp(1.0, 100.0),
        2 => value.clamp(0.01, 500.0),
        3 => value.clamp(1.0, 5000.0),
        4 => value.clamp(0.0, 20.0),
        5 => value.clamp(0.0, 40.0),
        6 => f32::from(value >= 0.5),
        7 | 8 => value.round(),
        9 => value.clamp(20.0, 1000.0),
        10 => value.clamp(0.0, 1.0),
        _ => unreachable!(),
    };
    true
}

pub struct Compressor {
    params: [f32; PARAM_COUNT],
    attack_coefficient: f32,
    release_coefficient: f32,
    envelope: f32,
}

impl Compressor {
    pub fn new(sample_rate: f32, values: [f32; PARAM_COUNT]) -> Self {
        let mut params = defaults();
        for (id, value) in values.into_iter().enumerate() {
            assert!(set_value(&mut params, id as u32, value));
        }
        let attack_time = params[2] * 0.001;
        let release_time = params[3] * 0.001;
        Self {
            params,
            attack_coefficient: (-1.0 / (sample_rate * attack_time))
                .exp()
                .clamp(0.0001, 0.9999),
            release_coefficient: (-1.0 / (sample_rate * release_time))
                .exp()
                .clamp(0.0001, 0.9999),
            envelope: 0.0,
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        // Legacy attack/release setters do not rebuild prepared coefficients.
        set_value(&mut self.params, id, value)
    }

    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let [left, right] = input;
        let [out_left, out_right] = output;
        let threshold = self.params[0];
        let ratio = self.params[1];
        let makeup = self.params[5];
        let mix = self.params[10];
        for frame in 0..left.len() {
            for channel in 0..2 {
                let sample = if channel == 0 {
                    left[frame]
                } else {
                    right[frame]
                };
                let level = sample.abs();
                let over_threshold = if level > 0.0 {
                    20.0 * level.log10() - threshold
                } else {
                    -100.0
                };
                let target_reduction = if over_threshold > 0.0 {
                    over_threshold * (1.0 - 1.0 / ratio)
                } else {
                    0.0
                };
                if target_reduction > self.envelope {
                    self.envelope = self.attack_coefficient * self.envelope
                        + (1.0 - self.attack_coefficient) * target_reduction;
                } else {
                    self.envelope = self.release_coefficient * self.envelope
                        + (1.0 - self.release_coefficient) * target_reduction;
                }
                let gain = 10.0_f32.powf((-self.envelope + makeup) * 0.05);
                let value = sample * (1.0 - mix) + sample * gain * mix;
                if channel == 0 {
                    out_left[frame] = value;
                } else {
                    out_right[frame] = value;
                }
            }
        }
    }

    /// Legacy telemetry is negative dB for reduction.
    pub fn gain_reduction_db(&self) -> f32 {
        -self.envelope
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compresses_stereo_and_reports_reduction() {
        let mut compressor = Compressor::new(48_000.0, defaults());
        let left = [0.9; 512];
        let right = [0.7; 512];
        let mut out_left = [0.0; 512];
        let mut out_right = [0.0; 512];
        compressor.process_planar([&left, &right], [&mut out_left, &mut out_right]);
        assert!(out_left[511] < 0.9 && out_right[511] < 0.7);
        assert!(compressor.gain_reduction_db() < 0.0);
        assert!(!compressor.set_parameter(0, f32::NAN));
    }
}
