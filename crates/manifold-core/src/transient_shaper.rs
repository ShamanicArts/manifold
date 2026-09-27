//! Scalar stereo port of the original dual-envelope TransientShaperNode.

pub const PARAM_COUNT: usize = 4;
pub const DEFAULTS: [f32; PARAM_COUNT] = [0.5, 0.0, 1.0, 1.0];

pub fn set_value(params: &mut [f32; PARAM_COUNT], id: u32, value: f32) -> bool {
    if !value.is_finite() || id as usize >= PARAM_COUNT {
        return false;
    }
    params[id as usize] = match id {
        0 | 1 => value.clamp(-1.0, 1.0),
        2 => value.clamp(0.1, 4.0),
        3 => value.clamp(0.0, 1.0),
        _ => unreachable!(),
    };
    true
}

pub struct TransientShaper {
    target: [f32; PARAM_COUNT],
    current: [f32; PARAM_COUNT],
    smoothing: f32,
    fast_attack: f32,
    fast_release: f32,
    slow_attack: f32,
    slow_release: f32,
    fast_env: [f32; 2],
    slow_env: [f32; 2],
    meter: f32,
}

impl TransientShaper {
    pub fn new(sample_rate: f32, params: [f32; PARAM_COUNT]) -> Self {
        let sample_rate = if sample_rate > 1.0 {
            sample_rate
        } else {
            44100.0
        };
        let mut target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut target, id as u32, value);
        }
        let coefficient = |ms: f32| {
            let seconds = (ms * 0.001).max(0.0001);
            1.0 - (-1.0 / (sample_rate * seconds)).exp()
        };
        Self {
            target,
            current: target,
            smoothing: ((1.0 - (-1.0 / (0.01 * sample_rate as f64)).exp()) as f32)
                .clamp(0.0001, 1.0),
            fast_attack: coefficient(1.0),
            fast_release: coefficient(20.0),
            slow_attack: coefficient(20.0),
            slow_release: coefficient(300.0),
            fast_env: [0.0; 2],
            slow_env: [0.0; 2],
            meter: 0.0,
        }
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
        self.fast_env = [0.0; 2];
        self.slow_env = [0.0; 2];
        self.meter = 0.0;
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        set_value(&mut self.target, id, value)
    }

    pub fn meter(&self) -> f32 {
        self.meter
    }

    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let [in_l, in_r] = input;
        let [out_l, out_r] = output;
        let mut transient_sum = 0.0f32;
        for frame in 0..in_l.len() {
            for id in 0..PARAM_COUNT {
                self.current[id] += (self.target[id] - self.current[id]) * self.smoothing;
            }
            for (channel, sample, destination) in [
                (0, in_l[frame], &mut out_l[frame]),
                (1, in_r[frame], &mut out_r[frame]),
            ] {
                let level = sample.abs();
                let fast = if level > self.fast_env[channel] {
                    self.fast_attack
                } else {
                    self.fast_release
                };
                let slow = if level > self.slow_env[channel] {
                    self.slow_attack
                } else {
                    self.slow_release
                };
                self.fast_env[channel] += (level - self.fast_env[channel]) * fast;
                self.slow_env[channel] += (level - self.slow_env[channel]) * slow;
                let transient = (self.fast_env[channel] - self.slow_env[channel]) * self.current[2];
                let body = (self.slow_env[channel] - self.fast_env[channel]) * self.current[2];
                let attack_gain = (1.0 + self.current[0] * transient * 6.0).clamp(0.0, 4.0);
                let sustain_gain = (1.0 + self.current[1] * body * 4.0).clamp(0.0, 4.0);
                let wet = sample * (attack_gain * sustain_gain).clamp(0.0, 4.0);
                *destination = sample * (1.0 - self.current[3]) + wet * self.current[3];
                transient_sum += transient.abs();
            }
        }
        self.meter = transient_sum / (in_l.len() * 2).max(1) as f32;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn transient_gain_and_meter_follow_an_attack() {
        let mut node = TransientShaper::new(48_000.0, [1.0, 0.0, 2.0, 1.0]);
        let input = [1.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        node.process_planar([&input, &input], [&mut left, &mut right]);
        assert!(left[127] > input[127]);
        assert!(node.meter() > 0.0);
        node.reset_to([0.0, 0.0, 1.0, 0.0]);
        assert_eq!(node.meter(), 0.0);
    }
}
