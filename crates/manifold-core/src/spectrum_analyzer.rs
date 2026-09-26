//! Legacy SpectrumAnalyzer: eight smoothed band estimates and unchanged stereo audio.
//! These are one-pole split envelopes, not FFT bins.

pub struct SpectrumAnalyzer {
    target: [f32; 3],
    current: [f32; 3],
    smooth: f32,
    split_coefficient: [f32; 7],
    split_state: [f32; 7],
    band_state: [f32; 8],
    bands: [f32; 8],
}

impl SpectrumAnalyzer {
    pub fn new(sample_rate: f32, sensitivity: f32, smoothing: f32, floor_db: f32) -> Self {
        let target = [
            sensitivity.clamp(0.1, 8.0),
            smoothing.clamp(0.0, 0.999),
            floor_db.clamp(-96.0, -12.0),
        ];
        let frequencies = [60.0, 120.0, 250.0, 500.0, 1000.0, 2500.0, 6000.0];
        let split_coefficient =
            frequencies.map(|hz| (-2.0 * std::f32::consts::PI * hz / sample_rate).exp());
        Self {
            target,
            current: target,
            smooth: (1.0 - (-1.0 / (0.01 * sample_rate as f64)).exp()).clamp(0.0001, 1.0) as f32,
            split_coefficient,
            split_state: [0.0; 7],
            band_state: [0.0; 8],
            bands: [0.0; 8],
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        let index = id as usize;
        if index >= 3 {
            return false;
        }
        self.target[index] = match id {
            0 => value.clamp(0.1, 8.0),
            1 => value.clamp(0.0, 0.999),
            _ => value.clamp(-96.0, -12.0),
        };
        true
    }

    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let [left, right] = input;
        let [out_left, out_right] = output;
        for frame in 0..left.len() {
            for control in 0..3 {
                self.current[control] +=
                    (self.target[control] - self.current[control]) * self.smooth;
            }
            let detector = (0.5 * (left[frame] + right[frame])).abs() * self.current[0];
            out_left[frame] = left[frame];
            out_right[frame] = right[frame];
            let mut previous = 0.0;
            for band in 0..7 {
                let coefficient = self.split_coefficient[band];
                self.split_state[band] =
                    coefficient * self.split_state[band] + (1.0 - coefficient) * detector;
                let split = self.split_state[band];
                let contribution = (split - previous).max(0.0);
                previous = split;
                self.band_state[band] = self.band_state[band] * self.current[1]
                    + contribution * (1.0 - self.current[1]);
            }
            let high_band = (detector - previous).max(0.0);
            self.band_state[7] =
                self.band_state[7] * self.current[1] + high_band * (1.0 - self.current[1]);
        }
        if !left.is_empty() {
            let floor = 10.0_f32.powf(self.current[2] / 20.0);
            let span = 1.0 / (1.0 - floor).max(0.000001);
            for band in 0..8 {
                self.bands[band] = ((self.band_state[band] - floor) * span).clamp(0.0, 1.0);
            }
        }
    }

    pub fn band(&self, index: usize) -> Option<f32> {
        self.bands.get(index).copied()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passes_audio_unchanged_and_exposes_bounded_bands() {
        let mut analyzer = SpectrumAnalyzer::new(48_000.0, 1.0, 0.85, -72.0);
        let input = [vec![0.4; 512], vec![0.2; 512]];
        let mut output = [vec![0.0; 512], vec![0.0; 512]];
        let [out_left, out_right] = &mut output;
        analyzer.process_planar([&input[0], &input[1]], [out_left, out_right]);
        assert_eq!(output, input);
        assert!((0..8).any(|band| analyzer.band(band).unwrap() > 0.0));
        assert!(analyzer.band(8).is_none());
        assert!(!analyzer.set_parameter(0, f32::NAN));
    }
}
