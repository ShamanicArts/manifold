//! Stereo audio-rate FM from the historical AudioFm primitive: a modulated,
//! interpolated short delay with all history allocated during preparation.

pub const PARAM_COUNT: usize = 2;
pub const DEFAULTS: [f32; PARAM_COUNT] = [0.0, 0.0];

pub fn set_value(params: &mut [f32; PARAM_COUNT], id: u32, value: f32) -> bool {
    if !value.is_finite() || id as usize >= PARAM_COUNT {
        return false;
    }
    params[id as usize] = value.clamp(0.0, 1.0);
    true
}

pub struct AudioFm {
    target: [f32; PARAM_COUNT],
    current: [f32; PARAM_COUNT],
    smooth: f32,
    sample_rate: f32,
    history: [Vec<f32>; 2],
    write: usize,
}

impl AudioFm {
    pub fn new(sample_rate: f32, max_frames: usize, params: [f32; PARAM_COUNT]) -> Self {
        let sample_rate = if sample_rate > 1.0 {
            sample_rate
        } else {
            44_100.0
        };
        let size = 2048.max((sample_rate * 0.03).ceil() as usize + max_frames.max(4) + 8);
        let mut target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut target, id as u32, value);
        }
        Self {
            target,
            current: target,
            smooth: (1.0 - (-1.0 / (0.01 * sample_rate as f64)).exp() as f32).clamp(0.0001, 1.0),
            sample_rate,
            history: [vec![0.0; size], vec![0.0; size]],
            write: 0,
        }
    }

    pub fn reset(&mut self) {
        self.write = 0;
        self.current = self.target;
        for channel in &mut self.history {
            channel.fill(0.0);
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        set_value(&mut self.target, id, value)
    }

    fn read(history: &[f32], index: f32) -> f32 {
        let index = index.rem_euclid(history.len() as f32);
        let a = index.floor() as usize;
        let b = (a + 1) % history.len();
        history[a] + (history[b] - history[a]) * (index - a as f32)
    }

    pub fn process_planar(
        &mut self,
        input: [&[f32]; 2],
        modulator: Option<[&[f32]; 2]>,
        output: [&mut [f32]; 2],
    ) {
        let size = self.history[0].len();
        let max_mod = (self.sample_rate * 0.005).clamp(1.0, (size - 8) as f32);
        let center = max_mod + 2.0;
        let [left, right] = output;
        for frame in 0..left.len() {
            for id in 0..PARAM_COUNT {
                self.current[id] += (self.target[id] - self.current[id]) * self.smooth;
            }
            for channel in 0..2 {
                let carrier = input[channel][frame];
                let mod_sample = modulator
                    .as_ref()
                    .map_or(0.0, |bus| bus[channel][frame].clamp(-1.0, 1.0));
                self.history[channel][self.write] = carrier;
                let delay =
                    (center + mod_sample * self.current[0] * max_mod).clamp(1.0, (size - 4) as f32);
                let delayed = Self::read(&self.history[channel], self.write as f32 - delay);
                let wet = carrier + (delayed - carrier) * self.current[0];
                let result = carrier * (1.0 - self.current[1]) + wet * self.current[1];
                if channel == 0 {
                    left[frame] = result;
                } else {
                    right[frame] = result;
                }
            }
            self.write = (self.write + 1) % size;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn audio_modulation_changes_delayed_carrier_and_amount_zero_passes_through() {
        let mut node = AudioFm::new(48_000.0, 128, [1.0, 1.0]);
        let input = [0.5; 128];
        let positive = [1.0; 128];
        let negative = [-1.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        node.process_planar(
            [&input, &input],
            Some([&positive, &negative]),
            [&mut left, &mut right],
        );
        assert!(left.iter().zip(right).any(|(a, b)| (a - b).abs() > 0.1));
        let mut dry = AudioFm::new(48_000.0, 128, [0.0, 1.0]);
        dry.process_planar([&input, &input], None, [&mut left, &mut right]);
        assert!(left.iter().chain(right.iter()).all(|sample| *sample == 0.5));
    }
}
