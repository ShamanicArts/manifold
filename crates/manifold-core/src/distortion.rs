//! Port of the legacy scalar DistortionNode, with 10 ms parameter smoothing.

pub struct Distortion {
    current: [f32; 3],
    target: [f32; 3],
    smoothing: f32,
}

impl Distortion {
    pub fn new(sample_rate: f32, drive: f32, mix: f32, output: f32) -> Self {
        let values = [
            drive.clamp(1.0, 30.0),
            mix.clamp(0.0, 1.0),
            output.clamp(0.0, 2.0),
        ];
        Self {
            current: values,
            target: values,
            smoothing: ((1.0 - (-1.0 / (0.01 * sample_rate as f64)).exp()) as f32)
                .clamp(0.0001, 1.0),
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 => self.target[0] = value.clamp(1.0, 30.0),
            1 => self.target[1] = value.clamp(0.0, 1.0),
            2 => self.target[2] = value.clamp(0.0, 2.0),
            _ => return false,
        }
        true
    }

    pub fn reset(&mut self) {
        self.current = self.target;
    }

    pub fn process_sample(&mut self, input: [f32; 2]) -> [f32; 2] {
        for index in 0..3 {
            self.current[index] += (self.target[index] - self.current[index]) * self.smoothing;
        }
        let [drive, mix, output] = self.current;
        let dry = 1.0 - mix;
        [0, 1].map(|channel| {
            let sample = input[channel];
            ((sample * dry + (sample * drive).tanh() * mix) * output).clamp(-1.0, 1.0)
        })
    }
}
