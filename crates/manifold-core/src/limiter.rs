//! Scalar stereo port of the legacy LimiterNode, including its block-averaged
//! gain-reduction meter. All processing state is owned by the prepared graph.

pub const PARAM_COUNT: usize = 5;

pub fn defaults() -> [f32; PARAM_COUNT] {
    [-1.0, 60.0, 0.0, 0.2, 1.0]
}

pub fn set_value(params: &mut [f32; PARAM_COUNT], id: u32, value: f32) -> bool {
    if !value.is_finite() {
        return false;
    }
    let Some(target) = params.get_mut(id as usize) else {
        return false;
    };
    *target = match id {
        0 => value.clamp(-24.0, 0.0),
        1 => value.clamp(1.0, 500.0),
        2 => value.clamp(0.0, 18.0),
        3 | 4 => value.clamp(0.0, 1.0),
        _ => unreachable!(),
    };
    true
}

pub struct Limiter {
    target: [f32; PARAM_COUNT],
    current: [f32; PARAM_COUNT],
    smooth: f32,
    sample_rate: f32,
    gain: f32,
    reduction_db: f32,
}

impl Limiter {
    pub fn new(sample_rate: f32, values: [f32; PARAM_COUNT]) -> Self {
        let mut target = defaults();
        for (id, value) in values.into_iter().enumerate() {
            assert!(set_value(&mut target, id as u32, value));
        }
        Self {
            target,
            current: target,
            smooth: (1.0 - (-1.0 / (0.01 * sample_rate as f64)).exp() as f32).clamp(0.0001, 1.0),
            sample_rate,
            gain: 1.0,
            reduction_db: 0.0,
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        set_value(&mut self.target, id, value)
    }

    pub fn reset(&mut self) {
        self.current = self.target;
        self.gain = 1.0;
        self.reduction_db = 0.0;
    }

    pub fn process_sample(&mut self, input: [f32; 2]) -> [f32; 2] {
        for id in 0..PARAM_COUNT {
            self.current[id] += (self.target[id] - self.current[id]) * self.smooth;
        }
        let [threshold_db, release_ms, makeup_db, soft_clip, mix] = self.current;
        let threshold = 10.0_f32.powf(threshold_db / 20.0);
        let makeup = 10.0_f32.powf(makeup_db / 20.0);
        let peak = input[0].abs().max(input[1].abs());
        let target_gain = if peak > threshold && peak > 0.0 {
            threshold / peak
        } else {
            1.0
        };
        let release = (-1.0 / ((release_ms * 0.001).max(0.0001) * self.sample_rate)).exp();
        if target_gain < self.gain {
            self.gain = target_gain;
        } else {
            self.gain = release * self.gain + (1.0 - release) * target_gain;
        }
        let mut wet = [input[0] * self.gain * makeup, input[1] * self.gain * makeup];
        if soft_clip > 0.0001 {
            let drive = 1.0 + soft_clip * 6.0;
            wet[0] = (wet[0] * drive).tanh() / drive;
            wet[1] = (wet[1] * drive).tanh() / drive;
        }
        [
            input[0] * (1.0 - mix) + wet[0] * mix,
            input[1] * (1.0 - mix) + wet[1] * mix,
        ]
    }

    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let [left, right] = input;
        let [out_left, out_right] = output;
        let mut reduction = 0.0;
        for frame in 0..left.len() {
            let value = self.process_sample([left[frame], right[frame]]);
            out_left[frame] = value[0];
            out_right[frame] = value[1];
            reduction += -20.0 * self.gain.max(0.000001).log10();
        }
        self.reduction_db = if left.is_empty() {
            0.0
        } else {
            reduction / left.len() as f32
        };
    }

    pub fn gain_reduction_db(&self) -> f32 {
        self.reduction_db
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamps_stereo_peak_and_reports_block_average_reduction() {
        let mut limiter = Limiter::new(48_000.0, [-6.0, 60.0, 0.0, 0.0, 1.0]);
        let left = [0.9; 128];
        let right = [0.3; 128];
        let mut out_left = [0.0; 128];
        let mut out_right = [0.0; 128];
        limiter.process_planar([&left, &right], [&mut out_left, &mut out_right]);
        assert!(
            out_left
                .iter()
                .all(|sample| *sample <= 10.0_f32.powf(-6.0 / 20.0) + 1e-6)
        );
        assert!(limiter.gain_reduction_db() > 0.0);
        assert!(!limiter.set_parameter(0, f32::NAN));
    }
}
