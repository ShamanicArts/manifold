//! ShimmerNode's modulated, pitched delay with a prepared stereo ring.

pub const PARAM_COUNT: usize = 6;
pub const DEFAULTS: [f32; PARAM_COUNT] = [0.6, 12.0, 0.65, 0.45, 0.25, 6000.0];
const LIMITS: [(f32, f32); PARAM_COUNT] = [
    (0.0, 1.0),
    (-12.0, 12.0),
    (0.0, 0.99),
    (0.0, 1.0),
    (0.0, 1.0),
    (100.0, 12000.0),
];

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

pub struct Shimmer {
    sample_rate: f32,
    target: [f32; PARAM_COUNT],
    current: [f32; PARAM_COUNT],
    smooth: f32,
    ring: [Vec<f32>; 2],
    stamps: Vec<u64>,
    generation: u64,
    write_index: usize,
    read_pos: [f32; 2],
    filter_state: [f32; 2],
    lfo_phase: f32,
}

impl Shimmer {
    pub fn new(sample_rate: f32, max_frames: usize, params: [f32; PARAM_COUNT]) -> Self {
        let rate = if sample_rate > 1.0 {
            sample_rate
        } else {
            44_100.0
        };
        let size = (rate * 3.0) as usize + max_frames.max(16);
        let mut target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut target, id as u32, value);
        }
        Self {
            sample_rate: rate,
            target,
            current: target,
            smooth: (1.0 - (-1.0 / (0.01 * rate as f64)).exp()) as f32,
            ring: [vec![0.0; size], vec![0.0; size]],
            stamps: vec![0; size],
            generation: 1,
            write_index: 0,
            read_pos: [0.0; 2],
            filter_state: [0.0; 2],
            lfo_phase: 0.0,
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
        self.generation = self.generation.wrapping_add(1);
        if self.generation == 0 {
            self.stamps.fill(0);
            self.generation = 1;
        }
        self.write_index = 0;
        self.read_pos = [0.0; 2];
        self.filter_state = [0.0; 2];
        self.lfo_phase = 0.0;
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        set_value(&mut self.target, id, value)
    }

    fn read_delay(&self, channel: usize, pos: f32) -> f32 {
        let size = self.stamps.len();
        let mut wrapped = pos;
        while wrapped < 0.0 {
            wrapped += size as f32;
        }
        while wrapped >= size as f32 {
            wrapped -= size as f32;
        }
        let i0 = wrapped as usize;
        let i1 = (i0 + 1) % size;
        let fraction = wrapped - i0 as f32;
        let a = if self.stamps[i0] == self.generation {
            self.ring[channel][i0]
        } else {
            0.0
        };
        let b = if self.stamps[i1] == self.generation {
            self.ring[channel][i1]
        } else {
            0.0
        };
        a + (b - a) * fraction
    }

    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let [in_l, in_r] = input;
        let [out_l, out_r] = output;
        let size = self.stamps.len();
        for i in 0..in_l.len() {
            for id in 0..PARAM_COUNT {
                self.current[id] += (self.target[id] - self.current[id]) * self.smooth;
            }
            let base_delay = (0.05 + 1.45 * self.current[0]) * self.sample_rate;
            self.lfo_phase += 0.19 / self.sample_rate;
            if self.lfo_phase >= 1.0 {
                self.lfo_phase -= 1.0;
            }
            let modulation = (2.0 * std::f32::consts::PI * self.lfo_phase).sin()
                * self.current[4]
                * 0.08
                * self.sample_rate;
            let ratio = 2.0_f32.powf(self.current[1] / 12.0);
            let input_frame = [in_l[i], in_r[i]];
            let mut wet = [0.0; 2];
            for ch in 0..2 {
                let delay_samples = base_delay + if ch == 0 { modulation } else { -modulation };
                if self.read_pos[ch].abs() < 1.0e-6 {
                    self.read_pos[ch] = self.write_index as f32 - delay_samples;
                }
                let pitched = self.read_delay(ch, self.read_pos[ch]);
                self.read_pos[ch] += ratio;
                if self.read_pos[ch] >= size as f32 {
                    self.read_pos[ch] -= size as f32;
                }
                let omega = 2.0 * std::f32::consts::PI * self.current[5];
                let a = (omega / (omega + self.sample_rate)).clamp(0.0001, 0.9999);
                self.filter_state[ch] += a * (pitched - self.filter_state[ch]);
                self.ring[ch][self.write_index] =
                    input_frame[ch] + self.filter_state[ch] * self.current[2];
                wet[ch] = pitched;
            }
            self.stamps[self.write_index] = self.generation;
            self.write_index = (self.write_index + 1) % size;
            let dry = 1.0 - self.current[3];
            out_l[i] = input_frame[0] * dry + wet[0] * self.current[3];
            out_r[i] = input_frame[1] * dry + wet[1] * self.current[3];
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reset_discards_old_delay_contents() {
        let mut node = Shimmer::new(48_000.0, 128, [0.0, 0.0, 0.0, 1.0, 0.0, 6000.0]);
        let one = [1.0; 128];
        let zero = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        node.process_planar([&one, &one], [&mut left, &mut right]);
        node.reset_to([0.0, 0.0, 0.0, 1.0, 0.0, 6000.0]);
        node.process_planar([&zero, &zero], [&mut left, &mut right]);
        assert_eq!(left, zero);
        assert_eq!(right, zero);
    }
}
