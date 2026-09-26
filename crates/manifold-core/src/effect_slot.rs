//! Standalone FX slot slice: legacy IDs 3 (Compressor), 6 (SVF), and 8 (Stereo Delay).
//! Only the selected kernel processes audio; all kernels are prepared before the callback.

use crate::Filter;
use crate::compressor::{self, Compressor};
use crate::stereo_delay::{self, StereoDelay};

pub const COMPRESSOR_TYPE: u32 = 3;
pub const SVF_TYPE: u32 = 6;
pub const DELAY_TYPE: u32 = 8;

pub fn supported_type(value: f32) -> Option<u32> {
    if !value.is_finite() || value.fract() != 0.0 {
        return None;
    }
    match value as u32 {
        COMPRESSOR_TYPE | SVF_TYPE | DELAY_TYPE => Some(value as u32),
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
    compressor_params: [f32; 5],
    sample_rate: f32,
    filter: Filter,
    delay: StereoDelay,
    compressor: Compressor,
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
            compressor_params: [0.4, 0.3, 0.1, 0.3, 0.5],
            sample_rate,
            filter: Filter::new(sample_rate),
            delay: StereoDelay::new(sample_rate, delay_settings),
            compressor: Compressor::new(sample_rate, compressor::defaults()),
        };
        let selected_params = match selected {
            COMPRESSOR_TYPE => &mut slot.compressor_params,
            SVF_TYPE => &mut slot.svf_params,
            DELAY_TYPE => &mut slot.delay_params,
            _ => unreachable!("slot type validated at graph compilation"),
        };
        for (destination, value) in selected_params.iter_mut().zip(params) {
            *destination = value.clamp(0.0, 1.0);
        }
        slot.apply_svf();
        slot.filter.settle();
        slot.apply_delay();
        slot.delay.settle();
        slot.rebuild_compressor();
        slot
    }

    fn rebuild_compressor(&mut self) {
        let [threshold, ratio, attack, release, knee] = self.compressor_params;
        let mut settings = compressor::defaults();
        settings[0] = -40.0 + 38.0 * threshold;
        settings[1] = 1.5 + 18.5 * ratio;
        settings[2] = 1.0 + 39.0 * attack;
        settings[3] = 20.0 + 230.0 * release;
        settings[4] = 12.0 * knee;
        self.compressor = Compressor::new(self.sample_rate, settings);
    }

    fn apply_compressor(&mut self) {
        let [threshold, ratio, attack, release, knee] = self.compressor_params;
        for (id, value) in [
            -40.0 + 38.0 * threshold,
            1.5 + 18.5 * ratio,
            1.0 + 39.0 * attack,
            20.0 + 230.0 * release,
            12.0 * knee,
        ]
        .into_iter()
        .enumerate()
        {
            self.compressor.set_parameter(id as u32, value);
        }
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
                    match selected {
                        COMPRESSOR_TYPE => self.rebuild_compressor(),
                        SVF_TYPE => {
                            self.apply_svf();
                            self.filter.settle();
                        }
                        DELAY_TYPE => {
                            self.apply_delay();
                            self.delay.settle();
                        }
                        _ => unreachable!(),
                    }
                }
            }
            1 => self.target_mix = value.clamp(0.0, 1.0),
            2..=6 => {
                let params = match self.selected {
                    COMPRESSOR_TYPE => &mut self.compressor_params,
                    SVF_TYPE => &mut self.svf_params,
                    DELAY_TYPE => &mut self.delay_params,
                    _ => unreachable!(),
                };
                params[id as usize - 2] = value.clamp(0.0, 1.0);
                match self.selected {
                    COMPRESSOR_TYPE => self.apply_compressor(),
                    SVF_TYPE => self.apply_svf(),
                    DELAY_TYPE => self.apply_delay(),
                    _ => unreachable!(),
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
            COMPRESSOR_TYPE => self
                .compressor
                .process_planar([in_l, in_r], [&mut *out_l, &mut *out_r]),
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

    #[test]
    fn compressor_slot_maps_normalized_controls_to_legacy_node() {
        let sample_rate = 48_000.0;
        let params = [0.2, 0.6, 0.1, 0.3, 0.5];
        let mut slot = EffectSlot::new(sample_rate, COMPRESSOR_TYPE, 1.0, params);
        let mut settings = compressor::defaults();
        settings[0] = -40.0 + 38.0 * params[0];
        settings[1] = 1.5 + 18.5 * params[1];
        settings[2] = 1.0 + 39.0 * params[2];
        settings[3] = 20.0 + 230.0 * params[3];
        settings[4] = 12.0 * params[4];
        let mut node = Compressor::new(sample_rate, settings);
        let left = [0.4; 256];
        let right = [0.2; 256];
        let mut slot_left = [0.0; 256];
        let mut slot_right = [0.0; 256];
        let mut node_left = [0.0; 256];
        let mut node_right = [0.0; 256];
        slot.process_planar([&left, &right], [&mut slot_left, &mut slot_right]);
        node.process_planar([&left, &right], [&mut node_left, &mut node_right]);
        assert_eq!(slot_left, node_left);
        assert_eq!(slot_right, node_right);
        assert!(slot_left[255] < left[255]);
    }
}
