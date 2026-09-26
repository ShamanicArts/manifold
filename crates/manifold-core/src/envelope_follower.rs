//! Legacy audio passthrough and peak/RMS/hybrid envelope readout.

pub struct EnvelopeFollower {
    target: [f32; 4],
    current: [f32; 4],
    mode: u32,
    smooth: f32,
    sample_rate: f32,
    hp_state: [f32; 2],
    hp_input: [f32; 2],
    envelope: f32,
    meter: f32,
}

impl EnvelopeFollower {
    pub fn new(sample_rate: f32, attack_ms: f32, release_ms: f32) -> Self {
        let target = [
            attack_ms.clamp(0.01, 500.0),
            release_ms.clamp(0.1, 5000.0),
            1.0,
            80.0,
        ];
        Self {
            target,
            current: target,
            mode: 0,
            smooth: (1.0 - (-1.0 / (0.01 * sample_rate as f64)).exp()).clamp(0.0001, 1.0) as f32,
            sample_rate,
            hp_state: [0.0; 2],
            hp_input: [0.0; 2],
            envelope: 0.0,
            meter: 0.0,
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 => self.target[0] = value.clamp(0.01, 500.0),
            1 => self.target[1] = value.clamp(0.1, 5000.0),
            2 => self.target[2] = value.clamp(0.01, 16.0),
            3 => self.target[3] = value.clamp(5.0, 4000.0),
            4 => self.mode = value.round().clamp(0.0, 2.0) as u32,
            _ => return false,
        }
        true
    }

    pub fn settle(&mut self) {
        self.current = self.target;
    }

    pub fn reset(&mut self) {
        self.hp_state = [0.0; 2];
        self.hp_input = [0.0; 2];
        self.envelope = 0.0;
        self.meter = 0.0;
    }

    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let [left, right] = input;
        let [out_left, out_right] = output;
        for frame in 0..left.len() {
            self.process_sample([left[frame], right[frame]]);
            out_left[frame] = left[frame];
            out_right[frame] = right[frame];
        }
    }

    /// Return the normalized detector value for a typed control edge.
    pub fn process_sample(&mut self, input: [f32; 2]) -> f32 {
        for index in 0..4 {
            self.current[index] += (self.target[index] - self.current[index]) * self.smooth;
        }
        let hp_coefficient =
            (-2.0 * std::f32::consts::PI * self.current[3] / self.sample_rate).exp();
        let attack_coefficient =
            (-1.0 / ((self.current[0] * 0.001).max(0.0001) * self.sample_rate)).exp();
        let release_coefficient =
            (-1.0 / ((self.current[1] * 0.001).max(0.0001) * self.sample_rate)).exp();
        let mut sum = 0.0;
        for channel in 0..2 {
            let sample = input[channel];
            let hp = hp_coefficient * (self.hp_state[channel] + sample - self.hp_input[channel]);
            self.hp_input[channel] = sample;
            self.hp_state[channel] = hp;
            sum += if self.mode == 1 { hp * hp } else { hp.abs() };
        }
        let detector = match self.mode {
            1 => (sum * 0.5).sqrt() * self.current[2],
            2 => (sum * 0.5) * self.current[2] * 0.7 + self.envelope * 0.3,
            _ => (sum * 0.5) * self.current[2],
        };
        let coefficient = if detector > self.envelope {
            attack_coefficient
        } else {
            release_coefficient
        };
        self.envelope = coefficient * self.envelope + (1.0 - coefficient) * detector;
        self.meter = self.envelope.clamp(0.0, 1.0);
        self.meter
    }

    pub fn meter(&self) -> f32 {
        self.meter
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tracks_signal_then_releases_and_preserves_audio() {
        let mut follower = EnvelopeFollower::new(48_000.0, 1.0, 20.0);
        let signal = [vec![0.5; 512], vec![-0.2; 512]];
        let mut output = [vec![0.0; 512], vec![0.0; 512]];
        let [out_left, out_right] = &mut output;
        follower.process_planar([&signal[0], &signal[1]], [out_left, out_right]);
        assert_eq!(signal, output);
        assert!(follower.meter() > 0.0);
        let before_release = follower.meter();
        let silence = [vec![0.0; 4096], vec![0.0; 4096]];
        let mut released = [vec![0.0; 4096], vec![0.0; 4096]];
        let [left, right] = &mut released;
        follower.process_planar([&silence[0], &silence[1]], [left, right]);
        assert!(follower.meter() < before_release);
        assert!(!follower.set_parameter(4, f32::NAN));
    }
}
