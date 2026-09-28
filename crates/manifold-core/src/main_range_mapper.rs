//! Main's scalar Range utility, following range_mapper_runtime.lua.

pub struct MainRangeMapper {
    min: f32,
    max: f32,
    mode: u32,
    input: f32,
    output: f32,
}

impl MainRangeMapper {
    pub fn new() -> Self {
        Self {
            min: 0.0,
            max: 1.0,
            mode: 0,
            input: 0.0,
            output: 0.0,
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 if (0.0..=1.0).contains(&value) => self.min = value,
            1 if (0.0..=1.0).contains(&value) => self.max = value,
            2 if value == 0.0 || value == 1.0 => self.mode = value as u32,
            _ => return false,
        }
        true
    }

    pub fn process(&mut self, input: f32) -> f32 {
        self.input = input;
        let (min, max) = if self.min <= self.max {
            (self.min, self.max)
        } else {
            (self.max, self.min)
        };
        self.output = if self.mode == 0 {
            input.clamp(min, max)
        } else {
            min + input.clamp(0.0, 1.0) * (max - min)
        };
        self.output
    }

    pub fn input(&self) -> f32 {
        self.input
    }
    pub fn output(&self) -> f32 {
        self.output
    }
}

#[cfg(test)]
mod tests {
    use super::MainRangeMapper;

    #[test]
    fn clamp_and_remap_match_lua_with_reversed_limits() {
        let mut range = MainRangeMapper::new();
        assert!(range.set_parameter(0, 0.2));
        assert!(range.set_parameter(1, 0.7));
        assert_eq!(range.process(0.9), 0.7);
        assert_eq!(range.process(-0.5), 0.2);
        assert!(range.set_parameter(2, 1.0));
        assert!((range.process(0.5) - 0.45).abs() < 1e-6);
        assert_eq!(range.process(2.0), 0.7);
        assert!(range.set_parameter(0, 0.8));
        assert!(range.set_parameter(1, 0.1));
        assert!((range.process(0.5) - 0.45).abs() < 1e-6);
        assert!(!range.set_parameter(0, -1.0));
        assert!(!range.set_parameter(2, 2.0));
    }
}
