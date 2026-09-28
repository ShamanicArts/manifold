//! Prepared scalar control utilities, evaluated once per audio sample.

fn bipolar(value: f32) -> f32 {
    if value.is_finite() {
        value.clamp(-1.0, 1.0)
    } else {
        0.0
    }
}

pub struct AttenuverterBias {
    amount: f32,
    bias: f32,
    output: f32,
}

impl AttenuverterBias {
    pub fn new(amount: f32, bias: f32) -> Self {
        Self {
            amount: bipolar(amount),
            bias: bipolar(bias),
            output: 0.0,
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 => self.amount = bipolar(value),
            1 => self.bias = bipolar(value),
            _ => return false,
        }
        true
    }

    pub fn reset(&mut self) {
        self.output = 0.0;
    }

    pub fn process_sample(&mut self, input: f32) -> f32 {
        self.output = bipolar(bipolar(input) * self.amount + self.bias);
        self.output
    }

    pub fn meter(&self) -> f32 {
        self.output
    }
}

pub struct SampleHold {
    mode: u32,
    output: f32,
    trigger_high: bool,
}

impl SampleHold {
    pub fn new(mode: u32) -> Self {
        Self {
            mode: mode.min(2),
            output: 0.0,
            trigger_high: false,
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if id != 0 || !value.is_finite() {
            return false;
        }
        self.mode = value.round().clamp(0.0, 2.0) as u32;
        true
    }

    pub fn reset(&mut self) {
        self.output = 0.0;
        self.trigger_high = false;
    }

    pub fn restore(&mut self, output: f32, trigger_high: bool) -> bool {
        if !output.is_finite() {
            return false;
        }
        self.output = bipolar(output);
        self.trigger_high = trigger_high;
        true
    }

    pub fn trigger_high(&self) -> bool {
        self.trigger_high
    }

    pub fn process_sample(&mut self, input: f32, trigger: f32) -> f32 {
        let input = bipolar(input);
        let high = trigger.is_finite() && trigger > 0.5;
        if self.mode == 1 {
            if high {
                self.output = input;
            }
        } else if high && !self.trigger_high {
            self.output = if self.mode == 2 {
                let step = (((input + 1.0) * 0.5 * 12.0) + 0.5).floor();
                bipolar(step / 12.0 * 2.0 - 1.0)
            } else {
                input
            };
        }
        self.trigger_high = high;
        self.output
    }

    pub fn meter(&self) -> f32 {
        self.output
    }
}

pub struct CvMix {
    levels: [f32; 4],
    offset: f32,
    output: f32,
}

impl CvMix {
    pub fn new(levels: [f32; 4], offset: f32) -> Self {
        Self {
            levels: levels.map(|value| value.clamp(0.0, 1.0)),
            offset: bipolar(offset),
            output: 0.0,
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0..=3 => self.levels[id as usize] = value.clamp(0.0, 1.0),
            4 => self.offset = bipolar(value),
            _ => return false,
        }
        true
    }

    pub fn reset(&mut self) {
        self.output = 0.0;
    }

    pub fn process_sample(&mut self, input: [f32; 4]) -> f32 {
        let mut sum = self.offset;
        for (index, source) in input.into_iter().enumerate() {
            sum += bipolar(source) * self.levels[index];
        }
        self.output = bipolar(sum);
        self.output
    }

    pub fn meter(&self) -> f32 {
        self.output
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn amount_inverts_biases_and_clamps() {
        let mut control = AttenuverterBias::new(-0.5, 0.25);
        assert_eq!(control.process_sample(1.0), -0.25);
        assert_eq!(control.process_sample(-1.0), 0.75);
        control.set_parameter(1, 1.0);
        assert_eq!(control.process_sample(-1.0), 1.0);
        assert!(!control.set_parameter(2, 0.0));
    }

    #[test]
    fn sample_track_and_quantize_follow_trigger_semantics() {
        let mut hold = SampleHold::new(0);
        assert_eq!(hold.process_sample(0.7, 0.0), 0.0);
        assert_eq!(hold.process_sample(0.7, 1.0), 0.7);
        assert_eq!(hold.process_sample(-0.4, 1.0), 0.7);
        hold.set_parameter(0, 1.0);
        assert_eq!(hold.process_sample(-0.4, 1.0), -0.4);
        assert_eq!(hold.process_sample(0.9, 0.0), -0.4);
        hold.set_parameter(0, 2.0);
        assert!((hold.process_sample(0.24, 1.0) - 1.0 / 6.0).abs() < 1e-6);
    }

    #[test]
    fn mixer_uses_four_independent_inputs_and_offset() {
        let mut mixer = CvMix::new([1.0, 0.5, 0.0, 1.0], -0.25);
        assert_eq!(mixer.process_sample([0.5, -0.5, 0.9, 0.25]), 0.25);
        assert_eq!(mixer.process_sample([1.0, 1.0, 1.0, 1.0]), 1.0);
        assert!(!mixer.set_parameter(5, 1.0));
    }
}
