//! Main's control-rate Compare utility, following compare_runtime.lua.

pub struct MainCompare {
    direction: u32,
    threshold: f32,
    hysteresis: f32,
    gate: bool,
    pulse_remaining: u8,
}

impl MainCompare {
    pub fn new() -> Self {
        Self {
            direction: 0,
            threshold: 0.0,
            hysteresis: 0.05,
            gate: false,
            pulse_remaining: 0,
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 if value.fract() == 0.0 && (0.0..=2.0).contains(&value) => {
                self.direction = value as u32;
            }
            1 if (-1.0..=1.0).contains(&value) => self.threshold = value,
            2 if (0.0..=0.5).contains(&value) => self.hysteresis = value,
            4 if value == 0.0 || value == 1.0 => self.gate = value == 1.0,
            5 if value.fract() == 0.0 && (0.0..=2.0).contains(&value) => {
                self.pulse_remaining = value as u8;
            }
            _ => return false,
        }
        true
    }

    pub fn gate(&self) -> f32 {
        f32::from(u8::from(self.gate))
    }

    pub fn trigger(&self) -> f32 {
        f32::from(u8::from(self.pulse_remaining > 0))
    }

    pub fn pulse_remaining(&self) -> u8 {
        self.pulse_remaining
    }

    /// One old control tick. A crossing emits this tick and one further tick.
    pub fn process(&mut self, input: f32) -> (f32, f32) {
        self.pulse_remaining = self.pulse_remaining.saturating_sub(1);
        let input = input.clamp(-1.0, 1.0);
        let high = self.threshold + self.hysteresis * 0.5;
        let low = self.threshold - self.hysteresis * 0.5;
        let next = if self.direction == 1 {
            if self.gate {
                input < high
            } else {
                input <= low
            }
        } else if self.gate {
            input > low
        } else {
            input >= high
        };
        let crossed = if self.direction == 2 {
            next != self.gate
        } else {
            !self.gate && next
        };
        self.gate = next;
        if crossed {
            self.pulse_remaining = 2;
        }
        (self.gate(), self.trigger())
    }
}

#[cfg(test)]
mod tests {
    use super::MainCompare;

    #[test]
    fn rising_hysteresis_and_two_tick_pulse_follow_lua() {
        let mut compare = MainCompare::new();
        assert_eq!(compare.process(-0.2), (0.0, 0.0));
        assert_eq!(compare.process(0.2), (1.0, 1.0));
        assert_eq!(compare.process(0.0), (1.0, 1.0));
        assert_eq!(compare.process(0.0), (1.0, 0.0));
        assert_eq!(compare.process(-0.2), (0.0, 0.0));
        assert!(compare.set_parameter(0, 1.0));
        assert_eq!(compare.process(0.2), (0.0, 0.0));
        assert_eq!(compare.process(-0.2), (1.0, 1.0));
    }

    #[test]
    fn both_mode_triggers_on_each_crossing_and_restores_state() {
        let mut compare = MainCompare::new();
        assert!(compare.set_parameter(0, 2.0));
        assert_eq!(compare.process(0.2), (1.0, 1.0));
        assert_eq!(compare.process(-0.2), (0.0, 1.0));
        assert!(compare.set_parameter(4, 1.0));
        assert!(compare.set_parameter(5, 2.0));
        assert_eq!(compare.process(0.2), (1.0, 1.0));
        assert_eq!(compare.pulse_remaining(), 1);
        assert!(!compare.set_parameter(0, 3.0));
        assert!(!compare.set_parameter(2, 0.6));
    }
}
