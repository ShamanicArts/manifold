//! Port of the original StereoWidenerNode scalar stereo path.

pub const PARAM_COUNT: usize = 3;
pub const DEFAULTS: [f32; PARAM_COUNT] = [1.0, 120.0, 1.0];

pub fn set_value(params: &mut [f32; PARAM_COUNT], id: u32, value: f32) -> bool {
    if !value.is_finite() {
        return false;
    }
    let bounded = match id {
        0 => value.clamp(0.0, 2.0),
        1 => value.clamp(20.0, 500.0),
        2 => {
            if value >= 0.5 {
                1.0
            } else {
                0.0
            }
        }
        _ => return false,
    };
    params[id as usize] = bounded;
    true
}

pub struct StereoWidener {
    sample_rate: f32,
    target: [f32; PARAM_COUNT],
    width: f32,
    mono_low_freq: f32,
    smooth: f32,
    low: [f32; 2],
    corr_num: f32,
    corr_den: [f32; 2],
    correlation: f32,
}

impl StereoWidener {
    pub fn new(sample_rate: f32, params: [f32; PARAM_COUNT]) -> Self {
        let mut target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut target, id as u32, value);
        }
        let smooth = (1.0 - (-1.0 / (0.01 * sample_rate as f64)).exp()) as f32;
        Self {
            sample_rate,
            target,
            width: target[0],
            mono_low_freq: target[1],
            smooth: smooth.clamp(0.0001, 1.0),
            low: [0.0; 2],
            corr_num: 0.0,
            corr_den: [0.0; 2],
            correlation: 0.0,
        }
    }
    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        set_value(&mut self.target, id, value)
    }
    pub fn reset(&mut self) {
        self.low = [0.0; 2];
        self.corr_num = 0.0;
        self.corr_den = [0.0; 2];
        self.correlation = 0.0;
    }
    pub fn correlation(&self) -> f32 {
        self.correlation
    }
    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let [in_l, in_r] = input;
        let [out_l, out_r] = output;
        for frame in 0..in_l.len() {
            self.width += (self.target[0] - self.width) * self.smooth;
            self.mono_low_freq += (self.target[1] - self.mono_low_freq) * self.smooth;
            let omega = 2.0 * std::f32::consts::PI * self.mono_low_freq / self.sample_rate;
            let alpha = (omega / (omega + 1.0)).clamp(0.00001, 0.99999);
            let dry_l = in_l[frame];
            let dry_r = in_r[frame];
            self.low[0] += alpha * (dry_l - self.low[0]);
            self.low[1] += alpha * (dry_r - self.low[1]);
            let (low_l, low_r) = if self.target[2] >= 0.5 {
                let mono = 0.5 * (self.low[0] + self.low[1]);
                (mono, mono)
            } else {
                (self.low[0], self.low[1])
            };
            let high_l = dry_l - self.low[0];
            let high_r = dry_r - self.low[1];
            let mid = 0.5 * (high_l + high_r);
            let side = 0.5 * (high_l - high_r) * self.width;
            let left = low_l + mid + side;
            let right = low_r + mid - side;
            out_l[frame] = left;
            out_r[frame] = right;
            const CORR_SMOOTH: f32 = 0.001;
            self.corr_num += CORR_SMOOTH * (left * right - self.corr_num);
            self.corr_den[0] += CORR_SMOOTH * (left * left - self.corr_den[0]);
            self.corr_den[1] += CORR_SMOOTH * (right * right - self.corr_den[1]);
        }
        let denom = (self.corr_den[0] * self.corr_den[1]).max(1.0e-9).sqrt();
        self.correlation = (self.corr_num / denom).clamp(-1.0, 1.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn width_and_mono_low_change_stereo_difference() {
        let input_l: [f32; 1024] =
            std::array::from_fn(|frame| if frame % 2 == 0 { 1.0 } else { -1.0 });
        let input_r = input_l.map(|value| -value);
        let mut out_l = [0.0; 1024];
        let mut out_r = [0.0; 1024];
        let mut mono = StereoWidener::new(48000.0, [0.0, 120.0, 1.0]);
        mono.process_planar([&input_l, &input_r], [&mut out_l, &mut out_r]);
        assert!(out_l[1023].abs() < 0.1 && out_r[1023].abs() < 0.1);
        let mut wide = StereoWidener::new(48000.0, [2.0, 120.0, 0.0]);
        wide.process_planar([&input_l, &input_r], [&mut out_l, &mut out_r]);
        assert!(out_l[1023].abs() > 1.5 && out_r[1023].abs() > 1.5);
        assert!(out_l[1023] * out_r[1023] < 0.0);
        assert!(wide.correlation() < -0.9);
    }
}
