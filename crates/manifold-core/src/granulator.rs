//! GranulatorNode capture-ring and preloaded stereo source paths.

pub const PARAM_COUNT: usize = 11;
pub const DEFAULTS: [f32; PARAM_COUNT] = [80.0, 20.0, 0.5, 0.0, 0.2, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0];
const LIMITS: [(f32, f32); PARAM_COUNT] = [
    (1.0, 500.0),
    (1.0, 100.0),
    (0.0, 1.0),
    (-24.0, 24.0),
    (0.0, 1.0),
    (0.0, 1.0),
    (0.0, 1.0),
    (0.0, 4.0),
    (0.0, 1.0),
    (0.0, 1.0),
    (0.0, 1.0),
];

pub fn set_value(params: &mut [f32; PARAM_COUNT], id: u32, value: f32) -> bool {
    let Some(&(low, high)) = LIMITS.get(id as usize) else {
        return false;
    };
    if !value.is_finite() {
        return false;
    }
    params[id as usize] = if id == 7 {
        value.round().clamp(low, high)
    } else {
        value.clamp(low, high)
    };
    true
}

#[derive(Clone, Copy)]
struct Grain {
    active: bool,
    read_pos: f32,
    increment: f32,
    age: i32,
    length: i32,
}

impl Default for Grain {
    fn default() -> Self {
        Self {
            active: false,
            read_pos: 0.0,
            increment: 1.0,
            age: 0,
            length: 1,
        }
    }
}

pub struct Granulator {
    sample_rate: f32,
    target: [f32; PARAM_COUNT],
    current: [f32; 6],
    smooth: f32,
    ring: [Vec<f32>; 2],
    source: Option<Vec<f32>>,
    stamps: Vec<u64>,
    generation: u64,
    write_index: usize,
    grains: [Grain; 64],
    spawn_counter: i32,
    random_seed: u64,
}

impl Granulator {
    pub fn new(sample_rate: f32, max_frames: usize, params: [f32; PARAM_COUNT]) -> Self {
        let rate = if sample_rate > 1.0 {
            sample_rate
        } else {
            44_100.0
        };
        let size = (rate * 4.0) as usize + max_frames.max(16);
        let mut target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut target, id as u32, value);
        }
        Self {
            sample_rate: rate,
            target,
            current: target[..6].try_into().unwrap(),
            smooth: (1.0 - (-1.0 / (0.01 * rate as f64)).exp()) as f32,
            ring: [vec![0.0; size], vec![0.0; size]],
            source: None,
            stamps: vec![0; size],
            generation: 1,
            write_index: 0,
            grains: [Grain::default(); 64],
            spawn_counter: 0,
            random_seed: 12345,
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
        self.current.copy_from_slice(&self.target[..6]);
        self.generation = self.generation.wrapping_add(1);
        if self.generation == 0 {
            self.stamps.fill(0);
            self.generation = 1;
        }
        self.write_index = 0;
        self.clear_grains();
        // The seed deliberately continues through reset, as the C++ random stream does.
    }

    fn clear_grains(&mut self) {
        self.grains.fill(Grain::default());
        self.spawn_counter = 0;
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        let was_enabled = self.target[8] >= 0.5;
        if !set_value(&mut self.target, id, value) {
            return false;
        }
        if id == 8 && was_enabled && self.target[8] < 0.5 {
            self.clear_grains();
        }
        true
    }

    /// Install decoded interleaved stereo outside the process callback.
    pub fn load_stereo(&mut self, stereo: Vec<f32>, source_rate: f32) -> bool {
        if stereo.len() < 4
            || stereo.len() % 2 != 0
            || !source_rate.is_finite()
            || source_rate <= 1.0
        {
            return false;
        }
        let source = if (source_rate - self.sample_rate).abs() < 0.01 {
            stereo
        } else {
            let input_frames = stereo.len() / 2;
            let output_frames = ((input_frames as f64 * self.sample_rate as f64
                / source_rate as f64)
                .round() as usize)
                .max(2);
            let mut converted = vec![0.0; output_frames * 2];
            for frame in 0..output_frames {
                let position = frame as f64 * source_rate as f64 / self.sample_rate as f64;
                let first = (position as usize).min(input_frames - 1);
                let second = (first + 1).min(input_frames - 1);
                let fraction = (position - first as f64).clamp(0.0, 1.0) as f32;
                for ch in 0..2 {
                    let a = stereo[first * 2 + ch];
                    converted[frame * 2 + ch] = a + (stereo[second * 2 + ch] - a) * fraction;
                }
            }
            converted
        };
        self.source = Some(source);
        let targets = self.target;
        self.reset_to(targets);
        true
    }

    fn source_length(&self) -> usize {
        self.source.as_ref().map_or(0, |source| source.len() / 2)
    }

    fn next_float(&mut self) -> f32 {
        self.random_seed =
            self.random_seed.wrapping_mul(0x5deece66d).wrapping_add(11) & 0xffffffffffff;
        let raw = (self.random_seed >> 16) as u32;
        (raw as f32 / 4_294_967_296.0_f32).min(1.0 - f32::EPSILON)
    }

    fn spawn_grain(&mut self) {
        let Some(index) = self.grains.iter().position(|grain| !grain.active) else {
            return;
        };
        let length = (self.current[0] * 0.001 * self.sample_rate) as i32;
        let length = length.max(4);
        let source_len = self.source_length();
        let (base, max_offset, region_start) = if source_len > 1 {
            let first = self.target[9].min(self.target[10]);
            let last = self.target[9].max(self.target[10]);
            let region_start = (first * (source_len - 1) as f32) as i32;
            let region_end = (last * source_len as f32).round() as i32;
            let region_end = region_end.clamp(region_start + 1, source_len as i32);
            let max_offset = (region_end - region_start - 1).max(1) as f32;
            (
                self.current[2] * max_offset,
                max_offset,
                region_start as f32,
            )
        } else {
            let max_offset = (self.stamps.len() as i32 - length - 1).max(1) as f32;
            (
                (self.current[2] * max_offset).clamp(0.0, max_offset),
                max_offset,
                0.0,
            )
        };
        let spray_range = self.current[4] * 0.2 * max_offset;
        let spray = (self.next_float() * 2.0 - 1.0) * spray_range;
        let start = region_start + (base + spray).clamp(0.0, max_offset);
        self.grains[index] = Grain {
            active: true,
            read_pos: if source_len > 1 {
                start
            } else {
                self.write_index as f32 - start
            },
            increment: 2.0_f32.powf(self.current[3] / 12.0),
            age: 0,
            length,
        };
    }

    fn read_ring(&self, channel: usize, pos: f32) -> f32 {
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
        let frac = wrapped - i0 as f32;
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
        a + (b - a) * frac
    }

    fn read_source(&self, channel: usize, pos: f32) -> f32 {
        let Some(source) = &self.source else {
            return 0.0;
        };
        let size = source.len() / 2;
        let wrapped = pos.rem_euclid(size as f32);
        let i0 = wrapped as usize;
        let i1 = (i0 + 1) % size;
        let frac = wrapped - i0 as f32;
        let a = source[i0 * 2 + channel];
        let b = source[i1 * 2 + channel];
        a + (b - a) * frac
    }

    fn envelope(&self, grain: &Grain) -> f32 {
        let t = grain.age as f32 / grain.length.max(1) as f32;
        let pi = std::f32::consts::PI;
        match self.target[7] as u32 {
            1 => 1.0 - (2.0 * t - 1.0).abs(),
            2 => 0.42 - 0.5 * (2.0 * pi * t).cos() + 0.08 * (4.0 * pi * t).cos(),
            3 if t < 0.25 => 0.5 - 0.5 * (pi * t / 0.25).cos(),
            3 if t > 0.75 => 0.5 - 0.5 * (pi * ((1.0 - t) / 0.25)).cos(),
            3 | 4 => 1.0,
            _ => 0.5 - 0.5 * (2.0 * pi * t).cos(),
        }
    }

    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let [in_l, in_r] = input;
        let [out_l, out_r] = output;
        if self.target[8] < 0.5 {
            out_l.fill(0.0);
            out_r.fill(0.0);
            self.clear_grains();
            return;
        }
        for i in 0..in_l.len() {
            for id in 0..6 {
                self.current[id] += (self.target[id] - self.current[id]) * self.smooth;
            }
            if self.target[6] < 0.5 && self.source.is_none() {
                self.ring[0][self.write_index] = in_l[i];
                self.ring[1][self.write_index] = in_r[i];
                self.stamps[self.write_index] = self.generation;
                self.write_index = (self.write_index + 1) % self.stamps.len();
            }
            let interval = (self.sample_rate / self.current[1].max(1.0)) as i32;
            self.spawn_counter += 1;
            if self.spawn_counter >= interval.max(1) {
                self.spawn_counter = 0;
                self.spawn_grain();
            }
            let mut wet = [0.0; 2];
            for index in 0..self.grains.len() {
                let grain = self.grains[index];
                if !grain.active {
                    continue;
                }
                let env = self.envelope(&grain);
                wet[0] += if self.source.is_some() {
                    self.read_source(0, grain.read_pos)
                } else {
                    self.read_ring(0, grain.read_pos)
                } * env;
                wet[1] += if self.source.is_some() {
                    self.read_source(1, grain.read_pos)
                } else {
                    self.read_ring(1, grain.read_pos)
                } * env;
                let grain = &mut self.grains[index];
                grain.read_pos += grain.increment;
                grain.age += 1;
                if grain.age >= grain.length {
                    grain.active = false;
                }
            }
            let dry = 1.0 - self.current[5];
            out_l[i] = in_l[i] * dry + wet[0] * self.current[5];
            out_r[i] = in_r[i] * dry + wet[1] * self.current[5];
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn disabled_clears_grains_and_output() {
        let mut node = Granulator::new(
            48_000.0,
            128,
            [50.0, 100.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0],
        );
        let one = [1.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        for _ in 0..8 {
            node.process_planar([&one, &one], [&mut left, &mut right]);
        }
        assert!(node.grains.iter().any(|grain| grain.active));
        node.set_parameter(8, 0.0);
        node.process_planar([&one, &one], [&mut left, &mut right]);
        assert!(left.iter().all(|sample| *sample == 0.0));
        assert!(node.grains.iter().all(|grain| !grain.active));
    }

    #[test]
    fn preloaded_source_generates_grains_without_live_capture() {
        let mut node = Granulator::new(
            48_000.0,
            128,
            [50.0, 100.0, 0.0, 0.0, 0.0, 1.0, 0.0, 4.0, 1.0, 0.0, 1.0],
        );
        assert!(node.load_stereo(vec![0.4, -0.2, 0.4, -0.2, 0.4, -0.2], 48_000.0));
        let zero = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        for _ in 0..8 {
            node.process_planar([&zero, &zero], [&mut left, &mut right]);
        }
        assert!(left.iter().any(|sample| *sample > 0.3));
        assert!(right.iter().any(|sample| *sample < -0.1));
        assert_eq!(node.write_index, 0);
    }

    #[test]
    fn preloaded_source_resamples_to_graph_rate_before_processing() {
        let mut node = Granulator::new(48_000.0, 128, DEFAULTS);
        assert!(node.load_stereo(vec![0.0, 0.0, 1.0, -1.0, 0.0, 0.0], 24_000.0));
        assert_eq!(node.source_length(), 6);
        let source = node.source.as_ref().unwrap();
        assert!((source[2] - 0.5).abs() < 1.0e-6);
        assert!((source[3] + 0.5).abs() < 1.0e-6);
    }
}
