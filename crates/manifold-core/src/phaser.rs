//! Scalar stereo port of the legacy six/twelve-stage all-pass PhaserNode.

const DEFAULTS: [f32; 5] = [0.4, 0.7, 6.0, 0.2, 90.0];

pub fn defaults() -> [f32; 5] {
    DEFAULTS
}

pub struct Phaser {
    sample_rate: f32,
    target: [f32; 5],
    current: [f32; 4],
    smooth: f32,
    z1: [[f32; 12]; 2],
    feedback_state: [f32; 2],
    phase: f32,
}

impl Phaser {
    pub fn new(sample_rate: f32, params: [f32; 5]) -> Self {
        let mut target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut target, id as u32, value);
        }
        let smooth = (1.0 - (-1.0 / (0.01 * sample_rate as f64)).exp()) as f32;
        Self {
            sample_rate,
            target,
            current: [target[0], target[1], target[3], target[4]],
            smooth: smooth.clamp(0.0001, 1.0),
            z1: [[0.0; 12]; 2],
            feedback_state: [0.0; 2],
            phase: 0.0,
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        set_value(&mut self.target, id, value)
    }

    pub fn reset(&mut self) {
        self.current = [
            self.target[0],
            self.target[1],
            self.target[3],
            self.target[4],
        ];
        self.z1 = [[0.0; 12]; 2];
        self.feedback_state = [0.0; 2];
        self.phase = 0.0;
    }

    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let [in_left, in_right] = input;
        let [out_left, out_right] = output;
        debug_assert_eq!(in_left.len(), out_left.len());
        debug_assert_eq!(in_right.len(), out_right.len());
        for frame in 0..in_left.len() {
            self.current[0] += (self.target[0] - self.current[0]) * self.smooth;
            self.current[1] += (self.target[1] - self.current[1]) * self.smooth;
            self.current[2] += (self.target[3] - self.current[2]) * self.smooth;
            self.current[3] += (self.target[4] - self.current[3]) * self.smooth;
            self.phase += self.current[0] / self.sample_rate;
            if self.phase >= 1.0 {
                self.phase -= 1.0;
            }
            let spread_phase = self.current[3] / 360.0;
            let stages = if self.target[2] >= 9.0 { 12 } else { 6 };
            let input_frame = [in_left[frame], in_right[frame]];
            let mut output_frame = [0.0; 2];
            for channel in 0..2 {
                let phase = self.phase + if channel == 0 { 0.0 } else { spread_phase };
                let lfo = (2.0 * std::f32::consts::PI * phase).sin();
                let frequency = (900.0 + lfo * 700.0 * self.current[1]).clamp(80.0, 4000.0);
                let g = (std::f32::consts::PI * frequency / self.sample_rate).tan();
                let a = (g - 1.0) / (g + 1.0);
                let mut x = input_frame[channel] + self.feedback_state[channel] * self.current[2];
                for stage in 0..stages {
                    let z = self.z1[channel][stage];
                    let y = -a * x + z;
                    self.z1[channel][stage] = x + a * y;
                    x = y;
                }
                self.feedback_state[channel] = x;
                output_frame[channel] = 0.5 * input_frame[channel] + 0.5 * x;
            }
            out_left[frame] = output_frame[0];
            out_right[frame] = output_frame[1];
        }
    }
}

pub fn set_value(values: &mut [f32; 5], id: u32, value: f32) -> bool {
    if !value.is_finite() {
        return false;
    }
    let bounded = match id {
        0 => value.clamp(0.1, 10.0),
        1 => value.clamp(0.0, 1.0),
        2 => {
            if value >= 9.0 {
                12.0
            } else {
                6.0
            }
        }
        3 => value.clamp(-0.95, 0.95),
        4 => value.clamp(0.0, 180.0),
        _ => return false,
    };
    values[id as usize] = bounded;
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stages_spread_and_feedback_produce_finite_stereo() {
        let mut phaser = Phaser::new(48_000.0, defaults());
        let mut input_l = [0.0; 512];
        let mut input_r = [0.0; 512];
        input_l[0] = 1.0;
        input_r[0] = -0.5;
        let mut output_l = [0.0; 512];
        let mut output_r = [0.0; 512];
        phaser.process_planar([&input_l, &input_r], [&mut output_l, &mut output_r]);
        assert!(output_l.iter().all(|value| value.is_finite()));
        assert!(output_r.iter().all(|value| value.is_finite()));
        assert_ne!(output_l, output_r);
        assert!(phaser.set_parameter(2, 12.0));
        assert!(phaser.set_parameter(3, -0.75));
        phaser.process_planar([&input_l, &input_r], [&mut output_l, &mut output_r]);
        assert!(output_l.iter().all(|value| value.is_finite()));
        assert!(!phaser.set_parameter(5, 0.0));
    }
}
