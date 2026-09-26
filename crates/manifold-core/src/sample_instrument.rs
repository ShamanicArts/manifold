//! Eight note voices read one shared, immutable decoded sample buffer.

use crate::events::EventKind;
use crate::sample_region::SampleRegion;

const VOICES: usize = 8;

#[derive(Clone, Copy, Default)]
struct VoiceSlot {
    active: bool,
    channel: u8,
    note: u8,
    velocity: f32,
    serial: u64,
}

pub struct SampleInstrument {
    players: [SampleRegion; VOICES],
    slots: [VoiceSlot; VOICES],
    serial: u64,
    root_note: u8,
    key_track: f32,
    level: f32,
    speed: f32,
}

impl SampleInstrument {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            players: std::array::from_fn(|_| SampleRegion::new(sample_rate)),
            slots: [VoiceSlot::default(); VOICES],
            serial: 0,
            root_note: 60,
            key_track: 1.0,
            level: 0.25,
            speed: 1.0,
        }
    }

    /// Decoded PCM is moved once and shared across voice cursors before audio starts.
    pub fn load_stereo(&mut self, stereo: Vec<f32>, source_rate: f32) -> bool {
        let (first, rest) = self.players.split_first_mut().unwrap();
        if !first.load_stereo(stereo, source_rate) {
            return false;
        }
        for player in rest {
            player.share_sample_from(first);
        }
        self.slots.fill(VoiceSlot::default());
        true
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 => self.root_note = value.round().clamp(0.0, 127.0) as u8,
            1 => self.key_track = value.clamp(0.0, 1.0),
            2 => self.level = value.clamp(0.0, 1.0),
            3 => self.speed = value.clamp(0.0, 8.0),
            4..=9 => {
                let player_id = match id {
                    4 => 1,
                    5 => 2,
                    6 => 3,
                    7 => 4,
                    8 => 5,
                    _ => 8,
                };
                for player in &mut self.players {
                    player.set_parameter(player_id, value);
                }
            }
            _ => return false,
        }
        if matches!(id, 0 | 1 | 3) {
            for index in 0..VOICES {
                if self.slots[index].active {
                    self.players[index].set_parameter(0, self.note_speed(self.slots[index].note));
                }
            }
        }
        true
    }

    fn note_speed(&self, note: u8) -> f32 {
        (self.speed as f64
            * 2.0f64.powf((note as f64 - self.root_note as f64) * self.key_track as f64 / 12.0))
        .clamp(0.0, 8.0) as f32
    }

    pub fn event(&mut self, event: EventKind) {
        match event {
            EventKind::NoteOn {
                channel,
                note,
                velocity,
            } => {
                if velocity == 0 {
                    self.event(EventKind::NoteOff { channel, note });
                    return;
                }
                let index = self
                    .slots
                    .iter()
                    .position(|slot| slot.active && slot.channel == channel && slot.note == note)
                    .or_else(|| self.slots.iter().position(|slot| !slot.active))
                    .unwrap_or_else(|| {
                        self.slots
                            .iter()
                            .enumerate()
                            .min_by_key(|(_, slot)| slot.serial)
                            .unwrap()
                            .0
                    });
                self.serial = self.serial.wrapping_add(1);
                self.slots[index] = VoiceSlot {
                    active: true,
                    channel,
                    note,
                    velocity: velocity as f32 / 127.0,
                    serial: self.serial,
                };
                self.players[index].set_parameter(0, self.note_speed(note));
                self.players[index].event(event);
            }
            EventKind::NoteOff { channel, note } => {
                for (slot, player) in self.slots.iter_mut().zip(&mut self.players) {
                    if slot.active && slot.channel == channel && slot.note == note {
                        slot.active = false;
                        player.set_parameter(6, 0.0);
                    }
                }
            }
            EventKind::AllNotesOff => {
                for (slot, player) in self.slots.iter_mut().zip(&mut self.players) {
                    slot.active = false;
                    player.set_parameter(6, 0.0);
                }
            }
        }
    }

    pub fn active_voices(&self) -> usize {
        self.slots.iter().filter(|slot| slot.active).count()
    }

    pub fn meter(&self, band: usize) -> Option<f32> {
        match band {
            0 => Some(self.active_voices() as f32),
            1..=VOICES => Some(if self.slots[band - 1].active {
                self.players[band - 1].meter(0).unwrap_or(0.0)
            } else {
                -1.0
            }),
            _ => None,
        }
    }

    pub fn process_sample(&mut self) -> [f32; 2] {
        let mut output = [0.0; 2];
        for (slot, player) in self.slots.iter_mut().zip(&mut self.players) {
            if !slot.active {
                continue;
            }
            let sample = player.process_sample();
            let gain = slot.velocity * self.level;
            output[0] += sample[0] * gain;
            output[1] += sample[1] * gain;
            if !player.is_playing() {
                slot.active = false;
            }
        }
        output
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn constant_instrument() -> SampleInstrument {
        let mut instrument = SampleInstrument::new(8000.0);
        assert!(instrument.load_stereo(vec![1.0; 16], 8000.0));
        instrument.set_parameter(2, 1.0);
        instrument
    }

    #[test]
    fn notes_have_independent_voices_and_note_off_targets_one_key() {
        let mut instrument = constant_instrument();
        instrument.event(EventKind::NoteOn {
            channel: 0,
            note: 60,
            velocity: 127,
        });
        assert_eq!(instrument.process_sample(), [1.0, 1.0]);
        instrument.event(EventKind::NoteOn {
            channel: 0,
            note: 72,
            velocity: 127,
        });
        assert_eq!(instrument.process_sample(), [2.0, 2.0]);
        instrument.event(EventKind::NoteOff {
            channel: 0,
            note: 60,
        });
        assert_eq!(instrument.process_sample(), [1.0, 1.0]);
        assert_eq!(instrument.active_voices(), 1);
        instrument.event(EventKind::AllNotesOff);
        assert_eq!(instrument.process_sample(), [0.0, 0.0]);
    }

    #[test]
    fn root_note_changes_resampling_speed() {
        let mut instrument = SampleInstrument::new(8000.0);
        assert!(instrument.load_stereo(vec![0., 0., 1., 1., 2., 2., 3., 3.], 8000.0));
        instrument.set_parameter(2, 1.0);
        instrument.event(EventKind::NoteOn {
            channel: 0,
            note: 72,
            velocity: 127,
        });
        assert_eq!(instrument.process_sample(), [0.0, 0.0]);
        assert_eq!(instrument.process_sample(), [2.0, 2.0]);
        instrument.set_parameter(1, 0.0);
        assert_eq!(instrument.process_sample(), [0.0, 0.0]);
        assert_eq!(instrument.process_sample(), [1.0, 1.0]);
    }

    #[test]
    fn ninth_note_steals_oldest_voice() {
        let mut instrument = constant_instrument();
        for note in 60..69 {
            instrument.event(EventKind::NoteOn {
                channel: 0,
                note,
                velocity: 127,
            });
        }
        assert_eq!(instrument.active_voices(), 8);
        instrument.event(EventKind::NoteOff {
            channel: 0,
            note: 60,
        });
        assert_eq!(instrument.active_voices(), 8);
        instrument.event(EventKind::NoteOff {
            channel: 0,
            note: 68,
        });
        assert_eq!(instrument.active_voices(), 7);
    }
}
