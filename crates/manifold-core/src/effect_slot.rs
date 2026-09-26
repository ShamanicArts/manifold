//! Standalone FX slot slice: legacy IDs 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 15, 16, and 17.
//! Only the selected kernel processes audio; all kernels are prepared before the callback.

use crate::Filter;
use crate::bitcrusher::{self, BitCrusher};
use crate::chorus::{self, Chorus};
use crate::compressor::{self, Compressor};
use crate::legacy_filter::{self, LegacyFilter};
use crate::limiter::{self, Limiter};
use crate::multitap_delay::{self, MultitapDelay};
use crate::phaser::Phaser;
use crate::reverb::{self, Reverb};
use crate::ring_modulator::{self, RingModulator};
use crate::stereo_delay::{self, StereoDelay};
use crate::stereo_widener::{self, StereoWidener};
use crate::transient_shaper::{self, TransientShaper};
use crate::waveshaper::{self, WaveShaper};

pub const CHORUS_TYPE: u32 = 0;
pub const PHASER_TYPE: u32 = 1;
pub const WAVESHAPER_TYPE: u32 = 2;
pub const COMPRESSOR_TYPE: u32 = 3;
pub const WIDENER_TYPE: u32 = 4;
pub const LEGACY_FILTER_TYPE: u32 = 5;
pub const SVF_TYPE: u32 = 6;
pub const REVERB_TYPE: u32 = 7;
pub const DELAY_TYPE: u32 = 8;
pub const MULTITAP_TYPE: u32 = 9;
pub const RING_TYPE: u32 = 12;
pub const LIMITER_TYPE: u32 = 15;
pub const TRANSIENT_TYPE: u32 = 16;
pub const BITCRUSHER_TYPE: u32 = 17;

pub fn supported_type(value: f32) -> Option<u32> {
    if !value.is_finite() || value.fract() != 0.0 {
        return None;
    }
    match value as u32 {
        CHORUS_TYPE | PHASER_TYPE | WAVESHAPER_TYPE | COMPRESSOR_TYPE | WIDENER_TYPE
        | LEGACY_FILTER_TYPE | SVF_TYPE | REVERB_TYPE | DELAY_TYPE | MULTITAP_TYPE | RING_TYPE
        | LIMITER_TYPE | TRANSIENT_TYPE | BITCRUSHER_TYPE => Some(value as u32),
        _ => None,
    }
}

pub struct EffectSlot {
    selected: u32,
    mix: f32,
    target_mix: f32,
    mix_smoothing: f32,
    chorus_params: [f32; 5],
    phaser_params: [f32; 5],
    waveshaper_params: [f32; 5],
    widener_params: [f32; 5],
    legacy_filter_params: [f32; 5],
    reverb_params: [f32; 5],
    svf_params: [f32; 5],
    delay_params: [f32; 5],
    multitap_params: [f32; 5],
    ring_params: [f32; 5],
    transient_params: [f32; 5],
    bitcrusher_params: [f32; 5],
    compressor_params: [f32; 5],
    limiter_params: [f32; 5],
    limiter_pre_gain: f32,
    limiter_pre_target: f32,
    sample_rate: f32,
    chorus: Chorus,
    phaser: Phaser,
    waveshaper: WaveShaper,
    widener: StereoWidener,
    legacy_filter: LegacyFilter,
    reverb: Reverb,
    filter: Filter,
    delay: StereoDelay,
    multitap: MultitapDelay,
    ring: RingModulator,
    transient: TransientShaper,
    bitcrusher: BitCrusher,
    compressor: Compressor,
    limiter: Limiter,
}

impl EffectSlot {
    pub fn new(
        sample_rate: f32,
        max_frames: usize,
        selected: u32,
        mix: f32,
        params: [f32; 5],
    ) -> Self {
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
            chorus_params: [0.5, 0.5, 0.2, 0.6, 0.4],
            phaser_params: [0.5, 0.5, 0.4, 0.5, 0.4],
            waveshaper_params: [0.3, 0.0, 0.7, 0.5, 0.5],
            widener_params: [0.6, 0.4, 0.5, 0.5, 0.5],
            legacy_filter_params: [0.5, 0.2, 0.5, 0.5, 0.5],
            reverb_params: [0.5, 0.4, 0.5, 0.5, 0.5],
            svf_params: [0.5, 0.4, 0.1, 0.5, 0.5],
            delay_params: [0.3, 0.3, 0.5, 0.5, 0.5],
            multitap_params: [0.3, 0.3, 0.5, 0.5, 0.5],
            ring_params: [0.3, 1.0, 0.2, 0.5, 0.5],
            transient_params: [0.5, 0.5, 0.5, 0.5, 0.5],
            bitcrusher_params: [0.3, 0.12, 0.55, 0.5, 0.5],
            compressor_params: [0.4, 0.3, 0.1, 0.3, 0.5],
            limiter_params: [0.5, 0.3, 0.4, 0.4, 0.5],
            limiter_pre_gain: 1.02,
            limiter_pre_target: 1.02,
            sample_rate,
            chorus: Chorus::new(sample_rate, max_frames, chorus::defaults()),
            phaser: Phaser::new(sample_rate, crate::phaser::defaults()),
            waveshaper: WaveShaper::new(sample_rate, waveshaper::DEFAULTS),
            widener: StereoWidener::new(sample_rate, stereo_widener::DEFAULTS),
            legacy_filter: LegacyFilter::new(sample_rate, legacy_filter::DEFAULTS),
            reverb: Reverb::new(sample_rate, reverb::DEFAULTS),
            filter: Filter::new(sample_rate),
            delay: StereoDelay::new(sample_rate, delay_settings),
            multitap: MultitapDelay::new(sample_rate, max_frames, multitap_delay::DEFAULTS),
            ring: RingModulator::new(sample_rate, ring_modulator::DEFAULTS),
            transient: TransientShaper::new(sample_rate, transient_shaper::DEFAULTS),
            bitcrusher: BitCrusher::new(sample_rate, bitcrusher::DEFAULTS),
            compressor: Compressor::new(sample_rate, compressor::defaults()),
            limiter: Limiter::new(sample_rate, limiter::defaults()),
        };
        let selected_params = match selected {
            CHORUS_TYPE => &mut slot.chorus_params,
            PHASER_TYPE => &mut slot.phaser_params,
            WAVESHAPER_TYPE => &mut slot.waveshaper_params,
            WIDENER_TYPE => &mut slot.widener_params,
            LEGACY_FILTER_TYPE => &mut slot.legacy_filter_params,
            REVERB_TYPE => &mut slot.reverb_params,
            COMPRESSOR_TYPE => &mut slot.compressor_params,
            SVF_TYPE => &mut slot.svf_params,
            DELAY_TYPE => &mut slot.delay_params,
            MULTITAP_TYPE => &mut slot.multitap_params,
            RING_TYPE => &mut slot.ring_params,
            TRANSIENT_TYPE => &mut slot.transient_params,
            BITCRUSHER_TYPE => &mut slot.bitcrusher_params,
            LIMITER_TYPE => &mut slot.limiter_params,
            _ => unreachable!("slot type validated at graph compilation"),
        };
        for (destination, value) in selected_params.iter_mut().zip(params) {
            *destination = value.clamp(0.0, 1.0);
        }
        slot.apply_svf();
        slot.rebuild_chorus();
        slot.rebuild_phaser();
        slot.rebuild_waveshaper();
        slot.rebuild_widener();
        slot.rebuild_legacy_filter();
        slot.rebuild_reverb();
        slot.rebuild_multitap();
        slot.rebuild_ring();
        slot.rebuild_transient();
        slot.rebuild_bitcrusher();
        slot.filter.settle();
        slot.apply_delay();
        slot.delay.settle();
        slot.rebuild_compressor();
        slot.rebuild_limiter();
        slot
    }

    fn chorus_settings(&self) -> [f32; chorus::PARAM_COUNT] {
        let [rate, depth, feedback, spread, voices] = self.chorus_params;
        [
            0.08 + 2.32 * rate,
            0.05 + 0.95 * depth,
            (1.0 + 5.0 * voices + 0.5).floor().clamp(1.0, 4.0),
            spread,
            0.35 * feedback,
            0.0,
            1.0,
        ]
    }

    fn rebuild_chorus(&mut self) {
        self.chorus.reconfigure(self.chorus_settings());
    }

    fn apply_chorus(&mut self) {
        for (id, value) in self.chorus_settings().into_iter().enumerate() {
            self.chorus.set_parameter(id as u32, value);
        }
    }

    fn phaser_settings(&self) -> [f32; 5] {
        let [rate, depth, feedback, spread, stages] = self.phaser_params;
        [
            0.05 + 2.75 * rate,
            0.05 + 0.95 * depth,
            (2.0 + 10.0 * stages + 0.5).floor(),
            0.8 * feedback,
            spread,
        ]
    }

    fn rebuild_phaser(&mut self) {
        self.phaser = Phaser::new(self.sample_rate, self.phaser_settings());
    }

    fn waveshaper_settings(&self) -> [f32; waveshaper::PARAM_COUNT] {
        let [drive, curve, output, bias, _] = self.waveshaper_params;
        [
            (6.0 * curve + 0.5).floor(),
            0.75 + 17.25 * drive,
            0.25 + 0.75 * output,
            0.0,
            0.0,
            -0.5 + bias,
            1.0,
            2.0,
        ]
    }

    fn rebuild_waveshaper(&mut self) {
        self.waveshaper = WaveShaper::new(self.sample_rate, self.waveshaper_settings());
    }

    fn apply_waveshaper(&mut self) {
        for (id, value) in self.waveshaper_settings().into_iter().enumerate() {
            self.waveshaper.set_parameter(id as u32, value);
        }
    }

    fn widener_settings(&self) -> [f32; stereo_widener::PARAM_COUNT] {
        let [width, mono_low_freq, _, _, _] = self.widener_params;
        [2.0 * width, 40.0 + 280.0 * mono_low_freq, 1.0]
    }

    fn rebuild_widener(&mut self) {
        self.widener = StereoWidener::new(self.sample_rate, self.widener_settings());
    }

    fn apply_widener(&mut self) {
        for (id, value) in self.widener_settings().into_iter().enumerate() {
            self.widener.set_parameter(id as u32, value);
        }
    }

    fn legacy_filter_settings(&self) -> [f32; legacy_filter::PARAM_COUNT] {
        let [cutoff, resonance, _, _, _] = self.legacy_filter_params;
        [80.0 * 150.0_f32.powf(cutoff), resonance, 1.0]
    }

    fn rebuild_legacy_filter(&mut self) {
        self.legacy_filter = LegacyFilter::new(self.sample_rate, self.legacy_filter_settings());
    }

    fn apply_legacy_filter(&mut self) {
        for (id, value) in self.legacy_filter_settings().into_iter().enumerate() {
            self.legacy_filter.set_parameter(id as u32, value);
        }
    }

    fn reverb_settings(&self) -> [f32; reverb::PARAM_COUNT] {
        let [room, damp, _, _, _] = self.reverb_params;
        [0.15 + 0.8 * room, damp, 1.0, 0.0, 1.0]
    }

    fn rebuild_reverb(&mut self) {
        self.reverb.reset_to(self.reverb_settings());
    }

    fn apply_reverb(&mut self) {
        for (id, value) in self.reverb_settings().into_iter().enumerate() {
            self.reverb.set_parameter(id as u32, value);
        }
    }

    fn multitap_settings(&self) -> [f32; multitap_delay::PARAM_COUNT] {
        let [count, feedback, _, _, _] = self.multitap_params;
        let mut settings = multitap_delay::DEFAULTS;
        settings[0] = (2.0 + 6.0 * count + 0.5).floor();
        settings[1] = 0.95 * feedback;
        settings[2] = 1.0;
        for (tap, (time, gain, pan)) in [
            (180.0, 0.5, -0.8),
            (320.0, 0.35, -0.25),
            (470.0, 0.28, 0.25),
            (620.0, 0.2, 0.8),
        ]
        .into_iter()
        .enumerate()
        {
            let offset = 3 + tap * 3;
            settings[offset] = time;
            settings[offset + 1] = gain;
            settings[offset + 2] = pan;
        }
        settings
    }

    fn rebuild_multitap(&mut self) {
        self.multitap.reset_to(self.multitap_settings());
    }

    fn apply_multitap(&mut self) {
        let settings = self.multitap_settings();
        self.multitap.set_parameter(0, settings[0]);
        self.multitap.set_parameter(1, settings[1]);
    }

    fn ring_settings(&self) -> [f32; ring_modulator::PARAM_COUNT] {
        let [frequency, depth, spread, _, _] = self.ring_params;
        [
            20.0 * 100.0_f32.powf(frequency),
            depth,
            1.0,
            180.0 * spread,
            1.0,
        ]
    }

    fn rebuild_ring(&mut self) {
        self.ring.reset_to(self.ring_settings());
    }

    fn apply_ring(&mut self) {
        for (id, value) in self.ring_settings().into_iter().enumerate() {
            self.ring.set_parameter(id as u32, value);
        }
    }

    fn transient_settings(&self) -> [f32; transient_shaper::PARAM_COUNT] {
        let [attack, sustain, sensitivity, _, _] = self.transient_params;
        [
            -1.0 + 2.0 * attack,
            -1.0 + 2.0 * sustain,
            0.2 + 3.8 * sensitivity,
            1.0,
        ]
    }

    fn rebuild_transient(&mut self) {
        self.transient.reset_to(self.transient_settings());
    }

    fn apply_transient(&mut self) {
        for (id, value) in self.transient_settings().into_iter().enumerate() {
            self.transient.set_parameter(id as u32, value);
        }
    }

    fn bitcrusher_settings(&self) -> [f32; bitcrusher::PARAM_COUNT] {
        let [bits, reduction, output, _, _] = self.bitcrusher_params;
        [
            (2.0 + 14.0 * bits + 0.5).floor(),
            (1.0 + 63.0 * reduction + 0.5).floor(),
            1.0,
            0.25 + 1.75 * output,
            0.0,
        ]
    }

    fn rebuild_bitcrusher(&mut self) {
        self.bitcrusher.reset_to(self.bitcrusher_settings());
    }

    fn apply_bitcrusher(&mut self) {
        for (id, value) in self.bitcrusher_settings().into_iter().enumerate() {
            self.bitcrusher.set_parameter(id as u32, value);
        }
    }

    fn apply_phaser(&mut self) {
        for (id, value) in self.phaser_settings().into_iter().enumerate() {
            self.phaser.set_parameter(id as u32, value);
        }
    }

    fn rebuild_limiter(&mut self) {
        let [threshold, pre_gain, release, soft_clip, _] = self.limiter_params;
        let mut settings = limiter::defaults();
        settings[0] = -20.0 + 19.0 * threshold;
        settings[1] = 10.0 + 190.0 * release;
        settings[3] = soft_clip;
        self.limiter = Limiter::new(self.sample_rate, settings);
        self.limiter_pre_gain = 0.6 + 1.4 * pre_gain;
        self.limiter_pre_target = self.limiter_pre_gain;
    }

    fn apply_limiter(&mut self) {
        let [threshold, pre_gain, release, soft_clip, _] = self.limiter_params;
        self.limiter.set_parameter(0, -20.0 + 19.0 * threshold);
        self.limiter.set_parameter(1, 10.0 + 190.0 * release);
        self.limiter.set_parameter(3, soft_clip);
        self.limiter_pre_target = 0.6 + 1.4 * pre_gain;
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
                        CHORUS_TYPE => self.rebuild_chorus(),
                        PHASER_TYPE => self.rebuild_phaser(),
                        WAVESHAPER_TYPE => self.rebuild_waveshaper(),
                        WIDENER_TYPE => self.rebuild_widener(),
                        LEGACY_FILTER_TYPE => self.rebuild_legacy_filter(),
                        REVERB_TYPE => self.rebuild_reverb(),
                        MULTITAP_TYPE => self.rebuild_multitap(),
                        RING_TYPE => self.rebuild_ring(),
                        TRANSIENT_TYPE => self.rebuild_transient(),
                        BITCRUSHER_TYPE => self.rebuild_bitcrusher(),
                        COMPRESSOR_TYPE => self.rebuild_compressor(),
                        SVF_TYPE => {
                            self.apply_svf();
                            self.filter.settle();
                        }
                        DELAY_TYPE => {
                            self.apply_delay();
                            self.delay.settle();
                        }
                        LIMITER_TYPE => self.rebuild_limiter(),
                        _ => unreachable!(),
                    }
                }
            }
            1 => self.target_mix = value.clamp(0.0, 1.0),
            2..=6 => {
                let params = match self.selected {
                    CHORUS_TYPE => &mut self.chorus_params,
                    PHASER_TYPE => &mut self.phaser_params,
                    WAVESHAPER_TYPE => &mut self.waveshaper_params,
                    WIDENER_TYPE => &mut self.widener_params,
                    LEGACY_FILTER_TYPE => &mut self.legacy_filter_params,
                    REVERB_TYPE => &mut self.reverb_params,
                    MULTITAP_TYPE => &mut self.multitap_params,
                    RING_TYPE => &mut self.ring_params,
                    TRANSIENT_TYPE => &mut self.transient_params,
                    BITCRUSHER_TYPE => &mut self.bitcrusher_params,
                    COMPRESSOR_TYPE => &mut self.compressor_params,
                    SVF_TYPE => &mut self.svf_params,
                    DELAY_TYPE => &mut self.delay_params,
                    LIMITER_TYPE => &mut self.limiter_params,
                    _ => unreachable!(),
                };
                params[id as usize - 2] = value.clamp(0.0, 1.0);
                match self.selected {
                    CHORUS_TYPE => self.apply_chorus(),
                    PHASER_TYPE => self.apply_phaser(),
                    WAVESHAPER_TYPE => self.apply_waveshaper(),
                    WIDENER_TYPE => self.apply_widener(),
                    LEGACY_FILTER_TYPE => self.apply_legacy_filter(),
                    REVERB_TYPE => self.apply_reverb(),
                    MULTITAP_TYPE => self.apply_multitap(),
                    RING_TYPE => self.apply_ring(),
                    TRANSIENT_TYPE => self.apply_transient(),
                    BITCRUSHER_TYPE => self.apply_bitcrusher(),
                    COMPRESSOR_TYPE => self.apply_compressor(),
                    SVF_TYPE => self.apply_svf(),
                    DELAY_TYPE => self.apply_delay(),
                    LIMITER_TYPE => self.apply_limiter(),
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
            CHORUS_TYPE => self
                .chorus
                .process_planar([in_l, in_r], [&mut *out_l, &mut *out_r]),
            PHASER_TYPE => self
                .phaser
                .process_planar([in_l, in_r], [&mut *out_l, &mut *out_r]),
            WAVESHAPER_TYPE => self
                .waveshaper
                .process_planar([in_l, in_r], [&mut *out_l, &mut *out_r]),
            WIDENER_TYPE => self
                .widener
                .process_planar([in_l, in_r], [&mut *out_l, &mut *out_r]),
            LEGACY_FILTER_TYPE => self
                .legacy_filter
                .process_planar([in_l, in_r], [&mut *out_l, &mut *out_r]),
            REVERB_TYPE => self
                .reverb
                .process_planar([in_l, in_r], [&mut *out_l, &mut *out_r]),
            MULTITAP_TYPE => self
                .multitap
                .process_planar([in_l, in_r], [&mut *out_l, &mut *out_r]),
            RING_TYPE => self
                .ring
                .process_planar([in_l, in_r], None, [&mut *out_l, &mut *out_r]),
            TRANSIENT_TYPE => self
                .transient
                .process_planar([in_l, in_r], [&mut *out_l, &mut *out_r]),
            BITCRUSHER_TYPE => {
                self.bitcrusher
                    .process_planar([in_l, in_r], None, [&mut *out_l, &mut *out_r])
            }
            COMPRESSOR_TYPE => self
                .compressor
                .process_planar([in_l, in_r], [&mut *out_l, &mut *out_r]),
            SVF_TYPE => self
                .filter
                .process_planar([in_l, in_r], [&mut *out_l, &mut *out_r]),
            DELAY_TYPE => self
                .delay
                .process_planar([in_l, in_r], [&mut *out_l, &mut *out_r]),
            LIMITER_TYPE => {
                for frame in 0..in_l.len() {
                    self.limiter_pre_gain +=
                        (self.limiter_pre_target - self.limiter_pre_gain) * self.mix_smoothing;
                    let value = self.limiter.process_sample([
                        in_l[frame] * self.limiter_pre_gain,
                        in_r[frame] * self.limiter_pre_gain,
                    ]);
                    out_l[frame] = value[0];
                    out_r[frame] = value[1];
                }
            }
            _ => unreachable!("slot type validated at graph compilation"),
        }
        let wet_gain = match self.selected {
            CHORUS_TYPE | MULTITAP_TYPE => 1.4,
            DELAY_TYPE => 1.1,
            WIDENER_TYPE => 1.1,
            _ => 1.0,
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
    fn chorus_slot_maps_normalized_controls_and_wet_gain() {
        let rate = 48_000.0;
        let mut slot = EffectSlot::new(rate, 128, CHORUS_TYPE, 1.0, [0.5, 0.5, 0.2, 0.6, 0.4]);
        let mut chorus = Chorus::new(rate, 128, [1.24, 0.525, 3.0, 0.6, 0.07, 0.0, 1.0]);
        let mut input_l = [0.0; 1024];
        let input_r = [0.0; 1024];
        input_l[0] = 0.5;
        let mut slot_l = [0.0; 1024];
        let mut slot_r = [0.0; 1024];
        let mut chorus_l = [0.0; 1024];
        let mut chorus_r = [0.0; 1024];
        slot.process_planar([&input_l, &input_r], [&mut slot_l, &mut slot_r]);
        chorus.process_planar([&input_l, &input_r], [&mut chorus_l, &mut chorus_r]);
        for (actual, wet) in slot_l.iter().zip(chorus_l.iter()) {
            assert!((actual - wet * 1.4).abs() < 1e-6);
        }
        assert!(slot.set_parameter(0, SVF_TYPE as f32));
        assert!(slot.set_parameter(0, CHORUS_TYPE as f32));
    }

    #[test]
    fn phaser_slot_preserves_legacy_spread_units() {
        let rate = 48_000.0;
        let mut slot = EffectSlot::new(rate, 128, PHASER_TYPE, 1.0, [0.5, 0.5, 0.4, 0.5, 0.4]);
        let mut phaser = Phaser::new(rate, [1.425, 0.525, 6.0, 0.32, 0.5]);
        let mut input_l = [0.0; 512];
        let input_r = [0.0; 512];
        input_l[0] = 0.5;
        let mut slot_l = [0.0; 512];
        let mut slot_r = [0.0; 512];
        let mut reference_l = [0.0; 512];
        let mut reference_r = [0.0; 512];
        slot.process_planar([&input_l, &input_r], [&mut slot_l, &mut slot_r]);
        phaser.process_planar([&input_l, &input_r], [&mut reference_l, &mut reference_r]);
        for (actual, reference) in slot_l.iter().zip(reference_l.iter()) {
            assert!((actual - reference).abs() < 1e-6);
        }
        assert!(slot.set_parameter(0, CHORUS_TYPE as f32));
        assert!(slot.set_parameter(0, PHASER_TYPE as f32));
    }

    #[test]
    fn selection_rejects_unsupported_types_and_keeps_dry_path() {
        let mut slot = EffectSlot::new(48_000.0, 128, SVF_TYPE, 0.0, [0.5, 0.4, 0.1, 0.5, 0.5]);
        assert!(!slot.set_parameter(0, 10.0));
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
        let mut slot = EffectSlot::new(1000.0, 128, DELAY_TYPE, 1.0, [0.0, 0.6, 0.5, 0.5, 0.5]);
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
        let mut slot = EffectSlot::new(sample_rate, 128, COMPRESSOR_TYPE, 1.0, params);
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

    #[test]
    fn limiter_slot_applies_smoothed_pre_gain_before_peak_detection() {
        let sample_rate = 48_000.0;
        let params = [0.2, 0.7, 0.4, 0.3, 0.5];
        let mut slot = EffectSlot::new(sample_rate, 128, LIMITER_TYPE, 1.0, params);
        let pre_gain = 0.6 + 1.4 * params[1];
        let mut settings = limiter::defaults();
        settings[0] = -20.0 + 19.0 * params[0];
        settings[1] = 10.0 + 190.0 * params[2];
        settings[3] = params[3];
        let mut node = Limiter::new(sample_rate, settings);
        let left = [0.5; 256];
        let right = [0.2; 256];
        let pre_left = [left[0] * pre_gain; 256];
        let pre_right = [right[0] * pre_gain; 256];
        let mut slot_left = [0.0; 256];
        let mut slot_right = [0.0; 256];
        let mut node_left = [0.0; 256];
        let mut node_right = [0.0; 256];
        slot.process_planar([&left, &right], [&mut slot_left, &mut slot_right]);
        node.process_planar([&pre_left, &pre_right], [&mut node_left, &mut node_right]);
        assert_eq!(slot_left, node_left);
        assert_eq!(slot_right, node_right);
        assert!(slot_left[255] < left[255]);
    }
}
