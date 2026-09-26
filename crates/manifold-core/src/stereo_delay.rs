//! Prepared stereo delay ring buffers. Parameter IDs follow the legacy node's controls.

const DEFAULTS: [f32; 16] = [
    250.0, 375.0, 0.3, 0.0, 0.0, 4000.0, 0.5, 0.5, 0.0, 1.0, 0.0, 0.0, 0.0, 3.0, 6.0, 120.0,
];

pub fn defaults() -> [f32; 16] {
    DEFAULTS
}

pub fn set_value(params: &mut [f32; 16], id: u32, value: f32) -> bool {
    if !value.is_finite() {
        return false;
    }
    let range = match id {
        0 | 1 => (1.0, 5000.0),
        2 => (0.0, 1.2),
        3 | 7 | 9 | 11 => (0.0, 1.0),
        4 | 8 | 10 | 12 => (0.0, 1.0),
        5 => (20.0, 20_000.0),
        6 => (0.0, 1.0),
        13 | 14 => (0.0, 10.0),
        15 => (20.0, 300.0),
        _ => return false,
    };
    params[id as usize] = if matches!(id, 4 | 8 | 10 | 12) {
        f32::from(value >= 0.5)
    } else if matches!(id, 13 | 14) {
        value.round().clamp(range.0, range.1)
    } else {
        value.clamp(range.0, range.1)
    };
    true
}

pub struct StereoDelay {
    sample_rate: f32,
    left: Vec<f32>,
    right: Vec<f32>,
    valid: Vec<u32>,
    generation: u32,
    write: usize,
    current: [f32; 12],
    target: [f32; 16],
    time_smoothing: f32,
    other_smoothing: f32,
    filter_z: [f32; 2],
    duck_envelope: f32,
    dormant_bypass: bool,
}

impl StereoDelay {
    pub fn new(sample_rate: f32, params: [f32; 16]) -> Self {
        let mut initial = defaults();
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut initial, id as u32, value);
        }
        let size = ((sample_rate as f64 * 5.0) as usize).max(1024);
        let time_smoothing = (1.0 - (-1.0 / (0.020 * sample_rate as f64)).exp()) as f32;
        let other_smoothing = (1.0 - (-1.0 / (0.010 * sample_rate as f64)).exp()) as f32;
        Self {
            sample_rate,
            left: vec![0.0; size],
            right: vec![0.0; size],
            valid: vec![0; size],
            generation: 1,
            write: 0,
            current: initial[..12].try_into().unwrap(),
            target: initial,
            time_smoothing: time_smoothing.clamp(0.0001, 1.0),
            other_smoothing: other_smoothing.clamp(0.0001, 1.0),
            filter_z: [0.0; 2],
            duck_envelope: 1.0,
            dormant_bypass: false,
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        set_value(&mut self.target, id, value)
    }

    pub fn reset(&mut self) {
        // Invalidate the ring in O(1) so type switches do not clear megabytes
        // on an AudioWorklet message or an audio callback.
        self.generation = self.generation.wrapping_add(1);
        if self.generation == 0 {
            self.valid.fill(0);
            self.generation = 1;
        }
        self.write = 0;
        self.filter_z = [0.0; 2];
        self.duck_envelope = 1.0;
    }

    pub fn settle(&mut self) {
        self.current.copy_from_slice(&self.target[..12]);
        self.reset();
        self.dormant_bypass = false;
    }

    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let [in_l, in_r] = input;
        let [out_l, out_r] = output;
        debug_assert_eq!(in_l.len(), out_l.len());
        debug_assert_eq!(in_r.len(), out_r.len());
        let dormant = self.target[10] < 0.5
            && self.target[7] <= 1e-4
            && self.current[7] <= 1e-4
            && self.target[2] <= 1e-4
            && self.current[2] <= 1e-4
            && self.target[3] <= 1e-4
            && self.current[3] <= 1e-4;
        if dormant {
            if !self.dormant_bypass {
                self.reset();
                self.dormant_bypass = true;
            }
            out_l.copy_from_slice(in_l);
            out_r.copy_from_slice(in_r);
            return;
        }
        if self.dormant_bypass {
            self.reset();
            self.dormant_bypass = false;
        }
        let size = self.left.len();
        let ping_pong = self.target[8] >= 0.5;
        let freeze = self.target[10] >= 0.5;
        let filter_on = self.target[4] >= 0.5;
        let synced = self.target[12] >= 0.5;
        for frame in 0..in_l.len() {
            for id in 0..12 {
                if matches!(id, 4 | 8 | 10) {
                    continue;
                }
                let coefficient = if id < 2 {
                    self.time_smoothing
                } else {
                    self.other_smoothing
                };
                self.current[id] += (self.target[id] - self.current[id]) * coefficient;
            }
            let mut samples_l = if synced {
                self.division_samples(self.target[13])
            } else {
                self.current[0] * 0.001 * self.sample_rate
            };
            let mut samples_r = if synced {
                self.division_samples(self.target[14])
            } else {
                self.current[1] * 0.001 * self.sample_rate
            };
            samples_l = samples_l.clamp(1.0, (size - 1) as f32);
            samples_r = samples_r.clamp(1.0, (size - 1) as f32);
            if ping_pong {
                std::mem::swap(&mut samples_l, &mut samples_r);
            }
            let mut delay_l = self.read(&self.left, samples_l);
            let mut delay_r = self.read(&self.right, samples_r);
            let input_l = in_l[frame];
            let input_r = in_r[frame];
            if self.current[11] > 0.0 {
                let level = (input_l.abs() + input_r.abs()) * 0.5;
                let target = if level > 0.01 {
                    1.0 - self.current[11]
                } else {
                    1.0
                };
                let t = if level > 0.01 { 0.1 } else { 0.995 };
                self.duck_envelope = target + (self.duck_envelope - target) * t;
                delay_l *= self.duck_envelope;
                delay_r *= self.duck_envelope;
            }
            if self.current[9] < 1.0 {
                let mono = (delay_l + delay_r) * 0.5;
                delay_l = mono + (delay_l - mono) * self.current[9];
                delay_r = mono + (delay_r - mono) * self.current[9];
            }
            let mix = self.current[7];
            out_l[frame] = input_l * (1.0 - mix) + delay_l * mix;
            out_r[frame] = input_r * (1.0 - mix) + delay_r * mix;
            let cross = self.current[3];
            let mut fb_l = if cross > 0.0 || ping_pong {
                delay_l * (1.0 - cross) + delay_r * cross
            } else {
                delay_l
            };
            let mut fb_r = if cross > 0.0 || ping_pong {
                delay_r * (1.0 - cross) + delay_l * cross
            } else {
                delay_r
            };
            if filter_on {
                let g = (std::f32::consts::PI * self.current[5] / self.sample_rate).tan();
                let v_l = (fb_l - self.filter_z[0]) * g;
                fb_l = v_l + self.filter_z[0];
                self.filter_z[0] = fb_l + v_l;
                let v_r = (fb_r - self.filter_z[1]) * g;
                fb_r = v_r + self.filter_z[1];
                self.filter_z[1] = fb_r + v_r;
            }
            fb_l *= self.current[2];
            fb_r *= self.current[2];
            self.left[self.write] = if freeze { fb_l } else { fb_l + input_l * 0.7 };
            self.right[self.write] = if freeze { fb_r } else { fb_r + input_r * 0.7 };
            self.valid[self.write] = self.generation;
            self.write += 1;
            if self.write == size {
                self.write = 0;
            }
        }
    }

    fn read(&self, buffer: &[f32], delay: f32) -> f32 {
        let mut position = self.write as f32 - delay;
        while position < 0.0 {
            position += buffer.len() as f32;
        }
        // The legacy node takes the index modulo size but leaves `position` unwrapped.
        // At an exact boundary, frac becomes `size` and can emit an enormous spike.
        if position >= buffer.len() as f32 {
            position -= buffer.len() as f32;
        }
        let index = position as usize;
        let next = (index + 1) % buffer.len();
        let fraction = position - index as f32;
        let first = if self.valid[index] == self.generation {
            buffer[index]
        } else {
            0.0
        };
        let second = if self.valid[next] == self.generation {
            buffer[next]
        } else {
            0.0
        };
        first + (second - first) * fraction
    }

    fn division_samples(&self, division: f32) -> f32 {
        const BEATS: [f32; 11] = [
            0.125, 0.25, 0.5, 1.0, 2.0, 4.0, 0.75, 1.5, 0.166666, 0.333333, 0.666666,
        ];
        BEATS[division as usize] * 60.0 / self.target[15] * self.sample_rate
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn impulse_survives_block_boundaries() {
        let mut settings = defaults();
        settings[0] = 10.0;
        settings[1] = 10.0;
        settings[2] = 0.0;
        settings[7] = 1.0;
        let mut node = StereoDelay::new(1000.0, settings);
        let mut first_l = vec![0.0; 6];
        first_l[0] = 1.0;
        let first_r = first_l.clone();
        let mut output_l = vec![0.0; 6];
        let mut output_r = output_l.clone();
        node.process_planar([&first_l, &first_r], [&mut output_l, &mut output_r]);
        let silent = vec![0.0; 6];
        node.process_planar([&silent, &silent], [&mut output_l, &mut output_r]);
        assert!((output_l[4] - 0.7).abs() < 1e-5, "{:?}", output_l);
        assert_eq!(output_l, output_r);
    }
}
