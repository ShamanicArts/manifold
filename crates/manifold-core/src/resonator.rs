//! Stereo Direct Form I bandpass from the original ResonatorNode.

use std::f32::consts::PI;

pub const PARAM_COUNT: usize = 3;
pub const DEFAULTS: [f32; PARAM_COUNT] = [1.0, 1000.0, 10.0];

pub fn set_value(params: &mut [f32; PARAM_COUNT], id: u32, value: f32) -> bool {
    if !value.is_finite() {
        return false;
    }
    let (low, high) = match id {
        0 => (0.0, 4.0),
        1 => (20.0, 20_000.0),
        2 => (0.01, 500.0),
        _ => return false,
    };
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
struct Coefficients {
    b0: f32,
    b2: f32,
    a1: f32,
    a2: f32,
}

fn coefficients(sample_rate: f32, gain: f32, frequency: f32, q: f32) -> Coefficients {
    let omega = 2.0 * PI * frequency.clamp(20.0, sample_rate * 0.45) / sample_rate;
    let alpha = omega.sin() / (2.0 * q.clamp(0.01, 500.0));
    let a0 = 1.0 + alpha;
    Coefficients {
        b0: (alpha / a0) * gain,
        b2: (-alpha / a0) * gain,
        a1: -2.0 * omega.cos() / a0,
        a2: (1.0 - alpha) / a0,
    }
}

pub struct Resonator {
    sample_rate: f32,
    target: [f32; PARAM_COUNT],
    current: [f32; PARAM_COUNT],
    states: [State; 2],
}

impl Resonator {
    pub fn new(sample_rate: f32, params: [f32; PARAM_COUNT]) -> Self {
        let mut target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut target, id as u32, value);
        }
        Self {
            sample_rate: if sample_rate > 1.0 {
                sample_rate
            } else {
                44_100.0
            },
            target,
            current: target,
            states: [State::default(); 2],
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        set_value(&mut self.target, id, value)
    }

    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let frames = input[0].len();
        assert_eq!(frames, input[1].len());
        assert_eq!(frames, output[0].len());
        assert_eq!(frames, output[1].len());
        if frames == 0 {
            return;
        }
        let target = [
            self.target[0],
            self.target[1].clamp(20.0, self.sample_rate * 0.45),
            self.target[2],
        ];
        let step = std::array::from_fn::<_, PARAM_COUNT, _>(|id| {
            (target[id] - self.current[id]) / frames as f32
        });
        let steady = if step == [0.0; PARAM_COUNT] {
            Some(coefficients(
                self.sample_rate,
                target[0],
                target[1],
                target[2],
            ))
        } else {
            None
        };
        let mut gain = self.current[0];
        let mut frequency = self.current[1];
        let mut q = self.current[2];
        for frame in 0..frames {
            gain += step[0];
            frequency += step[1];
            q += step[2];
            let coeff =
                steady.unwrap_or_else(|| coefficients(self.sample_rate, gain, frequency, q));
            for channel in 0..2 {
                let state = &mut self.states[channel];
                let x = input[channel][frame];
                let mut y =
                    coeff.b0 * x + coeff.b2 * state.x2 - coeff.a1 * state.y1 - coeff.a2 * state.y2;
                if !y.is_finite() {
                    y = 0.0;
                    *state = State::default();
                }
                state.x2 = state.x1;
                state.x1 = x;
                state.y2 = state.y1;
                state.y1 = y;
                output[channel][frame] = y;
            }
        }
        self.current = target;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn impulse_rings_and_parameters_reach_target_after_block() {
        let mut resonator = Resonator::new(48_000.0, DEFAULTS);
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        let mut impulse = [0.0; 128];
        impulse[0] = 1.0;
        resonator.process_planar([&impulse, &impulse], [&mut left, &mut right]);
        assert_eq!(left, right);
        assert!(left[0] > 0.0 && left[1] > 0.0);
        assert!(left.iter().all(|value| value.is_finite()));
        assert!(resonator.set_parameter(1, 2200.0));
        resonator.process_planar([&impulse, &impulse], [&mut left, &mut right]);
        assert_eq!(resonator.current[1], 2200.0);
        assert!(left.iter().all(|value| value.is_finite()));
    }
}
