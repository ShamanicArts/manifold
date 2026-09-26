//! Stereo modulated delay port of the legacy ChorusNode scalar path.

pub const PARAM_COUNT: usize = 7;
const DEFAULTS: [f32; PARAM_COUNT] = [0.6, 0.45, 3.0, 0.7, 0.1, 0.0, 0.5];

pub fn defaults() -> [f32; PARAM_COUNT] {
    DEFAULTS
}

pub fn set_value(values: &mut [f32; PARAM_COUNT], id: u32, value: f32) -> bool {
    if !value.is_finite() {
        return false;
    }
    let bounded = match id {
        0 => value.clamp(0.05, 10.0),
        1 | 3 | 6 => value.clamp(0.0, 1.0),
        2 => value.round().clamp(1.0, 4.0),
        4 => value.clamp(0.0, 0.95),
        5 => value.round().clamp(0.0, 1.0),
        _ => return false,
    };
    values[id as usize] = bounded;
    true
}

pub struct Chorus {
    sample_rate: f32,
    target: [f32; PARAM_COUNT],
    current: [f32; 5],
    smooth: f32,
    phase: [[f32; 4]; 2],
    delay: [Vec<f32>; 2],
    write_index: usize,
}

impl Chorus {
    pub fn new(sample_rate: f32, max_block: usize, params: [f32; PARAM_COUNT]) -> Self {
        let mut target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut target, id as u32, value);
        }
        let size =
            ((sample_rate as f64 * 0.08_f32 as f64).ceil() as usize + max_block.max(8)).max(512);
        let smooth = (1.0 - (-1.0 / (0.01 * sample_rate as f64)).exp()) as f32;
        let mut phase = [[0.0; 4]; 2];
        for channel in 0..2 {
            for voice in 0..4 {
                phase[channel][voice] =
                    ((voice as f32 * 0.23) + if channel == 0 { 0.0 } else { 0.25 }) % 1.0;
            }
        }
        Self {
            sample_rate,
            target,
            current: [target[0], target[1], target[3], target[4], target[6]],
            smooth: smooth.clamp(0.0001, 1.0),
            phase,
            delay: [vec![0.0; size], vec![0.0; size]],
            write_index: 0,
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        set_value(&mut self.target, id, value)
    }

    fn read_delay(&self, channel: usize, delay_samples: f32) -> f32 {
        let size = self.delay[0].len();
        let mut position = self.write_index as f32 - delay_samples;
        while position < 0.0 {
            position += size as f32;
        }
        while position >= size as f32 {
            position -= size as f32;
        }
        let first = position as usize;
        let next = (first + 1) % size;
        let fraction = position - first as f32;
        let a = self.delay[channel][first];
        a + (self.delay[channel][next] - a) * fraction
    }

    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let [in_left, in_right] = input;
        let [out_left, out_right] = output;
        for frame in 0..in_left.len() {
            for (index, target) in [
                self.target[0],
                self.target[1],
                self.target[3],
                self.target[4],
                self.target[6],
            ]
            .into_iter()
            .enumerate()
            {
                self.current[index] += (target - self.current[index]) * self.smooth;
            }
            self.current[1] = self.current[1].clamp(0.0, 1.0);
            self.current[2] = self.current[2].clamp(0.0, 1.0);
            self.current[4] = self.current[4].clamp(0.0, 1.0);
            let voices = self.target[2] as usize;
            let phase_increment = self.current[0] / self.sample_rate;
            let depth_ms = self.current[1] * 20.0;
            let input_frame = [in_left[frame], in_right[frame]];
            let mut wet = [0.0; 2];
            for voice in 0..voices {
                let offset = (voice as f32 - (voices - 1) as f32 * 0.5) * 0.12;
                for channel in 0..2 {
                    self.phase[channel][voice] += phase_increment;
                    if self.phase[channel][voice] >= 1.0 {
                        self.phase[channel][voice] -= 1.0;
                    }
                    let phase = self.phase[channel][voice]
                        + offset
                        + if channel == 0 {
                            0.0
                        } else {
                            0.25 * self.current[2]
                        };
                    let wrapped = phase - phase.floor();
                    let lfo = if self.target[5] >= 0.5 {
                        4.0 * (wrapped - 0.5).abs() - 1.0
                    } else {
                        (2.0 * std::f32::consts::PI * wrapped).sin()
                    };
                    let delay_ms = 12.0 + depth_ms * (0.5 + 0.5 * lfo);
                    let delay_samples = (delay_ms * 0.001 * self.sample_rate)
                        .clamp(1.0, (self.delay[0].len() - 2) as f32);
                    wet[channel] += self.read_delay(channel, delay_samples);
                }
            }
            for channel in 0..2 {
                wet[channel] /= voices as f32;
            }
            out_left[frame] = input_frame[0] * (1.0 - self.current[4]) + wet[0] * self.current[4];
            out_right[frame] = input_frame[1] * (1.0 - self.current[4]) + wet[1] * self.current[4];
            for channel in 0..2 {
                self.delay[channel][self.write_index] =
                    input_frame[channel] + wet[channel] * self.current[3];
            }
            self.write_index += 1;
            if self.write_index >= self.delay[0].len() {
                self.write_index = 0;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn delayed_voices_survive_block_boundary_and_stay_finite() {
        let mut chorus = Chorus::new(48_000.0, 128, defaults());
        let mut left = [0.0; 1024];
        let right = [0.0; 1024];
        left[0] = 1.0;
        let mut output_l = [0.0; 1024];
        let mut output_r = [0.0; 1024];
        chorus.process_planar([&left, &right], [&mut output_l, &mut output_r]);
        assert!(output_l.iter().skip(500).any(|sample| sample.abs() > 0.0));
        assert!(output_l.iter().all(|sample| sample.is_finite()));
        assert!(chorus.set_parameter(2, 4.0));
        assert!(chorus.set_parameter(5, 1.0));
        assert!(!chorus.set_parameter(7, 0.0));
    }
}
