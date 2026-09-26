//! Stereo port of the original FormantFilterNode.

use std::f32::consts::PI;

pub const PARAM_COUNT: usize = 5;
pub const DEFAULTS: [f32; PARAM_COUNT] = [0.0, 0.0, 6.0, 1.2, 1.0];
const LIMITS: [(f32, f32); PARAM_COUNT] = [
    (0.0, 4.0),
    (-12.0, 12.0),
    (1.0, 20.0),
    (0.5, 8.0),
    (0.0, 1.0),
];
const FORMANTS: [[f32; 3]; 5] = [
    [800.0, 1150.0, 2900.0],
    [400.0, 1700.0, 2600.0],
    [350.0, 1900.0, 2800.0],
    [450.0, 800.0, 2830.0],
    [325.0, 700.0, 2700.0],
];
const GAINS: [f32; 3] = [1.0, 0.8, 0.55];

pub fn set_value(params: &mut [f32; PARAM_COUNT], id: u32, value: f32) -> bool {
    let Some(&(low, high)) = LIMITS.get(id as usize) else {
        return false;
    };
    if !value.is_finite() {
        return false;
    }
    params[id as usize] = value.clamp(low, high);
    true
}

#[derive(Clone, Copy, Default)]
struct State {
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}

#[derive(Clone, Copy, Default)]
struct Coeffs {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
}

impl Coeffs {
    fn bandpass(sample_rate: f32, frequency: f32, q: f32) -> Self {
        let f = frequency.clamp(40.0, 16_000.0);
        let q = q.clamp(0.2, 50.0);
        let w0 = 2.0 * PI * f / sample_rate;
        let alpha = w0.sin() / (2.0 * q);
        let a0 = 1.0 + alpha;
        Self {
            b0: alpha / a0,
            b1: 0.0,
            b2: -alpha / a0,
            a1: -2.0 * w0.cos() / a0,
            a2: (1.0 - alpha) / a0,
        }
    }

    fn process(self, x: f32, state: &mut State) -> f32 {
        let y = self.b0 * x + self.b1 * state.x1 + self.b2 * state.x2
            - self.a1 * state.y1
            - self.a2 * state.y2;
        state.x2 = state.x1;
        state.x1 = x;
        state.y2 = state.y1;
        state.y1 = y;
        y
    }
}

pub struct FormantFilter {
    sample_rate: f32,
    target: [f32; PARAM_COUNT],
    current: [f32; PARAM_COUNT],
    last_coeff: [f32; 3],
    smooth: f32,
    coeffs: [Coeffs; 3],
    states: [[State; 3]; 2],
}

impl FormantFilter {
    pub fn new(sample_rate: f32, params: [f32; PARAM_COUNT]) -> Self {
        let rate = if sample_rate > 1.0 {
            sample_rate
        } else {
            44_100.0
        };
        let mut target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut target, id as u32, value);
        }
        let mut node = Self {
            sample_rate: rate,
            target,
            current: target,
            last_coeff: [0.0; 3],
            smooth: ((1.0 - (-1.0 / (0.01 * rate as f64)).exp()) as f32).clamp(0.0001, 1.0),
            coeffs: [Coeffs::default(); 3],
            states: [[State::default(); 3]; 2],
        };
        node.update_coeffs(true);
        node
    }

    pub fn reset_to(&mut self, params: [f32; PARAM_COUNT]) {
        self.target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut self.target, id as u32, value);
        }
        self.current = self.target;
        self.states = [[State::default(); 3]; 2];
        self.update_coeffs(true);
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        set_value(&mut self.target, id, value)
    }

    fn update_coeffs(&mut self, force: bool) {
        let current = [self.current[0], self.current[1], self.current[2]];
        if !force
            && (current[0] - self.last_coeff[0]).abs() <= 0.01
            && (current[1] - self.last_coeff[1]).abs() <= 0.02
            && (current[2] - self.last_coeff[2]).abs() <= 0.02
        {
            return;
        }
        let low = self.current[0].floor().clamp(0.0, 4.0) as usize;
        let high = (low + 1).min(4);
        let fraction = (self.current[0] - low as f32).clamp(0.0, 1.0);
        let shift = 2.0_f32.powf(self.current[1] / 12.0);
        for band in 0..3 {
            let base =
                FORMANTS[low][band] + fraction * (FORMANTS[high][band] - FORMANTS[low][band]);
            self.coeffs[band] = Coeffs::bandpass(self.sample_rate, base * shift, self.current[2]);
        }
        self.last_coeff = current;
    }

    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let [in_l, in_r] = input;
        let [out_l, out_r] = output;
        if self.target[4] <= 1.0e-4 && self.current[4] <= 1.0e-4 {
            out_l.copy_from_slice(in_l);
            out_r.copy_from_slice(in_r);
            return;
        }
        for frame in 0..in_l.len() {
            for id in 0..PARAM_COUNT {
                self.current[id] += (self.target[id] - self.current[id]) * self.smooth;
            }
            self.update_coeffs(false);
            for (ch, dry, out) in [
                (0, in_l[frame], &mut out_l[frame]),
                (1, in_r[frame], &mut out_r[frame]),
            ] {
                let driven = (dry * self.current[3]).tanh();
                let mut wet = 0.0;
                for (band, gain) in GAINS.into_iter().enumerate() {
                    wet += self.coeffs[band].process(driven, &mut self.states[ch][band]) * gain;
                }
                wet = wet.tanh();
                *out = dry * (1.0 - self.current[4]) + wet * self.current[4];
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dry_bypass_and_vowel_change_preserve_stereo() {
        let mut node = FormantFilter::new(48_000.0, [0.0, 0.0, 7.0, 1.4, 0.0]);
        let input_l = [0.2; 512];
        let input_r = [-0.15; 512];
        let mut out_l = [0.0; 512];
        let mut out_r = [0.0; 512];
        node.process_planar([&input_l, &input_r], [&mut out_l, &mut out_r]);
        assert_eq!(out_l, input_l);
        assert_eq!(out_r, input_r);
        node.set_parameter(0, 4.0);
        node.set_parameter(4, 1.0);
        node.process_planar([&input_l, &input_r], [&mut out_l, &mut out_r]);
        assert!(out_l[511].is_finite() && out_r[511].is_finite());
        assert_ne!(out_l[511], input_l[511]);
    }
}
