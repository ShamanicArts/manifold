//! Scalar stereo port of the original eight-tap delay. All delay storage is prepared upfront.

pub const PARAM_COUNT: usize = 27;
pub const DEFAULTS: [f32; PARAM_COUNT] = [
    4.0,
    0.3,
    0.5, // tap count, feedback, mix
    120.0,
    0.5,
    -0.5,
    240.0,
    0.25,
    0.5,
    360.0,
    0.5 / 3.0,
    -0.5,
    480.0,
    0.125,
    0.5,
    600.0,
    0.1,
    -0.5,
    720.0,
    0.5 / 6.0,
    0.5,
    840.0,
    0.5 / 7.0,
    -0.5,
    960.0,
    0.0625,
    0.5,
];

pub fn set_value(params: &mut [f32; PARAM_COUNT], id: u32, value: f32) -> bool {
    if !value.is_finite() || id as usize >= PARAM_COUNT {
        return false;
    }
    params[id as usize] = match id {
        0 => value.round().clamp(1.0, 8.0),
        1 => value.clamp(0.0, 0.95),
        2 => value.clamp(0.0, 1.0),
        _ if (id - 3) % 3 == 0 => value.clamp(1.0, 3000.0),
        _ if (id - 3) % 3 == 1 => value.clamp(0.0, 1.0),
        _ => value.clamp(-1.0, 1.0),
    };
    true
}

pub struct MultitapDelay {
    target: [f32; PARAM_COUNT],
    current_feedback: f32,
    current_mix: f32,
    smooth: f32,
    sample_rate: f32,
    buffer: [Vec<f32>; 2],
    stamps: [Vec<u32>; 2],
    generation: u32,
    write_index: usize,
    dormant_bypass: bool,
}

impl MultitapDelay {
    pub fn new(sample_rate: f32, max_frames: usize, params: [f32; PARAM_COUNT]) -> Self {
        let mut target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut target, id as u32, value);
        }
        let sample_rate = if sample_rate > 1.0 {
            sample_rate
        } else {
            44100.0
        };
        let size = (sample_rate * 4.0) as usize + max_frames.max(16);
        let smooth = ((1.0 - (-1.0 / (0.01 * sample_rate as f64)).exp()) as f32).clamp(0.0001, 1.0);
        Self {
            target,
            current_feedback: target[1],
            current_mix: target[2],
            smooth,
            sample_rate,
            buffer: std::array::from_fn(|_| vec![0.0; size]),
            stamps: std::array::from_fn(|_| vec![0; size]),
            generation: 1,
            write_index: 0,
            dormant_bypass: false,
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        set_value(&mut self.target, id, value)
    }

    pub fn reset_to(&mut self, params: [f32; PARAM_COUNT]) {
        self.clear_delay();
        self.dormant_bypass = false;
        self.target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut self.target, id as u32, value);
        }
        self.current_feedback = self.target[1];
        self.current_mix = self.target[2];
    }

    fn read(&self, channel: usize, delay_samples: f32) -> f32 {
        let size = self.buffer[channel].len();
        let mut position = self.write_index as f32 - delay_samples;
        if position < 0.0 {
            position += size as f32;
        }
        if position >= size as f32 {
            position -= size as f32;
        }
        let index = position as usize;
        let next = if index + 1 == size { 0 } else { index + 1 };
        let fraction = position - index as f32;
        let a = if self.stamps[channel][index] == self.generation {
            self.buffer[channel][index]
        } else {
            0.0
        };
        let b = if self.stamps[channel][next] == self.generation {
            self.buffer[channel][next]
        } else {
            0.0
        };
        a + (b - a) * fraction
    }

    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let [in_l, in_r] = input;
        let [out_l, out_r] = output;
        let target_feedback = self.target[1];
        let target_mix = self.target[2];
        let dormant = target_mix <= 1e-4
            && self.current_mix <= 1e-4
            && target_feedback <= 1e-4
            && self.current_feedback <= 1e-4;
        if dormant {
            if !self.dormant_bypass {
                self.clear_delay();
                self.dormant_bypass = true;
            }
            out_l.copy_from_slice(in_l);
            out_r.copy_from_slice(in_r);
            return;
        }
        if self.dormant_bypass {
            self.clear_delay();
            self.dormant_bypass = false;
        }
        for frame in 0..in_l.len() {
            self.current_feedback += (target_feedback - self.current_feedback) * self.smooth;
            self.current_mix += (target_mix - self.current_mix) * self.smooth;
            let mut wet = [0.0f32; 2];
            for tap in 0..self.target[0] as usize {
                let offset = 3 + tap * 3;
                let delay_samples = self.target[offset] * 0.001 * self.sample_rate;
                let delayed = [self.read(0, delay_samples), self.read(1, delay_samples)];
                let mono = 0.5 * (delayed[0] + delayed[1]) * self.target[offset + 1];
                let pan = self.target[offset + 2];
                wet[0] += mono * (0.5 * (1.0 - pan)).sqrt();
                wet[1] += mono * (0.5 * (1.0 + pan)).sqrt();
            }
            self.buffer[0][self.write_index] = in_l[frame] + wet[0] * self.current_feedback;
            self.buffer[1][self.write_index] = in_r[frame] + wet[1] * self.current_feedback;
            self.stamps[0][self.write_index] = self.generation;
            self.stamps[1][self.write_index] = self.generation;
            self.write_index += 1;
            if self.write_index == self.buffer[0].len() {
                self.write_index = 0;
            }
            let dry = 1.0 - self.current_mix;
            out_l[frame] = in_l[frame] * dry + wet[0] * self.current_mix;
            out_r[frame] = in_r[frame] * dry + wet[1] * self.current_mix;
        }
    }

    fn clear_delay(&mut self) {
        self.generation = self.generation.wrapping_add(1);
        if self.generation == 0 {
            for channel in &mut self.stamps {
                channel.fill(0);
            }
            self.generation = 1;
        }
        self.write_index = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn tap_arrives_after_block_boundary_and_reset_clears_tail() {
        let mut params = DEFAULTS;
        params[0] = 1.0;
        params[1] = 0.0;
        params[2] = 1.0;
        params[3] = 10.0;
        params[4] = 1.0;
        params[5] = 0.0;
        let mut delay = MultitapDelay::new(48_000.0, 128, params);
        let mut input = [0.0; 512];
        input[0] = 1.0;
        let silence = [0.0; 512];
        let mut left = [0.0; 512];
        let mut right = [0.0; 512];
        delay.process_planar([&input, &silence], [&mut left, &mut right]);
        assert!(left[480] > 0.1 && right[480] > 0.1);
        delay.reset_to(params);
        delay.process_planar([&silence, &silence], [&mut left, &mut right]);
        assert!(
            left.iter()
                .chain(right.iter())
                .all(|value| value.abs() < 1e-6)
        );
    }
}
