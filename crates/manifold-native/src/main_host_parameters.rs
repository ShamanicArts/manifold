//! Stable Main host IDs. The reserved ranges are declared in the project JSON.

use manifold_core::main_instrument::MainInstrument;

pub const TRANSPORT_BASE: u32 = 0;
pub const LAYER_BASE: u32 = 16;
pub const LAYER_STRIDE: u32 = 8;
pub const SYNTH_BASE: u32 = 256;
pub const LFO_BASE: u32 = 512;
pub const LFO_STRIDE: u32 = 16;
pub const ATV_BASE: u32 = 640;
pub const SLEW_BASE: u32 = 672;
pub const SAMPLE_HOLD_BASE: u32 = 704;
pub const COMPARE_BASE: u32 = 736;
pub const CV_MIX_BASE: u32 = 768;
pub const RANGE_BASE: u32 = 800;
pub const SCALE_QUANTIZER_BASE: u32 = 832;
pub const TRANSPOSE_BASE: u32 = 864;
pub const NOTE_FILTER_BASE: u32 = 896;
pub const VELOCITY_MAPPER_BASE: u32 = 928;
pub const ARPEGGIATOR_BASE: u32 = 960;
pub const MAIN_HOST_ID_CAPACITY: usize = 1024;

/// Values applied by this runtime's timed host queue. Imported session values
/// remain in the authored session template; this bank records only later host
/// changes, including ones that happen during the block that starts a save.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MainHostValueBank {
    values: [f32; MAIN_HOST_ID_CAPACITY],
    present: [u64; MAIN_HOST_ID_CAPACITY / 64],
    lfo_reinitialized: [bool; 4],
}

impl Default for MainHostValueBank {
    fn default() -> Self {
        Self {
            values: [0.0; MAIN_HOST_ID_CAPACITY],
            present: [0; MAIN_HOST_ID_CAPACITY / 64],
            lfo_reinitialized: [false; 4],
        }
    }
}

impl MainHostValueBank {
    pub fn get(&self, id: u32) -> Option<f32> {
        let index = id as usize;
        let bit = self.present.get(index / 64)?;
        if (bit & (1_u64 << (index % 64))) == 0 {
            None
        } else {
            Some(self.values[index])
        }
    }

    pub(crate) fn record(&mut self, id: u32, value: f32) {
        let index = id as usize;
        debug_assert!(index < MAIN_HOST_ID_CAPACITY);
        self.values[index] = value;
        self.present[index / 64] |= 1_u64 << (index % 64);
    }

    pub(crate) fn reset_lfo_slot(&mut self, slot: usize) {
        debug_assert!(slot < 4);
        for local in 0..LFO_STRIDE {
            let index = (LFO_BASE + slot as u32 * LFO_STRIDE + local) as usize;
            self.present[index / 64] &= !(1_u64 << (index % 64));
        }
        self.lfo_reinitialized[slot] = true;
    }

    pub(crate) fn mark_lfo_reinitialized(&mut self, slot: usize) {
        debug_assert!(slot < 4);
        self.lfo_reinitialized[slot] = true;
    }

    pub fn lfo_reinitialized(&self, slot: usize) -> bool {
        self.lfo_reinitialized.get(slot).copied().unwrap_or(false)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MainParameterError {
    UnknownId,
    InvalidValue,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum MainParameterTarget {
    Transport(u32),
    Layer { layer: usize, local: u32 },
    Synth(u32),
    LfoParameter { slot: usize, local: u32 },
    LfoRoute { slot: usize, local: u32 },
    LfoActive { slot: usize },
    Atv(u32),
    Slew(u32),
    SampleHold(u32),
    Compare(u32),
    CvMix(u32),
    Range(u32),
    ScaleQuantizer(u32),
    Transpose(u32),
    NoteFilter(u32),
    VelocityMapper(u32),
    Arpeggiator(u32),
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MainParameter {
    pub target: MainParameterTarget,
    pub value: f32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MainParameterSpec {
    pub target: MainParameterTarget,
    pub min: f32,
    pub max: f32,
    pub discrete: bool,
    pub divisor: f32,
}

fn in_range(value: f32, min: f32, max: f32, discrete: bool) -> bool {
    value.is_finite() && (min..=max).contains(&value) && (!discrete || value.fract() == 0.0)
}

impl MainParameter {
    pub fn decode(id: u32, value: f32) -> Result<Self, MainParameterError> {
        let spec = Self::spec(id)?;
        if !in_range(value, spec.min, spec.max, spec.discrete)
            || matches!(spec.target, MainParameterTarget::LfoRoute { local: 1, .. })
                && ![0.0, 22.0, 23.0, 129.0, 137.0].contains(&value)
        {
            return Err(MainParameterError::InvalidValue);
        }
        Ok(Self {
            target: spec.target,
            value: value / spec.divisor,
        })
    }

    pub fn spec(id: u32) -> Result<MainParameterSpec, MainParameterError> {
        let (target, min, max, discrete, divisor) = if id < 6 {
            let (min, max, discrete) = match id {
                0 => (0.0, 3.0, true),
                1 => (0.0, 2.0, true),
                2 | 3 => (20.0, 300.0, false),
                4 | 5 => (0.0, 1.0, true),
                _ => unreachable!(),
            };
            (MainParameterTarget::Transport(id), min, max, discrete, 1.0)
        } else if (LAYER_BASE..LAYER_BASE + 4 * LAYER_STRIDE).contains(&id) {
            let index = (id - LAYER_BASE) / LAYER_STRIDE;
            let local = (id - LAYER_BASE) % LAYER_STRIDE;
            let (min, max, discrete) = match local {
                0 => (0.0, 2.0, false),
                1 => (-4.0, 4.0, false),
                2 | 3 => (0.0, 1.0, true),
                4 => (0.0, 1.0, false),
                _ => return Err(MainParameterError::UnknownId),
            };
            (
                MainParameterTarget::Layer {
                    layer: index as usize,
                    local,
                },
                min,
                max,
                discrete,
                1.0,
            )
        } else if (SYNTH_BASE..=SYNTH_BASE + 142).contains(&id) {
            let local = id - SYNTH_BASE;
            let (min, max, discrete) = match local {
                0 => (0.0, 4.0, true),
                1 => (-1.0, 1.0, false),
                2 => (12.0, 96.0, false),
                3 => (0.0, 2.0, true),
                4 => (-24.0, 24.0, false),
                5 => (0.0, 2.0, true),
                6 => (0.0, 5.0, true),
                7 => (0.0, 1.0, false),
                11 | 12 => (0.001, 5.0, false),
                13 => (0.0, 1.0, false),
                14 => (0.001, 10.0, false),
                15 => (0.0, 2.0, false),
                16 => (0.25, 4.0, false),
                19 => (0.0, 1.0, true),
                20 => (0.0, 0.5, false),
                21 => (0.0, 3.0, true),
                22 => (80.0, 16000.0, false),
                23 => (0.1, 2.0, false),
                64..=103 => match (local - 64) % 5 {
                    0 => (0.0, 1.0, true),
                    1 => (0.0, 6.0, true),
                    2 => (20.0, 20000.0, false),
                    3 => (-24.0, 24.0, false),
                    _ => (0.1, 24.0, false),
                },
                104 => (-24.0, 24.0, false),
                105 => (0.0, 1.0, false),
                128 | 136 => (0.0, 20.0, true),
                129 | 137 | 130..=134 | 138..=142 => (0.0, 1.0, false),
                _ => return Err(MainParameterError::UnknownId),
            };
            (MainParameterTarget::Synth(local), min, max, discrete, 1.0)
        } else if (LFO_BASE..LFO_BASE + 4 * LFO_STRIDE).contains(&id) {
            let slot = ((id - LFO_BASE) / LFO_STRIDE) as usize;
            let local = (id - LFO_BASE) % LFO_STRIDE;
            let (target, min, max, discrete) = match local {
                0 => (
                    MainParameterTarget::LfoParameter { slot, local },
                    0.0,
                    5.0,
                    true,
                ),
                1 => (
                    MainParameterTarget::LfoParameter { slot, local },
                    0.01,
                    20.0,
                    false,
                ),
                2 => (
                    MainParameterTarget::LfoParameter { slot, local },
                    0.0,
                    1.0,
                    false,
                ),
                3 => (
                    MainParameterTarget::LfoParameter { slot, local },
                    0.0,
                    360.0,
                    false,
                ),
                4 => (
                    MainParameterTarget::LfoParameter { slot, local },
                    0.0,
                    1.0,
                    true,
                ),
                5 => (
                    MainParameterTarget::LfoRoute { slot, local: 0 },
                    0.0,
                    12.0,
                    true,
                ),
                6 => (
                    MainParameterTarget::LfoRoute { slot, local: 1 },
                    0.0,
                    137.0,
                    true,
                ),
                7 | 8 => (
                    MainParameterTarget::LfoRoute {
                        slot,
                        local: local - 5,
                    },
                    -1.0,
                    1.0,
                    false,
                ),
                9 | 10 => (
                    MainParameterTarget::LfoRoute {
                        slot,
                        local: local - 5,
                    },
                    0.0,
                    1.0,
                    true,
                ),
                11 if slot > 0 => (MainParameterTarget::LfoActive { slot }, 0.0, 1.0, true),
                _ => return Err(MainParameterError::UnknownId),
            };
            (target, min, max, discrete, 1.0)
        } else if (ATV_BASE..ATV_BASE + 4).contains(&id) {
            let local = id - ATV_BASE;
            let (min, max, discrete) = match local {
                0 | 1 => (-1.0, 1.0, false),
                2 | 3 => (0.0, 3.0, true),
                _ => unreachable!(),
            };
            (MainParameterTarget::Atv(local), min, max, discrete, 1.0)
        } else if (SLEW_BASE..SLEW_BASE + 4).contains(&id) {
            let local = id - SLEW_BASE;
            let (min, max) = match local {
                0 | 1 => (0.0, 2_000.0),
                2 => (0.0, 2.0),
                3 => (0.0, 16.0),
                _ => unreachable!(),
            };
            (MainParameterTarget::Slew(local), min, max, true, 1.0)
        } else if (SAMPLE_HOLD_BASE..SAMPLE_HOLD_BASE + 6).contains(&id) {
            let local = id - SAMPLE_HOLD_BASE;
            let (min, max, discrete) = match local {
                0 => (0.0, 2.0, true),
                1 => (0.0, 17.0, true),
                2 => (0.0, 4.0, true),
                3 | 5 => (0.0, 1.0, true),
                4 => (-1.0, 1.0, false),
                _ => unreachable!(),
            };
            (
                MainParameterTarget::SampleHold(local),
                min,
                max,
                discrete,
                1.0,
            )
        } else if (COMPARE_BASE..COMPARE_BASE + 6).contains(&id) {
            let local = id - COMPARE_BASE;
            let (min, max, discrete) = match local {
                0 => (0.0, 2.0, true),
                1 => (-1.0, 1.0, false),
                2 => (0.0, 0.5, false),
                3 => (0.0, 19.0, true),
                4 => (0.0, 1.0, true),
                5 => (0.0, 2.0, true),
                _ => unreachable!(),
            };
            (MainParameterTarget::Compare(local), min, max, discrete, 1.0)
        } else if (CV_MIX_BASE..CV_MIX_BASE + 9).contains(&id) {
            let local = id - CV_MIX_BASE;
            let (min, max, discrete) = match local {
                0..=3 => (0.0, 1.0, false),
                4 => (-1.0, 1.0, false),
                5..=8 => (0.0, 21.0, true),
                _ => unreachable!(),
            };
            (MainParameterTarget::CvMix(local), min, max, discrete, 1.0)
        } else if (RANGE_BASE..RANGE_BASE + 4).contains(&id) {
            let local = id - RANGE_BASE;
            let (min, max, discrete) = match local {
                0 | 1 => (0.0, 1.0, false),
                2 => (0.0, 1.0, true),
                3 => (0.0, 23.0, true),
                _ => unreachable!(),
            };
            (MainParameterTarget::Range(local), min, max, discrete, 1.0)
        } else if (SCALE_QUANTIZER_BASE..SCALE_QUANTIZER_BASE + 4).contains(&id) {
            let local = id - SCALE_QUANTIZER_BASE;
            let (min, max) = match local {
                0 => (0.0, 11.0),
                1 => (1.0, 6.0),
                2 => (1.0, 3.0),
                3 => (0.0, 1.0),
                _ => unreachable!(),
            };
            (
                MainParameterTarget::ScaleQuantizer(local),
                min,
                max,
                true,
                1.0,
            )
        } else if (TRANSPOSE_BASE..TRANSPOSE_BASE + 3).contains(&id) {
            let local = id - TRANSPOSE_BASE;
            let (min, max) = match local {
                0 => (-24.0, 24.0),
                1 | 2 => (0.0, 1.0),
                _ => unreachable!(),
            };
            (MainParameterTarget::Transpose(local), min, max, true, 1.0)
        } else if (NOTE_FILTER_BASE..NOTE_FILTER_BASE + 5).contains(&id) {
            let local = id - NOTE_FILTER_BASE;
            let (min, max) = match local {
                0 | 1 => (0.0, 127.0),
                2 | 4 => (0.0, 1.0),
                3 => (0.0, 2.0),
                _ => unreachable!(),
            };
            (MainParameterTarget::NoteFilter(local), min, max, true, 1.0)
        } else if (VELOCITY_MAPPER_BASE..VELOCITY_MAPPER_BASE + 5).contains(&id) {
            let local = id - VELOCITY_MAPPER_BASE;
            let (min, max, discrete) = match local {
                0 => (0.0, 1.0, false),
                1 => (0.0, 2.0, true),
                2 => (-1.0, 1.0, false),
                3 => (0.0, 4.0, true),
                4 => (0.0, 1.0, true),
                _ => unreachable!(),
            };
            (
                MainParameterTarget::VelocityMapper(local),
                min,
                max,
                discrete,
                1.0,
            )
        } else if (ARPEGGIATOR_BASE..ARPEGGIATOR_BASE + 6).contains(&id) {
            let local = id - ARPEGGIATOR_BASE;
            let (min, max, discrete, divisor) = match local {
                0 => (0.25, 20.0, false, 1.0),
                1 => (0.0, 3.0, true, 1.0),
                2 => (1.0, 4.0, true, 1.0),
                3 => (5.0, 100.0, true, 100.0),
                4 | 5 => (0.0, 1.0, true, 1.0),
                _ => unreachable!(),
            };
            (
                MainParameterTarget::Arpeggiator(local),
                min,
                max,
                discrete,
                divisor,
            )
        } else {
            return Err(MainParameterError::UnknownId);
        };
        Ok(MainParameterSpec {
            target,
            min,
            max,
            discrete,
            divisor,
        })
    }

    pub fn apply(self, instrument: &mut MainInstrument) -> bool {
        match self.target {
            MainParameterTarget::Transport(id) => {
                instrument.looper_mut().set_control(id, self.value)
            }
            MainParameterTarget::Layer { layer, local } => instrument
                .looper_mut()
                .set_layer_control(layer, local, self.value),
            MainParameterTarget::Synth(id) => instrument.set_synth_parameter(id, self.value),
            MainParameterTarget::LfoParameter { slot, local } => {
                instrument.set_lfo_slot_parameter(slot, local, self.value)
            }
            MainParameterTarget::LfoRoute { slot, local } => {
                instrument.set_modulation_slot_route(slot, local, self.value)
            }
            MainParameterTarget::LfoActive { slot } => {
                instrument.set_lfo_slot_active(slot, self.value >= 0.5)
            }
            MainParameterTarget::Atv(id) => instrument.set_atv_parameter(id, self.value),
            MainParameterTarget::Slew(id) => instrument.set_slew_parameter(id, self.value),
            MainParameterTarget::SampleHold(id) => {
                instrument.set_sample_hold_parameter(id, self.value)
            }
            MainParameterTarget::Compare(id) => instrument.set_compare_parameter(id, self.value),
            MainParameterTarget::CvMix(id) => instrument.set_cv_mix_parameter(id, self.value),
            MainParameterTarget::Range(id) => instrument.set_range_parameter(id, self.value),
            MainParameterTarget::ScaleQuantizer(id) => {
                instrument.set_scale_quantizer_parameter(id, self.value)
            }
            MainParameterTarget::Transpose(id) => {
                instrument.set_transpose_parameter(id, self.value)
            }
            MainParameterTarget::NoteFilter(id) => {
                instrument.set_note_filter_parameter(id, self.value)
            }
            MainParameterTarget::VelocityMapper(id) => {
                instrument.set_velocity_mapper_parameter(id, self.value)
            }
            MainParameterTarget::Arpeggiator(id) => {
                instrument.set_arpeggiator_parameter(id, self.value)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn host_id_ranges_match_the_authored_main_project() {
        let project: Value =
            serde_json::from_str(include_str!("../../../projects/main-looper/project.json"))
                .unwrap();
        let host = &project["hostParameters"];
        assert_eq!(host["transportBase"], TRANSPORT_BASE);
        assert_eq!(host["layerBase"], LAYER_BASE);
        assert_eq!(host["layerStride"], LAYER_STRIDE);
        assert_eq!(host["synthBase"], SYNTH_BASE);
        assert_eq!(host["lfoBase"], LFO_BASE);
        assert_eq!(host["lfoStride"], LFO_STRIDE);
        assert_eq!(host["atvBase"], ATV_BASE);
        assert_eq!(host["slewBase"], SLEW_BASE);
        assert_eq!(host["sampleHoldBase"], SAMPLE_HOLD_BASE);
        assert_eq!(host["compareBase"], COMPARE_BASE);
        assert_eq!(host["cvMixBase"], CV_MIX_BASE);
        assert_eq!(host["rangeBase"], RANGE_BASE);
        assert_eq!(host["scaleQuantizerBase"], SCALE_QUANTIZER_BASE);
        assert_eq!(host["transposeBase"], TRANSPOSE_BASE);
        assert_eq!(host["noteFilterBase"], NOTE_FILTER_BASE);
        assert_eq!(host["velocityMapperBase"], VELOCITY_MAPPER_BASE);
        assert_eq!(host["arpeggiatorBase"], ARPEGGIATOR_BASE);
    }

    #[test]
    fn reserved_or_invalid_host_values_never_reach_audio_state() {
        assert_eq!(
            MainParameter::decode(7, 1.0),
            Err(MainParameterError::UnknownId)
        );
        assert_eq!(
            MainParameter::decode(21, 0.0),
            Err(MainParameterError::UnknownId)
        );
        assert_eq!(
            MainParameter::decode(SYNTH_BASE + 8, 0.5),
            Err(MainParameterError::UnknownId)
        );
        assert_eq!(
            MainParameter::decode(LFO_BASE + 11, 1.0),
            Err(MainParameterError::UnknownId)
        );
        assert_eq!(
            MainParameter::decode(ARPEGGIATOR_BASE + 3, 45.5),
            Err(MainParameterError::InvalidValue)
        );
        assert_eq!(
            MainParameter::decode(ARPEGGIATOR_BASE + 3, 60.0)
                .unwrap()
                .value,
            0.6
        );
    }

    #[test]
    fn lfo_host_ids_validate_each_slot_and_route_target() {
        for slot in 0..4 {
            let base = LFO_BASE + slot * LFO_STRIDE;
            assert!(matches!(
                MainParameter::decode(base, 3.0).unwrap().target,
                MainParameterTarget::LfoParameter { slot: found, local: 0 } if found == slot as usize
            ));
            assert!(matches!(
                MainParameter::decode(base + 6, 129.0).unwrap().target,
                MainParameterTarget::LfoRoute { slot: found, local: 1 } if found == slot as usize
            ));
            assert_eq!(
                MainParameter::decode(base + 6, 24.0),
                Err(MainParameterError::InvalidValue)
            );
            assert_eq!(
                MainParameter::decode(base + 12, 1.0),
                Err(MainParameterError::UnknownId)
            );
        }
        assert!(matches!(
            MainParameter::decode(LFO_BASE + LFO_STRIDE + 11, 1.0)
                .unwrap()
                .target,
            MainParameterTarget::LfoActive { slot: 1 }
        ));
        assert_eq!(
            MainParameter::decode(LFO_BASE, 3.5),
            Err(MainParameterError::InvalidValue)
        );
    }

    #[test]
    fn every_described_host_id_uses_the_same_bounds_as_audio_validation() {
        let mut described = 0;
        for id in 0..MAIN_HOST_ID_CAPACITY as u32 {
            let Ok(spec) = MainParameter::spec(id) else {
                continue;
            };
            described += 1;
            assert!(spec.min <= spec.max && spec.divisor > 0.0, "ID {id}");
            assert_eq!(
                MainParameter::decode(id, spec.min).unwrap().target,
                spec.target
            );
            assert_eq!(
                MainParameter::decode(id, spec.max).unwrap().target,
                spec.target
            );
            if spec.discrete && spec.max - spec.min >= 1.0 {
                assert_eq!(
                    MainParameter::decode(id, spec.min + 0.5),
                    Err(MainParameterError::InvalidValue),
                    "ID {id}"
                );
            }
        }
        assert!(described > 200);
    }

    #[test]
    fn accepted_eq_and_fx_ids_apply_to_the_prepared_main_instrument() {
        let mut main = MainInstrument::new(8_000.0, 128);
        for id in SYNTH_BASE + 64..=SYNTH_BASE + 105 {
            let local = id - SYNTH_BASE;
            let value = match local {
                104 => 3.0,
                105 => 0.5,
                _ => match (local - 64) % 5 {
                    0 => 1.0,
                    1 => 3.0,
                    2 => 1_000.0,
                    3 => 3.0,
                    _ => 1.0,
                },
            };
            let parameter = MainParameter::decode(id, value).unwrap();
            assert!(parameter.apply(&mut main), "EQ host ID {id}");
        }
        for base in [SYNTH_BASE + 128, SYNTH_BASE + 136] {
            for effect_type in 0..=20 {
                let parameter = MainParameter::decode(base, effect_type as f32).unwrap();
                assert!(parameter.apply(&mut main), "FX type {effect_type}");
            }
            for local in 1..=6 {
                let parameter = MainParameter::decode(base + local, 0.5).unwrap();
                assert!(parameter.apply(&mut main), "FX host ID {}", base + local);
            }
        }
    }

    #[test]
    fn voice_stage_ids_accept_authored_values_and_reject_fractional_enums() {
        let mut main = MainInstrument::new(8_000.0, 128);
        for (id, value) in [
            (SCALE_QUANTIZER_BASE, 2.0),
            (SCALE_QUANTIZER_BASE + 1, 3.0),
            (SCALE_QUANTIZER_BASE + 2, 2.0),
            (SCALE_QUANTIZER_BASE + 3, 1.0),
            (TRANSPOSE_BASE, -7.0),
            (TRANSPOSE_BASE + 1, 1.0),
            (TRANSPOSE_BASE + 2, 1.0),
            (NOTE_FILTER_BASE, 36.0),
            (NOTE_FILTER_BASE + 1, 84.0),
            (NOTE_FILTER_BASE + 2, 1.0),
            (NOTE_FILTER_BASE + 3, 2.0),
            (NOTE_FILTER_BASE + 4, 1.0),
            (VELOCITY_MAPPER_BASE, 0.8),
            (VELOCITY_MAPPER_BASE + 1, 2.0),
            (VELOCITY_MAPPER_BASE + 2, -0.2),
            (VELOCITY_MAPPER_BASE + 3, 4.0),
            (VELOCITY_MAPPER_BASE + 4, 1.0),
        ] {
            let parameter = MainParameter::decode(id, value).unwrap();
            assert!(parameter.apply(&mut main), "voice stage host ID {id}");
        }
        for (id, value) in [
            (SCALE_QUANTIZER_BASE, 1.5),
            (TRANSPOSE_BASE, 7.5),
            (NOTE_FILTER_BASE + 3, 1.5),
            (VELOCITY_MAPPER_BASE + 1, 1.5),
            (VELOCITY_MAPPER_BASE + 2, 1.1),
        ] {
            assert_eq!(
                MainParameter::decode(id, value),
                Err(MainParameterError::InvalidValue),
                "invalid voice stage host ID {id}"
            );
        }
    }

    #[test]
    fn utility_ids_accept_authored_ranges_and_reject_invalid_connections() {
        let mut main = MainInstrument::new(8_000.0, 128);
        for (id, value) in [
            (ATV_BASE, -1.0),
            (ATV_BASE + 1, 0.2),
            (ATV_BASE + 2, 0.0),
            (ATV_BASE + 3, 1.0),
            (SLEW_BASE, 500.0),
            (SLEW_BASE + 1, 600.0),
            (SLEW_BASE + 2, 2.0),
            (SLEW_BASE + 3, 16.0),
            (SAMPLE_HOLD_BASE, 1.0),
            (SAMPLE_HOLD_BASE + 1, 16.0),
            (SAMPLE_HOLD_BASE + 2, 4.0),
            (SAMPLE_HOLD_BASE + 3, 1.0),
            (SAMPLE_HOLD_BASE + 4, 0.4),
            (SAMPLE_HOLD_BASE + 5, 1.0),
            (COMPARE_BASE, 2.0),
            (COMPARE_BASE + 1, 0.2),
            (COMPARE_BASE + 2, 0.1),
            (COMPARE_BASE + 3, 18.0),
            (COMPARE_BASE + 4, 1.0),
            (COMPARE_BASE + 5, 2.0),
            (CV_MIX_BASE, 0.5),
            (CV_MIX_BASE + 1, 0.25),
            (CV_MIX_BASE + 2, 0.25),
            (CV_MIX_BASE + 3, 0.25),
            (CV_MIX_BASE + 4, 0.1),
            (CV_MIX_BASE + 5, 16.0),
            (CV_MIX_BASE + 6, 18.0),
            (CV_MIX_BASE + 7, 20.0),
            (CV_MIX_BASE + 8, 19.0),
            (RANGE_BASE, 0.2),
            (RANGE_BASE + 1, 0.8),
            (RANGE_BASE + 2, 1.0),
            (RANGE_BASE + 3, 22.0),
        ] {
            let parameter = MainParameter::decode(id, value).unwrap();
            assert!(parameter.apply(&mut main), "utility host ID {id}");
        }
        for (id, value) in [
            (ATV_BASE + 2, 0.5),
            (SLEW_BASE, 500.5),
            (SAMPLE_HOLD_BASE + 3, 0.5),
            (COMPARE_BASE + 2, 0.6),
            (CV_MIX_BASE + 5, 21.5),
            (RANGE_BASE + 3, 24.0),
        ] {
            assert_eq!(
                MainParameter::decode(id, value),
                Err(MainParameterError::InvalidValue),
                "invalid utility host ID {id}"
            );
        }
    }
}
