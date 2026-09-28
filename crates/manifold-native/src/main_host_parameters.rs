//! Stable Main host IDs. The reserved ranges are declared in the project JSON.

use manifold_core::main_instrument::MainInstrument;

pub const TRANSPORT_BASE: u32 = 0;
pub const LAYER_BASE: u32 = 16;
pub const LAYER_STRIDE: u32 = 8;
pub const SYNTH_BASE: u32 = 256;
pub const LFO_BASE: u32 = 512;
pub const LFO_STRIDE: u32 = 16;
pub const ARPEGGIATOR_BASE: u32 = 960;
pub const MAIN_HOST_ID_CAPACITY: usize = 1024;

/// Values applied by this runtime's timed host queue. Imported session values
/// remain in the authored session template; this bank records only later host
/// changes, including ones that happen during the block that starts a save.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MainHostValueBank {
    values: [f32; MAIN_HOST_ID_CAPACITY],
    present: [u64; MAIN_HOST_ID_CAPACITY / 64],
}

impl Default for MainHostValueBank {
    fn default() -> Self {
        Self {
            values: [0.0; MAIN_HOST_ID_CAPACITY],
            present: [0; MAIN_HOST_ID_CAPACITY / 64],
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
    Arpeggiator(u32),
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MainParameter {
    pub target: MainParameterTarget,
    pub value: f32,
}

fn in_range(value: f32, min: f32, max: f32, discrete: bool) -> bool {
    value.is_finite() && (min..=max).contains(&value) && (!discrete || value.fract() == 0.0)
}

impl MainParameter {
    pub fn decode(id: u32, value: f32) -> Result<Self, MainParameterError> {
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
        if !in_range(value, min, max, discrete) {
            return Err(MainParameterError::InvalidValue);
        }
        Ok(Self {
            target,
            value: value / divisor,
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
            MainParameter::decode(LFO_BASE, 1.0),
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
}
