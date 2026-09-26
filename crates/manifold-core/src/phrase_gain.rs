//! Additive phrase contour driven by a typed sample envelope.
//! The Main Lua voice uses 1 + (clamp(envelope / reference, 0, 3) - 1) * amount.

pub struct PhraseGain {
    target: [f32; 2],
    current: [f32; 2],
    smoothing: f32,
    last_gain: f32,
}

impl PhraseGain {
    pub fn new(sample_rate: f32, amount: f32, reference: f32) -> Self {
        let values = [amount.clamp(0.0, 1.0), reference.clamp(0.05, 0.6)];
        Self {
            target: values,
            current: values,
            smoothing: (1.0 - (-1.0 / (0.01 * sample_rate.max(1.0))).exp()).clamp(0.0001, 1.0),
            last_gain: 1.0,
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 => self.target[0] = value.clamp(0.0, 1.0),
            1 => self.target[1] = value.clamp(0.05, 0.6),
            _ => return false,
        }
        true
    }

    pub fn process_planar(
        &mut self,
        input: [&[f32]; 2],
        envelope: &[f32],
        output: [&mut [f32]; 2],
    ) {
        let [left, right] = input;
        let [out_left, out_right] = output;
        debug_assert_eq!(left.len(), envelope.len());
        for frame in 0..left.len() {
            for index in 0..2 {
                self.current[index] += (self.target[index] - self.current[index]) * self.smoothing;
            }
            let normalized = (envelope[frame] / self.current[1]).clamp(0.0, 3.0);
            let gain = 1.0 + (normalized - 1.0) * self.current[0];
            self.last_gain = gain;
            out_left[frame] = left[frame] * gain;
            out_right[frame] = right[frame] * gain;
        }
    }

    pub fn last_gain(&self) -> f32 {
        self.last_gain
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn phrase_formula_preserves_bypass_and_full_contour() {
        let mut gain = PhraseGain::new(1.0, 0.0, 0.2);
        let audio = [0.5, 0.5, 0.5, 0.5];
        let contour = [0.0, 0.1, 0.2, 0.8];
        let mut left = [0.0; 4];
        let mut right = [0.0; 4];
        gain.process_planar([&audio, &audio], &contour, [&mut left, &mut right]);
        assert_eq!(left, audio);
        assert!(gain.set_parameter(0, 1.0));
        gain.process_planar([&audio, &audio], &contour, [&mut left, &mut right]);
        assert_eq!(left, [0.0, 0.25, 0.5, 1.5]);
        assert_eq!(left, right);
        assert_eq!(gain.last_gain(), 3.0);
        assert!(!gain.set_parameter(1, f32::NAN));
    }

    #[test]
    fn live_amount_change_smooths_the_first_sample() {
        let mut gain = PhraseGain::new(48_000.0, 0.0, 0.2);
        assert!(gain.set_parameter(0, 1.0));
        let mut left = [0.0; 1];
        let mut right = [0.0; 1];
        gain.process_planar([&[1.0], &[1.0]], &[0.6], [&mut left, &mut right]);
        assert!(left[0] > 1.0 && left[0] < 1.01);
        assert_eq!(left, right);
    }
}
