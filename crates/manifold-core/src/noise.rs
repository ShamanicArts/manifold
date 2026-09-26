//! Deterministic stereo noise source following the legacy scalar node.

pub struct NoiseGenerator {
    sample_rate: f32,
    target_level: f32,
    target_color: f32,
    level: f32,
    color: f32,
    smooth: f32,
    rng: [u32; 2],
    lowpass: [f32; 2],
}

impl NoiseGenerator {
    pub fn new(sample_rate: f32, level: f32, color: f32) -> Self {
        let smooth = (1.0 - (-1.0 / (0.01 * sample_rate as f64)).exp()) as f32;
        Self {
            sample_rate,
            target_level: level.clamp(0.0, 1.0),
            target_color: color.clamp(0.0, 1.0),
            level: level.clamp(0.0, 1.0),
            color: color.clamp(0.0, 1.0),
            smooth: smooth.clamp(0.0001, 1.0),
            rng: [0x1234_5678, 0x8765_4321],
            lowpass: [0.0; 2],
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 => self.target_level = value.clamp(0.0, 1.0),
            1 => self.target_color = value.clamp(0.0, 1.0),
            _ => return false,
        }
        true
    }

    pub fn process_sample(&mut self) -> [f32; 2] {
        self.level += (self.target_level - self.level) * self.smooth;
        self.color += (self.target_color - self.color) * self.smooth;
        let cutoff = 16_000.0 + self.color * (600.0 - 16_000.0);
        let two_pi_cutoff = 2.0 * std::f32::consts::PI * cutoff;
        let a = (two_pi_cutoff / (two_pi_cutoff + self.sample_rate)).clamp(0.0001, 1.0);
        let mut output = [0.0; 2];
        for (channel, item) in output.iter_mut().enumerate() {
            let mut x = self.rng[channel];
            x ^= x << 13;
            x ^= x >> 17;
            x ^= x << 5;
            self.rng[channel] = x;
            let n = (x as f32) * (1.0f32 / 4_294_967_295.0f32) * 2.0 - 1.0;
            self.lowpass[channel] += a * (n - self.lowpass[channel]);
            *item = self.lowpass[channel] * self.level;
        }
        output
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seeded_noise_is_repeatable_and_stereo_independent() {
        let mut a = NoiseGenerator::new(48_000.0, 0.5, 0.3);
        let mut b = NoiseGenerator::new(48_000.0, 0.5, 0.3);
        for _ in 0..1024 {
            let first = a.process_sample();
            assert_eq!(first, b.process_sample());
            assert_ne!(first[0], first[1]);
        }
    }
}
