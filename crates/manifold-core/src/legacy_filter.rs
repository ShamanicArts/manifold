//! Scalar port of the original FilterNode, distinct from Standalone Filter's SVFNode.

pub const PARAM_COUNT: usize = 3;
pub const DEFAULTS: [f32; PARAM_COUNT] = [1400.0, 0.1, 1.0];

pub fn set_value(params: &mut [f32; PARAM_COUNT], id: u32, value: f32) -> bool {
    if !value.is_finite() {
        return false;
    }
    let bounded = match id {
        0 => value.clamp(20.0, 18000.0),
        1 | 2 => value.clamp(0.0, 1.0),
        _ => return false,
    };
    params[id as usize] = bounded;
    true
}

pub struct LegacyFilter {
    sample_rate: f32,
    target: [f32; PARAM_COUNT],
    current: [f32; PARAM_COUNT],
    smoothing: f32,
    z1: [f32; 2],
    z2: [f32; 2],
}

impl LegacyFilter {
    pub fn new(sample_rate: f32, params: [f32; PARAM_COUNT]) -> Self {
        let mut target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut target, id as u32, value);
        }
        let smoothing =
            ((1.0 - (-1.0 / (0.02 * sample_rate as f64)).exp()) as f32).clamp(0.0001, 1.0);
        Self {
            sample_rate,
            target,
            current: target,
            smoothing,
            z1: [0.0; 2],
            z2: [0.0; 2],
        }
    }
    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        set_value(&mut self.target, id, value)
    }
    pub fn reset(&mut self) {
        self.current = self.target;
        self.z1 = [0.0; 2];
        self.z2 = [0.0; 2];
    }
    // The original scalar FilterNode::reset is a no-op; freshly prepared instances clear state.
    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let [in_l, in_r] = input;
        let [out_l, out_r] = output;
        for frame in 0..in_l.len() {
            for id in 0..PARAM_COUNT {
                self.current[id] += (self.target[id] - self.current[id]) * self.smoothing;
            }
            let normalized = (self.current[0] / self.sample_rate).clamp(0.0001, 0.49);
            let shaping = 1.0 + self.current[1] * 0.6;
            let alpha = (1.0 - (-2.0 * std::f32::consts::PI * normalized * shaping).exp())
                .clamp(0.0001, 0.999);
            let feedback = self.current[1] * 0.85;
            let dry = 1.0 - self.current[2];
            let wet = self.current[2];
            for (ch, input, output) in [
                (0, in_l[frame], &mut out_l[frame]),
                (1, in_r[frame], &mut out_r[frame]),
            ] {
                let x = input - feedback * (self.z2[ch] - self.z1[ch]);
                self.z1[ch] += alpha * (x - self.z1[ch]);
                self.z2[ch] += alpha * (self.z1[ch] - self.z2[ch]);
                *output = input * dry + self.z2[ch] * wet;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn lowpass_rejects_alternating_signal_and_dry_mix_restores_it() {
        let input_l: [f32; 1024] =
            std::array::from_fn(|frame| if frame % 2 == 0 { 1.0 } else { -1.0 });
        let input_r = input_l.map(|x| -x);
        let mut wet = LegacyFilter::new(48000.0, [500.0, 0.2, 1.0]);
        let mut dry = LegacyFilter::new(48000.0, [500.0, 0.2, 0.0]);
        let mut out_l = [0.0; 1024];
        let mut out_r = [0.0; 1024];
        wet.process_planar([&input_l, &input_r], [&mut out_l, &mut out_r]);
        assert!(out_l[1023].abs() < 0.1 && out_r[1023].abs() < 0.1);
        dry.process_planar([&input_l, &input_r], [&mut out_l, &mut out_r]);
        assert_eq!(out_l, input_l);
        assert_eq!(out_r, input_r);
    }
}
