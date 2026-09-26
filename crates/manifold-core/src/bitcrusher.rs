//! Scalar stereo port of the original BitCrusherNode, including optional bus B logic modes.

pub const PARAM_COUNT: usize = 5;
pub const DEFAULTS: [f32; PARAM_COUNT] = [8.0, 4.0, 1.0, 0.8, 0.0];

pub fn set_value(params: &mut [f32; PARAM_COUNT], id: u32, value: f32) -> bool {
    if !value.is_finite() || id as usize >= PARAM_COUNT {
        return false;
    }
    params[id as usize] = match id {
        0 => value.clamp(2.0, 16.0),
        1 => value.clamp(1.0, 64.0),
        2 => value.clamp(0.0, 1.0),
        3 => value.clamp(0.0, 2.0),
        4 => value.round().clamp(0.0, 2.0),
        _ => unreachable!(),
    };
    true
}

fn quantize_code(value: f32, max_code: i32) -> i32 {
    let scaled = ((value.clamp(-1.0, 1.0) + 1.0) * 0.5) * max_code as f32;
    (scaled.round() as i32).clamp(0, max_code)
}

pub struct BitCrusher {
    target: [f32; PARAM_COUNT],
    current: [f32; 4],
    smoothing: f32,
    held: [f32; 2],
    counters: [f32; 2],
}

impl BitCrusher {
    pub fn new(sample_rate: f32, params: [f32; PARAM_COUNT]) -> Self {
        let rate = if sample_rate > 1.0 {
            sample_rate
        } else {
            44100.0
        };
        let mut target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut target, id as u32, value);
        }
        Self {
            target,
            current: [target[0], target[1], target[2], target[3]],
            smoothing: ((1.0 - (-1.0 / (0.01 * rate as f64)).exp()) as f32).clamp(0.0001, 1.0),
            held: [0.0; 2],
            counters: [0.0; 2],
        }
    }

    pub fn reset_to(&mut self, params: [f32; PARAM_COUNT]) {
        self.target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut self.target, id as u32, value);
        }
        self.current = [
            self.target[0],
            self.target[1],
            self.target[2],
            self.target[3],
        ];
        self.held = [0.0; 2];
        self.counters = [0.0; 2];
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        set_value(&mut self.target, id, value)
    }

    pub fn process_planar(
        &mut self,
        input: [&[f32]; 2],
        bus_b: Option<[&[f32]; 2]>,
        output: [&mut [f32]; 2],
    ) {
        let [in_l, in_r] = input;
        let [out_l, out_r] = output;
        for frame in 0..in_l.len() {
            for id in 0..4 {
                self.current[id] += (self.target[id] - self.current[id]) * self.smoothing;
            }
            let levels = 2.0_f32.powf(self.current[0] - 1.0);
            let interval = self.current[1].max(1.0);
            for (channel, input, destination) in [
                (0, in_l[frame], &mut out_l[frame]),
                (1, in_r[frame], &mut out_r[frame]),
            ] {
                self.counters[channel] += 1.0;
                if self.counters[channel] >= interval {
                    self.counters[channel] -= interval;
                    let other = bus_b.map_or(0.0, |bus| bus[channel][frame]);
                    let wet = match (self.target[4] as u32, bus_b.is_some()) {
                        (1, true) => {
                            let max_code = ((levels * 2.0) as i32 - 1).max(1);
                            let a = quantize_code(input, max_code);
                            let b = quantize_code(other, max_code);
                            let middle = max_code / 2;
                            let xor = ((a - middle) ^ (b - middle)) + middle;
                            ((xor.clamp(0, max_code) as f32 / max_code as f32) * 2.0 - 1.0)
                                * self.current[3]
                        }
                        (2, true) => {
                            let quantized = (input * levels).round() / levels;
                            if other.abs() > 0.001 {
                                quantized * self.current[3]
                            } else {
                                0.0
                            }
                        }
                        _ => ((input * levels).round() / levels).clamp(-1.0, 1.0) * self.current[3],
                    };
                    self.held[channel] = wet;
                }
                *destination =
                    input * (1.0 - self.current[2]) + self.held[channel] * self.current[2];
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn held_sample_and_external_logic_work_across_blocks() {
        let mut crusher = BitCrusher::new(48_000.0, [4.0, 4.0, 1.0, 1.0, 0.0]);
        let input = [0.8; 8];
        let silent = [0.0; 8];
        let mut left = [0.0; 8];
        let mut right = [0.0; 8];
        crusher.process_planar([&input, &input], None, [&mut left, &mut right]);
        assert_eq!(left[0], 0.0);
        assert!(left[3] > 0.0);
        crusher.set_parameter(4, 2.0);
        crusher.process_planar(
            [&input, &input],
            Some([&silent, &silent]),
            [&mut left, &mut right],
        );
        assert_eq!(left[3], 0.0);
        assert_eq!(right[3], 0.0);
        crusher.reset_to([4.0, 4.0, 1.0, 1.0, 0.0]);
        crusher.process_planar([&silent, &silent], None, [&mut left, &mut right]);
        assert_eq!(left[0], 0.0);
    }
}
