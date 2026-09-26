//! Independent Rust implementation of the legacy FreeVerb-style ReverbNode signal behavior.
//! Delay lines are allocated when prepared and reused on every audio block and slot switch.

pub const PARAM_COUNT: usize = 5;
pub const DEFAULTS: [f32; PARAM_COUNT] = [0.5, 0.5, 0.33, 0.4, 1.0];
const COMB_TUNINGS: [usize; 8] = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASS_TUNINGS: [usize; 4] = [556, 441, 341, 225];

pub fn set_value(params: &mut [f32; PARAM_COUNT], id: u32, value: f32) -> bool {
    if !value.is_finite() || id as usize >= PARAM_COUNT {
        return false;
    }
    params[id as usize] = value.clamp(0.0, 1.0);
    true
}

struct LinearSmoother {
    current: f32,
    target: f32,
    step: f32,
    countdown: usize,
    steps: usize,
}
impl LinearSmoother {
    fn new(value: f32, steps: usize) -> Self {
        Self {
            current: value,
            target: value,
            step: 0.0,
            countdown: 0,
            steps,
        }
    }
    fn reset(&mut self, value: f32) {
        self.current = value;
        self.target = value;
        self.step = 0.0;
        self.countdown = 0;
    }
    fn set_target(&mut self, value: f32) {
        if (value - self.target).abs() <= f32::MIN_POSITIVE
            || (value - self.target).abs() <= f32::EPSILON * value.abs().max(self.target.abs())
        {
            return;
        }
        self.target = value;
        self.countdown = self.steps;
        if self.countdown == 0 {
            self.current = value;
            self.step = 0.0;
        } else {
            self.step = (value - self.current) / self.countdown as f32;
        }
    }
    fn next(&mut self) -> f32 {
        if self.countdown == 0 {
            return self.target;
        }
        self.countdown -= 1;
        if self.countdown == 0 {
            self.current = self.target;
        } else {
            self.current += self.step;
        }
        self.current
    }
}

struct Comb {
    buffer: Vec<f32>,
    index: usize,
    last: f32,
}
impl Comb {
    fn new(size: usize) -> Self {
        Self {
            buffer: vec![0.0; size.max(1)],
            index: 0,
            last: 0.0,
        }
    }
    fn clear(&mut self) {
        self.buffer.fill(0.0);
        self.last = 0.0;
    }
    fn process(&mut self, input: f32, damp: f32, feedback: f32) -> f32 {
        let output = self.buffer[self.index];
        self.last = output * (1.0 - damp) + self.last * damp;
        self.buffer[self.index] = input + self.last * feedback;
        self.index += 1;
        if self.index == self.buffer.len() {
            self.index = 0;
        }
        output
    }
}
struct AllPass {
    buffer: Vec<f32>,
    index: usize,
}
impl AllPass {
    fn new(size: usize) -> Self {
        Self {
            buffer: vec![0.0; size.max(1)],
            index: 0,
        }
    }
    fn clear(&mut self) {
        self.buffer.fill(0.0);
    }
    fn process(&mut self, input: f32) -> f32 {
        let buffered = self.buffer[self.index];
        self.buffer[self.index] = input + buffered * 0.5;
        self.index += 1;
        if self.index == self.buffer.len() {
            self.index = 0;
        }
        buffered - input
    }
}

pub struct Reverb {
    target: [f32; PARAM_COUNT],
    current: [f32; PARAM_COUNT],
    node_smoothing: f32,
    combs: [[Comb; 8]; 2],
    allpasses: [[AllPass; 4]; 2],
    damping: LinearSmoother,
    feedback: LinearSmoother,
    dry: LinearSmoother,
    wet1: LinearSmoother,
    wet2: LinearSmoother,
}
impl Reverb {
    pub fn new(sample_rate: f32, params: [f32; PARAM_COUNT]) -> Self {
        let sr_int = sample_rate as usize;
        let steps = (sample_rate as f64 * 0.01).floor() as usize;
        let mut target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut target, id as u32, value);
        }
        let combs = std::array::from_fn(|channel| {
            std::array::from_fn(|index| {
                let tuning = COMB_TUNINGS[index] + if channel == 1 { 23 } else { 0 };
                Comb::new(sr_int * tuning / 44_100)
            })
        });
        let allpasses = std::array::from_fn(|channel| {
            std::array::from_fn(|index| {
                let tuning = ALLPASS_TUNINGS[index] + if channel == 1 { 23 } else { 0 };
                AllPass::new(sr_int * tuning / 44_100)
            })
        });
        let node_smoothing =
            ((1.0 - (-1.0 / (0.02 * sample_rate as f64)).exp()) as f32).clamp(0.0001, 1.0);
        let mut node = Self {
            target,
            current: target,
            node_smoothing,
            combs,
            allpasses,
            damping: LinearSmoother::new(0.2, steps),
            feedback: LinearSmoother::new(0.84, steps),
            dry: LinearSmoother::new(0.8, steps),
            wet1: LinearSmoother::new(0.99, steps),
            wet2: LinearSmoother::new(0.0, steps),
        };
        node.update_internal_targets();
        node
    }
    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        set_value(&mut self.target, id, value)
    }
    pub fn reset_to(&mut self, params: [f32; PARAM_COUNT]) {
        for channel in &mut self.combs {
            for comb in channel {
                comb.clear();
            }
        }
        for channel in &mut self.allpasses {
            for allpass in channel {
                allpass.clear();
            }
        }
        self.target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut self.target, id as u32, value);
        }
        self.current = self.target;
        self.damping.reset(0.2);
        self.feedback.reset(0.84);
        self.dry.reset(0.8);
        self.wet1.reset(0.99);
        self.wet2.reset(0.0);
        self.update_internal_targets();
    }
    fn update_internal_targets(&mut self) {
        let [room, damp, wet, dry, width] = self.current;
        self.damping.set_target(damp * 0.4);
        self.feedback.set_target(room * 0.28 + 0.7);
        self.dry.set_target(dry * 2.0);
        let wet = wet * 3.0;
        self.wet1.set_target(0.5 * wet * (1.0 + width));
        self.wet2.set_target(0.5 * wet * (1.0 - width));
    }
    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let [in_l, in_r] = input;
        let [out_l, out_r] = output;
        for id in 0..PARAM_COUNT {
            self.current[id] += (self.target[id] - self.current[id]) * self.node_smoothing;
        }
        self.update_internal_targets();
        for frame in 0..in_l.len() {
            let left = in_l[frame];
            let right = in_r[frame];
            let input = (left + right) * 0.015;
            let damp = self.damping.next();
            let feedback = self.feedback.next();
            let mut out = [0.0f32; 2];
            for (ch, channel) in self.combs.iter_mut().enumerate() {
                for comb in channel {
                    out[ch] += comb.process(input, damp, feedback);
                }
            }
            for (ch, channel) in self.allpasses.iter_mut().enumerate() {
                for allpass in channel {
                    out[ch] = allpass.process(out[ch]);
                }
            }
            let dry = self.dry.next();
            let wet1 = self.wet1.next();
            let wet2 = self.wet2.next();
            out_l[frame] = out[0] * wet1 + out[1] * wet2 + left * dry;
            out_r[frame] = out[1] * wet1 + out[0] * wet2 + right * dry;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preallocated_tail_survives_blocks_and_reset_clears_it() {
        let mut reverb = Reverb::new(48000.0, [0.8, 0.4, 1.0, 0.0, 1.0]);
        let mut impulse = [0.0; 4096];
        impulse[0] = 1.0;
        let silence = [0.0; 4096];
        let mut l = [0.0; 4096];
        let mut r = [0.0; 4096];
        reverb.process_planar([&impulse, &silence], [&mut l, &mut r]);
        assert!(l.iter().chain(r.iter()).any(|value| value.abs() > 1e-6));
        reverb.reset_to([0.8, 0.4, 1.0, 0.0, 1.0]);
        reverb.process_planar([&silence, &silence], [&mut l, &mut r]);
        assert!(l.iter().chain(r.iter()).all(|value| value.abs() < 1e-6));
    }
}
