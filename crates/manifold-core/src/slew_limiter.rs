//! Legacy Max-style asymmetric slide. One independent state per stereo channel.

pub struct SlewLimiter {
    target_up: f32,
    target_down: f32,
    current_up: f32,
    current_down: f32,
    last: [f32; 2],
}

impl SlewLimiter {
    pub fn new(up: f32, down: f32) -> Self {
        let up = up.max(1.0);
        let down = down.max(1.0);
        Self {
            target_up: up,
            target_down: down,
            current_up: up,
            current_down: down,
            last: [0.0; 2],
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 => self.target_up = value.max(1.0),
            1 => self.target_down = value.max(1.0),
            _ => return false,
        }
        true
    }

    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let frames = input[0].len();
        if frames == 0 {
            return;
        }
        let up_step = (self.target_up - self.current_up) / frames as f32;
        let down_step = (self.target_down - self.current_down) / frames as f32;
        for channel in 0..2 {
            let mut last = self.last[channel];
            let mut up = self.current_up;
            let mut down = self.current_down;
            for frame in 0..frames {
                up += up_step;
                down += down_step;
                let source = input[channel][frame];
                let divisor = if source > last {
                    up.max(1.0)
                } else {
                    down.max(1.0)
                };
                last += (source - last) / divisor;
                output[channel][frame] = last;
            }
            self.last[channel] = last;
        }
        self.current_up = self.target_up;
        self.current_down = self.target_down;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rise_and_fall_are_independent_and_direct_below_one() {
        let mut slew = SlewLimiter::new(4.0, 2.0);
        let left = [1.0, 1.0, 0.0, 0.0];
        let right = [-1.0, -1.0, 0.0, 0.0];
        let mut out_left = [0.0; 4];
        let mut out_right = [0.0; 4];
        slew.process_planar([&left, &right], [&mut out_left, &mut out_right]);
        assert_eq!(out_left, [0.25, 0.4375, 0.21875, 0.109375]);
        assert_eq!(out_right, [-0.5, -0.75, -0.5625, -0.421875]);
        assert!(slew.set_parameter(0, 0.0));
        assert!(slew.set_parameter(1, 0.0));
        let mut direct_left = [0.0; 4];
        let mut direct_right = [0.0; 4];
        slew.process_planar([&left, &right], [&mut direct_left, &mut direct_right]);
        assert!(direct_left[0] > out_left[0]);
        assert!(!slew.set_parameter(2, 1.0));
        assert!(!slew.set_parameter(0, f32::NAN));
    }
}
