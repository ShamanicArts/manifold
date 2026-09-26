//! Audio-rate control oscillator. It emits bipolar CV, not an audio signal.

pub struct Lfo {
    sample_rate: f64,
    phase: f64,
    waveform: u32,
    rate: f64,
}

impl Lfo {
    pub fn new(sample_rate: f32, waveform: u32, rate: f32) -> Self {
        Self {
            sample_rate: sample_rate as f64,
            phase: 0.0,
            waveform,
            rate: rate.clamp(0.05, 20.0) as f64,
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 => self.waveform = value.round().clamp(0.0, 2.0) as u32,
            1 => self.rate = value.clamp(0.05, 20.0) as f64,
            _ => return false,
        }
        true
    }

    pub fn process_sample(&mut self) -> f32 {
        let value = match self.waveform {
            1 => {
                if self.phase < 0.25 {
                    self.phase * 4.0
                } else if self.phase < 0.75 {
                    2.0 - self.phase * 4.0
                } else {
                    self.phase * 4.0 - 4.0
                }
            }
            2 => {
                if self.phase < 0.5 {
                    1.0
                } else {
                    -1.0
                }
            }
            _ => (std::f64::consts::TAU * self.phase).sin(),
        } as f32;
        self.phase += self.rate / self.sample_rate;
        if self.phase >= 1.0 {
            self.phase -= self.phase.floor();
        }
        value
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn phase_continues_across_calls() {
        let mut a = Lfo::new(1_000.0, 0, 10.0);
        let mut b = Lfo::new(1_000.0, 0, 10.0);
        let first: Vec<_> = (0..100).map(|_| a.process_sample()).collect();
        for _ in 0..50 {
            b.process_sample();
        }
        let second: Vec<_> = (0..50).map(|_| b.process_sample()).collect();
        assert_eq!(&first[50..], &second);
    }
}
