//! Three-band EQNode port: low/high shelves and a peaking mid band.

use std::f32::consts::PI;

pub const PARAM_COUNT: usize = 9;
pub const DEFAULTS: [f32; PARAM_COUNT] = [0.0, 120.0, 0.0, 1000.0, 0.7, 0.0, 8000.0, 0.0, 1.0];
const LIMITS: [(f32, f32); PARAM_COUNT] = [
    (-24.0, 24.0),
    (20.0, 400.0),
    (-24.0, 24.0),
    (120.0, 8000.0),
    (0.2, 12.0),
    (-24.0, 24.0),
    (2000.0, 16000.0),
    (-24.0, 24.0),
    (0.0, 1.0),
];

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

#[derive(Clone, Copy)]
struct Coeffs {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
}

impl Coeffs {
    fn normalized(b0: f32, b1: f32, b2: f32, a0: f32, a1: f32, a2: f32) -> Self {
        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
        }
    }
    fn peak(sr: f32, freq: f32, q: f32, db: f32) -> Self {
        let a = 10.0_f32.powf(db / 40.0);
        let w0 = 2.0 * PI * freq.clamp(20.0, 20_000.0) / sr;
        let cos = w0.cos();
        let alpha = w0.sin() / (2.0 * q.clamp(0.2, 50.0));
        Self::normalized(
            1.0 + alpha * a,
            -2.0 * cos,
            1.0 - alpha * a,
            1.0 + alpha / a,
            -2.0 * cos,
            1.0 - alpha / a,
        )
    }
    fn shelf(sr: f32, freq: f32, db: f32, high: bool) -> Self {
        let a = 10.0_f32.powf(db / 40.0);
        let w0 = 2.0 * PI * freq.clamp(20.0, 20_000.0) / sr;
        let cos = w0.cos();
        let alpha = w0.sin() / 2.0 * a.sqrt();
        if high {
            Self::normalized(
                a * ((a + 1.0) + (a - 1.0) * cos + 2.0 * alpha),
                -2.0 * a * ((a - 1.0) + (a + 1.0) * cos),
                a * ((a + 1.0) + (a - 1.0) * cos - 2.0 * alpha),
                (a + 1.0) - (a - 1.0) * cos + 2.0 * alpha,
                2.0 * ((a - 1.0) - (a + 1.0) * cos),
                (a + 1.0) - (a - 1.0) * cos - 2.0 * alpha,
            )
        } else {
            Self::normalized(
                a * ((a + 1.0) - (a - 1.0) * cos + 2.0 * alpha),
                2.0 * a * ((a - 1.0) - (a + 1.0) * cos),
                a * ((a + 1.0) - (a - 1.0) * cos - 2.0 * alpha),
                (a + 1.0) + (a - 1.0) * cos + 2.0 * alpha,
                -2.0 * ((a - 1.0) + (a + 1.0) * cos),
                (a + 1.0) + (a - 1.0) * cos - 2.0 * alpha,
            )
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

pub struct LegacyEq {
    sample_rate: f32,
    target: [f32; PARAM_COUNT],
    current: [f32; PARAM_COUNT],
    last_coeff: [f32; 7],
    smooth: f32,
    coeffs: [Coeffs; 3],
    state: [[State; 3]; 2],
}

impl LegacyEq {
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
        let identity = Coeffs {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
        };
        let mut eq = Self {
            sample_rate: rate,
            target,
            current: target,
            last_coeff: [0.0; 7],
            smooth: ((1.0 - (-1.0 / (0.01 * rate as f64)).exp()) as f32).clamp(0.0001, 1.0),
            coeffs: [identity; 3],
            state: [[State::default(); 3]; 2],
        };
        eq.update_coeffs(true);
        eq
    }

    pub fn reset(&mut self) {
        self.reset_to(self.target);
    }

    pub fn reset_to(&mut self, params: [f32; PARAM_COUNT]) {
        self.target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut self.target, id as u32, value);
        }
        self.current = self.target;
        self.state = [[State::default(); 3]; 2];
        self.update_coeffs(true);
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        set_value(&mut self.target, id, value)
    }

    fn update_coeffs(&mut self, force: bool) {
        let current = [
            self.current[0],
            self.current[1],
            self.current[2],
            self.current[3],
            self.current[4],
            self.current[5],
            self.current[6],
        ];
        let tolerances = [0.02, 0.5, 0.02, 0.5, 0.01, 0.02, 0.5];
        if !force
            && current
                .iter()
                .zip(self.last_coeff)
                .zip(tolerances)
                .all(|((&value, last), tolerance)| (value - last).abs() <= tolerance)
        {
            return;
        }
        self.coeffs[0] = Coeffs::shelf(self.sample_rate, self.current[1], self.current[0], false);
        self.coeffs[1] = Coeffs::peak(
            self.sample_rate,
            self.current[3],
            self.current[4],
            self.current[2],
        );
        self.coeffs[2] = Coeffs::shelf(self.sample_rate, self.current[6], self.current[5], true);
        self.last_coeff = current;
    }

    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let [in_l, in_r] = input;
        let [out_l, out_r] = output;
        if self.target[8] <= 1.0e-4 && self.current[8] <= 1.0e-4 {
            out_l.copy_from_slice(in_l);
            out_r.copy_from_slice(in_r);
            return;
        }
        for frame in 0..in_l.len() {
            for id in 0..PARAM_COUNT {
                self.current[id] += (self.target[id] - self.current[id]) * self.smooth;
            }
            self.update_coeffs(false);
            let gain = 10.0_f32.powf(self.current[7] / 20.0);
            for (ch, dry, out) in [
                (0, in_l[frame], &mut out_l[frame]),
                (1, in_r[frame], &mut out_r[frame]),
            ] {
                let mut x = dry;
                for band in 0..3 {
                    x = self.coeffs[band].process(x, &mut self.state[ch][band]);
                }
                x *= gain;
                *out = dry * (1.0 - self.current[8]) + x * self.current[8];
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dry_bypass_preserves_stereo_and_wet_shelves_change_it() {
        let mut eq = LegacyEq::new(
            48_000.0,
            [12.0, 120.0, 0.0, 1000.0, 0.7, -8.0, 8000.0, 0.0, 0.0],
        );
        let left = [0.25; 512];
        let right = [-0.3; 512];
        let mut out_l = [0.0; 512];
        let mut out_r = [0.0; 512];
        eq.process_planar([&left, &right], [&mut out_l, &mut out_r]);
        assert_eq!(out_l, left);
        assert_eq!(out_r, right);
        eq.set_parameter(8, 1.0);
        eq.process_planar([&left, &right], [&mut out_l, &mut out_r]);
        assert!(out_l[511] > left[511]);
        assert!(out_r[511] < right[511]);
    }
}
