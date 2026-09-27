//! Stereo reverse-window delay port with a generation-marked prepared ring.

pub const PARAM_COUNT: usize = 4;
pub const DEFAULTS: [f32; PARAM_COUNT] = [420.0, 120.0, 0.35, 0.5];
const LIMITS: [(f32, f32); PARAM_COUNT] = [(50.0, 2000.0), (20.0, 400.0), (0.0, 0.95), (0.0, 1.0)];

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

pub struct ReverseDelay {
    sample_rate: f32,
    target: [f32; PARAM_COUNT],
    current: [f32; PARAM_COUNT],
    smooth: f32,
    ring: [Vec<f32>; 2],
    stamps: Vec<u64>,
    generation: u64,
    write_index: usize,
    read_position: [f32; 2],
    segment_remaining: [i32; 2],
    dormant_bypass: bool,
}

impl ReverseDelay {
    pub fn new(sample_rate: f32, max_frames: usize, params: [f32; PARAM_COUNT]) -> Self {
        let rate = if sample_rate > 1.0 {
            sample_rate
        } else {
            44_100.0
        };
        let size = (rate as usize * 3).saturating_add(max_frames.max(64));
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
            read_position: [0.0; 2],
            segment_remaining: [0; 2],
            dormant_bypass: false,
        }
    }

    fn reset_state(&mut self) {
        self.generation = self.generation.wrapping_add(1);
        if self.generation == 0 {
            self.stamps.fill(0);
            self.generation = 1;
        }
        self.write_index = 0;
        self.read_position = [0.0; 2];
        self.segment_remaining = [0; 2];
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
        self.dormant_bypass = false;
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        set_value(&mut self.target, id, value)
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
            let delay = ((self.current[0] * 0.001 * self.sample_rate) as usize).clamp(1, size - 2);
            let window = ((self.current[1] * 0.001 * self.sample_rate) as usize).clamp(8, delay);
            let input_frame = [in_l[frame], in_r[frame]];
            let mut wet = [0.0; 2];
            for ch in 0..2 {
                if self.segment_remaining[ch] <= 0 {
                    let start = (self.write_index + size - delay) % size;
                    self.read_position[ch] = (start + window - 1) as f32;
                    while self.read_position[ch] >= size as f32 {
                        self.read_position[ch] -= size as f32;
                    }
                    self.segment_remaining[ch] = window as i32;
                }
                let idx = self.read_position[ch] as usize % size;
                let mut sample = if self.stamps[idx] == self.generation {
                    self.ring[ch][idx]
                } else {
                    0.0
                };
                let progress = 1.0 - self.segment_remaining[ch] as f32 / window.max(1) as f32;
                let triangle = 1.0 - (2.0 * progress.clamp(0.0, 1.0) - 1.0).abs();
                sample *= triangle;
                self.read_position[ch] -= 1.0;
                if self.read_position[ch] < 0.0 {
                    self.read_position[ch] += size as f32;
                }
                self.segment_remaining[ch] -= 1;
                wet[ch] = sample;
            }
            self.ring[0][self.write_index] = input_frame[0] + wet[0] * self.current[2];
            self.ring[1][self.write_index] = input_frame[1] + wet[1] * self.current[2];
            self.stamps[self.write_index] = self.generation;
            self.write_index = (self.write_index + 1) % size;
            let dry = 1.0 - self.current[3];
            out_l[frame] = input_frame[0] * dry + wet[0] * self.current[3];
            out_r[frame] = input_frame[1] * dry + wet[1] * self.current[3];
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dormant_bypass_clears_history_without_allocating() {
        let mut node = ReverseDelay::new(48_000.0, 128, [50.0, 20.0, 0.0, 1.0]);
        let impulse = [1.0; 128];
        let silence = [0.0; 128];
        let mut out_l = [0.0; 128];
        let mut out_r = [0.0; 128];
        node.process_planar([&impulse, &silence], [&mut out_l, &mut out_r]);
        node.reset_to([50.0, 20.0, 0.0, 0.0]);
        node.process_planar([&silence, &silence], [&mut out_l, &mut out_r]);
        assert_eq!(out_l, silence);
        node.set_parameter(3, 1.0);
        node.process_planar([&silence, &silence], [&mut out_l, &mut out_r]);
        assert_eq!(out_l, silence);
        assert_eq!(out_r, silence);
    }
}
