//! Main rack scalar Slew, following `Main/lib/slew_runtime.lua`.
//! This is a control update, distinct from the stereo audio SlewLimiter.

pub struct MainControlSlew {
    rise_ms: f32,
    fall_ms: f32,
    shape: u32,
    input: f32,
    output: f32,
}

impl MainControlSlew {
    pub fn new() -> Self {
        Self {
            rise_ms: 0.0,
            fall_ms: 0.0,
            shape: 1,
            input: 0.0,
            output: 0.0,
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 if (0.0..=2000.0).contains(&value) => self.rise_ms = value,
            1 if (0.0..=2000.0).contains(&value) => self.fall_ms = value,
            2 if value.fract() == 0.0 && (0.0..=2.0).contains(&value) => self.shape = value as u32,
            _ => return false,
        }
        true
    }

    pub fn process(&mut self, input: f32, elapsed_seconds: f32) -> f32 {
        self.input = if input.is_finite() {
            input.clamp(-1.0, 1.0)
        } else {
            0.0
        };
        let diff = self.input - self.output;
        if self.rise_ms == 0.0 && self.fall_ms == 0.0 || diff.abs() <= 0.0001 {
            self.output = self.input;
        } else {
            let time_ms = if diff > 0.0 {
                self.rise_ms
            } else {
                self.fall_ms
            };
            let linear = if time_ms <= 0.0 {
                1.0
            } else {
                (elapsed_seconds.max(0.0) * 1000.0 / time_ms).clamp(0.0, 1.0)
            };
            let alpha = match self.shape {
                0 => linear,
                1 => 1.0 - (1.0 - linear) * (1.0 - linear),
                _ => linear * linear,
            };
            self.output = (self.output + diff * alpha).clamp(-1.0, 1.0);
        }
        self.output
    }

    pub fn input(&self) -> f32 {
        self.input
    }
    pub fn output(&self) -> f32 {
        self.output
    }
}

impl Default for MainControlSlew {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn original_lua_rise_fall_trace_and_shape_curves() {
        let mut slew = MainControlSlew::new();
        assert!(slew.set_parameter(0, 1000.0));
        assert!(slew.set_parameter(1, 1000.0));
        assert!(slew.set_parameter(2, 0.0));
        assert_eq!(slew.process(1.0, 0.5), 0.5);
        assert_eq!(slew.process(-1.0, 0.25), 0.125);
        assert!(slew.set_parameter(2, 1.0));
        assert_eq!(slew.process(1.0, 0.5), 0.78125);
        assert!(slew.set_parameter(2, 2.0));
        assert_eq!(slew.process(-1.0, 0.5), 0.3359375);
        assert!(slew.set_parameter(0, 0.0));
        assert!(slew.set_parameter(1, 0.0));
        assert_eq!(slew.process(-1.0, 0.001), -1.0);
    }
}
