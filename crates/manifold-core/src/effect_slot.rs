//! First Standalone FX slot slice: the legacy public type IDs 6 (SVF) and 8 (Stereo Delay).
//! Only the selected kernel processes audio; both are prepared before the callback.

use crate::Filter;
use crate::stereo_delay::{self, StereoDelay};

pub const SVF_TYPE: u32 = 6;
pub const DELAY_TYPE: u32 = 8;

pub fn supported_type(value: f32) -> Option<u32> {
    if !value.is_finite() || value.fract() != 0.0 {
        return None;
    }
    match value as u32 {
        SVF_TYPE | DELAY_TYPE => Some(value as u32),
        _ => None,
    }
}

pub struct EffectSlot {
    selected: u32,
    mix: f32,
    target_mix: f32,
    mix_smoothing: f32,
    svf_params: [f32; 5],
    delay_params: [f32; 5],
    filter: Filter,
    delay: StereoDelay,
}

impl EffectSlot {
    pub fn new(sample_rate: f32, selected: u32, mix: f32, params: [f32; 5]) -> Self {
        let mut delay_settings = stereo_delay::defaults();
        delay_settings[3] = 0.12;
        delay_settings[7] = 1.0;
        delay_settings[8] = 1.0;
        delay_settings[5] = 4200.0;
        let mut slot = Self {
            selected,
            mix: mix.clamp(0.0, 1.0),
            target_mix: mix.clamp(0.0, 1.0),
            mix_smoothing: ((1.0 - (-1.0 / (0.01 * sample_rate as f64)).exp()) as f32)
                .clamp(0.0001, 1.0),
            svf_params: [0.5, 0.4, 0.1, 0.5, 0.5],
            delay_params: [0.3, 0.3, 0.5, 0.5, 0.5],
            filter: Filter::new(sample_rate),
            delay: StereoDelay::new(sample_rate, delay_settings),
        };
        let selected_params = if selected == SVF_TYPE {
            &mut slot.svf_params
        } else {
            &mut slot.delay_params
        };
        for (destination, value) in selected_params.iter_mut().zip(params) {
            *destination = value.clamp(0.0, 1.0);
        }
        slot.apply_svf();
        slot.filter.settle();
        slot.apply_delay();
        slot.delay.settle();
        slot
    }

    fn apply_svf(&mut self) {
        let [cutoff, resonance, drive, _, _] = self.svf_params;
        self.filter.set_parameter(0, 0.0);
        self.filter
            .set_parameter(1, 60.0 * (10_000.0_f32 / 60.0).powf(cutoff));
        self.filter.set_parameter(2, 0.08 + 0.92 * resonance);
        self.filter.set_parameter(3, 6.0 * drive);
    }

    fn apply_delay(&mut self) {
        let [time, feedback, _, _, _] = self.delay_params;
        let milliseconds = 40.0 + 740.0 * time;
        self.delay.set_parameter(0, milliseconds);
        self.delay.set_parameter(1, milliseconds * 1.5);
        self.delay.set_parameter(2, 0.92 * feedback);
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 => {
                let Some(selected) = supported_type(value) else {
                    return false;
                };
                if self.selected != selected {
                    self.selected = selected;
                    if selected == SVF_TYPE {
                        self.apply_svf();
                        self.filter.settle();
                    } else {
                        self.apply_delay();
                        self.delay.settle();
                    }
                }
            }
            1 => self.target_mix = value.clamp(0.0, 1.0),
            2..=6 => {
                let params = if self.selected == SVF_TYPE {
                    &mut self.svf_params
                } else {
                    &mut self.delay_params
                };
                params[id as usize - 2] = value.clamp(0.0, 1.0);
                if self.selected == SVF_TYPE {
                    self.apply_svf();
                } else {
                    self.apply_delay();
                }
            }
            _ => return false,
        }
        true
    }

    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let [in_l, in_r] = input;
        let [out_l, out_r] = output;
        match self.selected {
            SVF_TYPE => self
                .filter
                .process_planar([in_l, in_r], [&mut *out_l, &mut *out_r]),
            DELAY_TYPE => self
                .delay
                .process_planar([in_l, in_r], [&mut *out_l, &mut *out_r]),
            _ => unreachable!("slot type validated at graph compilation"),
        }
        let wet_gain = if self.selected == DELAY_TYPE {
            1.1
        } else {
            1.0
        };
        for frame in 0..in_l.len() {
            self.mix += (self.target_mix - self.mix) * self.mix_smoothing;
            let dry = 1.0 - self.mix;
            let wet = self.mix * wet_gain;
            out_l[frame] = in_l[frame] * dry + out_l[frame] * wet;
            out_r[frame] = in_r[frame] * dry + out_r[frame] * wet;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selection_rejects_unsupported_types_and_keeps_dry_path() {
        let mut slot = EffectSlot::new(48_000.0, SVF_TYPE, 0.0, [0.5, 0.4, 0.1, 0.5, 0.5]);
        assert!(!slot.set_parameter(0, 2.0));
        assert!(slot.set_parameter(0, DELAY_TYPE as f32));
        let left = [0.5, -0.2, 0.1];
        let right = [-0.4, 0.3, 0.0];
        let mut out_left = [0.0; 3];
        let mut out_right = [0.0; 3];
        slot.process_planar([&left, &right], [&mut out_left, &mut out_right]);
        assert_eq!(out_left, left);
        assert_eq!(out_right, right);
    }

    #[test]
    fn returning_to_delay_discards_its_old_tail() {
        let mut slot = EffectSlot::new(1000.0, DELAY_TYPE, 1.0, [0.0, 0.6, 0.5, 0.5, 0.5]);
        let mut pulse = [0.0; 20];
        pulse[0] = 1.0;
        let silence = [0.0; 50];
        let mut out_left = [0.0; 50];
        let mut out_right = [0.0; 50];
        slot.process_planar(
            [&pulse, &pulse],
            [&mut out_left[..20], &mut out_right[..20]],
        );
        assert!(slot.set_parameter(0, SVF_TYPE as f32));
        assert!(slot.set_parameter(0, DELAY_TYPE as f32));
        slot.process_planar([&silence, &silence], [&mut out_left, &mut out_right]);
        assert!(out_left.iter().all(|sample| sample.abs() < 1e-8));
        assert_eq!(out_left, out_right);
    }
}
