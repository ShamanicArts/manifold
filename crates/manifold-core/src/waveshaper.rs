//! Scalar stereo port of the original WaveShaperNode. Its 2x/4x setting
//! only scales tone-filter cutoff in the legacy scalar path; no FIR is used.

pub const PARAM_COUNT: usize = 8;
pub const DEFAULTS: [f32; PARAM_COUNT] = [0.0, 12.0, 0.0, 0.0, 0.0, 0.0, 1.0, 2.0];

pub fn set_value(params: &mut [f32; PARAM_COUNT], id: u32, value: f32) -> bool {
    if !value.is_finite() {
        return false;
    }
    let bounded = match id {
        0 => value.round().clamp(0.0, 6.0),
        1 => value.clamp(0.0, 40.0),
        2 => value.clamp(-20.0, 20.0),
        3 | 4 => {
            if value <= 20.0 {
                0.0
            } else {
                value.clamp(20.0, 20_000.0)
            }
        }
        5 => value.clamp(-1.0, 1.0),
        6 => value.clamp(0.0, 1.0),
        7 => {
            if matches!(value as i32, 1 | 2 | 4) {
                value as i32 as f32
            } else {
                2.0
            }
        }
        _ => return false,
    };
    params[id as usize] = bounded;
    true
}

pub struct WaveShaper {
    sample_rate: f32,
    target: [f32; PARAM_COUNT],
    current: [f32; PARAM_COUNT],
    smoothing: f32,
    filter_smoothing: f32,
    pre_state: [f32; 2],
    post_state: [f32; 2],
    pre_coef: f32,
    post_coef: f32,
    oversample: i32,
}
impl WaveShaper {
    pub fn new(sample_rate: f32, params: [f32; PARAM_COUNT]) -> Self {
        let mut target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut target, id as u32, value);
        }
        let mut node = Self {
            sample_rate,
            target,
            current: target,
            smoothing: ((1.0 - (-1.0 / (0.01 * sample_rate as f64)).exp()) as f32)
                .clamp(0.0001, 1.0),
            filter_smoothing: ((1.0 - (-1.0 / (0.05 * sample_rate as f64)).exp()) as f32)
                .clamp(0.0001, 1.0),
            pre_state: [0.0; 2],
            post_state: [0.0; 2],
            pre_coef: 0.0,
            post_coef: 0.0,
            oversample: target[7] as i32,
        };
        node.update_filter_coefficients();
        node
    }
    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        set_value(&mut self.target, id, value)
    }
    pub fn reset(&mut self) {
        self.pre_state = [0.0; 2];
        self.post_state = [0.0; 2];
    }
    fn update_filter_coefficients(&mut self) {
        self.pre_coef = self.filter_coefficient(self.current[3]);
        self.post_coef = self.filter_coefficient(self.current[4]);
    }
    fn filter_coefficient(&self, frequency: f32) -> f32 {
        if frequency <= 20.0 {
            return 0.0;
        }
        let fc = frequency / self.oversample as f32;
        (-2.0 * std::f32::consts::PI * fc / self.sample_rate)
            .exp()
            .clamp(0.0, 0.999)
    }
    fn filter(input: f32, state: &mut f32, coefficient: f32) -> f32 {
        if coefficient <= 0.0 {
            return input;
        }
        let output = (1.0 - coefficient) * input + coefficient * *state;
        *state = output;
        output
    }
    fn shape(x: f32, curve: i32) -> f32 {
        match curve {
            1 => {
                if x >= 0.0 {
                    (x * 1.2).tanh()
                } else {
                    (x * 0.8).tanh() * 0.9
                }
            }
            2 => (2.0 / std::f32::consts::PI) * (x * 1.5).atan(),
            3 => x.clamp(-1.0, 1.0),
            4 => {
                let abs = x.abs();
                if abs <= 1.0 {
                    x
                } else {
                    let folded = (1.0 - (abs - 1.0)).clamp(-1.0, 1.0);
                    if x > 0.0 { folded } else { -folded }
                }
            }
            5 => x / (1.0 + x * x).sqrt(),
            6 => {
                if x.abs() <= 0.5 {
                    x
                } else {
                    let sign = if x > 0.0 { 1.0 } else { -1.0 };
                    sign * (0.5 + (x.abs() - 0.5).tanh() * 0.5)
                }
            }
            _ => x.tanh(),
        }
    }
    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let [in_l, in_r] = input;
        let [out_l, out_r] = output;
        if self.target[7] as i32 != self.oversample {
            self.oversample = self.target[7] as i32;
        }
        for (channel, (source, destination)) in
            [(in_l, out_l), (in_r, out_r)].into_iter().enumerate()
        {
            for (dry, out) in source.iter().zip(destination.iter_mut()) {
                for id in [1, 2, 5, 6] {
                    self.current[id] += (self.target[id] - self.current[id]) * self.smoothing;
                }
                for id in [3, 4] {
                    self.current[id] +=
                        (self.target[id] - self.current[id]) * self.filter_smoothing;
                }
                self.current[0] = self.target[0];
                if (self.current[3] - self.target[3]).abs() > 0.1
                    || (self.current[4] - self.target[4]).abs() > 0.1
                {
                    self.update_filter_coefficients();
                }
                let mut wet = Self::filter(*dry, &mut self.pre_state[channel], self.pre_coef);
                wet += self.current[5];
                wet *= 10.0f32.powf(self.current[1] * 0.05);
                wet = Self::shape(wet, self.current[0] as i32);
                wet *= 10.0f32.powf(self.current[2] * 0.05);
                wet = Self::filter(wet, &mut self.post_state[channel], self.post_coef);
                *out = *dry * (1.0 - self.current[6]) + wet * self.current[6];
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn seven_curves_stay_finite_and_bypass_preserves_stereo() {
        let mut node = WaveShaper::new(48_000.0, DEFAULTS);
        let left = [-2.0, -1.0, 0.0, 1.0, 2.0];
        let right = [0.2, 0.3, 0.4, 0.5, 0.6];
        let mut out_l = [0.0; 5];
        let mut out_r = [0.0; 5];
        for curve in 0..7 {
            node.set_parameter(0, curve as f32);
            node.process_planar([&left, &right], [&mut out_l, &mut out_r]);
            assert!(out_l.iter().chain(out_r.iter()).all(|x| x.is_finite()));
        }
        node.set_parameter(6, 0.0);
        let zero = [0.0; 2048];
        let mut rendered_l = [0.0; 2048];
        let mut rendered_r = [0.0; 2048];
        node.process_planar([&zero, &zero], [&mut rendered_l, &mut rendered_r]);
        assert!(
            rendered_l
                .iter()
                .chain(rendered_r.iter())
                .all(|x| x.is_finite())
        );
        let mut dry_l = [0.0; 5];
        let mut dry_r = [0.0; 5];
        node.process_planar([&left, &right], [&mut dry_l, &mut dry_r]);
        for (actual, expected) in dry_l.iter().zip(left) {
            assert!((actual - expected).abs() < 0.01);
        }
        for (actual, expected) in dry_r.iter().zip(right) {
            assert!((actual - expected).abs() < 0.01);
        }
    }
}
