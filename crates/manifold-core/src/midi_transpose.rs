//! Fixed-capacity MIDI note transposition from the old Standalone Transpose export.
//! Produces MIDI events; it does not synthesize audio or allocate in the event path.

use crate::events::EventKind;

const VOICES: usize = 8;
pub const MAX_OUTPUT_EVENTS: usize = VOICES * 2;

#[derive(Clone, Copy, Default)]
struct HeldNote {
    active: bool,
    channel: u8,
    input: u8,
    output: u8,
    velocity: u8,
    stamp: u64,
}

pub struct MidiTranspose {
    semitones: i8,
    held: [HeldNote; VOICES],
    stamp: u64,
}

impl Default for MidiTranspose {
    fn default() -> Self {
        Self::new()
    }
}

impl MidiTranspose {
    pub fn new() -> Self {
        Self {
            semitones: 0,
            held: [HeldNote::default(); VOICES],
            stamp: 0,
        }
    }

    pub fn semitones(&self) -> i8 {
        self.semitones
    }

    fn output_note(&self, input: u8) -> u8 {
        (i16::from(input) + i16::from(self.semitones)).clamp(0, 127) as u8
    }

    /// Match the legacy floor(value + 0.5) rounding and remap held notes.
    /// Offs precede ons, in slot order, even if the rounded value is unchanged.
    pub fn set_semitones(&mut self, value: f32, out: &mut [EventKind; MAX_OUTPUT_EVENTS]) -> usize {
        if !value.is_finite() {
            return 0;
        }
        let mut count = 0;
        for note in self.held.iter().filter(|note| note.active) {
            out[count] = EventKind::NoteOff {
                channel: note.channel,
                note: note.output,
            };
            count += 1;
        }
        self.semitones = (value.clamp(-24.0, 24.0) + 0.5).floor() as i8;
        for index in 0..VOICES {
            if self.held[index].active {
                let output = self.output_note(self.held[index].input);
                self.held[index].output = output;
                out[count] = EventKind::NoteOn {
                    channel: self.held[index].channel,
                    note: output,
                    velocity: self.held[index].velocity,
                };
                count += 1;
            }
        }
        count
    }

    pub fn handle(&mut self, event: EventKind, out: &mut [EventKind; MAX_OUTPUT_EVENTS]) -> usize {
        match event {
            EventKind::NoteOn {
                channel,
                note,
                velocity: 0,
            } => self.handle(EventKind::NoteOff { channel, note }, out),
            EventKind::NoteOn {
                channel,
                note,
                velocity,
            } => {
                let existing = self.held.iter().position(|entry| {
                    entry.active && entry.channel == channel && entry.input == note
                });
                let free = self.held.iter().position(|entry| !entry.active);
                let index = existing.or(free).unwrap_or_else(|| {
                    self.held
                        .iter()
                        .enumerate()
                        .min_by_key(|(_, entry)| entry.stamp)
                        .expect("fixed voice slots")
                        .0
                });
                let mut count = 0;
                if existing.is_none() && free.is_none() {
                    out[count] = EventKind::NoteOff {
                        channel: self.held[index].channel,
                        note: self.held[index].output,
                    };
                    count += 1;
                }
                self.stamp = self.stamp.wrapping_add(1);
                let output = self.output_note(note);
                self.held[index] = HeldNote {
                    active: true,
                    channel,
                    input: note,
                    output,
                    velocity,
                    stamp: self.stamp,
                };
                out[count] = EventKind::NoteOn {
                    channel,
                    note: output,
                    velocity,
                };
                count + 1
            }
            EventKind::NoteOff { channel, note } => {
                let Some(index) = self.held.iter().position(|entry| {
                    entry.active && entry.channel == channel && entry.input == note
                }) else {
                    return 0;
                };
                out[0] = EventKind::NoteOff {
                    channel,
                    note: self.held[index].output,
                };
                self.held[index].active = false;
                1
            }
            EventKind::AllNotesOff => {
                let mut count = 0;
                for note in &mut self.held {
                    if note.active {
                        out[count] = EventKind::NoteOff {
                            channel: note.channel,
                            note: note.output,
                        };
                        note.active = false;
                        count += 1;
                    }
                }
                count
            }
            EventKind::PitchBend { .. } => {
                out[0] = event;
                1
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn held_note_remaps_and_releases_original_key() {
        let mut effect = MidiTranspose::new();
        let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
        assert_eq!(effect.set_semitones(7.0, &mut out), 0);
        assert_eq!(
            effect.handle(
                EventKind::NoteOn {
                    channel: 2,
                    note: 60,
                    velocity: 96
                },
                &mut out
            ),
            1
        );
        assert_eq!(
            out[0],
            EventKind::NoteOn {
                channel: 2,
                note: 67,
                velocity: 96
            }
        );
        assert_eq!(effect.set_semitones(-12.0, &mut out), 2);
        assert_eq!(
            out[..2],
            [
                EventKind::NoteOff {
                    channel: 2,
                    note: 67
                },
                EventKind::NoteOn {
                    channel: 2,
                    note: 48,
                    velocity: 96
                }
            ]
        );
        assert_eq!(
            effect.handle(
                EventKind::NoteOff {
                    channel: 2,
                    note: 60
                },
                &mut out
            ),
            1
        );
        assert_eq!(
            out[0],
            EventKind::NoteOff {
                channel: 2,
                note: 48
            }
        );
    }

    #[test]
    fn oldest_voice_is_released_before_ninth_note() {
        let mut effect = MidiTranspose::new();
        let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
        for note in 60..68 {
            assert_eq!(
                effect.handle(
                    EventKind::NoteOn {
                        channel: 0,
                        note,
                        velocity: 100
                    },
                    &mut out
                ),
                1
            );
        }
        assert_eq!(
            effect.handle(
                EventKind::NoteOn {
                    channel: 0,
                    note: 68,
                    velocity: 90
                },
                &mut out
            ),
            2
        );
        assert_eq!(
            out[..2],
            [
                EventKind::NoteOff {
                    channel: 0,
                    note: 60
                },
                EventKind::NoteOn {
                    channel: 0,
                    note: 68,
                    velocity: 90
                }
            ]
        );
        assert_eq!(
            effect.handle(
                EventKind::NoteOff {
                    channel: 0,
                    note: 60
                },
                &mut out
            ),
            0
        );
    }

    #[test]
    fn clamps_output_and_passes_pitch_bend() {
        let mut effect = MidiTranspose::new();
        let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
        effect.set_semitones(24.0, &mut out);
        effect.handle(
            EventKind::NoteOn {
                channel: 15,
                note: 120,
                velocity: 100,
            },
            &mut out,
        );
        assert_eq!(
            out[0],
            EventKind::NoteOn {
                channel: 15,
                note: 127,
                velocity: 100
            }
        );
        let bend = EventKind::PitchBend {
            channel: 15,
            value: 8192,
        };
        assert_eq!(effect.handle(bend, &mut out), 1);
        assert_eq!(out[0], bend);
    }
}
