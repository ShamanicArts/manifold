//! Two-head time-domain PitchShifterNode port with a prepared stereo ring.

pub const PARAM_COUNT: usize = 4;
pub const DEFAULTS: [f32; PARAM_COUNT] = [0.0, 80.0, 0.0, 1.0];
const LIMITS: [(f32, f32); PARAM_COUNT] = [(-24.0, 24.0), (20.0, 200.0), (0.0, 0.95), (0.0, 1.0)];

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
struct Head {
    read_pos: f32,
    age: f32,
}

pub struct PitchShifter {
    sample_rate: f32,
    target: [f32; PARAM_COUNT],
    current: [f32; PARAM_COUNT],
    smooth: f32,
    ring: [Vec<f32>; 2],
    stamps: Vec<u64>,
    generation: u64,
    write_index: usize,
    heads: [[Head; 2]; 2],
    dormant_bypass: bool,
}

impl PitchShifter {
    pub fn new(sample_rate: f32, max_frames: usize, params: [f32; PARAM_COUNT]) -> Self {
        let rate = if sample_rate > 1.0 {
            sample_rate
        } else {
            44_100.0
        };
        let size = (rate as usize * 2).saturating_add(max_frames.max(64));
        let mut target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut target, id as u32, value);
        }
        let mut node = Self {
            sample_rate: rate,
            target,
            current: target,
            smooth: ((1.0 - (-1.0 / (0.01 * rate as f64)).exp()) as f32).clamp(0.0001, 1.0),
            ring: [vec![0.0; size], vec![0.0; size]],
            stamps: vec![0; size],
            generation: 1,
            write_index: 0,
            heads: [[Head::default(); 2]; 2],
            dormant_bypass: false,
        };
        node.reset_state();
        node
    }

    fn reset_state(&mut self) {
        self.generation = self.generation.wrapping_add(1);
        if self.generation == 0 {
            self.stamps.fill(0);
            self.generation = 1;
        }
        self.write_index = 0;
        let window = (self.current[1] * 0.001 * self.sample_rate)
            .clamp(32.0, (self.stamps.len() / 4) as f32);
        for ch in 0..2 {
            self.heads[ch][0] = Head {
                age: 0.0,
                read_pos: -window,
            };
            self.heads[ch][1] = Head {
                age: window * 0.5,
                read_pos: -window * 0.5,
            };
        }
    }

    pub fn reset_to(&mut self, params: [f32; PARAM_COUNT]) {
        self.target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut self.target, id as u32, value);
        }
        self.current = self.target;
        self.reset_state();
        self.dormant_bypass = false;
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        set_value(&mut self.target, id, value)
    }

    fn read_delay(&self, channel: usize, position: f32) -> f32 {
        let size = self.stamps.len();
        let mut wrapped = position;
        while wrapped < 0.0 {
            wrapped += size as f32;
        }
        while wrapped >= size as f32 {
            wrapped -= size as f32;
        }
        let first = wrapped as usize;
        let second = (first + 1) % size;
        let fraction = wrapped - first as f32;
        let a = if self.stamps[first] == self.generation {
            self.ring[channel][first]
        } else {
            0.0
        };
        let b = if self.stamps[second] == self.generation {
            self.ring[channel][second]
        } else {
            0.0
        };
        a + (b - a) * fraction
    }

    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let [in_l, in_r] = input;
        let [out_l, out_r] = output;
        let dormant = self.target[3] <= 1.0e-4
            && self.current[3] <= 1.0e-4
            && self.target[2] <= 1.0e-4
            && self.current[2] <= 1.0e-4;
        if dormant {
            if !self.dormant_bypass {
                self.reset_state();
                self.dormant_bypass = true;
            }
            out_l.copy_from_slice(in_l);
            out_r.copy_from_slice(in_r);
            return;
        }
        if self.dormant_bypass {
            self.reset_state();
            self.dormant_bypass = false;
        }
        let size = self.stamps.len();
        for frame in 0..in_l.len() {
            for id in 0..PARAM_COUNT {
                self.current[id] += (self.target[id] - self.current[id]) * self.smooth;
            }
            let window =
                (self.current[1] * 0.001 * self.sample_rate).clamp(32.0, (size / 4) as f32);
            let ratio = 2.0_f32.powf(self.current[0] / 12.0);
            let dry = [in_l[frame], in_r[frame]];
            let mut wet_channels = [0.0; 2];
            for ch in 0..2 {
                let mut wet = 0.0;
                let mut gain_sum = 0.0;
                for h in 0..2 {
                    let head = &mut self.heads[ch][h];
                    if head.age >= window {
                        head.age -= window;
                        head.read_pos = self.write_index as f32 - window;
                    }
                    let normalized_age = head.age / window;
                    let envelope = 1.0 - (2.0 * normalized_age.clamp(0.0, 1.0) - 1.0).abs();
                    let position = head.read_pos;
                    let sample = self.read_delay(ch, position);
                    wet += sample * envelope;
                    gain_sum += envelope;
                    let head = &mut self.heads[ch][h];
                    head.read_pos += ratio;
                    while head.read_pos >= size as f32 {
                        head.read_pos -= size as f32;
                    }
                    while head.read_pos < 0.0 {
                        head.read_pos += size as f32;
                    }
                    head.age += 1.0;
                }
                if gain_sum > 0.0001 {
                    wet /= gain_sum;
                }
                self.ring[ch][self.write_index] = dry[ch] + wet * self.current[2];
                wet_channels[ch] = wet;
            }
            self.stamps[self.write_index] = self.generation;
            self.write_index = (self.write_index + 1) % size;
            let dry_mix = 1.0 - self.current[3];
            out_l[frame] = dry[0] * dry_mix + wet_channels[0] * self.current[3];
            out_r[frame] = dry[1] * dry_mix + wet_channels[1] * self.current[3];
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dormant_bypass_discards_old_delay_history() {
        let mut node = PitchShifter::new(48_000.0, 128, [12.0, 40.0, 0.0, 1.0]);
        let source = [0.3; 128];
        let silence = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        node.process_planar([&source, &source], [&mut left, &mut right]);
        node.reset_to([12.0, 40.0, 0.0, 0.0]);
        node.process_planar([&silence, &silence], [&mut left, &mut right]);
        assert_eq!(left, silence);
        node.set_parameter(3, 1.0);
        node.process_planar([&silence, &silence], [&mut left, &mut right]);
        assert_eq!(left, silence);
        assert_eq!(right, silence);
    }
}
