//! Deterministic stereo StutterNode port with an eight-second prepared ring.

pub const PARAM_COUNT: usize = 8;
pub const DEFAULTS: [f32; PARAM_COUNT] = [0.5, 0.8, 0.3, 0.2, 0.5, 255.0, 120.0, 1.0];

pub fn set_value(params: &mut [f32; PARAM_COUNT], id: u32, value: f32) -> bool {
    if !value.is_finite() || id as usize >= PARAM_COUNT {
        return false;
    }
    params[id as usize] = match id {
        0 => value.clamp(0.125, 8.0),
        1..=4 | 7 => value.clamp(0.0, 1.0),
        5 => (value as i32) as f32,
        6 => value.clamp(20.0, 300.0),
        _ => unreachable!(),
    };
    true
}

pub struct Stutter {
    sample_rate: f32,
    target: [f32; PARAM_COUNT],
    current: [f32; PARAM_COUNT],
    smooth: f32,
    ring: [Vec<f32>; 2],
    stamps: Vec<u64>,
    generation: u64,
    write_index: usize,
    active: bool,
    segment_length: i32,
    segment_age: i32,
    read_start: usize,
    step_counter: i32,
    lowpass: [f32; 2],
    random_seed: u64,
}

impl Stutter {
    pub fn new(sample_rate: f32, max_frames: usize, params: [f32; PARAM_COUNT]) -> Self {
        let rate = if sample_rate > 1.0 {
            sample_rate
        } else {
            44_100.0
        };
        let size = (rate as usize * 8).saturating_add(max_frames.max(16));
        let mut target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut target, id as u32, value);
        }
        Self {
            sample_rate: rate,
            target,
            current: target,
            smooth: ((1.0 - (-1.0 / (0.01 * rate as f64)).exp()) as f32).clamp(0.0001, 1.0),
            ring: [vec![0.0; size], vec![0.0; size]],
            stamps: vec![0; size],
            generation: 1,
            write_index: 0,
            active: false,
            segment_length: 1,
            segment_age: 0,
            read_start: 0,
            step_counter: 0,
            lowpass: [0.0; 2],
            random_seed: 12345,
        }
    }

    fn reset_state(&mut self) {
        self.generation = self.generation.wrapping_add(1);
        if self.generation == 0 {
            self.stamps.fill(0);
            self.generation = 1;
        }
        self.write_index = 0;
        self.active = false;
        self.segment_length = 1;
        self.segment_age = 0;
        self.read_start = 0;
        self.step_counter = 0;
        self.lowpass = [0.0; 2];
        // The original reset() does not reset juce::Random's seed.
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
        self.reset_state();
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        set_value(&mut self.target, id, value)
    }

    fn next_random_float(&mut self) -> f32 {
        self.random_seed =
            (self.random_seed.wrapping_mul(0x5deece66d).wrapping_add(11)) & 0xffffffffffff;
        let raw = (self.random_seed >> 16) as u32;
        (raw as f32 / 4_294_967_296.0_f32).min(1.0 - f32::EPSILON)
    }

    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let [in_l, in_r] = input;
        let [out_l, out_r] = output;
        let size = self.stamps.len();
        let pattern = self.target[5] as i32;
        let bpm = self.target[6];
        for frame in 0..in_l.len() {
            for id in [0, 1, 2, 3, 4, 7] {
                self.current[id] += (self.target[id] - self.current[id]) * self.smooth;
            }
            let dry = [in_l[frame], in_r[frame]];
            self.ring[0][self.write_index] = dry[0];
            self.ring[1][self.write_index] = dry[1];
            self.stamps[self.write_index] = self.generation;

            self.segment_length =
                ((60.0 / bpm.max(20.0)) * self.current[0] * self.sample_rate) as i32;
            self.segment_length = self.segment_length.max(8);
            if self.segment_age <= 0 {
                let pattern_on = ((pattern >> (self.step_counter & 7)) & 1) != 0;
                let random_on = self.next_random_float() <= self.current[4];
                self.active = pattern_on && random_on;
                self.read_start = self.write_index;
                self.segment_age = self.segment_length;
                self.step_counter += 1;
            }

            let mut wet = dry;
            if self.active {
                let elapsed = self.segment_length - self.segment_age;
                let gated = ((self.segment_length as f32 * self.current[1]) as i32).max(1);
                if elapsed < gated {
                    let progress = elapsed as f32 / self.segment_length as f32;
                    let pitch_factor = (1.0 - self.current[3] * progress).max(0.5);
                    let read_offset = (elapsed as f32 * pitch_factor) as i32;
                    let idx = (self.read_start as i64 - read_offset as i64).rem_euclid(size as i64)
                        as usize;
                    let decay = 1.0 - self.current[2] * progress;
                    for ch in 0..2 {
                        wet[ch] = if self.stamps[idx] == self.generation {
                            self.ring[ch][idx]
                        } else {
                            0.0
                        };
                        self.lowpass[ch] += 0.2 * (wet[ch] * decay - self.lowpass[ch]);
                        wet[ch] = self.lowpass[ch];
                    }
                } else {
                    wet = [0.0; 2];
                }
            }
            let dry_mix = 1.0 - self.current[7];
            out_l[frame] = dry[0] * dry_mix + wet[0] * self.current[7];
            out_r[frame] = dry[1] * dry_mix + wet[1] * self.current[7];
            self.write_index = (self.write_index + 1) % size;
            self.segment_age -= 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn probability_zero_is_dry_and_pattern_zero_disables_repeats() {
        let mut node = Stutter::new(
            48_000.0,
            128,
            [0.125, 0.8, 0.3, 0.2, 0.0, 255.0, 120.0, 1.0],
        );
        let input = [0.25; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        node.process_planar([&input, &input], [&mut left, &mut right]);
        assert_eq!(left, input);
        assert_eq!(right, input);
        node.reset_to([0.125, 0.8, 0.3, 0.2, 1.0, 0.0, 120.0, 1.0]);
        node.process_planar([&input, &input], [&mut left, &mut right]);
        assert_eq!(left, input);
    }
}
